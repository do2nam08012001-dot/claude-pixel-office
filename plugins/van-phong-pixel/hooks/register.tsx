import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { Film, Poll, Role, Step } from '../types'
import { ASSETS } from './assets'
import { officeSvg, legacy } from './scene'

const PANE = 'van-phong'
const TITLE = 'Văn phòng'
const POLL_MS = 30_000
const STALE_MS = 15 * 60_000
const SVG_LIMIT = 130_500
const DEFAULT_DRIVE = 'gdrive:jp-studio'
const films = atom({ plugin: 'van-phong-pixel', key: 'films' } as const, [] as Film[], { shape: 'films-3' })
const poll = atom({ plugin: 'van-phong-pixel', key: 'poll' } as const, { at: 0, error: '' } as Poll)
const focus = atom({ plugin: 'van-phong-pixel', key: 'focus' } as const, '')
let lastScrolled = ''

// Legacy video pipeline (v1 status files of the jp video repos); est = rough seconds per stage
const VIDEO_STEPS: Step[] = [
  { id: 'inputs', label: 'Nhận đầu vào', role: 'fetch', est: 120 }, { id: 'research', label: 'Nghiên cứu', role: 'research', est: 1200 },
  { id: 'plan', label: 'Kế hoạch', role: 'plan', est: 900 }, { id: 'render', label: 'Render', role: 'build', est: 1800 },
  { id: 'qa', label: 'QA', role: 'check', est: 300 }, { id: 'deliver', label: 'Giao phim', role: 'deliver', est: 180 },
]
const ROLES: Role[] = ['fetch', 'research', 'plan', 'build', 'check', 'deliver']
const GROUP_VI: Record<string, string> = { 'jp-history-video': 'video lịch sử', 'jp-explainer-video': 'video explainer' }
const dur = (s: number) => (s < 90 ? `${Math.max(1, Math.round(s))} giây` : s < 90 * 60 ? `${Math.round(s / 60)} phút` : `${Math.floor(s / 3600)} giờ ${Math.round((s % 3600) / 60)} phút`)
const clock = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

type StepView = Step & { state: 'done' | 'now' | 'wait'; took?: number; elapsed?: number; left?: number | null; guess?: number | null }
type View = { steps: StepView[]; idx: number; allDone: boolean; progress: number; scene: any; total: number; remaining: number | null; known: boolean }

function view(f: Film, now: number): View {
  let steps: Step[], idx: number, allDone: boolean, progress: number, scene: any
  if (Array.isArray(f.workflow) && f.workflow.length) {
    steps = f.workflow.map((s, i) => ({ id: String(s.id ?? i), label: String(s.label ?? s.id ?? `Bước ${i + 1}`), role: (ROLES.includes(s.role) ? s.role : ROLES[Math.min(i, 5)]) as Role, est: typeof s.est === 'number' ? s.est : undefined }))
    allDone = !!f.done || f.step === 'done'
    idx = allDone ? steps.length : steps.findIndex(s => s.id === f.step)
    progress = Math.max(0, Math.min(1, f.progress ?? 0))
    const labels: Record<string, string> = {}
    for (const s of steps) if (!labels[s.role]) labels[s.role] = s.label
    if (idx >= 0 && idx < steps.length) labels[steps[idx].role] = steps[idx].label
    const active = idx >= 0 && idx < steps.length ? steps[idx].role : null
    scene = { active, progress, doneRoles: steps.slice(0, Math.max(0, idx)).map(s => s.role).filter(r => r !== active), allDone, blocked: f.blocked, approval: f.approval, labels }
  } else {
    steps = VIDEO_STEPS
    const map: Record<string, number> = { idle: -1, inputs: 0, research: 1, plan: 2, render: 3, qa: 4, deliver: 5, done: 6 }
    idx = map[f.stage ?? 'idle'] ?? -1; allDone = f.stage === 'done'
    progress = f.stage === 'render' ? f.render ?? 0 : 0
    scene = legacy(f)
  }
  const h = f.history ?? {}
  const tooks = steps.map(s => (h[s.id]?.start && h[s.id]?.end ? (h[s.id].end! - h[s.id].start) / 1000 : undefined))
  const doneT = tooks.filter((x): x is number => typeof x === 'number')
  const avg = doneT.length ? doneT.reduce((a, b) => a + b, 0) / doneT.length : null
  let remaining: number | null = 0, spent = 0, known = true
  const sv: StepView[] = steps.map((s, i) => {
    if (allDone || i < idx) { const took = tooks[i]; if (took) spent += took; return { ...s, state: 'done', took } }
    if (i === idx) {
      const elapsed = h[s.id]?.start ? Math.max(0, (now - h[s.id].start) / 1000) : undefined
      let left: number | null = typeof f.eta === 'number' ? f.eta
        : progress > 0.05 && elapsed ? elapsed * (1 - progress) / progress
        : s.est ? Math.max(s.est - (elapsed ?? 0), s.est * 0.1)
        : avg ? Math.max(avg - (elapsed ?? 0), avg * 0.1) : null
      if (elapsed) spent += elapsed
      if (left === null) known = false; else remaining! += left
      return { ...s, state: 'now', elapsed, left }
    }
    const guess = s.est ?? avg
    if (guess == null) known = false; else remaining! += guess
    return { ...s, state: 'wait', guess }
  })
  if (allDone) remaining = 0
  const total = known && spent + (remaining ?? 0) > 0 ? spent / (spent + (remaining ?? 0)) : (Math.max(0, idx) + progress) / Math.max(1, steps.length)
  return { steps: sv, idx, allDone, progress, scene, total: allDone ? 1 : Math.min(0.99, total), remaining: known ? remaining : null, known }
}

