Build DELVE, a turn-based roguelike, in this repository: a deterministic game core in plain JavaScript (ES modules, Node 22+, no dependencies) with its own tests, and a 3D renderer for the browser built on three.js. Follow every rule below exactly; the core is driven by automated checks, and the rules below are the contract they check. Where the rules leave something open, decide, keep it consistent everywhere, and write it down.

# 1. Files and boundaries

- `package.json` exists (type module); add a "test" script so `npm test` runs every test with node:test. No dependencies of any kind, no build step.
- `src/` holds the core (pure JavaScript, no DOM, no timers, no randomness other than the seeded generator below) and the renderer. The core must run in Node; the renderer only in the browser.
- `index.html` at the root loads three.js from exactly this URL with a plain script tag: `https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js` (the global `THREE`). Nothing else is loaded from the network. The page loads `src/main.js` as a module script with a relative path and must work from a file:// URL in Chrome started with `--allow-file-access-from-files` (the screenshot tool and the checks do that) or from any static file server; no build step, no bundler.
- Never use eval, new Function, node:vm, child_process, or dynamic code loading. The core modules (rng, map, fov, path, game) must not read the clock or Math.random; the page may use Math.random only to pick the seed of a new game.
- A custom tool named `screenshot` is available in this project: it opens an HTML file in headless Chrome, returns a screenshot and the page's console messages and errors. Use it whenever you change the page or the renderer; a page with console errors is not done.

# 2. Random numbers (`src/rng.js`)

`createRng(seed)` returns a generator implementing mulberry32 over the 32-bit unsigned seed `seed >>> 0`:

```
next(): state = (state + 0x6D2B79F5) >>> 0; t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
```

`next()` returns a float in [0, 1); `int(max)` returns `Math.floor(next() * max)` (an integer in [0, max)); `pick(array)` returns `array[int(array.length)]`; `state` is readable and writable (the 32-bit unsigned number, always kept in that range), so a game can serialize it and restore it. For seed 123 the first three `next()` values are 0.7872516233474016, 0.1785435655619949, 0.49531551403924823.

# 3. Levels (`src/map.js`)

`generateLevel(seed, depth)` returns `{ width, height, tiles, rooms, start, stairs }`:

- `width` is 60 and `height` is 30. `tiles` is an array of `height` strings of `width` characters: `#` wall, `.` floor, `>` stairs down. Every tile on the outer border is a wall.
- Between 6 and 12 rooms: `rooms` is an array of `{ x, y, w, h }` describing rectangles of floor tiles (w and h between 3 and 10). Rooms never touch: for any two rooms there is at least one wall tile between them in every direction (the rectangles enlarged by one tile do not overlap). Rooms are connected by corridors of floor tiles.
- Every floor tile (and the stairs) is reachable from `start` by 8-directional movement over non-wall tiles.
- `start` is a floor tile inside the first room; `stairs` is a tile inside another room: the room whose centre `(x + w / 2, y + h / 2)` is farthest from `start` (Euclidean distance; the first such room in `rooms` on a tie). For depth below 5 the stairs tile is `>`; on depth 5 (the last one) there is no `>` anywhere and `stairs` is a plain floor tile where the Amulet lies.
- The same seed and depth always produce the identical level; generation uses only `createRng(seed)`.

Passable tiles are `.` and `>`. Everything else in this document that says "adjacent" or "step" means the 8 neighbouring tiles (Chebyshev distance 1), diagonals included, with no corner-cutting rule.

# 4. Field of view (`src/fov.js`)

`computeFov(tiles, x, y, radius)` returns a Set of strings `"x,y"` of the visible tiles, defined exactly like this: a tile T is visible from the origin O when its Euclidean distance satisfies dx*dx + dy*dy <= radius*radius and every tile on the Bresenham line from O to T, excluding T itself, is not a wall. The origin is always visible. Walls are visible when the line reaches them. The Bresenham line is the integer algorithm:

```
dx = |x1 - x0|; dy = -|y1 - y0|; sx = x0 < x1 ? 1 : -1; sy = y0 < y1 ? 1 : -1; err = dx + dy;
loop: visit (x0, y0); if (x0 == x1 && y0 == y1) stop; e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
```

# 5. Pathfinding (`src/path.js`)

