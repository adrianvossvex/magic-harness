#!/usr/bin/env node
// Re-runs the hidden checks and the repository's own tests for every finished run under a results folder whose
// workspace is still present, and rewrites the `checks` and `repoTests` fields of its result.json. For when a
// check file had to be corrected after runs were made; the agents' work is untouched.
// Usage: node bench/rescore.mjs bench/results/<label> [task]
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runChecks, runRepoTests } from './lib.mjs';

const [rootArg, only] = process.argv.slice(2);
const root = rootArg && resolve(rootArg);
if (!root) { console.error('Usage: node bench/rescore.mjs <results folder> [task]'); process.exit(1); }
for (const task of (await readdir(root)).filter(name => !name.includes('.')).sort()) {
  if (only && task !== only) continue;
  for (const run of (await readdir(join(root, task))).sort()) {
    const folder = join(root, task, run);
    const file = join(folder, 'result.json');
    const workspace = join(folder, 'workspace');
    if (!(await stat(file).catch(() => null)) || !(await stat(workspace).catch(() => null))) continue;
    const result = JSON.parse(await readFile(file, 'utf8'));
    const checks = await runChecks(task, workspace);
    const repo = await runRepoTests(workspace);
    await writeFile(join(folder, 'checks.log'), checks.output);
    await writeFile(join(folder, 'npm-test.log'), repo.output);
    const before = result.checks.pass + '/' + result.checks.total;
    result.checks = { pass: checks.pass, fail: checks.fail, total: checks.total };
    result.repoTests = { code: repo.code, pass: repo.pass, fail: repo.fail };
    // A multi-phase run is judged on its final workspace with every suite it went through; the per-phase records stay.
    if (result.phases?.length > 1) {
      const suites = [...new Set(result.phases.flatMap(phase => Object.keys(phase.checks ?? {})))];
      result.final = { checks: {}, repoTests: result.repoTests };
      for (const suite of suites) { const r = await runChecks(suite, workspace); result.final.checks[suite] = { pass: r.pass, fail: r.fail, total: r.total }; await writeFile(join(folder, 'checks-' + suite + '.log'), r.output); }
    }
    await writeFile(file, JSON.stringify(result, null, 2) + '\n');
    console.log(task + ' / ' + run + ': ' + before + ' -> ' + checks.pass + '/' + checks.total + ', npm test ' + (repo.code === 0 ? 'green' : 'red')
      + (result.final ? ' | final: ' + Object.entries(result.final.checks).map(([suite, c]) => suite + ' ' + c.pass + '/' + c.total).join(', ') : ''));
  }
}
