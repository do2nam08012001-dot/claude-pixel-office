# Van phong pixel - desk buddy. The boss room of the vp office, cut from the pane's own art, floats above the taskbar.
# A dark panel shows ONE progress and ONE finish time (same numbers as the vp pane). The boss works at the desk 60 % of
# the time and walks around the room 40 %, with the pane's in-place effects (bob, blink, emotes, typing glyphs, status
# bubbles, sweat, zz); sunlight through the window, a desk lamp, drifting clouds, fluttering curtains, dust and a leaf.
# Drag to move (position is remembered). Click: bring Claude to the front. Right click: menu.
# Turned on/off by the vp pane's widget button (~/.claude/van-phong/widget.json); each Claude session with vp writes its
# films to ~/.claude/van-phong/live/<session>.json; when a session stops writing (Claude closed), the widget reads
# that film's status from Drive itself (rclone) and works out the same numbers. `vp_taskbar.pyw demo.json` shows one file instead. Python stdlib only.
import ctypes, json, math, os, re, subprocess, sys, threading, time, tkinter as tk
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
HOME = os.path.join(os.path.expanduser('~'), '.claude', 'van-phong')
# one widget per Claude session: `--session <key>` shows only that session's films (live/<key>.json)
SESS = sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == '--session' else ''
SELFTEST = sys.argv[1:2] == ['--selftest']    # `vp_taskbar.pyw --selftest`: the pane's case table, exit 1 on a mismatch
DEMO = sys.argv[1] if len(sys.argv) > 1 and not SESS and not SELFTEST else ''
SUF = '-' + SESS if SESS else ''
LIVE, SWITCH = os.path.join(HOME, 'live'), os.path.join(HOME, f'widget{SUF}.json')
POSF = os.path.join(HOME, f'taskbar{SUF}.json')
KEY = '#FF00FE'                      # transparent colour of the window
WOOD, EDGE, HI, INK, GOLD = '#7A4A2E', '#2A1E1E', '#9C6440', '#FFF3D6', '#F3D98B'
LED = {'run': '#5FD068', 'wait': '#F2B84B', 'stop': '#F2B84B', 'err': '#E5534B', 'done': '#5FD068', 'stale': '#8A8A8A', 'idle': '#6B7A99'}
ABC = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+,-/:;<=>?@[]^_{|}~'   # palette index alphabet of sprites.json
# emote bubbles of the pane (scene.ts EMO), drawn at 2x: [x, y, width, colour] rows
EMO = {
    'heart': [[1,0,2,'#F0525A'],[4,0,2,'#F0525A'],[0,1,6,'#F0525A'],[0,2,6,'#F0525A'],[1,3,4,'#F0525A'],[2,4,2,'#F0525A']],
    'note': [[3,0,3,'#7E57C2'],[3,1,1,'#7E57C2'],[3,2,1,'#7E57C2'],[3,3,1,'#7E57C2'],[1,3,3,'#7E57C2'],[1,4,2,'#7E57C2']],
    'dots': [[0,2,1,'#5D6B82'],[2,2,1,'#5D6B82'],[4,2,1,'#5D6B82']],
    'q': [[1,0,3,'#F5A524'],[4,1,1,'#F5A524'],[3,2,1,'#F5A524'],[2,3,1,'#F5A524'],[2,5,1,'#F5A524']],
    'bang': [[2,0,2,'#F0525A'],[2,1,2,'#F0525A'],[2,2,2,'#F0525A'],[2,4,2,'#F0525A']],
    'star': [[2,0,1,'#F5B800'],[1,1,3,'#F5B800'],[0,2,5,'#F5B800'],[1,3,3,'#F5B800'],[0,4,1,'#F5B800'],[4,4,1,'#F5B800']],
}

# one instance only (the plugin may launch it more than once)
k32 = ctypes.windll.kernel32
_mutex = k32.CreateMutexW(None, False, 'van-phong-pixel-taskbar' + SUF)
if k32.GetLastError() == 183 and not SELFTEST: sys.exit(0)
try: ctypes.windll.shcore.SetProcessDpiAwareness(2)   # per-monitor: crisp on every screen, not only the main one
except Exception: pass

class _MI(ctypes.Structure):
    _fields_ = [('cbSize', ctypes.c_ulong), ('rcMonitor', ctypes.c_long * 4), ('rcWork', ctypes.c_long * 4), ('dwFlags', ctypes.c_ulong)]
def work_area(x=None, y=None):
    """work area (no taskbar) of the monitor at (x, y), or of the main one"""
    if x is None:
        r = (ctypes.c_long * 4)(); ctypes.windll.user32.SystemParametersInfoW(0x30, 0, r, 0); return list(r)
    u = ctypes.windll.user32; u.MonitorFromPoint.restype = ctypes.c_void_p
    mon = u.MonitorFromPoint(ctypes.c_longlong((int(y) << 32) | (int(x) & 0xFFFFFFFF)), 2)   # POINT by value; 2 = nearest monitor
    mi = _MI(); mi.cbSize = ctypes.sizeof(_MI)
    return list(mi.rcWork) if u.GetMonitorInfoW(ctypes.c_void_p(mon), ctypes.byref(mi)) else work_area()

