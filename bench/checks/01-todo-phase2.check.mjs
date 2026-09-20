// Hidden acceptance for task 01, phase 2: clear() plus the README, and the earlier behaviour still intact.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.env.BENCH_WORKSPACE;
const { createStore } = await import(pathToFileURL(join(root, 'src', 'todo.js')).href);
test('clear empties the store and reports the count', () => { const s = createStore(); s.add('a'); s.add('b'); assert.equal(s.clear(), 2); assert.equal(s.count(), 0); assert.deepEqual(s.list(), []); assert.equal(s.clear(), 0); });
test('the earlier methods survive', () => { const s = createStore(); const item = s.add('x'); s.toggle(item.id); assert.equal(item.done, true); assert.equal(s.remove(item.id), true); });
test('README documents clear', async () => { assert.ok((await readFile(join(root, 'README.md'), 'utf8')).includes('clear')); });
