#!/usr/bin/env node
// Runs benchmark tasks through the harnesses and writes one result folder per run.
// Usage: node bench/run.mjs --label <name> [--task 01-todo,...] [--harness dsh,magic,magic-project] [--repeat 1]
//        [--timeout-minutes 30] [--effort high] [--parallel 2] [--checkpoint-minutes 5]
// A task with a `<task>-phase2.md` prompt gets a second phase after the first completes: the same workspace, the new
// prompt (magic continues the session or replans the project; dsh starts a new headless run), and both check suites.
import { mkdir, writeFile, appendFile, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { BENCH_ROOT, MODEL, changedFiles, cost, listTasks, prepareWorkspace, readTask, runChecks, runRepoTests, seconds, writeJson } from './lib.mjs';
import { runDsh } from './run-dsh.mjs';
import { runMagicProject, runMagicSingle } from './run-magic.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((arg, i, all) => arg.startsWith('--') ? [arg.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true'] : []).filter(Boolean));
const label = args.label ?? new Date().toISOString().replace(/[:.]/g, '-');
const tasks = args.task ? args.task.split(',') : await listTasks();
const harnesses = (args.harness ?? 'dsh,magic,magic-project').split(',');
const repeat = Number(args.repeat ?? 1);
const timeoutMs = Number(args['timeout-minutes'] ?? 30) * 60_000;
const checkpointMs = Number(args['checkpoint-minutes'] ?? 0) * 60_000;
const effort = args.effort ?? 'high';
const parallel = Number(args.parallel ?? 2);
const results = join(BENCH_ROOT, 'results', label);
const exists = (path) => stat(path).then(() => true, () => false);

for (const task of tasks) {
  const prompt = await readTask(task);
  const phase2 = (await exists(join(BENCH_ROOT, 'tasks', task + '-phase2.md'))) ? await readTask(task + '-phase2') : undefined;
  const phase2Checks = (await exists(join(BENCH_ROOT, 'checks', task + '-phase2.check.mjs'))) ? task + '-phase2' : undefined;
  for (const harness of harnesses) {
    for (let n = 1; n <= repeat; n++) {
      const folder = join(results, task, harness + '-' + n);
      await mkdir(folder, { recursive: true });
      const log = join(folder, 'run.log');
      await writeFile(log, '');
      const onLine = (text) => appendFile(log, text);
      const workspace = await realpath(await prepareWorkspace(task, join(folder, 'workspace')));
      console.log('[' + new Date().toISOString() + '] ' + task + ' / ' + harness + ' #' + n + ' starting in ' + workspace);
      // The score of the workspace right now: the hidden suite(s) and the repository's own tests.
      const score = async (suites) => {
        const checks = {};
        for (const suite of suites) { const result = await runChecks(suite, workspace); checks[suite] = { pass: result.pass, fail: result.fail, total: result.total }; await writeFile(join(folder, 'checks-' + suite + '.log'), result.output); }
        const repo = await runRepoTests(workspace);
        await writeFile(join(folder, 'npm-test.log'), repo.output);
        return { checks, repoTests: { code: repo.code, pass: repo.pass, fail: repo.fail } };
      };
      const checkpoints = [];
      const startedAt = Date.now();
      const checkpoint = async (note, suites) => {
        const point = { at: new Date().toISOString(), minutes: Math.round((Date.now() - startedAt) / 6000) / 10, note, ...(await score(suites)) };
        checkpoints.push(point);
        onLine('checkpoint ' + point.minutes + ' min (' + note + '): ' + Object.entries(point.checks).map(([suite, c]) => suite + ' ' + c.pass + '/' + c.total).join(', ') + '\n');
        return point;
      };
      const phases = [];
      let run, state;
      try {
        const common = { workspace, timeoutMs, effort, onLine, parallel, task, checkpointMs };
        const phaseSuites = [[task], phase2Checks ? [task, phase2Checks] : [task]];
        const phasePrompts = [prompt, phase2].filter(Boolean);
        for (let phase = 0; phase < phasePrompts.length; phase++) {
          const suites = phaseSuites[phase];
          const options = { ...common, prompt: phasePrompts[phase], phase, state, onCheckpoint: note => checkpoint(note, suites) };
          const started = Date.now();
          run = harness === 'dsh' ? await runDsh(options)
            : harness === 'magic' ? await runMagicSingle(options)
            : harness === 'magic-project' ? await runMagicProject(options)
            : (() => { throw new Error('Unknown harness ' + harness); })();
          state = run.state;
          const final = await checkpoint('end of phase ' + (phase + 1), suites);
          await writeFile(join(folder, 'agent-stdout' + (phase ? '-phase' + (phase + 1) : '') + '.txt'), run.stdout ?? '');
          await writeFile(join(folder, 'agent-stderr' + (phase ? '-phase' + (phase + 1) : '') + '.txt'), run.stderr ?? '');
          if (run.events) await writeFile(join(folder, 'dsh-session' + (phase ? '-phase' + (phase + 1) : '') + '.jsonl'), run.events.map(event => JSON.stringify(event)).join('\n') + '\n');
          const { events, state: _state, ...rest } = run;
          const usage = { input: run.metrics?.input ?? 0, cached: run.metrics?.cached ?? 0, output: run.metrics?.output ?? 0 };
          phases.push({ phase: phase + 1, durationMs: Date.now() - started, timedOut: run.timedOut, exitCode: run.code, checks: final.checks, repoTests: final.repoTests, usage, cost: cost(usage), ...rest });
          console.log('  phase ' + (phase + 1) + ' done in ' + seconds(Date.now() - started) + (run.timedOut ? ' (timed out)' : '') + ': '
            + Object.entries(final.checks).map(([suite, c]) => suite + ' ' + c.pass + '/' + c.total).join(', ') + ', npm test ' + (final.repoTests.code === 0 ? 'green' : 'red')
            + ', requests ' + (run.metrics?.requests ?? '?') + ', cost $' + cost(usage).toFixed(3));
          if (run.timedOut || run.error) break;
        }
      } catch (error) {
        onLine('runner error: ' + (error?.stack ?? error) + '\n');
        phases.push({ phase: phases.length + 1, durationMs: 0, timedOut: false, exitCode: 1, error: String(error), metrics: {}, usage: { input: 0, cached: 0, output: 0 }, cost: 0, checks: {}, repoTests: { code: 1 } });
      }
      await state?.close?.().catch(error => onLine('close: ' + error + '\n'));
      const files = await changedFiles(workspace);
      const first = phases[0];
      const total = { input: 0, cached: 0, output: 0 };
      for (const phase of phases) for (const key of Object.keys(total)) total[key] += phase.usage?.[key] ?? 0;
      const result = {
        task, harness, run: n, model: MODEL, effort: harness === 'dsh' ? 'high (dsh default)' : effort, startedAt: new Date(startedAt).toISOString(),
        durationMs: phases.reduce((sum, phase) => sum + phase.durationMs, 0), timedOut: phases.some(phase => phase.timedOut), exitCode: phases.at(-1)?.exitCode,
        // The first phase's score keeps the summary tables of one-phase tasks unchanged; phases[] has the rest.
        checks: first?.checks?.[task] ?? { pass: 0, fail: 0, total: 0 }, repoTests: first?.repoTests ?? { code: 1 },
        files, usage: total, cost: cost(total), metrics: first?.metrics ?? {}, phases, checkpoints,
      };
      await writeJson(join(folder, 'result.json'), result);
    }
  }
}