SPR = json.load(open(os.path.join(HERE, 'sprites.json'), encoding='utf-8')); DESK = SPR['desk']
RW, RH = len(DESK['bg'][0]), len(DESK['bg'])                   # room size (art pixels)
F, HD, FT = 5, 38, 16                                           # frame width, number panel, footer line
W, H = RW + 2 * F, F + HD + RH + FT + F
OFF = [0, 0]                                                    # drawing origin of the part being drawn
root = tk.Tk(); root.withdraw()
Z = max(1, round(root.winfo_fpixels('1i') / 96))               # 1 at 100-149 %, 2 at 150 %+
root.overrideredirect(True); root.attributes('-topmost', True); root.attributes('-transparentcolor', KEY); root.config(bg=KEY)
cv = tk.Canvas(root, bg=KEY, highlightthickness=0, bd=0, width=W * Z, height=H * Z, cursor='hand2'); cv.pack()
BIG, MID, LAB, FOOT = ('Consolas', -22 * Z, 'bold'), ('Consolas', -15 * Z, 'bold'), ('Segoe UI', -10 * Z), ('Segoe UI', -11 * Z, 'bold')

def cells(r):
    """a sprite row as palette indexes, -1 = transparent (characters: a string of ABC digits; the room: a list)"""
    return r if isinstance(r, list) else [-1 if ch == '.' else ABC.index(ch) for ch in r]

_img = {}
def pix(key, rows, pal):
    if key not in _img:
        im = tk.PhotoImage(width=len(rows[0]), height=len(rows))
        im.put(' '.join('{' + ' '.join(KEY if i < 0 else pal[i] for i in cells(r)) + '}' for r in rows))
        for y, r in enumerate(rows):   # real transparency, so what is under shows through (KEY would punch a hole to the desktop)
            for x, i in enumerate(cells(r)):
                if i < 0: im.transparency_set(x, y, True)
        _img[key] = im.zoom(Z) if Z > 1 else im
    return _img[key]

def boss(frame):
    c = SPR['boss']; return pix(('boss', frame), c['frames'].get(frame) or c['frames']['normal'], c['pal'])
TAG = ['ui']                                                    # 'room': redrawn every frame; 'ui': only when its numbers change
def R(x, y, w, h, col):
    x += OFF[0]; y += OFF[1]; cv.create_rectangle(x * Z, y * Z, (x + w) * Z, (y + h) * Z, fill=col, outline='', tags=TAG[0])
def img(x, y, im): cv.create_image((x + OFF[0]) * Z, (y + OFF[1]) * Z, image=im, anchor='nw', tags=TAG[0])
def text(x, y, s, font, col, anchor='w'):
    x += OFF[0]; y += OFF[1]
    cv.create_text(x * Z + Z, y * Z + Z, text=s, anchor=anchor, fill=EDGE, font=font, tags=TAG[0])   # 1-pixel drop shadow, readable on wood
    cv.create_text(x * Z, y * Z, text=s, anchor=anchor, fill=col, font=font, tags=TAG[0])

def hhmm(ms):
    if not ms: return '--:--'
    d = datetime.fromtimestamp(ms / 1000)
    return d.strftime('%H:%M')

jobs, hidden_until, started = [], 0, time.time()
drive_st, drive_at, fetching, tried = {}, {}, set(), {}   # slug -> newest Drive status, when read; folders being read; folder -> last try
DRIVE_EVERY = 20_000                              # with Claude closed: each skill's statuses are read this often
FRESH = 60_000                                    # a session file older than this: Claude is closed or asleep, go to Drive

def switched_off():
    try: return json.load(open(SWITCH, encoding='utf-8')).get('on') is False
    except Exception: return False      # no switch file yet: stay on

def objects(text):
    """the JSON objects in a text (rclone cat may join several copies of a status file)"""
    out, dec, i = [], json.JSONDecoder(), 0
    while True:
        i = text.find('{', i)
        if i < 0: return out
        try: o, i = dec.raw_decode(text, i); out.append(o)
        except ValueError: i += 1

def fetch(key, rclone, folder, slugs):
    """read the statuses of these films of one skill from Drive in ONE rclone call (in a thread: it takes seconds)"""
    try:
        inc = [a for s in slugs for a in ('--include', s + '.json')]
        r = subprocess.run([rclone or 'rclone', 'cat', folder, *inc], capture_output=True, text=True, encoding='utf-8', timeout=60, creationflags=0x08000000)
        if r.returncode == 0:
            at = time.time() * 1000
            for s in slugs:
                got = [o for o in objects(r.stdout) if o.get('slug') == s]
                if got: drive_st[s] = max(got, key=lambda o: o.get('updated', 0)); drive_at[s] = at
    except Exception: pass                # offline / no rclone: keep the last numbers
    finally: fetching.discard(key)

held = {}                                         # slug -> {'step', 'pct'}: the % shown while that step had no real number
DEF_EST = {'inputs': 120, 'research': 1800, 'plan': 5400, 'render': 14400, 'qa': 900, 'deliver': 300}   # timeline.ts VIDEO_STEPS
STALE_MS = 15 * 60_000
TIMELINE_VERSION = 2                              # = hooks/timeline.ts TIMELINE_VERSION; the case table carries it too
MAP = {'idle': -1, 'inputs': 0, 'research': 1, 'plan': 2, 'render': 3, 'qa': 4, 'deliver': 5, 'done': 6}

