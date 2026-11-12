#!/usr/bin/env node
// office-status — write status files that the "Văn phòng" pane (van-phong-pixel) shows, for ANY multi-step workflow.
// Files go to ~/.claude/van-phong/status/<slug>.json (read by the pane every 30 s); add --drive <remote:path> to also
// upload to rclone (the pane reads <drive>/*/status/*.json, e.g. --drive gdrive:jp-studio/my-group).
//
//   node office-status.mjs init <slug> --title "Viết blog" --steps "Thu thập:fetch,Đọc tài liệu:research,Dàn ý:plan,Viết:build,Biên tập:check,Đăng:deliver" [--group blog]
//   node office-status.mjs step <slug> <stepId|number> [--progress 0.4] [--eta 600]   (number = 1-based position)
//   node office-status.mjs progress <slug> <0..1> [--eta seconds]
//   node office-status.mjs next <slug>              (current step done, move to the next one)
//   node office-status.mjs blocked <slug> "lý do"   |  approval <slug> "cần duyệt gì"  |  resume <slug>
//   node office-status.mjs done <slug>              |  remove <slug>   |  list
// Roles (which office room/employee a step uses): fetch (kho) · research (thư viện) · plan (kế hoạch) ·
// build (sản xuất/render) · check (kiểm tra) · deliver (giao cho chủ tịch). A step without a role gets one by position.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROLES = ['fetch', 'research', 'plan', 'build', 'check', 'deliver'];
const dir = path.join(os.homedir(), '.claude', 'van-phong', 'status');
const [cmd, slug, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : undefined; };
const pos = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));
const die = (m) => { console.error(m); process.exit(1); };
const file = (s) => path.join(dir, `${s}.json`);
const load = (s) => { try { return JSON.parse(fs.readFileSync(file(s), 'utf8')); } catch { return null; } };
const idOf = (label, i) => (label.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `step-${i + 1}`);
function save(st) {
  st.updated = Date.now(); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file(st.slug), JSON.stringify(st) + '\n');
  const drive = opt('drive') || st.drive;
  if (drive) { try { execFileSync('rclone', ['copyto', file(st.slug), `${drive.replace(/\/$/, '')}/status/${st.slug}.json`], { stdio: 'ignore' }); } catch { console.error('(không đẩy được lên Drive — rclone/remote?)'); } }
  const cur = (st.workflow || []).findIndex((s) => s.id === st.step);
  console.log(`${st.slug}: ${st.done ? 'hoàn thành' : cur >= 0 ? `bước ${cur + 1}/${st.workflow.length} ${st.workflow[cur].label}` : 'chờ'}${st.progress ? ` ${Math.round(st.progress * 100)}%` : ''}${st.blocked ? ' · LỖI' : ''}${st.approval ? ' · CHỜ DUYỆT' : ''}`);
}
if (cmd === 'list') { try { for (const f of fs.readdirSync(dir)) console.log(f.replace(/\.json$/, '')); } catch { } process.exit(0); }
if (!cmd || !slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) die('Dùng: office-status.mjs <init|step|progress|next|blocked|approval|resume|done|remove|list> <slug> … (slug: a-z0-9-)');
if (cmd === 'remove') { try { fs.unlinkSync(file(slug)); } catch { } console.log(`${slug}: đã xoá khỏi văn phòng`); process.exit(0); }
let st = load(slug);
if (cmd === 'init') {
  const steps = (opt('steps') || 'Chuẩn bị:fetch,Nghiên cứu:research,Kế hoạch:plan,Thực hiện:build,Kiểm tra:check,Bàn giao:deliver').split(',').map((x, i) => {
    const [label, role] = x.split(':').map((t) => t.trim()); return { id: idOf(label, i), label, role: ROLES.includes(role) ? role : ROLES[Math.min(i, 5)] };
  });
  st = { slug, title: opt('title') || slug, group: opt('group') || '', workflow: steps, step: steps[0].id, progress: 0, eta: null, blocked: false, approval: false, message: '', done: false, drive: opt('drive') || '' };
  save(st); process.exit(0);
}
if (!st) die(`Chưa có ${slug}: chạy "init" trước.`);
const wf = st.workflow || [];
const n = (v) => (v === undefined || v === '' ? undefined : Number(v));
switch (cmd) {
  case 'step': {
    const k = pos[0]; const i = /^\d+$/.test(k || '') ? Number(k) - 1 : wf.findIndex((s) => s.id === k || s.label === k);
    if (i < 0 || i >= wf.length) die(`Không có bước "${k}". Các bước: ${wf.map((s, j) => `${j + 1}=${s.id}`).join(', ')}`);
    Object.assign(st, { step: wf[i].id, progress: n(opt('progress')) ?? 0, eta: n(opt('eta')) ?? null, blocked: false, message: '', done: false }); break;
  }
  case 'progress': st.progress = Math.max(0, Math.min(1, Number(pos[0]) || 0)); if (opt('eta') !== undefined) st.eta = n(opt('eta')); break;
  case 'next': { const i = wf.findIndex((s) => s.id === st.step); if (i + 1 >= wf.length) { st.done = true; st.step = 'done'; } else Object.assign(st, { step: wf[i + 1].id, progress: 0, eta: null }); st.blocked = false; st.message = ''; break; }
  case 'blocked': Object.assign(st, { blocked: true, message: pos.join(' ') || 'Bị vướng' }); break;
  case 'approval': Object.assign(st, { approval: true, message: pos.join(' ') || 'Chờ duyệt' }); break;
  case 'resume': Object.assign(st, { blocked: false, approval: false, message: '' }); break;
  case 'done': Object.assign(st, { done: true, step: 'done', progress: 1, eta: null, blocked: false, approval: false, message: '' }); break;
  default: die(`Lệnh không rõ: ${cmd}`);
}
save(st);
