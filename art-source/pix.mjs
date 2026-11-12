// Tiny pixel canvas + PNG encoder (build-time only; the mod embeds the results as data URIs)
import zlib from 'node:zlib';
const hex = (c) => { if (!c) return null; const n = c.replace('#', ''); const v = parseInt(n.slice(0, 6), 16); return [v >> 16 & 255, v >> 8 & 255, v & 255, n.length === 8 ? parseInt(n.slice(6), 16) : 255]; };
export class Pix {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const [r, g, b, a] = typeof c === 'string' ? hex(c) : c; const i = (y * this.w + x) * 4;
    if (a === 255) { this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = 255; return; }
    const A = a / 255, B = this.d[i + 3] / 255, O = A + B * (1 - A); if (!O) return;
    this.d[i] = (r * A + this.d[i] * B * (1 - A)) / O; this.d[i + 1] = (g * A + this.d[i + 1] * B * (1 - A)) / O; this.d[i + 2] = (b * A + this.d[i + 2] * B * (1 - A)) / O; this.d[i + 3] = O * 255;
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); return this; }
  hline(x, y, w, c) { return this.rect(x, y, w, 1, c); }
  vline(x, y, h, c) { return this.rect(x, y, 1, h, c); }
  // outlined, shaded box: top face, front face, outline
  box(x, y, w, h, { top, front, line, topH = 3, hi }) {
    this.rect(x, y, w, h, line); this.rect(x + 1, y + 1, w - 2, topH, top); this.rect(x + 1, y + 1 + topH, w - 2, h - 2 - topH, front);
    if (hi) this.hline(x + 1, y + 1, w - 2, hi); return this;
  }
  map(x, y, rows, pal) { rows.forEach((row, j) => [...row].forEach((ch, i) => { const c = pal[ch]; if (c) this.set(x + i, y + j, c); })); return this; }
  png() {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y++) { raw[y * (this.w * 4 + 1)] = 0; Buffer.from(this.d.buffer, y * this.w * 4, this.w * 4).copy(raw, y * (this.w * 4 + 1) + 1); }
    const chunk = (t, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(t), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
    const ih = Buffer.alloc(13); ih.writeUInt32BE(this.w, 0); ih.writeUInt32BE(this.h, 4); ih[8] = 8; ih[9] = 6; ih[10] = 0; ih[11] = 0; ih[12] = 0;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  }
  uri() { return 'data:image/png;base64,' + this.png().toString('base64'); }
}
let T; function crc32(b) { if (!T) { T = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c; } } let c = -1; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return c ^ -1; }
