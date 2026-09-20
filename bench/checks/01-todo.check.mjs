// Hidden acceptance for task 01: the produced library's behaviour, its own tests, and the README.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = process.env.BENCH_WORKSPACE;
// The nested `npm test` must not inherit the outer test runner's context, or it prints nothing.
const testEnv = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; };
const { createStore } = await import(pathToFileURL(join(root, 'src', 'todo.js')).href);

test('toggle flips done and returns the item', () => { const s = createStore(); const item = s.add('a'); assert.equal(s.toggle(item.id), item); assert.equal(item.done, true); s.toggle(item.id); assert.equal(item.done, false); });
test('toggle throws for an unknown id', () => { const s = createStore(); assert.throws(() => s.toggle(42), /Unknown id/); });
test('remove deletes and returns true', () => { const s = createStore(); const item = s.add('a'); assert.equal(s.remove(item.id), true); assert.deepEqual(s.list(), []); });
test('remove returns false for an unknown id', () => { const s = createStore(); s.add('a'); assert.equal(s.remove(9), false); assert.equal(s.list().length, 1); });
test('count reflects adds and removes', () => { const s = createStore(); assert.equal(s.count(), 0); const a = s.add('a'); s.add('b'); assert.equal(s.count(), 2); s.remove(a.id); assert.equal(s.count(), 1); });
test('add and list still work and list is a copy', () => { const s = createStore(); s.add('x'); const copy = s.list(); copy.push('junk'); assert.equal(s.list().length, 1); });
test('README documents the API', async () => { const readme = await readFile(join(root, 'README.md'), 'utf8'); for (const name of ['createStore', 'add', 'list', 'toggle', 'remove', 'count']) assert.ok(readme.includes(name), 'README mentions ' + name); });
test('the repository\'s own tests pass', async () => { const { stdout } = await promisify(execFile)('npm', ['test'], { cwd: root, env: testEnv() }); assert.match(stdout + '', /(?:#|ℹ) pass \d+/); });
