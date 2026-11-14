import { expect, test } from 'claude-code/testing'
import { timeline, liveSteps } from '../hooks/timeline'
// the table is JSON after `export default ` (tests import code only; the widget reads it as JSON)
import table from '../taskbar/timeline-cases.mjs'

const T = ['start', 'end', 'updated', 'finishAt', 'claudeAt', 'beat', 'at', 'until']
// relative seconds -> absolute ms (see "format.times" in the table)
function abs(o: any, now: number): any {
  if (Array.isArray(o)) return o.map(x => abs(x, now))
  if (!o || typeof o !== 'object') return o
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, T.includes(k) && typeof v === 'number' ? now + v * 1000 : abs(v, now)]))
}
const out = (c: any, at: number) => {
  const f = abs(c.film, table.now)
  const v = timeline(f, at, { finish: f.finishAt, learned: c.ctx?.learned, held: c.ctx?.held })
  const cur = v.allDone ? 'done' : v.steps[v.idx]?.id ?? 'idle'
  return { pct: Math.round(v.total * 100), remaining: v.remaining == null ? null : Math.round(v.remaining), step: cur, model: liveSteps(v) }
}
const inRange = (x: number | null, r: any) => r === null ? x === null : x !== null && x >= r[0] && (r[1] == null || x <= r[1])

for (const c of table.cases as any[]) {
  test(`timeline: ${c.name}`, () => {
    const o = out(c, table.now), w = c.want ?? {}
    if (w.pct !== undefined) expect([c.name, o.pct, inRange(o.pct, w.pct)]).toEqual([c.name, o.pct, true])
    if (w.remaining !== undefined) expect([c.name, o.remaining, inRange(o.remaining, w.remaining)]).toEqual([c.name, o.remaining, true])
    if (w.step) expect(o.step).toBe(w.step)
    if (w.samePctAfter) expect(out(c, table.now + w.samePctAfter * 1000).pct).toBe(o.pct)
    // the exact numbers the widget checks itself against
    expect({ pct: o.pct, remaining: o.remaining, step: o.step, model: o.model }).toEqual({ pct: c.pct, remaining: c.remaining, step: c.step, model: c.model })
  })
}
