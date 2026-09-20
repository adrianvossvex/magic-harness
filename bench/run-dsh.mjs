// Runs one task with DeepSeek's own harness (`dsh --profile headless`) and reads its session log for the numbers.
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BENCH_ROOT, run } from './lib.mjs';

// Where `npm install --prefix bench/dsh @deepseek-ai/dsh` put the package; DSH_PREFIX points elsewhere.
export const DSH_PREFIX = process.env.DSH_PREFIX ?? join(BENCH_ROOT, 'dsh');
const SESSIONS = join(homedir(), '.dsh', 'sessions');

export async function runDsh({ workspace, prompt, timeoutMs, onLine, checkpointMs, onCheckpoint }) {
  const cwd = await realpath(workspace);
  const started = Date.now();
  // Checkpoints on a timer while dsh works; a second phase is simply another headless run in the same folder.
  let busy = false;
  const timer = checkpointMs && onCheckpoint ? setInterval(async () => { if (busy) return; busy = true; try { await onCheckpoint('timer'); } catch { /* logged by the runner */ } finally { busy = false; } }, checkpointMs) : undefined;
  let result;
  try { result = await run('npx', ['--prefix', DSH_PREFIX, 'dsh', '--profile', 'headless', prompt], { cwd, timeoutMs, onLine }); }
  finally { if (timer) clearInterval(timer); }
  const session = await findSession(cwd, started);
  const events = session ? await readSession(session) : [];
  return { ...result, session, metrics: summarize(events), events };
}

// dsh keeps one directory per working directory and one per session; the session file is zstd-compressed JSONL.
async function findSession(cwd, since) {
  const candidates = [];
  for (const folder of await readdir(SESSIONS).catch(() => [])) {
    for (const name of await readdir(join(SESSIONS, folder)).catch(() => [])) {
      const file = join(SESSIONS, folder, name, 'session.v3.jsonl.zstd');
      const info = await stat(file).catch(() => undefined);
      if (!info || info.mtimeMs < since - 5_000) continue;
      const head = (await readSession(file, 1))[0];
      if (head?.cwd === cwd) candidates.push({ file, created: head.createdAt ?? info.mtimeMs });
    }
  }
  candidates.sort((a, b) => b.created - a.created);
  return candidates[0]?.file;
}

export async function readSession(file, limit = Infinity) {
  const { stdout } = await run('/opt/homebrew/bin/zstd', ['-dc', file], { timeoutMs: 60_000 });
  const lines = stdout.split('\n').filter(Boolean);
  const events = [];
  for (const line of lines.slice(0, limit)) { try { events.push(JSON.parse(line)); } catch { /* a torn last line */ } }
  return events;
}

// Requests, tokens and tool calls from the session events. `inputTokens` excludes cache reads and
// `outputTokens` includes reasoning, so the fields line up with magic's api.response usage.
export function summarize(events) {
  const metrics = { requests: 0, input: 0, cached: 0, output: 0, reasoning: 0, toolCalls: 0, toolErrors: 0, tools: {}, turns: 0, steps: 0, end: '' };
  for (const event of events) {
    if (event.type === 'assistant/message') {
      const usage = event.data?.usage ?? {};
      metrics.requests += 1;
      metrics.input += usage.inputTokens ?? 0;
      metrics.cached += usage.cacheReadTokens ?? 0;
      metrics.output += usage.outputTokens ?? 0;
      metrics.reasoning += usage.reasoningTokens ?? 0;
    } else if (event.type === 'tool/call') {
      metrics.toolCalls += 1;
      const name = event.data?.name ?? event.data?.call?.name ?? 'unknown';
      metrics.tools[name] = (metrics.tools[name] ?? 0) + 1;
    } else if (event.type === 'tool/result') {
      for (const block of event.data?.message?.content ?? []) if (block.type === 'tool-result' && block.isError) metrics.toolErrors += 1;
    } else if (event.type === 'turn/end') { metrics.turns += 1; metrics.end = event.data?.reason?.kind ?? ''; }
    else if (event.type === 'step/end') metrics.steps += 1;
  }
  return metrics;
}
