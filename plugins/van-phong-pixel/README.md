# van-phong-pixel — pixel office pane

A pane beside the Claude Code chat: a pixel office where you are the chairman and every step of a job is an employee
who walks, types and reacts according to the job's real status. Every 30 seconds it reads status files and draws:

- the employee of the current step at work, everyone whose step is over relaxed, everyone not yet needed dozing (z z);
- a red **!** over the employee of a blocked step, an orange **!** over the chairman when something waits for approval,
  a green **✓** with confetti when the job is done;
- one row per job: current step, progress bar, ETA, the whole step list (✓ done · ● now · ! blocked · ○ later), and a
  warning when a job has not updated for 15 minutes;
- an inbox of errors and approvals. "Xem" shows a job in the office, "Làm mới" reads at once, `/vp` reopens the pane.

## Taskbar widget (Windows)

The pane's **▣ Bật widget** button puts the boss room above the taskbar: one progress, one finish time (the pane's own
numbers), the boss working and walking around. Drag it anywhere (the spot is remembered); click brings Claude to the
front; right click: hide 30 minutes, back to the corner, turn off. Press the button again (or "Tắt widget") to close it.
Needs Python from python.org (`pythonw`); nothing else is installed. Files: `~/.claude/van-phong/widget.json` (on/off),
`~/.claude/van-phong/live/<session>.json` (what each session shows). When a session stops writing (Claude closed or asleep), the widget
reads that film's status from Drive itself with rclone every 30 s and keeps the same numbers going. Art: `node art-source/taskbar-sprites.mjs`.

## Sources

1. `~/.claude/van-phong/status/*.json` on this computer (write them with `tools/office-status.mjs` from the repository).
2. Google Drive (or any rclone remote): `<drive>/*/status/*.json`, default `gdrive:jp-studio`; set
   `{"drive": "remote:path"}` or `{"drive": ""}` in `~/.claude/van-phong/config.json`. Needs `rclone` with that remote.

## Status file (v2, any workflow)

```json
{"slug":"blog-01","title":"Viết blog","group":"blog",
 "workflow":[{"id":"collect","label":"Thu thập","role":"fetch"},{"id":"write","label":"Viết bài","role":"build"},
             {"id":"review","label":"Biên tập","role":"check"},{"id":"publish","label":"Đăng bài","role":"deliver"}],
 "step":"write","progress":0.35,"eta":900,"blocked":false,"approval":false,"message":"","done":false,
 "updated":1794465277908}
```

- `role`: `fetch` · `research` · `plan` · `build` · `check` · `deliver` (room and employee); missing → by position.
- `step`: the current step's `id`; `"done"` or `"done": true` when finished. `progress` 0–1 of that step, `eta` seconds.
- `blocked` + `message` when stuck; `approval` + `message` when it waits for the user. `updated` is ms since the epoch.

## Status file (v1, the jp video pipeline)

`{"slug","skill","title","stage","render","eta","blocked","approval","message","updated"}` with `stage` one of
`idle inputs research plan render qa deliver done` — still supported unchanged.

Requires Claude Code desktop for the drawing (other surfaces show the text rows only).
