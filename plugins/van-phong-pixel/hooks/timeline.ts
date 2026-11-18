// The film's time line as one pure function: step states, time left, the % and the bar. Every number the pane, the
// /vp summary, the band above the prompt and the taskbar widget show comes from here, and nothing here reads the
// clock or module state: the same (film, now, ctx) always gives the same answer. Cases: taskbar/timeline-cases.json.
import type { Film, Role, Step } from '../types'
import { legacy } from './scene'

export const STALE_MS = 15 * 60_000
/** raise it with any change to the numbers below; the case table carries the same value and the widget's port checks it */
export const TIMELINE_VERSION = 3
// Legacy video pipeline (v1 status files of the jp video repos); est = rough seconds per stage
export const VIDEO_STEPS: Step[] = [
  { id: 'inputs', label: 'Nhận đầu vào', role: 'fetch', est: 120 }, { id: 'research', label: 'Nghiên cứu', role: 'research', est: 1800 },
  { id: 'plan', label: 'Kế hoạch', role: 'plan', est: 5400 }, { id: 'render', label: 'Render', role: 'build', est: 14400 },
  { id: 'qa', label: 'QA', role: 'check', est: 900 }, { id: 'deliver', label: 'Giao phim', role: 'deliver', est: 300 },
]
// a learned step time worth keeping: over 3x the default it held an overnight stop (old films had no `paused`)
export const fairTook = (stage: string, s: number) => { const e = VIDEO_STEPS.find(x => x.id === stage)?.est; return s > 5 && (!e || s <= 3 * e) }
const ROLES: Role[] =['fetch', 'research', 'plan', 'build', 'check', 'deliver']

export type StepView = Step & { state: 'done' | 'now' | 'wait'; took?: number; elapsed?: number; left?: number | null; guess?: number | null; w: number; work: number }
export type View = { over: boolean; overdue: number; steps: StepView[]; idx: number; allDone: boolean; progress: number; frac: number; scene: any; total: number; remaining: number | null; known: boolean; rnote: string; barNow: number; at: number }
/** finish: Claude's finish time as shown (ms, smoothed by the caller); learned: "skill:stage" -> seconds;
 *  held: the % shown while the current step had no real number (so the first real number never makes it drop) */
export type Held = { step: string; pct: number }
export type TimelineCtx = { finish?: number; learned?: Record<string, number>; held?: Held }

export const isDone = (f: Film) => !!f.done || f.step === 'done' || f.stage === 'done'
/** a film silent for 15 min is shown as it was at its last word: % and bar stop instead of counting time nobody confirmed */
export const seenAt = (f: Film, now: number) => !isDone(f) && now - f.updated > STALE_MS ? f.updated : now

