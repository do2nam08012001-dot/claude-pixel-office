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
  const S = A.sprites;
  const img = (h, x, y, w, hh, c = '') => `<g${x || y ? ` transform="translate(${x} ${y})"` : ''}${c ? ` class="${c}"` : ''}>${h}</g>`;
  const rect = (x, y, w, h, f, c = '', o) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"${o != null ? ` opacity="${o}"` : ''}${c ? ` class="${c}"` : ''}/>`;
  const G = (i, a = '') => `<g${a ? ' ' + a : ''}>${i}</g>`;
  const shadowE = (x, y, rx = 6) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="1.6" fill="#000" opacity=".28"/>`;
  // actor: mode idle | sleepy | type | worriedType | happy | wave | worried
  const actor = (who, x, y, mode, shadow) => {
    const c = S[who]; let b;
    if (mode === 'type') b = img(c.type1, 0, 0, 16, 24, 'fa') + img(c.type2, 0, 0, 16, 24, 'fb');
    else if (mode === 'worriedType') b = img(c.typeW1, 0, 0, 16, 24, 'fa') + img(c.typeW2, 0, 0, 16, 24, 'fb') + G(rect(14, 4, 1, 2, '#81D4FA') + rect(14, 6, 1, 1, '#B3E5FC'), 'class="sweat"');
    else if (mode === 'wave') b = img(c.wave1, 0, 0, 16, 24, 'fa slow') + img(c.wave2, 0, 0, 16, 24, 'fb slow');
    else if (mode === 'sleepy') b = img(c.sleepy, 0, 0, 16, 24);
    else if (mode === 'happy') b = img(c.happy, 0, 0, 16, 24);
    else if (mode === 'worried') b = img(c.worried, 0, 0, 16, 24) + G(rect(14, 4, 1, 2, '#81D4FA'), 'class="sweat"');
    else b = img(c.normal, 0, 0, 16, 24) + img(c.blink, 0, 0, 16, 24, 'blink');
    return G((shadow ? shadowE(8, 24) : '') + G(b, `class="${mode === 'type' || mode === 'worriedType' ? 'bobf' : mode === 'sleepy' ? 'breath' : 'bob'}"`), `transform="translate(${x} ${y})"`);
  };
  // walker: follows a waypoint path [[t%, x, y], ...]; walks between points, stands (blinks) at pauses, faces its way
  let pathCss = '';
  const walker = (who, name, pts, secs, carry = '', mood = '') => {
    const c = S[who];
    const pos = pts.map(([t, x, y]) => `${t}%{transform:translate(${x}px,${y}px)}`).join('');
    const mv = [], sv = [], fc = [];
    for (let i = 0; i < pts.length; i++) {
      const [t, x, y] = pts[i], n = pts[i + 1];
      const moving = n && (n[1] !== x || n[2] !== y), left = n && n[1] < x;
      mv.push(`${t}%{opacity:${moving ? 1 : 0}}`); sv.push(`${t}%{opacity:${moving ? 0 : 1}}`);
      if (n && n[1] !== x) fc.push(`${t}%{transform:${left ? 'matrix(-1,0,0,1,16,0)' : 'none'}}`);
    }
    pathCss += `.p-${name}{animation:P${name} ${secs}s linear infinite}@keyframes P${name}{${pos}}`
      + `.m-${name}{animation:M${name} ${secs}s step-end infinite}.s-${name}{animation:S${name} ${secs}s step-end infinite}@keyframes S${name}{${sv.join('')}}`
      + `@keyframes M${name}{${mv.join('')}}.f-${name}{animation:F${name} ${secs}s step-end infinite}@keyframes F${name}{${fc.join('')}}`;
    const face = mood === 'happy' ? c.happy : mood === 'worried' ? c.worried : c.normal;
    const walking = G(img(c.walkA, 0, 0, 16, 24, 'fa') + img(c.walkB, 0, 0, 16, 24, 'fb'), `class="m-${name}"`);
    const standing = G(img(face, 0, 0, 16, 24), `class="s-${name} stand"`);
    const sweat = mood === 'worried' ? G(rect(14, 4, 1, 2, '#81D4FA') + rect(14, 6, 1, 1, '#B3E5FC'), 'class="sweat"') : '';
    return G(shadowE(8, 24) + G(G(walking + standing + carry + sweat, `class="f-${name}"`), 'class="bobf"'), `class="p-${name}"`);
  };
  // work effects for the room that is active
  const workGlow = (x, y, w, h) => rect(x, y, w, h, '#FFF59D', 'workglow', 0);
  const glyphs = (x, y, col = '#B9FFE9') => [0, 1, 2, 3].map(i => rect(x + i * 3, y, 1.5, 1.5, col, `rise r${i}`, 0)).join('');
  const gear = (x, y) => G(G(rect(-1, -4, 2, 8, '#FFD54F') + rect(-4, -1, 8, 2, '#FFD54F') + `<rect x="-2.5" y="-2.5" width="5" height="5" fill="#FFB300" transform="rotate(45)"/>` + rect(-1, -1, 2, 2, '#5D4037'), 'class="spin"'), `transform="translate(${x} ${y})"`);
  const taps = (x, y) => [0, 1, 2].map(i => rect(x + i * 4, y, 1, 1, '#FFFFFF', `tap t${i}`, 0)).join('');
  const puff = '';
  const bubble = (k, x, y) => G(img(S['b_' + k], x, y, 16, 16), `class="${k === 'err' ? 'shake' : 'pop'}"`);
  const zz = (x, y) => ['z', 'z', 'Z'].map((t, i) => G(`<text x="${x + i * 3}" y="${y - i * 3}" font-family="Consolas,monospace" font-size="${5 + i}" font-weight="700" fill="#E3F2FD" stroke="#2A1E1E" stroke-width=".7" paint-order="stroke">${t}</text>`, `class="zz" style="animation-delay:${i * .8}s"`)).join('');
  const tag = (x, y, t, on, col) => {
    const w = [...t].length * 2.85 + 9;
    return rect(x - .5, y - .5, w + 1, 9, '#2A1E1E') + rect(x, y, w, 8, col) + rect(x, y, w, 1, '#FFFFFF', '', .25) + rect(x + 2, y + 2.5, 3, 3, on ? '#7CFFB2' : '#8A94A0', on ? 'led' : '')
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
  const bossMode = done ? 'wave' : st.approval ? 'worried' : 'idle';
  mid += actor('boss', 211, 70, bossMode);
  front += screen(206, 80, 14, 8, true) ;
  if (st.approval) { top += rect(240, 86, 12, 6, '#FFB74D', 'glowp', .4) + bubble('wait', 223, 50); }
  if (done) top += bubble('ok', 223, 50) + G([['#FFD54F', 180], ['#FF8A80', 196], ['#81D4FA', 214], ['#A5D6A7', 232], ['#CE93D8', 248], ['#FFD54F', 120], ['#FF8A80', 60], ['#81D4FA', 20]].map(([c, x], i) => rect(x, 0, 2, 3, c, `conf k${i % 4}`)).join(''))
    + G([[200, 60], [238, 64], [206, 96], [244, 92]].map(([x, y], i) => `<path d="M${x} ${y - 3}v6M${x - 3} ${y}h6" stroke="#FFF59D" stroke-width="1" class="spark s${i % 2}"/>`).join(''));
  back += tag(224, 112, 'Chủ tịch', st.approval || done, '#7A4A2E');
  // ---------- Opus / plan ----------
  const opusOn = at('plan') || (at('research') && st.bench === 'all-opus');
  if (opusOn) {
    mid += actor('opus', 36, 78, err ? 'worriedType' : 'type');
    if (!err) top += gear(44, 72) + taps(40, 98);
    under += workGlow(0, 44, 84, 84);
  } else walk += walker('opus', 'opusIdle', [[0, 36, 70], [18, 36, 70], [36, 56, 50], [62, 56, 50], [80, 36, 70], [100, 36, 70]], 14, '', done || past('plan') ? 'happy' : '');
  front += screen(21, 82, 16, 9, opusOn, err ? 'err' : 'ok') + screen(53, 82, 16, 9, opusOn, err ? 'err' : 'ok');
  if (opusOn && !err) top += glyphs(24, 80, '#D1C4E9') + glyphs(56, 80, '#D1C4E9');
  for (let i = 0; i < 4; i++) back += rect(26, 9 + i * 3, Math.round(Math.max(0, Math.min(1, st.plan * 4 - i)) * 30), 1.5, '#7E57C2', opusOn && i === Math.min(3, Math.floor(st.plan * 4)) ? 'led' : '');
  if (opusOn && err) { top += bubble('err', 46, 60); under += zoneAlarm(0, 44, 84, 84); }
  back += tag(4, 118, cut(L.plan), opusOn, '#5E35B1');
  // ---------- Sonnet / research ----------
  const res = at('research');
  if (res) { walk += walker('sonnet', 'res', [[0, 124, 52], [10, 124, 52], [36, 100, 42], [62, 100, 42], [90, 124, 52], [100, 124, 52]], 9, G(img(S.book, 12, 11, 6, 6), 'class="book"'), err ? 'worried' : ''); under += workGlow(88, 44, 82, 84); if (!err) top += glyphs(140, 80) + G(rect(101, 30, 2, 2, '#FFF59D') + rect(122, 22, 2, 2, '#FFF59D'), 'class="spark"'); }
  else walk += walker('sonnet', 'sonIdle', [[0, 118, 70], [15, 118, 70], [38, 146, 48], [66, 146, 48], [88, 118, 70], [100, 118, 70]], 16, '', done || past('research') ? 'happy' : '');
  front += screen(137, 82, 16, 9, res, err ? 'err' : 'ok');
  back += rect(92, 66, Math.round(42 * (past('research') ? 1 : res ? st.research : 0)), 1.5, '#26A69A');
  if (res && err) { top += bubble('err', 126, 30); under += zoneAlarm(88, 44, 82, 84); }
  back += tag(92, 118, cut(L.research), res, '#00796B');
  // ---------- build / render ----------
  const rOn = at('render'), rp = past('render') ? 1 : rOn ? st.render : 0;
  for (const x0 of [4, 26]) for (let j = 0; j < 8; j++) back += rect(x0 + 3, 180 + j * 6, 1.5, 1.5, rOn ? (err && j % 3 === 0 ? '#FF5252' : '#69F0AE') : '#33404C', rOn ? `led l${(j + x0) % 3}` : '') + rect(x0 + 6, 180 + j * 6, 1.5, 1.5, rOn ? '#FFD54F' : '#33404C', rOn ? `led l${(j + x0 + 1) % 3}` : '');
  back += rect(4, 229.5, 42, 3, '#10161B') + rect(5, 230.5, Math.round(40 * rp), 1, err && rOn ? '#FF5252' : '#69F0AE');
  if (rOn) {
    mid += actor('tech', 58, 186, err ? 'worriedType' : 'type', true);
    under += workGlow(0, 168, 84, 88);
    if (!err) top += gear(66, 182) + taps(58, 207) + [8, 18, 30, 40].map((x, i) => rect(x, 170, 1, 3, '#B3E5FC', `heat h${i % 3}`, 0)).join('');
  } else walk += walker('tech', 'techIdle', [[0, 20, 206], [20, 20, 206], [45, 58, 206], [70, 58, 206], [92, 20, 206], [100, 20, 206]], 15, '', done || past('render') ? 'happy' : '');
  front += screen(56, 197, 14, 8, rOn, err ? 'err' : 'ok');
  if (rOn && !err) top += glyphs(58, 196);
  if (rOn && err) { top += bubble('err', 70, 168); under += zoneAlarm(0, 168, 84, 88); }
  back += tag(3, 247, cut(L.build, 13) + (rOn ? ` ${Math.round(rp * 100)}%` : ''), rOn, '#37474F');
  // ---------- QA / check ----------
  const qOn = at('qa');
  if (qOn) { walk += walker('qa', 'qa', [[0, 126, 188], [10, 126, 188], [40, 102, 188], [64, 102, 188], [92, 126, 188], [100, 126, 188]], 8, img(S.clip, -3, 11, 6, 8), err ? 'worried' : ''); under += workGlow(88, 168, 80, 88); if (!err) top += [0, 1, 2, 3, 4].map(i => rect(98, 177 + i * 3, 2, 2, '#43A047', `chk c${i}`, 0)).join(''); }
  else walk += walker('qa', 'qaIdle', [[0, 124, 190], [14, 124, 190], [32, 100, 190], [50, 100, 190], [68, 146, 196], [84, 146, 196], [100, 124, 190]], 18, '', done || past('qa') ? 'happy' : '');
  front += screen(109, 206, 16, 9, qOn, err ? 'err' : 'ok') + screen(139, 206, 16, 9, qOn, err ? 'err' : 'ok');
  if (qOn && err) { top += bubble('err', 112, 168); under += zoneAlarm(88, 168, 80, 88); }
  back += tag(106, 247, cut(L.check, 16), qOn, '#2E7D32');
  // ---------- store / courier ----------
  const fetch = at('inputs'), deliver = at('deliver');
  if (fetch) { walk += walker('courier', 'fetch', [[0, 190, 196], [5, 208, 196], [17, 208, 130], [40, 80, 130], [46, 80, 100], [56, 80, 100], [62, 80, 130], [85, 208, 130], [96, 208, 196], [100, 190, 196]], 16, img(S.crate, -5, 11, 10, 9), err ? 'worried' : ''); under += workGlow(172, 168, 84, 88); }
  else if (deliver) { walk += walker('courier', 'deliver', [[0, 190, 196], [8, 208, 196], [26, 208, 130], [36, 208, 100], [58, 208, 100], [68, 208, 130], [90, 208, 196], [100, 190, 196]], 11, img(S.reel, -5, 10, 10, 10), err ? 'worried' : ''); under += workGlow(172, 44, 84, 84); }
  else walk += walker('courier', 'courIdle', [[0, 188, 196], [16, 188, 196], [40, 214, 200], [62, 214, 200], [86, 188, 196], [100, 188, 196]], 13, '', done ? 'happy' : '');
  if ((fetch || deliver) && err) { top += bubble('err', 214, 170); under += zoneAlarm(172, 168, 84, 88); }
  back += tag(176, 247, cut(deliver ? L.deliver : L.fetch, 15), fetch || deliver, '#8D6234');
  // ---------- ambience ----------
  if (!st0.lite) mid += actor('guest', 48, 50, done ? 'happy' : 'idle', true) + G(rect(60, 63, 3, 4, '#FFFFFF') + rect(60, 63, 3, 1, '#4FC3F7'), 'class="sip"');
  if (!st0.lite) mid += G(img(S.cat, 0, 0, 18, 10), 'transform="translate(132 140)"') + G(rect(147, 141, 2, 2, '#F57C00'), 'class="tail"') + G(`<text x="150" y="139" font-family="Consolas" font-size="4" fill="#E3F2FD" stroke="#2A1E1E" stroke-width=".5" paint-order="stroke">z</text>`, 'class="zz"');
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
.chk{animation:chk 5s steps(1) infinite}.c1{animation-delay:.8s}.c2{animation-delay:1.6s}.c3{animation-delay:2.4s}.c4{animation-delay:3.2s}@keyframes chk{0%{opacity:0}15%,90%{opacity:1}}` + pathCss;
  const open = (px) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" shape-rendering="crispEdges" width="${px}" height="${px}">`;
  return { full: (px = 512) => open(px) + `<style>${css}</style>${A.bg}${under}${back}${mid}${A.fg}${front}${walk}${top}</svg>`, bg: (px = 512) => open(px) + A.bg + '</svg>', scene: (px = 512) => open(px) + `<style>${css}</style>${under}${back}${mid}${A.fg}${front}${walk}${top}</svg>` };
}
