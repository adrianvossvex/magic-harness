// Runs one task with magic, headless: a single session (like dsh) or the project system (planner, dispatcher,
// executors). Everything the model did is in the session logs under <workspace>/.magic/sessions.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HARNESS_ROOT, MODEL } from './lib.mjs';

const dist = (name) => import(pathToFileURL(join(HARNESS_ROOT, 'dist', name)).href);

// What a headless run answers when the agent asks the user something: the same position dsh's headless mode
// leaves the model in, only spelled out.
const NO_USER = 'No user is available in this run. Decide yourself from the task description, pick the most standard option, and continue.';

async function loop(workspace, extraTools, callbacks) {
  const [{ createClient }, { loadProviderConfig }, { createTools }, { Sessions }] = await Promise.all([
    dist('providers/index.js'), dist('providers/credentials.js'), dist('tools.js'), dist('sessions.js'),
  ]);
  const config = await loadProviderConfig();
  if (!config.providers.deepseek) throw new Error('DEEPSEEK_API_KEY is not configured.');
  const model = 'deepseek/' + MODEL;
  const sessions = new Sessions({
    cwd: workspace, model, client: createClient(config.providers),
    tools: [...createTools({ kimiKey: config.providers.kimi?.apiKey }), ...extraTools],
    secrets: config.secrets, ...callbacks,
  });
  await sessions.ready;
  return sessions;
}

function callbacks(state, onLine) {
  return {
    onError: (message) => onLine('error: ' + message + '\n', 'err'),
    onText: (sessionId, text) => { state.text = (state.text ?? '') + text; },
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

export async function runMagicSingle({ workspace, prompt, timeoutMs, effort, onLine }) {
  const state = { questions: 0, toolErrors: 0, text: '' };
  const sessions = await loop(workspace, [], callbacks(state, onLine));
  state.sessions = sessions;
  const started = Date.now();
  let result, timedOut = false;
  try {
    if (effort && effort !== 'default') await sessions.setEffort(effort);
    const { id } = await sessions.create('execute');
    const { done } = await sessions.start(id, prompt);
    const timer = setTimeout(() => { timedOut = true; sessions.cancel(id); }, timeoutMs);
    try { result = await done; } finally { clearTimeout(timer); }
  } finally { await sessions.close(); }
  const metrics = await summarizeLogs(workspace);
  return { durationMs: Date.now() - started, timedOut, code: result?.status === 'completed' ? 0 : 1, turn: result,
    stdout: state.text, stderr: result?.message ?? '', metrics: { ...metrics, questions: state.questions } };
}

// The project system end to end: plan, approve, run; milestones are approved as soon as they come up, the way
// a user who trusts the acceptance commands would press "continue".
export async function runMagicProject({ workspace, prompt, timeoutMs, effort, parallel = 2, onLine }) {
  const { ProjectRuntime } = await dist('project/runtime.js');
  const state = { questions: 0, toolErrors: 0, text: '' };
  const project = new ProjectRuntime({ cwd: workspace, parallel, maxReplans: 2, onNotice: message => onLine('project: ' + message + '\n', 'err') });
  const sessions = await loop(workspace, project.tools, callbacks(state, onLine));
  state.sessions = sessions;
  project.attach(sessions);
  const started = Date.now();
  const deadline = started + timeoutMs;
  let timedOut = false, approvals = 0, summary, error;
  try {
    if (effort && effort !== 'default') await sessions.setEffort(effort);
    const receipt = await project.plan(prompt, { interactive: false });
    summary = await receipt.done;
    onLine('plan: ' + summary.tasks.length + ' tasks, ' + summary.milestones.length + ' milestones\n', 'err');
    summary = await project.run();
    approvals += 1;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      summary = await project.summary();
      if (!summary) break;
      if (summary.status === 'awaiting_approval' && summary.pending?.kind === 'milestone') {
        onLine('milestone approved: ' + summary.pending.milestone + '\n', 'err');
        summary = await project.run();
        approvals += 1;
        continue;
      }
      if (summary.status === 'done' || summary.status === 'failed') break;
      if (summary.status === 'paused') {
        onLine('project paused: ' + JSON.stringify(summary.counts) + '\n', 'err');
        break;
      }
    }
    if (Date.now() >= deadline) { timedOut = true; await project.stop(); }
  } catch (caught) { error = String(caught); onLine('project error: ' + error + '\n', 'err'); }
  finally { await project.close(); await sessions.close(); }
  const metrics = await summarizeLogs(workspace);
  const events = await readFile(join(workspace, '.magic', 'project', 'events.jsonl'), 'utf8').catch(() => '');
  const tree = JSON.parse(await readFile(join(workspace, '.magic', 'project', 'project.json'), 'utf8').catch(() => 'null'));
  return { durationMs: Date.now() - started, timedOut, code: summary?.status === 'done' ? 0 : 1, summary, error, approvals,
    stdout: state.text, stderr: '', project: tree, projectEvents: events.split('\n').filter(Boolean).map(line => JSON.parse(line)),
    metrics: { ...metrics, questions: state.questions } };
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
      else if (event.type === 'compact.end' || event.type === 'compaction.end') session.compactions += 1;
      else if (event.type === 'turn.end') session.turns.push(event.data?.status ?? '');
    }
    for (const key of ['requests', 'input', 'cached', 'output', 'toolCalls', 'toolErrors', 'compactions', 'apiErrors']) totals[key] += session[key];
    totals.sessions.push(session);
  }
  return totals;
}
