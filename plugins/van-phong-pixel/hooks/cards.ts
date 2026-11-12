// Report cards drawn as SVG in the office's own pixel style: chamfered pixel frames with a dark outline,
// wooden name plates, LED tags like the room signs, HP-style segmented bars, pixel role icons.
export type CardStep = { label: string; role: string; state: 'done' | 'now' | 'wait'; w: number; took?: string; elapsed?: string; left?: string; guess?: string }
export type CardInput = {
  title: string; group: string; status: { t: string; kind: Kind }
  total: number; etaText: string; steps: CardStep[]; progress: number; message?: string; reply?: string; updatedText: string; focused: boolean
}
type Kind = 'run' | 'wait' | 'err' | 'done' | 'stale'

const SANS = `font-family="Segoe UI,system-ui,-apple-system,Roboto,sans-serif"`
const MONO = `font-family="Consolas,'Cascadia Mono','Courier New',monospace"`
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// width-aware cut: CJK / full-width glyphs are about twice as wide as Latin ones
const cw = (ch: string) => { const p = ch.codePointAt(0) ?? 0; return (p >= 0x2E80 && p <= 0x9FFF) || (p >= 0xAC00 && p <= 0xD7A3) || (p >= 0xF900 && p <= 0xFAFF) || (p >= 0xFF00 && p <= 0xFF60) || (p >= 0x3000 && p <= 0x303F) ? 1.1 : 0.6 }
const fit = (s: string, px: number, size: number) => {
  const a = [...String(s)]; let w = 0
  for (let i = 0; i < a.length; i++) { w += cw(a[i]) * size; if (w > px) return a.slice(0, Math.max(1, i - 1)).join('') + '…' }
  return a.join('')
}
const R = (x: number, y: number, w: number, h: number, c: string, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"${extra}/>`
const T = (x: number, y: number, s: string, c: string, size: number, extra = '', font = SANS) => `<text x="${x}" y="${y}" ${font} font-size="${size}" fill="${c}"${extra}>${esc(s)}</text>`
const TR = (x: number, y: number, s: string, c: string, size: number, extra = '', font = SANS) => T(x, y, s, c, size, ` text-anchor="end"${extra}`, font)

// palette taken from the office: dark outline, wood, cream text, the room-sign colours
const COL: Record<Kind, { main: string; soft: string; ink: string }> = {
  run: { main: '#5AA9FF', soft: '#1E3352', ink: '#E8F2FF' }, wait: { main: '#FFC145', soft: '#4A3612', ink: '#FFF4DC' },
  err: { main: '#FF5A5F', soft: '#4C1C20', ink: '#FFE9EA' }, done: { main: '#4ADE80', soft: '#173D29', ink: '#E5FBEE' }, stale: { main: '#B4BCC8', soft: '#2C323C', ink: '#F1F3F6' },
}
const OUT = '#2A1E1E', PANEL = '#1A2130', PANEL2 = '#212A3B', LINE = '#33405A', TEXT = '#F3EEE4', SUB = '#A9B3C4', DIM = '#6F7A8E'
const WOOD = '#7A4A2E', WOOD2 = '#9C6340', WOODHI = '#C08552', CREAM = '#FFF3D6'

// chamfered pixel frame: outline with 2-px stepped corners, coloured border, panel, top highlight, bottom shade
function frame(x: number, y: number, w: number, h: number, fill: string, border: string, glow = false) {
  const st = (dx: number, dy: number, ww: number, hh: number, c: string) => R(x + dx, y + dy, ww, hh, c)
  return (glow ? R(x - 2, y - 2, w + 4, h + 4, border, ' opacity=".25" class="pl"') : '')
    + st(4, 0, w - 8, h, OUT) + st(2, 2, w - 4, h - 4, OUT) + st(0, 4, w, h - 8, OUT)
    + st(5, 2, w - 10, h - 4, border) + st(3, 4, w - 6, h - 8, border) + st(2, 5, w - 4, h - 10, border)
    + st(6, 4, w - 12, h - 8, fill) + st(4, 6, w - 8, h - 12, fill)
    + st(6, 4, w - 12, 1, '#FFFFFF" opacity=".12') + st(6, h - 5, w - 12, 1, '#000000" opacity=".25')
}
// LED tag like the room signs: dark outline, colour, small LED that blinks while active
function tag(xr: number, y: number, label: string, kind: Kind) {
  const k = COL[kind], w = [...label].length * 6.6 + 24, x = xr - w
  return R(x, y, w, 18, OUT) + R(x + 1, y + 1, w - 2, 16, k.soft) + R(x + 1, y + 1, w - 2, 1, '#FFFFFF" opacity=".15')
    + R(x + 6, y + 6, 6, 6, k.main, kind === 'run' || kind === 'wait' || kind === 'err' ? ' class="led"' : '')
    + T(x + 16, y + 13, label, k.ink, 11, ' font-weight="700"', MONO)
}

// 8x8 pixel role icons
const ICON: Record<string, string[]> = {
  fetch: ['........', '.oooooo.', '.oyyyyo.', '.oYYYYo.', '.oyyyyo.', '.oyyyyo.', '.oooooo.', '........'],
  research: ['........', '.oo.oo..', 'obbobbo.', 'obbobbo.', 'obbobbo.', 'obbobbo.', '.oooooo.', '........'],
  plan: ['......oo', '.....opo', '....opo.', '...opo..', '..opo...', '.oyo....', '.oo.....', '........'],
  build: ['...gg...', '.g.gg.g.', '..gggg..', 'gggoogg.', 'gggoogg.', '..gggg..', '.g.gg.g.', '...gg...'],
  check: ['..ooo...', '.owwwo..', 'owwwwwo.', 'owwwwwo.', '.owwwo..', '..oooo..', '.....oo.', '......oo'],
  deliver: ['........', 'oooo....', 'orrooooo', 'orroyyyo', 'oooooooo', '.oo..oo.', '........', '........'],
}
const ICOL: Record<string, string> = { o: '#10151F', y: '#E7BF85', Y: '#C8975A', b: '#64B5F6', p: '#FFD54F', g: '#C7CED8', w: '#B3E5FC', r: '#F0525A' }
function icon(role: string, x: number, y: number, s: number) {
  let o = ''
  ;(ICON[role] ?? ICON.build).forEach((row, j) => [...row].forEach((ch, i) => { const c = ICOL[ch]; if (c) o += R(x + i * s, y + j * s, s, s, c) }))
  return o
}
// square pixel tile with a dark outline (and a blinking ring on the current step)
function tile(role: string, x: number, y: number, size: number, bg: string, ring?: string) {
  const s = size / 10
  return (ring ? R(x - 2, y - 2, size + 4, size + 4, ring, ' class="pl"') : '') + R(x, y, size, size, OUT) + R(x + 1, y + 1, size - 2, size - 2, bg)
    + R(x + 1, y + 1, size - 2, 1, '#FFFFFF" opacity=".12') + icon(role, x + s, y + s, s)
}

// HP-style total bar: dark outline, one block per step (width by its weight), done = green, current = status colour
function totalBar(x: number, y: number, w: number, h: number, steps: CardStep[], progress: number, kind: Kind) {
  const sum = steps.reduce((a, s) => a + Math.max(1, s.w), 0), gap = 2
  let o = R(x - 2, y - 2, w + 4, h + 4, OUT), cx = x
  steps.forEach((s) => {
    const sw = Math.max(3, (Math.max(1, s.w) / sum) * (w - gap * (steps.length - 1)))
    o += R(cx, y, sw, h, '#2B3448')
    if (s.state === 'done') o += R(cx, y, sw, h, COL.done.main) + R(cx, y + h - 2, sw, 2, '#1F8F4E')
    if (s.state === 'now') o += R(cx, y, Math.max(3, sw * Math.max(0.03, progress)), h, COL[kind].main, ' class="pl"')
    cx += sw + gap
  })
  return o + R(x, y, w, 2, '#FFFFFF', ' opacity=".18"')
}

export function cardSvg(c: CardInput, W: number) {
  const k = COL[c.status.kind], pad = 16, inner = W - pad * 2
  const cur = c.steps.findIndex(s => s.state === 'now'), done = c.steps.filter(s => s.state === 'done').length
  const rowH = 30, curExtra = 10, msgH = c.message && cur >= 0 ? 46 : 0
  const plateH = 46
  const H = 8 + plateH + 58 + c.steps.length * rowH + (cur >= 0 ? curExtra : 0) + msgH + (c.message && cur < 0 ? 18 : 0) + pad
  let o = frame(0, 0, W, H, PANEL, c.focused ? k.main : LINE, c.focused)
  // wooden name plate: current-step icon, title, sub line, LED tag
  const curRole = cur >= 0 ? c.steps[cur].role : c.status.kind === 'done' ? 'deliver' : c.steps[0]?.role ?? 'build'
  o += R(8, 8, W - 16, plateH, OUT) + R(9, 9, W - 18, plateH - 2, WOOD) + R(9, 9, W - 18, 2, WOODHI) + R(9, plateH + 4, W - 18, 2, '#5A3420')
    + [0, 1, 2].map(i => R(9, 18 + i * 10, W - 18, 1, WOOD2, ' opacity=".55"')).join('')
    + R(13, 13, 3, 3, '#3E2723') + R(W - 16, 13, 3, 3, '#3E2723') + R(13, plateH, 3, 3, '#3E2723') + R(W - 16, plateH, 3, 3, '#3E2723')
  o += tile(curRole, 20, 15, 32, k.soft)
  const pillW = [...c.status.t].length * 6.6 + 24
  o += tag(W - 20, 20, c.status.t, c.status.kind)
  o += T(60, 29, fit(c.title, W - 60 - pillW - 30, 15), CREAM, 15, ' font-weight="700" stroke="#3E2723" stroke-width="2.5" paint-order="stroke"')
  o += T(60, 45, fit(`${c.group ? c.group + ' · ' : ''}bước ${Math.min(done + 1, c.steps.length)}/${c.steps.length} · ${c.updatedText}`, W - 80, 11.5), '#F1D9B5', 11.5, '', MONO)
  // big number + ETA, then the total bar
  let y = 8 + plateH + 6
  o += T(pad, y + 26, `${Math.round(c.total * 100)}%`, k.main, 26, ' font-weight="800" stroke="#0E1320" stroke-width="3" paint-order="stroke"', MONO)
  o += TR(W - pad, y + 22, fit(c.etaText, inner - 96, 12.5), TEXT, 12.5, ' font-weight="600"')
  o += totalBar(pad + 2, y + 36, inner - 4, 10, c.steps, c.progress, c.status.kind === 'stale' ? 'run' : c.status.kind)
  y += 58
  // steps
  c.steps.forEach((s, i) => {
    const yy = y + i * rowH + (cur >= 0 && i > cur ? curExtra + msgH : 0)
    const now = s.state === 'now'
    if (now) o += R(pad - 6, yy - 4, inner + 12, rowH + curExtra + 2, OUT) + R(pad - 5, yy - 3, inner + 10, rowH + curExtra, k.soft) + R(pad - 5, yy - 3, 3, rowH + curExtra, k.main)
    if (i < c.steps.length - 1) o += R(pad + 10, yy + 23, 2, rowH - 19 + (now ? curExtra + msgH : 0), s.state === 'done' ? '#2F7A4D' : LINE)
    o += tile(s.role, pad, yy, 22, s.state === 'done' ? '#1F4A33' : now ? k.soft : PANEL2, now ? k.main : undefined)
    if (s.state === 'done') o += R(pad + 14, yy + 13, 10, 10, OUT) + R(pad + 15, yy + 14, 8, 8, COL.done.main) + R(pad + 17, yy + 18, 1, 1, OUT) + R(pad + 18, yy + 19, 1, 1, OUT) + R(pad + 19, yy + 18, 1, 1, OUT) + R(pad + 20, yy + 17, 1, 1, OUT)
    const right = s.state === 'done' ? (s.took ?? 'xong') : now ? `${s.elapsed ? 'đã ' + s.elapsed : 'đang làm'}${s.left ? ' · còn ' + s.left : ''}` : s.guess ? `~${s.guess}` : ''
    const rw = [...right].length * 6.8 + 8
    o += T(pad + 32, yy + 15.5, fit(s.label, inner - 32 - rw, 13), s.state === 'wait' ? DIM : TEXT, 13, now ? ' font-weight="700"' : '')
    o += TR(W - pad, yy + 15.5, right, now ? k.main : s.state === 'done' ? '#7FE3A5' : DIM, 11.5, now ? ' font-weight="700"' : '', MONO)
    if (now) {
      const bw = inner - 32
      o += R(pad + 31, yy + 22, bw + 2, 7, OUT) + R(pad + 32, yy + 23, bw, 5, '#2B3448') + R(pad + 32, yy + 23, Math.max(4, bw * c.progress), 5, k.main, ' class="pl"') + R(pad + 32, yy + 23, bw, 1, '#FFFFFF', ' opacity=".18"')
      if (c.message) {
        const by = yy + rowH + curExtra - 2
        o += R(pad + 31, by - 1, inner - 30, msgH - 6, OUT) + R(pad + 32, by, inner - 32, msgH - 8, '#141A27') + R(pad + 32, by, 3, msgH - 8, k.main)
          + T(pad + 44, by + 16, fit(c.message, inner - 50, 12.5), k.ink, 12.5, ' font-weight="700"') + T(pad + 44, by + 31, fit(c.reply ?? '', inner - 50, 11), SUB, 11, '', MONO)
      }
    }
  })
  // stale job (no current step): note at the bottom
  if (c.message && cur < 0) { const by = y + c.steps.length * rowH; o += T(pad, by + 12, fit(c.message, inner, 12), COL.stale.main, 12) }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges"><style>.pl{animation:pl 1.4s ease-in-out infinite}@keyframes pl{50%{opacity:.6}}.led{animation:led .9s steps(1) infinite}@keyframes led{50%{opacity:.25}}text{shape-rendering:auto}</style>${o}</svg>`
}

// header: a wooden sign "Văn phòng · chủ tịch" with four counter plaques (LED lights up when the count is not 0)
export function headerSvg(W: number, running: number, waits: number, errs: number, done: number) {
  const items: [string, number, Kind][] = [['đang chạy', running, 'run'], ['chờ duyệt', waits, 'wait'], ['lỗi', errs, 'err'], ['xong', done, 'done']]
  const H = 78, gap = 6, cwid = (W - 32 - 3 * gap) / 4
  let o = frame(0, 0, W, H, PANEL, LINE)
  o += R(8, 8, W - 16, 26, OUT) + R(9, 9, W - 18, 24, WOOD) + R(9, 9, W - 18, 2, WOODHI) + R(9, 31, W - 18, 2, '#5A3420') + R(9, 20, W - 18, 1, WOOD2, ' opacity=".55"')
  // little gold briefcase
  o += R(15, 14, 14, 13, OUT) + R(16, 16, 12, 10, '#F5B800') + R(19, 12, 6, 3, OUT) + R(20, 13, 4, 2, '#F5B800') + R(16, 20, 12, 1, '#B8860B') + R(21, 19, 2, 3, '#FFE082')
  o += T(35, 26, 'Văn phòng · chủ tịch', CREAM, 13.5, ' font-weight="700" stroke="#3E2723" stroke-width="2.5" paint-order="stroke"')
  items.forEach(([label, n, kind], i) => {
    const x = 16 + i * (cwid + gap), on = n > 0, k = COL[kind]
    o += R(x, 42, cwid, 26, OUT) + R(x + 1, 43, cwid - 2, 24, on ? k.soft : PANEL2) + R(x + 1, 43, cwid - 2, 1, '#FFFFFF" opacity=".12')
      + R(x + 6, 52, 5, 5, on ? k.main : '#3A4558', on && kind !== 'done' ? ' class="led"' : '')
      + T(x + 16, 60, String(n), on ? k.main : DIM, 15, ' font-weight="800"', MONO)
      + T(x + 16 + String(n).length * 9 + 4, 59, fit(label, cwid - 30 - String(n).length * 9, 11), on ? k.ink : DIM, 11)
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges"><style>.pl{animation:pl 1.4s ease-in-out infinite}@keyframes pl{50%{opacity:.6}}.led{animation:led .9s steps(1) infinite}@keyframes led{50%{opacity:.25}}text{shape-rendering:auto}</style>${o}</svg>`
}

export function doneShelfSvg(W: number, rows: { title: string; when: string }[]) {
  const H = 34 + rows.length * 24
  let o = frame(0, 0, W, H, PANEL, LINE) + T(16, 22, `Đã xong (${rows.length})`, '#7FE3A5', 13, ' font-weight="700"')
  rows.forEach((r, i) => {
    const y = 32 + i * 24
    o += R(16, y + 3, 12, 12, OUT) + R(17, y + 4, 10, 10, COL.done.main) + T(36, y + 14.5, fit(r.title, W - 110, 12.5), TEXT, 12.5) + TR(W - 16, y + 14.5, r.when, SUB, 12, '', MONO)
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges">${o}</svg>`
}

// footer strip in the same style: LED "live" and when the office last read the status
export function footerSvg(W: number, text: string, isError: boolean) {
  const H = 26
  const o = R(0, 0, W, H, OUT) + R(1, 1, W - 2, H - 2, PANEL2) + R(1, 1, W - 2, 1, '#FFFFFF" opacity=".1')
    + R(9, 10, 6, 6, isError ? COL.err.main : COL.done.main, ' class="led"')
    + T(21, 17, isError ? 'LỖI' : 'TRỰC TIẾP', isError ? COL.err.main : COL.done.main, 10.5, ' font-weight="700"', MONO)
    + T(isError ? 48 : 86, 17, fit(text, W - (isError ? 56 : 94), 11.5), SUB, 11.5)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges"><style>.led{animation:led .9s steps(1) infinite}@keyframes led{50%{opacity:.25}}text{shape-rendering:auto}</style>${o}</svg>`
}

// pixel button face (the label is a plain Button drawn on top, so it stays a real, pressable control)
export function buttonSvg(w: number, h: number, tone: 'wood' | 'primary' | 'danger') {
  const f = tone === 'primary' ? ['#1F6E43', '#2E9E5F', '#57C784'] : tone === 'danger' ? ['#7A2328', '#A8343A', '#D9585E'] : [WOOD, WOOD2, WOODHI]
  const o = R(2, 0, w - 4, h, OUT) + R(0, 2, w, h - 4, OUT) + R(2, 1, w - 4, h - 2, f[0]) + R(1, 2, w - 2, h - 4, f[0])
    + R(2, 1, w - 4, h - 5, f[1]) + R(1, 3, w - 2, h - 8, f[1]) + R(3, 2, w - 6, 1, f[2])
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">${o}</svg>`
}