def timeline(f, steps, now0, hold=None):
    """hooks/timeline.ts timeline() for the jp video pipeline, line for line: (pct, seconds left or None, step, held).
    steps = the model the plugin wrote: [{id, work, guess, est?}]; est falls back to the pipeline's defaults."""
    num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)
    done = bool(f.get('done')) or f.get('step') == 'done' or f.get('stage') == 'done'
    now = f.get('updated', now0) if not done and now0 - f.get('updated', now0) > STALE_MS else now0   # seenAt
    stage = f.get('stage'); hist = dict(f.get('history') or {}); render = f.get('render'); act = f.get('activity') or ''
    enc = '' if stage != 'render' else ('done' if f['encode'] >= 1 else 'run') if num(f.get('encode')) else \
        (('run' if '.tmp.mp4' in act else 'done') if re.search(r'video_1080p(\.tmp)?\.mp4', act) else '')
    no_render = stage == 'render' and not enc and not (render or 0) > 0 and (render is None or now - ((hist.get('render') or {}).get('start') or f.get('updated', now)) > 120_000)
    r_done = stage == 'render' and (render or 0) >= 0.999 and not enc
    ids = [s['id'] for s in steps]
    est = [s.get('est') or DEF_EST.get(s['id']) for s in steps]
    idx = MAP.get(stage or 'idle', -1); all_done = stage == 'done'
    if r_done: idx = MAP['qa']
    pk = ((0.95 + 0.04 * (f.get('encode') or 0) if enc == 'run' else 0.99) if enc else 0 if no_render else render) if stage == 'render' \
        else f.get('plan') if stage == 'plan' else f.get('research') if stage == 'research' else f.get('progress')
    progress = max(0, min(1, pk or 0))
    if r_done and (hist.get('render') or {}).get('start'):
        e = hist['render'].get('end') or f.get('updated'); hist['render'] = {'start': hist['render']['start'], 'end': e}; hist.setdefault('qa', {'start': e})
    stop = f.get('claudeStop') or {}; pz = f.get('paused') or {}
    def paused(sid): return pz.get(sid, 0) + (max(0, (now - stop['at']) / 1000) if stop.get('at') and (stage or f.get('step')) == sid else 0)
    def took(i):
        h = hist.get(ids[i]) or {}
        return max(1, (h['end'] - h['start']) / 1000 - paused(ids[i])) if h.get('start') and h.get('end') else None
    tooks = [took(i) for i in range(len(steps))]
    done_t = [x for x in tooks if x is not None]; avg = sum(done_t) / len(done_t) if done_t else None
    remaining, known = 0, True
    ts = es = 0
    for i in range(len(steps)):
        if (all_done or i < idx) and tooks[i] and est[i] and tooks[i] <= 3 * est[i]: ts += tooks[i]; es += est[i]
    pace = max(0.5, min(3, ts / es)) if es > 0 else 1
    sv = []
    for i in range(len(steps)):
        s = {'id': ids[i], 'est': est[i]}
        if all_done or i < idx: s.update(state='done'); sv.append(s); continue
        if i == idx:
            h = hist.get(ids[i]) or {}
            el = max(0, (now - h['start']) / 1000 - paused(ids[i])) if h.get('start') else None
            base = est[i] * pace if est[i] else avg
            left = f['eta'] if num(f.get('eta')) else el * (1 - progress) / progress if progress > 0.03 and el else (base - (el or 0) if base and (el or 0) < base else None)
            if left is None: known = False
            else: remaining += left
            s.update(state='now', elapsed=el, left=left); sv.append(s); continue
        g = est[i] * pace if est[i] else avg
        if g is None: known = False
        else: remaining += g
        s.update(state='wait', guess=g); sv.append(s)
    if all_done: remaining = 0
    cur = next((s for s in sv if s['state'] == 'now'), None)
    spent = (cur or {}).get('elapsed') or 0
    real = (bool(enc) or (render is not None and not no_render)) if stage == 'render' else progress > 0.03
    cur_left = (cur['left'] if cur['left'] is not None and cur['left'] > 0 else None) if cur else 0
    frac = 0
    if cur: frac = min(0.99, max(0, progress if real else spent / max(1, spent + cur_left) if cur_left is not None else 0.9))
    guesses = sum(s.get('guess') or 0 for s in sv if s['state'] == 'wait')
    own = None if cur_left is None else cur_left + guesses
    fin = f.get('finishAt'); late = 0
    if not all_done and fin:                     # rem: what the % is split by (inside only)
        if fin > now: remaining = max((fin - now) / 1000, own or 0); known = True
        elif own is not None: remaining = own; known = True
        else: late = (now - fin) / 1000
    elif not all_done and own is not None and known: remaining = own
    rem = None if late else remaining if known else None
    shown = 0 if all_done else (fin - now) / 1000 if fin and fin > now else None   # time left shown: Claude's alone (version 2)
    no_data = (not enc and not (render or 0) > 0) if stage == 'render' else not progress > 0.03
    out_held = None
    if not all_done and cur and rem is not None:
        for i, s in enumerate(sv):
            s['work'] = (tooks[i] if tooks[i] is not None and not (s['est'] and tooks[i] > 3 * s['est'] and not pz) else s['est'] or avg or 60) \
                if s['state'] == 'done' else (s.get('guess') or 0) if s['state'] == 'wait' else 0
        cur['work'] = max(1, spent + max(0, rem - guesses))
        done_w = sum(s['work'] for s in sv if s['state'] == 'done')
        counted = min(spent, 0.1 * (cur['est'] or spent)) if no_data else spent
        total = (done_w + counted) / max(1, done_w + spent + rem)
        if no_data: out_held = {'step': cur['id'], 'pct': total}
        elif hold and hold.get('step') == cur['id']: total = max(total, hold['pct']); out_held = hold
    else:
        for s in sv: s['work'] = s['est'] or avg or 60
        ww = sum(s['work'] for s in sv) or 1
        total = (sum(s['work'] for s in sv if s['state'] == 'done') + (cur['work'] * (min(frac, 0.1) if no_data else frac) if cur else 0)) / ww
    total = 1 if all_done else min(0.99, total)
    step = 'done' if all_done else ids[idx] if 0 <= idx < len(ids) else stage
    return round(total * 100), (None if shown is None else round(shown)), step, out_held

