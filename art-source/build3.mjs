// v4 art, 256x256: background + foreground PNG layers and 16x24 character sprites with expressions -> assets2.json
import fs from 'node:fs';
import { Pix } from './pix.mjs';
const W = 256, H = 256;
const bg = new Pix(W, H), fg = new Pix(W, H);
const metal = { top: '#9AA6B2', front: '#7F8C99', line: '#3C4651', hi: '#B9C3CD' };

// ===== floors =====
function planks(x0, y0, w, h) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const ry = y - y0, row = Math.floor(ry / 7), seam = (x - x0 + row * 17) % 34 === 0;
    let c = ry % 7 === 0 ? '#93592F' : seam ? '#A2683A' : '#C1834F';
    if (ry % 7 === 1 && !seam) c = '#D0945E'; if (ry % 7 === 6) c = '#AE7140';
    bg.set(x, y, c);
  }
}
function tiles(x0, y0, w, h, a, b, g, s) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const gx = (x - x0) % s, gy = (y - y0) % s, chk = (Math.floor((x - x0) / s) + Math.floor((y - y0) / s)) % 2;
    bg.set(x, y, gx === 0 || gy === 0 ? g : chk ? a : b); if (gx === 1 || gy === 1) bg.set(x, y, '#FFFFFF22');
  }
}
planks(0, 44, W, 88);
// corridor 128-158
bg.rect(0, 128, W, 30, '#D7C9AE'); for (let x = 0; x < W; x += 16) bg.vline(x, 128, 30, '#C9BA9C');
bg.rect(0, 133, W, 20, '#34436A'); bg.hline(0, 134, W, '#D1AE55'); bg.hline(0, 151, W, '#D1AE55'); bg.hline(0, 133, W, '#22304F'); bg.hline(0, 152, W, '#22304F');
for (let x = 6; x < W; x += 14) { for (const [dx, dy] of [[0, 0], [-1, 1], [1, 1], [-2, 2], [2, 2], [-1, 3], [1, 3], [0, 4]]) bg.set(x + dx, 140 + dy, '#D1AE55'); bg.set(x, 142, '#E9CF86'); }
// lower floors 168-256
tiles(0, 156, 86, 100, '#6E7B88', '#67737F', '#4C5662', 12);
tiles(88, 156, 82, 100, '#B3E3D2', '#A6DAC8', '#83BFAA', 10);
for (let y = 156; y < H; y++) for (let x = 172; x < W; x++) bg.set(x, y, (y - 156) % 16 === 0 || (x - 172) % 28 === 0 ? '#A49987' : '#BDB2A2');
for (let i = 0; i < 4; i++) { bg.rect(10 + i * 18, 240, 12, 6, '#4C5662'); for (let k = 0; k < 4; k++) bg.hline(11 + i * 18, 241 + k, 10, k % 2 ? '#3A434D' : '#5A6571'); } // floor vents

