/* Núcleo de lógica (sem DOM): sorteios, calendário, classificação, relógio, sanções. */
(function (root) {
'use strict';
const LET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const defaultRules = () => ({ halfMin: 20, winPts: 3, drawPts: 1, yellowLimit: 3, redBan: 1 });
const isDone = m => m.status === 'done';
const byLevelDesc = arr => shuffle(arr).sort((a, b) => (b.level || 3) - (a.level || 3));

/* ---------- Sorteios ---------- */
function drawGroups(teams, G, method, manual) {
  const groups = Array.from({ length: G }, () => []); const steps = [];
  const put = (t, g) => { groups[g].push(t.id); steps.push({ team: t.id, g }); };
  if (method === 'manual') { teams.forEach(t => put(t, manual && manual[t.id] != null ? +manual[t.id] : 0)); return { groups, steps }; }
  if (method === 'random') { shuffle(teams).forEach((t, i) => put(t, i % G)); return { groups, steps }; }
  const sorted = byLevelDesc(teams);
  if (method === 'snake') {
    sorted.forEach((t, i) => { const r = Math.floor(i / G), k = i % G; put(t, r % 2 ? G - 1 - k : k); });
    return { groups, steps };
  }
  // potes: cada pote tem G equipas de nível semelhante; cada grupo recebe uma por pote
  for (let p = 0; p < sorted.length; p += G) {
    const pot = shuffle(sorted.slice(p, p + G)); const order = shuffle([...Array(G).keys()]);
    pot.forEach((t, i) => put(t, order[i]));
  }
  return { groups, steps };
}

function roundRobin(ids, legs) {
  const t = ids.slice(); if (t.length % 2) t.push(null);
  const n = t.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const rm = [];
    for (let i = 0; i < n / 2; i++) {
      const a = t[i], b = t[n - 1 - i];
      if (a && b) rm.push((r + i) % 2 ? [b, a] : [a, b]);
    }
    rounds.push(rm);
    t.splice(1, 0, t.pop());
  }
  if (legs === 2) return rounds.concat(rounds.map(rm => rm.map(([a, b]) => [b, a])));
  return rounds;
}

const koSize = n => { let s = 1; while (s < n) s *= 2; return s; };
function bracketOrder(s) { let o = [1]; while (o.length < s) { const n = o.length * 2; o = o.flatMap(x => [x, n + 1 - x]); } return o; }
function koPairs(seeded) {
  const s = Math.max(2, koSize(seeded.length)); const seeds = seeded.slice(); while (seeds.length < s) seeds.push(null);
  const o = bracketOrder(s), pairs = [];
  for (let k = 0; k < s / 2; k++) pairs.push([seeds[o[2 * k] - 1], seeds[o[2 * k + 1] - 1]]);
  return pairs;
}
function roundName(teams) {
  return { 2: 'Final', 4: 'Meias-finais', 8: 'Quartos de final', 16: 'Oitavos de final' }[teams] || 'Ronda de ' + teams;
}

function makeDraw(comp, teams, method, manual) {
  const ids = teams.map(t => t.id);
  if (comp.format === 'league') { const o = shuffle(ids); return { groups: [o], steps: o.map(id => ({ team: id, g: 0 })) }; }
  if (comp.format === 'groups') return drawGroups(teams, comp.G, method, manual);
  if (comp.format === 'swiss') {
    const o = method === 'seeded' ? byLevelDesc(teams).map(t => t.id) : shuffle(ids);
    return { groups: [o], steps: o.map(id => ({ team: id, g: 0 })) };
  }
  if (comp.format === 'ko') {
    let order;
    if (method === 'seeded') order = byLevelDesc(teams).map(t => t.id);
    else if (method === 'pots') { const s = byLevelDesc(teams), h = Math.ceil(s.length / 2); order = shuffle(s.slice(0, h)).concat(shuffle(s.slice(h))).map(t => t.id); }
    else order = shuffle(ids);
    const pairs = koPairs(order); const steps = [];
    pairs.forEach((p, k) => p.forEach(id => id && steps.push({ team: id, g: k })));
    return { groups: pairs.map(p => p.filter(Boolean)), pairs, steps };
  }
  return { groups: [ids], steps: [] };
}

/* ---------- Jogos ---------- */
function newMatch(o) {
  return Object.assign({ id: uid(), home: null, away: null, hg: 0, ag: 0, status: 'sched', events: [], timer: { phase: 'pre', acc: 0, running: false, startedAt: 0 }, bye: false, manual: false, pen: null, date: '', place: '', doneAt: 0, round: 1, stage: '', group: null, ko: false }, o);
}
function genLeague(c, groups) {
  const per = groups.map(g => roundRobin(g, c.legs || 1));
  const maxR = Math.max(0, ...per.map(r => r.length)); const out = [];
  for (let r = 0; r < maxR; r++) per.forEach((rounds, g) => {
    (rounds[r] || []).forEach(([h, a]) => out.push(newMatch({ home: h, away: a, round: r + 1, group: g, stage: groups.length > 1 ? `Grupo ${LET[g]} · Jornada ${r + 1}` : `Jornada ${r + 1}` })));
  });
  return out;
}
function genKORound(c, pairs) {
  const round = Math.max(0, ...c.matches.filter(m => m.ko).map(m => m.round)) + 1;
  const stage = roundName(pairs.length * 2);
  pairs.forEach(([h, a]) => {
    if (!h && a) { h = a; a = null; }
    const bye = !a;
    c.matches.push(newMatch({ home: h, away: a, round, ko: true, stage, bye, status: bye ? 'done' : 'sched', doneAt: bye ? Date.now() : 0 }));
  });
}
function swissFirst(c, order) {
  const h = Math.floor(order.length / 2); const round = 1;
  for (let i = 0; i < h; i++) c.matches.push(newMatch({ home: order[i], away: order[i + h], round, stage: 'Ronda 1' }));
  if (order.length % 2) c.matches.push(newMatch({ home: order[order.length - 1], away: null, bye: true, status: 'done', doneAt: Date.now(), round, stage: 'Ronda 1' }));
}
function swissNext(c) {
  const round = Math.max(0, ...c.matches.map(m => m.round)) + 1;
  const st = standings(c.teamIds, c.matches, c.rules, deductions(c));
  const pts = {}; st.forEach(t => pts[t.id] = t.pts);
  let order = shuffle(c.teamIds).sort((a, b) => pts[b] - pts[a]);
  const played = new Set(), hadBye = new Set();
  c.matches.forEach(m => { if (m.bye) hadBye.add(m.home); else { played.add(m.home + '|' + m.away); played.add(m.away + '|' + m.home); } });
  let bye = null;
  if (order.length % 2) { bye = [...order].reverse().find(id => !hadBye.has(id)) || order[order.length - 1]; order = order.filter(id => id !== bye); }
  const left = order.slice(); const pairs = [];
  while (left.length) {
    const a = left.shift(); let k = left.findIndex(b => !played.has(a + '|' + b)); if (k < 0) k = 0;
    pairs.push([a, left.splice(k, 1)[0]]);
  }
  pairs.forEach(([h, a]) => c.matches.push(newMatch({ home: h, away: a, round, stage: 'Ronda ' + round })));
  if (bye) c.matches.push(newMatch({ home: bye, away: null, bye: true, status: 'done', doneAt: Date.now(), round, stage: 'Ronda ' + round }));
}
function applyDraw(c, draw) {
  c.matches = []; c.draw = draw;
  if (c.format === 'league' || c.format === 'groups') { c.groups = draw.groups; c.matches = genLeague(c, draw.groups); c.phase = 'groups'; }
  else if (c.format === 'ko') { c.groups = null; genKORound(c, draw.pairs); c.phase = 'ko'; }
  else if (c.format === 'swiss') { c.groups = draw.groups; swissFirst(c, draw.groups[0]); c.phase = 'swiss'; }
  c.status = 'running';
}

const score = m => {
  if (m.manual) return { h: +m.hg || 0, a: +m.ag || 0 };
  let h = 0, a = 0;
  (m.events || []).forEach(e => {
    if (e.type === 'goal') e.team === m.home ? h++ : a++;
    else if (e.type === 'own') e.team === m.home ? a++ : h++;
  });
  return { h, a };
};
function winner(m) {
  if (m.bye) return m.home;
  const s = score(m);
  if (s.h !== s.a) return s.h > s.a ? m.home : m.away;
  if (m.pen && m.pen.h !== m.pen.a) return m.pen.h > m.pen.a ? m.home : m.away;
  return null;
}

/* ---------- Classificação ---------- */
function deductions(c) { return (c.deductions || {}); }
function standings(ids, matches, rules, ded) {
  rules = rules || defaultRules(); ded = ded || {};
  const T = {}; ids.forEach(id => T[id] = { id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, ded: 0 });
  matches.forEach(m => {
    if (!isDone(m)) return;
    if (m.bye) { const h = T[m.home]; if (h) { h.p++; h.w++; h.pts += rules.winPts; } return; }
    const h = T[m.home], a = T[m.away]; if (!h || !a) return;
    const s = score(m); h.p++; a.p++; h.gf += s.h; h.ga += s.a; a.gf += s.a; a.ga += s.h;
    if (s.h > s.a) { h.w++; a.l++; h.pts += rules.winPts; }
    else if (s.h < s.a) { a.w++; h.l++; a.pts += rules.winPts; }
    else { h.d++; a.d++; h.pts += rules.drawPts; a.pts += rules.drawPts; }
  });
  const arr = Object.values(T);
  arr.forEach(t => { t.gd = t.gf - t.ga; t.ded = ded[t.id] || 0; t.pts -= t.ded; });
  arr.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);
  return arr;
}
function groupTables(c) {
  const ded = deductions(c);
  return (c.groups || []).map((ids, g) => standings(ids, c.matches.filter(m => !m.ko && m.group === g), c.rules, ded));
}

