// Runs one task with magic, headless: a single session (like dsh) or the project system (planner, dispatcher,
// executors). Everything the model did is in the session logs under <workspace>/.magic/sessions. A second phase
// reuses the same Loop: the single session gets another turn, the project gets a replan.
import { appendFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HARNESS_ROOT, MODEL } from './lib.mjs';

const dist = (name) => import(pathToFileURL(join(HARNESS_ROOT, 'dist', name)).href);

// What a headless run answers when the agent asks the user something: the same position dsh's headless mode
// leaves the model in, only spelled out.
const NO_USER = 'No user is available in this run. Decide yourself from the task description, pick the most standard option, and continue.';
const COUNTERS = ['requests', 'input', 'cached', 'output', 'toolCalls', 'toolErrors', 'compactions', 'apiErrors'];

async function loop(workspace, extraTools, callbacks) {
  const [{ createClient }, { loadProviderConfig }, { createTools }, { loadCustomTools, CUSTOM_TOOLS_DIRECTORY }, { Sessions }] = await Promise.all([
    dist('providers/index.js'), dist('providers/credentials.js'), dist('tools.js'), dist('custom-tools.js'), dist('sessions.js'),
  ]);
  const config = await loadProviderConfig();
  if (!config.providers.deepseek) throw new Error('DEEPSEEK_API_KEY is not configured.');
  const model = 'deepseek/' + MODEL;
  // The workspace's own custom tools (bench/fixtures/<task>/.magic/tools), like a user's project would have.
  const custom = await loadCustomTools([join(workspace, CUSTOM_TOOLS_DIRECTORY)]);
  for (const warning of custom.warnings) callbacks.onError?.('custom tool: ' + warning);
  const sessions = new Sessions({
    cwd: workspace, model, client: createClient(config.providers),
    tools: [...createTools({ kimiKey: config.providers.kimi?.apiKey }), ...custom.tools, ...extraTools],
    secrets: config.secrets, ...callbacks,
  });
  await sessions.ready;
  return sessions;
}

function callbacks(state, onLine) {
  return {
    onError: (message) => onLine('error: ' + message + '\n', 'err'),
    onText: (sessionId, text) => { state.text += text; },
    onNotice: (sessionId, message) => onLine('[' + sessionId.slice(0, 8) + '] ' + message + '\n', 'err'),
    onTool: (sessionId, name, stage, isError) => { if (stage === 'start') onLine('[' + sessionId.slice(0, 8) + '] ' + name + '\n', 'err'); if (stage === 'end' && isError) state.toolErrors += 1; },
    onQuestion: (sessionId, question) => {
      if (question.status !== 'pending') return;
      state.questions += 1;
      onLine('[' + sessionId.slice(0, 8) + '] question: ' + question.questions.map(q => q.question).join(' | ') + '\n', 'err');
      const answers = Object.fromEntries(question.questions.map(q => [q.question, NO_USER]));
      setTimeout(() => { try { state.sessions.answer(sessionId, question.id, answers); } catch (error) { onLine('answer failed: ' + error + '\n', 'err'); } }, 50);
    },
  };
}

// Checkpoints on a timer while a phase runs; never two at once.
function ticker(checkpointMs, onCheckpoint) {
  if (!checkpointMs || !onCheckpoint) return () => {};
  let busy = false;
  const timer = setInterval(async () => { if (busy) return; busy = true; try { await onCheckpoint('timer'); } catch { /* the runner logs it */ } finally { busy = false; } }, checkpointMs);
  return () => clearInterval(timer);
}

const subtract = (now, before) => {
  const delta = { ...now };
  for (const key of COUNTERS) delta[key] = (now[key] ?? 0) - (before?.[key] ?? 0);
  return delta;
};

export async function runMagicSingle({ workspace, prompt, timeoutMs, effort, onLine, state: previous, checkpointMs, onCheckpoint }) {
  const state = previous ?? { questions: 0, toolErrors: 0, text: '' };
  state.text = '';
  const sessions = state.sessions ?? await loop(workspace, [], callbacks(state, onLine));
  state.sessions = sessions;
  state.close = () => sessions.close();
  const started = Date.now();
  const before = state.summary;
  let result, timedOut = false;
  const stop = ticker(checkpointMs, onCheckpoint);
  try {
    if (!previous && effort && effort !== 'default') await sessions.setEffort(effort);
    if (!state.id) state.id = (await sessions.create('execute')).id;
    const { done } = await sessions.start(state.id, prompt);
    const timer = setTimeout(() => { timedOut = true; sessions.cancel(state.id); }, timeoutMs);
    try { result = await done; } finally { clearTimeout(timer); }
  } finally { stop(); }
  const summary = await summarizeLogs(workspace);
  state.summary = summary;
  return { durationMs: Date.now() - started, timedOut, code: result?.status === 'completed' ? 0 : 1, turn: result,
    stdout: state.text, stderr: result?.message ?? '', metrics: { ...subtract(summary, before), questions: state.questions }, state };
}

