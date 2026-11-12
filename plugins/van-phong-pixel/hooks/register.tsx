import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { Film, Owned, Poll, Role, Step } from '../types'
import { ASSETS } from './assets'
import { officeSvg, legacy } from './scene'
import { cardSvg, headerSvg } from './cards'
import type { CardStep } from './cards'

const PANE = 'van-phong'
const ROW = 'van-phong-row'
const TITLE = 'Văn phòng'
const POLL_MS = 5_000           // this session's jobs (local files + their Drive status, read directly)
const SCAN_EVERY = 6            // full Drive scan (jobs of other sessions) every 6th poll (30 s)
const DONE_KEEP = 10 * 60_000    // a finished job leaves the office 10 minutes after it is done
const HANDOFF_MS = 25_000       // how long a noticed step change plays the hand-off walk
const STALE_MS = 15 * 60_000
const SVG_LIMIT = 130_500
const DEFAULT_DRIVE = 'gdrive:jp-studio'
const films = atom({ plugin: 'van-phong-pixel', key: 'films' } as const, [] as Film[], { shape: 'films-3' })
const poll = atom({ plugin: 'van-phong-pixel', key: 'poll' } as const, { at: 0, error: '' } as Poll)
const focus = atom({ plugin: 'van-phong-pixel', key: 'focus' } as const, '')
// jobs started from THIS session (send.sh / office-status init seen in its Bash calls, or adopted with a button)
const owned = atom({ plugin: 'van-phong-pixel', key: 'owned' } as const, [] as Owned[])
// jobs of other sessions shown in the "other jobs" strip (not followed here)
const others = atom({ plugin: 'van-phong-pixel', key: 'others' } as const, [] as Film[], { shape: 'films-3' })
let busy = false, again = false, cwdSkill: string | undefined
const openOthers = atom({ plugin: 'van-phong-pixel', key: 'openOthers' } as const, false)
let lastScrolled = ''
// step changes the pane has noticed: slug -> { step, from, to, at }; the hand-off walk plays from the moment it is noticed
const seen = new Map<string, { step: string; from?: string; to?: string; at: number }>()
let ticks = 0, driveCache: Film[] = [], driveError = ''
// last known flags per job, to raise a toast when a job gets blocked, waits for approval or finishes
const flags = new Map<string, string>()
// last scene: reuse the same SVG while nothing visible changed, so the pane does not reload (flash)
let sceneKey = '', sceneSvg = ''
// double buffer: the old scene stays on top (overlay) while the new one loads underneath, then the overlay goes
let shownSvg = '', overlaySvg = '', swapping = false

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