/* ---------- Fases seguintes ---------- */
const lastRound = ms => ms.reduce((a, m) => Math.max(a, m.round), 0);
function nextAction(c) {
  if (c.status !== 'running' || !c.matches.length) return null;
  const all = c.matches.every(isDone), fin = { kind: 'finish', label: 'Encerrar campeonato' };
  if (c.format === 'league' || c.format === 'friendly') return all ? fin : null;
  if (c.format === 'groups' && !c.matches.some(m => m.ko)) return all ? { kind: 'ko-start', label: 'Gerar eliminatórias' } : null;
  if (c.format === 'groups' || c.format === 'ko') {
    const km = c.matches.filter(m => m.ko), cur = km.filter(m => m.round === lastRound(km));
    if (!cur.every(isDone)) return null;
    if (cur.length === 1) return c.manual && !/(^|[^a-z])final($|[^a-z])/i.test(cur[0].stage) ? null : fin;
    return { kind: 'ko-next', label: 'Gerar ' + roundName(cur.length) };
  }
  if (c.format === 'swiss') {
    const lr = lastRound(c.matches); if (!c.matches.filter(m => m.round === lr).every(isDone)) return null;
    return lr >= c.rounds ? fin : { kind: 'swiss-next', label: 'Gerar ronda ' + (lr + 1) };
  }
  return null;
}
function qualifiers(c, mode) {
  const adv = c.adv || 2, q = [];
  groupTables(c).forEach((tab, g) => tab.slice(0, adv).forEach((t, pos) => q.push({ id: t.id, g, pos, pts: t.pts, gd: t.gd, gf: t.gf })));
  if (mode === 'random') {
    return shuffle(q).sort((a, b) => a.pos - b.pos);
  }
  return q.sort((a, b) => a.pos - b.pos || b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}
function fixSameGroup(pairs, gOf) {
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i]; if (!p[1] || gOf[p[0]] !== gOf[p[1]]) continue;
    for (let j = 0; j < pairs.length; j++) {
      if (j === i || !pairs[j][1]) continue; const q = pairs[j];
      if (gOf[p[0]] !== gOf[q[1]] && gOf[q[0]] !== gOf[p[1]]) { [p[1], q[1]] = [q[1], p[1]]; break; }
    }
  }
  return pairs;
}
function advance(c, kind, mode) {
  if (kind === 'ko-start') {
    const q = qualifiers(c, mode), gOf = {}; q.forEach(x => gOf[x.id] = x.g);
    genKORound(c, fixSameGroup(koPairs(q.map(x => x.id)), gOf)); c.phase = 'ko';
  } else if (kind === 'ko-next') {
    const km = c.matches.filter(m => m.ko), cur = km.filter(m => m.round === lastRound(km)); const w = cur.map(winner);
    const pairs = []; for (let i = 0; i < w.length; i += 2) pairs.push([w[i], w[i + 1]]);
    genKORound(c, pairs);
  } else if (kind === 'swiss-next') swissNext(c);
  else if (kind === 'finish') { c.status = 'finished'; c.phase = 'done'; }
}
function champion(c) {
  if (c.status !== 'finished') return null;
  if (c.format === 'league' || c.format === 'swiss') {
    const t = c.format === 'league' ? standings(c.teamIds, c.matches, c.rules, deductions(c)) : standings(c.teamIds, c.matches, c.rules, deductions(c));
    return t[0] ? t[0].id : null;
  }
  const km = c.matches.filter(m => m.ko || c.format === 'friendly');
  const last = km.filter(m => m.round === lastRound(km));
  return last.length === 1 ? winner(last[0]) : null;
}