/** the view, and the held % to keep for the next call (undefined: keep none) */
export function timeline(f: Film, now0: number, ctx: TimelineCtx = {}): View & { held?: Held } {
  const now = seenAt(f, now0), learned = ctx.learned ?? {}
  let steps: Step[], idx: number, allDone: boolean, progress: number, scene: any
  // the final encode (frames are done) shows as a sub-step of Render: the cloud reports encode 0..1 (both passes) and
  // encodePass; before that, the 1080p output file is the sign
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
      const left: number | null = typeof f.eta === 'number' ? f.eta
        : progress > 0.03 && elapsed ? elapsed * (1 - progress) / progress
        : base && (elapsed ?? 0) < base ? base - (elapsed ?? 0) : null
      if (left === null && !(progress > 0.03)) over = true
      if (left === null) known = false; else remaining! += left
      return { ...s, state: 'now', elapsed, left, w: s.est ?? avg ?? ((elapsed ?? 0) + (left ?? 0) || 60), work: 0 }
    }
    const guess = s.est ? s.est * pace : avg
    if (guess == null) known = false; else remaining! += guess
    return { ...s, state: 'wait', guess, w: guess ?? 60, work: 0 }
  })
  if (allDone) remaining = 0
  // the current step uses real progress when the job reports it (render %, notes, upload %), each later step its own
  // estimate, and the total time left is never below the sum of the steps (Claude's estimate wins when it is longer)
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
  const fin = ctx.finish
  let late = 0
  // rem: the time left the % is split by (inside only: it may lean on the step estimates)
  if (!allDone && fin) {
    if (fin > now) { remaining = Math.max((fin - now) / 1000, own ?? 0); known = true; over = false }
    else if (own != null) { remaining = own; known = true }
    else late = (now - fin) / 1000
  } else if (!allDone && own != null && known) remaining = own
  // shown: the time left and finish time are Claude's alone (never a sum of guessed step lengths); none yet = none shown
  const shown = allDone ? 0 : fin && fin > now ? (fin - now) / 1000 : null
  const overdue = !allDone && fin && fin <= now ? (now - fin) / 1000 : 0
  let total: number, barNow = frac, held: Held | undefined   // barNow: how much of the current step's block the total bar fills
  // no real number for the current step yet (render with no frame or encode, others ≤ 3 %)
  const noData = f.stage === 'render' ? !enc && !((f.render ?? 0) > 0) : !(progress > 0.03)
  // Claude gave a finish time: % = time worked ÷ (time worked + Claude's time left), with the real time of every step
  // (stops left out). It runs evenly to ~99 % at Claude's finish time and agrees with "còn … · xong …"; it moves
  // only when Claude gives a new time (the cloud reminds Claude to every ≤ 10 min, and as soon as it is overdue).
  // Version 3: no cap for a step with no number (t25: QA 5 h with no number read 20 % with 2 min left, then 100 %).
  if (!allDone && cur && (shown != null || overdue)) {
    const left = shown ?? 0   // overdue: nothing left by Claude's time, the % waits at 99 % for Claude's new one
    const guesses = sv.reduce((a, s) => a + (s.state === 'wait' ? (s.guess ?? 0) : 0), 0)
    // a step over 3x its usual length with no recorded stop held an unrecorded stop (Tamiya: 11 h plan): it counts 3x
    const fair = (t: number, est?: number) => (est && t > 3 * est && !f.paused ? 3 * est : t)
    sv.forEach((s, i) => { s.work = s.state === 'done' ? fair(tooks[i] ?? 0, s.est) : s.state === 'wait' ? (s.guess ?? 0) : 0 })
    const spent = fair(spentCur, cur.est)
    cur.work = Math.max(1, spent + Math.max(0, left - guesses))
    const doneW = sv.reduce((a, s) => a + (s.state === 'done' ? s.work : 0), 0)
    total = (doneW + spent) / Math.max(1, doneW + spent + left)
    barNow = Math.min(1, (total * Math.max(1, doneW + spent + left) - doneW) / cur.work)   // the bar's blocks add up to the %
  } else {
    // no honest time left: share of the WORK (each step's usual length)
    for (const s of sv) s.work = s.est ?? avg ?? 60
    const WW = sv.reduce((a, s) => a + s.work, 0) || 1
    total = (sv.reduce((a, s) => a + (s.state === 'done' ? s.work : 0), 0) + (cur ? cur.work * (noData ? Math.min(frac, 0.1) : frac) : 0)) / WW
  }
  // the HP bar starts at the same share and fills exactly when the step should end
  scene = { ...scene, progress: frac, rate: curLeft && curLeft > 0 ? (1 - frac) / curLeft : 0 }
  return { over, overdue, steps: sv, idx, allDone, progress, frac, barNow, scene, total: allDone ? 1 : Math.min(0.99, total), remaining: shown, known: shown != null, rnote, held, at: now }
}

/** the step model the plugin hands the taskbar widget, so it can go on by itself from the Drive status */
export const liveSteps = (v: View) => v.steps.map(s => ({ id: s.id, work: Math.round(s.work), guess: Math.round(s.state === 'wait' ? (s.guess ?? s.work) : s.state === 'now' ? (s.est ?? s.work) : 0), est: s.est == null ? null : Math.round(s.est) }))