// ---- small SVG progress bars (drawn by the desktop Svg element) ----
function overallBar(v: View, blocked: boolean | undefined, w: number) {
  const n = v.steps.length, weights = v.steps.map(s => s.took ?? s.est ?? s.guess ?? s.left ?? 1), sum = weights.reduce((a, b) => a + (b || 1), 0)
  let x = 0, segs = ''
  v.steps.forEach((s, i) => {
    const sw = (weights[i] || 1) / sum * 100, gap = i < n - 1 ? 0.6 : 0
    const base = `<rect x="${x}" y="0" width="${Math.max(0.5, sw - gap)}" height="6" rx="1.2" fill="#2B3647"/>`
    const fill = s.state === 'done' ? `<rect x="${x}" y="0" width="${Math.max(0.5, sw - gap)}" height="6" rx="1.2" fill="#2E9E57"/>`
      : s.state === 'now' ? `<rect x="${x}" y="0" width="${Math.max(0.6, (sw - gap) * Math.max(0.04, v.progress))}" height="6" rx="1.2" fill="${blocked ? '#E53935' : '#3B82F6'}" class="pulse"/>` : ''
    segs += base + fill; x += sw
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 6" preserveAspectRatio="none" width="${w}" height="12"><style>.pulse{animation:p 1.4s ease-in-out infinite}@keyframes p{50%{opacity:.6}}</style>${segs}</svg>`
}
const miniBar = (f: number, w: number, color: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 4" preserveAspectRatio="none" width="${w}" height="6"><rect width="100" height="4" rx="2" fill="#2B3647"/><rect width="${Math.max(2, f * 100)}" height="4" rx="2" fill="${color}"><animate attributeName="opacity" values="1;.55;1" dur="1.4s" repeatCount="indefinite"/></rect></svg>`

// Pull complete JSON objects out of concatenated text (rclone cat joins files; files may be pretty-printed).
function objects(text: string): any[] {
  const out: any[] = []; let depth = 0, start = -1, inStr = false, esc = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '{') { if (depth++ === 0) start = i }
    else if (c === '}' && depth > 0 && --depth === 0) { try { out.push(JSON.parse(text.slice(start, i + 1))) } catch { /* skip */ } }
  }
  return out
}
async function home($: any): Promise<string> {
  const cached = (await $.store.get('home')) as string | undefined
  if (cached) return cached
  for (const argv of [['cmd', '/c', 'echo %USERPROFILE%'], ['sh', '-c', 'printf %s "$HOME"']]) {
    try { const r = await $.process.run(argv, { timeoutMs: 5000 }); const h = r.stdout.trim(); if (r.exitCode === 0 && h && !h.includes('%')) { await $.store.set('home', h); return h } } catch { /* next */ }
  }
  return ''
}
async function rclone($: any): Promise<string> {
  const cached = (await $.store.get('rclone')) as string | undefined
  if (cached) return cached
  for (const cand of ['rclone', 'rclone.exe']) {
    try { const r = await $.process.run([cand, 'version'], { timeoutMs: 8000 }); if (r.exitCode === 0) { await $.store.set('rclone', cand); return cand } } catch { /* not on PATH */ }
  }
  try {
    const r = await $.process.run(['powershell', '-NoProfile', '-Command',
      "(Get-ChildItem \"$env:LOCALAPPDATA\\Microsoft\\WinGet\" -Recurse -Filter rclone.exe -ErrorAction SilentlyContinue | Select-Object -First 1).FullName"], { timeoutMs: 25000 })
    const p = r.stdout.trim()
    if (p) { await $.store.set('rclone', p); return p }
  } catch { /* no powershell */ }
  return ''
}
const isDone = (f: Film) => !!f.done || f.step === 'done' || f.stage === 'done'

async function refresh($: any) {
  const list: Film[] = [], errors: string[] = []
  const h = await home($)
  const dir = h ? `${h}/.claude/van-phong` : ''
  let drive = DEFAULT_DRIVE
  if (dir) {
    try { const cfg = JSON.parse(await $.fs.read(`${dir}/config.json`)); if (typeof cfg.drive === 'string') drive = cfg.drive } catch { /* defaults */ }
    try {
      for (const e of await $.fs.list(`${dir}/status`)) {
        if (e.kind !== 'file' || !e.name.endsWith('.json')) continue
        try { for (const o of objects(await $.fs.read(`${dir}/status/${e.name}`))) if (o.slug) list.push({ ...o, source: 'local', updated: o.updated || e.mtimeMs }) } catch { /* unreadable */ }
      }
    } catch { /* no local folder */ }
  }
  if (drive) {
    try {
      const bin = await rclone($)
      if (!bin) throw new Error('chưa cài rclone')
      const r = await $.process.run([bin, 'cat', drive, '--include', '/*/status/*.json'], { timeoutMs: 25000 })
      if (r.exitCode !== 0) throw new Error((r.stderr || 'rclone lỗi').split('\n').filter((l: string) => l && !l.includes('NOTICE')).slice(-1)[0] || 'rclone lỗi')
      for (const o of objects(r.stdout)) if (o.slug && !list.some(f => f.slug === o.slug)) list.push({ ...o, source: 'drive' })
    } catch (err: any) { errors.push(`Drive: ${String(err?.message ?? err).slice(0, 120)}`) }
  }
  // active jobs first (newest first), finished ones after
  list.sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || b.updated - a.updated)
  await update($, films, () => list)
  await update($, poll, () => ({ at: Date.now(), error: list.length ? '' : errors.join(' · ') }))
  // keep the step being worked on in view: scroll to it when it changes
  const want = (await read($, focus)) ?? ''
  const shown = list.find(f => f.slug === want) ?? list.find(f => !isDone(f))
  if (shown) {
    const v = view(shown, Date.now())
    const key = v.allDone ? `job-${shown.slug}` : `cur-${shown.slug}`
    const mark = `${key}:${v.idx}:${shown.blocked ? 1 : 0}:${shown.approval ? 1 : 0}`
    if (mark !== lastScrolled) { lastScrolled = mark; try { await $.ui.scroll({ in: PANE, to: { key }, block: 'center' }) } catch { /* pane closed */ } }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'vp', description: 'Mở ô văn phòng pixel: tiến độ, lỗi và việc chờ duyệt của các quy trình đang chạy' })
    void $.ui.open({ id: PANE, title: TITLE })
    void refresh($)
    $.clock.every(POLL_MS, () => { void refresh($) })
    return next(e)
  })

  on('command.run', { command: 'vp' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    lastScrolled = ''
    void refresh($)
    return { text: 'Đã mở ô Văn phòng.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els: any = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Svg = els.Svg
    const list = (await read($, films)) ?? []
    const p = (await read($, poll)) ?? { at: 0, error: '' }
    const want = (await read($, focus)) ?? ''
    const now = Date.now()
    const cols = ((e.props as any).bodyColumns ?? 56) as number
    const px = Math.round(Math.max(220, Math.min(720, cols * 8.6)))
    const active = list.filter(f => !isDone(f)), finished = list.filter(isDone)
    const shown = list.find(f => f.slug === want) ?? active[0] ?? list[0]
    const errs = list.filter(f => f.blocked).length, waits = list.filter(f => f.approval && !f.blocked).length
    const sceneState = shown ? view(shown, now).scene : { active: null, doneRoles: [] }
    let scene = officeSvg(ASSETS, sceneState).full(px)
    if (scene.length > SVG_LIMIT) scene = officeSvg(ASSETS, { ...sceneState, lite: true }).full(px)

    const status = (f: Film) => f.blocked ? { t: 'Lỗi', c: 'red' } : f.approval ? { t: 'Chờ duyệt', c: 'yellow' } : isDone(f) ? { t: 'Xong', c: 'green' } : now - f.updated > STALE_MS ? { t: 'Im lặng', c: 'yellow' } : { t: 'Đang làm', c: 'cyan' }
    const card = (f: Film) => {
      const v = view(f, now), s = status(f), focused = f.slug === shown?.slug
      const group = GROUP_VI[f.group ?? f.skill ?? ''] ?? f.group ?? f.skill ?? ''
      const eta = v.allDone ? 'đã xong' : v.remaining == null ? 'chưa ước lượng được thời gian còn lại' : `còn ~${dur(v.remaining)} · xong khoảng ${clock(now + v.remaining * 1000)}`
      return (
        <Box key={`job-${f.slug}`} flexDirection="column" borderStyle="round" borderColor={focused ? 'cyan' : 'gray'} paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold>{f.title || f.slug}</Text>
            <Box flexDirection="row" gap={1}>
              <Text color={s.c}>● {s.t}</Text>
              {!focused && <Button key={'xem-' + f.slug} label="Xem" onPress={() => update($, focus, () => f.slug)} />}
            </Box>
          </Box>
          {group ? <Text dimColor>{group} · {v.steps.length} bước · cập nhật {dur((now - f.updated) / 1000)} trước</Text> : null}
          {Svg ? <Svg source={overallBar(v, f.blocked, Math.max(120, px - 24))} alt={`Tổng ${Math.round(v.total * 100)}%`} width={Math.max(120, px - 24)} height={12} /> : null}
          <Text>Tổng <Text bold>{Math.round(v.total * 100)}%</Text> · {eta}</Text>
          {v.steps.map((st, i) => {
            const icon = st.state === 'done' ? '✓' : st.state === 'now' ? (f.blocked ? '!' : f.approval ? '?' : '▶') : '○'
            const color = st.state === 'done' ? 'green' : st.state === 'now' ? (f.blocked ? 'red' : f.approval ? 'yellow' : 'cyan') : undefined
            const right = st.state === 'done' ? (st.took ? dur(st.took) : 'xong')
              : st.state === 'now' ? `${st.elapsed ? `đang ${dur(st.elapsed)}` : 'đang làm'}${st.left != null ? ` · còn ~${dur(st.left)}` : ''}`
              : st.guess != null ? `~${dur(st.guess)}` : ''
            return (
              <Box key={st.state === 'now' ? `cur-${f.slug}` : `s-${f.slug}-${i}`} flexDirection="column">
                <Box flexDirection="row" justifyContent="space-between">
                  <Text color={color} dimColor={st.state === 'wait'} bold={st.state === 'now'}>{icon} {i + 1}. {st.label}</Text>
                  <Text dimColor={st.state !== 'now'} color={st.state === 'now' ? color : undefined}>{right}</Text>
                </Box>
                {st.state === 'now' && Svg && v.progress > 0 ? <Svg source={miniBar(v.progress, Math.max(100, px - 40), f.blocked ? '#E53935' : '#3B82F6')} alt={`${Math.round(v.progress * 100)}%`} width={Math.max(100, px - 40)} height={6} /> : null}
                {st.state === 'now' && (f.blocked || f.approval) ? (
                  <Box flexDirection="column" paddingLeft={2}>
                    <Text color={f.blocked ? 'red' : 'yellow'}>{f.message || (f.blocked ? 'Công việc báo bị vướng.' : 'Công việc chờ bạn trả lời.')}</Text>
                    <Text dimColor>{f.source === 'drive' ? 'Trả lời trong phiên cloud của việc này.' : 'Trả lời trong phiên đang chạy việc này.'}</Text>
                  </Box>
                ) : null}
              </Box>
            )
          })}
          {now - f.updated > STALE_MS && !v.allDone ? <Text color="yellow">Không cập nhật {dur((now - f.updated) / 1000)}: công việc có thể đã dừng.</Text> : null}
        </Box>
      )
    }
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>Văn phòng · chủ tịch</Text>
          <Box flexDirection="row" gap={1}>
            <Text dimColor>{active.length} đang chạy</Text>
            {waits > 0 && <Text color="yellow">{waits} chờ duyệt</Text>}
            {errs > 0 && <Text color="red">{errs} lỗi</Text>}
          </Box>
        </Box>
        {Svg ? <Svg source={scene} alt={shown ? `Văn phòng: ${shown.title || shown.slug}` : 'Văn phòng đang chờ việc'} width={px} height={px} isInteractive /> : null}
        {list.length === 0 ? <Text dimColor>Chưa có việc nào. Ghi trạng thái bằng office-status (xem README) hoặc gửi việc từ repo video.</Text> : null}
        {active.map(card)}
        {finished.length > 0 && <Text bold>Đã xong ({finished.length})</Text>}
        {finished.slice(0, 5).map(f => (
          <Box key={`job-${f.slug}`} flexDirection="row" justifyContent="space-between">
            <Text color="green">✓ {f.title || f.slug}</Text>
            <Box flexDirection="row" gap={1}>
              <Text dimColor>{clock(f.updated)}</Text>
              <Button key={'xem-' + f.slug} label="Xem" onPress={() => update($, focus, () => f.slug)} />
            </Box>
          </Box>
        ))}
        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor>{p.error ? p.error : p.at ? `Cập nhật ${dur((now - p.at) / 1000)} trước · tự làm mới mỗi 30 giây` : 'Đang đọc trạng thái…'}</Text>
          <Button key="lam-moi" label="Làm mới" onPress={() => { lastScrolled = ''; return refresh($) }} />
        </Box>
      </Box>
    )
  })
}
