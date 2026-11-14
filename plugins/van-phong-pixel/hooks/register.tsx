import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { Film, Owned, Poll, Role, Step } from '../types'
import { ASSETS } from './assets'
import { officeSvg, legacy } from './scene'
import { cardSvg, headerSvg, footerSvg } from './cards'
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
let busy = false, again = false, cwdSkill: string | undefined, skills: string[] = [], scanOk = 0, ownKey = ''
// one random seed per session: every redraw of the office picks the same props, moods and routines
const SEED = Math.floor(Math.random() * 2 ** 31)
const finish = new Map<string, number>()   // slug -> finish time shown (ms)
const paneOpen = atom({ plugin: 'van-phong-pixel', key: 'paneOpen' } as const, false)
// learned stage durations (seconds, median of the last films) per "skill:stage"; seeds the estimates of new films
let learned: Record<string, number> = {}
const LEARN = 'learned-v2'
// cloud film session: repo root (has cloud/drive.sh) when this session runs in the cloud; live reports are throttled
let cloudRoot = '', liveAct = '', liveTodos = '', liveDirty = false, livePushing = false, liveLast = 0
const openOthers = atom({ plugin: 'van-phong-pixel', key: 'openOthers' } as const, false)
const widgetOn = atom({ plugin: 'van-phong-pixel', key: 'widget' } as const, null as boolean | null)   // null: not Windows / not read yet
let lastScrolled = ''
// step changes the pane has noticed: slug -> { step, from, to, at }; the hand-off walk plays from the moment it is noticed
const seen = new Map<string, { step: string; from?: string; to?: string; at: number }>()
let ticks = 0, driveCache: Film[] = [], driveError = ''
// last known flags per job, to raise a toast when a job gets blocked, waits for approval or finishes
const flags = new Map<string, string>()
const errSeen = new Set<string>()   // films that were blocked at some point (the header keeps them in its "lỗi" count)
// last scene: reuse the same SVG while nothing visible changed, so the pane does not reload (flash)
let sceneKey = '', sceneSvg = ''
// double buffer: the old scene stays on top (overlay) while the new one loads underneath, then the overlay goes
let shownSvg = '', overlaySvg = '', swapping = false

// Legacy video pipeline (v1 status files of the jp video repos); est = rough seconds per stage
const VIDEO_STEPS: Step[] = [
  { id: 'inputs', label: 'Nhận đầu vào', role: 'fetch', est: 120 }, { id: 'research', label: 'Nghiên cứu', role: 'research', est: 1800 },
  { id: 'plan', label: 'Kế hoạch', role: 'plan', est: 5400 }, { id: 'render', label: 'Render', role: 'build', est: 14400 },
  { id: 'qa', label: 'QA', role: 'check', est: 900 }, { id: 'deliver', label: 'Giao phim', role: 'deliver', est: 300 },
]
const ROLES: Role[] = ['fetch', 'research', 'plan', 'build', 'check', 'deliver']
const GROUP_VI: Record<string, string> = { 'jp-history-video': 'video lịch sử', 'jp-explainer-video': 'video explainer' }
const dur = (s: number) => (s < 90 ? `${Math.max(1, Math.round(s))} giây` : s < 90 * 60 ? `${Math.round(s / 60)} phút` : `${Math.floor(Math.round(s / 60) / 60)} giờ ${Math.round(s / 60) % 60} phút`)
const clock = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

type StepView = Step & { state: 'done' | 'now' | 'wait'; took?: number; elapsed?: number; left?: number | null; guess?: number | null; w: number; work: number }
type View = { over: boolean; overdue: number; steps: StepView[]; idx: number; allDone: boolean; progress: number; frac: number; scene: any; total: number; remaining: number | null; known: boolean; rnote: string; barNow: number }