def project(j, st, now):
    """the widget's film from a Drive status, with the pane's own numbers (timeline() above)"""
    j = dict(j)
    if st.get('done') or st.get('stage') == 'done':
        j.update(state='done', pct=100, finishAt=None, doneAt=((st.get('history') or {}).get('done') or {}).get('start') or st.get('updated')); return j
    pct, rem, step, h = timeline(st, j.get('steps') or [], now, held.get(j.get('slug')))
    if h: held[j.get('slug')] = h
    else: held.pop(j.get('slug'), None)
    j.update(pct=pct, step=step, finishAt=None if rem is None or not st.get('finishAt') else now + rem * 1000,   # no time until Claude writes one, as the pane until=(st.get('claudeStop') or {}).get('until'),
             state='err' if st.get('blocked') else 'wait' if st.get('approval') else 'stop' if st.get('claudeStop') else 'run')
    return j

def selftest():
    """run taskbar/timeline-cases.mjs (the pane's own case table) through timeline(): exact %, time left and step"""
    text = open(os.path.join(HERE, 'timeline-cases.mjs'), encoding='utf-8').read()
    book = json.loads(text[text.index('{'):text.rindex('}') + 1]); now = book['now']; bad = 0
    if book.get('version') != TIMELINE_VERSION:
        print(f"FAIL time line version: table {book.get('version')}, widget {TIMELINE_VERSION} - port hooks/timeline.ts again"); return 1
    def absol(f):
        f = json.loads(json.dumps(f))
        for k in ('updated', 'finishAt', 'claudeAt', 'beat'):
            if num0(f.get(k)): f[k] = now + f[k] * 1000
        for h in (f.get('history') or {}).values():
            for k in ('start', 'end'):
                if num0(h.get(k)): h[k] = now + h[k] * 1000
        cs = f.get('claudeStop')
        if cs:
            for k in ('at', 'until'):
                if num0(cs.get(k)): cs[k] = now + cs[k] * 1000
        return f
    for c in book['cases']:
        f = absol(c['film']); hold = (c.get('ctx') or {}).get('held')
        pct, rem, step, _ = timeline(f, c['model'], now, hold)
        ok = pct == c['pct'] and rem == c['remaining'] and step == c['step']
        if ok and 'samePctAfter' in c.get('want', {}): ok = timeline(f, c['model'], now + c['want']['samePctAfter'] * 1000, hold)[0] == pct
        if not ok: bad += 1; print(f"FAIL {c['name']}: got {pct}% {rem}s {step}, want {c['pct']}% {c['remaining']}s {c['step']}")
    print(f"{len(book['cases']) - bad}/{len(book['cases'])} cases pass"); return bad

def num0(v): return isinstance(v, (int, float)) and not isinstance(v, bool)

def load():
    """every 2 s: quit when the pane's button turned the widget off, else merge the films of every Claude session;
    a film whose session stopped writing (Claude closed or asleep) is followed on Drive every 30 s"""
    global jobs
    if not DEMO and switched_off(): os._exit(0)    # quit at once: pending redraws would hit a destroyed canvas
    now = time.time() * 1000
    best = {}                                       # slug -> (job, file updated, rclone, drive)
    files = [DEMO] if DEMO else [os.path.join(LIVE, SESS + '.json')] if SESS else [os.path.join(LIVE, n) for n in (os.listdir(LIVE) if os.path.isdir(LIVE) else []) if n.endswith('.json')]
    for f in files:
        try:
            d = json.load(open(f, encoding='utf-8')); u = d.get('updated', os.path.getmtime(f) * 1000)
            if not DEMO and now - u > 24 * 3600_000: continue        # a session from yesterday
            for j in d.get('jobs', []):
                if j.get('state') != 'gone' and (j['slug'] not in best or u > best[j['slug']][1]): best[j['slug']] = (j, u, d.get('rclone'), d.get('drive'))
        except Exception: pass         # half-written: next poll
    got, want = [], {}                              # want: (rclone, skill folder) -> films to read from Drive
    for slug, (j, u, rclone, drive) in best.items():
        fresh = u                                   # when this film's numbers were last known to be live
        if not DEMO and now - u > FRESH and j.get('skill') and drive:
            k = (rclone or 'rclone', f"{drive}/{j['skill']}/status")
            if now - drive_at.get(slug, 0) > DRIVE_EVERY: want.setdefault(k, []).append(slug)
            if slug in drive_st and drive_at[slug] > u:
                st = drive_st[slug]; j = project(j, st, now)
                fresh = max(st.get('beat') or 0, st.get('updated') or 0) or drive_at[slug]   # the cloud's own heartbeat
        if j.get('state') == 'done' and now - (j.get('doneAt') or u) > 10 * 60_000: continue   # done 10 min ago (by the film's own time)
        if j.get('state', 'run') == 'run' and now - fresh > 5 * 60_000: j = {**j, 'state': 'stale'}   # this film has gone quiet
        got.append(j)
    for (rclone, folder), slugs in want.items():
        if (rclone, folder) not in fetching and now - tried.get((rclone, folder), 0) > DRIVE_EVERY:   # also when a read failed
            tried[(rclone, folder)] = now
            fetching.add((rclone, folder))
            threading.Thread(target=fetch, args=((rclone, folder), rclone, folder, slugs), daemon=True).start()
    jobs = got
    root.after(2000, load)