// ===== back wall =====
bg.rect(0, 0, W, 34, '#F1E9DC'); for (let x = 0; x < W; x += 8) bg.vline(x, 0, 34, '#E8DECD'); 
bg.rect(0, 0, W, 2, '#D8CCB8'); bg.rect(0, 34, W, 9, '#B98A5C'); bg.hline(0, 34, W, '#D9AE80'); bg.hline(0, 35, W, '#C99A6C'); bg.rect(0, 41, W, 3, '#6E4A2C');
for (let x = 0; x < W; x += 20) { bg.vline(x, 36, 5, '#9F7148'); bg.vline(x + 1, 36, 5, '#C99A6C'); }
function windowAt(x, y, w, h) {
  bg.rect(x - 2, y - 2, w + 4, h + 4, '#5A3A1F'); bg.rect(x - 1, y - 1, w + 2, h + 2, '#8E6440');
  for (let j = 0; j < h; j++) bg.hline(x, y + j, w, j < h * .35 ? '#7CC6F2' : j < h * .65 ? '#9AD5F6' : '#B8E3F9');
  const bld = [[1, 10, 7, '#6F96B7'], [8, 15, 6, '#5F86A8'], [14, 8, 6, '#7FA6C4'], [20, 13, 7, '#6F96B7'], [27, 9, 5, '#5F86A8'], [32, 12, 6, '#7FA6C4']];
  for (const [bx, bh, bw, c] of bld) if (bx + bw <= w) { bg.rect(x + bx, y + h - bh, bw, bh, c); bg.vline(x + bx, y + h - bh, bh, '#4E7596'); for (let j = y + h - bh + 2; j < y + h - 1; j += 3) for (let i = x + bx + 2; i < x + bx + bw - 1; i += 2) bg.set(i, j, (i + j) % 5 ? '#D6EEFF' : '#FFF3B0'); }
  bg.vline(x + Math.floor(w / 2), y, h, '#5A3A1F'); bg.hline(x, y + Math.floor(h / 2), w, '#5A3A1F');
  bg.rect(x - 3, y + h + 2, w + 6, 3, '#D9AE80'); bg.hline(x - 3, y + h + 4, w + 6, '#9F7148');
  bg.rect(x - 6, y - 3, 4, h + 6, '#C0504D'); bg.rect(x + w + 2, y - 3, 4, h + 6, '#C0504D'); bg.vline(x - 5, y - 3, h + 6, '#D9706C'); bg.vline(x + w + 3, y - 3, h + 6, '#D9706C'); // curtains
}
windowAt(140, 5, 24, 22);
// whiteboard
bg.rect(5, 5, 58, 27, '#7E8A97'); bg.rect(6, 6, 56, 24, '#FBFCFD'); bg.rect(6, 30, 56, 2, '#B7C1CB'); bg.rect(14, 31, 10, 1, '#E53935'); bg.rect(26, 31, 8, 1, '#1E88E5');
[[8, 8, '#FFE066'], [15, 8, '#FF9AA2'], [8, 15, '#9AD1FF'], [15, 15, '#FFE066'], [8, 22, '#B9F2A1'], [15, 22, '#FFB86B']].forEach(([x, y, c]) => { bg.rect(x, y, 6, 6, c); bg.hline(x, y, 6, '#FFFFFF80'); bg.hline(x + 1, y + 3, 4, '#00000030'); bg.set(x + 5, y + 5, '#00000025'); });
for (let i = 0; i < 30; i++) bg.set(25 + i, 26 - Math.round(Math.sin(i / 4) * 2 + i / 5), '#E53935');
// bookshelves
function bookshelf(x, y, w, h) {
  bg.rect(x + 2, y + h, w, 2, '#00000035');
  bg.box(x, y, w, h, { top: '#A86E46', front: '#7A4A2E', line: '#3A2214', topH: 3, hi: '#C08458' });
  const cols = ['#E57373', '#64B5F6', '#81C784', '#FFB74D', '#BA68C8', '#4DB6AC', '#F06292', '#FFD54F', '#7986CB', '#A1887F', '#4DD0E1'];
  for (let sy = y + 5; sy < y + h - 6; sy += 10) {
    bg.rect(x + 2, sy, w - 4, 9, '#432614'); bg.hline(x + 2, sy + 9, w - 4, '#A86E46');
    let bx = x + 3, k = sy * 7 + x;
    while (bx < x + w - 4) { const bw = 2 + (k % 3 === 0 ? 1 : 0), bh = 6 + (k % 3); const c = cols[k % cols.length]; bg.rect(bx, sy + 9 - bh, bw, bh, c); bg.vline(bx, sy + 9 - bh, bh, '#00000030'); bg.set(bx + bw - 1, sy + 10 - bh, '#FFFFFF55'); bg.hline(bx, sy + 11 - bh, bw, '#FFFFFF40'); bx += bw + (k % 7 === 0 ? 2 : 0); k += 5; }
    if ((sy / 10) % 2 < 1) { bg.rect(x + w - 8, sy + 3, 4, 6, '#ECEFF1'); bg.hline(x + w - 8, sy + 3, 4, '#FFFFFF'); }
  }
}
bookshelf(90, 8, 22, 56); bookshelf(113, 8, 22, 56);
// chairman wall: certificates, trophy shelf, clock
for (const [x, c] of [[180, '#C9A44C'], [196, '#B0BEC5']]) { bg.rect(x, 8, 13, 16, c); bg.rect(x + 1, 9, 11, 14, '#FFFDF5'); bg.hline(x + 3, 12, 7, '#8D6E63'); bg.hline(x + 3, 15, 5, '#B0A08F'); bg.rect(x + 8, 18, 3, 3, '#E53935'); }
bg.rect(214, 22, 38, 3, '#7A4A2E'); bg.hline(214, 25, 38, '#3A2214');
bg.rect(218, 12, 7, 8, '#F5C542'); bg.rect(220, 9, 3, 3, '#F5C542'); bg.set(219, 13, '#FFF3B0'); bg.rect(219, 20, 5, 2, '#8D6E63');
bg.rect(230, 14, 9, 8, '#3E8E7E'); bg.hline(230, 14, 9, '#5FB3A2'); bg.rect(242, 11, 7, 11, '#5C6BC0'); bg.rect(243, 12, 5, 3, '#9FA8DA');
const clock = (cx, cy) => { for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) { const d = x * x + y * y; if (d <= 28) bg.set(cx + x, cy + y, d > 18 ? '#3E2723' : d > 15 ? '#D9AE80' : '#FFFFFF'); } bg.vline(cx, cy - 4, 4, '#3E2723'); [[0, -4], [4, 0], [0, 4], [-4, 0]].forEach(([a, b]) => bg.set(cx + a, cy + b, '#3E2723')); };
clock(76, 15);
// poster between
bg.rect(168, 8, 2, 0, '#000');

