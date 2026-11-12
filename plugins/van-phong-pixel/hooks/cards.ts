// Report cards drawn as SVG: modern, readable layout with pixel accents (role icons, segmented bar, frame corners).
export type CardStep = { label: string; role: string; state: 'done' | 'now' | 'wait'; w: number; took?: string; elapsed?: string; left?: string; guess?: string }
export type CardInput = {
  title: string; group: string; status: { t: string; kind: Kind }
  total: number; etaText: string; steps: CardStep[]; progress: number; message?: string; reply?: string; updatedText: string; focused: boolean
}
type Kind = 'run' | 'wait' | 'err' | 'done' | 'stale'

const SANS = `font-family="Segoe UI,system-ui,-apple-system,Roboto,sans-serif"`
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const fit = (s: string, px: number, size: number) => { const n = Math.max(4, Math.floor(px / (size * 0.56))), a = [...String(s)]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join('') }
const R = (x: number, y: number, w: number, h: number, c: string, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"${extra}/>`
const T = (x: number, y: number, s: string, c: string, size: number, extra = '') => `<text x="${x}" y="${y}" ${SANS} font-size="${size}" fill="${c}"${extra}>${esc(s)}</text>`
const TR = (x: number, y: number, s: string, c: string, size: number, extra = '') => T(x, y, s, c, size, ` text-anchor="end"${extra}`)

const COL: Record<Kind, { main: string; soft: string; ink: string }> = {
  run: { main: '#4C9DFF', soft: '#1D3557', ink: '#E6F1FF' }, wait: { main: '#F5A524', soft: '#4A3410', ink: '#FFF4DE' },
  err: { main: '#F0525A', soft: '#4A1A1E', ink: '#FFE9EA' }, done: { main: '#3FCB74', soft: '#173A27', ink: '#E5FBEE' }, stale: { main: '#A6AEBC', soft: '#2A303B', ink: '#F1F3F6' },
}
const BG = '#141B27', PANEL = '#1B2433', LINE = '#2A3548', TEXT = '#EEF2F8', SUB = '#9AA6B8', DIM = '#6F7A8E'

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
function tile(role: string, x: number, y: number, size: number, bg: string, ring?: string) {
  const s = size / 10
  return R(x, y, size, size, bg, ' rx="4"') + (ring ? R(x - 1.5, y - 1.5, size + 3, size + 3, 'none', ` rx="5" stroke="${ring}" stroke-width="1.5" class="pl"`) : '') + icon(role, x + s, y + s, s)
}

// total bar: one segment per step (width by its weight), done = green, current = status colour filled to its progress
function totalBar(x: number, y: number, w: number, h: number, steps: CardStep[], progress: number, kind: Kind) {
  const sum = steps.reduce((a, s) => a + Math.max(1, s.w), 0), gap = 3
  let o = '', cx = x
  steps.forEach((s) => {
    const sw = Math.max(4, (Math.max(1, s.w) / sum) * (w - gap * (steps.length - 1)))
    o += R(cx, y, sw, h, '#263247', ' rx="3"')
    if (s.state === 'done') o += R(cx, y, sw, h, COL.done.main, ' rx="3"')
    if (s.state === 'now') o += R(cx, y, Math.max(4, sw * Math.max(0.03, progress)), h, COL[kind].main, ' rx="3" class="pl"')
    cx += sw + gap
  })
  return o + R(x, y, w, h / 2.5, '#FFFFFF', ' rx="3" opacity=".07"')
}

export function cardSvg(c: CardInput, W: number) {
  const k = COL[c.status.kind], pad = 14, inner = W - pad * 2
  const cur = c.steps.findIndex(s => s.state === 'now'), done = c.steps.filter(s => s.state === 'done').length
  const rowH = 30, curExtra = 10, msgH = c.message && cur >= 0 ? 46 : 0
  const H = pad + 44 + 52 + c.steps.length * rowH + (cur >= 0 ? curExtra : 0) + msgH + (c.message && cur < 0 ? 18 : 0) + pad - 4
  let o = R(0, 0, W, H, BG, ' rx="10"') + R(1, 1, W - 2, H - 2, PANEL, ` rx="9" stroke="${c.focused ? k.main : LINE}" stroke-width="${c.focused ? 2 : 1}"`)
    + [[6, 6], [W - 10, 6], [6, H - 10], [W - 10, H - 10]].map(([x, y]) => R(x, y, 4, 4, c.focused ? k.main : '#3A465C')).join('')
  // header: current-step icon, title, sub line, status pill
  const curRole = cur >= 0 ? c.steps[cur].role : c.status.kind === 'done' ? 'deliver' : c.steps[0]?.role ?? 'build'
  o += tile(curRole, pad, pad, 30, k.soft)
  const pill = c.status.t, pw = [...pill].length * 7.4 + 20
  o += R(W - pad - pw, pad + 3, pw, 22, k.soft, ' rx="11"') + R(W - pad - pw + 9, pad + 11, 6, 6, k.main, ' rx="3"' + (c.status.kind === 'run' ? ' class="pl"' : ''))
    + T(W - pad - pw + 19, pad + 18.5, pill, k.ink, 11.5, ' font-weight="700"')
  o += T(pad + 40, pad + 13, fit(c.title, inner - 40 - pw - 8, 15), TEXT, 15, ' font-weight="700"')
  o += T(pad + 40, pad + 30, fit(`${c.group ? c.group + ' · ' : ''}bước ${Math.min(done + 1, c.steps.length)}/${c.steps.length} · ${c.updatedText}`, inner - 40, 12), SUB, 12)
  // big number + ETA, then the total bar
  let y = pad + 44
  o += T(pad, y + 22, `${Math.round(c.total * 100)}%`, k.main, 22, ' font-weight="800"')
  o += TR(W - pad, y + 20, fit(c.etaText, inner - 80, 12.5), TEXT, 12.5)
  o += totalBar(pad, y + 30, inner, 10, c.steps, c.progress, c.status.kind === 'stale' ? 'run' : c.status.kind)
  y += 52
  // steps
  c.steps.forEach((s, i) => {
    const yy = y + i * rowH + (cur >= 0 && i > cur ? curExtra + msgH : 0)
    const now = s.state === 'now'
    if (now) o += R(pad - 6, yy - 3, inner + 12, rowH + curExtra, k.soft, ' rx="6"')
    if (i < c.steps.length - 1) o += R(pad + 10, yy + 22, 2, rowH - 18 + (now ? curExtra + msgH : 0), s.state === 'done' ? '#2F7A4D' : LINE)
    o += tile(s.role, pad, yy, 22, s.state === 'done' ? '#1F4A33' : now ? k.soft : '#222B3B', now ? k.main : undefined)
    if (s.state === 'done') o += R(pad + 15, yy + 14, 9, 9, COL.done.main, ' rx="4.5"') + `<path d="M${pad + 17} ${yy + 18.5}l1.8 1.8 3.2-3.6" stroke="#0F2A1B" stroke-width="1.6" fill="none"/>`
    const right = s.state === 'done' ? (s.took ?? 'xong') : now ? `${s.elapsed ? 'đã ' + s.elapsed : 'đang làm'}${s.left ? ' · còn ' + s.left : ''}` : s.guess ? `~${s.guess}` : ''
    const rw = [...right].length * 6.5 + 8
    o += T(pad + 32, yy + 15.5, fit(s.label, inner - 32 - rw, 13), s.state === 'wait' ? DIM : TEXT, 13, now ? ' font-weight="700"' : '')
    o += TR(W - pad, yy + 15.5, right, now ? k.main : s.state === 'done' ? '#7FD9A0' : DIM, 12, now ? ' font-weight="600"' : '')
    if (now) {
      const bw = inner - 32
      o += R(pad + 32, yy + 23, bw, 5, '#263247', ' rx="2.5"') + R(pad + 32, yy + 23, Math.max(5, bw * c.progress), 5, k.main, ' rx="2.5" class="pl"')
      if (c.message) {
        const by = yy + rowH + curExtra - 2
        o += R(pad + 32, by, inner - 32, msgH - 8, k.main, ' rx="7" opacity=".16"') + R(pad + 32, by, 3, msgH - 8, k.main, ' rx="1.5"')
          + T(pad + 44, by + 16, fit(c.message, inner - 50, 12.5), k.ink, 12.5, ' font-weight="700"') + T(pad + 44, by + 31, fit(c.reply ?? '', inner - 50, 11.5), SUB, 11.5)
      }
    }
  })
  // stale job (no current step): note at the bottom
  if (c.message && cur < 0) { const by = y + c.steps.length * rowH; o += T(pad, by + 12, fit(c.message, inner, 12), COL.stale.main, 12) }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><style>.pl{animation:pl 1.4s ease-in-out infinite}@keyframes pl{50%{opacity:.6}}</style>${o}</svg>`
}

export function headerSvg(W: number, running: number, waits: number, errs: number, done: number) {
  const items: [string, number, Kind][] = [['đang chạy', running, 'run'], ['chờ duyệt', waits, 'wait'], ['lỗi', errs, 'err'], ['xong', done, 'done']]
  const cw = (W - 28 - 3 * 6) / 4
  let o = R(0, 0, W, 64, BG, ' rx="10"') + R(1, 1, W - 2, 62, PANEL, ` rx="9" stroke="${LINE}"`)
  o += R(12, 10, 14, 12, '#F5B800', ' rx="2"') + R(15, 7, 8, 4, '#F5B800', ' rx="1"') + R(15, 13, 8, 6, '#FFE082', ' rx="1"')
  o += T(32, 21, 'Văn phòng · chủ tịch', TEXT, 13.5, ' font-weight="700"')
  items.forEach(([label, n, kind], i) => {
    const x = 14 + i * (cw + 6), on = n > 0
    o += R(x, 30, cw, 26, on ? COL[kind].soft : '#202938', ' rx="6"') + T(x + 9, 48, String(n), on ? COL[kind].main : DIM, 15, ' font-weight="800"') + T(x + 9 + String(n).length * 9 + 4, 47.5, fit(label, cw - 26, 11.5), on ? COL[kind].ink : DIM, 11.5)
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 64" width="${W}" height="64">${o}</svg>`
}

export function doneShelfSvg(W: number, rows: { title: string; when: string }[]) {
  const H = 34 + rows.length * 24
  let o = R(0, 0, W, H, BG, ' rx="10"') + R(1, 1, W - 2, H - 2, PANEL, ` rx="9" stroke="${LINE}"`) + T(14, 22, `Đã xong (${rows.length})`, '#7FD9A0', 13, ' font-weight="700"')
  rows.forEach((r, i) => {
    const y = 32 + i * 24
    o += R(14, y + 3, 14, 14, COL.done.main, ' rx="7"') + `<path d="M17.5 ${y + 10}l2.5 2.5 4.5-5" stroke="#0F2A1B" stroke-width="1.8" fill="none"/>`
      + T(36, y + 14.5, fit(r.title, W - 110, 12.5), TEXT, 12.5) + TR(W - 14, y + 14.5, r.when, SUB, 12)
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${o}</svg>`
}
