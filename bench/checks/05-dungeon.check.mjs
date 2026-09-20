// Hidden acceptance for task 05: the DELVE core against its contract, invariants under random play, determinism,
// the page in headless Chrome, and the source rules. The renderer's looks are not judged here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { referenceFov, shortestLength, reachable, passable, mulberry } from './lib/delve-reference.mjs';

const root = process.env.BENCH_WORKSPACE;
// The HUD's text: everything from the element with id="hud" onwards, tags stripped, whitespace folded (the HUD may
// be built of nested elements, so a capture up to the first closing tag would truncate it).
const hudText = (dom) => { const start = dom.indexOf('id="hud"'); return start < 0 ? '' : dom.slice(start, start + 4000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); };
const testEnv = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; };
const load = (name) => import(pathToFileURL(join(root, 'src', name)).href);
const rngModule = await load('rng.js');
const mapModule = await load('map.js');
const fovModule = await load('fov.js');
const pathModule = await load('path.js');
const gameModule = await load('game.js');
const { createGame, loadGame, applyKey, runScript } = gameModule;

const ROOM = [
  '##########',
  '#........#',
  '#........#',
  '#...##...#',
  '#........#',
  '#........#',
  '##########',
];
const CORRIDOR = [
  '###########',
  '#.........#',
  '###########',
];
const key = (x, y) => x + ',' + y;
const at = (game, x, y) => game.state.monsters.find(m => m.x === x && m.y === y);

test('rng is mulberry32 with int and pick', () => {
  const rng = rngModule.createRng(123);
  assert.equal(rng.next(), 0.7872516233474016); assert.equal(rng.next(), 0.1785435655619949); assert.equal(rng.next(), 0.49531551403924823);
  const other = rngModule.createRng(5);
  for (let i = 0; i < 200; i++) { const n = other.int(7); assert.ok(Number.isInteger(n) && n >= 0 && n < 7); }
  assert.ok(['a', 'b', 'c'].includes(other.pick(['a', 'b', 'c'])));
  const copy = rngModule.createRng(0); copy.state = rng.state; assert.equal(copy.next(), rng.next(), 'state round-trips');
});

