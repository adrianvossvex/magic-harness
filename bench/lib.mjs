// Shared pieces of the benchmark: workspaces, the hidden acceptance checks, process spawning, token prices.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BENCH_ROOT = dirname(fileURLToPath(import.meta.url));
export const HARNESS_ROOT = dirname(BENCH_ROOT);
export const MODEL = 'deepseek-flash';

// DeepSeek's list prices for deepseek-flash (V4.1 Flash), USD per million tokens, peak hours. Off-peak halves them.
export const PRICES = { input: 0.30, cached: 0.006, output: 1.20 };

export const cost = ({ input = 0, cached = 0, output = 0 }) =>
  (input * PRICES.input + cached * PRICES.cached + output * PRICES.output) / 1_000_000;

export async function listTasks() {
  const names = (await readdir(join(BENCH_ROOT, 'tasks'))).filter(name => name.endsWith('.md')).sort();
  return names.map(name => name.slice(0, -3));
}

export const readTask = async (task) => (await readFile(join(BENCH_ROOT, 'tasks', task + '.md'), 'utf8')).trim();

// A fresh copy of the fixture as its own git repository, so the agent sees a normal small project.
export async function prepareWorkspace(task, target) {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(join(BENCH_ROOT, 'fixtures', task), target, { recursive: true });
  const git = (...args) => run('git', args, { cwd: target, timeoutMs: 60_000 });
  await git('init', '-q');
  await git('-c', 'user.name=bench', '-c', 'user.email=bench@example.com', 'add', '-A');
  await git('-c', 'user.name=bench', '-c', 'user.email=bench@example.com', 'commit', '-q', '-m', 'fixture');
  return target;
}

export async function changedFiles(workspace) {
  const { stdout } = await run('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: workspace, timeoutMs: 60_000 });
  return stdout.split('\n').filter(Boolean).map(line => line.slice(3)).filter(path => !path.startsWith('.magic/'));
}

// The hidden acceptance suite for a task, run against the workspace; the agent never sees it.
export async function runChecks(task, workspace) {
  const file = join(BENCH_ROOT, 'checks', task + '.check.mjs');
  const result = await run('node', ['--test', file], { cwd: workspace, timeoutMs: 10 * 60_000, env: { ...process.env, BENCH_WORKSPACE: workspace } });
  const output = result.stdout + result.stderr;
  const count = (label) => Number((output.match(new RegExp('^(?:#|ℹ) ' + label + ' (\\d+)$', 'm')) ?? [0, 0])[1]);
  return { pass: count('pass'), fail: count('fail'), total: count('tests'), output, code: result.code };
}

// The repository's own `npm test`, reported separately from the hidden checks.
export async function runRepoTests(workspace) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = await run('npm', ['test'], { cwd: workspace, timeoutMs: 5 * 60_000, env });
  const output = result.stdout + result.stderr;
  const pass = Number((output.match(/^(?:#|ℹ) pass (\d+)$/m) ?? [0, 0])[1]);
  const fail = Number((output.match(/^(?:#|ℹ) fail (\d+)$/m) ?? [0, 0])[1]);
  return { code: result.code, pass, fail, output };
}

// spawn with a deadline, captured output and an optional live log. `timedOut` is set when the deadline killed it.
export function run(command, args, { cwd, env = process.env, timeoutMs, onLine, stdin } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, args, { cwd, env, stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    const timer = timeoutMs ? setTimeout(() => { timedOut = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 10_000).unref(); }, timeoutMs) : undefined;
    child.stdout.on('data', chunk => { stdout += chunk; onLine?.(String(chunk), 'out'); });
    child.stderr.on('data', chunk => { stderr += chunk; onLine?.(String(chunk), 'err'); });
    if (stdin) child.stdin.end(stdin);
    child.on('error', error => { stderr += String(error); });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut, durationMs: Date.now() - started });
    });
  });
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
}

export const seconds = (ms) => (ms / 1000).toFixed(0) + ' s';
