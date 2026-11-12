# claude-pixel-office

A pixel-art office pane for Claude Code (desktop): you are the chairman, each step of any multi-step job is an employee
who walks, types and reacts to the job's real status — progress, ETA, a red **!** when blocked, an orange **!** when it
waits for your approval, a green **✓** when done. Works with any workflow, script or prompt that writes a small status file.

Ô "Văn phòng" pixel cho Claude Code: bạn là chủ tịch, mỗi bước của bất kỳ quy trình nào là một nhân viên.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install van-phong-pixel --marketplace do2nam08012001-dot/claude-pixel-office
```

From a shell:

```bash
claude plugin install van-phong-pixel --marketplace do2nam08012001-dot/claude-pixel-office
```

The pane opens with every new session; `/vp` opens it again.

## Show your own workflow / Hiện quy trình của bạn

Any workflow appears in the office once it writes a status file. The easiest way is `tools/office-status.mjs` (Node 18+):

```bash
node tools/office-status.mjs init blog-01 --title "Viết blog" --steps "Thu thập:fetch,Đọc tài liệu:research,Dàn ý:plan,Viết bài:build,Biên tập:check,Đăng bài:deliver"
node tools/office-status.mjs step blog-01 4 --progress 0.35 --eta 900
node tools/office-status.mjs approval blog-01 "Duyệt dàn ý"      # orange ! over the chairman
node tools/office-status.mjs resume blog-01
node tools/office-status.mjs next blog-01                         # step done, go to the next
node tools/office-status.mjs blocked blog-01 "API trả lỗi 429"    # red ! over that employee
node tools/office-status.mjs done blog-01                         # ✓ and confetti
node tools/office-status.mjs remove blog-01
```

Each step names a **role** — the room and employee that act it out:

| role | room / employee | fits steps like |
|---|---|---|
| `fetch` | store clerk carrying boxes | collect inputs, download, import |
| `research` | researcher at the bookshelves | read sources, analyse, search |
| `plan` | planner typing at the whiteboard desk | outline, design, write a plan |
| `build` | tech at the servers (progress bar on the rack) | write, render, build, train, run |
| `check` | QA walking to the checklist | review, test, edit, verify |
| `deliver` | courier bringing the result to the chairman | publish, send, deploy |

The labels you give the steps become the room name tags. Steps without a role get one by position.

### Let Claude update the office itself

Add to a project's `CLAUDE.md` (or a skill / prompt):

```
Khi làm việc nhiều bước, cập nhật văn phòng bằng tools/office-status.mjs:
init một lần với các bước của việc này; "step <slug> <n>" khi bắt đầu mỗi bước (kèm --progress/--eta khi đo được);
"blocked" kèm lý do khi bị vướng mà không tự sửa được; "approval" khi chờ người dùng; "resume" sau khi được trả lời; "done" khi xong.
```

### Where status files are read from

- Local: `~/.claude/van-phong/status/*.json` (what `office-status.mjs` writes).
- Google Drive via rclone: `<drive>/*/status/*.json`, default `gdrive:jp-studio`. Change or turn off in
  `~/.claude/van-phong/config.json`: `{"drive": "myremote:some/folder"}` or `{"drive": ""}`.
  `office-status.mjs ... --drive myremote:some/folder/<group>` uploads there too, for jobs running in the cloud.

The file format is in [plugins/van-phong-pixel/README.md](plugins/van-phong-pixel/README.md).

## Editing the art

The scene is pure SVG paths with CSS animation (no images, no script). Source in `art-source/`: change `build3.mjs`
or `scene4.mjs`, run `node art-source/build3.mjs`, then put `assets3.json` into `plugins/van-phong-pixel/hooks/assets.ts`
and `scene4.mjs` into `hooks/scene.ts`.

License: MIT.