test('generated levels obey the constraints and are deterministic', () => {
  const seen = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    for (const depth of [1, 3, 5]) {
      const level = mapModule.generateLevel(seed, depth);
      assert.equal(level.width, 60); assert.equal(level.height, 30); assert.equal(level.tiles.length, 30);
      for (const row of level.tiles) { assert.equal(row.length, 60); assert.match(row, /^[#.>]+$/); assert.equal(row[0], '#'); assert.equal(row[59], '#'); }
      assert.match(level.tiles[0], /^#+$/); assert.match(level.tiles[29], /^#+$/);
      assert.ok(level.rooms.length >= 6 && level.rooms.length <= 12, 'rooms: ' + level.rooms.length);
      for (const room of level.rooms) {
        assert.ok(room.w >= 3 && room.w <= 10 && room.h >= 3 && room.h <= 10, 'room size');
        for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) assert.notEqual(level.tiles[y][x], '#', 'room interior is floor');
      }
      for (let i = 0; i < level.rooms.length; i++) for (let j = i + 1; j < level.rooms.length; j++) {
        const a = level.rooms[i], b = level.rooms[j];
        const overlap = a.x - 1 <= b.x + b.w && b.x - 1 <= a.x + a.w && a.y - 1 <= b.y + b.h && b.y - 1 <= a.y + a.h;
        assert.ok(!overlap, 'rooms ' + i + ' and ' + j + ' touch');
      }
      const first = level.rooms[0];
      assert.ok(level.start.x >= first.x && level.start.x < first.x + first.w && level.start.y >= first.y && level.start.y < first.y + first.h, 'start in the first room');
      assert.notEqual(level.tiles[level.start.y][level.start.x], '#');
      const stairsChar = level.tiles[level.stairs.y][level.stairs.x];
      if (depth < 5) { assert.equal(stairsChar, '>'); assert.equal(level.tiles.join('').split('>').length - 1, 1, 'exactly one stairs tile'); }
      else { assert.equal(stairsChar, '.'); assert.ok(!level.tiles.join('').includes('>'), 'no stairs on the last depth'); }
      const inRoom = (p, r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
      const stairsRoom = level.rooms.find(r => inRoom(level.stairs, r));
      assert.ok(stairsRoom && stairsRoom !== first, 'stairs in another room');
      const centre = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
      const d2 = r => (centre(r).x - level.start.x) ** 2 + (centre(r).y - level.start.y) ** 2;
      const farthest = Math.max(...level.rooms.slice(1).map(d2));
      assert.ok(Math.abs(d2(stairsRoom) - farthest) < 1e-9 || level.rooms.slice(1).filter(r => Math.abs(d2(r) - farthest) < 1e-9).includes(stairsRoom), 'stairs in the farthest room');
      const reach = reachable(level.tiles, level.start);
      for (let y = 0; y < 30; y++) for (let x = 0; x < 60; x++) if (level.tiles[y][x] !== '#') assert.ok(reach.has(key(x, y)), 'floor tile ' + x + ',' + y + ' unreachable');
      const again = mapModule.generateLevel(seed, depth);
      assert.deepEqual(again.tiles, level.tiles); assert.deepEqual(again.rooms, level.rooms); assert.deepEqual(again.start, level.start); assert.deepEqual(again.stairs, level.stairs);
      seen.add(level.tiles.join(''));
    }
  }
  assert.ok(seen.size >= 20, 'different seeds give different levels');
});

test('field of view matches the specified Bresenham rule', () => {
  const cases = [[ROOM, 2, 2, 8], [ROOM, 8, 5, 3], [ROOM, 1, 1, 4], [CORRIDOR, 5, 1, 3]];
  for (const [tiles, x, y, radius] of cases) {
    const expected = referenceFov(tiles, x, y, radius);
    const actual = fovModule.computeFov(tiles, x, y, radius);
    assert.ok(actual instanceof Set, 'returns a Set');
    assert.deepEqual([...actual].sort(), [...expected].sort(), 'fov from ' + x + ',' + y + ' radius ' + radius);
    assert.ok(actual.has(key(x, y)), 'origin visible');
  }
  const level = mapModule.generateLevel(11, 1);
  assert.deepEqual([...fovModule.computeFov(level.tiles, level.start.x, level.start.y, 8)].sort(), [...referenceFov(level.tiles, level.start.x, level.start.y, 8)].sort());
});

test('paths are shortest, step over passable tiles and honour blocked tiles', () => {
  const inside = pathModule.findPath(ROOM, { x: 1, y: 1 }, { x: 8, y: 5 });
  assert.equal(inside.length, 7);
  let prev = { x: 1, y: 1 };
  for (const step of inside) { assert.ok(Math.max(Math.abs(step.x - prev.x), Math.abs(step.y - prev.y)) === 1, 'adjacent steps'); assert.ok(passable(ROOM, step.x, step.y)); prev = step; }
  assert.deepEqual(inside.at(-1), { x: 8, y: 5 });
  assert.equal(pathModule.findPath(ROOM, { x: 1, y: 1 }, { x: 4, y: 3 }), null, 'a wall is unreachable');
  assert.equal(pathModule.findPath(CORRIDOR, { x: 1, y: 1 }, { x: 9, y: 1 }, [{ x: 5, y: 1 }]), null, 'blocked corridor');
  assert.equal(pathModule.findPath(CORRIDOR, { x: 1, y: 1 }, { x: 5, y: 1 }, [{ x: 5, y: 1 }]).length, 4, 'the target itself may be blocked');
  for (const seed of [21, 22, 23, 24, 25]) {
    const level = mapModule.generateLevel(seed, 2);
    const path = pathModule.findPath(level.tiles, level.start, level.stairs);
    assert.equal(path.length, shortestLength(level.tiles, level.start, level.stairs), 'shortest on seed ' + seed);
    let p = level.start;
    for (const step of path) { assert.equal(Math.max(Math.abs(step.x - p.x), Math.abs(step.y - p.y)), 1); assert.ok(passable(level.tiles, step.x, step.y)); p = step; }
  }
});

test('a new game has the specified player, level and populated entities', () => {
  const game = createGame({ seed: 9 });
  const s = game.state;
  assert.equal(s.seed, 9); assert.equal(s.depth, 1); assert.equal(s.turn, 0); assert.equal(s.status, 'playing');
  assert.deepEqual({ hp: s.player.hp, maxHp: s.player.maxHp, attack: s.player.attack, defense: s.player.defense, level: s.player.level, xp: s.player.xp, gold: s.player.gold },
    { hp: 30, maxHp: 30, attack: 5, defense: 1, level: 1, xp: 0, gold: 0 });
  assert.deepEqual(s.player.inventory, []); assert.deepEqual(s.player.equipment, { weapon: null, armor: null });
  const level = mapModule.generateLevel((9 + 7919) >>> 0, 1);
  assert.deepEqual(s.tiles, level.tiles, 'depth 1 uses levelSeed(seed, 1)');
  assert.deepEqual({ x: s.player.x, y: s.player.y }, level.start);
  assert.equal(s.monsters.length, 5); assert.equal(s.items.length, 4);
  const first = level.rooms[0];
  const positions = new Set();
  for (const m of s.monsters) {
    assert.ok(['rat', 'goblin'].includes(m.type), 'depth 1 types');
    assert.ok(!(m.x >= first.x && m.x < first.x + first.w && m.y >= first.y && m.y < first.y + first.h), 'monsters outside the first room');
    assert.notEqual(s.tiles[m.y][m.x], '#'); assert.ok(!positions.has(key(m.x, m.y))); positions.add(key(m.x, m.y));
    assert.equal(m.hp, m.maxHp);
  }
  for (const item of s.items) { assert.ok(['potion', 'gold', 'dagger', 'sword', 'leather', 'chain'].includes(item.kind)); assert.notEqual(s.tiles[item.y][item.x], '#'); assert.ok(!positions.has(key(item.x, item.y))); positions.add(key(item.x, item.y)); if (item.kind === 'gold') assert.ok(item.amount >= 5 && item.amount <= 20); }
  assert.equal(new Set(s.monsters.map(m => m.id)).size, 5, 'unique monster ids'); assert.equal(new Set(s.items.map(i => i.id)).size, 4, 'unique item ids');
  assert.ok(Array.isArray(s.visible) && s.visible.includes(key(s.player.x, s.player.y)));
  assert.deepEqual([...s.visible].sort(), [...referenceFov(s.tiles, s.player.x, s.player.y, 8)].sort());
  assert.equal(s.explored.length, 30); assert.equal(s.explored[s.player.y][s.player.x], '1');
  assert.ok(Array.isArray(s.log));
});

test('movement, walls and turns', () => {
  const game = createGame({ seed: 1, map: ROOM, player: { x: 1, y: 1 } });
  assert.equal(game.state.width, 10); assert.equal(game.state.height, 7);
  const messages = game.act({ type: 'move', dx: -1, dy: 0 });
  assert.equal(game.state.turn, 0, 'a wall costs no turn'); assert.ok(messages.length >= 1 && messages.every(m => typeof m === 'string'));
  game.act({ type: 'move', dx: 1, dy: 1 });
  assert.deepEqual([game.state.player.x, game.state.player.y, game.state.turn], [2, 2, 1]);
  game.act({ type: 'wait' }); assert.equal(game.state.turn, 2);
  game.act({ type: 'move', dx: 0, dy: -1 }); game.act({ type: 'move', dx: 0, dy: -1 });
  assert.deepEqual([game.state.player.x, game.state.player.y, game.state.turn], [2, 1, 3], 'off-map or wall moves do nothing');
  assert.deepEqual(game.act({ type: 'descend' }).length >= 1, true); assert.equal(game.state.turn, 3, 'no stairs here');
});

test('combat numbers, kills, xp and levels', () => {
  const game = createGame({ seed: 1, map: ROOM, player: { x: 1, y: 1 }, monsters: [{ type: 'rat', x: 2, y: 1 }, { type: 'goblin', x: 5, y: 5 }] });
  let messages = game.act({ type: 'move', dx: 1, dy: 0 });
  assert.equal(game.state.monsters.length, 1, 'the rat dies to one hit of 5');
  assert.ok(messages.includes('You hit the rat for 5.') && messages.includes('You kill the rat.'), messages.join(' | '));
  assert.equal(game.state.player.xp, 3); assert.deepEqual([game.state.player.x, game.state.player.y], [1, 1], 'attacking does not move');
  // Walk next to the goblin: it chases as soon as it sees the player; fight it.
  const goblin = game.state.monsters[0];
  let guard = 0;
  while (Math.max(Math.abs(goblin.x - game.state.player.x), Math.abs(goblin.y - game.state.player.y)) > 1 && guard++ < 20) game.act({ type: 'wait' });
  assert.ok(guard < 20, 'the goblin comes to the player');
  const hpBefore = game.state.player.hp;
  messages = game.act({ type: 'move', dx: Math.sign(goblin.x - game.state.player.x), dy: Math.sign(goblin.y - game.state.player.y) });
  assert.equal(goblin.hp, 4, 'goblin takes 5 - 1'); assert.ok(messages.includes('You hit the goblin for 4.'));
  assert.equal(game.state.player.hp, hpBefore - 2, 'goblin hits back for 3 - 1');
  assert.ok(messages.includes('The goblin hits you for 2.'));
  messages = game.act({ type: 'move', dx: Math.sign(goblin.x - game.state.player.x), dy: Math.sign(goblin.y - game.state.player.y) });
  assert.equal(game.state.monsters.length, 0); assert.equal(game.state.player.xp, 9);
  // A skeleton (12 hp, defense 2) takes 3 per hit and hits back for 4 - 1 = 3 three times; its 10 xp reach level 2.
  const big = createGame({ seed: 1, map: ROOM, player: { x: 1, y: 1 }, monsters: [{ type: 'skeleton', x: 2, y: 1 }] });
  for (let i = 0; i < 3; i++) big.act({ type: 'move', dx: 1, dy: 0 });
  assert.equal(big.state.monsters[0].hp, 3); assert.equal(big.state.player.hp, 21);
  messages = big.act({ type: 'move', dx: 1, dy: 0 });
  assert.equal(big.state.monsters.length, 0);
  assert.ok(messages.includes('Welcome to level 2.'), messages.join(' | '));
  assert.deepEqual({ level: big.state.player.level, xp: big.state.player.xp, maxHp: big.state.player.maxHp, hp: big.state.player.hp, attack: big.state.player.attack },
    { level: 2, xp: 10, maxHp: 35, hp: 26, attack: 6 });
  assert.equal(big.state.turn, 4);
});

test('monsters chase in sight, wander out of sight, never overlap or enter walls', () => {
  const game = createGame({ seed: 3, map: CORRIDOR, player: { x: 1, y: 1 }, monsters: [{ type: 'rat', x: 6, y: 1 }] });
  const rat = game.state.monsters[0];
  game.act({ type: 'wait' }); assert.equal(rat.x, 5, 'one step closer per turn');
  game.act({ type: 'wait' }); assert.equal(rat.x, 4);
  game.act({ type: 'wait' }); game.act({ type: 'wait' });
  assert.equal(rat.x, 2, 'adjacent now');
  const hp = game.state.player.hp;
  game.act({ type: 'wait' });
  assert.equal(game.state.player.hp, hp - 1, 'a rat hits for max(1, 2 - 1)'); assert.equal(rat.x, 2, 'attacking does not move');
  // Out of sight (radius 5): the rat wanders, one step at most, within the corridor.
  const far = createGame({ seed: 3, map: CORRIDOR, player: { x: 1, y: 1 }, monsters: [{ type: 'rat', x: 9, y: 1 }] });
  const wanderer = far.state.monsters[0];
  let moved = 0;
  for (let i = 0; i < 40 && Math.abs(wanderer.x - far.state.player.x) > 5; i++) {
    const before = wanderer.x;
    far.act({ type: 'wait' });
    assert.ok(Math.abs(wanderer.x - before) <= 1 && wanderer.y === 1 && passable(CORRIDOR, wanderer.x, wanderer.y));
    if (wanderer.x !== before) moved += 1;
  }
  assert.ok(moved > 0, 'a wandering monster moves sometimes');
  // Two monsters in a dead end: they never share a tile.
  const crowd = createGame({ seed: 5, map: ROOM, player: { x: 1, y: 1 }, monsters: [{ type: 'rat', x: 8, y: 5 }, { type: 'rat', x: 7, y: 5 }, { type: 'goblin', x: 8, y: 4 }] });
  for (let i = 0; i < 30 && crowd.state.status === 'playing'; i++) {
    crowd.act({ type: 'wait' });
    const spots = crowd.state.monsters.map(m => key(m.x, m.y));
    assert.equal(new Set(spots).size, spots.length, 'no two monsters on one tile');
    for (const m of crowd.state.monsters) { assert.ok(passable(ROOM, m.x, m.y)); assert.ok(!(m.x === 1 && m.y === 1)); }
  }
});

test('items: pickup, capacity, potions, equipment, drop, gold', () => {
  const items = [{ kind: 'potion', x: 2, y: 1 }, { kind: 'sword', x: 3, y: 1 }, { kind: 'dagger', x: 4, y: 1 }, { kind: 'chain', x: 5, y: 1 }, { kind: 'gold', x: 6, y: 1, amount: 12 }];
  const game = createGame({ seed: 1, map: ROOM, player: { x: 1, y: 1 }, items });
  let messages = game.act({ type: 'pickup' });
  assert.equal(game.state.turn, 0); assert.ok(messages.includes('There is nothing here.'));
  game.act({ type: 'move', dx: 1, dy: 0 }); messages = game.act({ type: 'pickup' });
  assert.equal(game.state.turn, 2); assert.equal(game.state.player.inventory.length, 1); assert.equal(game.state.player.inventory[0].kind, 'potion');
  assert.equal(game.state.items.length, 4, 'the floor item is gone');
  game.act({ type: 'move', dx: 1, dy: 0 }); game.act({ type: 'pickup' });
  game.act({ type: 'move', dx: 1, dy: 0 }); game.act({ type: 'pickup' });
  game.act({ type: 'move', dx: 1, dy: 0 }); game.act({ type: 'pickup' });
  game.act({ type: 'move', dx: 1, dy: 0 }); messages = game.act({ type: 'pickup' });
  assert.equal(game.state.player.gold, 12); assert.ok(messages.includes('You pick up 12 gold.'));
  assert.deepEqual(game.state.player.inventory.map(i => i.kind), ['potion', 'sword', 'dagger', 'chain']);
  const turn = game.state.turn;
  game.act({ type: 'use', index: 1 });
  assert.equal(game.state.player.equipment.weapon.kind, 'sword'); assert.deepEqual(game.state.player.inventory.map(i => i.kind), ['potion', 'dagger', 'chain']); assert.equal(game.state.turn, turn + 1);
  game.act({ type: 'use', index: 1 });
  assert.equal(game.state.player.equipment.weapon.kind, 'dagger'); assert.ok(game.state.player.inventory.some(i => i.kind === 'sword'), 'the sword returns to the pack');
  game.act({ type: 'use', index: game.state.player.inventory.findIndex(i => i.kind === 'chain') });
  assert.equal(game.state.player.equipment.armor.kind, 'chain');
  messages = game.act({ type: 'use', index: 9 }); assert.equal(game.state.turn, turn + 3, 'an invalid index costs nothing'); assert.ok(messages.length >= 1);
  game.state.player.hp = 15;
  game.act({ type: 'use', index: game.state.player.inventory.findIndex(i => i.kind === 'potion') });
  assert.equal(game.state.player.hp, 25); assert.ok(!game.state.player.inventory.some(i => i.kind === 'potion'), 'the potion is consumed');
  const sword = game.state.player.inventory.findIndex(i => i.kind === 'sword');
  game.act({ type: 'drop', index: sword });
  assert.ok(game.state.items.some(i => i.kind === 'sword' && i.x === game.state.player.x && i.y === game.state.player.y), 'dropped at the player');
  // Equipment changes damage: dagger (+1) against a goblin (defense 1): 5 + 1 - 1 = 5; chain (+2) reduces a goblin hit to max(1, 3 - 3) = 1.
  const fight = createGame({ seed: 1, map: ROOM, player: { x: 1, y: 1 }, monsters: [{ type: 'goblin', x: 2, y: 1 }] });
  fight.state.player.equipment.weapon = { kind: 'dagger', name: 'dagger' }; fight.state.player.equipment.armor = { kind: 'chain', name: 'chain mail' };
  messages = fight.act({ type: 'move', dx: 1, dy: 0 });
  assert.ok(messages.includes('You hit the goblin for 5.'), messages.join(' | ')); assert.ok(messages.includes('The goblin hits you for 1.'), messages.join(' | '));
  // Capacity: 10 items, the eleventh stays on the floor without a turn.
  const full = createGame({ seed: 1, map: ROOM, player: { x: 1, y: 1 }, items: [{ kind: 'potion', x: 1, y: 1 }] });
  full.state.player.inventory = Array.from({ length: 10 }, () => ({ kind: 'dagger', name: 'dagger' }));
  const before = full.state.turn;
  messages = full.act({ type: 'pickup' });
  assert.equal(full.state.turn, before); assert.equal(full.state.items.length, 1); assert.ok(messages.includes('Your pack is full.'));
});

test('stairs, depths, the amulet, death and the end of the game', () => {
  const game = createGame({ seed: 4 });
  const level = mapModule.generateLevel((4 + 7919) >>> 0, 1);
  game.state.player.x = level.stairs.x; game.state.player.y = level.stairs.y;
  const messages = game.act({ type: 'descend' });
  assert.ok(messages.includes('You descend to depth 2.'), messages.join(' | '));
  assert.equal(game.state.depth, 2); assert.equal(game.state.turn, 1);
  const second = mapModule.generateLevel((4 + 2 * 7919) >>> 0, 2);
  assert.deepEqual(game.state.tiles, second.tiles); assert.deepEqual({ x: game.state.player.x, y: game.state.player.y }, second.start);
  assert.equal(game.state.monsters.length, 7); assert.equal(game.state.items.length, 5);
  assert.ok(game.state.monsters.every(m => ['rat', 'goblin', 'skeleton'].includes(m.type)));
  assert.equal(game.state.explored.filter(row => row.includes('1')).length > 0, true);
  assert.ok(game.state.explored.flatMap(row => row.split('')).filter(c => c === '1').length <= 250, 'explored starts over');
  // Straight to the bottom.
  for (const depth of [3, 4, 5]) {
    const here = mapModule.generateLevel((4 + (depth - 1) * 7919) >>> 0, depth - 1);
    game.state.player.x = here.stairs.x; game.state.player.y = here.stairs.y; game.state.monsters = [];
    game.act({ type: 'descend' });
    assert.equal(game.state.depth, depth);
  }
  assert.ok(!game.state.tiles.join('').includes('>'), 'the last depth has no stairs');
  assert.equal(game.state.monsters.length, 13); assert.ok(game.state.monsters.every(m => ['orc', 'troll'].includes(m.type)));
  const bottom = mapModule.generateLevel((4 + 5 * 7919) >>> 0, 5);
  const amulet = game.state.items.find(i => i.kind === 'amulet');
  assert.ok(amulet && amulet.x === bottom.stairs.x && amulet.y === bottom.stairs.y, 'the amulet lies on the stairs spot');
  assert.equal(game.state.items.length, 9, '3 + 5 items plus the amulet');
  game.state.player.x = amulet.x; game.state.player.y = amulet.y; game.state.monsters = [];
  const win = game.act({ type: 'pickup' });
  assert.equal(game.state.status, 'won'); assert.ok(win.includes('You found the Amulet of Yendor! You win.'));
  assert.deepEqual(game.act({ type: 'wait' }), []); assert.equal(game.state.turn, 5, 'nothing moves after the end');
  const doom = createGame({ seed: 1, map: ROOM, player: { x: 1, y: 1 }, monsters: [{ type: 'troll', x: 2, y: 1 }] });
  doom.state.player.hp = 7;
  const last = doom.act({ type: 'wait' });
  assert.equal(doom.state.status, 'dead'); assert.equal(doom.state.player.hp, 0); assert.ok(last.includes('You die.'));
  assert.deepEqual(doom.act({ type: 'move', dx: 1, dy: 0 }), []);
});

test('keys, scripts, serialization, hashes and determinism', () => {
  const a = createGame({ seed: 77 }), b = createGame({ seed: 77 });
  assert.equal(a.hash(), b.hash()); assert.match(a.hash(), /^[0-9a-f]{8}$/);
  const script = 'hjklyubn..g>1hhhjjjkkklll....yyyuuubbbnnn..';
  runScript(a, script); runScript(b, script);
  assert.equal(a.hash(), b.hash(), 'same seed and script, same state');
  assert.ok(a.state.turn > 10);
  assert.notEqual(createGame({ seed: 78 }).hash(), createGame({ seed: 77 }).hash());
  const c = createGame({ seed: 77 });
  runScript(c, script.slice(0, 20));
  const restored = loadGame(c.serialize());
  assert.equal(restored.hash(), c.hash(), 'save and load keep the state');
  runScript(restored, script.slice(20)); runScript(c, script.slice(20));
  assert.equal(restored.hash(), c.hash(), 'and the future');
  assert.equal(restored.hash(), a.hash());
  const k = createGame({ seed: 1, map: ROOM, player: { x: 1, y: 1 } });
  assert.equal(applyKey(k, 'x'), null, 'unknown keys are not actions');
  assert.ok(Array.isArray(applyKey(k, 'l'))); assert.deepEqual([k.state.player.x, k.state.player.y], [2, 1]);
  applyKey(k, 'j'); assert.deepEqual([k.state.player.x, k.state.player.y], [2, 2]);
  applyKey(k, 'k'); assert.deepEqual([k.state.player.x, k.state.player.y], [2, 1]);
  applyKey(k, 'n'); assert.deepEqual([k.state.player.x, k.state.player.y], [3, 2]);
  applyKey(k, 'y'); assert.deepEqual([k.state.player.x, k.state.player.y], [2, 1]);
  applyKey(k, 'b'); assert.deepEqual([k.state.player.x, k.state.player.y], [1, 2]);
  applyKey(k, 'u'); assert.deepEqual([k.state.player.x, k.state.player.y], [2, 1]);
  applyKey(k, 'h'); assert.deepEqual([k.state.player.x, k.state.player.y], [1, 1]);
  applyKey(k, '.'); assert.equal(k.state.turn, 9);
});

test('random play keeps every invariant', () => {
  const keys = 'hjklyubnhjklyubn....gg>12';
  for (const seed of [101, 102, 103, 104, 105, 106]) {
    const random = mulberry(seed);
    const game = createGame({ seed });
    let lastTurn = 0;
    for (let i = 0; i < 400 && game.state.status === 'playing'; i++) {
      const before = game.state.turn;
      const messages = applyKey(game, keys[Math.floor(random() * keys.length)]);
      const s = game.state;
      assert.ok(Array.isArray(messages));
      assert.ok(s.turn === before || s.turn === before + 1, 'a key costs at most one turn');
      assert.ok(s.turn >= lastTurn); lastTurn = s.turn;
      assert.ok(passable(s.tiles, s.player.x, s.player.y), 'player on a passable tile');
      assert.ok(s.player.hp <= s.player.maxHp && (s.status === 'dead' ? s.player.hp === 0 : s.player.hp > 0), 'hp within bounds');
      assert.ok(s.player.inventory.length <= 10); assert.ok(s.player.xp >= 0 && s.player.gold >= 0 && s.depth >= 1 && s.depth <= 5);
      const spots = new Set();
      for (const m of s.monsters) {
        assert.ok(passable(s.tiles, m.x, m.y), 'monster on a passable tile'); assert.ok(m.hp > 0 && m.hp <= m.maxHp);
        assert.ok(!(m.x === s.player.x && m.y === s.player.y), 'monster on the player'); assert.ok(!spots.has(key(m.x, m.y)), 'monsters overlap'); spots.add(key(m.x, m.y));
      }
      for (const item of s.items) assert.ok(passable(s.tiles, item.x, item.y));
      assert.ok(s.visible.includes(key(s.player.x, s.player.y)) || s.status !== 'playing');
      assert.ok(s.log.length <= 50);
      const explored = s.explored.map(row => row.split(''));
      for (const v of s.visible) { const [x, y] = v.split(',').map(Number); assert.equal(explored[y][x], '1', 'visible tiles are explored'); }
      JSON.stringify(s);
    }
  }
});

test('the page loads in headless Chrome without errors and shows the HUD', async () => {
  const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  await stat(chrome);
  const run = async (query) => {
    const args = ['--headless=new', '--allow-file-access-from-files', '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--window-size=1280,720',
      '--enable-logging=stderr', '--v=0', '--virtual-time-budget=4000', '--dump-dom', pathToFileURL(join(root, 'index.html')).href + query];
    const { stdout, stderr } = await promisify(execFile)(chrome, args, { maxBuffer: 64 * 1024 * 1024 });
    const errors = stderr.split('\n').filter(line => /CONSOLE/.test(line) && (/:ERROR:CONSOLE/.test(line) || /"Uncaught /.test(line) || /Access to script/.test(line) || /Failed to load/.test(line)));
    return { dom: stdout, errors };
  };
  const fresh = await run('?seed=3');
  assert.deepEqual(fresh.errors, [], 'no page errors');
  const hud = hudText(fresh.dom);
  assert.match(hud, /HP 30\/30/); assert.match(hud, /Depth 1/); assert.match(hud, /Turn 0/);
  assert.ok(/id="log"/.test(fresh.dom), 'a log element');
  const played = await run('?seed=3&script=' + encodeURIComponent('hjkl....'));
  assert.deepEqual(played.errors, []);
  const after = hudText(played.dom);
  assert.match(after, /Turn [1-9]/, 'the script ran before the first frame: ' + after);
});

test('source rules: no eval, vm, child processes or extra network; three.js from the pinned URL', async () => {
  const files = [];
  const walk = async (dir) => { for (const name of await readdir(dir)) { const path = join(dir, name); if ((await stat(path)).isDirectory()) { if (name !== 'node_modules') await walk(path); } else if (/\.(m?js|html)$/.test(name)) files.push(path); } };
  await walk(join(root, 'src'));
  files.push(join(root, 'index.html'));
  // Comments are not code: a remark that says "no Math.random" must not count as a call.
  const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
  for (const file of files) {
    const text = stripComments(await readFile(file, 'utf8'));
    assert.doesNotMatch(text, /\beval\s*\(|new\s+Function\s*\(|node:vm\b|child_process|require\s*\(/, 'forbidden API in ' + file);
    if (/\/src\/(rng|map|fov|path|game)\.js$/.test(file)) assert.doesNotMatch(text, /Math\.random|Date\.now|new Date\(|performance\.now/, 'the core reads the clock or Math.random in ' + file);
    const urls = [...text.matchAll(/https?:\/\/[^\s"'`)]+/g)].map(m => m[0]);
    for (const url of urls) assert.ok(url.startsWith('https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js') || /threejs\.org|github\.com|developer\.mozilla|example\.com/.test(url), 'network reference in ' + file + ': ' + url);
  }
  const html = await readFile(join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js'), 'three.js from the pinned URL');
  assert.ok(/type="module"[^>]*src="\.?\/?src\/main\.js"|src="\.?\/?src\/main\.js"[^>]*type="module"/.test(html), 'src/main.js as a module script');
  const main = await readFile(join(root, 'src', 'main.js'), 'utf8');
  assert.ok(/window\.game\s*=/.test(main) || /globalThis\.game\s*=/.test(main), 'window.game exposed');
});

test('the repository\'s own tests pass', async () => { const { stdout } = await promisify(execFile)('npm', ['test'], { cwd: root, env: testEnv() }); assert.match(stdout + '', /(?:#|ℹ) pass \d+/); assert.doesNotMatch(stdout + '', /(?:#|ℹ) fail [1-9]/); });
