import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { Film, Poll, Role, Step } from '../types'
import { ASSETS } from './assets'
import { officeSvg, legacy } from './scene'

const PANE = 'van-phong'
const TITLE = 'Văn phòng'
const POLL_MS = 30_000
const STALE_MS = 15 * 60_000
const DEFAULT_DRIVE = 'gdrive:jp-studio'
const films = atom({ plugin: 'van-phong-pixel', key: 'films' } as const, [] as Film[], { shape: 'films-2' })
const poll = atom({ plugin: 'van-phong-pixel', key: 'poll' } as const, { at: 0, error: '' } as Poll)
const focus = atom({ plugin: 'van-phong-pixel', key: 'focus' } as const, '')

// Legacy video pipeline (v1 status files written by the jp video repos)
const VIDEO_STEPS: Step[] = [
  { id: 'inputs', label: 'Nhận đầu vào', role: 'fetch' }, { id: 'research', label: 'Nghiên cứu', role: 'research' },
  { id: 'plan', label: 'Kế hoạch', role: 'plan' }, { id: 'render', label: 'Render', role: 'build' },
  { id: 'qa', label: 'QA', role: 'check' }, { id: 'deliver', label: 'Giao phim', role: 'deliver' },
]
const ROLES: Role[] = ['fetch', 'research', 'plan', 'build', 'check', 'deliver']
const GROUP_VI: Record<string, string> = { 'jp-history-video': 'video lịch sử', 'jp-explainer-video': 'video explainer' }
const ago = (ms: number) => (ms < 90_000 ? `${Math.max(1, Math.round(ms / 1000))} giây` : ms < 90 * 60_000 ? `${Math.round(ms / 60_000)} phút` : `${Math.round(ms / 3_600_000)} giờ`)
const bar = (f: number, n = 12) => '█'.repeat(Math.round(f * n)) + '░'.repeat(n - Math.round(f * n))

type View = { steps: Step[]; idx: number; allDone: boolean; progress: number; scene: any }
function view(f: Film): View {
  if (Array.isArray(f.workflow) && f.workflow.length) {
    const steps = f.workflow.map((s, i) => ({ id: String(s.id ?? i), label: String(s.label ?? s.id ?? `Bước ${i + 1}`), role: (ROLES.includes(s.role) ? s.role : ROLES[Math.min(i, 5)]) as Role }))
    const allDone = !!f.done || f.step === 'done'
    let idx = steps.findIndex(s => s.id === f.step); if (idx < 0 && typeof f.step === 'number') idx = f.step
    if (allDone) idx = steps.length
    const labels: Record<string, string> = {}
    for (const s of steps) if (!labels[s.role]) labels[s.role] = s.label
    if (idx >= 0 && idx < steps.length) labels[steps[idx].role] = steps[idx].label
    const progress = Math.max(0, Math.min(1, f.progress ?? 0))
    return { steps, idx, allDone, progress, scene: { active: idx >= 0 && idx < steps.length ? steps[idx].role : null, progress, doneRoles: steps.slice(0, Math.max(0, idx)).map(s => s.role).filter(r => idx >= steps.length || r !== steps[idx]?.role), allDone, blocked: f.blocked, approval: f.approval, labels } }
  }
  const sc = legacy(f)
  const map: Record<string, number> = { idle: -1, inputs: 0, research: 1, plan: 2, render: 3, qa: 4, deliver: 5, done: 6 }
  return { steps: VIDEO_STEPS, idx: map[f.stage ?? 'idle'] ?? -1, allDone: f.stage === 'done', progress: f.stage === 'render' ? f.render ?? 0 : 0, scene: sc }
}
const stepper = (v: View, blocked?: boolean) => v.steps.map((s, i) => `${i < v.idx || v.allDone ? '✓' : i === v.idx ? (blocked ? '!' : '●') : '○'} ${s.label}`).join(' › ')

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
// rclone may be installed by winget and not be on the app's PATH: try PATH first, then find the winget copy once.
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

