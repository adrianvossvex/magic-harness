import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/todo.js';
test('add and list', () => { const s = createStore(); s.add('a'); assert.equal(s.list().length, 1); });