`findPath(tiles, from, to, blocked = [])` returns the shortest path from `from` to `to` as an array of `{ x, y }` steps, excluding the start and including the target, moving 8-directionally over passable tiles; `blocked` is a list of `{ x, y }` tiles that count as impassable (except the target itself). It returns `null` when there is no path. Any shortest path is acceptable; its length must be minimal.

# 6. The game (`src/game.js`)

`createGame(options)` creates a game. `options.seed` (integer, default 1) seeds everything. Without a fixture the game generates depth 1 with `generateLevel(levelSeed(seed, 1), 1)` where `levelSeed(seed, depth) = (seed + depth * 7919) >>> 0`, places the player at `start`, and populates the level (section 8). With a fixture the level is exactly what the caller says: `options.map` is an array of row strings (any size, same characters), `options.player` is `{ x, y }`, `options.monsters` is an array of `{ type, x, y }`, `options.items` an array of `{ kind, x, y, amount? }`; a fixture level gets no generated monsters or items and no stairs unless the map contains `>`.

`game.state` is a plain, JSON-serialisable object with at least these fields (extra fields are allowed):

```
{ seed, depth, turn, status,             // status: "playing" | "dead" | "won"
  width, height, tiles,                   // tiles: array of row strings
  visible, explored,                      // visible: array of "x,y" strings; explored: array of row strings of "0"/"1"
  player: { x, y, hp, maxHp, attack, defense, level, xp, gold, inventory, equipment: { weapon, armor } },
  monsters: [ { id, type, x, y, hp, maxHp, attack, defense, xp } ],
  items: [ { id, kind, x, y, amount } ],  // amount only for gold
  log }                                   // array of strings, the most recent last, at most 50 kept
```

The player starts with hp 30, maxHp 30, attack 5, defense 1, level 1, xp 0, gold 0, an empty inventory and no equipment. `visible` is recomputed after every action with `computeFov` from the player's tile with radius 8; `explored` marks every tile that has ever been visible.

`game.act(action)` performs one player action; when the action costs a turn, `turn` increases by one and then every monster takes its turn (section 7). It returns the array of log messages the action produced. Actions:

- `{ type: "move", dx, dy }` with dx, dy in -1..1, not both 0. Into a passable tile with no monster: the player moves (costs a turn). Into a monster: the player attacks it (costs a turn). Into a wall or off the map: nothing happens, no turn, a message such as "There is a wall in the way."
- `{ type: "wait" }`: costs a turn.
- `{ type: "pickup" }`: picks up the items on the player's tile. Gold is never stored: it adds `amount` to `player.gold` (message "You pick up N gold."). The Amulet ends the game: status becomes "won", message "You found the Amulet of Yendor! You win." Every other item goes to the inventory as `{ kind, name }`, which holds at most 10 items; an item that does not fit stays on the floor with the message "Your pack is full." The action costs a turn when at least one item was picked up. With nothing on the tile: no turn, message "There is nothing here."
- `{ type: "use", index }`: uses inventory item `index` (0-based). A potion heals 10 hp, capped at maxHp, and is consumed. A weapon or armor is equipped into the matching slot; the item previously in that slot, if any, returns to the inventory. Costs a turn. An invalid index: no turn, a message.
- `{ type: "drop", index }`: moves the inventory item to the floor at the player's tile (costs a turn). Invalid index: no turn.
- `{ type: "descend" }`: only on a `>` tile; otherwise no turn and a message. On the stairs: depth increases by one, the new level is `generateLevel(levelSeed(seed, depth), depth)` populated per section 8, the player stands on its `start`, visible and explored start over, turn continues counting; the message is "You descend to depth N." It costs a turn, so the new level's monsters act once (none of them starts next to the player).

When status is not "playing", `act` changes nothing and returns [].

Combat is deterministic. The player's effective attack is `attack` plus the equipped weapon's bonus (dagger 1, sword 3); effective defense is `defense` plus the equipped armor's bonus (leather 1, chain 2). Damage dealt = max(1, attacker's effective attack - defender's effective defense). A monster whose hp reaches 0 or less is removed, the player gains its xp, message "You kill the <type>." (before that, "You hit the <type> for N."). A monster attacking the player: message "The <type> hits you for N."; when the player's hp reaches 0 or less, hp is 0, status becomes "dead", message "You die."

