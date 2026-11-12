# van-phong-pixel — pixel office pane

A pane beside the Claude Code chat: a pixel office where you are the chairman and every step of a job is an employee
who walks, types and reacts according to the job's real status. Every 30 seconds it reads status files from Google Drive
with `rclone` and draws:

- the employee of the current step at work (store clerk fetching inputs, researcher at the bookshelf, planner typing,
  render tech at the servers, QA walking to the checklist, courier delivering the film to the chairman);
- a red **!** over whoever is blocked, an orange **!** over the chairman when something waits for your approval,
  a green **✓** with confetti when the job is done; everyone else dozes until it is their turn;
- one row per job: step, render progress bar, ETA, and a warning when a job has not updated for 15 minutes;
- an inbox of errors and approvals.

## Requirements

- Claude Code desktop (the scene is an SVG; other surfaces show the text rows only).
- `rclone` with a remote named `gdrive` (`rclone config`), able to read `gdrive:jp-studio`.

## Status files

One JSON object per job, one line, at `gdrive:jp-studio/<skill>/status/<slug>.json`:

```json
{"slug":"my-film","skill":"jp-history-video","title":"My film","stage":"render","render":0.62,"eta":840,
 "blocked":false,"approval":false,"message":"","updated":1794462905164}
```

`stage` is one of `idle`, `inputs`, `research`, `plan`, `render`, `qa`, `deliver`, `done`; `render` is 0–1; `eta` is
seconds; `updated` is milliseconds since the epoch. Set `blocked` (with a short `message`) when the job is stuck, and
`approval` when it waits for the user. Any job that writes these files appears in the office.

## Use

The pane opens when a session starts; `/van-phong` opens it again. "Xem" on a row shows that job in the office,
"Làm mới" reads Drive at once.