// ===== rugs =====
function rug(x, y, w, h, base, border, pat) {
  bg.rect(x + 1, y + h, w, 2, '#00000025'); bg.rect(x, y, w, h, border); bg.rect(x + 3, y + 3, w - 6, h - 6, base);
  bg.rect(x + 5, y + 5, w - 10, h - 10, border); bg.rect(x + 6, y + 6, w - 12, h - 12, base);
  for (let j = y + 9; j < y + h - 8; j += 5) for (let i = x + 9 + ((j - y) / 5 % 2) * 2.5; i < x + w - 8; i += 5) { bg.set(i, j, pat); bg.set(i + 1, j, pat); }
}
rug(14, 64, 66, 54, '#3E5C76', '#9FB7CC', '#5A7B97');
rug(94, 70, 72, 48, '#4F7C4A', '#D3BC86', '#6E9C66');
rug(184, 56, 66, 58, '#8E2F3A', '#D4A24C', '#B8505C');

// ===== walls between rooms (3/4) =====
function wallH(x, y, w) { bg.rect(x, y, w, 4, '#F3ECE0'); bg.rect(x, y + 4, w, 8, '#CDBFA9'); bg.hline(x, y + 4, w, '#B8A88E'); bg.hline(x, y + 11, w, '#8E7E66'); for (let i = x; i < x + w; i += 10) bg.vline(i, y + 5, 6, '#BFB097'); }
function wallV(x, y, h) { bg.rect(x, y, 4, h, '#F3ECE0'); bg.vline(x + 4, y, h, '#8E7E66'); bg.vline(x, y, h, '#FFFFFF'); }
// lower front wall y156-168, doors 30-52, 118-140, 204-226
wallH(0, 156, 30); wallH(52, 156, 34); wallH(86, 156, 32); wallH(140, 156, 32); wallH(172, 156, 32); wallH(226, 156, 30);
wallV(84, 156, 100); wallV(168, 156, 100);
for (const [a, b] of [[30, 52], [118, 140], [204, 226]]) { bg.rect(a + 2, 158, b - a - 4, 8, '#5D4E3A'); for (let i = a + 3; i < b - 3; i += 2) bg.vline(i, 159, 6, '#6E5D45'); bg.rect(a - 1, 154, 2, 14, '#6A4127'); bg.rect(b - 1, 154, 2, 14, '#6A4127'); bg.rect(a - 1, 154, b - a + 2, 2, '#6A4127'); bg.rect(a + 1, 166, b - a - 2, 2, '#00000030'); }
// door signs on the wall front
bg.rect(6, 159, 18, 6, '#FFFFFF'); bg.rect(7, 160, 4, 4, '#E53935'); bg.hline(12, 161, 10, '#90A4AE'); bg.hline(12, 163, 7, '#90A4AE');
bg.rect(94, 158, 18, 8, '#FFF8E1'); for (let i = 0; i < 3; i++) { bg.rect(96, 159 + i * 2, 1, 1, '#2E7D32'); bg.hline(98, 159 + i * 2, 12, '#90A4AE'); }
for (let y = -3; y <= 3; y++) for (let x = -7; x <= 7; x++) if ((x * x) / 49 + (y * y) / 9 <= 1) bg.set(240 + x, 161 + y, '#90CAF9'); bg.hline(234, 162, 13, '#64B5F6');
// fire alarm lamps above doors (overlay flashes red on error)
// chairman glass partition (left x=170..173, bottom y=122..125 with door 204-226)
for (let y = 44; y < 126; y++) { bg.set(170, y, '#8FA9BA'); bg.set(171, y, '#CFE8F7C8'); bg.set(172, y, '#E8F6FFB0'); bg.set(173, y, '#8FA9BA'); if (y % 3 === 0) bg.set(171, y, '#FFFFFFD0'); }
for (const [a, b] of [[170, 204], [226, 256]]) for (let x = a; x < b; x++) { bg.set(x, 122, '#8FA9BA'); bg.set(x, 123, '#CFE8F7C8'); bg.set(x, 124, '#E8F6FFB0'); bg.set(x, 125, '#8FA9BA'); if (x % 3 === 0) bg.set(x, 123, '#FFFFFFD0'); }
bg.rect(169, 44, 6, 2, '#6E7B88'); bg.rect(202, 120, 3, 7, '#6E7B88'); bg.rect(226, 120, 3, 7, '#6E7B88');