function view(f: Film, now: number): View {
  let steps: Step[], idx: number, allDone: boolean, progress: number, scene: any
  // the final encode (frames are done) shows as a sub-step of Render: the cloud's last file is the 1080p output
  // the cloud reports encode 0..1 (both passes) and encodePass; before that, the 1080p output file is the sign
  const enc = f.stage !== 'render' ? '' : typeof f.encode === 'number' ? (f.encode >= 1 ? 'done' : 'run')
    : /video_1080p(\.tmp)?\.mp4/.test(f.activity ?? '') ? (/\.tmp\.mp4/.test(f.activity!) ? 'run' : 'done') : ''
  const encPct = typeof f.encode === 'number' && enc === 'run' ? ` lượt ${f.encodePass ?? 1}/2 · ${Math.round(f.encode * 100)}%` : ''
  // render 0 % / no number for over 2 min = the cloud's render watcher is not reporting: say so, time it by the estimate
  const noRender = f.stage === 'render' && !enc && !((f.render ?? 0) > 0) && (f.render == null || now - (f.history?.render?.start ?? f.updated) > 120_000)
  const rDone = f.stage === 'render' && (f.render ?? 0) >= 0.999 && !enc
  const rnote = f.stage !== 'render' ? '' : enc === 'run' ? `Nén video cuối${encPct} (khung hình xong 100%)` : enc ? 'Đã nén video cuối, chờ cloud chốt bước Render' : noRender ? 'Render: chưa có số liệu render' : `Render ${Math.round((f.render ?? 0) * 100)}%`
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
    steps = VIDEO_STEPS.map(s => ({ ...s, est: learned[`${f.skill}:${s.id}`] ?? s.est, label: s.id === 'render' && enc ? `Render › ${enc === 'run' ? 'nén video cuối' : 'đã nén xong'}` : s.label }))
    const map: Record<string, number> = { idle: -1, inputs: 0, research: 1, plan: 2, render: 3, qa: 4, deliver: 5, done: 6 }
    idx = map[f.stage ?? 'idle'] ?? -1; allDone = f.stage === 'done'
    if (rDone) idx = map.qa
    // share of the current stage: render %, the cloud's notes (research / plan), upload % (inputs)
    const pk = f.stage === 'render' ? (enc ? (enc === 'run' ? 0.95 + 0.04 * (f.encode ?? 0) : 0.99) : noRender ? 0 : f.render) : f.stage === 'plan' ? f.plan : f.stage === 'research' ? f.research : f.progress
    progress = Math.max(0, Math.min(1, pk ?? 0))
    scene = legacy(rDone ? { ...f, stage: 'qa' } : f)
    if (noRender) scene.noPct = true
    if (enc) scene.labels = { ...scene.labels, build: 'Nén video' }
  }
  let h = f.history ?? {}
  if (rDone && h.render?.start) { const e = h.render.end ?? f.updated; h = { ...h, render: { start: h.render.start, end: e }, qa: h.qa ?? { start: e } } }
  // a step that started in the last 40 s: the previous step's employee carries the work to the next room
  const cur0 = idx > 0 && idx < steps.length ? steps[idx] : null
  const n = seen.get(f.slug)
  if (cur0 && n && n.step === cur0.id && n.from && now - n.at < HANDOFF_MS) scene = { ...scene, handoff: { from: n.from, to: n.to }, handoffAge: (now - n.at) / 1000, handoffAt: n.at }
  // seconds Claude was stopped in each step (usage limit, errors) do not count as work
  const paused = (id: string) => (f.paused?.[id] ?? 0) + (f.claudeStop?.at && (f.stage ?? f.step) === id ? Math.max(0, (now - f.claudeStop.at) / 1000) : 0)
  const tooks = steps.map(s => (h[s.id]?.start && h[s.id]?.end ? Math.max(1, (h[s.id].end! - h[s.id].start) / 1000 - paused(s.id)) : undefined))
  const doneT = tooks.filter((x): x is number => typeof x === 'number')
  const avg = doneT.length ? doneT.reduce((a, b) => a + b, 0) / doneT.length : null
  let remaining: number | null = 0, known = true, frac = 0
  // how fast this job runs vs the estimates (finished steps): later steps are scaled by it
  let tookSum = 0, estSum = 0
  steps.forEach((s, i) => { if ((allDone || i < idx) && tooks[i] && s.est && tooks[i]! <= 3 * s.est) { tookSum += tooks[i]!; estSum += s.est } })
  const pace = estSum > 0 ? Math.max(0.5, Math.min(3, tookSum / estSum)) : 1
  let over = false
  const sv: StepView[] = steps.map((s, i) => {
    if (allDone || i < idx) { const took = tooks[i]; return { ...s, state: 'done', took, w: took ?? s.est ?? avg ?? 60, work: 0 } }
    if (i === idx) {
      const elapsed = h[s.id]?.start ? Math.max(0, (now - h[s.id].start) / 1000 - paused(s.id)) : undefined
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
      return { ...s, state: 'now', elapsed, left, w: s.est ?? avg ?? ((elapsed ?? 0) + (left ?? 0) || 60), work: 0 }
    }
    const guess = s.est ? s.est * pace : avg
    if (guess == null) known = false; else remaining! += guess
    return { ...s, state: 'wait', guess, w: guess ?? 60, work: 0 }
  })
  if (allDone) remaining = 0
  // Time line, kept consistent: the current step uses real progress when the job reports it (render %, notes,
  // upload %), each later step shows its own estimate, and the total time left is never below the sum of the steps
  // (Claude's estimate wins when it is longer).
  const cur = sv.find(s => s.state === 'now')
  const spentCur = cur?.elapsed ?? 0
  const real = f.stage === 'render' ? !!enc || (f.render != null && !noRender) : progress > 0.03
  const curLeft: number | null = cur ? (cur.left != null && cur.left > 0 ? cur.left : null) : 0
  if (cur) {
    frac = real ? progress : curLeft != null ? spentCur / Math.max(1, spentCur + curLeft) : 0.9
    frac = Math.min(0.99, Math.max(0, frac))
    cur.w = Math.max(1, spentCur + (curLeft ?? 0))
  }
  const own = curLeft == null ? null : curLeft + sv.reduce((a2, s) => a2 + (s.state === 'wait' ? (s.guess ?? 0) : 0), 0)
  const fin = finish.get(f.slug)
  let overdue = 0
  if (!allDone && fin) {
    if (fin > now) { remaining = Math.max((fin - now) / 1000, own ?? 0); known = true; over = false }
    else if (own != null) { remaining = own; known = true }
    else overdue = (now - fin) / 1000
  } else if (!allDone && own != null && known) remaining = own
  const rem = overdue ? null : known ? remaining : null
  let total: number, barNow = frac   // barNow: how much of the current step's block the total bar fills
  if (!allDone && cur && own != null && rem != null) {
    // % = time worked ÷ (time worked + the time left shown), so the % and "còn … · xong …" always agree; a step that
    // ran far past its estimate with no recorded stop counts its estimate (the card marks it "gồm lúc dừng")
    const guesses = sv.reduce((a, s) => a + (s.state === 'wait' ? (s.guess ?? 0) : 0), 0)
    sv.forEach((s, i) => { s.work = s.state === 'done' ? (tooks[i] != null && !(s.est && tooks[i]! > 3 * s.est && !f.paused) ? tooks[i]! : s.est ?? avg ?? 60) : s.state === 'wait' ? (s.guess ?? 0) : 0 })
    cur.work = Math.max(1, spentCur + Math.max(0, rem - guesses))
    const doneW = sv.reduce((a, s) => a + (s.state === 'done' ? s.work : 0), 0)
    total = (doneW + spentCur) / Math.max(1, doneW + spentCur + rem)
    barNow = spentCur / cur.work   // the bar's blocks then add up to exactly the %
  } else {
    // no honest time left: share of the WORK (each step's usual length)
    for (const s of sv) s.work = s.est ?? avg ?? 60
    const WW = sv.reduce((a, s) => a + s.work, 0) || 1
    total = (sv.reduce((a, s) => a + (s.state === 'done' ? s.work : 0), 0) + (cur ? cur.work * frac : 0)) / WW
  }
  // the HP bar starts at the same share and fills exactly when the step should end
  scene = { ...scene, progress: frac, rate: curLeft && curLeft > 0 ? (1 - frac) / curLeft : 0 }
  return { over, overdue, steps: sv, idx, allDone, progress, frac, barNow, scene, total: allDone ? 1 : Math.min(0.99, total), remaining: rem, known, rnote }
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
    const v = view(f, seenAt(f, now)), cur = v.idx >= 0 && v.idx < v.steps.length ? v.steps[v.idx] : null
    const state = f.blocked ? 'LỖI' : f.approval ? 'CHỜ DUYỆT' : v.allDone ? 'XONG' : isClaudeIdle(f, now) ? `CLAUDE ĐANG DỪNG (${stopWhy(f) || 'hết hạn mức?'})` : 'đang làm'
    const eta = v.allDone ? '' : v.overdue ? ` · quá giờ dự kiến ${dur(v.overdue)}` : v.remaining != null ? ` · còn ~${dur(v.remaining)}` : ''
    return `• ${f.title || f.slug} — ${state} · ${Math.round(v.total * 100)}%${cur ? ` · bước ${v.idx + 1}/${v.steps.length} ${cur.label}` : ''}${eta}${f.message ? ` · ${f.message}` : v.rnote && !v.allDone ? ` · ${v.rnote}` : ''}`
  }).join('\n')
}
// Claude itself idle (usage limit, waiting) while background work still beats; a render runs on its own, so it does not count there
const isClaudeIdle = (f: Film, now: number) => f.source === 'drive' && (!!f.claudeStop || (!!f.claudeAt && now - f.claudeAt > STALE_MS && f.stage !== 'render'))
const stopWhy = (f: Film) => !f.claudeStop ? '' : f.claudeStop.reason === 'rate_limit' ? `hết hạn mức${f.claudeStop.until ? ' · mở lại lúc ' + clock(f.claudeStop.until) : ''}` : `lỗi ${f.claudeStop.reason}`
const isDone = (f: Film) => !!f.done || f.step === 'done' || f.stage === 'done'
// a film silent for 15 min is shown as it was at its last word: % and bar stop instead of counting time nobody confirmed
const seenAt = (f: Film, now: number) => !isDone(f) && now - f.updated > STALE_MS ? f.updated : now