/* ---------- Relógio ---------- */
const clockMs = (m, now) => { const t = m.timer; if (!t) return 0; return t.acc + (t.running ? (now || Date.now()) - t.startedAt : 0); };
const halfMs = c => c.rules.halfMin * 60000;
const T_ = {
  start(m) { m.status = 'live'; m.timer = { phase: 'h1', acc: 0, running: true, startedAt: Date.now() }; },
  pause(m) { const t = m.timer; if (t.running) { t.acc = clockMs(m); t.running = false; } },
  resume(m) { const t = m.timer; if (!t.running) { t.startedAt = Date.now(); t.running = true; } },
  half(m) { T_.pause(m); m.timer.phase = 'ht'; },
  second(m, c) { m.timer.phase = 'h2'; m.timer.acc = halfMs(c); m.timer.running = true; m.timer.startedAt = Date.now(); },
  end(m) { T_.pause(m); m.timer.phase = 'ft'; },
};
const pad = n => String(n).padStart(2, '0');
function fmtClock(ms, c, phase) {
  const lim = phase === 'h1' ? halfMs(c) : phase === 'h2' ? 2 * halfMs(c) : 0;
  const f = x => pad(Math.floor(x / 60000)) + ':' + pad(Math.floor(x / 1000) % 60);
  if (lim && ms > lim) return { main: f(lim), extra: '+' + f(ms - lim) };
  return { main: f(ms), extra: '' };
}
function eventLabel(ms, c, phase) {
  const min = Math.floor(ms / 60000) + 1, h = c.rules.halfMin;
  let label = String(min);
  if (phase === 'h1' && min > h) label = h + '+' + (min - h);
  else if (phase === 'h2' && min > 2 * h) label = 2 * h + '+' + (min - 2 * h);
  return { min, label };
}