// ===== background furniture =====
function plant(p, x, y, big) {
  p.rect(x + 1, y + 16, 12, 2, '#00000030');
  p.box(x + 1, y + 9, 12, 9, { top: '#E08A5F', front: '#B8603D', line: '#6E3720', topH: 2, hi: '#F0A27A' }); p.hline(x + 3, y + 14, 8, '#A0502F');
  const L = ['#2E7D32', '#388E3C', '#43A047', '#66BB6A', '#81C784', '#A5D6A7'];
  const leaves = big ? [[7, 1], [3, 3], [11, 3], [1, 6], [13, 6], [5, 5], [9, 5], [4, -3], [10, -2], [7, -6], [2, 0], [12, -1]] : [[7, 3], [4, 5], [10, 5], [7, 0], [2, 7], [12, 7]];
  leaves.forEach(([lx, ly], i) => { p.rect(x + lx - 1, y + ly, 4, 4, L[i % 3]); p.rect(x + lx - 1, y + ly + 3, 4, 1, '#1B5E20'); p.set(x + lx, y + ly, L[3 + (i % 3)]); });
}
function chairBack(x, y, c, cd, hi) { bg.rect(x + 1, y + 15, 14, 2, '#00000035'); bg.box(x, y, 16, 13, { top: c, front: cd, line: '#1E1E28', topH: 4, hi }); bg.rect(x + 7, y + 13, 2, 3, '#2B2B33'); bg.hline(x + 2, y + 16, 12, '#2B2B33'); bg.set(x + 2, y + 17, '#2B2B33'); bg.set(x + 13, y + 17, '#2B2B33'); }
function cabinet(x, y, w, h) { bg.rect(x + 1, y + h, w, 2, '#00000030'); bg.box(x, y, w, h, { ...metal, topH: 3 }); for (let j = y + 8; j < y + h - 2; j += 9) { bg.hline(x + 2, j, w - 4, '#5F6B78'); bg.rect(x + w / 2 - 2, j + 3, 4, 1, '#D0D7DE'); bg.rect(x + 3, j + 2, 3, 2, '#FFFFFF'); } }
function rack(x, y, w, h) { bg.rect(x + 2, y + h, w, 3, '#00000045'); bg.box(x, y, w, h, { top: '#3A4552', front: '#202831', line: '#0B0F13', topH: 4, hi: '#566474' }); for (let j = y + 7; j < y + h - 3; j += 6) { bg.rect(x + 2, j, w - 4, 5, '#141A20'); bg.hline(x + 8, j + 1, w - 11, '#2F3A45'); bg.hline(x + 8, j + 3, w - 11, '#2F3A45'); } bg.rect(x + w - 3, y + 6, 1, h - 9, '#0B0F13'); }
// Opus zone
cabinet(4, 50, 14, 34); bg.rect(6, 47, 8, 3, '#FFE066'); // binder on top
bg.rect(66, 38, 12, 9, '#A7D8F5'); bg.rect(67, 39, 4, 5, '#E3F4FF'); bg.box(64, 47, 16, 24, { top: '#ECEFF1', front: '#CFD8DC', line: '#546E7A', topH: 3, hi: '#FFFFFF' }); bg.rect(68, 54, 3, 3, '#29B6F6'); bg.rect(73, 54, 3, 3, '#EF5350'); bg.rect(67, 63, 10, 1, '#90A4AE'); bg.rect(65, 71, 15, 2, '#00000030');
chairBack(36, 86, '#6A57A0', '#4E3E80', '#8471BA');
plant(bg, 22, 46, true);
// Sonnet zone
bg.box(144, 52, 22, 18, { top: '#5E9C66', front: '#467A4C', line: '#1F3D24', topH: 6, hi: '#78B57F' }); bg.rect(144, 52, 4, 18, '#3B6E43'); bg.rect(162, 52, 4, 18, '#3B6E43'); bg.rect(148, 60, 14, 2, '#3B6E43'); bg.rect(145, 70, 21, 2, '#00000030');
bg.vline(139, 44, 26, '#5D4037'); bg.rect(136, 69, 7, 2, '#5D4037'); bg.rect(134, 38, 11, 7, '#FFE0A3'); bg.hline(134, 38, 11, '#FFF3D6'); bg.hline(134, 44, 11, '#D9A44E');
chairBack(116, 86, '#00897B', '#00695C', '#26A69A');
[[96, 104], [100, 112]].forEach(([x, y]) => { bg.rect(x, y, 10, 3, '#E57373'); bg.hline(x, y + 2, 10, '#B71C1C'); bg.rect(x + 1, y - 3, 9, 3, '#64B5F6'); bg.hline(x + 1, y - 1, 9, '#1565C0'); bg.rect(x, y - 6, 10, 3, '#FFD54F'); bg.hline(x, y - 4, 10, '#F9A825'); });
// Chairman zone
bg.rect(206, 56, 26, 6, '#4A2018'); bg.box(204, 62, 30, 26, { top: '#6B2E22', front: '#57241A', line: '#2A0F0A', topH: 9, hi: '#8A4030' }); for (let i = 0; i < 4; i++) bg.set(209 + i * 7, 66, '#C08A4A'); bg.rect(205, 88, 28, 2, '#00000035');
for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) { const d = x * x + y * y; if (d <= 38) bg.set(186 + x, 72 + y, d > 30 ? '#1B4F72' : ((x * 2 + y) % 5 + 5) % 5 < 2 ? '#66BB6A' : '#42A5F5'); } bg.set(184, 69, '#FFFFFF'); bg.vline(186, 79, 8, '#8D6E63'); bg.rect(182, 87, 9, 2, '#6D4C41');
plant(bg, 240, 46, true); plant(bg, 176, 100, false);
bg.box(236, 76, 16, 14, { top: '#8C5A36', front: '#6A4127', line: '#3A2214', topH: 3 }); bg.rect(239, 70, 7, 6, '#455A64'); bg.rect(240, 71, 5, 3, '#90A4AE'); bg.rect(247, 73, 3, 3, '#FFFFFF');
// server room
rack(4, 172, 20, 56); rack(26, 172, 20, 56);
bg.box(52, 172, 28, 13, { top: '#ECEFF1', front: '#CFD8DC', line: '#607D8B', topH: 3, hi: '#FFFFFF' }); for (let i = 0; i < 7; i++) bg.hline(55, 176 + i, 22, i % 2 ? '#B0BEC5' : '#DDE3E7');
bg.rect(76, 228, 5, 12, '#D32F2F'); bg.rect(77, 226, 3, 2, '#212121'); bg.hline(76, 231, 5, '#FFCDD2'); bg.rect(77, 240, 4, 1, '#00000040');
for (let x = 4; x < 48; x++) { bg.set(x, 232, x % 4 ? '#1E88E5' : '#43A047'); bg.set(x, 233, x % 5 ? '#FDD835' : '#E53935'); }
bg.rect(20, 236, 10, 9, '#455A64'); bg.rect(21, 237, 8, 2, '#607D8B'); // stool
// QA room
bg.box(94, 172, 26, 26, { top: '#8D6E63', front: '#795548', line: '#3E2723', topH: 2 }); bg.rect(96, 175, 22, 18, '#FFFFFF'); for (let i = 0; i < 5; i++) { bg.rect(98, 177 + i * 3, 2, 2, i < 3 ? '#2E7D32' : '#BDBDBD'); bg.hline(102, 178 + i * 3, 14, '#90A4AE'); } bg.vline(98, 198, 10, '#5D4037'); bg.vline(115, 198, 10, '#5D4037');
bg.box(144, 172, 22, 22, { top: '#ECEFF1', front: '#CFD8DC', line: '#546E7A', topH: 5, hi: '#FFFFFF' }); bg.rect(148, 175, 14, 3, '#90A4AE'); bg.rect(149, 168, 12, 5, '#FFFFFF'); bg.rect(160, 184, 3, 2, '#66BB6A'); bg.rect(147, 186, 16, 1, '#90A4AE'); bg.rect(145, 194, 21, 2, '#00000030');
chairBack(122, 210, '#2E7D32', '#1B5E20', '#43A047');
plant(bg, 90, 232, true);
// store room
bg.box(226, 170, 28, 50, { ...metal, top: '#8C98A4', front: '#5F6B78' }); for (const sy of [182, 196, 210]) bg.hline(227, sy, 26, '#2F3842');
function crate(p, x, y, w = 11, h = 9) { p.rect(x + 1, y + h, w, 1, '#00000030'); p.box(x, y, w, h, { top: '#E7BF85', front: '#C8975A', line: '#7A5226', topH: 3, hi: '#F2D3A0' }); p.hline(x + 1, y + 5, w - 2, '#A87A44'); p.rect(x + w / 2 - 1, y + 1, 2, 3, '#B0864F'); }
[[228, 173], [240, 174], [229, 186], [242, 186], [228, 200], [241, 199]].forEach(([x, y]) => crate(bg, x, y, 10, 8));
bg.box(176, 170, 32, 20, { top: '#A1887F', front: '#8D6E63', line: '#4E342E', topH: 3 }); for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) { bg.rect(178 + i * 6, 174 + j * 5, 5, 4, '#4E342E'); if ((i + j) % 2) bg.rect(179 + i * 6, 175 + j * 5, 3, 2, '#FFFFFF'); }
bg.box(234, 222, 20, 32, { top: '#EF5350', front: '#C62828', line: '#5D1010', topH: 4, hi: '#FF8A80' }); bg.rect(237, 228, 11, 18, '#B3E5FC'); for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) bg.rect(238 + i * 3.5, 229 + j * 4.3, 2, 3, ['#FFD54F', '#81C784', '#F06292', '#64B5F6'][(i + j) % 4]); bg.rect(249, 232, 3, 5, '#212121'); bg.rect(239, 248, 9, 3, '#212121');
[[176, 236], [188, 236], [182, 227], [176, 218]].forEach(([x, y]) => crate(bg, x, y));

