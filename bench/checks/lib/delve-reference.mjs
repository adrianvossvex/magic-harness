// Reference algorithms for the DELVE checks: the field of view exactly as the task specifies it (Bresenham lines),
// a breadth-first shortest path (its length is the unique right answer), a seeded generator for random play.
export function* bresenham(x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    yield [x0, y0];
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
export function referenceFov(tiles, x, y, radius) {
  const visible = new Set();
  for (let ty = 0; ty < tiles.length; ty++) for (let tx = 0; tx < tiles[0].length; tx++) {
    const dx = tx - x, dy = ty - y;
    if (dx * dx + dy * dy > radius * radius) continue;
    let clear = true;
    for (const [px, py] of bresenham(x, y, tx, ty)) { if (px === tx && py === ty) break; if (tiles[py][px] === '#') { clear = false; break; } }
    if (clear) visible.add(tx + ',' + ty);
  }
  return visible;
}
const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
export const passable = (tiles, x, y) => y >= 0 && y < tiles.length && x >= 0 && x < tiles[0].length && tiles[y][x] !== '#';
export function shortestLength(tiles, from, to, blocked = []) {
  const key = (x, y) => x + ',' + y;
  const block = new Set(blocked.map(b => key(b.x, b.y))); block.delete(key(to.x, to.y));
  if (!passable(tiles, to.x, to.y)) return null;
  const dist = new Map([[key(from.x, from.y), 0]]);
  const queue = [[from.x, from.y]];
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    const d = dist.get(key(x, y));
    if (x === to.x && y === to.y) return d;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (dist.has(k) || !passable(tiles, nx, ny) || block.has(k)) continue;
      dist.set(k, d + 1); queue.push([nx, ny]);
    }
  }
  return null;
}
export function reachable(tiles, from) {
  const key = (x, y) => x + ',' + y;
  const seen = new Set([key(from.x, from.y)]);
  const queue = [[from.x, from.y]];
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy, k = key(nx, ny); if (!seen.has(k) && passable(tiles, nx, ny)) { seen.add(k); queue.push([nx, ny]); } }
  }
  return seen;
}
export function mulberry(seed) {
  let state = seed >>> 0;
  return () => { let t = (state += 0x6D2B79F5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