// ---- taskbar widget (Windows only): taskbar/vp_taskbar.pyw draws the boss room above the taskbar with one % and one
// finish time. One widget per session, showing that session's films only: on/off lives in
// ~/.claude/van-phong/widget-<session>.json (the pane button and the widget's own "Tắt" both write it), and the
// session writes its films to ~/.claude/van-phong/live/<session>.json while its widget is on.
const isWin = (h: string) => /^[A-Za-z]:[\\/]/.test(h)
const sessKey = () => (ownKey || 'session').replace(/[^A-Za-z0-9_-]/g, '_')
async function widgetSaysOn($: any, dir: string): Promise<boolean> {
  try { return JSON.parse(await $.fs.read(`${dir}/widget-${sessKey()}.json`)).on === true } catch { return false }
}
async function launchWidget($: any): Promise<boolean> {
  // python.org's pythonw first; the Microsoft Store alias in WindowsApps would open the Store, so it is skipped
  const ps = "$p = @((Get-ChildItem \"$env:LOCALAPPDATA\\Programs\\Python\\Python3*\\pythonw.exe\" -EA 0 | Sort-Object FullName | Select-Object -Last 1).FullName, (Get-Command pyw -EA 0).Source, (Get-Command pythonw -EA 0 | Where-Object { $_.Source -notlike '*WindowsApps*' }).Source) | Where-Object { $_ } | Select-Object -First 1; if (-not $p) { exit 3 }; Start-Process -FilePath $p -ArgumentList ('\"' + $env:VP_PYW + '\"'), '--session', $env:VP_SESSION"
  try { return (await $.process.run(['powershell', '-NoProfile', '-Command', ps], { timeoutMs: 20000, env: { VP_PYW: `${$.plugin.root}/taskbar/vp_taskbar.pyw`, VP_SESSION: sessKey() } })).exitCode === 0 } catch { return false }
}
async function writeLive($: any, dir: string, list: Film[], drive = DEFAULT_DRIVE) {
  const on = await widgetSaysOn($, dir)
  if ((await read($, widgetOn)) !== on) await update($, widgetOn, () => on)
  if (!on) return
  const now = Date.now()
  // the same numbers the pane shows: % of the work, finish = now + time left
  const jobs = list.map(f => {
    const v = view(f, seenAt(f, now))
    return { slug: f.slug, title: f.title || f.slug, step: f.stage ?? f.step, pct: v.allDone ? 100 : Math.round(v.total * 100),
      finishAt: !v.allDone && v.remaining != null ? Math.round(now + v.remaining * 1000) : null,
      state: isDone(f) ? 'done' : f.blocked ? 'err' : f.approval ? 'wait' : isClaudeIdle(f, now) ? 'stop' : 'run', until: f.claudeStop?.until ?? null,
      // what the widget needs to go on by itself from the Drive status when this session stops writing (Claude closed or asleep)
      skill: f.source === 'drive' ? f.skill : undefined,
      steps: v.steps.map(s => ({ id: s.id, work: Math.round(s.work), guess: Math.round(s.state === 'wait' ? (s.guess ?? s.work) : s.state === 'now' ? (s.est ?? s.work) : 0) })) }
  })
  const rclone = ((await $.store.get('rclone')) as string | undefined) ?? ''
  try { await $.fs.write(`${dir}/live/${sessKey()}.json`, JSON.stringify({ updated: now, drive, rclone, jobs })) } catch { /* read-only home */ }
}
async function toggleWidget($: any) {
  const h = await home($)
  if (!isWin(h)) return
  const dir = `${h}/.claude/van-phong`, on = !(await widgetSaysOn($, dir))
  await $.fs.write(`${dir}/widget-${sessKey()}.json`, JSON.stringify({ on }))
  try { await $.fs.write(`${dir}/widget.json`, JSON.stringify({ on: false })) } catch { /* closes a 0.22 widget (all sessions in one) */ }
  await update($, widgetOn, () => on)
  if (!on) return                      // the widget sees the switch within 2 s and closes itself
  await writeLive($, dir, (await read($, films)) ?? [])
  if (!(await launchWidget($))) {
    await $.fs.write(`${dir}/widget-${sessKey()}.json`, JSON.stringify({ on: false })); await update($, widgetOn, () => false)
    try { $.ui.toast('Không chạy được widget: máy chưa có Python (python.org) để chạy pythonw') } catch { /* no surface */ }
  }
}