type StepView = Step & { state: 'done' | 'now' | 'wait'; took?: number; elapsed?: number; left?: number | null; guess?: number | null; w: number }
type View = { over: boolean; steps: StepView[]; idx: number; allDone: boolean; progress: number; frac: number; scene: any; total: number; remaining: number | null; known: boolean }

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
    // share of the current stage: render %, the cloud's notes (research / plan), upload % (inputs)
    const pk = f.stage === 'render' ? f.render : f.stage === 'plan' ? f.plan : f.stage === 'research' ? f.research : f.progress
    progress = Math.max(0, Math.min(1, pk ?? 0))
    scene = legacy(f)
  }
  const h = f.history ?? {}
  // a step that started in the last 40 s: the previous step's employee carries the work to the next room
  const cur0 = idx > 0 && idx < steps.length ? steps[idx] : null
  const n = seen.get(f.slug)
  if (cur0 && n && n.step === cur0.id && n.from && now - n.at < HANDOFF_MS) scene = { ...scene, handoff: { from: n.from, to: n.to }, handoffAge: (now - n.at) / 1000, handoffAt: n.at }
  const tooks = steps.map(s => (h[s.id]?.start && h[s.id]?.end ? (h[s.id].end! - h[s.id].start) / 1000 : undefined))
  const doneT = tooks.filter((x): x is number => typeof x === 'number')
  const avg = doneT.length ? doneT.reduce((a, b) => a + b, 0) / doneT.length : null
  let remaining: number | null = 0, known = true, frac = 0
  // how fast this job runs vs the estimates (finished steps): later steps are scaled by it
  let tookSum = 0, estSum = 0
  steps.forEach((s, i) => { if ((allDone || i < idx) && tooks[i] && s.est) { tookSum += tooks[i]!; estSum += s.est } })
  const pace = estSum > 0 ? Math.max(0.5, Math.min(3, tookSum / estSum)) : 1
  let over = false
  const sv: StepView[] = steps.map((s, i) => {
    if (allDone || i < idx) { const took = tooks[i]; return { ...s, state: 'done', took, w: took ?? s.est ?? avg ?? 60 } }
    if (i === idx) {
      const elapsed = h[s.id]?.start ? Math.max(0, (now - h[s.id].start) / 1000) : undefined
      // time left: the job's own ETA, else from the reported share, else the (pace-scaled) estimate while it still holds.
      // A step past its estimate with no reported share has NO honest ETA: say so instead of a number that keeps sliding.
      const base = s.est ? s.est * pace : avg
      let left: number | null = typeof f.eta === 'number' ? f.eta
        : progress > 0.03 && elapsed ? elapsed * (1 - progress) / progress
        : base && (elapsed ?? 0) < base ? base - (elapsed ?? 0) : null
      if (left === null && !(progress > 0.03)) over = true
      if (left === null) known = false; else remaining! += left
      // share of the current step done: reported progress, else time spent vs time still expected (never 100 %)
      frac = progress > 0 ? progress : elapsed && left != null ? elapsed / (elapsed + left) : over ? 0.9 : 0
      frac = Math.min(0.95, Math.max(0, frac))
      return { ...s, state: 'now', elapsed, left, w: s.est ?? avg ?? ((elapsed ?? 0) + (left ?? 0) || 60) }
    }
    const guess = s.est ? s.est * pace : avg
    if (guess == null) known = false; else remaining! += guess
    return { ...s, state: 'wait', guess, w: guess ?? 60 }
  })
  if (allDone) remaining = 0
  // progress per second of the current step, so the HP bar above the worker grows smoothly between refreshes
  const curV = sv.find(s => s.state === 'now')
  if (curV && curV.left && curV.left > 0) scene = { ...scene, rate: (1 - progress) / curV.left }
  // total % = finished step weights + the current step's share, over all weights (same weights as the bar segments)
  const W = sv.reduce((a, s) => a + s.w, 0) || 1
  const total = sv.reduce((a, s) => a + (s.state === 'done' ? s.w : s.state === 'now' ? s.w * frac : 0), 0) / W
  return { over, steps: sv, idx, allDone, progress, frac, scene, total: allDone ? 1 : Math.min(0.99, total), remaining: known ? remaining : null, known }
}

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
function summary(list: Film[], now: number) {
  if (!list.length) return 'Chưa có việc nào trong văn phòng.'
  return list.slice(0, 8).map(f => {
    const v = view(f, now), cur = v.idx >= 0 && v.idx < v.steps.length ? v.steps[v.idx] : null
    const state = f.blocked ? 'LỖI' : f.approval ? 'CHỜ DUYỆT' : v.allDone ? 'XONG' : 'đang làm'
    const eta = v.allDone ? '' : v.remaining != null ? ` · còn ~${dur(v.remaining)}` : ''
    return `• ${f.title || f.slug} — ${state} · ${Math.round(v.total * 100)}%${cur ? ` · bước ${v.idx + 1}/${v.steps.length} ${cur.label}` : ''}${eta}${f.message ? ` · ${f.message}` : ''}`
  }).join('\n')
}
const isDone = (f: Film) => !!f.done || f.step === 'done' || f.stage === 'done'