// The project system end to end: plan, approve, run; milestones are approved as soon as they come up, the way
// a user who trusts the acceptance commands would press "continue"; a checkpoint is taken before each approval.
export async function runMagicProject({ workspace, prompt, timeoutMs, effort, parallel = 2, onLine, state: previous, checkpointMs, onCheckpoint }) {
  const { ProjectRuntime } = await dist('project/runtime.js');
  const state = previous ?? { questions: 0, toolErrors: 0, text: '' };
  state.text = '';
  const project = state.project ?? new ProjectRuntime({ cwd: workspace, parallel, maxReplans: 3, onNotice: message => onLine('project: ' + message + '\n', 'err') });
  const sessions = state.sessions ?? await loop(workspace, project.tools, callbacks(state, onLine));
  if (!state.sessions) project.attach(sessions);
  state.project = project; state.sessions = sessions;
  state.close = async () => { await project.close(); await sessions.close(); };
  const started = Date.now();
  const deadline = started + timeoutMs;
  const before = state.summary;
  let timedOut = false, approvals = 0, summary, error;
  const stop = ticker(checkpointMs, onCheckpoint);
  try {
    if (!previous && effort && effort !== 'default') await sessions.setEffort(effort);
    // Phase 2: the new requirements go into the brief (as a user would edit it) and into the replan request.
    if (previous) await appendFile(join(workspace, '.magic', 'project', 'brief.md'), '\n\n# Phase 2\n\n' + prompt + '\n');
    const receipt = previous
      ? await project.replan('Phase 2 of the project: new requirements were added to the brief; they follow here. Add the tasks (and a milestone) that implement them, update the design document accordingly, and keep everything that exists working.\n\n' + prompt, { interactive: false })
      : await project.plan(prompt, { interactive: false });
    summary = await receipt.done;
    onLine((previous ? 'replan' : 'plan') + ': ' + summary.tasks.length + ' tasks, ' + summary.milestones.length + ' milestones\n', 'err');
    if (!previous || summary.status !== 'running') { summary = await project.run(); approvals += 1; }
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      summary = await project.summary();
      if (!summary) break;
      if (summary.status === 'awaiting_approval' && summary.pending?.kind === 'milestone') {
        onLine('milestone complete: ' + summary.pending.milestone + '\n', 'err');
        if (onCheckpoint) await onCheckpoint('milestone ' + summary.pending.milestone);
        summary = await project.run();
        approvals += 1;
        continue;
      }
      if (summary.status === 'done' || summary.status === 'failed') break;
      if (summary.status === 'paused') { onLine('project paused: ' + JSON.stringify(summary.counts) + '\n', 'err'); break; }
    }
    if (Date.now() >= deadline) { timedOut = true; await project.stop(); }
  } catch (caught) { error = String(caught); onLine('project error: ' + error + '\n', 'err'); }
  finally { stop(); }
  const logs = await summarizeLogs(workspace);
  state.summary = logs;
  const events = await readFile(join(workspace, '.magic', 'project', 'events.jsonl'), 'utf8').catch(() => '');
  const tree = JSON.parse(await readFile(join(workspace, '.magic', 'project', 'project.json'), 'utf8').catch(() => 'null'));
  return { durationMs: Date.now() - started, timedOut, code: summary?.status === 'done' ? 0 : 1, summary, error, approvals,
    stdout: state.text, stderr: '', project: tree, projectEvents: events.split('\n').filter(Boolean).map(line => JSON.parse(line)),
    metrics: { ...subtract(logs, before), questions: state.questions }, state };
}

// Every session log of the workspace: requests, usage, tool calls, compactions, per session and in total.
export async function summarizeLogs(workspace) {
  const folder = join(workspace, '.magic', 'sessions');
  const totals = { requests: 0, input: 0, cached: 0, output: 0, toolCalls: 0, toolErrors: 0, tools: {}, compactions: 0, sessions: [], apiErrors: 0 };
  for (const name of (await readdir(folder).catch(() => [])).filter(name => name.endsWith('.jsonl')).sort()) {
    const session = { id: name.slice(0, -6), requests: 0, input: 0, cached: 0, output: 0, toolCalls: 0, toolErrors: 0, compactions: 0, apiErrors: 0, maxContext: 0, turns: [] };
    for (const line of (await readFile(join(folder, name), 'utf8')).split('\n').filter(Boolean)) {
      let event; try { event = JSON.parse(line); } catch { continue; }
      if (event.type === 'api.response') {
        const usage = event.data?.response?.usage ?? {};
        session.requests += 1;
        session.input += usage.input_tokens ?? 0;
        session.cached += usage.cache_read_input_tokens ?? 0;
        session.output += usage.output_tokens ?? 0;
        session.maxContext = Math.max(session.maxContext, event.data?.context?.tokens ?? 0);
      } else if (event.type === 'api.error') session.apiErrors += 1;
      else if (event.type === 'tool.start') { session.toolCalls += 1; const tool = event.data?.name ?? 'unknown'; totals.tools[tool] = (totals.tools[tool] ?? 0) + 1; }
      else if (event.type === 'tool.result') { if (event.data?.isError) session.toolErrors += 1; }
      else if (event.type === 'compact.end') session.compactions += 1;
      else if (event.type === 'turn.end') session.turns.push(event.data?.status ?? '');
    }
    for (const key of ['requests', 'input', 'cached', 'output', 'toolCalls', 'toolErrors', 'compactions', 'apiErrors']) totals[key] += session[key];
    totals.sessions.push(session);
  }
  return totals;
}