async function refresh($: any) {
  if (busy) { again = true; return }   // a slow rclone call must not overlap the next tick (that made the count jump 2 -> 0)
  busy = true
  try { do { again = false; await refreshInner($) } while (again) } catch { /* session ended mid-read: nothing to draw */ } finally { busy = false }
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
        if (!skills.length || ticks % 60 === 1) {
          const d = await $.process.run([bin, 'lsf', drive, '--dirs-only'], { timeoutMs: 60000 })
          if (d.exitCode !== 0) throw new Error(fail(d))
          skills = d.stdout.split(/\r?\n/).map((x: string) => x.replace(/\/$/, '').trim()).filter(Boolean)
        }
        const parts = await Promise.all(skills.map(async (k: string) => {
          const r = await $.process.run([bin, 'cat', `${drive}/${k}/status`, '--include', '*.json'], { timeoutMs: 60000 })
          if (r.exitCode !== 0) throw new Error(fail(r))
          return r.stdout as string
        }))
        for (const p of parts) for (const o of objects(p)) if (o.slug) { const j = fresh.findIndex(x => x.slug === o.slug); if (j < 0) fresh.push({ ...o, source: 'drive' }); else if ((o.updated ?? 0) > (fresh[j].updated ?? 0)) fresh[j] = { ...o, source: 'drive' } }
        driveCache = fresh; driveError = ''; scanOk = Date.now()   // swap only on success: a failed read keeps the last list
      } catch (err: any) { driveError = `Drive: ${String(err?.message ?? err).slice(0, 120)}` }
    } else {
      // this session's jobs: one small file each, read in parallel (a few seconds at most)
      const got = await Promise.all(mine0.map(async m => {
        try { const r = await $.process.run([bin, 'cat', `${drive}/${m.skill}/status/${m.slug}.json`], { timeoutMs: 15000 }); return r.exitCode === 0 ? objects(r.stdout).sort((a: any, b: any) => (b.updated ?? 0) - (a.updated ?? 0))[0] ?? null : null } catch { return null }
      }))
      for (const o of got) if (o?.slug) driveCache = [...driveCache.filter(x => x.slug !== o.slug), { ...o, source: 'drive' }]
    }
    // learn the skill (Drive folder) of a job claimed without one
    for (const m of mine0) if (!m.skill) { const c = driveCache.find(x => x.slug === m.slug); if (c?.skill) await update($, owned, (o: Owned[]) => (o ?? []).map(x => x.slug === m.slug ? { ...x, skill: c.skill } : x)) }
  }
  if (drive) { for (const o of driveCache) if (!all.some(f => f.slug === o.slug)) all.push(o); if (driveError) errors.push(driveError) }
  // a claimed job that never appeared anywhere (failed command) leaves after 4 minutes
  {
    const ghosts = ((await read($, owned)) ?? []).filter(m => scanOk - m.at > 4 * 60_000 && !all.some(f => f.slug === m.slug)).map(m => m.slug)
    if (ghosts.length) await update($, owned, (o: Owned[]) => (o ?? []).filter(x => !ghosts.includes(x.slug))); void keep($)
  }
  // this session's jobs; one not on Drive yet shows at once as "uploading"
  const mine = (await read($, owned)) ?? []
  const list: Film[] = mine.map(m => all.find(f => f.slug === m.slug)
    ?? { slug: m.slug, title: m.title || m.slug, skill: m.skill, stage: 'inputs', message: 'Đang tải dữ liệu lên Drive…', updated: m.at, source: 'drive', history: { inputs: { start: m.at } } } as Film)
  for (const f of list) {
    const target = typeof (f as any).finishAt === 'number' ? (f as any).finishAt as number : null
    if (!target || isDone(f)) { finish.delete(f.slug); continue }
    const cur = finish.get(f.slug), nowT = Date.now()
    if (!cur) { finish.set(f.slug, target); continue }
    if (cur < nowT || Math.abs(target - cur) > 20 * 60_000) { finish.set(f.slug, target); continue }
    const cap = Math.max(120_000, 0.1 * Math.max(0, cur - nowT))
    finish.set(f.slug, cur + Math.max(-cap, Math.min(cap, target - cur)))
  }
  await learn($, list)
  // finished jobs leave on their own; other sessions' finished jobs are not shown at all
  const gone = list.filter(f => isDone(f) && Date.now() - f.updated > DONE_KEEP).map(f => f.slug)
  if (gone.length) await update($, owned, (o: Owned[]) => (o ?? []).filter(x => !gone.includes(x.slug))); void keep($)
  for (let i = list.length - 1; i >= 0; i--) if (gone.includes(list[i].slug)) list.splice(i, 1)
  await update($, others, () => all.filter(f => !mine.some(m => m.slug === f.slug) && !isDone(f)).sort((a, b) => b.updated - a.updated))
  // notice step changes (the previous step's role hands the work to the new one)
  const nowMs = Date.now()
  for (const f of list) {
    const v = view(f, nowMs), cur = v.idx >= 0 && v.idx < v.steps.length ? v.steps[v.idx] : null, key = cur ? cur.id : v.allDone ? 'done' : 'idle'
    const prev = seen.get(f.slug)
    if (!prev) seen.set(f.slug, { step: key, at: 0 })
    else if (prev.step !== key) { seen.set(f.slug, cur && v.idx > 0 ? { step: key, from: v.steps[v.idx - 1].role, to: cur.role, at: nowMs } : { step: key, at: 0 }) }
  }
  // tell the chairman at once when something needs them or a job is done
  for (const f of list) {
    const now = isDone(f) ? 'done' : f.blocked ? 'err' : f.approval ? 'wait' : 'run', before = flags.get(f.slug)
    if (now === 'err' && before !== 'err') errSeen.add(f.slug)
    if (before !== undefined && before !== now && now !== 'run') {
      const msg = now === 'err' ? `Lỗi · ${f.title || f.slug}: ${f.message || 'bị vướng'} — trả lời ngay trong phiên này`
        : now === 'wait' ? `Chờ duyệt · ${f.title || f.slug}: ${f.message || 'cần bạn trả lời'} — trả lời ngay trong phiên này`
        : `Xong · ${f.title || f.slug} — gõ "lấy video" để tải về máy`
      try { $.ui.toast(msg) } catch { /* no surface */ }
      void $.ui.notify(msg, { title: 'Văn phòng' }).catch(() => { /* notifications off */ })
    }
    flags.set(f.slug, now)
  }
  // active jobs first (newest first), finished ones after
  list.sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || b.updated - a.updated)
  await update($, films, () => list)
  if (dir && isWin(h)) await writeLive($, dir, list, drive)
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

