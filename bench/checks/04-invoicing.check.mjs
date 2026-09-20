// Hidden acceptance for task 04: a scenario through bin/invoice.js covering money rules, numbering, statuses, payments,
// reports and the CSV export, plus the repository's own tests.
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
const bin = join(root, 'bin', 'invoice.js');
const dir = await mkdtemp(join(tmpdir(), 'invoicing-check-'));
const data = join(dir, 'inv.json');
const run = async (...args) => {
  try { const r = await promisify(execFile)('node', [bin, ...args, '--data', data], { cwd: dir }); return { code: 0, out: r.stdout, err: r.stderr }; }
  catch (error) { return { code: error.code, out: error.stdout ?? '', err: error.stdout === undefined ? String(error) : error.stderr }; }
};
const ok = async (...args) => { const r = await run(...args); assert.equal(r.code, 0, args.join(' ') + ' failed: ' + r.err); return JSON.parse(r.out); };
// The error JSON may be printed on one line or pretty-printed; either way it is the whole of stderr or its tail.
const errorJson = (text) => { try { return JSON.parse(text.trim()); } catch { return JSON.parse(text.trim().split('\n').at(-1)); } };
const fails = async (...args) => { const r = await run(...args); assert.equal(r.code, 2, args.join(' ') + ' should fail with exit 2 (got ' + r.code + ')'); assert.ok(typeof errorJson(r.err).error === 'string', 'error JSON on stderr'); return r; };

