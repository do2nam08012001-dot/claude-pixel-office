import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { Film, Poll } from '../types'
import { ASSETS } from './assets'
import { officeSvg } from './scene'

const PANE = 'van-phong'
const TITLE = 'Văn phòng'
const POLL_MS = 30_000
const STALE_MS = 15 * 60_000
const films = atom({ plugin: 'van-phong-pixel', key: 'films' } as const, [] as Film[], { shape: 'films-1' })
const poll = atom({ plugin: 'van-phong-pixel', key: 'poll' } as const, { at: 0, error: '' } as Poll)
const focus = atom({ plugin: 'van-phong-pixel', key: 'focus' } as const, '')

const STAGE_VI: Record<string, string> = {
  idle: 'Chờ việc', inputs: 'Nhận đầu vào', research: 'Nghiên cứu tư liệu', plan: 'Lên kế hoạch',
  render: 'Render', qa: 'Kiểm tra QA', deliver: 'Giao phim', done: 'Hoàn thành',
}
const SKILL_VI: Record<string, string> = { 'jp-history-video': 'lịch sử', 'jp-explainer-video': 'explainer' }
const ago = (ms: number) => (ms < 90_000 ? `${Math.max(1, Math.round(ms / 1000))} giây` : ms < 90 * 60_000 ? `${Math.round(ms / 60_000)} phút` : `${Math.round(ms / 3_600_000)} giờ`)
const bar = (f: number, n = 12) => '█'.repeat(Math.round(f * n)) + '░'.repeat(n - Math.round(f * n))

// rclone is installed by winget and may not be on the app's PATH: try PATH first, then find the winget copy once.
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
  throw new Error('Không tìm thấy rclone trên máy (cài: winget install Rclone.Rclone)')
}

async function refresh($: any) {
  try {
    const bin = await rclone($)
    const r = await $.process.run([bin, 'cat', 'gdrive:jp-studio', '--include', '/*/status/*.json'], { timeoutMs: 25000 })
    if (r.exitCode !== 0) throw new Error((r.stderr || 'rclone lỗi').split('\n').filter((l: string) => l && !l.includes('NOTICE')).slice(-1)[0] || 'rclone lỗi')
    const list: Film[] = []
    for (const line of r.stdout.split('\n')) { const t = line.trim(); if (!t.startsWith('{')) continue; try { const f = JSON.parse(t); if (f.slug) list.push(f) } catch { /* partial line */ } }
    list.sort((a, b) => b.updated - a.updated)
    await update($, films, () => list)
    await update($, poll, () => ({ at: Date.now(), error: '' }))
  } catch (err: any) {
    await update($, poll, (p: Poll) => ({ at: p?.at ?? 0, error: String(err?.message ?? err).slice(0, 160) }))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'van-phong', description: 'Mở ô văn phòng pixel: tiến độ, lỗi và việc chờ duyệt của các phim trên cloud' })
    void $.ui.open({ id: PANE, title: TITLE })
    void refresh($)
    $.clock.every(POLL_MS, () => { void refresh($) })
    return next(e)
  })

  on('command.run', { command: 'van-phong' }, async $ => {
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
    const live = list.filter(f => f.stage !== 'done')
    const shown = list.find(f => f.slug === want) ?? live[0] ?? list[0]
    const needs = list.filter(f => f.blocked || f.approval)
    const errs = list.filter(f => f.blocked).length, waits = list.filter(f => f.approval && !f.blocked).length
    const px = Math.round(Math.max(220, Math.min(720, ((e.props as any).bodyColumns ?? 56) * 8.6)))
    const scene = officeSvg(ASSETS, shown ? { ...shown } : { stage: 'idle' }).full(px)

    const header = (
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Văn phòng · chủ tịch</Text>
        <Box flexDirection="row" gap={1}>
          {waits > 0 && <Text color="yellow">{waits} chờ duyệt</Text>}
          {errs > 0 && <Text color="red">{errs} lỗi</Text>}
          {waits === 0 && errs === 0 && <Text color="green">ổn</Text>}
        </Box>
      </Box>
    )
    const row = (f: Film) => {
      const stale = f.stage !== 'done' && now - f.updated > STALE_MS
      const pct = f.stage === 'render' ? ` ${bar(f.render ?? 0)} ${Math.round((f.render ?? 0) * 100)}%` : ''
      const eta = f.stage === 'render' && f.eta ? ` · còn ~${ago(f.eta * 1000)}` : ''
      return (
        <Box key={f.slug} flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold={f.slug === shown?.slug}>{f.blocked ? '● ' : f.approval ? '● ' : f.stage === 'done' ? '✓ ' : '○ '}{f.title}</Text>
            <Button key={'xem-' + f.slug} label="Xem" onPress={() => update($, focus, () => f.slug)} />
          </Box>
          <Text dimColor>{SKILL_VI[f.skill] ?? f.skill} · {STAGE_VI[f.stage] ?? f.stage}{pct}{eta} · {ago(now - f.updated)} trước</Text>
          {stale && <Text color="yellow">Không cập nhật {ago(now - f.updated)}: phiên cloud có thể đã dừng, mở phiên để kiểm tra.</Text>}
        </Box>
      )
    }
    const inbox = needs.map(f => (
      <Box key={'in-' + f.slug} flexDirection="column">
        <Text color={f.blocked ? 'red' : 'yellow'}>{f.blocked ? 'Lỗi' : 'Chờ duyệt'} · {f.title}</Text>
        <Text>{f.message || (f.blocked ? 'Phiên cloud báo bị vướng.' : 'Phiên cloud chờ bạn trả lời.')}</Text>
        <Text dimColor>Trả lời trong phiên cloud của phim này (danh sách phiên bên trái).</Text>
      </Box>
    ))
    const footer = (
      <Box flexDirection="row" justifyContent="space-between">
        <Text dimColor>{p.error ? `Chưa đọc được Drive: ${p.error}` : p.at ? `Cập nhật ${ago(now - p.at)} trước · tự làm mới mỗi 30 giây` : 'Đang đọc Drive…'}</Text>
        <Button key="lam-moi" label="Làm mới" onPress={() => refresh($)} />
      </Box>
    )
    const Svg = els.Svg
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {Svg ? <Svg source={scene} alt={shown ? `Văn phòng: ${shown.title} — ${STAGE_VI[shown.stage]}` : 'Văn phòng đang chờ việc'} width={px} height={px} isInteractive /> : null}
        {list.length === 0 ? <Text dimColor>Chưa có phim nào trên cloud. Gửi việc từ thư mục repo, nhân viên sẽ bắt đầu làm.</Text> : list.slice(0, 6).map(row)}
        {inbox.length > 0 && <Text bold>Hộp thư chủ tịch</Text>}
        {inbox}
        {footer}
      </Box>
    )
  })
}