async function keep($: any) { if (ownKey) { try { await $.store.set(ownKey, (await read($, owned)) ?? []) } catch { /* read-only */ } } }
async function adopt($: any, f: Film) {
  await update($, owned, (m: Owned[]) => [...(m ?? []).filter(x => x.slug !== f.slug), { slug: f.slug, title: f.title || f.slug, skill: f.skill, at: Date.now() }]); void keep($)
  await update($, films, (l: Film[]) => [f, ...(l ?? []).filter(x => x.slug !== f.slug)])
  await update($, others, (l: Film[]) => (l ?? []).filter(x => x.slug !== f.slug))
  await update($, focus, () => f.slug); lastScrolled = ''
  void refresh($)
}
// stop following a job here; a job that went silent (or is done) also loses its status file on Drive, so no session shows it again
async function drop($: any, f: Film, purge: boolean) {
  await update($, owned, (m: Owned[]) => (m ?? []).filter(x => x.slug !== f.slug)); void keep($)
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
// only a real invocation counts (at a command position), not a command that merely mentions the script
const SEND = /(?:^|[;&|(]\s*|\n\s*)(?:timeout\s+\d+\s+)?(?:bash|sh)\s+["']?(?:[^\s"';&|]*\/)?local\/send\.sh["']?\s+([a-z0-9][a-z0-9-]*)/
const INIT = /(?:^|[;&|(]\s*|\n\s*)node\s+["']?(?:[^\s"';&|]*\/)?office-status\.mjs["']?\s+init\s+["']?([A-Za-z0-9._-]+)/
const TITLE_RE = /--title\s+(?:"([^"]*)"|'([^']*)')/
async function claim($: any, command: string) {
  const m = SEND.exec(command) ?? INIT.exec(command)
  if (!m) return
  const tm = TITLE_RE.exec(command), skill = /explainer/.test(command) ? 'jp-explainer-video' : /history-video/.test(command) ? 'jp-history-video' : cwdSkill
  await update($, owned, (o: Owned[]) => (o ?? []).some(x => x.slug === m[1]) ? o : [...(o ?? []), { slug: m[1], title: tm ? tm[1] ?? tm[2] : m[1], skill, at: Date.now() }]); void keep($)
  await update($, focus, () => m[1]); lastScrolled = ''
  void refresh($)
}

const base = (p: unknown) => String(p ?? '').split(/[\\/]/).pop() ?? ''
function describe(e: any): string {
  const tool = String(e.tool ?? '')
  if (tool === 'Bash') return String(e.description || String(e.command ?? '').slice(0, 70))
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return `Sửa ${base(e.file_path ?? e.notebook_path)}`
  if (tool === 'Read') return `Đọc ${base(e.file_path)}`
  if (tool === 'Grep' || tool === 'Glob') return `Tìm ${String(e.pattern ?? '').slice(0, 40)}`
  if (tool === 'TodoWrite' || /update_plan$/.test(tool)) return 'Cập nhật danh sách việc'
  if (tool === 'Agent' || tool === 'Task') return `Giao việc: ${String(e.description ?? '').slice(0, 50)}`
  return tool.replace(/^mcp__[^_]+__/, '')
}
let etaAsks = 0, lastEnsure = 0, blockedAt = 0, stopAt = 0
const MAX_ASKS = 5, RECOVER_MS = 10 * 60_000   // a stop shorter than 10 min does not make Claude's finish time stale
let limits: { kind: string; percentUsed: number; resetsAt?: string }[] = []
const STAGE_MARK = /drive\.sh["']?\s+mark\s+(start|inputs|research_done|plan_done|render_start|render_done)\b([^\n;&|]*)/
const etaGiven = (c: string) => /drive\.sh["']?\s+mark\s+eta\s+\d/.test(c) || /drive\.sh["']?\s+mark\s+note\s+.*\s\d+(\.\d+)?\s*$/m.test(c)
function ask($: any, why: string) {
  if (etaAsks >= MAX_ASKS) return
  etaAsks++
  void $.prompt.submit({ text: `(Văn phòng hỏi ${etaAsks}/${MAX_ASKS}) ${why}Người dùng cần giờ xong chính xác: ước còn bao nhiêu phút nữa thì xong CẢ phim, tính từ bây giờ? Trả lời bằng một lệnh: bash cloud/drive.sh mark eta <phút>, rồi làm tiếp việc đang dở. Từ giờ ghi kèm số phút ở cuối mỗi lệnh mark <bước> "" <phút>, và sau khi sửa xong lỗi thì mark resume rồi mark eta <phút>.` }).catch(() => {})
}
// back from an error or a stop that lasted over 10 min: Claude's old finish time no longer holds, ask once for a new one
const clockNow = async ($: any): Promise<number> => { try { return Number(await $.clock.now()) || Date.now() } catch { return Date.now() } }
function recovered($: any, since: number, now: number, what: string, command: string) {
  if (since && now - since > RECOVER_MS && !etaGiven(command)) ask($, `Vừa hết ${what} sau ${dur((now - since) / 1000)}, giờ xong cũ không còn đúng. `)
}
async function askEta($: any, command: string) {
  const now = await clockNow($)
  if (/drive\.sh["']?\s+mark\s+blocked\b/.test(command)) { blockedAt ||= now; return }
  const m = STAGE_MARK.exec(command)
  if (blockedAt && (m || /drive\.sh["']?\s+mark\s+resume\b/.test(command))) { const t = blockedAt; blockedAt = 0; if (now - t > RECOVER_MS) return recovered($, t, now, 'lỗi', command) }
  if (etaGiven(command) || !m) return
  if (/\s\d+(\.\d+)?\s*["']?\s*$/.test(m[2])) return
  ask($, '')
}
async function asks($: any, e: any) {
  if (stopAt) { const t = stopAt; stopAt = 0; recovered($, t, await clockNow($), 'lúc Claude dừng', String(e.command ?? '')) }
  if (String(e.tool ?? '') === 'Bash') await askEta($, String(e.command ?? ''))
}
function report($: any, e: any) {
  void asks($, e).catch(() => {})
  liveAct = describe(e)
  const list = Array.isArray(e.todos) ? e.todos : Array.isArray(e.items) ? e.items : null
  if (list) liveTodos = JSON.stringify(list.map((x: any) => ({ content: x.content, activeForm: x.activeForm, status: x.status })))
  liveDirty = true
  void pump($)
}
// one push at a time, at most every 4 s; the newest activity always wins
async function pump($: any) {
  if (livePushing) return
  livePushing = true
  try {
    while (liveDirty) {
      const wait = 4000 - (Date.now() - liveLast)
      if (wait > 0) await new Promise<void>(res => $.clock.after(wait, () => res()))
      liveDirty = false; liveLast = Date.now()
      await $.process.run(['bash', `${cloudRoot}/cloud/drive.sh`, 'live', liveAct, liveTodos], { timeoutMs: 40000 })
      if (Date.now() - lastEnsure > 180_000) { lastEnsure = Date.now(); void $.process.run(['bash', `${cloudRoot}/cloud/drive.sh`, 'ensure'], { timeoutMs: 20000 }).catch(() => {}) }
    }
  } catch { /* offline: the next call tries again */ } finally { livePushing = false }
}

async function learn($: any, list: Film[]) {
  let db: { d: Record<string, number[]>; seen: string[] } = { d: {}, seen: [] }
  try { db = ((await $.store.get(LEARN)) as typeof db) ?? db } catch { /* first run */ }
  let changed = false
  for (const f of list.filter(isDone)) for (const [stage, h] of Object.entries(f.history ?? {})) {
    if (!h?.start || !h.end || !f.skill) continue
    const id = `${f.slug}:${stage}`
    if (db.seen.includes(id)) continue
    const k = `${f.skill}:${stage}`, s = (h.end - h.start) / 1000 - (f.paused?.[stage] ?? 0)
    if (s > 5) { db.d[k] = [...(db.d[k] ?? []), s].slice(-8); changed = true }
    db.seen = [...db.seen, id].slice(-400)
  }
  if (changed) { try { await $.store.set(LEARN, db) } catch { /* read-only */ } }
  const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)] }
  learned = Object.fromEntries(Object.entries(db.d).filter(([, v]) => v.length).map(([k, v]) => [k, med(v)]))
}

// shortcut: the last 60 scroll/focus moves of the pane go to ~/.claude/van-phong/scroll.log to diagnose the jump to the top; drop once fixed
let paneOffset = 0, paneSurface = "", scrollLines: string[] = []
async function scrollLog($: any, line: string) {
  scrollLines = [...scrollLines, `${new Date().toISOString().slice(11, 19)} ${line}`].slice(-60)
  try { const h = await home($); if (h) await $.fs.write(`${h}/.claude/van-phong/scroll.log`, scrollLines.join('\n') + '\n') } catch { /* no folder */ }
}

// the office drawing: shared by the side pane and the transcript row (cloud sessions place no panes)
async function drawOffice($: any, e: any) {
  const els: any = $.ui.resolve(e)
  const { Box, Text, Button } = els
  const Svg = els.Svg
  const list = (await read($, films)) ?? []
  const other = (await read($, others)) ?? []
  const showOthers = (await read($, openOthers)) ?? false
  const wOn = (await read($, widgetOn)) ?? null
  const p = (await read($, poll)) ?? { at: 0, error: '' }
  const want = (await read($, focus)) ?? ''
  const now = Date.now()
  const cols = ((e.props as any)?.bodyColumns ?? e.viewport?.columns ?? 60) as number
  const px = Math.round(Math.max(220, Math.min(720, cols * 8.6)))
  const active = list.filter(f => !isDone(f)), finished = list.filter(isDone)
  const shown = list.find(f => f.slug === want) ?? active[0] ?? list[0]
  // the header keeps counting a film that hit an error after it was fixed (this session)
  const errs = list.filter(f => f.blocked || errSeen.has(f.slug)).length, waits = list.filter(f => f.approval && !f.blocked).length
  const sceneState = { ...(shown ? view(shown, now).scene : { active: null, doneRoles: [] }), now, seed: SEED, hour: new Date(now).getHours() }
  // progress is animated inside the SVG (HP bars run at the real rate), so only visible state changes redraw it
  // the HP bar is redrawn every 5 % (it animates smoothly in between), other visible changes redraw at once
  const key = JSON.stringify({ ...sceneState, now: undefined, progress: Math.round((sceneState.progress ?? 0) * 5), rate: undefined, handoffAge: undefined, px })
  if (key !== sceneKey) {
    sceneKey = key
    // one square picture that scales with the pane (the background is light enough now to fit with everything)
    sceneSvg = officeSvg(ASSETS, sceneState).full(px)
    if (sceneSvg.length > SVG_LIMIT) sceneSvg = officeSvg(ASSETS, { ...sceneState, lite: true }).full(px)
    if (sceneSvg.length > SVG_LIMIT) sceneSvg = officeSvg(ASSETS, { ...sceneState, lite: true, lite2: true }).full(px)
  }
  if (!shownSvg) shownSvg = sceneSvg
  else if (sceneSvg !== shownSvg && !swapping) {
    swapping = true; overlaySvg = shownSvg; const next = sceneSvg
    const redraw = () => update($, poll, (q: Poll) => ({ ...(q ?? { at: 0, error: '' }) }))
    $.clock.after(900, async () => { shownSvg = next; await redraw()
      $.clock.after(1600, async () => { overlaySvg = ''; swapping = false; await redraw() }) })
  }

  const claudeIdle = (f: Film) => isClaudeIdle(f, now)
  const kindOf = (f: Film) => (f.blocked ? 'err' : f.approval ? 'wait' : isDone(f) ? 'done' : now - f.updated > STALE_MS || claudeIdle(f) ? 'stale' : 'run') as 'err' | 'wait' | 'done' | 'stale' | 'run'
  const KIND_T = { err: 'Lỗi', wait: 'Chờ duyệt', done: 'Xong', stale: 'Im lặng', run: 'Đang làm' }
  const W = Math.max(240, px)
  // a pixel button: the face is drawn, a plain Button on top keeps it a real control (keyboard, presses, tests)
  // plain app buttons: a Button wrapped in a coloured Box did not take clicks on the desktop and threw the pane to the top
  const pixBtn = (key: string, label: string, onPress: () => any, tone: 'wood' | 'primary' | 'danger' = 'wood') =>
    <Button key={key} label={label} onPress={onPress} variant={tone === 'primary' ? 'primary' : undefined} />
  const card = (f: Film) => {
    const v = view(f, seenAt(f, now)), kind = kindOf(f), focused = f.slug === shown?.slug
    const group = GROUP_VI[f.group ?? f.skill ?? ''] ?? f.group ?? f.skill ?? ''
    const waitEta = f.source === 'drive' && !finish.get(f.slug) && !v.allDone
    const etaText = v.allDone ? 'đã xong' : kind === 'stale' ? 'im lặng — không ước lượng' : v.overdue ? `quá giờ dự kiến ${dur(v.overdue)} — chờ cloud báo lại` : waitEta ? 'đang chờ Claude ước giờ xong…' : v.over ? 'bước này quá dự kiến — chờ cloud báo %' : v.remaining == null ? 'chưa đủ dữ liệu để ước lượng' : `còn ~${dur(v.remaining)} · xong ~${clock(now + v.remaining * 1000)}`
    const steps: CardStep[] = v.steps.map(s => ({
      label: s.label, role: s.role, state: s.state, w: s.work,
      took: s.took ? dur(s.took) + (s.est && s.took > 3 * s.est && !f.paused ? ' (gồm lúc dừng)' : '') : undefined, elapsed: s.elapsed ? dur(s.elapsed) : undefined,
      left: now - f.updated > STALE_MS && !v.allDone ? undefined : s.state === 'now' && !v.progress && s.est && (s.elapsed ?? 0) > s.est ? `quá dự kiến ${dur((s.elapsed ?? 0) - s.est)}` : s.left != null ? `~${dur(s.left)}` : undefined, guess: s.guess != null ? dur(s.guess) : undefined,
    }))
    const stale = kind !== 'stale' ? '' : now - f.updated > STALE_MS ? `Không cập nhật ${dur((now - f.updated) / 1000)}: có thể đã dừng.` : f.claudeStop ? `Claude dừng: ${stopWhy(f)}; việc nền vẫn chạy.` : `Claude không làm gì ${dur((now - (f.claudeAt ?? now)) / 1000)} (có thể hết hạn mức hoặc đang chờ); việc nền vẫn chạy.`
    // running: the cloud's latest note (what it is doing now) and the file it touched last
    const td = (f as any).todo as { done: number; total: number; current: string } | undefined
    // what the cloud is doing: its todo item, else its note, else the render % or the last file it touched
    const live = kind === 'run' && !v.allDone ? (td?.current ? `${td.current} (${td.done}/${td.total})` : f.message
      || (f.stage === 'render' ? v.rnote : f.activity ? `vừa sửa ${f.activity}` : '')) : ''
    const message = f.blocked || f.approval ? (f.message || (f.blocked ? 'Công việc báo bị vướng.' : 'Công việc chờ bạn trả lời.')) : stale || (live ? `Đang làm: ${live}` : '')
    const reply = f.blocked || f.approval ? (f.source === 'drive' ? 'Trả lời ngay trong phiên gốc này — Claude chuyển sang phiên cloud.' : 'Trả lời trong phiên đang chạy việc này.') : stale && claudeIdle(f) ? 'Khi hạn mức mở lại: nhắn phiên cloud "làm tiếp".' : stale ? 'Hỏi Claude ở phiên gốc kiểm tra phiên cloud.' : live && f.activity ? `Claude vừa: ${f.activity}` : ''
    const svg = cardSvg({ title: f.title || f.slug, group, status: { t: KIND_T[kind], kind }, total: v.total, etaText, steps, progress: v.frac, barNow: v.barNow, message, reply, updatedText: `${dur((now - f.updated) / 1000)} trước`, focused }, W)
    return (
      <Box key={v.allDone ? `job-${f.slug}` : `cur-${f.slug}`} flexDirection="column">
        {Svg ? <Svg source={svg} alt={`${f.title || f.slug}: ${KIND_T[kind]}, tổng ${Math.round(v.total * 100)}%, ${etaText}`} /> : <Text>{f.title || f.slug} · {KIND_T[kind]} · {Math.round(v.total * 100)}% · {etaText}</Text>}
        <Box flexDirection="row" justifyContent="flex-end" gap={1}>
          {f.approval && !f.blocked ? pixBtn('duyet-' + f.slug, "✓ Duyệt", () => $.prompt.submit({ text: `Duyệt ${f.slug} — chuyển nguyên lời "duyệt" sang phiên cloud của phim này.` }), 'primary') : null}
          {f.approval || f.blocked ? pixBtn('sua-' + f.slug, f.blocked ? '› Trả lời lỗi' : '› Yêu cầu sửa', () => $.prompt.fill({ text: `${f.blocked ? 'Trả lời lỗi' : 'Yêu cầu sửa'} ${f.slug} (chuyển sang phiên cloud): ` }), 'wood') : null}
          {v.allDone && f.source === 'drive' ? pixBtn('tai-' + f.slug, "↓ Tải video về", () => $.prompt.submit({ text: `Tải video ${f.slug} về máy: chạy local/fetch.sh ${f.slug}, rồi báo đường dẫn thư mục ket-qua.` }), 'primary') : null}
          {!focused ? pixBtn('xem-' + f.slug, "◉ Xem trong văn phòng", () => update($, focus, () => f.slug), 'wood') : null}
          {pixBtn('huy-' + f.slug, kind === 'stale' || v.allDone ? '✕ Xóa khỏi văn phòng' : '✕ Hủy theo dõi', () => drop($, f, kind === 'stale'), 'danger')}
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
          {overlaySvg ? <Box key="office-old" position="absolute" top={0} left={0}><Svg source={overlaySvg} alt="Văn phòng" width={px} height={px} isInteractive /></Box> : null}
        </Box>
      ) : null}
      {list.length === 0 ? <Text dimColor>Phiên này chưa có việc nào. Việc bạn giao trong phiên này (gửi lên Drive / office-status init) sẽ hiện ở đây ngay.</Text> : null}
      {list.map(card)}
      {other.length > 0 ? (
        <Box key="khac" flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text dimColor>Việc của phiên khác đang chạy: {other.length}</Text>
            {pixBtn("khac-mo", showOthers ? 'Ẩn' : 'Xem', () => update($, openOthers, (v: boolean) => !v), 'wood')}
          </Box>
          {!showOthers ? null : other.slice(0, 6).map(f => {
            const k = isDone(f) ? 'xong' : now - f.updated > STALE_MS ? `im lặng ${dur((now - f.updated) / 1000)}` : 'đang chạy'
            return (
              <Box key={'o-' + f.slug} flexDirection="row" justifyContent="space-between" gap={1}>
                <Text dimColor>{[...(f.title || f.slug)].slice(0, 28).join('')} · {k}</Text>
                <Box flexDirection="row" gap={1}>
                  {pixBtn('theo-' + f.slug, "Theo dõi ở đây", () => adopt($, f), 'wood')}
                  {k !== 'đang chạy' ? pixBtn('xoa-' + f.slug, "Xóa", () => drop($, f, true), 'danger') : null}
                </Box>
              </Box>
            )
          })}
        </Box>
      ) : null}
      {Svg ? <Svg source={footerSvg(W, p.error ? p.error : p.at ? `cập nhật ${dur((now - p.at) / 1000)} trước · làm mới mỗi 5 giây` : 'đang đọc trạng thái…', !!p.error)} alt={p.error || 'Văn phòng đang cập nhật trực tiếp'} /> : <Text dimColor>{p.error || 'Đang cập nhật'}</Text>}
      <Box flexDirection="row" justifyContent="flex-end">
        <Box flexDirection="row" gap={1}>
          {wOn !== null ? pixBtn('widget', wOn ? '▣ Tắt widget' : '▣ Bật widget', () => toggleWidget($), wOn ? 'primary' : 'wood') : null}
          {pixBtn("lam-moi", "⟳ Làm mới", () => { ticks = 0; driveError = ''; return refresh($) }, 'wood')}
        </Box>
      </Box>
    </Box>
  )
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const cwd = String((e as any).cwd ?? '')
    ownKey = `owned:${String((e as any).session_id ?? (e as any).sessionId ?? cwd)}`
    try {
      const saved = (await $.store.get(ownKey)) as Owned[] | undefined
      if (saved?.length) await update($, owned, (o: Owned[]) => [...(o ?? []), ...saved.filter(s => !(o ?? []).some(x => x.slug === s.slug))]); void keep($)
    } catch { /* first start */ }
    // the widget was left on: bring it back with the session (one instance only, the widget checks)
    void (async () => {
      const h = await home($), dir = `${h}/.claude/van-phong`
      if (!isWin(h)) return
      // an all-sessions widget of 0.22 and older was on: this session's own widget takes over
      try { if (JSON.parse(await $.fs.read(`${dir}/widget.json`)).on === true) { await $.fs.write(`${dir}/widget.json`, JSON.stringify({ on: false })); await $.fs.write(`${dir}/widget-${sessKey()}.json`, JSON.stringify({ on: true })) } } catch { /* none */ }
      if (await widgetSaysOn($, dir)) await launchWidget($)
    })().catch(() => {})
    cwdSkill = /explainer/.test(cwd) ? 'jp-explainer-video' : /history-video/.test(cwd) ? 'jp-history-video' : undefined
    // a cloud session of a video repo reports Claude's work live (the PC's office reads it from Drive)
    if (cwd && cwdSkill) {
      try {
        const r = await $.process.run(['sh', '-c', 'if [ "$CLAUDE_CODE_REMOTE" = true ] || [ -d /root/.ccr ]; then [ -f "$1/cloud/drive.sh" ] && echo cloud; fi', 'sh', cwd], { timeoutMs: 5000 })
        if (r.exitCode === 0 && r.stdout.trim() === 'cloud') { cloudRoot = cwd; void $.process.run(['bash', `${cwd}/cloud/drive.sh`, 'ensure'], { timeoutMs: 20000 }).catch(() => {}) }
      } catch { /* Windows / no sh: not a cloud session */ }
    }
    await $.command.register({ name: 'vp', description: 'Mở ô văn phòng pixel: tiến độ, lỗi và việc chờ duyệt của các quy trình đang chạy' })
    void $.ui.open({ id: PANE, title: TITLE }).then((o: any) => update($, paneOpen, () => !!o?.isPlaced)).catch(() => {})
    void refresh($)
    $.clock.every(POLL_MS, () => { void refresh($) })
    return next(e)
  })

  on('command.run', { command: 'vp' }, async $ => {
    const opened: any = await $.ui.open({ id: PANE, title: TITLE })
    await update($, paneOpen, () => !!opened?.isPlaced)
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

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const o = (e.props as any)?.scroll?.offset
    if (typeof o === 'number') paneOffset = o
    paneSurface = String((e as any).surface ?? '')
    return drawOffice($, e)
  })

  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    const s: any = e
    void scrollLog($, `scroll ${s.origin?.kind ?? '?'} by=${s.by} offset=${s.offset} cur=${paneOffset} rows=${s.bodyRows}/${s.contentRows}`)
    return next(e)
  })
  // the log: a click left the focus ring on the button, the pane then held the keys, and from then on every wheel tick
  // went through the engine's row scroll and was thrown back near the top. On the desktop a click no longer takes the
  // ring (the press itself still runs), so the wheel stays the page's own, as before any press.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const f: any = e, keep = paneSurface === 'desktop' && f.origin?.kind === 'person' && !!f.element
    void scrollLog($, `focus ${f.element ?? '-'} by ${f.origin?.kind}${keep ? ' KEPT OFF' : ''}`)
    return keep ? {} : next(e)
  })

  on('ui.close', async ($, e, next) => {
    if ((e as any).id === PANE) await update($, paneOpen, () => false)
    return next(e)
  })

  // one line above the prompt while the office pane is closed: the film, %, time left, what the cloud is doing
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if ((e.props as any)?.hasSurvey || (await read($, paneOpen))) return next(e)
    const act = ((await read($, films)) ?? []).filter(f => !isDone(f))
    if (!act.length) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const f = act[0], now = Date.now(), v = view(f, seenAt(f, now))
    const flag = f.blocked ? 'LỖI · ' : f.approval ? 'CHỜ DUYỆT · ' : isClaudeIdle(f, now) ? `CLAUDE DỪNG${f.claudeStop ? ': ' + stopWhy(f) : ''} · ` : ''
    const eta = v.remaining != null ? ` · còn ~${dur(v.remaining)}` : ''
    const td = (f as any).todo as { current?: string } | undefined
    const doing = td?.current || f.message || ''
    const name = [...(f.title || f.slug)].slice(0, 24).join('')
    return (
      <Box flexDirection="row" gap={1} justifyContent="space-between">
        <Text>{flag}{name} · {Math.round(v.total * 100)}%{eta}{doing ? <Text dimColor> · {[...doing].slice(0, 40).join('')}</Text> : null}{act.length > 1 ? <Text dimColor> · +{act.length - 1} việc</Text> : null}</Text>
        <Button key="vp-mo" label="Mở văn phòng" onPress={async () => { const o: any = await $.ui.open({ id: PANE, title: TITLE }); await update($, paneOpen, () => !!o?.isPlaced) }} />
      </Box>
    )
  })

  // cloud: keep the account's usage windows; when a turn stops on an API error, tell the office why and until when
  on('session.measure', ($, e, next) => { limits = ((e as any).rateLimits ?? limits) as typeof limits; return next(e) })
  on('classic.StopFailure', ($, e, next) => {
    if (cloudRoot) {
      const reason = String((e as any).error ?? 'unknown')
      void clockNow($).then(t => { stopAt ||= t })
      const full = limits.filter(l => l.percentUsed >= 100 && l.resetsAt).map(l => l.resetsAt as string).sort().pop() ?? ''
      void $.process.run(['bash', `${cloudRoot}/cloud/drive.sh`, 'stop', reason, reason === 'rate_limit' ? full : ''], { timeoutMs: 40000 }).catch(() => {})
    }
    return next(e)
  })

  // follow jobs this session sends (before the upload starts, so the office shows it at once)
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    try { await claim($, String((e as any).command ?? '')) } catch { /* never block the command */ }
    return next(e)
  })

  // CLOUD film session: every tool call Claude makes goes to the office live (via Drive), costing no tokens
  on('tool.call', async ($, e, next) => {
    if (!cloudRoot) return next(e)
    // a long command (a pipeline run, a wait on a log) wrote nothing to Drive for an hour and the office called the film
    // silent: while a call runs, say so every 3 min (this also keeps the heartbeat alive through drive.sh ensure)
    let tick: any
    try { liveAct = `Đang chạy: ${describe(e)}`; tick = $.clock.every(180_000, () => { liveDirty = true; void pump($) }) } catch { /* no clock */ }
    try { return await next(e) } finally {
      try { tick?.cancel?.() } catch { /* already ended */ }
      try { report($, e) } catch { /* never disturb the session */ }
    }
  })
}