def summary(now):
    """One progress and one finish time for everything running: the film that ends last sets the time."""
    if not jobs: return None, 'idle', 'nghỉ', 'Chưa có phim nào chạy'
    main = max(jobs, key=lambda j: j.get('finishAt') or 0)
    pcts = [j['pct'] for j in jobs if j.get('pct') is not None]
    pct = round(sum(pcts) / len(pcts)) if pcts else None
    states = [j.get('state', 'run') for j in jobs]
    st = next((s for s in ('err', 'wait', 'stop', 'stale') if s in states), 'done' if all(s == 'done' for s in states) else 'run')
    until = next((j['until'] for j in jobs if j.get('until')), None)
    line = {'err': 'có lỗi', 'wait': 'chờ bạn', 'done': 'xong rồi', 'stale': 'mất tín hiệu',
            'stop': 'dừng → ' + hhmm(until) if until else 'Claude dừng'}.get(st, 'xong ' + hhmm(main.get('finishAt')))
    if st == 'run' and any(not j.get('finishAt') for j in jobs if j.get('state', 'run') == 'run'): line = 'chờ Claude'   # no finish time until Claude gives one
    doing = (main.get('title') or main.get('slug', '')) + (f'  +{len(jobs) - 1}' if len(jobs) > 1 else '')
    if st == 'done': pct = 100
    return pct, st, line, doing

def frame(st):
    # wooden frame with bevel and gold rivets, pixel-cut corners; the inner edge glows in the state colour
    OFF[:] = [0, 0]
    R(1, 0, W - 2, H, EDGE); R(0, 1, W, H - 2, EDGE)
    R(1, 1, W - 2, H - 2, '#5E3822'); R(2, 1, W - 4, 1, HI); R(1, 2, 1, H - 4, HI)
    R(2, 2, W - 4, H - 4, WOOD); R(3, 2, W - 6, 1, '#B47A50')
    R(F - 1, F - 1, W - 2 * F + 2, H - 2 * F + 2, EDGE)
    for x, y in ((2, 2), (W - 4, 2), (2, H - 4), (W - 4, H - 4)): R(x, y, 2, 2, '#E8C77A')
    R(F, F + HD - 1, RW, 1, EDGE)

def panel(pct, st, line, s):
    # number panel: dark slate so the two numbers read at a glance
    OFF[:] = [F, F]
    R(0, 0, RW, HD - 1, '#1B2130'); R(0, 0, RW, 1, '#2C3548')
    R(6, 7, 6, 6, LED[st] if st != 'run' or s % 1.6 < 1.2 else '#2C3548')        # LED blinks while working
    text(16, 11, f'{pct}%' if pct is not None else '—', BIG, '#7CF08A' if st in ('run', 'done') else LED[st])
    lab, val = (line.split(' ', 1) + [''])[:2] if line.startswith('xong ') else ('', line)
    if st == 'done': lab, val = 'Hoàn thành', 'XONG ✓'
    text(RW - 6, 5, 'Xong lúc' if lab == 'xong' else lab or 'Trạng thái', LAB, '#8E9AB3', 'e')
    text(RW - 6, 19, val, MID, '#7CF08A' if st == 'done' else '#FFFFFF', 'e')
    # HP-bar style progress: dark track, fill with a light top line, tick every 10 %
    R(5, 28, RW - 10, 6, '#0E121B')
    if pct:
        w = max(2, round((RW - 12) * min(100, pct) / 100)); R(6, 29, w, 4, LED[st]); R(6, 29, w, 1, '#FFFFFF')
    for i in range(1, 10): R(5 + round((RW - 10) * i / 10), 29, 1, 4, '#0E121B')

def footer(doing):
    OFF[:] = [F, F + HD + RH]
    R(0, 0, RW, FT, '#2A1E1E'); R(0, 0, RW, 1, '#3A2A22')
    s = doing if len(doing) <= 30 else doing[:29] + '…'
    text(RW / 2, FT / 2, s, FOOT, '#F3D98B', 'center')

def bubble(x, y, kind):
    R(x - 2, y - 2, 16, 14, '#FFFFFF'); R(x - 4, y, 20, 10, '#FFFFFF'); R(x, y + 12, 4, 2, '#FFFFFF')
    for a, b, w, c in EMO[kind]: R(x + a * 2, y + b * 2, w * 2, 2, c)

def poly(pts, col):
    cv.create_polygon([((x + OFF[0]) * Z, (y + OFF[1]) * Z)[k] for x, y in pts for k in (0, 1)], fill=col, outline='', tags=TAG[0])

# ---- light, baked per pixel into the room picture (Tk has no alpha): the desk lamp's warm pool, night dimming
def _rgb(c): return int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)
def _hex(r, g, b): return '#%02x%02x%02x' % (min(255, round(r)), min(255, round(g)), min(255, round(b)))
def _mix(c, light, a):
    r, g, b = _rgb(c); lr, lg, lb = light
    return (r + (lr - r) * a, g + (lg - g) * a, b + (lb - b) * a)
LAMP = (49, 92)

def lit(layer, night, pulse):
    """the layer's colours with the light of this moment baked in"""
    key = (layer, night, pulse)
    if key in _img: return _img[key]
    rows, pal = DESK[layer], DESK['pal']
    warm = (255, 205, 110)
    out = []
    for y, r in enumerate(rows):
        yy = y; line = []
        for x, i in enumerate(cells(r)):
            if i < 0: line.append(None); continue
            c = pal[i]
            col = _rgb(c)
            if night: col = (col[0] * 0.55, col[1] * 0.58, col[2] * 0.72)
            d = ((x - LAMP[0]) ** 2 + ((yy - LAMP[1]) * 1.6) ** 2) ** 0.5
            if d < 34 and yy > LAMP[1] - 4:
                col = _mix(_hex(*col), warm, (1 - d / 34) * (0.55 if night else 0.18))
            line.append(_hex(*col))
        out.append(line)
    im = tk.PhotoImage(width=len(rows[0]), height=len(rows))
    im.put(' '.join('{' + ' '.join(c or KEY for c in r) + '}' for r in out))
    for y, r in enumerate(out):
        for x, c in enumerate(r):
            if c is None: im.transparency_set(x, y, True)
    _img[key] = im.zoom(Z) if Z > 1 else im
    return _img[key]

