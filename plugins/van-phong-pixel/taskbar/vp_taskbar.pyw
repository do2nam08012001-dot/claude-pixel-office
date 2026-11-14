# Van phong pixel - desk buddy. The boss room of the vp office, cut from the pane's own art, floats above the taskbar.
# A dark panel shows ONE progress and ONE finish time (same numbers as the vp pane). The boss works at the desk 60 % of
# the time and walks around the room 40 %, with the pane's in-place effects (bob, blink, emotes, typing glyphs, status
# bubbles, sweat, zz); sunlight through the window, a desk lamp, drifting clouds, fluttering curtains, dust and a leaf.
# Drag to move (position is remembered). Click: bring Claude to the front. Right click: menu.
# Turned on/off by the vp pane's widget button (~/.claude/van-phong/widget.json); each Claude session with vp writes its
# films to ~/.claude/van-phong/live/<session>.json. `vp_taskbar.pyw demo.json` shows one file instead. Python stdlib only.
import ctypes, json, math, os, sys, time, tkinter as tk
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
HOME = os.path.join(os.path.expanduser('~'), '.claude', 'van-phong')
DEMO = sys.argv[1] if len(sys.argv) > 1 else ''
LIVE, SWITCH = os.path.join(HOME, 'live'), os.path.join(HOME, 'widget.json')
POSF = os.path.join(HOME, 'taskbar.json')
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
_mutex = k32.CreateMutexW(None, False, 'van-phong-pixel-taskbar')
if k32.GetLastError() == 183: sys.exit(0)
try: ctypes.windll.shcore.SetProcessDpiAwareness(1)   # crisp pixels on scaled screens
except Exception: pass

def work_area():
    r = (ctypes.c_long * 4)(); ctypes.windll.user32.SystemParametersInfoW(0x30, 0, r, 0); return list(r)

SPR = json.load(open(os.path.join(HERE, 'sprites.json'), encoding='utf-8')); DESK = SPR['desk']
RW, RH = len(DESK['bg'][0]), len(DESK['bg'])                   # room size (art pixels)
F, HD, FT = 5, 38, 16                                           # frame width, number panel, footer line
W, H = RW + 2 * F, F + HD + RH + FT + F
STEP = {'inputs': 'Nhận input', 'research': 'Tư liệu', 'plan': 'Kế hoạch', 'render': 'Render', 'qa': 'Kiểm tra', 'deliver': 'Giao phim', 'done': 'Xong'}
OFF = [0, 0]                                                    # drawing origin of the part being drawn
root = tk.Tk(); root.withdraw()
Z = max(1, round(root.winfo_fpixels('1i') / 96))               # 1 at 100-149 %, 2 at 150 %+
root.overrideredirect(True); root.attributes('-topmost', True); root.attributes('-transparentcolor', KEY); root.config(bg=KEY)
cv = tk.Canvas(root, bg=KEY, highlightthickness=0, bd=0, width=W * Z, height=H * Z, cursor='hand2'); cv.pack()
BIG, MID, LAB, FOOT = ('Consolas', -22 * Z, 'bold'), ('Consolas', -17 * Z, 'bold'), ('Segoe UI', -10 * Z), ('Segoe UI', -11 * Z, 'bold')

_img = {}
def pix(key, rows, pal):
    if key not in _img:
        im = tk.PhotoImage(width=len(rows[0]), height=len(rows))
        im.put(' '.join('{' + ' '.join(KEY if ch == '.' else pal[ABC.index(ch)] for ch in r) + '}' for r in rows))
        for y, r in enumerate(rows):   # real transparency, so what is under shows through (KEY would punch a hole to the desktop)
            for x, ch in enumerate(r):
                if ch == '.': im.transparency_set(x, y, True)
        _img[key] = im.zoom(Z) if Z > 1 else im
    return _img[key]

def boss(frame):
    c = SPR['boss']; return pix(('boss', frame), c['frames'].get(frame) or c['frames']['normal'], c['pal'])
def R(x, y, w, h, col):
    x += OFF[0]; y += OFF[1]; cv.create_rectangle(x * Z, y * Z, (x + w) * Z, (y + h) * Z, fill=col, outline='')
def img(x, y, im): cv.create_image((x + OFF[0]) * Z, (y + OFF[1]) * Z, image=im, anchor='nw')
def text(x, y, s, font, col, anchor='w'):
    x += OFF[0]; y += OFF[1]
    cv.create_text(x * Z + Z, y * Z + Z, text=s, anchor=anchor, fill=EDGE, font=font)   # 1-pixel drop shadow, readable on wood
    cv.create_text(x * Z, y * Z, text=s, anchor=anchor, fill=col, font=font)

def hhmm(ms):
    if not ms: return '--:--'
    d = datetime.fromtimestamp(ms / 1000)
    return d.strftime('%H:%M') if d.date() == datetime.now().date() else d.strftime('%d/%m %H:%M')

jobs, hidden_until, seen = [], 0, 0

def switched_off():
    try: return json.load(open(SWITCH, encoding='utf-8')).get('on') is False
    except Exception: return False      # no switch file yet: stay on

def load():
    """every 2 s: quit when the pane's button turned the widget off, else merge the films of every live session"""
    global jobs, seen
    if not DEMO and switched_off(): root.destroy(); return
    got, newest = [], 0
    files = [DEMO] if DEMO else [os.path.join(LIVE, n) for n in (os.listdir(LIVE) if os.path.isdir(LIVE) else []) if n.endswith('.json')]
    for f in files:
        try:
            d = json.load(open(f, encoding='utf-8')); u = d.get('updated', os.path.getmtime(f) * 1000)
            if not DEMO and time.time() * 1000 - u > 10 * 60_000: continue    # a session closed long ago
            got += [j for j in d.get('jobs', []) if j.get('state') != 'gone']; newest = max(newest, u)
        except Exception: pass         # half-written: next poll
    jobs, seen = got, newest
    root.after(2000, load)