test('customers and products with validation', async () => {
  const ann = await ok('add-customer', '--name', 'Ann', '--email', 'ann@example.com'); assert.deepEqual(ann, { id: 1, name: 'Ann', email: 'ann@example.com' });
  const bob = await ok('add-customer', '--name', 'Bob', '--email', 'bob@example.com'); assert.equal(bob.id, 2);
  await fails('add-customer', '--name', 'Eve', '--email', 'nope');
  const widget = await ok('add-product', '--name', 'Widget', '--price', '19.99', '--tax', '20'); assert.equal(widget.id, 1); assert.equal(widget.price, '19.99'); assert.equal(widget.taxRate, 20);
  const gadget = await ok('add-product', '--name', 'Gadget', '--price', '5'); assert.equal(gadget.price, '5.00'); assert.equal(gadget.taxRate, 0);
  await fails('add-product', '--name', 'Bad', '--price', '1.234');
  await fails('add-product', '--name', 'Bad', '--price', 'abc');
  await fails('add-product', '--name', 'Bad', '--price', '1.00', '--tax', '101');
});
test('a draft invoice starts empty and rejects issuing without lines', async () => {
  const draft = await ok('create', '--customer', '1', '--terms', '14');
  assert.equal(draft.id, 1); assert.equal(draft.status, 'draft'); assert.equal(draft.number, null); assert.equal(draft.terms, 14); assert.deepEqual(draft.lines, []); assert.equal(draft.total, '0.00'); assert.equal(draft.balance, '0.00');
  await fails('issue', '--invoice', '1', '--today', '2026-01-10');
});
test('lines compute net and tax with half-up rounding and discounts', async () => {
  let inv = await ok('add-line', '--invoice', '1', '--product', '1', '--quantity', '3', '--discount', '10');
  // 19.99 * 3 = 59.97; minus 10% = 53.973 -> 53.97; tax 20% = 10.794 -> 10.79
  assert.equal(inv.lines.length, 1); assert.equal(inv.lines[0].description, 'Widget'); assert.equal(inv.lines[0].unitPrice, '19.99'); assert.equal(inv.lines[0].quantity, 3); assert.equal(inv.lines[0].discount, 10);
  assert.equal(inv.lines[0].net, '53.97'); assert.equal(inv.lines[0].tax, '10.79');
  inv = await ok('add-line', '--invoice', '1', '--product', '2', '--quantity', '1');
  assert.equal(inv.subtotal, '58.97'); assert.equal(inv.tax, '10.79'); assert.equal(inv.total, '69.76'); assert.equal(inv.paid, '0.00'); assert.equal(inv.balance, '69.76');
  await fails('add-line', '--invoice', '1', '--product', '1', '--quantity', '0');
  await fails('add-line', '--invoice', '1', '--product', '1', '--discount', '150');
});
test('issuing numbers the invoice per year and sets the due date', async () => {
  const inv = await ok('issue', '--invoice', '1', '--today', '2026-01-10');
  assert.equal(inv.status, 'issued'); assert.equal(inv.number, 'INV-2026-0001'); assert.equal(inv.issued, '2026-01-10'); assert.equal(inv.due, '2026-01-24');
  await fails('add-line', '--invoice', '1', '--product', '1');
  await fails('issue', '--invoice', '1', '--today', '2026-01-11');
  await ok('create', '--customer', '2'); await ok('add-line', '--invoice', '2', '--product', '2', '--quantity', '4');
  const second = await ok('issue', '--invoice', '2', '--today', '2026-02-01'); assert.equal(second.number, 'INV-2026-0002'); assert.equal(second.due, '2026-03-03'); assert.equal(second.total, '20.00');
  await ok('create', '--customer', '2'); await ok('add-line', '--invoice', '3', '--product', '2');
  const other = await ok('issue', '--invoice', '3', '--today', '2027-01-05'); assert.equal(other.number, 'INV-2027-0001');
});
test('payments are partial, capped at the balance and flip the status when complete', async () => {
  let inv = await ok('pay', '--invoice', '1', '--amount', '9.76', '--today', '2026-01-12');
  assert.equal(inv.status, 'issued'); assert.equal(inv.paid, '9.76'); assert.equal(inv.balance, '60.00'); assert.equal(inv.payments.length, 1); assert.equal(inv.payments[0].amount, '9.76'); assert.equal(inv.payments[0].date, '2026-01-12');
  await fails('pay', '--invoice', '1', '--amount', '60.01', '--today', '2026-01-12');
  await fails('pay', '--invoice', '1', '--amount', 'ten');
  await fails('void', '--invoice', '1');
  inv = await ok('pay', '--invoice', '1', '--amount', '60.00', '--today', '2026-01-13');
  assert.equal(inv.status, 'paid'); assert.equal(inv.balance, '0.00');
  await fails('pay', '--invoice', '1', '--amount', '1.00');
});
test('void works on drafts and unpaid issued invoices only', async () => {
  await ok('create', '--customer', '1');
  const voided = await ok('void', '--invoice', '4'); assert.equal(voided.status, 'void');
  const issuedVoid = await ok('void', '--invoice', '3'); assert.equal(issuedVoid.status, 'void');
  await fails('void', '--invoice', '1');
  await fails('pay', '--invoice', '3', '--amount', '1.00');
});
test('show and list filters', async () => {
  const shown = await ok('show', '--invoice', '2'); assert.equal(shown.number, 'INV-2026-0002'); assert.equal(shown.balance, '20.00');
  assert.deepEqual((await ok('list')).map(i => i.id), [1, 2, 3, 4]);
  assert.deepEqual((await ok('list', '--status', 'paid')).map(i => i.id), [1]);
  assert.deepEqual((await ok('list', '--customer', '2')).map(i => i.id), [2, 3]);
  assert.deepEqual((await ok('list', '--overdue', '--today', '2026-03-04')).map(i => i.id), [2]);
  assert.deepEqual((await ok('list', '--overdue', '--today', '2026-03-03')).map(i => i.id), []);
});
test('aging report buckets balances by days past due', async () => {
  await ok('create', '--customer', '1'); await ok('add-line', '--invoice', '5', '--product', '1', '--quantity', '10'); await ok('issue', '--invoice', '5', '--today', '2026-02-10');
  // invoice 2: due 2026-03-03, balance 20.00; invoice 5: due 2026-03-12, total 199.90 + 39.98 tax = 239.88
  let report = await ok('report', 'aging', '--today', '2026-03-01');
  assert.deepEqual(report, { current: '259.88', days1to30: '0.00', days31to60: '0.00', days61to90: '0.00', over90: '0.00', total: '259.88' });
  report = await ok('report', 'aging', '--today', '2026-04-05');
  assert.deepEqual(report, { current: '0.00', days1to30: '239.88', days31to60: '20.00', days61to90: '0.00', over90: '0.00', total: '259.88' });
  report = await ok('report', 'aging', '--today', '2026-07-01');
  assert.deepEqual(report, { current: '0.00', days1to30: '0.00', days31to60: '0.00', days61to90: '0.00', over90: '259.88', total: '259.88' });
});
test('revenue report groups issued and paid invoices by issue month', async () => {
  const report = await ok('report', 'revenue');
  assert.deepEqual(report, [{ month: '2026-01', invoices: 1, total: '69.76' }, { month: '2026-02', invoices: 2, total: '259.88' }]);
});
test('export prints CSV of the lines as a JSON string', async () => {
  const csv = await ok('export', '--invoice', '1');
  assert.equal(csv, 'description,quantity,unitPrice,discount,net,tax\nWidget,3,19.99,10,53.97,10.79\nGadget,1,5.00,0,5.00,0.00');
});
test('usage errors exit 1, the data file is JSON, and the README documents every command', async () => {
  assert.equal((await run('nonsense')).code, 1);
  assert.equal((await run('issue')).code, 1);
  JSON.parse(await readFile(data, 'utf8'));
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  for (const command of ['add-customer', 'add-product', 'create', 'add-line', 'issue', 'pay', 'void', 'show', 'list', 'report', 'export']) assert.ok(readme.includes(command), 'README mentions ' + command);
});
test('the repository\'s own tests pass', async () => { const { stdout } = await promisify(execFile)('npm', ['test'], { cwd: root, env: testEnv() }); assert.match(stdout + '', /(?:#|ℹ) pass \d+/); assert.doesNotMatch(stdout + '', /(?:#|ℹ) fail [1-9]/); });
