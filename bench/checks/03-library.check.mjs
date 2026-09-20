// Hidden acceptance for task 03: an end-to-end scenario through bin/library.js, plus the repository's own tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = process.env.BENCH_WORKSPACE;
// The nested `npm test` must not inherit the outer test runner's context, or it prints nothing.
const testEnv = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; };
const bin = join(root, 'bin', 'library.js');
const dir = await mkdtemp(join(tmpdir(), 'library-check-'));
const data = join(dir, 'lib.json');
const run = async (...args) => {
  try { const r = await promisify(execFile)('node', [bin, ...args, '--data', data], { cwd: dir }); return { code: 0, out: r.stdout, err: r.stderr }; }
  catch (error) { return { code: error.code, out: error.stdout ?? '', err: error.stderr ?? '' }; }
};
const json = r => JSON.parse(r.out);
// The error JSON may be printed on one line or pretty-printed; either way it is the whole of stderr or its tail.
const errorJson = (text) => { try { return JSON.parse(text.trim()); } catch { return JSON.parse(text.trim().split('\n').at(-1)); } };

let book1, book2, m1, m2, loan1;
test('add-book prints the book with copies and availability', async () => { const r = await run('add-book', '--title', 'Dune', '--author', 'Herbert', '--copies', '2'); assert.equal(r.code, 0, r.err); book1 = json(r); assert.equal(book1.id, 1); assert.equal(book1.copies, 2); assert.equal(book1.available, 2); assert.equal(book1.title, 'Dune'); });
test('a second book gets the next id and one copy by default', async () => { book2 = json(await run('add-book', '--title', 'Emma', '--author', 'Austen')); assert.equal(book2.id, 2); assert.equal(book2.copies, 1); });
test('add-member prints the member', async () => { m1 = json(await run('add-member', '--name', 'Ann')); m2 = json(await run('add-member', '--name', 'Bob')); assert.equal(m1.id, 1); assert.equal(m2.id, 2); assert.equal(m2.name, 'Bob'); });
test('checkout computes the due date and decrements availability', async () => { const r = await run('checkout', '--book', '1', '--member', '1', '--today', '2026-01-01'); assert.equal(r.code, 0, r.err); loan1 = json(r); assert.equal(loan1.due, '2026-01-15'); assert.equal(loan1.out, '2026-01-01'); assert.equal(loan1.returned, null); const books = json(await run('list-books')); assert.equal(books.find(b => b.id === 1).available, 1); });
test('checkout fails with exit 2 when no copy is available', async () => { assert.equal((await run('checkout', '--book', '2', '--member', '1', '--today', '2026-01-01')).code, 0); const r = await run('checkout', '--book', '2', '--member', '2', '--today', '2026-01-02'); assert.equal(r.code, 2); assert.match(r.err, /error/); });
test('list-books --available hides fully lent books', async () => { const books = json(await run('list-books', '--available')); assert.deepEqual(books.map(b => b.id), [1]); });
test('a member may not hold more than 3 active loans', async () => {
  for (const title of ['A', 'B']) await run('add-book', '--title', title, '--author', 'X');
  assert.equal((await run('checkout', '--book', '3', '--member', '1', '--today', '2026-01-03')).code, 0);
  const r = await run('checkout', '--book', '4', '--member', '1', '--today', '2026-01-03');
  assert.equal(r.code, 2);
});
test('list-loans filters by member and overdue', async () => {
  const mine = json(await run('list-loans', '--member', '1')); assert.equal(mine.length, 3);
  const overdue = json(await run('list-loans', '--overdue', '--today', '2026-01-20')); assert.deepEqual(overdue.map(l => l.id).sort(), [1, 2, 3]);
  const none = json(await run('list-loans', '--overdue', '--today', '2026-01-10')); assert.equal(none.length, 0);
});
test('returning late charges 0.50 per day, capped at 20', async () => {
  const r = await run('return', '--loan', String(loan1.id), '--today', '2026-01-25'); assert.equal(r.code, 0, r.err); const loan = json(r); assert.equal(loan.fine, 5); assert.equal(loan.returned, '2026-01-25');
  const late = json(await run('return', '--loan', '2', '--today', '2026-06-01')); assert.equal(late.fine, 20);
});
test('returning on time charges nothing and returning twice fails', async () => { const r = json(await run('return', '--loan', '3', '--today', '2026-01-10')); assert.equal(r.fine, 0); assert.equal((await run('return', '--loan', '3', '--today', '2026-01-11')).code, 2); });
test('availability is restored after returns', async () => { const books = json(await run('list-books')); assert.equal(books.find(b => b.id === 1).available, 2); assert.equal(books.find(b => b.id === 2).available, 1); });
test('report sums everything', async () => { const r = json(await run('report', '--today', '2026-02-01')); assert.equal(r.books, 4); assert.equal(r.copies, 5); assert.equal(r.members, 2); assert.equal(r.activeLoans, 0); assert.equal(r.overdue, 0); assert.equal(r.finesOwed, 25); });
test('unknown commands exit 1 and errors go to stderr as JSON', async () => { const r = await run('nonsense'); assert.equal(r.code, 1); const bad = await run('return', '--loan', '999', '--today', '2026-01-01'); assert.equal(bad.code, 2); assert.equal(typeof errorJson(bad.err).error, 'string'); });
test('the data file is JSON and the README documents the commands', async () => { JSON.parse(await readFile(data, 'utf8')); const readme = await readFile(join(root, 'README.md'), 'utf8'); for (const command of ['add-book', 'add-member', 'checkout', 'return', 'list-books', 'list-loans', 'report']) assert.ok(readme.includes(command), 'README mentions ' + command); });
test('the repository\'s own tests pass', async () => { const { stdout } = await promisify(execFile)('npm', ['test'], { cwd: root, env: testEnv() }); assert.match(stdout + '', /(?:#|ℹ) pass \d+/); assert.doesNotMatch(stdout + '', /(?:#|ℹ) fail [1-9]/); });