def summary(now):
    """One progress and one finish time for everything running: the film that ends last sets the time."""
    if not jobs: return None, 'idle', 'nghỉ', 'Chưa có phim nào chạy'
    main = max(jobs, key=lambda j: j.get('finishAt') or 0)
    pcts = [j['pct'] for j in jobs if j.get('pct') is not None]
    pct = round(sum(pcts) / len(pcts)) if pcts else None
    states = [j.get('state', 'run') for j in jobs]
    st = next((s for s in ('err', 'wait', 'stop') if s in states), 'done' if all(s == 'done' for s in states) else 'run')
    if st == 'run' and now - seen > 5 * 60_000: st = 'stale'
    until = next((j['until'] for j in jobs if j.get('until')), None)
    line = {'err': 'có lỗi', 'wait': 'chờ bạn', 'done': 'xong rồi', 'stale': 'mất tín hiệu',
            'stop': 'dừng → ' + hhmm(until) if until else 'Claude dừng'}.get(st, 'xong ' + hhmm(main.get('finishAt')))
    doing = STEP.get(main.get('step', ''), main.get('step', '')) + ' · ' + (main.get('title') or main.get('slug', ''))
    if st == 'done': pct, doing = 100, 'Đã xong · ' + (main.get('title') or main.get('slug', ''))
    if len(jobs) > 1: doing = f'{len(jobs)} phim · ' + doing
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
    text(RW - 6, 6, 'Xong lúc' if lab == 'xong' else lab or 'Trạng thái', LAB, '#8E9AB3', 'e')
    text(RW - 6, 18, val, MID, '#7CF08A' if st == 'done' else '#FFFFFF', 'e')
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
    cv.create_polygon([((x + OFF[0]) * Z, (y + OFF[1]) * Z)[k] for x, y in pts for k in (0, 1)], fill=col, outline='')

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
        for x, ch in enumerate(r):
            if ch == '.': line.append(None); continue
            c = pal[ABC.index(ch)]
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
SEAT, CORNER, DOWN = (70, 70), (124, 74), (124, 116)
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
    path = [SEAT, CORNER, DOWN, spot]
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
    R(150 + sw, 12, 2, 2, '#81C784'); R(132 - sw, 16, 2, 2, '#388E3C'); R(140 + sw, 10, 2, 2, '#388E3C'); R(8 + sw, 128, 2, 2, '#81C784')
    c = s % 16
    if c < 6:
        k = c / 6
        R(round(140 - k * 120), round(30 + k * 120 + 5 * math.sin(k * 10)), 2, 2, '#81C784' if int(s * 4) % 2 else '#388E3C')

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
    else: fr = 'blink' if s % 4 < 0.15 else ('grab' if s % 5 < 0.4 else 'normal')        # at the desk: blink, reach for papers
    bob = 2 if act == 'desk' and st == 'run' and s % 2 < 1 else (1 if act == 'walk' and int(walked / 6) % 2 else 0)
    if act == 'cheer': bob = -3 if s % 0.8 < 0.4 else 0                                    # jumps for joy
    shake = (1 if s % 0.2 < 0.1 else -1) if bad else 0
    front = by + 48 >= DESK_BASE
    if not front: img(bx + shake, by + bob, boss(fr))
    img(0, 0, lit('fg', night, pulse))
    if front: img(bx + shake, by + bob, boss(fr))
    motes(s, night)
    # laptop: the same progress on the screen; typing glyphs while he works at it
    R(63, 101, 22, 2, '#0E1E2C')
    if pct: R(63, 101, max(1, round(22 * min(100, pct) / 100)), 2, LED[st])
    if act == 'desk' and st == 'run':
        for i in range(4):
            k = (s / 1.2 + i * 0.25) % 1
            if k < 0.85: R(64 + i * 6, 92 - k * 16, 3, 3, '#B9FFE9')
    if spot == 'plant' and act == 'visit':                                         # watering the little plant
        for i in range(3):
            k = (s / 0.9 + i / 3) % 1
            R(16 + i * 5, 122 + k * 12, 2, 3, '#81D4FA')
    if spot == 'phone' and act == 'visit' and s % 1 < 0.5: R(128, 72, 8, 5, '#9FD0FF')   # the phone screen lights up
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

def draw():
    now = time.time() * 1000
    if now < hidden_until: root.withdraw()
    else:
        s = time.time(); pct, st, line, doing = summary(now)
        cv.delete('all'); frame(st); panel(pct, st, line, s); room(pct, st, s); footer(doing)
        if root.state() == 'withdrawn': root.deiconify(); root.lift()
    root.after(50, draw)

def place():
    L, T, Rr, B = work_area()
    try: x, y = json.load(open(POSF, encoding='utf-8'))['pos']
    except Exception: x, y = Rr - W * Z - 12, B - H * Z
    x = max(L, min(Rr - W * Z, x)); y = max(T, min(B - H * Z, y))   # keep it on screen after a resolution change
    root.geometry(f'+{x}+{y}')

def open_session():
    # shortcut: the desktop app's claude:// link brings Claude to the front, not a given session (no session link is known)
    try: os.startfile('claude://')
    except OSError: pass

def turn_off():
    if not DEMO:
        try: os.makedirs(HOME, exist_ok=True); json.dump({'on': False}, open(SWITCH, 'w', encoding='utf-8'))
        except OSError: pass
    root.destroy()

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

place(); load(); draw(); root.mainloop()