# ---- where the boss goes on a break (sprite top-left; desk front row y 116, so he never crosses the globe or chair)
SEAT, CORNER, DOWN = (70, 70), (122, 74), (122, 116)   # the desk ends at x 119: he walks round it, not through it
SPOTS = [('plant', (34, 116)), ('front', (68, 116)), ('phone', (108, 116))]
CYCLE, WORK, SPEED = 60, 36, 24        # 60 % at the desk, 40 % on a break; walks at 24 art px per second
DESK_BASE = 142                         # feet below this line: in front of the desk

def along(path, d):
    """point at distance d along a polyline, and the total length"""
    segs = [(a, b, ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5) for a, b in zip(path, path[1:])]
    total = sum(L for *_, L in segs); d = max(0, min(total, d))
    for a, b, L in segs:
        if d <= L: f = d / L if L else 1; return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f), total
        d -= L
    return path[-1], total

def where(s, st):
    """(x, y, act, spot, walked): the boss at the desk or on a break; breaks only while the job simply runs"""
    if st == 'done': return (68, 116, 'cheer', 'front', 0)
    if st not in ('run', 'idle'): return (*SEAT, 'desk', None, 0)   # idle: he still strolls
    c, n = s % CYCLE, int(s // CYCLE)
    name, spot = SPOTS[n % len(SPOTS)]
    path = [SEAT, CORNER] if spot == CORNER else [SEAT, CORNER, DOWN, spot]
    if c < WORK: return (*SEAT, 'desk', None, 0)
    c -= WORK; total = along(path, 0)[1]; T = total / SPEED; stay = CYCLE - WORK - 2 * T
    if c < T: (x, y), _ = along(path, c * SPEED); return (x, y, 'walk', name, c * SPEED)
    if c < T + stay: return (*spot, 'visit', name, 0)
    d = (c - T - stay) * SPEED; (x, y), _ = along(path, total - d); return (x, y, 'walk', name, d)

assert where(0, 'run')[2] == 'desk' and where(37, 'run')[2] == 'walk' and where(48, 'run')[2] == 'visit' and where(59.5, 'run')[2] == 'walk'
assert along([(0, 0), (10, 0), (10, 10)], 15)[0] == (10, 5)

def wind(s, night):
    # a breeze: plant tips sway, now and then a leaf falls from the big plant and drifts across the floor
    sw = round(math.sin(s * 1.5))
    R(150 + sw, 2, 2, 2, '#81C784'); R(132 - sw, 6, 2, 2, '#388E3C'); R(140 + sw, 1, 2, 2, '#388E3C'); R(8 + sw, 128, 2, 2, '#81C784')   # the big plant sits in the corner, 14 rows up

def motes(s, night):
    # dust floating up slowly through the lamp light
    for i in range(7):
        k = (s / 9 + i / 7) % 1
        x = LAMP[0] - 14 + (i * 5) % 28 + 3 * math.sin(s * 0.7 + i)
        y = LAMP[1] + 12 - k * 40
        if (s * 2 + i) % 3 > 0.6: R(round(x), round(y), 1, 1, '#FFE9A8' if night else '#FFF6D0')

def room(pct, st, s):
    OFF[:] = [F, F + HD]
    night = not 6 <= datetime.now().hour < 18
    pulse = 0
    img(0, 0, lit('bg', night, pulse))
    wind(s, night)
    bx, by, act, spot, walked = where(s, st); bx, by = round(bx), round(by)
    bad = st == 'err'; worried = st in ('wait', 'stop', 'stale')
    if bad: fr = 'red1' if s % 0.6 < 0.3 else 'red2'
    elif act == 'cheer': fr = 'wave1' if s % 0.8 < 0.4 else 'wave2'
    elif worried: fr = 'worried'
    elif act == 'walk': fr = 'walkA' if int(walked / 6) % 2 else 'walkB'                   # steps follow the distance walked
    elif act == 'visit': fr = {'plant': 'happy', 'phone': 'grab'}.get(spot) or ('wave1' if s % 3 < 0.8 else 'happy')
    elif act == 'desk' and st == 'run' and s % 8 > 5: fr = 'red1' if s % 0.24 < 0.12 else 'red2'   # flat out: the pane's typing frames
    elif act == 'desk' and st == 'run': fr = 'grab' if s % 0.5 < 0.25 else ('blink' if s % 4 < 0.15 else 'normal')   # typing away
    else: fr = 'blink' if s % 4 < 0.15 else 'normal'
    rush = act == 'desk' and st == 'run' and s % 8 > 5
    bob = (1 if s % 0.24 < 0.12 else 0) if rush else 2 if act == 'desk' and st == 'run' and s % 1 < 0.5 else (2 if act == 'walk' and int(walked / 6) % 2 else 0)
    if act == 'cheer': bob = -3 if s % 0.8 < 0.4 else 0                                    # jumps for joy
    shake = (1 if s % 0.2 < 0.1 else -1) if bad or rush else 0
    front = by + 48 >= DESK_BASE
    if not front: img(bx + shake, by + bob, boss(fr))
    img(0, 0, lit('fg', night, pulse))
    if front: img(bx + shake, by + bob, boss(fr))
    motes(s, night)
    R(38, 104, 5, 6, '#E8E2D0'); R(38, 104, 5, 1, '#FFFFFF'); R(43, 106, 1, 2, '#E8E2D0'); R(39, 105, 3, 1, '#6D4C41')   # coffee mug on the desk
    for i in range(2):
        k = (s / 1.6 + i / 2) % 1
        R(39 + i * 2 + round(math.sin(s * 3 + i)), 102 - k * 9, 1, 2, '#F5F5F5' if k < 0.5 else '#CFD8DC')
    for i, (x, y) in enumerate(((14, 66), (146, 4), (26, 132))):   # sparkles: globe, big plant, small plant (none on his walk)
        k = (s * 0.7 + i * 0.37) % 2.2
        if k < 0.5:
            c = '#FFFFFF' if k < 0.25 else '#FFF59D'; R(x, y - 1, 1, 3, c); R(x - 1, y, 3, 1, c)
    for t0, d in list(gains):                                                          # "+N%" rises from the number
        a = s - t0
        if a > 2.2: gains.remove((t0, d)); continue
        text(64, -18 - a * 6, f'+{d}%', ('Consolas', -11 * Z, 'bold'), '#7CF08A')
    if s - quarter[0] < 1.2:                                                           # crossed 25/50/75 %: a golden flash
        k = (s - quarter[0]) / 1.2
        for i in range(12):
            ang = i * math.pi / 6; r = 6 + k * 40
            R(round(86 + r * math.cos(ang)), round(80 + r * math.sin(ang) * 0.7), 2, 2, '#F5B800' if i % 2 else '#FFF59D')
    if act == 'walk' and int(walked / 6) % 2:                                       # little dust puffs at his feet
        R(bx + 6, by + 46, 2, 1, '#D7C4A8'); R(bx + 24, by + 46, 2, 1, '#D7C4A8')
    if rush:
        for i in range(3):                                                         # steam off his head (scene.ts steamHead)
            k = (s / 0.9 + i / 3) % 1
            R(bx + 8 + i * 8 + round(2 * math.sin(s * 6 + i)), by - 2 - k * 14, 3, 3, '#FFFFFF' if k < 0.6 else '#D9E2EC')
        for i in range(4):                                                         # speed lines either side
            if (s * 10 + i) % 3 < 1.6:
                y = by + 18 + i * 6; R(bx - 8 - (i % 2) * 3, y, 6, 1, '#FFFFFF'); R(bx + 34 + (i % 2) * 3, y, 6, 1, '#FFFFFF')
        for i in range(3):                                                         # papers flying off the desk
            k = (s / 1.1 + i / 3) % 1
            px = 104 + i * 8 + k * 28; py = 104 - 30 * k + 50 * k * k
            R(round(px), round(py), 5, 4, '#F5F5F5'); R(round(px), round(py), 5, 1, '#C9D3DD')
        d = int(s * 6) % 3                                                         # sweat flies
        R(bx + 30, by + 6 + d * 2, 2, 3, '#81D4FA'); R(bx, by + 8 + d * 2, 2, 3, '#81D4FA')
    # laptop: the same progress on the screen; typing glyphs while he works at it
    R(63, 101, 22, 2, '#0E1E2C')
    if pct: R(63, 101, max(1, round(22 * min(100, pct) / 100)), 2, LED[st])
    if act == 'desk' and st == 'run':
        n, sp = (8, 0.5) if rush else (4, 1.0)
        for i in range(n):
            k = (s / sp + i / n) % 1
            if k < 0.85: R(63 + (i * 7) % 22, 100 - k * 8, 2, 2, '#B9FFE9' if i % 2 else '#FFF59D')   # on the screen, under his face
    if spot == 'plant' and act == 'visit':                                         # watering the little plant
        for i in range(3):
            k = (s / 0.9 + i / 3) % 1
            R(16 + i * 5, 122 + k * 12, 2, 3, '#81D4FA')
    ring = st == 'run' and act == 'desk' and s % 20 < 2.4                         # the phone rings now and then
    if (spot == 'phone' and act == 'visit') or ring:
        if s % 0.5 < 0.3: R(128, 72, 8, 5, '#9FD0FF'); R(129, 73, 6, 1, '#FFFFFF')    # its screen lights up
        if ring:                                                                   # ring waves either side, the phone jiggles
            for i in range(2):
                if (s * 4 + i) % 2 < 1.2: R(124 - i * 3, 70 + i, 1, 4 - i, '#FFF59D'); R(142 + i * 3, 70 + i, 1, 4 - i, '#FFF59D')
        else:                                                                      # on a call: a little talk bubble
            R(140, 60, 9, 6, '#FFFFFF'); R(141, 66, 2, 1, '#FFFFFF'); R(142, 62, 1, 1, '#5D6B82'); R(144, 62, 1, 1, '#5D6B82'); R(146, 62, 1, 1, '#5D6B82')
    if worried:                                                                    # sweat drops (scene.ts sweatFx)
        d = int(s * 4) % 3
        R(bx + 28, by + 8 + d, 2, 4, '#81D4FA'); R(bx + 2, by + 10 + d, 2, 4, '#81D4FA')
    # emote bubble over the head: on a visit (what he feels there), at the desk every 6 s for 2.4 s
    kind = None
    if act == 'visit': kind = {'plant': 'heart', 'front': 'note', 'phone': 'star'}[spot] if s % 3 < 2 else None
    elif act == 'desk' and s % 6 < 2.4 and st != 'stop':
        kind = {'err': 'bang', 'wait': 'q'}.get(st) or ('dots' if worried else ('star', 'note', 'dots', 'star')[int(s // 6) % 4])
    if kind: bubble(bx + 26, by - 12 - (1 if s % 3 < 0.3 else 0), kind)
    if st == 'stop':                                                               # zz while Claude is stopped
        for i, z in enumerate('zzZ'):
            k = (s / 2.4 + i / 3) % 1
            text(bx + 28 + i * 6, by - 2 - k * 14, z, ('Consolas', (-8 - i * 2) * Z, 'bold'), '#E3F2FD', 'center')
    if st in ('err', 'wait'):                                                      # status bubble: pops, shakes on error
        k = 'err' if bad else 'wait'
        img(bx - 30 + shake, by - 8 - (2 if not bad and s % 1 < 0.5 else 0), pix(('bub', k), DESK['bub'][k], DESK['pal']))
    if st == 'done':                                                               # finished: confetti and a big XONG sign
        for i in range(18):
            k = (s / 3 + i * 0.137) % 1
            R((i * 37) % (RW - 4), k * (RH - 4), 3, 2, ('#F5B800', '#F0525A', '#5FD068', '#4FC3F7', '#B388FF')[i % 5])
        R(28, 30, RW - 56, 26, EDGE); R(29, 31, RW - 58, 24, '#2E7D32'); R(29, 31, RW - 58, 2, '#5FD068')
        text(RW / 2, 43, 'XONG!', ('Consolas', -18 * Z, 'bold'), '#FFFFFF', 'center')
        img(bx + 30, by - 10 - (2 if s % 1 < 0.5 else 0), pix(('bub', 'ok'), DESK['bub']['ok'], DESK['pal']))

last = [None]
gains, quarter, prev_pct = [], [-9.0], [None]   # "+N%" floats, when a quarter was crossed, the % last seen
def draw():
    now = time.time() * 1000
    # nothing running: away, except for the first minute after it is turned on (so the button visibly does something)
    if now < hidden_until or (not jobs and time.time() - started > 60): root.withdraw()
    else:
        s = time.time(); pct, st, line, doing = summary(now)
        if pct is not None and prev_pct[0] is not None and pct > prev_pct[0]:
            gains.append((s, pct - prev_pct[0]))
            if pct // 25 > prev_pct[0] // 25: quarter[0] = s
        prev_pct[0] = pct
        key = (pct, st, line, doing, st != 'run' or s % 1.6 < 1.2)   # the panel's LED blink is part of it
        if key != last[0]:                     # text is the costly part: frame, panel and footer only when they change
            last[0] = key; TAG[0] = 'ui'; cv.delete('all'); frame(st); panel(pct, st, line, s); footer(doing)
        TAG[0] = 'room'; cv.delete('room'); room(pct, st, s)
        if root.state() == 'withdrawn': root.deiconify(); root.lift()
    root.after(1000 if root.state() == 'withdrawn' else 50, draw)

def place():
    L, T, Rr, B = work_area()
    try: x, y = json.load(open(POSF, encoding='utf-8'))['pos']; L, T, Rr, B = work_area(x + W * Z // 2, y + H * Z // 2)
    # shortcut: a new session's widget starts at one of 4 spots picked by its name, so two may still meet; drag one away
    except Exception: x, y = Rr - W * Z - 12 - (sum(map(ord, SESS)) % 4) * (W * Z + 8), B - H * Z
    x = max(L, min(Rr - W * Z, x)); y = max(T, min(B - H * Z, y))   # keep it on screen after a resolution change
    root.geometry(f'+{x}+{y}')

def open_session():
    # shortcut: the desktop app's claude:// link brings Claude to the front, not a given session (no session link is known)
    try: os.startfile('claude://')
    except OSError: pass

# 0.24.1-0.24.4 put a Startup shortcut here; starting with Windows was dropped, so an old one is removed
try: os.remove(os.path.join(os.environ.get('APPDATA', ''), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', f'Van phong pixel widget{SUF}.lnk'))
except OSError: pass

def turn_off():
    if not DEMO:
        try: os.makedirs(HOME, exist_ok=True); json.dump({'on': False}, open(SWITCH, 'w', encoding='utf-8'))
        except OSError: pass
    os._exit(0)

def hide(minutes):
    global hidden_until
    hidden_until = time.time() * 1000 + minutes * 60_000

def menu(ev):
    m = tk.Menu(root, tearoff=0)
    m.add_command(label='Mở Claude', command=open_session)
    m.add_command(label='Ẩn 30 phút', command=lambda: hide(30))
    m.add_command(label='Về góc phải', command=lambda: (os.path.exists(POSF) and os.remove(POSF), place()))
    m.add_separator(); m.add_command(label='Tắt widget', command=turn_off)
    m.tk_popup(ev.x_root, ev.y_root)

drag = {}
def press(ev): drag.update(x=ev.x_root, y=ev.y_root, wx=root.winfo_x(), wy=root.winfo_y(), moved=False)
def move(ev):
    dx, dy = ev.x_root - drag['x'], ev.y_root - drag['y']
    if abs(dx) + abs(dy) > 4: drag['moved'] = True
    if drag['moved']: root.geometry(f'+{drag["wx"] + dx}+{drag["wy"] + dy}')
def release(ev):
    if not drag.get('moved'): return open_session()
    try:
        os.makedirs(HOME, exist_ok=True)
        json.dump({'pos': [root.winfo_x(), root.winfo_y()]}, open(POSF, 'w', encoding='utf-8'))
    except OSError: pass
cv.bind('<ButtonPress-1>', press); cv.bind('<B1-Motion>', move); cv.bind('<ButtonRelease-1>', release)
cv.bind('<Button-3>', menu)

if SELFTEST: sys.exit(1 if selftest() else 0)
place(); load(); draw(); root.mainloop()