async function refresh($: any) {
  if (busy) { again = true; return }   // a slow rclone call must not overlap the next tick (that made the count jump 2 -> 0)
  busy = true
  try { do { again = false; await refreshInner($) } while (again) } finally { busy = false }
}
async function refreshInner($: any) {
  const all: Film[] = [], errors: string[] = []
  const h = await home($)
  const dir = h ? `${h}/.claude/van-phong` : ''
  let drive = DEFAULT_DRIVE
  if (dir) {
    try { const cfg = JSON.parse(await $.fs.read(`${dir}/config.json`)); if (typeof cfg.drive === 'string') drive = cfg.drive } catch { /* defaults */ }
    try {
      for (const e of await $.fs.list(`${dir}/status`)) {
        if (e.kind !== 'file' || !e.name.endsWith('.json')) continue
        try { for (const o of objects(await $.fs.read(`${dir}/status/${e.name}`))) if (o.slug) all.push({ ...o, source: 'local', updated: o.updated || e.mtimeMs }) } catch { /* unreadable */ }
      }
    } catch { /* no local folder */ }
  }
  const mine0 = (await read($, owned)) ?? []
  const bin = drive ? await rclone($) : ''
  if (drive && !bin) driveError = 'Drive: chưa cài rclone'
  else if (drive) {
    const fail = (r: any) => (r.stderr || 'rclone lỗi').split(/\r?\n/).filter((l: string) => l && !l.includes('NOTICE')).slice(-1)[0] || 'rclone lỗi'
    if (ticks++ % SCAN_EVERY === 0 || mine0.some(m => !m.skill)) {
      try {
        const fresh: Film[] = []
        const r = await $.process.run([bin, 'cat', drive, '--include', '/*/status/*.json'], { timeoutMs: 25000 })
        if (r.exitCode !== 0) throw new Error(fail(r))
        for (const o of objects(r.stdout)) if (o.slug) fresh.push({ ...o, source: 'drive' })
        driveCache = fresh; driveError = ''   // swap only on success: a failed read keeps the last list
      } catch (err: any) { driveError = `Drive: ${String(err?.message ?? err).slice(0, 120)}` }
    } else {
      // this session's jobs: one small file each, read in parallel (a few seconds at most)
      const got = await Promise.all(mine0.map(async m => {
        try { const r = await $.process.run([bin, 'cat', `${drive}/${m.skill}/status/${m.slug}.json`], { timeoutMs: 15000 }); return r.exitCode === 0 ? objects(r.stdout)[0] ?? null : null } catch { return null }
      }))
      for (const o of got) if (o?.slug) driveCache = [...driveCache.filter(x => x.slug !== o.slug), { ...o, source: 'drive' }]
    }
    // learn the skill (Drive folder) of a job claimed without one
    for (const m of mine0) if (!m.skill) { const c = driveCache.find(x => x.slug === m.slug); if (c?.skill) await update($, owned, (o: Owned[]) => (o ?? []).map(x => x.slug === m.slug ? { ...x, skill: c.skill } : x)) }
  }
  if (drive) { for (const o of driveCache) if (!all.some(f => f.slug === o.slug)) all.push(o); if (driveError) errors.push(driveError) }
  // this session's jobs; one not on Drive yet shows at once as "uploading"
  const mine = (await read($, owned)) ?? []
  const list: Film[] = mine.map(m => all.find(f => f.slug === m.slug)
    ?? { slug: m.slug, title: m.title || m.slug, skill: m.skill, stage: 'inputs', message: 'Đang tải dữ liệu lên Drive…', updated: m.at, source: 'drive', history: { inputs: { start: m.at } } } as Film)
  // finished jobs leave on their own; other sessions' finished jobs are not shown at all
  const gone = list.filter(f => isDone(f) && Date.now() - f.updated > DONE_KEEP).map(f => f.slug)
  if (gone.length) await update($, owned, (o: Owned[]) => (o ?? []).filter(x => !gone.includes(x.slug)))
  for (let i = list.length - 1; i >= 0; i--) if (gone.includes(list[i].slug)) list.splice(i, 1)
  await update($, others, () => all.filter(f => !mine.some(m => m.slug === f.slug) && !isDone(f)).sort((a, b) => b.updated - a.updated))
  // notice step changes (the previous step's role hands the work to the new one)
  const nowMs = Date.now()
  for (const f of list) {
    const v = view(f, nowMs), cur = v.idx >= 0 && v.idx < v.steps.length ? v.steps[v.idx] : null, key = cur ? cur.id : v.allDone ? 'done' : 'idle'
    const prev = seen.get(f.slug)
    if (!prev) seen.set(f.slug, { step: key, at: 0 })
    else if (prev.step !== key) seen.set(f.slug, cur && v.idx > 0 ? { step: key, from: v.steps[v.idx - 1].role, to: cur.role, at: nowMs } : { step: key, at: 0 })
  }
  // tell the chairman at once when something needs them or a job is done
  for (const f of list) {
    const now = isDone(f) ? 'done' : f.blocked ? 'err' : f.approval ? 'wait' : 'run', before = flags.get(f.slug)
    if (before !== undefined && before !== now && now !== 'run') {
      const msg = now === 'err' ? `Lỗi · ${f.title || f.slug}: ${f.message || 'bị vướng'} — trả lời ngay trong phiên này`
        : now === 'wait' ? `Chờ duyệt · ${f.title || f.slug}: ${f.message || 'cần bạn trả lời'} — trả lời ngay trong phiên này`
        : `Xong · ${f.title || f.slug} — gõ "lấy video" để tải về máy`
      try { $.ui.toast(msg) } catch { /* no surface */ }
    }
    flags.set(f.slug, now)
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

async function adopt($: any, f: Film) {
  await update($, owned, (m: Owned[]) => [...(m ?? []).filter(x => x.slug !== f.slug), { slug: f.slug, title: f.title || f.slug, skill: f.skill, at: Date.now() }])
  await update($, films, (l: Film[]) => [f, ...(l ?? []).filter(x => x.slug !== f.slug)])
  await update($, others, (l: Film[]) => (l ?? []).filter(x => x.slug !== f.slug))
  await update($, focus, () => f.slug); lastScrolled = ''
  void refresh($)
}
// stop following a job here; a job that went silent (or is done) also loses its status file on Drive, so no session shows it again
async function drop($: any, f: Film, purge: boolean) {
  await update($, owned, (m: Owned[]) => (m ?? []).filter(x => x.slug !== f.slug))
  await update($, films, (l: Film[]) => (l ?? []).filter(x => x.slug !== f.slug))
  await update($, others, (l: Film[]) => (l ?? []).filter(x => x.slug !== f.slug))
  if (purge && f.source === 'drive' && f.skill) {
    try {
      const bin = await rclone($)
      if (bin) await $.process.run([bin, 'deletefile', `${DEFAULT_DRIVE}/${f.skill}/status/${f.slug}.json`], { timeoutMs: 20000 })
      driveCache = driveCache.filter(x => x.slug !== f.slug)
    } catch { /* offline: it just stays in the other list */ }
  }
  void refresh($)
}
// a Bash call of this session that sends a job: the job belongs to this session from that moment
const SEND = /local\/send\.sh["']?\s+([a-z0-9][a-z0-9-]*)/, INIT = /office-status\.mjs["']?\s+init\s+["']?([A-Za-z0-9._-]+)/
const TITLE_RE = /--title\s+(?:"([^"]*)"|'([^']*)')/
async function claim($: any, command: string) {
  const m = SEND.exec(command) ?? INIT.exec(command)
  if (!m) return
  const tm = TITLE_RE.exec(command), skill = /explainer/.test(command) ? 'jp-explainer-video' : /history-video/.test(command) ? 'jp-history-video' : cwdSkill
  await update($, owned, (o: Owned[]) => (o ?? []).some(x => x.slug === m[1]) ? o : [...(o ?? []), { slug: m[1], title: tm ? tm[1] ?? tm[2] : m[1], skill, at: Date.now() }])
  await update($, focus, () => m[1]); lastScrolled = ''
  void refresh($)
}

// the office drawing: shared by the side pane and the transcript row (cloud sessions place no panes)
async function drawOffice($: any, e: any) {
  const els: any = $.ui.resolve(e)
  const { Box, Text, Button } = els
  const Svg = els.Svg
  const list = (await read($, films)) ?? []
  const other = (await read($, others)) ?? []
  const showOthers = (await read($, openOthers)) ?? false
  const p = (await read($, poll)) ?? { at: 0, error: '' }
  const want = (await read($, focus)) ?? ''
  const now = Date.now()
  const cols = ((e.props as any)?.bodyColumns ?? e.viewport?.columns ?? 60) as number
  const px = Math.round(Math.max(220, Math.min(720, cols * 8.6)))
  const active = list.filter(f => !isDone(f)), finished = list.filter(isDone)
  const shown = list.find(f => f.slug === want) ?? active[0] ?? list[0]
  const errs = list.filter(f => f.blocked).length, waits = list.filter(f => f.approval && !f.blocked).length
  const sceneState = shown ? view(shown, now).scene : { active: null, doneRoles: [] }
  // progress is animated inside the SVG (HP bars run at the real rate), so only visible state changes redraw it
  const key = JSON.stringify({ ...sceneState, progress: undefined, rate: undefined, handoffAge: undefined, px })
  if (key !== sceneKey) {
    sceneKey = key
    sceneSvg = officeSvg(ASSETS, sceneState).full(px)
    if (sceneSvg.length > SVG_LIMIT) sceneSvg = officeSvg(ASSETS, { ...sceneState, lite: true }).full(px)
  }
  if (!shownSvg) shownSvg = sceneSvg
  else if (sceneSvg !== shownSvg && !swapping) {
    swapping = true; overlaySvg = shownSvg; const next = sceneSvg
    const redraw = () => update($, poll, (q: Poll) => ({ ...(q ?? { at: 0, error: '' }) }))
    $.clock.after(900, async () => { shownSvg = next; await redraw()
      $.clock.after(1600, async () => { overlaySvg = ''; swapping = false; await redraw() }) })
  }

  const kindOf = (f: Film) => (f.blocked ? 'err' : f.approval ? 'wait' : isDone(f) ? 'done' : now - f.updated > STALE_MS ? 'stale' : 'run') as 'err' | 'wait' | 'done' | 'stale' | 'run'
  const KIND_T = { err: 'Lỗi', wait: 'Chờ duyệt', done: 'Xong', stale: 'Im lặng', run: 'Đang làm' }
  const W = Math.max(240, px)
  const card = (f: Film) => {
    const v = view(f, now), kind = kindOf(f), focused = f.slug === shown?.slug
    const group = GROUP_VI[f.group ?? f.skill ?? ''] ?? f.group ?? f.skill ?? ''
    const etaText = v.allDone ? 'đã xong' : kind === 'stale' ? 'im lặng — không ước lượng' : v.over ? 'bước này quá dự kiến — chờ cloud báo %' : v.remaining == null ? 'chưa đủ dữ liệu để ước lượng' : `còn ~${dur(v.remaining)} · xong ~${clock(now + v.remaining * 1000)}`
    const steps: CardStep[] = v.steps.map(s => ({
      label: s.label, role: s.role, state: s.state, w: s.w,
      took: s.took ? dur(s.took) : undefined, elapsed: s.elapsed ? dur(s.elapsed) : undefined,
      left: s.state === 'now' && !v.progress && s.est && (s.elapsed ?? 0) > s.est ? `quá dự kiến ${dur((s.elapsed ?? 0) - s.est)}` : s.left != null ? `~${dur(s.left)}` : undefined, guess: s.guess != null ? dur(s.guess) : undefined,
    }))
    const stale = kind === 'stale' ? `Không cập nhật ${dur((now - f.updated) / 1000)}: có thể đã dừng.` : ''
    // running: the cloud's latest note (what it is doing now) and the file it touched last
    const live = kind === 'run' && !v.allDone ? (f.message || '') : ''
    const message = f.blocked || f.approval ? (f.message || (f.blocked ? 'Công việc báo bị vướng.' : 'Công việc chờ bạn trả lời.')) : stale || (live ? `Đang làm: ${live}` : '')
    const reply = f.blocked || f.approval ? (f.source === 'drive' ? 'Trả lời ngay trong phiên gốc này — Claude chuyển sang phiên cloud.' : 'Trả lời trong phiên đang chạy việc này.') : stale ? 'Hỏi Claude ở phiên gốc kiểm tra phiên cloud.' : live && (f as any).activity ? `vừa cập nhật: ${(f as any).activity}` : ''
    const svg = cardSvg({ title: f.title || f.slug, group, status: { t: KIND_T[kind], kind }, total: v.total, etaText, steps, progress: v.frac, message, reply, updatedText: `${dur((now - f.updated) / 1000)} trước`, focused }, W)
    return (
      <Box key={v.allDone ? `job-${f.slug}` : `cur-${f.slug}`} flexDirection="column">
        {Svg ? <Svg source={svg} alt={`${f.title || f.slug}: ${KIND_T[kind]}, tổng ${Math.round(v.total * 100)}%, ${etaText}`} /> : <Text>{f.title || f.slug} · {KIND_T[kind]} · {Math.round(v.total * 100)}% · {etaText}</Text>}
        <Box flexDirection="row" justifyContent="flex-end" gap={1}>
          {!focused ? <Button key={'xem-' + f.slug} label="Xem trong văn phòng" onPress={() => update($, focus, () => f.slug)} /> : null}
          <Button key={'huy-' + f.slug} label={kind === 'stale' || v.allDone ? 'Xóa khỏi văn phòng' : 'Hủy theo dõi'} onPress={() => drop($, f, kind === 'stale')} />
        </Box>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" gap={1}>
      {Svg ? <Svg source={headerSvg(W, active.length, waits, errs, finished.length)} alt={`Văn phòng: ${active.length} đang chạy, ${waits} chờ duyệt, ${errs} lỗi`} /> : <Text bold>Văn phòng · chủ tịch</Text>}
      {Svg ? (
        <Box key="office" position="relative" flexDirection="column">
          <Svg source={shownSvg} alt={shown ? `Văn phòng: ${shown.title || shown.slug}` : 'Văn phòng đang chờ việc'} width={px} height={px} isInteractive />
          {overlaySvg ? <Box key="office-old" position="absolute" top={0} left={0}><Svg source={overlaySvg} alt="" width={px} height={px} isInteractive /></Box> : null}
        </Box>
      ) : null}
      {list.length === 0 ? <Text dimColor>Phiên này chưa có việc nào. Việc bạn giao trong phiên này (gửi lên Drive / office-status init) sẽ hiện ở đây ngay.</Text> : null}
      {list.map(card)}
      {other.length > 0 ? (
        <Box key="khac" flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text dimColor>Việc của phiên khác đang chạy: {other.length}</Text>
            <Button key="khac-mo" label={showOthers ? 'Ẩn' : 'Xem'} onPress={() => update($, openOthers, (v: boolean) => !v)} />
          </Box>
          {!showOthers ? null : other.slice(0, 6).map(f => {
            const k = isDone(f) ? 'xong' : now - f.updated > STALE_MS ? `im lặng ${dur((now - f.updated) / 1000)}` : 'đang chạy'
            return (
              <Box key={'o-' + f.slug} flexDirection="row" justifyContent="space-between" gap={1}>
                <Text dimColor>{[...(f.title || f.slug)].slice(0, 28).join('')} · {k}</Text>
                <Box flexDirection="row" gap={1}>
                  <Button key={'theo-' + f.slug} label="Theo dõi ở đây" onPress={() => adopt($, f)} />
                  {k !== 'đang chạy' ? <Button key={'xoa-' + f.slug} label="Xóa" onPress={() => drop($, f, true)} /> : null}
                </Box>
              </Box>
            )
          })}
        </Box>
      ) : null}
      <Box flexDirection="row" justifyContent="space-between">
        <Text dimColor>{p.error ? p.error : p.at ? `Cập nhật ${dur((now - p.at) / 1000)} trước · tự làm mới mỗi 5 giây` : 'Đang đọc trạng thái…'}</Text>
        <Button key="lam-moi" label="Làm mới" onPress={() => { lastScrolled = ''; return refresh($) }} />
      </Box>
    </Box>
  )
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const cwd = String((e as any).cwd ?? '')
    cwdSkill = /explainer/.test(cwd) ? 'jp-explainer-video' : /history-video/.test(cwd) ? 'jp-history-video' : undefined
    await $.command.register({ name: 'vp', description: 'Mở ô văn phòng pixel: tiến độ, lỗi và việc chờ duyệt của các quy trình đang chạy' })
    void $.ui.open({ id: PANE, title: TITLE })
    void refresh($)
    $.clock.every(POLL_MS, () => { void refresh($) })
    return next(e)
  })

  on('command.run', { command: 'vp' }, async $ => {
    const opened: any = await $.ui.open({ id: PANE, title: TITLE })
    lastScrolled = ''
    await refresh($)
    let where = 'Đã mở ô Văn phòng.'
    if (!opened?.isPlaced) {
      // cloud sessions viewed in the app place no panes: draw the office as a row in the conversation instead
      try { await $.ui.place({ id: ROW }); where = 'Phiên này không có ô bên cạnh: văn phòng được đặt ngay trong khung chat.' } catch { where = 'Phiên này không hiện được ô; xem tóm tắt dưới đây.' }
    }
    return { text: where + '\n' + summary((await read($, films)) ?? [], Date.now()) }
  })

  // the transcript row placed by /vp (same drawing as the pane)
  on('ui.render', { component: 'Placed' }, async ($, e, next) => {
    const p: any = e.props
    if (p?.plugin !== 'van-phong-pixel' || p?.id !== ROW) return next(e)
    return drawOffice($, e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => drawOffice($, e))

  // follow jobs this session sends (before the upload starts, so the office shows it at once)
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    try { await claim($, String((e as any).command ?? '')) } catch { /* never block the command */ }
    return next(e)
  })
}