// ===== foreground (in front of seated/standing actors) =====
const woodD = { top: '#DDAE72', front: '#A9733F', line: '#5A3A1F', hi: '#F0CC98' }, darkD = { top: '#8C5A36', front: '#6A4127', line: '#2E190C', hi: '#A97650' };
function desk(x, y, w, s = woodD) { fg.rect(x + 2, y + 16, w, 3, '#00000035'); fg.box(x, y, w, 16, { ...s, topH: 5 }); fg.hline(x + 2, y + 8, w - 4, s.line + '55'); fg.rect(x + 3, y + 16, 2, 3, s.line); fg.rect(x + w - 5, y + 16, 2, 3, s.line); fg.rect(x + w / 2 - 4, y + 10, 8, 1, '#C9A06B'); }
function monitor(x, y, w = 18) { fg.rect(x - 1, y - 1, w + 2, 14, '#1E232B'); fg.rect(x, y, w, 12, '#3B4252'); fg.rect(x + 1, y + 1, w - 2, 9, '#1F3A47'); fg.rect(x + w / 2 - 2, y + 12, 4, 2, '#3B4252'); fg.hline(x + w / 2 - 5, y + 14, 10, '#1E232B'); fg.set(x + w - 2, y + 11, '#69F0AE'); }
function laptop(x, y) { fg.rect(x, y, 16, 10, '#90A4AE'); fg.rect(x + 1, y + 1, 14, 8, '#1F3A47'); fg.rect(x - 2, y + 10, 20, 3, '#B0BEC5'); fg.hline(x - 2, y + 12, 20, '#78909C'); }
function mug(x, y) { fg.rect(x, y, 4, 4, '#FFFFFF'); fg.rect(x + 4, y + 1, 1, 2, '#FFFFFF'); fg.hline(x, y + 3, 4, '#CFD8DC'); fg.hline(x, y, 4, '#6D4C41'); }
function papers(x, y) { fg.rect(x, y, 8, 4, '#FFFFFF'); fg.rect(x + 2, y - 2, 8, 4, '#F5F5F5'); fg.hline(x + 3, y - 1, 5, '#B0BEC5'); fg.hline(x + 3, y + 1, 4, '#B0BEC5'); }
function kb(x, y) { fg.rect(x, y, 14, 3, '#CFD8DC'); for (let i = 1; i < 13; i += 2) fg.set(x + i, y + 1, '#ECEFF1'); fg.hline(x, y + 2, 14, '#90A4AE'); }
desk(16, 96, 60); monitor(20, 81); monitor(52, 81); kb(39, 97); mug(70, 96); papers(20, 98);
desk(98, 96, 60); monitor(136, 81); kb(118, 97); fg.rect(102, 92, 10, 3, '#E57373'); fg.rect(103, 89, 9, 3, '#64B5F6'); fg.rect(102, 86, 10, 3, '#FFD54F'); fg.hline(102, 94, 10, '#B71C1C'); mug(150, 96);
desk(194, 88, 54, darkD); fg.vline(200, 78, 10, '#5D4037'); fg.rect(196, 75, 9, 4, '#2E7D32'); fg.hline(196, 78, 9, '#1B5E20'); fg.rect(216, 90, 12, 4, '#F5C542'); fg.hline(217, 91, 10, '#8D6E00'); papers(232, 90); mug(242, 89); laptop(205, 79);
desk(102, 220, 60); monitor(108, 205); monitor(138, 205); kb(124, 221); papers(150, 222);
fg.box(52, 206, 22, 8, { ...metal, topH: 3 }); fg.vline(55, 214, 14, '#37474F'); fg.vline(70, 214, 14, '#37474F'); fg.rect(52, 227, 22, 1, '#37474F'); fg.rect(53, 228, 3, 2, '#212121'); fg.rect(69, 228, 3, 2, '#212121'); laptop(55, 196);
[[198, 240], [210, 240], [204, 231]].forEach(([x, y]) => crate(fg, x, y));
fg.vline(222, 222, 24, '#455A64'); fg.rect(216, 244, 10, 3, '#455A64'); fg.rect(215, 247, 4, 4, '#212121'); fg.rect(223, 247, 4, 4, '#212121');
[[78, 106], [164, 236]].forEach(([x, y]) => { fg.rect(x + 1, y + 10, 9, 2, '#00000030'); fg.box(x, y, 9, 10, { top: '#90A4AE', front: '#607D8B', line: '#37474F', topH: 3 }); fg.hline(x + 2, y + 1, 5, '#ECEFF1'); });
plant(bg, 2, 96, false);