/* ---------- Sanções ---------- */
function served(db, s) {
  if (s.type !== 'suspensao') return 0;
  const c = db.comps.find(x => x.id === s.compId); if (!c) return 0;
  const n = c.matches.filter(m => isDone(m) && !m.bye && (m.home === s.team || m.away === s.team) && m.doneAt > s.at && m.id !== s.matchId).length;
  return Math.min(n, s.games);
}
const remaining = (db, s) => s.type === 'suspensao' ? s.games - served(db, s) : 0;
function suspendedMap(db, compId) {
  const map = {};
  db.sanctions.forEach(s => {
    if (s.type !== 'suspensao' || !s.player) return; if (compId && s.compId !== compId) return;
    const r = remaining(db, s); if (r > 0) map[s.player] = { rem: r, reason: s.reason, comp: s.compId };
  });
  return map;
}
function regenAuto(db, c, m) {
  db.sanctions = db.sanctions.filter(s => !(s.auto && s.matchId === m.id));
  if (!isDone(m) || m.bye) return;
  const r = c.rules, now = m.doneAt || Date.now(); const mk = (e, games, reason) => ({ id: uid(), auto: true, matchId: m.id, compId: c.id, team: e.team, player: e.player, pname: e.pname, type: 'suspensao', games, reason, at: now });
  if (r.redBan > 0) m.events.filter(e => e.type === 'red').forEach(e => db.sanctions.push(mk(e, r.redBan, e.auto ? '2.º amarelo' : 'Cartão vermelho')));
  if (r.yellowLimit > 0) {
    const ys = m.events.filter(e => e.type === 'yellow' && e.player), per = {};
    ys.forEach(e => { (per[e.player] = per[e.player] || []).push(e); });
    Object.keys(per).forEach(pid => {
      const before = c.matches.filter(x => x.id !== m.id && isDone(x)).reduce((n, x) => n + x.events.filter(e => e.type === 'yellow' && e.player === pid).length, 0);
      per[pid].forEach((e, k) => { if ((before + k + 1) % r.yellowLimit === 0) db.sanctions.push(mk(e, 1, 'Acumulação de amarelos (' + (before + k + 1) + ')')); });
    });
  }
}
function recomputeDeductions(db, c) {
  const d = {}; db.sanctions.forEach(s => { if (s.compId === c.id && s.type === 'pontos') d[s.team] = (d[s.team] || 0) + (+s.points || 0); });
  c.deductions = d;
}
function playerStats(db, compId) {
  const st = {};
  db.comps.forEach(c => {
    if (compId && c.id !== compId) return;
    c.matches.forEach(m => m.events.forEach(e => {
      if (!e.player) return; const p = st[e.player] = st[e.player] || { g: 0, y: 0, r: 0 };
      if (e.type === 'goal') p.g++; else if (e.type === 'yellow') p.y++; else if (e.type === 'red') p.r++;
    }));
  });
  return st;
}