Levels: after gaining xp, while `xp >= threshold(level + 1)` with `threshold(L) = 5 * L * (L - 1)` (level 2 at 10 xp, level 3 at 30, level 4 at 60, level 5 at 100): level increases by one, maxHp increases by 5, hp increases by 5 (capped at the new maxHp), attack increases by 1, message "Welcome to level N."

`game.serialize()` returns a JSON string; `loadGame(json)` returns a game whose state and future behaviour are identical to the original (include the rng state). `game.hash()` returns a string: FNV-1a 32-bit hash, as 8 lowercase hex digits, of `JSON.stringify` of the state with every object's keys sorted recursively.

`applyKey(game, key)` maps one key to an action and performs it, returning the messages, or `null` for a key that is not an action: h j k l y u b n move (h left, l right, k up, j down, y up-left, u up-right, b down-left, n down-right; up means y - 1), `.` wait, `g` pickup, `>` descend, digits `1`..`9` use inventory item 0..8. `runScript(game, text)` applies the characters of `text` in order, skipping whitespace and unknown characters.

# 7. Monsters

| type | hp | attack | defense | xp | sight |
|---|---|---|---|---|---|
| rat | 4 | 2 | 0 | 3 | 5 |
| goblin | 8 | 3 | 1 | 6 | 6 |
| skeleton | 12 | 4 | 2 | 10 | 6 |
| orc | 18 | 6 | 2 | 15 | 7 |
| troll | 30 | 8 | 3 | 30 | 7 |

After each turn-costing player action, monsters act in increasing `id` order, one step or attack each. A monster adjacent to the player attacks. Otherwise, when the player's tile is in `computeFov` from the monster's tile with the monster's sight radius, it takes one step along `findPath` toward the player, treating other monsters as blocked; when no path exists it stays. Otherwise it wanders: with probability one half it stays, else it moves to a random adjacent passable tile that holds no monster and not the player, chosen with the game's rng. Monsters never share a tile with each other or with the player and never enter walls.

# 8. Populating a generated level

On a generated level of depth d: 3 + 2d monsters, each of a type chosen with the rng from the types allowed at that depth (depth 1: rat, goblin; depth 2: rat, goblin, skeleton; depth 3: goblin, skeleton, orc; depth 4: skeleton, orc; depth 5: orc, troll), placed on distinct floor tiles outside the first room. 3 + d items on distinct floor tiles that hold no monster and are not the player's tile: each item is a potion with probability 0.4, gold with 0.3 (amount = 5 + int(16) coins), else one of dagger, sword, leather, chain with equal probability. On depth 5 an additional item of kind "amulet" lies on the level's `stairs` tile. Item ids and monster ids are unique within the game.

# 9. The page and the renderer

`index.html` plus `src/main.js` (a module) and whatever renderer modules you like:

- URL parameters: `seed` (integer) fixes the seed; `script` is a key string applied with `runScript` before the first frame. When either parameter is present the title screen is skipped and the game starts at once; otherwise a title screen with the game's name and controls waits for any key and the seed is random.
- A HUD element with id `hud` whose text contains `HP 30/30`, `Depth 1` and `Turn 0` at the start of a new game (and the current values afterwards), the player's level, xp and gold. A message log element with id `log` showing the last messages. An inventory panel toggled with `i`, listing items by number.
- Keyboard: the keys of section 6, plus arrow keys for the four directions, `R` to restart after death or victory, `?` for help. Death and victory screens.
- The renderer is three.js: floor tiles, walls with height, the stairs, the player and each monster type as distinct low-poly meshes or coloured shapes with a glyph label, items as small shapes; unexplored tiles are not drawn, explored tiles outside the current view are dimmed, visible tiles are lit; a light follows the player; the camera looks down at the player from above and behind and follows smoothly; a hit flashes the target and shakes the screen briefly, a kill spawns a short particle burst; monsters and the player move with a short tween rather than teleporting. A dark palette with a few strong accent colours. Optional: WebAudio beeps for hits and pickups.
- Expose the game as `window.game` for debugging.

# 10. Tests and documentation

Every core module has node:test tests in `test/`; cover generation constraints, field of view, paths, combat numbers, items, levels, stairs, serialization and determinism (the same seed and script give the same hash). Write a README.md: how to play, the controls, the architecture (modules, the state shape, how the renderer reads the state), and how to run the tests. npm test must pass.