// ===== characters 16x24 =====
const BASE = [
  '.....OOOOOO.....', '...OOHHHHHHOO...', '..OHHHHHHHHHHO..', '.OHHHhHHHHHHHHO.', '.OHHHHHHHHHhHHO.', '.OHHSSSSSSSSHHO.',
  '.OHSSSSSSSSSSHO.', '.OSSWWSSSSWWSSO.', '.OSSWESSSSWESSO.', '.OSrSSSSSSSSrSO.', '..OSSSSMMSSSSO..', '...OOSSSSSSOO...',
  '.....OssssO.....', '...OOCCTTCCOO...', '..OLLCCTTCCccO..', '.OLLCCCTTCCCccO.', '.OSLCCCTTCCCcSO.', '.OSOCCCCCCCCOSO.',
  '...OccccccccO...', '...OPPPPPPPPO...', '...OPPPOOPPPO...', '...OPPPOOPPPO...', '...OBBBOOBBBO...', '...OOOO..OOOO...'];
const EXPR = {
  normal: null,
  blink: { 7: '.OSSSSSSSSSSSSO.', 8: '.OSSEESSSSEESSO.' },
  happy: { 7: '.OSSESESSESESSO.', 8: '.OSSSSSSSSSSSSO.', 10: '..OSSSMMMMSSSO..', 11: '...OOSSMMSSOO...' },
  worried: { 6: '.OHSEESSSSEESHO.', 10: '..OSSSMSMSSSSO..' },
  focus: { 7: '.OSSOOSSSSOOSSO.' },
  sleepy: { 7: '.OSSSSSSSSSSSSO.', 8: '.OSSEESSSSEESSO.', 10: '..OSSSSMSSSSSO..' },
};
const LEGS = {
  a: ['...OPPPPPPPPO...', '..OPPPO.OPPPO...', '..OPPO...OPPO...', '.OBBBO...OBBBO..', '.OOOO.....OOOO..'],
  b: ['...OPPPPPPPPO...', '...OPPPOOPPPO...', '....OPPOOPPO....', '....OBBOOBBO....', '....OOOOOOOO....'],
};
const TYPE = { 1: { 16: '.OLCSSCTTCSSCcO.' }, 2: { 15: '.OLLCSSTTSSCccO.', 16: '.OSLCCCTTCCCcSO.' } };
function frame(o, c) {
  const m = BASE.slice();
  if (c.style === 1) { m[1] = '...OOOOOOOOOO...'; m[2] = '..OHHHHHHHHHHO..'; for (let r = 5; r <= 12; r++) m[r] = '.' + 'O' + 'H' + m[r].slice(3, 13) + 'H' + 'O' + '.'; m[12] = '.OHHHOssssOHHHO.'; }
  if (c.style === 2) { m[0] = '...O.OO.OO.O....'; m[1] = '..OHOHHOHHOHO...'; }
  if (c.style === 3) { m[3] = '.OHHHHHHHHHHhHO.'; m[4] = '.OhHHHHHHHHHHHO.'; m[5] = '.OHSSSSSSSSSSHO.'; }
  const e = EXPR[o.expr || 'normal']; if (e) for (const [r, v] of Object.entries(e)) m[r] = v;
  if (c.glasses && !['blink', 'sleepy', 'happy'].includes(o.expr)) { m[7] = m[7].slice(0, 3) + 'GGGG' + 'SS' + 'GGGG' + m[7].slice(12); }
  if (c.beard) { m[10] = '..OSHHMMHHSSO...'.slice(0, 16); m[11] = '...OOHHHHHHOO...'; }
  if (o.legs) m.splice(19, 5, ...LEGS[o.legs]);
  if (o.type) for (const [r, v] of Object.entries(TYPE[o.type])) m[r] = v;
  if (o.wave) { m[13] = m[13].slice(0, 13) + 'OSO'; m[14] = m[14].slice(0, 14) + 'SO'; m[15] = m[15].slice(0, 14) + 'LO'; m[16] = m[16].slice(0, 13) + 'OO.'; m[12] = m[12].slice(0, 13) + 'OSO'; }
  return m.map(r => (r + '................').slice(0, 16));
}
const pal = (c) => ({ O: '#2A1E1E', H: c.hair, h: c.hairD, S: '#F7CDAE', s: '#E3A884', r: '#F4A6A6', E: '#2A1E1E', W: '#FFFFFF', M: '#B5655A', G: '#2A1E1E',
  C: c.shirt, c: c.shirtD, L: c.shirtL, T: c.tie, P: c.pants || '#34405A', B: '#3A2A22' });