/* ---------- Sorteio de equipas (treino / pelada) ---------- */
function splitTeams(players, n, mode) {
  const teams = Array.from({ length: n }, () => ({ players: [], sum: 0 }));
  const add = (p, t) => { t.players.push(p); t.sum += p.level || 3; };
  let pool = shuffle(players);
  if (mode === 'random') { pool.forEach((p, i) => add(p, teams[i % n])); return teams; }
  const gks = pool.filter(p => p.pos === 'GR'), rest = pool.filter(p => p.pos !== 'GR');
  if (mode === 'gk') { gks.forEach((p, i) => add(p, teams[i % n])); }
  else rest.push(...gks);
  // equilibrado: do mais forte para o mais fraco, sempre para a equipa com menor soma (e menos jogadores)
  const pick = () => teams.reduce((b, c) => (c.players.length < b.players.length || (c.players.length === b.players.length && c.sum < b.sum)) ? c : b, teams[0]);
  rest.sort((a, b) => (b.level || 3) - (a.level || 3)).forEach(p => add(p, pick()));
  return teams;
}

const Core = { LET, uid, shuffle, defaultRules, isDone, drawGroups, roundRobin, koSize, bracketOrder, koPairs, roundName, makeDraw, newMatch, genLeague, genKORound, applyDraw, score, winner, standings, groupTables, nextAction, qualifiers, advance, champion, clockMs, halfMs, T: T_, fmtClock, eventLabel, served, remaining, suspendedMap, regenAuto, recomputeDeductions, playerStats, splitTeams, lastRound };
if (typeof module !== 'undefined' && module.exports) module.exports = Core; else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
