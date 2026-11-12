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
const finish = new Map<string, number>()   // slug -> finish time shown (ms)
const soundOn = atom({ plugin: 'van-phong-pixel', key: 'soundOn' } as const, true)
async function sound($: any, name: 'ting' | 'chime') {
  try { if ((await read($, soundOn)) === false) return; await $.audio.play({ asset: `sounds/${name}.wav` }) } catch { /* no player on this surface */ }
}
const paneOpen = atom({ plugin: 'van-phong-pixel', key: 'paneOpen' } as const, false)
// learned stage durations (seconds, median of the last films) per "skill:stage"; seeds the estimates of new films
let learned: Record<string, number> = {}
const LEARN = 'learned-v1'
// cloud film session: repo root (has cloud/drive.sh) when this session runs in the cloud; live reports are throttled
let cloudRoot = '', liveAct = '', liveTodos = '', liveDirty = false, livePushing = false, liveLast = 0
const openOthers = atom({ plugin: 'van-phong-pixel', key: 'openOthers' } as const, false)
let lastScrolled = ''
// step changes the pane has noticed: slug -> { step, from, to, at }; the hand-off walk plays from the moment it is noticed
const seen = new Map<string, { step: string; from?: string; to?: string; at: number }>()
let ticks = 0, driveCache: Film[] = [], driveError = ''
// last known flags per job, to raise a toast when a job gets blocked, waits for approval or finishes
const flags = new Map<string, string>()
// last scene: reuse the same SVG while nothing visible changed, so the pane does not reload (flash)
let sceneKey = '', sceneSvg = ''
// the office is two pictures (top / bottom half) stacked in the flow; kept joined by SEP
const SEP = '\u0001'
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
    steps = VIDEO_STEPS.map(s => ({ ...s, est: learned[`${f.skill}:${s.id}`] ?? s.est }))
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
  // TIME is the unit of every bar: a finished step is as wide as it took, the current one as wide as
  // (time spent + time it still needs), later ones as their (pace-scaled / learned) estimate.
  // So the total bar, its %, the step bar and the HP bar over the worker all say the same thing.
  const cur = sv.find(s => s.state === 'now')
  const futW = () => sv.reduce((a, s) => a + (s.state === 'wait' ? s.w : 0), 0)
  const spentCur = cur?.elapsed ?? 0
  // what the current step still needs on its own estimate (never zero: a step that ran over still needs a bit)
  const curNeed = cur ? (cur.left != null && cur.left > 0 ? cur.left : Math.max(60, spentCur * 0.1)) : 0
  let curLeft = curNeed
  const fin = finish.get(f.slug)
  if (fin && !allDone) {
    // Claude's own estimate of the whole film: split what is left between this step and the later ones
    remaining = Math.max(60, (fin - now) / 1000); known = true; over = false
    const fut = futW(), share = curNeed + fut > 0 ? curNeed / (curNeed + fut) : 1
    curLeft = remaining * share
    const k = fut > 0 ? (remaining - curLeft) / fut : 1
    for (const s of sv) if (s.state === 'wait') { s.w = s.w * k; s.guess = s.w }
  }
  if (cur) {
    cur.w = Math.max(1, spentCur + curLeft); cur.left = curLeft
    frac = progress > 0.03 && !fin ? progress : Math.min(0.99, spentCur / cur.w)
    if (progress > 0.03 && !fin) cur.w = Math.max(cur.w, spentCur / Math.max(0.01, progress))
  }
  const W = sv.reduce((a, s) => a + s.w, 0) || 1
  const doneW = sv.reduce((a, s) => a + (s.state === 'done' ? s.w : 0), 0)
  const total = (doneW + (cur ? cur.w * frac : 0)) / W
  if (!fin && !over) remaining = known ? Math.max(0, W - doneW - (cur ? cur.w * frac : 0)) : remaining
  // the HP bar starts at the same share and fills exactly when the step should end
  scene = { ...scene, progress: frac, rate: curLeft > 0 ? (1 - frac) / curLeft : 0 }
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
        for (const p of parts) for (const o of objects(p)) if (o.slug) fresh.push({ ...o, source: 'drive' })
        driveCache = fresh; driveError = ''; scanOk = Date.now()   // swap only on success: a failed read keeps the last list
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
    else if (prev.step !== key) { seen.set(f.slug, cur && v.idx > 0 ? { step: key, from: v.steps[v.idx - 1].role, to: cur.role, at: nowMs } : { step: key, at: 0 }); void sound($, 'ting') }
  }
  // tell the chairman at once when something needs them or a job is done
  for (const f of list) {
    const now = isDone(f) ? 'done' : f.blocked ? 'err' : f.approval ? 'wait' : 'run', before = flags.get(f.slug)
    if (before !== undefined && before !== now && now !== 'run') {
      const msg = now === 'err' ? `Lỗi · ${f.title || f.slug}: ${f.message || 'bị vướng'} — trả lời ngay trong phiên này`
        : now === 'wait' ? `Chờ duyệt · ${f.title || f.slug}: ${f.message || 'cần bạn trả lời'} — trả lời ngay trong phiên này`
        : `Xong · ${f.title || f.slug} — gõ "lấy video" để tải về máy`
      try { $.ui.toast(msg) } catch { /* no surface */ }
      void sound($, 'chime')
      void $.ui.notify(msg, { title: 'Văn phòng' }).catch(() => { /* notifications off */ })
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
function report($: any, e: any) {
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
    }
  } catch { /* offline: the next call tries again */ } finally { livePushing = false }
}