async function refresh($: any) {
  const list: Film[] = [], errors: string[] = []
  const h = await home($)
  const dir = h ? `${h}/.claude/van-phong` : ''
  let drive = DEFAULT_DRIVE
  if (dir) {
    try { const cfg = JSON.parse(await $.fs.read(`${dir}/config.json`)); if (typeof cfg.drive === 'string') drive = cfg.drive } catch { /* no config: defaults */ }
    // local status files: ~/.claude/van-phong/status/*.json
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
  list.sort((a, b) => b.updated - a.updated)
  await update($, films, () => list)
  await update($, poll, () => ({ at: Date.now(), error: list.length ? '' : errors.join(' · ') }))
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
    void refresh($)
    return { text: 'Đã mở ô Văn phòng.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els: any = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const list = (await read($, films)) ?? []
    const p = (await read($, poll)) ?? { at: 0, error: '' }
    const want = (await read($, focus)) ?? ''
    const now = Date.now()
    const isDone = (f: Film) => f.done || f.step === 'done' || f.stage === 'done'
    const shown = list.find(f => f.slug === want) ?? list.find(f => !isDone(f)) ?? list[0]
    const needs = list.filter(f => f.blocked || f.approval)
    const errs = list.filter(f => f.blocked).length, waits = list.filter(f => f.approval && !f.blocked).length
    const px = Math.round(Math.max(220, Math.min(720, ((e.props as any).bodyColumns ?? 56) * 8.6)))
    const scene = officeSvg(ASSETS, shown ? view(shown).scene : { active: null, doneRoles: [] }).full(px)

    const row = (f: Film) => {
      const v = view(f)
      const stale = !isDone(f) && now - f.updated > STALE_MS
      const cur = v.idx >= 0 && v.idx < v.steps.length ? v.steps[v.idx] : null
      const pct = cur && v.progress > 0 ? ` ${bar(v.progress)} ${Math.round(v.progress * 100)}%` : ''
      const eta = cur && f.eta ? ` · còn ~${ago(f.eta * 1000)}` : ''
      const group = GROUP_VI[f.group ?? f.skill ?? ''] ?? f.group ?? f.skill ?? ''
      return (
        <Box key={f.slug} flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold={f.slug === shown?.slug} color={f.blocked ? 'red' : f.approval ? 'yellow' : isDone(f) ? 'green' : undefined}>{f.blocked || f.approval ? '! ' : isDone(f) ? '✓ ' : '○ '}{f.title || f.slug}</Text>
            <Button key={'xem-' + f.slug} label="Xem" onPress={() => update($, focus, () => f.slug)} />
          </Box>
          <Text dimColor>{group ? `${group} · ` : ''}{isDone(f) ? 'Hoàn thành' : cur ? cur.label : 'Chờ việc'}{pct}{eta} · {ago(now - f.updated)} trước</Text>
          <Text dimColor>{stepper(v, f.blocked)}</Text>
          {stale && <Text color="yellow">Không cập nhật {ago(now - f.updated)}: công việc có thể đã dừng.</Text>}
        </Box>
      )
    }
    const inbox = needs.map(f => (
      <Box key={'in-' + f.slug} flexDirection="column">
        <Text color={f.blocked ? 'red' : 'yellow'}>{f.blocked ? 'Lỗi' : 'Chờ duyệt'} · {f.title || f.slug}</Text>
        <Text>{f.message || (f.blocked ? 'Công việc báo bị vướng.' : 'Công việc chờ bạn trả lời.')}</Text>
        <Text dimColor>{f.source === 'drive' ? 'Trả lời trong phiên cloud của việc này.' : 'Trả lời trong phiên đang chạy việc này.'}</Text>
      </Box>
    ))
    const Svg = els.Svg
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>Văn phòng · chủ tịch</Text>
          <Box flexDirection="row" gap={1}>
            {waits > 0 && <Text color="yellow">{waits} chờ duyệt</Text>}
            {errs > 0 && <Text color="red">{errs} lỗi</Text>}
            {waits === 0 && errs === 0 && <Text color="green">ổn</Text>}
          </Box>
        </Box>
        {Svg ? <Svg source={scene} alt={shown ? `Văn phòng: ${shown.title || shown.slug}` : 'Văn phòng đang chờ việc'} width={px} height={px} isInteractive /> : null}
        {list.length === 0 ? <Text dimColor>Chưa có việc nào. Ghi trạng thái bằng office-status (xem README) hoặc gửi việc từ repo video.</Text> : list.slice(0, 8).map(row)}
        {inbox.length > 0 && <Text bold>Hộp thư chủ tịch</Text>}
        {inbox}
        <Box flexDirection="row" justifyContent="space-between">
          <Text dimColor>{p.error ? p.error : p.at ? `Cập nhật ${ago(now - p.at)} trước · tự làm mới mỗi 30 giây` : 'Đang đọc trạng thái…'}</Text>
          <Button key="lam-moi" label="Làm mới" onPress={() => refresh($)} />
        </Box>
      </Box>
    )
  })
}
