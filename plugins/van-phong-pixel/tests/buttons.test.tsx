import { expect, test } from 'claude-code/testing'
import { wheelOffset, isJump } from '../hooks/register'

const PANE = {
  plugin: 'van-phong-pixel', component: 'Pane', requestId: 'van-phong',
  props: { title: 'Văn phòng', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const now = Date.now()
const sony = { slug: 'sony', skill: 'jp-explainer-video', title: 'Sony', stage: 'plan', updated: now - 3 * 3600_000, history: { inputs: { start: now - 4 * 3600_000, end: now - 4 * 3600_000 + 56_000 } } }
const fin = { slug: 'done', skill: 'jp-history-video', title: 'Xong rồi', stage: 'done', updated: now, history: {} }
const appr = { slug: 'appr', skill: 'jp-history-video', title: 'Chờ duyệt', stage: 'plan', approval: true, message: 'Duyệt storyboard', updated: now, history: { plan: { start: now - 60_000 } } }
const demo = { slug: 'demo-run', skill: 'jp-history-video', title: 'Demo chạy', stage: 'research', updated: now, history: {} }

function engine(on: any, calls: string[][], drive?: string) {
  on('command.register', () => ({ value: { command: 'vp' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.scroll', () => ({ value: {} }))
  on('ui.toast', () => ({ value: {} }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('store.get', (_: any, e: any) => ({ value: e.key === 'rclone' ? 'rclone' : e.key === 'home' ? '/home/t' : undefined }))
  on('store.set', () => ({ value: undefined }))
  on('fs.read', () => { throw new Error('ENOENT') })
  on('fs.list', () => { throw new Error('ENOENT') })
  on('process.run', (_: any, e: any) => {
    calls.push(e.argv ?? e.command ?? e)
    const argv = (e.argv ?? []) as string[]
    if (argv[0] === 'sh') return { value: { exitCode: 0, stdout: String(argv[4] ?? '').startsWith('/home/user') ? 'cloud' : '', stderr: '' } }
    if (argv[1] === 'lsf') return { value: { exitCode: 0, stdout: 'jp-history-video/', stderr: '' } }
    if (argv[1] === 'cat') return { value: { exitCode: 0, stdout: drive ?? JSON.stringify(sony) + JSON.stringify(demo) + JSON.stringify(fin) + JSON.stringify(appr), stderr: '' } }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('tool.call', () => ({ result: {} }))
}

test('a job this session sends shows at once, before Drive has it', async ($, on) => {
  const calls: string[][] = []
  engine(on, calls)
  await $.session.start({ cwd: 'D:/x/repo-jp-explainer-video', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'bash local/send.sh moi-ne --title "Phim mới" --script a.txt' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'huy-moi-ne' })).toBeTruthy()
  await ui.unmount()
})

test('adopt, then drop a silent job: buttons act', async ($, on) => {
  const calls: string[][] = []
  engine(on, calls)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // other sessions' jobs are folded under one button; finished ones are not listed
  expect(await ui.find({ type: 'Button', key: 'theo-sony' })).toBeFalsy()
  await ui.press({ key: 'khac-mo' })
  expect(await ui.find({ type: 'Button', key: 'theo-done' })).toBeFalsy()
  expect(await ui.find({ type: 'Button', key: 'theo-sony' })).toBeTruthy()
  await ui.press({ key: 'theo-sony' })
  expect(await ui.find({ type: 'Button', key: 'huy-sony' })).toBeTruthy()
  await ui.press({ key: 'huy-sony' })
  expect(calls.some(a => a.includes('deletefile'))).toBe(true)
  expect(await ui.find({ type: 'Button', key: 'huy-sony' })).toBeFalsy()
  await ui.unmount()
})

test('in a cloud film session, tool calls are reported live', async ($, on) => {
  const calls: string[][] = []
  engine(on, calls)
  await $.session.start({ cwd: '/home/user/repo-jp-history-video', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npm run check', description: 'Kiểm tra layout' })
  const live = calls.find(a => a.includes('live'))
  expect(live).toBeTruthy()
  expect(live![3]).toBe('Kiểm tra layout')
})

test('approval: the Duyệt button sends the reply', async ($, on) => {
  const calls: string[][] = [], prompts: string[] = []
  engine(on, calls)
  on('prompt.submit', (_: any, e: any) => { prompts.push(e.text); return { text: e.text } })
  on('ui.notify', () => ({ value: { isSent: true, channel: 'test' } }))
  await $.session.start({ cwd: 'D:/x/repo-jp-history-video', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'bash local/send.sh appr --title "Chờ duyệt"' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'lam-moi' })
  await ui.press({ key: 'duyet-appr' })
  expect(prompts.some(p => p.includes('Duyệt appr'))).toBe(true)
  await ui.unmount()
})


// the time line of a film: overdue estimates are said as such (never "99 %, 60 s left"),
// no time is invented before Claude gives one, a finished render counts as QA
test('/vp: overdue, waiting for Claude, render done = QA', async ($, on) => {
  const t = Date.now()
  const films = [
    { slug: 'late', skill: 'jp-history-video', title: 'Trễ', stage: 'plan', finishAt: t - 30 * 60_000, updated: t, history: { inputs: { start: t - 7200_000, end: t - 7000_000 }, plan: { start: t - 7000_000 } } },
    { slug: 'fresh', skill: 'jp-history-video', title: 'Mới', stage: 'research', updated: t, history: { inputs: { start: t - 120_000, end: t - 60_000 }, research: { start: t - 60_000 } } },
    { slug: 'qa', skill: 'jp-history-video', title: 'Render xong', stage: 'render', render: 1, finishAt: t + 600_000, updated: t, history: { render: { start: t - 3600_000 } } },
  ]
  engine(on, [], films.map(f => JSON.stringify(f)).join(''))
  await $.session.start({ cwd: 'D:/x/repo-jp-history-video', surface: 'desktop', isInteractive: true })
  for (const s of ['late', 'fresh', 'qa']) await $.tool.call({ tool: 'Bash', command: `bash local/send.sh ${s} --title "${s}"` })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'lam-moi' })
  const { text } = await $.command.run({ command: 'vp' })
  expect(text).toContain('Trễ')
  expect(text).toMatch(/Trễ[^\n]*còn ~/)   // a past Claude estimate gives way to the steps' own estimate
  expect(text).not.toMatch(/Trễ[^\n]*99%/)
  expect(text).toMatch(/Render xong[^\n]*bước 5\/6 QA/)
  await ui.unmount()
})

// Claude out of tokens while the cloud keeps beating: the card says so instead of "Đang làm"
test('/vp: Claude idle (usage limit) is shown even while files keep moving', async ($, on) => {
  const t = Date.now()
  const f = { slug: 'idle', skill: 'jp-history-video', title: 'Hết hạn mức', stage: 'plan', claudeAt: t - 40 * 60_000, updated: t, finishAt: t + 3600_000, history: { plan: { start: t - 7200_000 } } }
  engine(on, [], JSON.stringify(f))
  await $.session.start({ cwd: 'D:/x/repo-jp-history-video', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'bash local/send.sh idle --title "idle"' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'lam-moi' })
  const { text } = await $.command.run({ command: 'vp' })
  expect(text).toMatch(/Hết hạn mức — CLAUDE ĐANG DỪNG/)
  await ui.unmount()
})

// usage limit: the cloud plugin reports it on Drive (no guessing), the office shows when it reopens
test('cloud: a turn stopped by the usage limit is reported with drive.sh stop', async ($, on) => {
  const calls: string[][] = []
  engine(on, calls)
  on('classic.StopFailure', () => ({}))
  await $.session.start({ cwd: '/home/user/repo-jp-history-video', surface: 'desktop', isInteractive: true })
  await ($ as any).classic.StopFailure({ error: 'rate_limit' })
  for (let i = 0; i < 20 && !calls.some(a => a.includes('stop')); i++) await new Promise(r => setTimeout(r, 25))
  const stop = calls.find(a => a.includes('stop'))
  expect(stop?.[3]).toBe('rate_limit')
})

test('/vp: a reported stop says why and until when', async ($, on) => {
  const t = Date.now(), until = t + 2 * 3600_000
  const f = { slug: 'lim', skill: 'jp-history-video', title: 'Dừng hạn mức', stage: 'plan', claudeAt: t - 60_000, claudeStop: { reason: 'rate_limit', until, at: t - 30_000 }, updated: t, history: { plan: { start: t - 3600_000 } } }
  engine(on, [], JSON.stringify(f))
  await $.session.start({ cwd: 'D:/x/repo-jp-history-video', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'bash local/send.sh lim --title "lim"' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'lam-moi' })
  const { text } = await $.command.run({ command: 'vp' })
  expect(text).toMatch(/Dừng hạn mức — CLAUDE ĐANG DỪNG \(hết hạn mức · mở lại lúc \d\d:\d\d\)/)
  await ui.unmount()
})

// % is the share of the work: a planning step that ran 11 h with render still to come is far from done,
// and a new ETA from Claude does not move the %
test('/vp: % counts work, not hours spent', async ($, on) => {
  const t = Date.now()
  const f = { slug: 'long', skill: 'jp-explainer-video', title: 'Kế hoạch dài', stage: 'plan', finishAt: t + 10_000_000, updated: t, history: { inputs: { start: t - 41_000_000, end: t - 40_900_000 }, research: { start: t - 40_900_000, end: t - 39_600_000 }, plan: { start: t - 39_600_000 } } }
  engine(on, [], JSON.stringify(f))
  await $.session.start({ cwd: 'D:/x/repo-jp-explainer-video', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'bash local/send.sh long --title "long"' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'lam-moi' })
  const { text } = await $.command.run({ command: 'vp' })
  const pct = Number(/Kế hoạch dài[^\n]*?(\d+)%/.exec(text)?.[1])
  expect(pct).toBeLessThan(50)
  await ui.unmount()
})

// the Tamiya case: planning ran 11 h 40 (Claude stopped, not recorded), render 0 % just started, Claude's old ETA 70 min
test('/vp: render at 0 % right after a stalled plan reads sensibly', async ($, on) => {
  const t = Date.now(), H = (s: number) => t - s * 1000
  const f = { slug: 'tam', skill: 'jp-explainer-video', title: 'Tamiya', stage: 'render', render: 0, finishAt: t + 70 * 60_000, updated: t,
    history: { inputs: { start: H(45000), end: H(44917) }, research: { start: H(44917), end: H(43597) }, plan: { start: H(43597), end: H(1200) }, render: { start: H(1200) } } }
  engine(on, [], JSON.stringify(f))
  await $.session.start({ cwd: 'D:/x/repo-jp-explainer-video', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'bash local/send.sh tam --title "tam"' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'lam-moi' })
  const { text } = await $.command.run({ command: 'vp' })
  const pct = Number(/Tamiya[^\n]*?(\d+)%/.exec(text)?.[1])
  expect(pct).toBeGreaterThan(20)
  expect(pct).toBeLessThan(45)                       // render (the biggest step) has not moved yet
  expect(text).toMatch(/Tamiya[^\n]*còn ~\d+ giờ/)   // hours, not the 70 min Claude guessed before the render
  await ui.unmount()
})

// Tamiya 2: the cloud's render watcher died (render stays 0 for 66 min): no "Render 0%", time from the step estimate;
// once the 1080p output is being written, the frames count as done and the encode shows as a sub-step
test('/vp: render with no numbers says so; the final encode shows under Render', async ($, on) => {
  const t = Date.now(), H = (s: number) => t - s * 1000
  const hist = { inputs: { start: H(48000), end: H(47917) }, research: { start: H(47917), end: H(46597) }, plan: { start: H(46597), end: H(3960) }, render: { start: H(3960) } }
  const a = { slug: 'tam0', skill: 'jp-explainer-video', title: 'Tamiya A', stage: 'render', render: 0, message: '', activity: 'frame_0412.png', updated: t, history: hist }
  const b = { ...a, slug: 'tam1', title: 'Tamiya B', activity: 'video_1080p.tmp.mp4' }
  const c = { ...a, slug: 'tam2', title: 'Tamiya C', render: 1, encode: 0.6, encodePass: 2, eta: 300 }
  engine(on, [], JSON.stringify(a) + JSON.stringify(b) + JSON.stringify(c))
  await $.session.start({ cwd: 'D:/x/repo-jp-explainer-video', surface: 'desktop', isInteractive: true })
  for (const s of ['tam0', 'tam1', 'tam2']) await $.tool.call({ tool: 'Bash', command: `bash local/send.sh ${s} --title "${s}"` })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'lam-moi' })
  const { text } = await $.command.run({ command: 'vp' })
  expect(text).toMatch(/Tamiya A[^\n]*chưa có số liệu render/)
  expect(text).not.toMatch(/Tamiya A[^\n]*Render 0%/)
  expect(text).toMatch(/Tamiya A[^\n]*còn ~\d+ giờ/)
  expect(text).toMatch(/Tamiya B[^\n]*bước 4\/6 Render › nén video cuối[^\n]*Nén video cuối/)
  expect(text).toMatch(/Tamiya C[^\n]*bước 4\/6 Render[^\n]*Nén video cuối lượt 2\/2 · 60%/)   // not QA yet: the encode is part of Render
  await ui.unmount()
})

test('Windows: the widget button turns the taskbar widget on (writes the switch, live file, starts pythonw) and off', async ($, on) => {
  const calls: string[][] = [], files = new Map<string, string>(), norm = (p: string) => String(p).split(String.fromCharCode(92)).join('/')
  on('command.register', () => ({ value: { command: 'vp' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.scroll', () => ({ value: {} }))
  on('ui.toast', () => ({ value: {} }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('store.get', (_: any, e: any) => ({ value: e.key === 'rclone' ? 'rclone' : e.key === 'home' ? 'C:/Users/t' : undefined }))
  on('store.set', () => ({ value: undefined }))
  on('fs.read', (_: any, e: any) => { const p = norm(e.path); if (files.has(p)) return { value: files.get(p) }; throw new Error('ENOENT') })
  on('fs.write', (_: any, e: any) => { files.set(norm(e.path), e.text); return { value: undefined } })
  on('fs.list', () => { throw new Error('ENOENT') })
  on('process.run', (_: any, e: any) => {
    const argv = (e.argv ?? []) as string[]; calls.push(argv)
    if (argv[1] === 'lsf') return { value: { exitCode: 0, stdout: 'jp-history-video/', stderr: '' } }
    if (argv[1] === 'cat') return { value: { exitCode: 0, stdout: JSON.stringify(sony), stderr: '' } }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: 'D:/x/repo-jp-explainer-video', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'bash local/send.sh sony --title "Sony" --script a.txt' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'widget' })).toBeTruthy()
  await ui.press({ key: 'widget' })
  const sw = 'C:/Users/t/.claude/van-phong/widget.json'
  expect(JSON.parse(files.get(sw)!).on).toBe(true)
  expect(calls.some(a => a[0] === 'powershell' && a.join(' ').includes('Start-Process'))).toBe(true)
  const live = [...files.entries()].find(([k]) => k.includes('/.claude/van-phong/live/'))
  expect(live && JSON.parse(live[1]).jobs[0].slug).toBe('sony')
  await ui.press({ key: 'widget' })
  expect(JSON.parse(files.get(sw)!).on).toBe(false)
  await ui.unmount()
})

// after a press the wheel went through the engine's row scroll and pulled the pane to the top: a tick keeps its direction
test('pane: a wheel tick never scrolls against its direction', () => {
  expect(wheelOffset(3, 0, 40)).toBe(43)     // down, engine said top: keep going down
  expect(wheelOffset(-3, 50, 40)).toBe(37)   // up, engine said further down
  expect(wheelOffset(3, 43, 40)).toBe(43)    // normal tick untouched
  expect(wheelOffset(-3, 0, 2)).toBe(0)
  const P = { kind: 'person' }
  expect(isJump('desktop', { origin: P, by: -5, offset: 0 }, 5)).toBe(true)                    // the jump the log showed
  expect(isJump('desktop', { origin: P, by: -5, offset: 0, pointer: { row: 3 } }, 5)).toBe(false) // a real wheel tick up
  expect(isJump('terminal', { origin: P, by: -5, offset: 0 }, 5)).toBe(false)                   // Home key in the terminal
})

// Onkyo: research 27 min, plan done in 43 s, render just started, Claude says 5 h more: the % is time worked ÷ (worked + left),
// so a step that ended early does not make it jump (it read 32 %), and 5 h reads "5 giờ 0 phút" (not "4 giờ 60 phút")
test('/vp: Onkyo - % agrees with the time left, hours never read 60 minutes', async ($, on) => {
  const t = Date.now(), H = (s: number) => t - s * 1000
  const f = { slug: 'onk', skill: 'jp-history-video', title: 'Onkyo', stage: 'render', render: 0, finishAt: t + 300 * 60_000 - 500, updated: t,
    history: { inputs: { start: H(1767), end: H(1723) }, research: { start: H(1723), end: H(103) }, plan: { start: H(103), end: H(60) }, render: { start: H(60) } } }
  engine(on, [], JSON.stringify(f))
  await $.session.start({ cwd: 'D:/x/repo-jp-history-video', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'bash local/send.sh onk --title "onk"' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'lam-moi' })
  const { text } = await $.command.run({ command: 'vp' })
  const pct = Number(/Onkyo[^\n]*?(\d+)%/.exec(text)?.[1])
  expect(pct).toBeGreaterThanOrEqual(8)
  expect(pct).toBeLessThanOrEqual(12)
  expect(text).toMatch(/Onkyo[^\n]*còn ~5 giờ 0 phút/)
  expect(text).not.toMatch(/60 phút/)
  await ui.unmount()
})

// cloud: after an error that lasted over 10 min is fixed, the office asks Claude once for a new finish time (5 asks at most)
test('cloud: back from a long error, Claude is asked for a new finish time', async ($, on) => {
  const prompts: string[] = []
  let at = 1_800_000_000_000
  engine(on, [])
  on('clock.now', () => ({ value: at }))
  on('prompt.submit', (_: any, e: any) => { prompts.push(e.text); return { text: e.text } })
  const bash = async (command: string) => { await $.tool.call({ tool: 'Bash', command }); await new Promise(r => setTimeout(r, 60)) }
  await $.session.start({ cwd: '/home/user/repo-jp-history-video', surface: 'desktop', isInteractive: true })
  await bash('bash cloud/drive.sh mark blocked "render lỗi"')
  at += 3 * 60_000
  await bash('bash cloud/drive.sh mark resume')
  expect(prompts.length).toBe(0)                       // a short error: no question
  await bash('bash cloud/drive.sh mark blocked "lại lỗi"')
  at += 17 * 60_000
  await bash('bash cloud/drive.sh mark resume')
  expect(prompts[0]).toMatch(/Văn phòng hỏi 1\/5\) Vừa hết lỗi sau 17 phút/)
  await bash('bash cloud/drive.sh mark resume')
  expect(prompts.length).toBe(1)                       // once per recovery
})
