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

function engine(on: any, calls: string[][]) {
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
    if (argv[1] === 'cat') return { value: { exitCode: 0, stdout: JSON.stringify(sony) + JSON.stringify(demo) + JSON.stringify(fin) + JSON.stringify(appr), stderr: '' } }
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

