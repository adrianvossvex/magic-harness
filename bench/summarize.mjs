#!/usr/bin/env node
// Renders every result.json under a results folder as a Markdown table. Usage: node bench/summarize.mjs bench/results/<label>
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2];
if (!root) { console.error('Usage: node bench/summarize.mjs <results folder>'); process.exit(1); }

async function collect(folder) {
  const found = [];
  for (const name of await readdir(folder)) {
    const path = join(folder, name);
    if (name === 'result.json') found.push(JSON.parse(await readFile(path, 'utf8')));
    else if (name !== 'workspace' && (await stat(path)).isDirectory()) found.push(...await collect(path));
  }
  return found;
}

const rows = (await collect(root)).sort((a, b) => a.task.localeCompare(b.task) || a.harness.localeCompare(b.harness) || a.run - b.run);
const k = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 100_000 ? 0 : 1) + 'K' : String(n);
console.log('| Task | Harness | Hidden checks | npm test | Wall time | Requests | Tool calls | Input (uncached / cached) | Output | Cost |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const checks = r.checks.total ? r.checks.pass + '/' + r.checks.total : 'n/a';
  const repo = r.repoTests.code === 0 ? 'green (' + r.repoTests.pass + ')' : 'red';
  const time = (r.durationMs / 60_000).toFixed(1) + ' min' + (r.timedOut ? ' (timeout)' : '');
  console.log('| ' + [r.task, r.harness + (r.run > 1 ? ' #' + r.run : ''), checks, repo, time, r.metrics?.requests ?? '?', r.metrics?.toolCalls ?? '?',
    k(r.usage.input) + ' / ' + k(r.usage.cached), k(r.usage.output), '$' + r.cost.toFixed(3)].join(' | ') + ' |');
}

// Aggregates over repeated runs of the same task and harness.
const groups = new Map();
for (const r of rows) {
  const key = r.task + ' ' + r.harness;
  const group = groups.get(key) ?? { task: r.task, harness: r.harness, runs: [] };
  group.runs.push(r);
  groups.set(key, group);
}
if ([...groups.values()].some(group => group.runs.length > 1)) {
  const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
  console.log('');
  console.log('| Task | Harness | Runs | All checks passed | Checks passed (mean) | npm test green | Wall time (mean) | Requests (mean) | Cost (mean) |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const { task, harness, runs } of groups.values()) {
    const total = runs[0].checks.total;
    console.log('| ' + [task, harness, runs.length, runs.filter(r => r.checks.pass === total && total > 0).length + '/' + runs.length,
      mean(runs.map(r => r.checks.pass)).toFixed(1) + '/' + total, runs.filter(r => r.repoTests.code === 0).length + '/' + runs.length,
      (mean(runs.map(r => r.durationMs)) / 60_000).toFixed(1) + ' min', mean(runs.map(r => r.metrics?.requests ?? 0)).toFixed(0),
      '$' + mean(runs.map(r => r.cost)).toFixed(3)].join(' | ') + ' |');
  }
}
