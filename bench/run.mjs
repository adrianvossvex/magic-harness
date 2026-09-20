#!/usr/bin/env node
// Runs benchmark tasks through the harnesses and writes one result folder per run.
// Usage: node bench/run.mjs --label <name> [--task 01-todo,...] [--harness dsh,magic,magic-project] [--repeat 1]
//        [--timeout-minutes 30] [--effort high] [--parallel 2]
import { mkdir, writeFile, appendFile, realpath } from 'node:fs/promises';
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
const effort = args.effort ?? 'high';
const parallel = Number(args.parallel ?? 2);
const results = join(BENCH_ROOT, 'results', label);

for (const task of tasks) {
  const prompt = await readTask(task);
  for (const harness of harnesses) {
    for (let n = 1; n <= repeat; n++) {
      const folder = join(results, task, harness + '-' + n);
      await mkdir(folder, { recursive: true });
      const log = join(folder, 'run.log');
      await writeFile(log, '');
      const onLine = (text) => appendFile(log, text);
      const workspace = await realpath(await prepareWorkspace(task, join(folder, 'workspace')));
      console.log('[' + new Date().toISOString() + '] ' + task + ' / ' + harness + ' #' + n + ' starting in ' + workspace);
      const options = { workspace, prompt, timeoutMs, effort, onLine, parallel };
      let run;
      try {
        run = harness === 'dsh' ? await runDsh(options)
          : harness === 'magic' ? await runMagicSingle(options)
          : harness === 'magic-project' ? await runMagicProject(options)
          : (() => { throw new Error('Unknown harness ' + harness); })();
      } catch (error) {
        run = { durationMs: 0, timedOut: false, code: 1, stdout: '', stderr: String(error), metrics: {}, error: String(error) };
      }
      await writeFile(join(folder, 'agent-stdout.txt'), run.stdout ?? '');
      await writeFile(join(folder, 'agent-stderr.txt'), run.stderr ?? '');
      if (run.events) await writeFile(join(folder, 'dsh-session.jsonl'), run.events.map(event => JSON.stringify(event)).join('\n') + '\n');
      const checks = await runChecks(task, workspace);
      await writeFile(join(folder, 'checks.log'), checks.output);
      const repo = await runRepoTests(workspace);
      await writeFile(join(folder, 'npm-test.log'), repo.output);
      const files = await changedFiles(workspace);
      const { events, ...rest } = run;
      const usage = { input: run.metrics?.input ?? 0, cached: run.metrics?.cached ?? 0, output: run.metrics?.output ?? 0 };
      const result = {
        task, harness, run: n, model: MODEL, effort: harness === 'dsh' ? 'high (dsh default)' : effort, startedAt: new Date(Date.now() - run.durationMs).toISOString(),
        durationMs: run.durationMs, timedOut: run.timedOut, exitCode: run.code,
        checks: { pass: checks.pass, fail: checks.fail, total: checks.total },
        repoTests: { code: repo.code, pass: repo.pass, fail: repo.fail },
        files, usage, cost: cost(usage), ...rest,
      };
      await writeJson(join(folder, 'result.json'), result);
      console.log('  done in ' + seconds(run.durationMs) + (run.timedOut ? ' (timed out)' : '') + ': hidden checks ' + checks.pass + '/' + checks.total
        + ', npm test ' + (repo.code === 0 ? 'green' : 'red') + ', requests ' + (run.metrics?.requests ?? '?') + ', cost $' + cost(usage).toFixed(3));
    }
  }
}