const CAST = {
  boss: { hair: '#4E342E', hairD: '#2A1A17', shirt: '#2C3E57', shirtD: '#1E2B3D', shirtL: '#3D5475', tie: '#F5B800', style: 3, glasses: true },
  opus: { hair: '#4A2391', hairD: '#2E1561', shirt: '#7E57C2', shirtD: '#5E35B1', shirtL: '#9575CD', tie: '#D1C4E9', style: 2 },
  sonnet: { hair: '#00564C', hairD: '#003A33', shirt: '#26A69A', shirtD: '#00897B', shirtL: '#4DB6AC', tie: '#B2DFDB', style: 1 },
  tech: { hair: '#263238', hairD: '#121A1F', shirt: '#546E7A', shirtD: '#37474F', shirtL: '#78909C', tie: '#FFB300', style: 0, glasses: true },
  qa: { hair: '#6D4C41', hairD: '#3E2A24', shirt: '#43A047', shirtD: '#2E7D32', shirtL: '#66BB6A', tie: '#FFFFFF', style: 3, glasses: true },
  courier: { hair: '#5D4037', hairD: '#3A251F', shirt: '#FB8C00', shirtD: '#E65100', shirtL: '#FFB74D', tie: '#FFE0B2', style: 2, pants: '#4E342E' },
  guest: { hair: '#7B1F4E', hairD: '#4A0C2C', shirt: '#EC407A', shirtD: '#C2185B', shirtL: '#F48FB1', tie: '#FCE4EC', style: 1 },
};
const sprites = {};
for (const [k, c] of Object.entries(CAST)) {
  const mk = (o, flip) => { const p = new Pix(16, 24); let m = frame(o, c); if (flip) m = m.map(r => [...r].reverse().join('')); p.map(0, 0, m, pal(c)); return p; };
  const s = {};
  for (const e of ['normal', 'blink', 'happy', 'worried', 'focus', 'sleepy']) s[e] = mk({ expr: e });
  s.walkA = mk({ legs: 'a', expr: 'focus' }); s.walkB = mk({ legs: 'b', expr: 'focus' });
  s.walkAL = mk({ legs: 'a', expr: 'focus' }, 1); s.walkBL = mk({ legs: 'b', expr: 'focus' }, 1);
  s.type1 = mk({ type: 1, expr: 'focus' }); s.type2 = mk({ type: 2, expr: 'focus' });
  s.typeW1 = mk({ type: 1, expr: 'worried' }); s.typeW2 = mk({ type: 2, expr: 'worried' });
  s.wave1 = mk({ expr: 'happy' }); s.wave2 = mk({ wave: 1, expr: 'happy' });
  sprites[k] = s;
}
function bubble(kind) {
  const p = new Pix(16, 16), col = { err: '#E53935', wait: '#FB8C00', ok: '#2E9E57' }[kind], dk = { err: '#8E1B1B', wait: '#8A4B00', ok: '#145A30' }[kind];
  p.rect(2, 0, 12, 1, '#2A1E1E'); p.rect(1, 1, 14, 1, '#2A1E1E'); p.rect(0, 2, 16, 9, '#2A1E1E'); p.rect(1, 11, 14, 1, '#2A1E1E'); p.rect(2, 12, 12, 1, '#2A1E1E');
  p.rect(2, 1, 12, 11, col); p.rect(1, 2, 14, 9, col); p.rect(2, 11, 12, 1, dk); p.hline(3, 2, 6, '#FFFFFF70'); p.set(2, 3, '#FFFFFF70');
  p.rect(4, 13, 4, 1, '#2A1E1E'); p.rect(5, 12, 2, 1, col); p.set(4, 14, '#2A1E1E'); p.set(5, 13, col);
  if (kind !== 'ok') { p.rect(7, 3, 2, 5, '#FFFFFF'); p.rect(7, 9, 2, 2, '#FFFFFF'); p.vline(9, 4, 4, dk); }
  else [[4, 6], [5, 7], [6, 8], [7, 7], [8, 6], [9, 5], [10, 4], [11, 3]].forEach(([x, y]) => { p.rect(x, y, 1, 2, '#FFFFFF'); p.set(x, y + 2, dk); });
  return p;
}
for (const k of ['err', 'wait', 'ok']) sprites['b_' + k] = bubble(k);
const book = new Pix(6, 6); book.rect(0, 0, 6, 6, '#2A1E1E'); book.rect(1, 1, 4, 4, '#E57373'); book.vline(3, 1, 4, '#FFFFFF'); sprites.book = book;
const box = new Pix(10, 9); box.box(0, 0, 10, 9, { top: '#E7BF85', front: '#C8975A', line: '#7A5226', topH: 3, hi: '#F2D3A0' }); box.hline(1, 5, 8, '#A87A44'); sprites.crate = box;
const reel = new Pix(10, 10); for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) { const d = (x - 4.5) ** 2 + (y - 4.5) ** 2; if (d < 24) reel.set(x, y, d > 16 ? '#2A1E1E' : d < 2.5 ? '#2A1E1E' : (Math.atan2(y - 4.5, x - 4.5) * 3 | 0) % 2 ? '#B0BEC5' : '#546E7A'); } sprites.reel = reel;
const clip = new Pix(6, 8); clip.rect(0, 0, 6, 8, '#2A1E1E'); clip.rect(1, 1, 4, 6, '#FFFFFF'); clip.rect(2, 0, 2, 1, '#9E9E9E'); clip.hline(2, 3, 2, '#90A4AE'); clip.hline(2, 5, 2, '#90A4AE'); sprites.clip = clip;
const cat = new Pix(18, 10); cat.map(0, 0, ['..............OO..', '.............OFFO.', '..OOOOOOOOOOOFFFO.', '.OFFFFFFFFFFFFwFFO', 'OFFfFFFfFFFFFFFFO.', 'OFFFFFFFFFFFFFFFO.', '.OfFFFfFFFFfFFFO..', '..OOOOOOOOOOOOO...'], { O: '#3E2723', F: '#FFB74D', f: '#F57C00', w: '#3E2723' }); sprites.cat = cat;

export const LAYERS = { bg, fg };
import { toPaths } from './vectorize.mjs';
const V = (p) => toPaths(p);
const sv = {}; for (const [k, v] of Object.entries(sprites)) sv[k] = v instanceof Pix ? V(v) : Object.fromEntries(Object.entries(v).map(([a, b]) => [a, V(b)]));
fs.writeFileSync(new URL('./assets3.json', import.meta.url), JSON.stringify({ bg: V(bg), fg: V(fg), sprites: sv }));
console.log('bg', V(bg).length, 'fg', V(fg).length, 'sprites', JSON.stringify(sv).length, 'oneFrame', sv.opus.normal.length);
