# claude-pixel-office

A pixel-art office pane for Claude Code (desktop): you are the chairman, each step of a long-running job is an employee.
It reads small status files from Google Drive every 30 seconds and shows who is working, progress, ETA, errors and
approvals — so you can follow cloud sessions from the side of your chat.

Ô "Văn phòng" pixel cho Claude Code: bạn là chủ tịch, mỗi bước của công việc là một nhân viên; đọc trạng thái từ Google
Drive mỗi 30 giây để hiện tiến độ, thời gian còn lại, lỗi (!) và việc chờ duyệt.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install van-phong-pixel --marketplace do2nam08012001-dot/claude-pixel-office
```

From a shell:

```bash
claude plugin install van-phong-pixel --marketplace do2nam08012001-dot/claude-pixel-office
```

Then open the pane with `/van-phong`. Details and the status-file format: [plugins/van-phong-pixel/README.md](plugins/van-phong-pixel/README.md).

## Editing the art

The scene is pure SVG paths with CSS animation (no images, no script). Source in `art-source/`: change `build3.mjs`
or `scene3.mjs`, run `node art-source/build3.mjs`, then copy `assets3.json` into `plugins/van-phong-pixel/hooks/assets.ts`
and `scene3.mjs` into `hooks/scene.ts`.

License: MIT.
