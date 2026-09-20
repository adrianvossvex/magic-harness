// Hidden acceptance for the DELVE rewind (phase 2): exact restoration, limits, persistence, keys and the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';

const root = process.env.BENCH_WORKSPACE;
// The HUD's text: everything from the element with id="hud" onwards, tags stripped, whitespace folded (the HUD may
// be built of nested elements, so a capture up to the first closing tag would truncate it).
const hudText = (dom) => { const start = dom.indexOf('id="hud"'); return start < 0 ? '' : dom.slice(start, start + 4000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); };
const testEnv = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; };
const { createGame, loadGame, applyKey, runScript } = await import(pathToFileURL(join(root, 'src', 'game.js')).href);
const mapModule = await import(pathToFileURL(join(root, 'src', 'map.js')).href);
const ROOM = ['##########', '#........#', '#........#', '#...##...#', '#........#', '#........#', '##########'];

test('undo restores the exact previous state, one turn at a time, up to ten', () => {
  const game = createGame({ seed: 5, map: ROOM, player: { x: 1, y: 1 }, monsters: [{ type: 'rat', x: 8, y: 5 }], items: [{ kind: 'potion', x: 2, y: 1 }] });
  assert.equal(game.state.undo, 0);
  assert.equal(game.undo(), false, 'nothing to undo at the start');
  const hashes = [game.hash()];
  const script = 'lg.j.k.l.h.j.l.k.';
  for (const key of script) { applyKey(game, key); hashes.push(game.hash()); }
  assert.equal(game.state.turn, script.length);
  assert.equal(game.state.undo, 10, 'ten turns of history');
  for (let i = 0; i < 10; i++) {
    assert.equal(game.undo(), true, 'undo ' + (i + 1));
    assert.equal(game.hash(), hashes[script.length - 1 - i], 'hash after undo ' + (i + 1));
    assert.equal(game.state.turn, script.length - 1 - i);
  }
  assert.equal(game.state.undo, 0);
  assert.equal(game.undo(), false, 'history is capped at ten');
  assert.equal(game.state.turn, script.length - 10);
});

test('actions that cost no turn leave nothing to undo; redoing an action after undo gives the same result', () => {
  const game = createGame({ seed: 8, map: ROOM, player: { x: 1, y: 1 } });
  game.act({ type: 'move', dx: -1, dy: 0 });
  game.act({ type: 'pickup' });
  assert.equal(game.state.undo, 0); assert.equal(game.undo(), false);
  const before = game.hash();
  game.act({ type: 'move', dx: 1, dy: 1 });
  const after = game.hash();
  assert.equal(game.undo(), true); assert.equal(game.hash(), before);
  game.act({ type: 'move', dx: 1, dy: 1 });
  assert.equal(game.hash(), after, 'the same action again gives the same state');
  // With wandering monsters the rng matters: undo then replay must still agree.
  const wild = createGame({ seed: 9 });
  runScript(wild, '....');
  const mark = wild.hash();
  runScript(wild, 'hjkl');
  const end = wild.hash();
  for (let i = 0; i < 4; i++) assert.equal(wild.undo(), true);
  assert.equal(wild.hash(), mark);
  runScript(wild, 'hjkl');
  assert.equal(wild.hash(), end);
});

test('undo across descend restores the previous level, and history survives save and load', () => {
  const game = createGame({ seed: 4 });
  const level = mapModule.generateLevel((4 + 7919) >>> 0, 1);
  game.state.player.x = level.stairs.x; game.state.player.y = level.stairs.y;
  const before = game.hash();
  game.act({ type: 'descend' });
  assert.equal(game.state.depth, 2);
  const saved = loadGame(game.serialize());
  assert.equal(saved.state.undo, game.state.undo); assert.equal(saved.hash(), game.hash());
  assert.equal(saved.undo(), true);
  assert.equal(saved.state.depth, 1); assert.equal(saved.hash(), before);
  assert.equal(game.undo(), true); assert.equal(game.hash(), before);
});

test('the z key rewinds with a message and runScript accepts it', () => {
  const game = createGame({ seed: 5, map: ROOM, player: { x: 1, y: 1 } });
  assert.deepEqual(applyKey(game, 'z'), ['Nothing to rewind.']);
  applyKey(game, 'l');
  assert.deepEqual(applyKey(game, 'z'), ['You rewind time.']);
  assert.deepEqual([game.state.player.x, game.state.player.y, game.state.turn], [1, 1, 0]);
  runScript(game, 'lljzz');
  assert.deepEqual([game.state.player.x, game.state.player.y, game.state.turn], [2, 1, 1]);
});

test('the page shows the undo count and rewinds on z', async () => {
  const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  await stat(chrome);
  const run = async (query) => {
    const args = ['--headless=new', '--allow-file-access-from-files', '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--window-size=1280,720',
      '--enable-logging=stderr', '--v=0', '--virtual-time-budget=4000', '--dump-dom', pathToFileURL(join(root, 'index.html')).href + query];
    const { stdout, stderr } = await promisify(execFile)(chrome, args, { maxBuffer: 64 * 1024 * 1024 });
    const errors = stderr.split('\n').filter(line => /CONSOLE/.test(line) && (/:ERROR:CONSOLE/.test(line) || /"Uncaught /.test(line) || /Access to script/.test(line) || /Failed to load/.test(line)));
    const hud = hudText(stdout);
    return { hud, errors };
  };
  const played = await run('?seed=3&script=' + encodeURIComponent('....'));
  assert.deepEqual(played.errors, []);
  assert.match(played.hud, /Undo 4/); assert.match(played.hud, /Turn 4/);
  const rewound = await run('?seed=3&script=' + encodeURIComponent('....zz'));
  assert.deepEqual(rewound.errors, []);
  assert.match(rewound.hud, /Undo 2/); assert.match(rewound.hud, /Turn 2/);
});

test('the repository\'s own tests pass', async () => { const { stdout } = await promisify(execFile)('npm', ['test'], { cwd: root, env: testEnv() }); assert.match(stdout + '', /(?:#|ℹ) pass \d+/); assert.doesNotMatch(stdout + '', /(?:#|ℹ) fail [1-9]/); });
