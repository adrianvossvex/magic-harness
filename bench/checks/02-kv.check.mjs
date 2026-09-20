// Hidden acceptance for task 02: drives bin/kv.js as a child process against a temporary store.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = process.env.BENCH_WORKSPACE;
// The nested `npm test` must not inherit the outer test runner's context, or it prints nothing.
const testEnv = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; };
const bin = join(root, 'bin', 'kv.js');
const dir = await mkdtemp(join(tmpdir(), 'kv-check-'));
const file = join(dir, 'store.json');
const run = async (...args) => {
  try { const r = await promisify(execFile)('node', [bin, ...args, '--file', file], { cwd: dir }); return { code: 0, ...r }; }
  catch (error) { return { code: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }; }
};

test('set then get returns the value', async () => { assert.equal((await run('set', 'name', 'Ada', 'Lovelace')).code, 0); const r = await run('get', 'name'); assert.equal(r.code, 0); assert.equal(r.stdout, 'Ada Lovelace\n'); });
test('get of a missing key exits 1 with the message on stderr', async () => { const r = await run('get', 'nope'); assert.equal(r.code, 1); assert.match(r.stderr, /not found: nope/); assert.equal(r.stdout, ''); });
test('list prints sorted keys', async () => { await run('set', 'b', '2'); await run('set', 'a', '1'); const r = await run('list'); assert.equal(r.stdout, 'a\nb\nname\n'); });
test('del removes and reports', async () => { const r = await run('del', 'b'); assert.equal(r.code, 0); assert.equal(r.stdout, 'deleted\n'); assert.equal((await run('get', 'b')).code, 1); });
test('del of a missing key exits 1', async () => { const r = await run('del', 'zzz'); assert.equal(r.code, 1); assert.match(r.stderr, /not found: zzz/); });
test('invalid keys are rejected', async () => { const r = await run('set', 'bad key', 'x'); assert.equal(r.code, 1); assert.match(r.stderr, /invalid key: bad key/); });
test('unknown commands exit 2', async () => { const r = await run('frobnicate'); assert.equal(r.code, 2); });
test('ttl expiry hides and purges the key', async () => {
  assert.equal((await run('set', 'temp', 'v', '--ttl', '1')).code, 0);
  assert.equal((await run('get', 'temp')).stdout, 'v\n');
  const raw = JSON.parse(await readFile(file, 'utf8'));
  const text = JSON.stringify(raw);
  assert.ok(/1[0-9]{12}/.test(text), 'the file stores an absolute expiry in milliseconds');
  await new Promise(resolve => setTimeout(resolve, 1300));
  const r = await run('get', 'temp'); assert.equal(r.code, 1); assert.match(r.stderr, /not found: temp/);
  assert.ok(!(await run('list')).stdout.split('\n').includes('temp'));
  assert.ok(!JSON.stringify(JSON.parse(await readFile(file, 'utf8'))).includes('"temp"'), 'expired key purged from the file');
});
test('the store survives a garbage temp file and keeps other keys', async () => { await writeFile(join(dir, 'store.json.tmp'), 'garbage'); assert.equal((await run('get', 'a')).stdout, '1\n'); });
test('the repository\'s own tests pass', async () => { const { stdout } = await promisify(execFile)('npm', ['test'], { cwd: root, env: testEnv() }); assert.match(stdout + '', /(?:#|ℹ) pass \d+/); });