async function learn($: any, list: Film[]) {
  let db: { d: Record<string, number[]>; seen: string[] } = { d: {}, seen: [] }
  try { db = ((await $.store.get(LEARN)) as typeof db) ?? db } catch { /* first run */ }
  let changed = false
  for (const f of list) for (const [stage, h] of Object.entries(f.history ?? {})) {
    if (!h?.start || !h.end || !f.skill) continue
    const id = `${f.slug}:${stage}`
    if (db.seen.includes(id)) continue
    const k = `${f.skill}:${stage}`, s = (h.end - h.start) / 1000
    if (s > 5) { db.d[k] = [...(db.d[k] ?? []), s].slice(-8); changed = true }
    db.seen = [...db.seen, id].slice(-400)
  }
  if (changed) { try { await $.store.set(LEARN, db) } catch { /* read-only */ } }
  const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)] }
  learned = Object.fromEntries(Object.entries(db.d).filter(([, v]) => v.length).map(([k, v]) => [k, med(v)]))
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
  const sceneState = { ...(shown ? view(shown, now).scene : { active: null, doneRoles: [] }), now, hour: new Date(now).getHours() }
  // progress is animated inside the SVG (HP bars run at the real rate), so only visible state changes redraw it
  // the HP bar is redrawn every 5 % (it animates smoothly in between), other visible changes redraw at once
  const key = JSON.stringify({ ...sceneState, now: undefined, progress: Math.round((sceneState.progress ?? 0) * 20), rate: undefined, handoffAge: undefined, px })
  if (key !== sceneKey) {
    sceneKey = key
    // one square picture that scales with the pane (the background is light enough now to fit with everything)
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
    const td = (f as any).todo as { done: number; total: number; current: string } | undefined
    // what the cloud is doing: its todo item, else its note, else the render % or the last file it touched
    const live = kind === 'run' && !v.allDone ? (td?.current ? `${td.current} (${td.done}/${td.total})` : f.message
      || (f.stage === 'render' ? `Render ${Math.round((f.render ?? 0) * 100)}%` : f.activity ? `vừa sửa ${f.activity}` : '')) : ''
    const message = f.blocked || f.approval ? (f.message || (f.blocked ? 'Công việc báo bị vướng.' : 'Công việc chờ bạn trả lời.')) : stale || (live ? `Đang làm: ${live}` : '')
    const reply = f.blocked || f.approval ? (f.source === 'drive' ? 'Trả lời ngay trong phiên gốc này — Claude chuyển sang phiên cloud.' : 'Trả lời trong phiên đang chạy việc này.') : stale ? 'Hỏi Claude ở phiên gốc kiểm tra phiên cloud.' : live && f.activity ? `Claude vừa: ${f.activity}` : ''
    const svg = cardSvg({ title: f.title || f.slug, group, status: { t: KIND_T[kind], kind }, total: v.total, etaText, steps, progress: v.frac, message, reply, updatedText: `${dur((now - f.updated) / 1000)} trước`, focused }, W)
    return (
      <Box key={v.allDone ? `job-${f.slug}` : `cur-${f.slug}`} flexDirection="column">
        {Svg ? <Svg source={svg} alt={`${f.title || f.slug}: ${KIND_T[kind]}, tổng ${Math.round(v.total * 100)}%, ${etaText}`} /> : <Text>{f.title || f.slug} · {KIND_T[kind]} · {Math.round(v.total * 100)}% · {etaText}</Text>}
        <Box flexDirection="row" justifyContent="flex-end" gap={1}>
          {f.approval && !f.blocked ? <Button key={'duyet-' + f.slug} variant="primary" label="✓ Duyệt" onPress={() => $.prompt.submit({ text: `Duyệt ${f.slug} — chuyển nguyên lời "duyệt" sang phiên cloud của phim này.` })} /> : null}
          {f.approval || f.blocked ? <Button key={'sua-' + f.slug} label={f.blocked ? '✎ Trả lời lỗi' : '✎ Yêu cầu sửa'} onPress={() => $.prompt.fill({ text: `${f.blocked ? 'Trả lời lỗi' : 'Yêu cầu sửa'} ${f.slug} (chuyển sang phiên cloud): ` })} /> : null}
          {v.allDone && f.source === 'drive' ? <Button key={'tai-' + f.slug} variant="primary" label="⬇ Tải video về" onPress={() => $.prompt.submit({ text: `Tải video ${f.slug} về máy: chạy local/fetch.sh ${f.slug}, rồi báo đường dẫn thư mục ket-qua.` })} /> : null}
          {!focused ? <Button key={'xem-' + f.slug} label="👁 Xem trong văn phòng" onPress={() => update($, focus, () => f.slug)} /> : null}
          <Button key={'huy-' + f.slug} label={kind === 'stale' || v.allDone ? '🗑 Xóa khỏi văn phòng' : '✕ Hủy theo dõi'} onPress={() => drop($, f, kind === 'stale')} />
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
      {Svg ? <Svg source={footerSvg(W, p.error ? p.error : p.at ? `cập nhật ${dur((now - p.at) / 1000)} trước · làm mới mỗi 5 giây` : 'đang đọc trạng thái…', !!p.error)} alt={p.error || 'Văn phòng đang cập nhật trực tiếp'} /> : <Text dimColor>{p.error || 'Đang cập nhật'}</Text>}
      <Box flexDirection="row" justifyContent="flex-end">
        <Box flexDirection="row" gap={1}>
          <Button key="am-thanh" label={(await read($, soundOn)) === false ? '🔇 Bật tiếng' : '🔊 Tắt tiếng'} onPress={async () => { const on = !((await read($, soundOn)) ?? true); await update($, soundOn, () => on); try { await $.store.set('sound', on) } catch { /* read-only */ } }} />
          <Button key="lam-moi" label="⟳ Làm mới" onPress={() => { lastScrolled = ''; return refresh($) }} />
        </Box>
      </Box>
    </Box>
  )
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const cwd = String((e as any).cwd ?? '')
    try { const sv = await $.store.get('sound'); if (sv === false) await update($, soundOn, () => false) } catch { /* default on */ }
    ownKey = `owned:${String((e as any).session_id ?? (e as any).sessionId ?? cwd)}`
    try {
      const saved = (await $.store.get(ownKey)) as Owned[] | undefined
      if (saved?.length) await update($, owned, (o: Owned[]) => [...(o ?? []), ...saved.filter(s => !(o ?? []).some(x => x.slug === s.slug))]); void keep($)
    } catch { /* first start */ }
    cwdSkill = /explainer/.test(cwd) ? 'jp-explainer-video' : /history-video/.test(cwd) ? 'jp-history-video' : undefined
    // a cloud session of a video repo reports Claude's work live (the PC's office reads it from Drive)
    if (cwd && cwdSkill) {
      try {
        const r = await $.process.run(['sh', '-c', 'if [ "$CLAUDE_CODE_REMOTE" = true ] || [ -d /root/.ccr ]; then [ -f "$1/cloud/drive.sh" ] && echo cloud; fi', 'sh', cwd], { timeoutMs: 5000 })
        if (r.exitCode === 0 && r.stdout.trim() === 'cloud') cloudRoot = cwd
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

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => drawOffice($, e))

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
    const f = act[0], now = Date.now(), v = view(f, now)
    const flag = f.blocked ? 'LỖI · ' : f.approval ? 'CHỜ DUYỆT · ' : ''
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

  // follow jobs this session sends (before the upload starts, so the office shows it at once)
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    try { await claim($, String((e as any).command ?? '')) } catch { /* never block the command */ }
    return next(e)
  })

  // CLOUD film session: every tool call Claude makes goes to the office live (via Drive), costing no tokens
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (cloudRoot) { try { report($, e) } catch { /* never disturb the session */ } }
    return r
  })
}
