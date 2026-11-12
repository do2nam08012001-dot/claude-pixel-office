// @ts-nocheck — pixel office scene (SVG paths + CSS animation, no images, no script). Source: art-source/scene7.mjs
// v4 scene (256x256) — pure function of the pipeline state; CSS animation only (no script).
// state: { stage, render, plan, research, blocked, approval, bench }
//   stage: idle | inputs | research | plan | render | qa | deliver | done
const ORDER = ['idle', 'inputs', 'research', 'plan', 'render', 'qa', 'deliver', 'done'];
const ROLE_OF = { inputs: 'fetch', research: 'research', plan: 'plan', render: 'build', qa: 'check', deliver: 'deliver' };
// legacy video status { stage, render, plan, research, blocked, approval } -> generic
export function legacy(s) {
  const i = ORDER.indexOf(s.stage || 'idle');
  const doneRoles = ORDER.slice(1, Math.max(1, i)).map((k) => ROLE_OF[k]).filter(Boolean);
  const prog = s.stage === 'render' ? s.render : s.stage === 'plan' ? s.plan : s.stage === 'research' ? s.research : 0;
  return { active: ROLE_OF[s.stage] || null, progress: prog || 0, doneRoles, allDone: s.stage === 'done', blocked: s.blocked, approval: s.approval, bench: s.bench,
    labels: { fetch: 'Kho Drive', research: 'Sonnet · tư liệu', plan: 'Opus · kế hoạch', build: 'Render', check: 'QA · kiểm tra', deliver: 'Giao phim' } };
}
export function officeSvg(A, s = {}) {
  // Generic state: { active: role|null, progress 0..1, doneRoles: role[], allDone, blocked, approval, labels: {role: text} }
  // roles: fetch | research | plan | build | check | deliver. A legacy { stage } object is converted first.
  const st0 = s.active !== undefined || s.doneRoles ? s : legacy(s);
  const R = { inputs: 'fetch', research: 'research', plan: 'plan', render: 'build', qa: 'check', deliver: 'deliver' };
  const doneSet = new Set(st0.doneRoles || []);
  const at = (k) => k === 'done' ? !!st0.allDone : st0.active === R[k];
  const past = (k) => !!st0.allDone || doneSet.has(R[k]);
  const prog = (k) => past(k) ? 1 : at(k) ? Math.max(0, Math.min(1, st0.progress ?? 0)) : 0;
  const st = { blocked: !!st0.blocked, approval: !!st0.approval, bench: st0.bench, plan: prog('plan'), research: prog('research'), render: prog('render') };
  const L = { fetch: 'Kho', research: 'Tư liệu', plan: 'Kế hoạch', build: 'Sản xuất', check: 'Kiểm tra', deliver: 'Giao', ...(st0.labels || {}) };
  const cut = (t, n = 18) => { const a = [...String(t)]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };
  const done = at('done');
  // sprites: frames reference shared bands; props are inline 2x art
  const usedBands = new Set();
  const half = (inner) => `<g transform="scale(.5)">${inner}</g>`;
  const S = {};
  for (const [who, frames] of Object.entries(A.chars)) {
    S[who] = {};
    for (const [name, ids] of Object.entries(frames)) Object.defineProperty(S[who], name, { get: () => { ids.forEach((id) => usedBands.add(id)); return half(ids.map((id) => `<use href="#${id}"/>`).join('')); } });
  }
  for (const [k, v] of Object.entries(A.props)) S[k] = half(v);
  const img = (h, x, y, w, hh, c = '') => `<g${x || y ? ` transform="translate(${x} ${y})"` : ''}${c ? ` class="${c}"` : ''}>${h}</g>`;
  const rect = (x, y, w, h, f, c = '', o) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"${o != null ? ` opacity="${o}"` : ''}${c ? ` class="${c}"` : ''}/>`;
  const G = (i, a = '') => `<g${a ? ' ' + a : ''}>${i}</g>`;
  const shadowE = (x, y, rx = 6) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="1.6" fill="#000" opacity=".28"/>`;
  // ---------- helpers: actors, walkers, effects ----------
  let pathCss = '';
  let hpN = 0;
  // HP-style bar: starts at the real progress and grows smoothly toward where the step will be at the next refresh
  const hp = (f, bad) => {
    const f0 = Math.max(0, Math.min(1, f)), dur = st0.rate > 0 ? Math.min(1800, Math.max(10, (0.99 - f0) / st0.rate)) : 90, f1 = Math.max(f0, Math.min(0.99, f0 + (st0.rate || 0) * dur)), id = ++hpN;
    pathCss += `@keyframes hpg${id}{from{transform:scaleX(${f0})}to{transform:scaleX(${f1})}}`;
    const col = bad ? '#FF5252' : f0 > .66 ? '#4ADE80' : f0 > .33 ? '#FACC15' : '#FB923C';
    return G(rect(-0.5, -0.5, 17, 4, '#1B1F2A') + rect(0, 0, 16, 3, bad ? '#4A1414' : '#1E3A2A')
      + `<rect x="0" y="0" width="16" height="3" fill="${col}" style="transform-origin:0 0;transform:scaleX(${f0});animation:hpg${id} ${Math.round(dur)}s linear forwards"${bad ? ' class="alarm"' : ''}/>`
      + rect(0, 0, 16, 1, '#FFFFFF', '', .25), 'transform="translate(0 -7)"');
  };
  const steamHead = G([0, 1, 2].map(i => rect(4 + i * 4, -2, 2, 2, '#FFFFFF', `rise r${i}`, 0)).join(''));
  const speed = G(rect(-5, 9, 3, 1, '#FFFFFF', 'tap t0', 0) + rect(-6, 13, 4, 1, '#FFFFFF', 'tap t1', 0) + rect(18, 10, 3, 1, '#FFFFFF', 'tap t2', 0) + rect(18, 14, 4, 1, '#FFFFFF', 'tap t0', 0));
  const sweatFx = G(rect(14, 4, 1, 2, '#81D4FA') + rect(14, 6, 1, 1, '#B3E5FC') + rect(1, 5, 1, 2, '#81D4FA'), 'class="sweat"');
  const paper = G(rect(0, 0, 3, 4, '#FFFFFF') + rect(0, 1, 3, 1, '#B0BEC5'), 'class="paper"');
  // frantic worker at a desk: fast typing with a red face, grabbing the head now and then, steam, sweat, speed lines, HP-style progress bar
  const frantic = (who, x, y, f, bad) => {
    const c = S[who];
    const typing = G(img(c.red1, 0, 0, 16, 24, 'fa q') + img(c.red2, 0, 0, 16, 24, 'fb q'), 'class="cyc-a"');
    const grab = G(img(c.grab, 0, 0, 16, 24), 'class="cyc-b"');
    return G(shadowE(8, 24) + G(G(typing + grab, 'class="shake2"'), 'class="slam"') + emote(bad ? 'bang' : 'anger', 13, -15, 0.5, 3) + steamHead + speed + sweatFx + G(paper, 'transform="translate(18 12)"') + hp(f, bad), `transform="translate(${x} ${y})"`);
  };
  const actor = (who, x, y, mode, shadow) => {
    const c = S[who]; let b;
    if (mode === 'wave') b = img(c.wave1, 0, 0, 16, 24, 'fa slow') + img(c.wave2, 0, 0, 16, 24, 'fb slow');
    else if (mode === 'happy') b = img(c.happy, 0, 0, 16, 24);
    else if (mode === 'worried') b = img(c.worried, 0, 0, 16, 24) + sweatFx;
    else b = img(c.normal, 0, 0, 16, 24) + img(c.blink, 0, 0, 16, 24, 'blink');
    return G((shadow ? shadowE(8, 24) : '') + G(b, 'class="bob"'), `transform="translate(${x} ${y})"`);
  };
  // walker along waypoints [[t%, x, y], ...]; walks between points, stands at pauses doing `act`, faces its way
  const walker = (who, name, pts, secs, o = {}) => {
    const c = S[who], once = o.once ? '1 forwards' : 'infinite';
    const pos = pts.map(([t, x, y]) => `${t}%{transform:translate(${x}px,${y}px)}`).join('');
    const mv = [], sv = [], fc = [];
    for (let i = 0; i < pts.length; i++) {
      const [t, x, y] = pts[i], n = pts[i + 1];
      const moving = n && (n[1] !== x || n[2] !== y), left = n && n[1] < x;
      mv.push(`${t}%{opacity:${moving ? 1 : 0}}`); sv.push(`${t}%{opacity:${moving ? 0 : 1}}`);
      if (n && n[1] !== x) fc.push(`${t}%{transform:${left ? 'matrix(-1,0,0,1,16,0)' : 'none'}}`);
    }
    pathCss += `.p-${name}{animation:P${name} ${secs}s linear ${once}}@keyframes P${name}{${pos}}`
      + `.m-${name}{animation:M${name} ${secs}s step-end ${once}}@keyframes M${name}{${mv.join('')}}`
      + `.s-${name}{animation:S${name} ${secs}s step-end ${once}}@keyframes S${name}{${sv.join('')}}`
      + `.f-${name}{animation:F${name} ${secs}s step-end ${once}}@keyframes F${name}{${fc.join('')}}`;
    const face = o.mood === 'happy' ? c.happy : o.mood === 'worried' ? c.worried : o.mood === 'red' ? c.red1 : c.normal;
    const walking = G(img(c.walkA, 0, 0, 16, 24, o.rush ? 'fa q' : 'fa') + img(c.walkB, 0, 0, 16, 24, o.rush ? 'fb q' : 'fb'), `class="m-${name}"`);
    const standing = G(G(img(face, 0, 0, 16, 24) + (o.act || ''), o.mood === 'happy' ? 'class="hop"' : '') + (o.emo ? emote(o.emo, 10, -9, o.emoDelay || 0, o.emoEvery || 6) : ''), `class="s-${name} stand"`);
    const fx = (o.mood === 'worried' || o.rush ? sweatFx : '') + (o.rush ? steamHead : '');
    return G(shadowE(8, 24) + G(G(walking + standing + (o.carry || '') + fx, `class="f-${name}"`), o.rush ? 'class="bobq"' : 'class="bobf"') + (o.hp != null ? hp(o.hp, o.bad) : ''), `class="p-${name}"`);
  };
  // idle activities shown while a walker stands
  const ACT = {
    coffee: G(rect(10, 12, 3, 3, '#FFFFFF') + rect(10, 12, 3, 1, '#6D4C41') + rect(13, 13, 1, 1, '#FFFFFF') + rect(11, 9, 1, 1, '#FFFFFF', 'steam'), 'class="sipc"'),
    game: G(rect(4, 13, 8, 4, '#263238') + rect(6, 14, 4, 2, '#69F0AE', 'scr') + rect(4, 14, 1, 1, '#E53935') + rect(11, 15, 1, 1, '#FFD54F'), '') + G(`<text x="10" y="6" font-family="Consolas" font-size="4" fill="#FFF59D" stroke="#2A1E1E" stroke-width=".5" paint-order="stroke">+1</text>`, 'class="rise r1"'),
    noodles: G(rect(3, 15, 10, 3, '#FFFFFF') + rect(4, 14, 8, 1, '#FFCC80') + rect(3, 17, 10, 1, '#CFD8DC') + rect(6, 12, 1, 1, '#FFFFFF', 'steam'), '') + G(rect(11, 8, 1, 7, '#8D6E63') + rect(13, 8, 1, 7, '#8D6E63'), 'class="chop"'),
    view: G(`<text x="11" y="2" font-family="Consolas" font-size="5" fill="#F8BBD0" stroke="#2A1E1E" stroke-width=".5" paint-order="stroke">♪</text>`, 'class="rise r0"') + G(`<text x="2" y="0" font-family="Consolas" font-size="4" fill="#FFF59D" stroke="#2A1E1E" stroke-width=".5" paint-order="stroke">~</text>`, 'class="rise r2"'),
    phone: G(rect(9, 12, 4, 6, '#212121') + rect(10, 13, 2, 4, '#81D4FA', 'scr'), ''),
  };
  const folder = G(rect(-5, 11, 9, 7, '#2A1E1E') + rect(-4, 12, 7, 5, '#FFCA28') + rect(-4, 12, 3, 1, '#FFA000') + rect(-3, 14, 5, 1, '#FFFFFF'), '');
  // where each role works and how to get there through doors and the corridor
  const STA = { fetch: [190, 196, 'L', 207], research: [160, 100, 'T'], plan: [80, 100, 'T'], build: [60, 186, 'L', 33], check: [100, 190, 'L', 121], deliver: [208, 100, 'T'] };
  const route = (a, b) => {
    const [ax, ay, ak, ad] = STA[a], [bx, by, bk, bd] = STA[b], P = [[ax, ay]];
    if (ak === 'L') P.push([ad, ay], [ad, 130]); else P.push([ax, 130]);
    if (bk === 'L') P.push([bd, 130], [bd, by], [bx, by]); else P.push([bx, 130], [bx, by]);
    return P;
  };
  const CHAR = { fetch: 'courier', research: 'sonnet', plan: 'opus', build: 'tech', check: 'qa', deliver: 'courier' };
  // hand-off: the previous step's employee walks the folder over; returns the svg and the arrival time (s)
  const handoff = (from, to) => {
    if (!STA[from] || !STA[to] || CHAR[from] === CHAR[to]) return null;
    const go = route(from, to), back = go.slice().reverse();
    const all = [...go, go[go.length - 1], ...back];
    const d = []; for (let k = 1; k < all.length; k++) d.push(Math.abs(all[k][0] - all[k - 1][0]) + Math.abs(all[k][1] - all[k - 1][1]) || 40);
    const tot = d.reduce((a, b) => a + b, 0), secs = Math.max(8, tot / 22); let acc = 0, arriveAt = 0;
    const pts = [[0, ...all[0]]];
    for (let k = 1; k < all.length; k++) { acc += d[k - 1]; pts.push([Math.round(acc / tot * 1000) / 10, ...all[k]]); if (k === go.length - 1) arriveAt = acc / tot * secs; }
    const age = Math.min(Math.max(0, st0.handoffAge || 0), secs);   // seconds the step has already been running
    const arrive = Math.max(0, arriveAt - age);
    let svg = walker(CHAR[from], 'hand', pts, secs, { once: true, carry: G(folder, `style="animation:hideAt .05s linear ${arrive}s 1 forwards"`), mood: 'happy' });
    if (age > 0) pathCss = pathCss.replace(/\.(p|m|s|f)-hand\{animation:([^}]*)\}/g, (m0, k, a) => `.${k}-hand{animation:${a};animation-delay:-${age}s}`);
    return { svg, arrive };
  };
  // the receiver waits at its place until the folder arrives, then starts working
  const late = (role, working, waiting) => (hand && hand.to === role && H)
    ? G(working, `style="opacity:0;animation:showAt .05s linear ${H.arrive}s 1 forwards"`) + G(waiting, `style="animation:hideAt .05s linear ${H.arrive}s 1 forwards"`)
    : working;
  const EMO = {
    heart: [[1,0,2,'#F0525A'],[4,0,2,'#F0525A'],[0,1,6,'#F0525A'],[0,2,6,'#F0525A'],[1,3,4,'#F0525A'],[2,4,2,'#F0525A']],
    note: [[3,0,3,'#7E57C2'],[3,1,1,'#7E57C2'],[3,2,1,'#7E57C2'],[3,3,1,'#7E57C2'],[1,3,3,'#7E57C2'],[1,4,2,'#7E57C2']],
    dots: [[0,2,1,'#5D6B82'],[2,2,1,'#5D6B82'],[4,2,1,'#5D6B82']],
    anger: [[0,0,1,'#F0525A'],[5,0,1,'#F0525A'],[1,1,1,'#F0525A'],[4,1,1,'#F0525A'],[1,3,1,'#F0525A'],[4,3,1,'#F0525A'],[0,4,1,'#F0525A'],[5,4,1,'#F0525A']],
    q: [[1,0,3,'#F5A524'],[4,1,1,'#F5A524'],[3,2,1,'#F5A524'],[2,3,1,'#F5A524'],[2,5,1,'#F5A524']],
    bang: [[2,0,2,'#F0525A'],[2,1,2,'#F0525A'],[2,2,2,'#F0525A'],[2,4,2,'#F0525A']],
    star: [[2,0,1,'#F5B800'],[1,1,3,'#F5B800'],[0,2,5,'#F5B800'],[1,3,3,'#F5B800'],[0,4,1,'#F5B800'],[4,4,1,'#F5B800']],
  };
  const emote = (type, x, y, delay = 0, every = 6) => G(rect(-1, -1, 8, 7, '#FFFFFF') + rect(-2, 0, 10, 5, '#FFFFFF') + rect(0, 6, 2, 1, '#FFFFFF') + (EMO[type] || []).map(([a, b, w, c]) => rect(a, b, w, 1, c)).join(''),
    `transform="translate(${x} ${y})"`).replace('<g ', `<g class="emo" style="animation-duration:${every}s;animation-delay:${delay}s" `);
  const workGlow = (x, y, w, h) => rect(x, y, w, h, '#FFF59D', '', .07);
  const glyphs = (x, y, col = '#B9FFE9') => [0, 1, 2, 3].map(i => rect(x + i * 3, y, 1.5, 1.5, col, `rise r${i}`, 0)).join('');
  const gear = (x, y) => G(G(rect(-1, -4, 2, 8, '#FFD54F') + rect(-4, -1, 8, 2, '#FFD54F') + `<rect x="-2.5" y="-2.5" width="5" height="5" fill="#FFB300" transform="rotate(45)"/>` + rect(-1, -1, 2, 2, '#5D4037'), 'class="spin"'), `transform="translate(${x} ${y})"`);
  const bubble = (k, x, y) => G(img(S['b_' + k], x, y, 16, 16), `class="${k === 'err' ? 'shake' : 'pop'}"`);
  const zz = (x, y) => ['z', 'z', 'Z'].map((t, i) => G(`<text x="${x + i * 3}" y="${y - i * 3}" font-family="Consolas,monospace" font-size="${5 + i}" font-weight="700" fill="#E3F2FD" stroke="#2A1E1E" stroke-width=".7" paint-order="stroke">${t}</text>`, `class="zz" style="animation-delay:${i * .8}s"`)).join('');
  const tag = (x, y, t, on, col) => {
    const w = [...t].length * 2.85 + 9;
    return (on ? rect(x - 3, y - 3, w + 6, 14, '#FFE066', 'tagglow', .9) + rect(x - 1.5, y - 1.5, w + 3, 11, '#FFF8C4', 'tagglow') : '')
      + rect(x - .5, y - .5, w + 1, 9, '#2A1E1E') + rect(x, y, w, 8, col) + (on ? rect(x, y, w, 8, '#FFFFFF', 'tagflash', 0) : '') + rect(x, y, w, 1, '#FFFFFF', '', .25) + rect(x + 2, y + 2.5, 3, 3, on ? '#7CFFB2' : '#8A94A0', on ? 'led' : '')
      + `<text x="${x + 7.5}" y="${y + 6}" font-family="Consolas,'Courier New',monospace" font-size="5" fill="#FFFFFF">${t}</text>`;
  };
  const screen = (x, y, w, h, on, mood = 'ok') => on
    ? rect(x - 3, y - 3, w + 6, h + 6, mood === 'err' ? '#FF5252' : '#7CF7D4', 'glow', .18) + rect(x, y, w, h, mood === 'err' ? '#FF8A80' : '#6FE0C4', mood === 'err' ? 'alarm' : 'scr')
      + rect(x + 1, y + 1, w * .5, 1, '#E8FFF8') + rect(x + 1, y + 3, w - 3, 1, mood === 'err' ? '#C62828' : '#2FA387', 'scan') + rect(x + 1, y + 5, w * .6, 1, mood === 'err' ? '#C62828' : '#2FA387')
    : '';
  const zoneAlarm = (x, y, w, h) => rect(x, y, w, h, '#FF1744', 'redpulse', 0);
  const err = st.blocked;

  let under = '', back = '', mid = '', front = '', walk = '', top = '';
  // ---------- ambient light ----------
  under += `<polygon points="140,28 164,28 152,118 110,118" fill="#FFF3C4" class="beam"/>`;
  under += [0, 1, 2, 3, 4].map(i => rect(122 + i * 7, 60 + (i % 3) * 14, 1, 1, '#FFFFFF', `dust d${i % 3}`, .7)).join('');
  under += `<ellipse cx="139" cy="74" rx="18" ry="6" fill="#FFE9A8" opacity=".22"/><ellipse cx="200" cy="92" rx="15" ry="5" fill="#FFE9A8" opacity=".25"/>`;
  // ---------- chairman ----------
  const bossMode = done ? 'wave' : st.approval || err ? 'worried' : 'idle';
  top += done ? emote('heart', 222, 60, 0, 3) : err ? emote('bang', 222, 60, 0, 2) : st.approval ? '' : emote('star', 222, 60, 2, 7);
  mid += actor('boss', 211, 70, bossMode);
  if (bossMode === 'idle') top += G(rect(212, 86, 9, 4, '#2E7D32') + rect(212, 85, 9, 1, '#66BB6A') + G(rect(213, 82, 7, 3, '#81C784') + rect(215, 83, 3, 1, '#2E7D32'), 'class="flip"') + G(`<text x="221" y="82" font-family="Consolas" font-size="5" font-weight="700" fill="#FFD54F" stroke="#5D4037" stroke-width=".5" paint-order="stroke">$</text>`, 'class="rise r1"'), 'class="money"')
    + G(rect(222, 84, 4, 6, '#212121') + rect(223, 85, 2, 4, '#81D4FA', 'scr'), 'class="phoneb"');
  front += screen(206, 80, 14, 8, true) ;
  if (st.approval) { top += rect(240, 86, 12, 6, '#FFB74D', 'glowp', .4) + bubble('wait', 223, 50); }
  if (done) top += bubble('ok', 223, 50) + G([['#FFD54F', 180], ['#FF8A80', 196], ['#81D4FA', 214], ['#A5D6A7', 232], ['#CE93D8', 248], ['#FFD54F', 120], ['#FF8A80', 60], ['#81D4FA', 20]].map(([c, x], i) => rect(x, 0, 2, 3, c, `conf k${i % 4}`)).join(''))
    + G([[200, 60], [238, 64], [206, 96], [244, 92]].map(([x, y], i) => `<path d="M${x} ${y - 3}v6M${x - 3} ${y}h6" stroke="#FFF59D" stroke-width="1" class="spark s${i % 2}"/>`).join(''));
  back += tag(224, 112, 'Chủ tịch', st.approval || done, '#7A4A2E');
  const P = Math.max(0, Math.min(1, st0.progress ?? 0)), hand = st0.handoff && !st0.allDone ? st0.handoff : null;
  const skip = (role) => hand && hand.from === role;
  const H = hand ? handoff(hand.from, hand.to) : null;
  if (H) walk += H.svg;
  // ---------- plan ----------
  const opusOn = at('plan') || (at('research') && st.bench === 'all-opus');
  if (opusOn) { mid += late('plan', frantic('opus', 36, 78, P, err), actor('opus', 36, 78, 'happy')); top += gear(28, 70); under += workGlow(0, 44, 84, 84); }
  else if (!skip('plan')) mid += walker('opus', 'opusIdle', [[0, 36, 70], [15, 36, 70], [32, 46, 52], [70, 46, 52], [86, 36, 70], [100, 36, 70]], 16, { act: ACT.coffee, emo: 'heart', emoDelay: 1, mood: done || past('plan') ? 'happy' : '' });
  front += screen(21, 82, 16, 9, opusOn, err ? 'err' : 'ok') + screen(53, 82, 16, 9, opusOn, err ? 'err' : 'ok');
  if (opusOn && !err) top += glyphs(24, 80, '#D1C4E9') + glyphs(56, 80, '#D1C4E9');
  for (let i = 0; i < 4; i++) back += rect(26, 9 + i * 3, Math.round(Math.max(0, Math.min(1, st.plan * 4 - i)) * 30), 1.5, '#7E57C2');
  if (opusOn && err) { top += bubble('err', 46, 54); under += zoneAlarm(0, 44, 84, 84); }
  back += tag(4, 118, cut(L.plan), opusOn, '#5E35B1');
  // ---------- research ----------
  const res = at('research');
  if (res) { mid += late('research', walker('sonnet', 'res', [[0, 124, 52], [8, 124, 52], [30, 100, 42], [60, 100, 42], [86, 124, 52], [100, 124, 52]], 6, { carry: G(img(S.book, 12, 11, 6, 6), 'class="book"'), mood: err ? 'worried' : 'red', rush: true, hp: P, bad: err }), actor('sonnet', 124, 52, 'happy', true)); under += workGlow(88, 44, 82, 84); if (!err) top += glyphs(140, 80) + gear(150, 74); }
  else if (!skip('research')) mid += walker('sonnet', 'sonIdle', [[0, 118, 70], [14, 118, 70], [34, 148, 58], [74, 148, 58], [90, 118, 70], [100, 118, 70]], 18, { act: ACT.view, emo: 'note', emoDelay: 2.5, mood: 'happy' });
  front += screen(137, 82, 16, 9, res, err ? 'err' : 'ok');
  back += rect(92, 66, Math.round(42 * (past('research') ? 1 : res ? st.research : 0)), 1.5, '#26A69A');
  if (res && err) { top += bubble('err', 126, 26); under += zoneAlarm(88, 44, 82, 84); }
  back += tag(92, 118, cut(L.research), res, '#00796B');
  // ---------- build ----------
  const rOn = at('render'), rp = past('render') ? 1 : rOn ? st.render : 0;
  for (const x0 of [4, 26]) for (let j = 0; j < 8; j++) back += rect(x0 + 3, 180 + j * 6, 1.5, 1.5, rOn ? (err && j % 3 === 0 ? '#FF5252' : '#69F0AE') : '#33404C', rOn ? `led l${(j + x0) % 3}` : '') + rect(x0 + 6, 180 + j * 6, 1.5, 1.5, rOn ? '#FFD54F' : '#33404C', rOn ? `led l${(j + x0 + 1) % 3}` : '');
  back += rect(4, 229.5, 42, 3, '#10161B') + rect(5, 230.5, Math.round(40 * rp), 1, err && rOn ? '#FF5252' : '#69F0AE');
  if (rOn) { mid += late('build', frantic('tech', 58, 186, P, err), actor('tech', 58, 186, 'happy', true)); under += workGlow(0, 168, 84, 88); if (!err) top += gear(50, 180) + [8, 18, 30, 40].map((x, i) => rect(x, 170, 1, 3, '#B3E5FC', `heat h${i % 3}`, 0)).join(''); }
  else if (!skip('build')) walk += walker('tech', 'techIdle', [[0, 20, 206], [16, 20, 206], [34, 58, 206], [80, 58, 206], [94, 20, 206], [100, 20, 206]], 18, { act: ACT.game, emo: 'star', emoDelay: 0.5, mood: 'happy' });
  front += screen(56, 197, 14, 8, rOn, err ? 'err' : 'ok');
  if (rOn && !err) top += glyphs(58, 196);
  if (rOn && err) { top += bubble('err', 70, 160); under += zoneAlarm(0, 168, 84, 88); }
  back += tag(3, 247, cut(L.build, 13) + (rOn ? ` ${Math.round(rp * 100)}%` : ''), rOn, '#37474F');
  // ---------- check ----------
  const qOn = at('qa');
  if (qOn) { mid += late('check', walker('qa', 'qa', [[0, 126, 188], [8, 126, 188], [34, 102, 188], [64, 102, 188], [90, 126, 188], [100, 126, 188]], 6, { carry: img(S.clip, -3, 11, 6, 8), mood: err ? 'worried' : 'red', rush: true, hp: P, bad: err }), actor('qa', 126, 188, 'happy', true)); under += workGlow(88, 168, 80, 88); if (!err) top += [0, 1, 2, 3, 4].map(i => rect(98, 177 + i * 3, 2, 2, '#43A047', `chk c${i}`, 0)).join(''); }
  else if (!skip('check')) mid += walker('qa', 'qaIdle', [[0, 124, 190], [14, 124, 190], [34, 146, 196], [80, 146, 196], [94, 124, 190], [100, 124, 190]], 18, { act: ACT.noodles, emo: 'heart', emoDelay: 3, mood: 'happy' });
  front += screen(109, 206, 16, 9, qOn, err ? 'err' : 'ok') + screen(139, 206, 16, 9, qOn, err ? 'err' : 'ok');
  if (qOn && err) { top += bubble('err', 112, 160); under += zoneAlarm(88, 168, 80, 88); }
  back += tag(106, 247, cut(L.check, 16), qOn, '#2E7D32');
  // ---------- store / courier ----------
  const fetch = at('inputs'), deliver = at('deliver');
  if (fetch) { walk += walker('courier', 'fetch', [[0, 190, 196], [5, 207, 196], [17, 207, 130], [40, 80, 130], [46, 80, 100], [56, 80, 100], [62, 80, 130], [85, 207, 130], [96, 207, 196], [100, 190, 196]], 12, { carry: img(S.crate, -5, 11, 10, 9), mood: err ? 'worried' : 'red', rush: true, hp: P, bad: err }); under += workGlow(172, 168, 84, 88); }
  else if (deliver) { walk += late('deliver', walker('courier', 'deliver', [[0, 190, 196], [8, 207, 196], [26, 207, 130], [36, 208, 100], [58, 208, 100], [68, 207, 130], [90, 207, 196], [100, 190, 196]], 9, { carry: img(S.reel, -5, 10, 10, 10), mood: err ? 'worried' : 'happy', rush: true, hp: P, bad: err }), actor('courier', 190, 196, 'happy', true)); under += workGlow(172, 44, 84, 84); }
  else if (!skip('fetch') && !skip('deliver')) walk += walker('courier', 'courIdle', [[0, 188, 196], [14, 188, 196], [34, 214, 200], [80, 214, 200], [94, 188, 196], [100, 188, 196]], 17, { act: ACT.phone, emo: 'dots', emoDelay: 1.5, mood: done ? 'happy' : '' });
  if ((fetch || deliver) && err) { top += bubble('err', 214, 162); under += zoneAlarm(172, 168, 84, 88); }
  back += tag(176, 247, cut(deliver ? L.deliver : L.fetch, 15), fetch || deliver, '#8D6234');
  // ---------- ambience ----------
  if (!st0.lite) {
    mid += rect(64, 148, 6, 2, '#E53935') + rect(65, 147, 4, 1, '#8D6E63');   // cat bowl
    mid += G(G(G(img(S.cat, 0, 0, 18, 10), 'class="catf"'), 'class="catb2"') + G(`<text x="14" y="-1" font-family="Consolas" font-size="4" fill="#E3F2FD" stroke="#2A1E1E" stroke-width=".5" paint-order="stroke">z</text>`, 'class="catz"') + G(rect(-1, 6, 2, 1, '#FFCC80'), 'class="cateat"'), 'class="catp"');
  }
  under += G(rect(142, 9, 8, 3, '#FFFFFF') + rect(144, 8, 5, 1, '#FFFFFF'), 'class="cloud"');
  back += G(rect(76, 15, 4, 1, '#E53935'), 'class="tick"');
  for (const [x, y] of [[70, 92], [152, 92], [244, 85]]) top += G(rect(x, y, 1, 1, '#FFFFFF', '', .8) + rect(x + 1, y - 2, 1, 1, '#FFFFFF', '', .5), 'class="steam"');
  // alarm beacons above doors (only when that room is blocked)
  if (err && rOn) top += rect(39, 151, 4, 3, '#FF1744', 'alarm') + rect(36, 149, 10, 7, '#FF1744', 'glowp', .25);
  if (err && qOn) top += rect(127, 151, 4, 3, '#FF1744', 'alarm') + rect(124, 149, 10, 7, '#FF1744', 'glowp', .25);
  if (err && (fetch || deliver)) top += rect(213, 151, 4, 3, '#FF1744', 'alarm') + rect(210, 149, 10, 7, '#FF1744', 'glowp', .25);

  const css = `
.blink{animation:blink 4.4s steps(1) infinite;opacity:0}@keyframes blink{94%{opacity:1}97%{opacity:0}}
.fa{animation:fa .4s steps(1) infinite}.fb{animation:fb .4s steps(1) infinite}@keyframes fa{0%{opacity:1}50%{opacity:0}}@keyframes fb{0%{opacity:0}50%{opacity:1}}
.slow{animation-duration:.9s}
.bob{animation:bob 1.8s steps(1) infinite}.bobf{animation:bob .4s steps(1) infinite}@keyframes bob{50%{transform:translateY(-1px)}}
.breath{animation:bob 3.2s steps(1) infinite}
.book{animation:book 9s steps(1) infinite}@keyframes book{0%,37%{opacity:0}38%,92%{opacity:1}93%{opacity:0}}
.pop{animation:pop 1.3s ease-in-out infinite}@keyframes pop{50%{transform:translateY(-2px)}}
.shake{animation:shk .26s steps(1) infinite}@keyframes shk{50%{transform:translate(1px,-1px)}}
.led{animation:led .8s steps(1) infinite}.l1{animation-delay:.27s}.l2{animation-delay:.53s}@keyframes led{50%{opacity:.25}}
.scr{animation:scr 1.4s steps(1) infinite}@keyframes scr{50%{fill:#A8F5E2}}
.alarm{animation:alarm .5s steps(1) infinite}@keyframes alarm{50%{opacity:.35}}
.glow{animation:glow 2s ease-in-out infinite}@keyframes glow{50%{opacity:.32}}
.glowp{animation:glowp 1s ease-in-out infinite}@keyframes glowp{50%{opacity:.75}}
.redpulse{animation:rp 1.2s ease-in-out infinite}@keyframes rp{50%{opacity:.13}}
.scan{animation:scan .7s steps(3) infinite}@keyframes scan{100%{transform:translateY(2px)}}
.zz{animation:zz 2.6s steps(8) infinite;opacity:0}@keyframes zz{15%{opacity:1}100%{transform:translate(4px,-9px);opacity:0}}
.sweat{animation:sw 1s steps(2) infinite}@keyframes sw{50%{transform:translateY(2px);opacity:.4}}
.beam{opacity:.12;animation:beam 6s ease-in-out infinite}@keyframes beam{50%{opacity:.2}}
.dust{animation:dust 7s linear infinite}.d1{animation-delay:-2.3s}.d2{animation-delay:-4.6s}@keyframes dust{0%{transform:translate(0,0);opacity:0}20%{opacity:.8}100%{transform:translate(-8px,22px);opacity:0}}
.conf{animation:conf 2.2s linear infinite}.k1{animation-delay:-.5s}.k2{animation-delay:-1.1s}.k3{animation-delay:-1.6s}@keyframes conf{0%{transform:translateY(-4px) rotate(0)}100%{transform:translateY(130px) rotate(180deg)}}
.spark{animation:spark 1s steps(2) infinite}.s1{animation-delay:.5s}@keyframes spark{50%{opacity:0}}
.steam{animation:steam 2.4s steps(6) infinite}@keyframes steam{0%{transform:translateY(0);opacity:.9}100%{transform:translateY(-6px);opacity:0}}
.sip{animation:sip 6s steps(1) infinite}@keyframes sip{0%,70%{transform:none}72%,86%{transform:translate(-2px,-7px)}}
.cloud{animation:cloud 28s linear infinite}@keyframes cloud{0%,100%{transform:translateX(-4px)}50%{transform:translateX(12px)}}
.tail{animation:tail 1.6s steps(1) infinite}@keyframes tail{50%{transform:translateY(-1px)}}
.tick{animation:tick 6s steps(6) infinite;transform-origin:76.5px 15.5px}@keyframes tick{100%{transform:rotate(360deg)}}
.stand{opacity:0}
.workglow{animation:wg 2.4s ease-in-out infinite}@keyframes wg{50%{opacity:.11}}
.rise{animation:rise 1.6s linear infinite}.r1{animation-delay:.4s}.r2{animation-delay:.8s}.r3{animation-delay:1.2s}@keyframes rise{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(-14px);opacity:0}}
.spin{animation:spin 1.2s steps(4) infinite}@keyframes spin{100%{transform:rotate(90deg)}}
.tap{animation:tap .5s steps(1) infinite}.t1{animation-delay:.17s}.t2{animation-delay:.33s}@keyframes tap{0%{opacity:1}30%{opacity:0}}
.heat{animation:rise 1.2s linear infinite}.h1{animation-delay:.4s}.h2{animation-delay:.8s}
.chk{animation:chk 5s steps(1) infinite}.c1{animation-delay:.8s}.c2{animation-delay:1.6s}.c3{animation-delay:2.4s}.c4{animation-delay:3.2s}@keyframes chk{0%{opacity:0}15%,90%{opacity:1}}
.stand{opacity:0}
.q{animation-duration:.18s}
.bobq{animation:bob .2s steps(1) infinite}
.cyc-a{animation:cyca 4s step-end infinite}.cyc-b{opacity:0;animation:cycb 4s step-end infinite}
@keyframes cyca{0%{opacity:1}70%{opacity:0}90%{opacity:1}}@keyframes cycb{0%{opacity:0}70%{opacity:1}90%{opacity:0}}
.shake2{animation:sk2 .12s steps(1) infinite}@keyframes sk2{50%{transform:translateX(.6px)}}
.paper{animation:paper 1.6s linear infinite}@keyframes paper{0%{transform:translate(0,0) rotate(0);opacity:1}100%{transform:translate(10px,-14px) rotate(90deg);opacity:0}}
.rise{animation:rise 1.6s linear infinite}.r1{animation-delay:.4s}.r2{animation-delay:.8s}.r3{animation-delay:1.2s}@keyframes rise{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(-14px);opacity:0}}
.spin{animation:spin .8s steps(4) infinite}@keyframes spin{100%{transform:rotate(90deg)}}
.tap{animation:tap .3s steps(1) infinite}.t1{animation-delay:.1s}.t2{animation-delay:.2s}@keyframes tap{0%{opacity:1}40%{opacity:0}}
.heat{animation:rise 1.2s linear infinite}.h1{animation-delay:.4s}.h2{animation-delay:.8s}
.chk{animation:chk 5s steps(1) infinite}.c1{animation-delay:.8s}.c2{animation-delay:1.6s}.c3{animation-delay:2.4s}.c4{animation-delay:3.2s}@keyframes chk{0%{opacity:0}15%,90%{opacity:1}}
.sipc{animation:sipc 3s steps(1) infinite}@keyframes sipc{0%,60%{transform:none}62%,85%{transform:translate(-3px,-5px)}}
.chop{animation:chop .6s steps(1) infinite}@keyframes chop{50%{transform:translateY(-3px)}}
.flip{animation:flip .5s steps(2) infinite;transform-box:fill-box;transform-origin:center bottom}@keyframes flip{50%{transform:scaleY(-1) translateY(2px)}}
.money{animation:mny 12s step-end infinite}.phoneb{opacity:0;animation:phn 12s step-end infinite}@keyframes mny{0%{opacity:1}55%{opacity:0}}@keyframes phn{0%{opacity:0}55%{opacity:1}}
.catp{animation:catp 32s linear infinite}@keyframes catp{0%{transform:translate(132px,140px)}18%,40%{transform:translate(66px,140px)}60%,100%{transform:translate(196px,140px)}}
.catf{animation:catf 32s step-end infinite}@keyframes catf{0%{transform:matrix(-1,0,0,1,18,0)}40%{transform:none}}
.catb2{animation:catb 32s step-end infinite}@keyframes catb{0%{animation-timing-function:step-end}}
.catz{opacity:0;animation:catz 32s step-end infinite}@keyframes catz{0%{opacity:0}62%{opacity:1}}
.cateat{opacity:0;animation:cate 32s step-end infinite}@keyframes cate{0%{opacity:0}18%{opacity:1}40%{opacity:0}}@keyframes showAt{to{opacity:1}}
.tagglow{animation:tagg .9s steps(1) infinite}@keyframes tagg{50%{opacity:.15}}.tagflash{animation:tagf .9s steps(1) infinite}@keyframes tagf{50%{opacity:.35}}
.emo{opacity:0;animation:emo 6s steps(1) infinite}@keyframes emo{0%{opacity:0}8%{opacity:1;transform:translateY(-2px)}12%{transform:none}40%{opacity:1}44%{opacity:0}}
.hop{animation:hop 3.2s steps(1) infinite}@keyframes hop{0%{transform:none}70%{transform:translateY(-2px)}76%{transform:translateY(-3px)}82%{transform:none}}
.slam{animation:slam 2.6s steps(1) infinite}@keyframes slam{0%{transform:none}80%{transform:translateY(-2px)}86%{transform:translateY(1px)}90%{transform:none}}@keyframes hideAt{to{opacity:0}}` + pathCss;
  const open = (px) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" shape-rendering="crispEdges" width="${px}" height="${px}">`;
  const defs = () => '<defs>' + A.pats.map((p) => `<pattern id="${p.id}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" patternUnits="userSpaceOnUse">${p.svg}</pattern>`).join('')
    + [...usedBands].map((id) => `<g id="${id}">${A.bands[id]}</g>`).join('') + '</defs>';
  const floors = () => half(A.pats.map((p) => p.areas.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${p.id})"/>`).join('')).join('') + A.bg);
  return { full: (px = 512) => open(px) + defs() + `<style>${css}</style>${floors()}${under}${back}${mid}${half(A.fg)}${front}${walk}${top}</svg>` };
}
