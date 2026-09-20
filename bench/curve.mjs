#!/usr/bin/env node
// Prints the checkpoint curve of every run under a results folder: hidden checks passing over time, per suite.
// Usage: node bench/curve.mjs bench/results/<label> [task]
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [rootArg, only] = process.argv.slice(2);
if (!rootArg) { console.error('Usage: node bench/curve.mjs <results folder> [task]'); process.exit(1); }
const root = resolve(rootArg);
for (const task of (await readdir(root)).filter(name => !name.includes('.')).sort()) {
  if (only && task !== only) continue;
  for (const run of (await readdir(join(root, task))).sort()) {
    const file = join(root, task, run, 'result.json');
    if (!(await stat(file).catch(() => null))) continue;
    const result = JSON.parse(await readFile(file, 'utf8'));
    const points = result.checkpoints ?? [];
    if (!points.length) continue;
    const suites = [...new Set(points.flatMap(point => Object.keys(point.checks)))];
    // A suite that could not even load counts as 0 of its full size, which is the largest total seen for it.
    const totals = Object.fromEntries(suites.map(suite => [suite, Math.max(...points.map(point => point.checks[suite]?.total ?? 0))]));
    console.log('## ' + task + ' / ' + run + ' (' + (result.durationMs / 60_000).toFixed(0) + ' min, $' + result.cost.toFixed(2) + ')');
    console.log('| Minute | Note | ' + suites.map(suite => suite + ' (of ' + totals[suite] + ')').join(' | ') + ' | npm test |');
    console.log('|---|---|' + suites.map(() => '---').join('|') + '|---|');
    for (const point of points) {
      console.log('| ' + point.minutes + ' | ' + point.note + ' | ' + suites.map(suite => point.checks[suite] ? point.checks[suite].pass : '') .join(' | ') + ' | ' + (point.repoTests?.code === 0 ? 'green (' + point.repoTests.pass + ')' : 'red') + ' |');
    }
    console.log('');
  }
}
