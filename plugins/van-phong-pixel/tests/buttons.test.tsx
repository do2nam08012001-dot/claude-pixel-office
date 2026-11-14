import { expect, test } from 'claude-code/testing'

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
  expect(text).toMatch(/Trễ[^\n]*quá giờ dự kiến/)
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
