// Pixel-style report cards (SVG strings): RPG-window frames, segmented XP-style bars, role icons per step.
// Pure functions of the job view; drawn by the desktop Svg element under the office scene.

export type CardStep = { label: string; role: string; state: 'done' | 'now' | 'wait'; w: number; took?: string; elapsed?: string; left?: string; guess?: string }
export type CardInput = {
  title: string; group: string; status: { t: string; kind: 'run' | 'wait' | 'err' | 'done' | 'stale' }
  total: number; etaText: string; steps: CardStep[]; progress: number; message?: string; reply?: string; updatedText: string; focused: boolean
}

const F = `font-family="Consolas,'Courier New',monospace"`
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fit = (s: string, n: number) => { const a = [...String(s)]; return a.length > n ? a.slice(0, Math.max(1, n - 1)).join('') + '…' : a.join('') }
const R = (x: number, y: number, w: number, h: number, c: string, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"${extra}/>`
const T = (x: number, y: number, s: string, c: string, size = 11, extra = '') => `<text x="${x}" y="${y}" ${F} font-size="${size}" fill="${c}"${extra}>${esc(s)}</text>`

const KIND = {
  run: { c: '#3BA7FF', d: '#1F5F99', t: '#E8F4FF' }, wait: { c: '#F5A524', d: '#8A5A0B', t: '#FFF6E0' },
  err: { c: '#E5484D', d: '#7A1E21', t: '#FFECEC' }, done: { c: '#3DBE6B', d: '#1E6B3A', t: '#E9FFF1' }, stale: { c: '#A1A7B3', d: '#4A505C', t: '#F2F4F7' },
}

// 8x8 role icons drawn from pixel strings
const ICON: Record<string, string[]> = {
  fetch: ['........', '.oooooo.', '.oyyyyo.', '.oYYYYo.', '.oyyyyo.', '.oyyyyo.', '.oooooo.', '........'],
  research: ['........', '.oo.oo..', 'obbobbo.', 'obbobbo.', 'obbobbo.', 'obbobbo.', '.oooooo.', '........'],
  plan: ['......oo', '.....opo', '....opo.', '...opo..', '..opo...', '.oyo....', '.oo.....', '........'],
  build: ['...gg...', '.g.gg.g.', '..gggg..', 'gggoogg.', 'gggoogg.', '..gggg..', '.g.gg.g.', '...gg...'],
  check: ['..ooo...', '.owwwo..', 'owwwwwo.', 'owwwwwo.', '.owwwo..', '..oooo..', '.....oo.', '......oo'],
  deliver: ['........', 'oooo....', 'orrooooo', 'orroyyyo', 'oooooooo', '.oo..oo.', '........', '........'],
}
const ICOL: Record<string, string> = { o: '#1B1F2A', y: '#E7BF85', Y: '#C8975A', b: '#64B5F6', p: '#FFD54F', g: '#9AA5B1', w: '#B3E5FC', r: '#E53935' }
function icon(role: string, x: number, y: number, s = 1.5) {
  const m = ICON[role] ?? ICON.build; let o = ''
  m.forEach((row, j) => [...row].forEach((ch, i) => { const c = ICOL[ch]; if (c) o += R(x + i * s, y + j * s, s, s, c) }))
  return o
}
// RPG window frame
function frame(w: number, h: number, accent: string, focused: boolean) {
  const edge = focused ? accent : '#C9B98F'
  return R(0, 0, w, h, '#0E131C') + R(2, 2, w - 4, h - 4, edge) + R(4, 4, w - 8, h - 8, '#1A2232') + R(5, 5, w - 10, 2, '#24304A')
    + [[3, 3], [w - 7, 3], [3, h - 7], [w - 7, h - 7]].map(([x, y]) => R(x, y, 4, 4, '#FFE7A3') + R(x + 1, y + 1, 2, 2, '#B08A3E')).join('')
}
// segmented XP bar: one block every ~7 px, coloured by step state
function xpBar(x: number, y: number, w: number, steps: CardStep[], progress: number, kind: keyof typeof KIND) {
  const n = steps.length, blocks = Math.max(n * 3, Math.floor(w / 7)), bw = w / blocks
  const weights = steps.map(s => Math.max(s.w || 1, 1)), sum = weights.reduce((a, b) => a + b, 0)
  let o = R(x - 2, y - 2, w + 4, 12, '#0E131C') + R(x - 1, y - 1, w + 2, 10, '#3A4558')
  let acc = 0
  const bounds = weights.map(v => { const a = acc; acc += v; return [a / sum, acc / sum] })
  for (let b = 0; b < blocks; b++) {
    const mid = (b + 0.5) / blocks, si = bounds.findIndex(([a, z]) => mid >= a && mid < z), st = steps[Math.max(0, si)]
    let c = '#263043'
    if (st?.state === 'done') c = '#3DBE6B'
    else if (st?.state === 'now') { const [a, z] = bounds[si]; c = (mid - a) / (z - a) <= Math.max(0.02, progress) ? KIND[kind].c : '#263043' }
    o += R(x + b * bw + 0.5, y, bw - 1, 8, c) + (c !== '#263043' ? R(x + b * bw + 0.5, y, bw - 1, 2, '#FFFFFF', ' opacity=".28"') : '')
  }
  bounds.slice(0, -1).forEach(([, z]) => { o += R(x + z * w - 0.5, y - 2, 1, 12, '#0E131C') })
  return o
}
function miniHp(x: number, y: number, w: number, f: number, col: string) {
  return R(x - 1, y - 1, w + 2, 7, '#0E131C') + R(x, y, w, 5, '#2A3446') + R(x, y, Math.max(2, Math.round(w * f)), 5, col, ' class="pl"') + R(x, y, Math.max(2, Math.round(w * f)), 1, '#FFFFFF', ' opacity=".35"')
}

export function cardSvg(c: CardInput, W: number) {
  const k = KIND[c.status.kind], cols = Math.max(16, Math.floor((W - 120) / 6.6))
  const stepH = 17, cur = c.steps.findIndex(s => s.state === 'now')
  const msgH = c.message ? 34 : 0
  const H = 16 + 22 + 16 + 30 + c.steps.length * stepH + (cur >= 0 ? 9 : 0) + msgH + (c.message && cur < 0 ? 0 : 0) + 22
  let y = 14, o = frame(W, H, k.c, c.focused)
  // title + status badge
  const badgeW = [...c.status.t].length * 6.8 + 16
  o += T(14, y + 10, fit(c.title, Math.floor((W - badgeW - 40) / 7.2)), '#F3E9D2', 12.5, ' font-weight="700"')
  o += R(W - badgeW - 12, y, badgeW, 15, k.d) + R(W - badgeW - 11, y + 1, badgeW - 2, 13, k.c) + R(W - badgeW - 11, y + 1, badgeW - 2, 3, '#FFFFFF', ' opacity=".25"')
    + T(W - badgeW - 4, y + 11, c.status.t, '#0E131C', 10.5, ' font-weight="700"')
  y += 22
  o += T(14, y + 6, fit(`${c.group ? c.group + ' · ' : ''}${c.steps.length} bước · ${c.updatedText}`, cols + 10), '#8C97AA', 10)
  y += 16
  // total XP bar + numbers
  o += xpBar(14, y, W - 28, c.steps, c.progress, c.status.kind === 'stale' ? 'run' : c.status.kind)
  y += 22
  o += T(14, y, `TỔNG ${Math.round(c.total * 100)}%`, k.c, 11.5, ' font-weight="700"') + T(92, y, fit(c.etaText, cols), '#D6DCE6', 10.5)
  y += 12
  // step timeline
  c.steps.forEach((s, i) => {
    const yy = y + i * stepH + (i > cur && cur >= 0 ? 9 + msgH : 0)
    const col = s.state === 'done' ? '#3DBE6B' : s.state === 'now' ? k.c : '#4A5468'
    if (i < c.steps.length - 1) o += R(21, yy + 12, 2, stepH - 4 + (i === cur ? 9 + msgH : 0), s.state === 'done' ? '#2C7F4A' : '#2C3446')
    o += R(14, yy, 16, 14, '#0E131C') + R(15, yy + 1, 14, 12, s.state === 'wait' ? '#1F2737' : col) + icon(s.role, 16, yy + 1)
    if (s.state === 'now') o += R(13, yy - 1, 18, 16, 'none', ` stroke="${k.c}" stroke-width="1" class="pl"`)
    const label = `${i + 1}. ${s.label}`
    const right = s.state === 'done' ? (s.took ? `✓ ${s.took}` : '✓') : s.state === 'now' ? `${s.elapsed ? '⏱ ' + s.elapsed : '▶'}${s.left ? ' · còn ' + s.left : ''}` : s.guess ? `~${s.guess}` : ''
    o += T(38, yy + 10, fit(label, cols - 8), s.state === 'wait' ? '#7D8799' : '#EEF2F8', 11, s.state === 'now' ? ' font-weight="700"' : '')
    o += `<text x="${W - 14}" y="${yy + 10}" ${F} font-size="10" text-anchor="end" fill="${s.state === 'now' ? k.c : s.state === 'done' ? '#7FD9A0' : '#6B7588'}">${esc(String(right))}</text>`
    if (i === cur) o += miniHp(38, yy + 14, W - 52, c.progress, k.c)
    if (i === cur && c.message) {
      const by = yy + 25
      o += R(38, by, W - 52, 28, '#0E131C') + R(39, by + 1, W - 54, 26, k.t) + R(46, by - 4, 6, 4, k.t) + R(45, by - 5, 8, 1, '#0E131C')
      o += T(46, by + 12, fit(c.message, cols), k.d, 10.5, ' font-weight="700"') + T(46, by + 23, fit(c.reply ?? '', cols + 2), '#4A505C', 9.5)
    }
  })
  y += c.steps.length * stepH + (cur >= 0 ? 9 : 0) + msgH + 4
  // a message with no current step (stale job) goes at the bottom
  if (c.message && cur < 0) {
    o += R(14, y, W - 28, 28, '#0E131C') + R(15, y + 1, W - 30, 26, k.t) + R(28, y - 4, 6, 4, k.t) + R(27, y - 5, 8, 1, '#0E131C')
    o += T(22, y + 12, fit(c.message, cols + 4), k.d, 10.5, ' font-weight="700"') + T(22, y + 23, fit(c.reply ?? '', cols + 6), '#4A505C', 9.5)
    y += 34
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges"><style>.pl{animation:pl 1.2s ease-in-out infinite}@keyframes pl{50%{opacity:.55}}</style>${o}</svg>`
}

export function headerSvg(W: number, running: number, waits: number, errs: number, done: number) {
  const chip = (x: number, label: string, n: number, kind: keyof typeof KIND) => {
    const w = [...label].length * 6.4 + 26
    return { w, s: R(x, 6, w, 16, '#0E131C') + R(x + 1, 7, w - 2, 14, n ? KIND[kind].c : '#2A3446') + T(x + 6, 18, `${n} ${label}`, n ? '#0E131C' : '#8C97AA', 10.5, ' font-weight="700"') }
  }
  let x = W - 8, chips = ''
  for (const [label, n, kind] of [['xong', done, 'done'], ['lỗi', errs, 'err'], ['chờ duyệt', waits, 'wait'], ['đang chạy', running, 'run']] as const) {
    const c = chip(0, label, n, kind); x -= c.w + 4; chips += chip(x, label, n, kind).s
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 28" width="${W}" height="28" shape-rendering="crispEdges">${R(0, 0, W, 28, '#0E131C')}${R(2, 2, W - 4, 24, '#2B1E14')}${R(3, 3, W - 6, 2, '#5A3E26')}`
    + `${R(8, 8, 12, 12, '#F5B800')}${R(10, 10, 8, 8, '#FFE082')}${R(12, 6, 4, 2, '#F5B800')}${T(26, 18, 'VĂN PHÒNG · CHỦ TỊCH', '#FFE7A3', 11.5, ' font-weight="700"')}${chips}</svg>`
}

export function doneShelfSvg(W: number, rows: { title: string; when: string }[]) {
  const H = 26 + rows.length * 16
  let o = R(0, 0, W, H, '#0E131C') + R(2, 2, W - 4, H - 4, '#2C7F4A') + R(4, 4, W - 8, H - 8, '#15261C') + T(12, 17, `ĐÃ XONG (${rows.length})`, '#7FD9A0', 11, ' font-weight="700"')
  rows.forEach((r, i) => {
    const y = 26 + i * 16
    o += R(12, y, 10, 10, '#3DBE6B') + R(14, y + 5, 2, 2, '#0E131C') + R(16, y + 6, 2, 2, '#0E131C') + R(18, y + 3, 2, 3, '#0E131C')
      + T(28, y + 9, fit(r.title, Math.floor((W - 90) / 6.6)), '#D9F5E3', 10.5) + `<text x="${W - 12}" y="${y + 9}" ${F} font-size="10" text-anchor="end" fill="#7FD9A0">${esc(r.when)}</text>`
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges">${o}</svg>`
}
