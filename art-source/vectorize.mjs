// Pixel buffer -> compact SVG paths (one <path> per colour, greedy 2D rectangle merge).
export function toPaths(pix, { quant = 0 } = {}) {
  const { w, h, d } = pix, key = new Array(w * h);
  const q = (v) => quant ? Math.min(255, Math.round(v / quant) * quant) : v;
  for (let i = 0; i < w * h; i++) {
    const a = d[i * 4 + 3]; if (a < 8) { key[i] = null; continue; }
    const hx = (v) => q(v).toString(16).padStart(2, '0');
    key[i] = '#' + hx(d[i * 4]) + hx(d[i * 4 + 1]) + hx(d[i * 4 + 2]) + (a < 250 ? hx(a) : '');
  }
  const used = new Uint8Array(w * h), byColor = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, c = key[i]; if (!c || used[i]) continue;
    let rw = 1; while (x + rw < w && key[i + rw] === c && !used[i + rw]) rw++;
    let rh = 1; outer: while (y + rh < h) { for (let k = 0; k < rw; k++) { const j = (y + rh) * w + x + k; if (key[j] !== c || used[j]) break outer; } rh++; }
    for (let yy = 0; yy < rh; yy++) for (let k = 0; k < rw; k++) used[(y + yy) * w + x + k] = 1;
    if (!byColor.has(c)) byColor.set(c, []);
    byColor.get(c).push(`M${x} ${y}h${rw}v${rh}h-${rw}z`);
  }
  let out = '';
  for (const [c, parts] of byColor) out += `<path fill="${shortHex(c)}" d="${parts.join('')}"/>`;
  return out;
}
const shortHex = (c) => (c.length === 7 && c[1] === c[2] && c[3] === c[4] && c[5] === c[6]) ? '#' + c[1] + c[3] + c[5] : c;
