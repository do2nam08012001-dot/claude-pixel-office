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
  const ABC = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+,-/:;<=>?@[]^_{|}~', pal = [];
  const enc = (g) => g.map(r => r.map(c => { if (!c) return '.'; let i = pal.indexOf(c); if (i < 0) { i = pal.length; pal.push(c); } return ABC[i]; }).join(''));
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
  const bub = {}; for (const k of ['ok', 'wait', 'err']) { const g = blank(32, 32); paintBox(g, A.props['b_' + k], 32, 32); bub[k] = enc(g); }
  // top: the room's coordinates in the widget code start at office y 70 (the old crop), so the wall sits at negative y
  out.desk = { bg: enc(bg), fg: enc(fg), bub, pal, boss: [422 - X, 140 - Y] };   // boss seat = scene.ts HOME.boss (211,70) x2
  if (pal.length > ABC.length) throw new Error('desk palette ' + pal.length + ' over ' + ABC.length);
  if (bg.some(r => r.some(c => !c))) console.warn('desk: some background pixels are empty');
}
fs.mkdirSync(new URL('taskbar/', root), { recursive: true });
fs.writeFileSync(new URL('taskbar/sprites.json', root), JSON.stringify(out));
// self-check: every frame is 48 rows of 32 and has some pixels
for (const [who, c] of Object.entries(out)) if (A.chars[who]) for (const [n, rows] of Object.entries(c.frames)) {
  if (rows.length !== H || rows.some(r => r.length !== W) || !rows.join('').replace(/\./g, '')) throw new Error(`bad frame ${who}.${n}`);
}
console.log('sprites:', Object.keys(out).filter(w => A.chars[w]).map(w => `${w}(${Object.keys(out[w].frames).length})`).join(' '));
