// Rasterise the office characters (the same art as the pane) into palette-indexed 32x48 frames for the taskbar widget.
//   node art-source/taskbar-sprites.mjs   -> plugins/van-phong-pixel/taskbar/sprites.json
import fs from 'node:fs';
const root = new URL('../plugins/van-phong-pixel/', import.meta.url);
const { ASSETS: A } = await import(new URL('hooks/assets.ts', root));
const W = 32, H = 48;

// paths are pixel runs: "M x y h w v h h -w" chains (relative m between runs)
function blend(under, c) {
  if (!under) return null;   // a shadow on nothing stays nothing
  const a = parseInt(c.slice(7), 16) / 255, h = (s, i) => parseInt(s.slice(i, i + 2), 16);
  return '#' + [1, 3, 5].map(i => Math.round(h(under, i) * (1 - a) + h(c, i) * a).toString(16).padStart(2, '0')).join('');
}
function paint(grid, markup) { paintBox(grid, markup, W, H); }
function paintBox(grid, markup, W, H = W, ox = 0, oy = 0) {
  for (const m of markup.matchAll(/<path fill="([^"]+)" d="([^"]+)"\/>/g)) {
    const col = m[1].length === 4 ? '#' + [...m[1].slice(1)].map(c => c + c).join('') : m[1];
    const tok = m[2].match(/[A-Za-z]|-?\d+(?:\.\d+)?/g); let i = 0, x = 0, y = 0;
    const num = () => Number(tok[i++]);
    while (i < tok.length) {
      const c = tok[i++];
      if (c === 'M') { x = num(); y = num(); }
      else if (c === 'm') { x += num(); y += num(); }
      else if (c === 'h' && tok[i + 1] === 'v') {
        const w = num(); i++; const h = num(); i++; const w2 = num();
        for (let yy = y - oy; yy < y - oy + h; yy++) for (let xx = x - ox; xx < x - ox + w; xx++) if (xx >= 0 && xx < W && yy >= 0 && yy < H) grid[yy][xx] = col.length === 9 ? blend(grid[yy][xx], col) : col;
        x += w + w2; y += h;
      } else throw new Error('path command ' + c);
    }
  }
}
const out = {};
for (const [who, frames] of Object.entries(A.chars)) {
  const pal = [], idx = (c) => { let k = pal.indexOf(c); if (k < 0) { k = pal.length; pal.push(c); } return k; };
  const fr = {};
  for (const [name, bands] of Object.entries(frames)) {
    const grid = Array.from({ length: H }, () => Array(W).fill(null));
    for (const b of name === 'blink' ? [...frames.normal, ...bands] : bands) paint(grid, A.bands[b]);   // blink is a head overlay on 'normal'
    // one string per row: '.' = transparent, else a palette index as a base-36 digit (palettes stay under 36 colours)
    fr[name] = grid.map(row => row.map(c => (c ? idx(c).toString(36) : '.')).join(''));
  }
  if (pal.length > 36) throw new Error(who + ': palette over 36 colours');
  out[who] = { pal, frames: fr };
}
// the boss room of the office, cut out of the pane's own art as a rectangle: floor/wall patterns, then bg (behind the
// boss), then fg (the desk, in front of the boss).
// Status bubbles (b_ok/b_wait/b_err) come along for the effects.
{
  const X = 352, Y = 70, DW = 160, DH = 170;
  const pal = [];
  // the room has well over 89 colours (the books): its rows are palette indexes, -1 = transparent
  const enc = (g) => g.map(r => r.map(c => { if (!c) return -1; let i = pal.indexOf(c); if (i < 0) { i = pal.length; pal.push(c); } return i; }));
  const blank = (w, h) => Array.from({ length: h }, () => Array(w).fill(null));
  const comp = (X, Y, DW, DH) => {   // patterns + bg of an area of the office
    const g = blank(DW, DH);
    for (const p of A.pats) {
      const tile = blank(p.w, p.h); paintBox(tile, p.svg, p.w, p.h);
      for (const [ax0, ay0, aw, ah] of p.areas) for (let y = 0; y < DH; y++) for (let x = 0; x < DW; x++) {
        const ax = x + X, ay = y + Y;
        if (ax >= ax0 && ax < ax0 + aw && ay >= ay0 && ay < ay0 + ah) g[y][x] = tile[(ay - p.y) % p.h][(ax - p.x) % p.w] ?? g[y][x];
      }
    }
    paintBox(g, A.bg, DW, DH, X, Y); return g;
  };
  const bg = comp(X, Y, DW, DH), fg = blank(DW, DH); paintBox(fg, A.fg, DW, DH, X, Y);
  // a shorter desk (x 36..119 instead of ..143): the boss walks round its right end without passing through it.
  // Columns 96..119 of the desk (plain drawer front) go; everything right of them moves 24 px left.
  for (const r of fg) { r.splice(96, 24); r.push(...Array(24).fill(null)) }
  // the big plant moves back into the corner: lift its pixels out (whatever is not floor, counter or rug), mend the rug
  // corner it stood on from the rug's mirror image (the rug is symmetric about x = 81.5), and put it back 14 rows higher
  // (below, after the shelves, so it stands in front of them)
  const PLANT = []
  { const ground = new Set()
    for (let y = 8; y < 61; y++) for (let x = 0; x < 16; x++) ground.add(bg[y][x])
    for (let y = 40; y < 61; y++) for (let x = 16; x < 56; x++) ground.add(bg[y][x])
    for (let y = 8; y < 61; y++) for (let x = 124; x < DW; x++) if (!ground.has(bg[y][x])) PLANT.push([x, y, bg[y][x]])
    for (let y = 42; y < 61; y++) for (let x = 124; x < DW; x++) bg[y][x] = bg[y][163 - x] }
  // a library wall behind the boss: three of the pane's bookshelves side by side along the back wall, standing on the
  // floor line just behind the rug (only their lower shelves show under the room's top edge, as in the pane); the
  // boss's chair stands in front of them, so its pixels are kept
  { const CHAIR = new Set(['#4a2018', '#2a0f0a', '#8a4030', '#6b2e22', '#c08a4a'])
    // a touch quieter so the shelves sit back behind the boss: a quarter less colour, 15 % toward dark brown
    const mute = (c) => { const v = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)), g = (v[0] + v[1] + v[2]) / 3, d = [42, 30, 30]
      return '#' + v.map((x, i) => Math.round((x * 0.75 + g * 0.25) * 0.85 + d[i] * 0.15).toString(16).padStart(2, '0')).join('') }
    const put = (sx, sy, w, h, dx, dy) => {
      const g = blank(w, h); paintBox(g, A.bg, w, h, sx, sy); paintBox(g, A.fg, w, h, sx, sy)
      g.forEach((r, y) => r.forEach((c, x) => { const Y = y + dy, X = x + dx
        if (c && Y >= 0 && Y < DH && X < DW && !CHAIR.has(bg[Y][X])) bg[Y][X] = mute(c) })) }
    put(180, 86, 44, 46, 0, 0); put(226, 86, 42, 46, 44, 0); put(180, 86, 42, 46, 86, 0); put(180, 86, 32, 46, 128, 0) }
  for (const [x, y, c] of PLANT) if (y - 14 >= 0) bg[y - 14][x] = c   // the plant, in the corner in front of the shelves
  // a loose white sheet floated above the side cabinet's corner: give those pixels back to the wall behind it
  for (let y = 76; y <= 81; y++) for (let x = 142; x <= 147; x++) bg[y][x] = bg[75][x];
  const bub = {}; for (const k of ['ok', 'wait', 'err']) { const g = blank(32, 32); paintBox(g, A.props['b_' + k], 32, 32); bub[k] = enc(g); }
  // top: the room's coordinates in the widget code start at office y 70 (the old crop), so the wall sits at negative y
  out.desk = { bg: enc(bg), fg: enc(fg), bub, pal, boss: [422 - X, 140 - Y] };   // boss seat = scene.ts HOME.boss (211,70) x2
  if (bg.some(r => r.some(c => !c))) console.warn('desk: some background pixels are empty');
}
fs.mkdirSync(new URL('taskbar/', root), { recursive: true });
fs.writeFileSync(new URL('taskbar/sprites.json', root), JSON.stringify(out));
// self-check: every frame is 48 rows of 32 and has some pixels
for (const [who, c] of Object.entries(out)) if (A.chars[who]) for (const [n, rows] of Object.entries(c.frames)) {
  if (rows.length !== H || rows.some(r => r.length !== W) || !rows.join('').replace(/\./g, '')) throw new Error(`bad frame ${who}.${n}`);
}
console.log('sprites:', Object.keys(out).filter(w => A.chars[w]).map(w => `${w}(${Object.keys(out[w].frames).length})`).join(' '));
