/* Interface — Campeonato Amador (PWA). Dados em localStorage. */
(function () {
'use strict';
const C = Core, KEY = 'campamador.v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = C.uid;

/* ---------- Dados ---------- */
let db = load();
function load() { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.teams) { d.sanctions = d.sanctions || []; d.trainings = d.trainings || []; d.comps = d.comps || []; return d; } } catch (e) {} return { v: 1, teams: [], comps: [], sanctions: [], trainings: [] }; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('⚠ Sem espaço para guardar!'); } }
const team = id => db.teams.find(t => t.id === id);
const tname = id => team(id) ? team(id).name : '—';
const comp = id => db.comps.find(c => c.id === id);
const player = (tid, pid) => { const t = team(tid); return t && t.players.find(p => p.id === pid); };
const dot = id => `<i class="dot" style="background:${team(id) ? team(id).color : '#777'}"></i>`;
const FMT = { league: 'Liga (pontos corridos)', groups: 'Fase de grupos + eliminatórias', ko: 'Eliminatória (mata-mata)', swiss: 'Sistema suíço', friendly: 'Jogo amistoso' };
const POS = ['GR', 'DEF', 'MED', 'ATA'];
const COLORS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#fb8c00', '#8e24aa', '#00acc1', '#ec407a', '#6d4c41', '#ffffff', '#212121', '#7cb342'];

/* ---------- Estado / navegação ---------- */
let S = { tab: 'comps', comp: null, ctab: 'jogos', match: null, team: null, train: null, sanf: 'act' };
let lastKey = '';
function nav(p) { Object.assign(S, p); history.pushState(JSON.parse(JSON.stringify(S)), ''); render(); $('#main').scrollTop = 0; }
window.addEventListener('popstate', e => { closeSheet(); if (e.state) { const ct = S.ctab, cp = S.comp; S = Object.assign(S, e.state); if (S.comp && S.comp === cp) S.ctab = ct; } render(); });
history.replaceState(JSON.parse(JSON.stringify(S)), '');
const deep = () => (S.tab === 'comps' && (S.comp || S.match)) || (S.tab === 'teams' && S.team) || (S.tab === 'train' && S.train);

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400); }
function sheet(title, body, foot) {
  closeSheet(); const r = $('#sheet-root');
  r.innerHTML = `<div class="back" data-a="sclose"></div><div class="sheet"><div class="sh-h"><b>${title}</b><button class="x" data-a="sclose">✕</button></div><div class="sh-b">${body}</div>${foot ? `<div class="sh-f">${foot}</div>` : ''}</div>`;
  r.classList.add('on');
}
function closeSheet() { const r = $('#sheet-root'); r.classList.remove('on'); r.innerHTML = ''; clearInterval(tt.iv); tt.run = false; }
const val = id => { const e = $('#sheet-root #' + id); return e ? e.value.trim() : ''; };
const num = (id, d) => { const n = parseFloat(val(id)); return isNaN(n) ? d : n; };
const empty = (i, t, s) => `<div class="empty"><div class="big">${i}</div><div class="b">${t}</div><div class="sm">${s || ''}</div></div>`;
const fld = (l, inner) => `<label class="f">${l}${inner}</label>`;
const opts = (arr, sel) => arr.map(([v, l]) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');
const today = () => new Date().toISOString().slice(0, 10);
const fdate = d => d ? d.split('-').reverse().join('/') : '';

/* ---------- Render ---------- */
function render() {
  const key = JSON.stringify(S), m = $('#main'), st = m.scrollTop;
  $('#top').innerHTML = topbar(); m.innerHTML = view(); $('#nav').innerHTML = navbar();
  if (key === lastKey) m.scrollTop = st; lastKey = key; tick();
}
function topbar() {
  const t = { comps: '🏆 Campeonatos', teams: '👥 Equipas', train: '🏃 Treinos', sanc: '🟥 Sanções' }[S.tab];
  let title = t;
  if (S.tab === 'comps' && S.match) { const c = comp(S.comp); title = c ? c.name : t; }
  else if (S.tab === 'comps' && S.comp) { const c = comp(S.comp); title = c ? c.name : t; }
  else if (S.tab === 'teams' && S.team) title = tname(S.team);
  else if (S.tab === 'train' && S.train) title = 'Treino';
  return `${deep() ? '<button data-a="back">←</button>' : ''}<h1>${esc(title)}</h1><button data-a="data" title="Dados">⚙</button>`;
}
function navbar() {
  return [['comps', '🏆', 'Campeonatos'], ['teams', '👥', 'Equipas'], ['train', '🏃', 'Treinos'], ['sanc', '🟥', 'Sanções']]
    .map(([k, i, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-a="tab" data-k="${k}"><span>${i}</span>${l}</button>`).join('');
}
function view() {
  if (S.tab === 'comps') return S.match ? vMatch() : S.comp ? vComp() : vComps();
  if (S.tab === 'teams') return S.team ? vTeam() : vTeams();
  if (S.tab === 'train') return S.train ? vTrain() : vTrains();
  return vSanc();
}

/* ======================= EQUIPAS ======================= */
function vTeams() {
  let h = `<div class="bar"><button class="btn pri" data-a="team-new">＋ Nova equipa</button><button class="btn" data-a="team-bulk" style="width:auto">Várias</button></div>`;
  if (!db.teams.length) return h + empty('👥', 'Sem equipas', 'Registe as equipas e os seus jogadores. Use "Várias" para colar uma lista de nomes.');
  const sus = C.suspendedMap(db);
  db.teams.forEach(t => {
    const ns = t.players.filter(p => sus[p.id]).length;
    h += `<div class="card tap row" data-a="team-open" data-id="${t.id}"><i class="dot" style="background:${t.color};width:26px;height:26px"></i><div class="sp"><div class="b ell">${esc(t.name)}</div><div class="sm mut">${t.players.length} jogadores · nível ${'★'.repeat(t.level || 3)}</div></div>${ns ? `<span class="badge r">${ns} suspenso${ns > 1 ? 's' : ''}</span>` : ''}<span class="mut">›</span></div>`;
  });
  return h;
}
function teamForm(t) {
  t = t || { name: '', color: COLORS[db.teams.length % COLORS.length], level: 3 };
  sheet(t.id ? 'Editar equipa' : 'Nova equipa',
    fld('Nome', `<input id="tf-n" value="${esc(t.name)}" maxlength="40">`) +
    fld('Cor', `<input id="tf-c" type="color" value="${t.color}" style="height:46px;padding:3px">`) +
    fld('Nível / força (para sorteios por potes)', `<select id="tf-l">${opts([1, 2, 3, 4, 5].map(n => [n, '★'.repeat(n) + ' ' + ['', 'fraca', 'média-baixa', 'média', 'forte', 'muito forte'][n]]), String(t.level || 3))}</select>`),
    `<button class="btn pri" data-a="team-save" data-id="${t.id || ''}">Guardar</button>`);
}
function vTeam() {
  const t = team(S.team); if (!t) return empty('?', 'Equipa não encontrada');
  const st = C.playerStats(db), sus = C.suspendedMap(db);
  let h = `<div class="card row"><i class="dot" style="background:${t.color};width:34px;height:34px"></i><div class="sp"><div class="b">${esc(t.name)}</div><div class="sm mut">Nível ${'★'.repeat(t.level || 3)}</div></div><button class="btn sm" data-a="team-edit" data-id="${t.id}">✏️ Editar</button></div>`;
  h += `<div class="bar"><button class="btn pri" data-a="pl-new">＋ Jogador</button><button class="btn" data-a="pl-bulk" style="width:auto">Vários</button></div>`;
  if (!t.players.length) h += empty('🧢', 'Sem jogadores', 'Adicione jogadores — são necessários para golos, cartões e sanções.');
  t.players.slice().sort((a, b) => (+a.num || 999) - (+b.num || 999)).forEach(p => {
    const s = st[p.id] || { g: 0, y: 0, r: 0 }, u = sus[p.id];
    h += `<div class="card tap row" data-a="pl-edit" data-id="${p.id}"><span class="pill">${esc(p.num || '–')}</span><div class="sp"><div class="b ell">${esc(p.name)}</div><div class="sm mut">${p.pos || ''} · ${'★'.repeat(p.level || 3)}</div></div>${u ? `<span class="badge r">SUSPENSO ${u.rem}j</span>` : ''}<span class="sm">⚽${s.g} 🟨${s.y} 🟥${s.r}</span></div>`;
  });
  return h + `<button class="btn dng" data-a="team-del" data-id="${t.id}" style="margin-top:14px">Eliminar equipa</button>`;
}
function playerForm(p) {
  p = p || { name: '', num: '', pos: 'MED', level: 3 };
  sheet(p.id ? 'Editar jogador' : 'Novo jogador',
    fld('Nome', `<input id="pf-n" value="${esc(p.name)}" maxlength="40">`) +
    `<div class="grid2">${fld('Nº camisola', `<input id="pf-u" type="number" inputmode="numeric" value="${esc(p.num)}">`)}${fld('Posição', `<select id="pf-p">${opts(POS.map(x => [x, x]), p.pos)}</select>`)}</div>` +
    fld('Nível (para sorteio equilibrado)', `<select id="pf-l">${opts([1, 2, 3, 4, 5].map(n => [n, '★'.repeat(n)]), String(p.level || 3))}</select>`),
    (p.id ? `<button class="btn dng" data-a="pl-del" data-id="${p.id}" style="width:auto">🗑</button>` : '') + `<button class="btn pri" data-a="pl-save" data-id="${p.id || ''}">Guardar</button>`);
}

/* ======================= CAMPEONATOS ======================= */
function vComps() {
  let h = `<div class="bar"><button class="btn pri" data-a="comp-new">＋ Novo campeonato</button></div>`;
  if (!db.comps.length) return h + empty('🏆', 'Sem campeonatos', 'Registe as equipas e crie o primeiro campeonato: liga, grupos, mata-mata, suíço ou jogo amistoso.');
  db.comps.slice().reverse().forEach(c => {
    const d = c.matches.filter(C.isDone).length, ch = C.champion(c);
    h += `<div class="card tap" data-a="comp-open" data-id="${c.id}"><div class="row"><div class="sp"><div class="b ell">${esc(c.name)}</div><div class="sm mut">${FMT[c.format]} · ${c.teamIds.length} equipas</div></div><span class="badge ${c.status === 'running' ? 'ok' : ''}">${{ setup: 'Por sortear', running: 'A decorrer', finished: 'Terminado' }[c.status]}</span></div>${c.matches.length ? `<div class="sm mut" style="margin-top:6px">${d}/${c.matches.length} jogos${ch ? ' · 🏆 ' + esc(tname(ch)) : ''}</div>` : ''}</div>`;
  });
  return h;
}
function compForm() {
  if (db.teams.length < 2) { toast('Registe pelo menos 2 equipas primeiro'); return; }
  sheet('Novo campeonato',
    fld('Nome', `<input id="cn-n" placeholder="Ex.: Torneio de Verão" maxlength="50">`) +
    fld('Formato', `<select id="cn-f" data-c="cn-f">${opts(Object.entries(FMT), 'league')}</select>`) +
    `<div id="o-legs">${fld('Voltas', `<select id="cn-l">${opts([[1, 'Só ida'], [2, 'Ida e volta']], '1')}</select>`)}</div>` +
    `<div id="o-groups" style="display:none" class="grid2">${fld('Nº de grupos', `<input id="cn-g" type="number" min="2" max="8" value="2">`)}${fld('Passam por grupo', `<input id="cn-a" type="number" min="1" max="8" value="2">`)}</div>` +
    `<div id="o-swiss" style="display:none">${fld('Nº de rondas', `<input id="cn-r" type="number" min="2" max="15" value="4">`)}</div>` +
    `<h2>Regras de jogo e disciplina</h2><div class="grid2">${fld('Minutos por parte', `<input id="cn-h" type="number" min="5" max="60" value="20">`)}${fld('Amarelos p/ suspensão', `<input id="cn-y" type="number" min="0" max="10" value="3">`)}${fld('Jogos por vermelho', `<input id="cn-b" type="number" min="0" max="10" value="1">`)}${fld('Pts vitória / empate', `<input id="cn-w" value="3/1">`)}</div>` +
    `<h2>Equipas <button class="btn sm" data-a="cn-all" style="float:right;margin-top:-6px">Todas</button></h2>` +
    db.teams.map(t => `<label class="chk"><input type="checkbox" class="cn-t" value="${t.id}" checked> ${dot(t.id)} ${esc(t.name)}</label>`).join(''),
    `<button class="btn pri" data-a="comp-save">Criar</button>`);
}
function compFormToggle() {
  const f = val('cn-f'); const sh = (id, on) => { const e = $('#sheet-root #' + id); if (e) e.style.display = on ? '' : 'none'; };
  sh('o-legs', f === 'league' || f === 'groups'); sh('o-groups', f === 'groups'); sh('o-swiss', f === 'swiss');
}

function vComp() {
  const c = comp(S.comp); if (!c) return empty('?', 'Campeonato não encontrado');
  const ch = C.champion(c), na = C.nextAction(c);
  const tabs = [['jogos', 'Jogos'], ['tabela', c.format === 'ko' ? 'Quadro' : 'Classificação'], ['stats', 'Estatísticas'], ['cfg', 'Definições']];
  if (c.format !== 'friendly') tabs.unshift(['sorteio', '🎲 Sorteio']);
  if (c.status === 'setup' && c.format !== 'friendly') S.ctab = S.ctab === 'cfg' ? 'cfg' : 'sorteio';
  let h = ch ? `<div class="card c" style="border-color:var(--warn)"><div style="font-size:34px">🏆</div><div class="sm mut">Campeão</div><div class="b" style="font-size:20px">${esc(tname(ch))}</div></div>` : '';
  h += `<div class="tabs">${tabs.map(([k, l]) => `<button class="${S.ctab === k ? 'on' : ''}" data-a="ctab" data-k="${k}">${l}</button>`).join('')}</div>`;
  if (na) h += `<div class="card row" style="border-color:var(--ac)"><div class="sp b">✅ Fase concluída</div><button class="btn pri sm" data-a="advance" data-k="${na.kind}">${na.label}</button></div>`;
  if (S.ctab === 'sorteio') return h + tDraw(c);
  if (S.ctab === 'tabela') return h + tTable(c);
  if (S.ctab === 'stats') return h + tStats(c);
  if (S.ctab === 'cfg') return h + tCfg(c);
  return h + tGames(c);
}

/* ----- Sorteio ----- */
const METHODS = {
  league: [['random', 'Aleatório']],
  groups: [['random', 'Aleatório'], ['pots', 'Por potes (nível)'], ['snake', 'Serpentina (nível)'], ['manual', 'Manual']],
  ko: [['random', 'Aleatório'], ['seeded', 'Cabeças de série (1.º vs último)'], ['pots', 'Potes (fortes vs fracos)']],
  swiss: [['random', 'Aleatório'], ['seeded', 'Por nível']],
};
const METHOD_INFO = {
  random: 'As equipas saem do "chapéu" sem qualquer critério.',
  pots: 'Equipas divididas em potes por nível; cada grupo (ou jogo) recebe uma de cada pote.',
  snake: 'Ordena por nível e distribui em serpentina (A,B,C,C,B,A…) para grupos equilibrados.',
  manual: 'Escolha o grupo de cada equipa à mão.',
  seeded: 'O mais forte defronta o mais fraco; as equipas melhor cotadas ficam com as folgas quando o número é ímpar.',
};
function drawLabel(c, g) { return c.format === 'groups' ? 'Grupo ' + C.LET[g] : c.format === 'ko' ? 'Jogo ' + (g + 1) : 'Ordem'; }
function drawBoard(c, d) {
  if (c.format === 'ko') return d.groups.map((g, i) => `<div class="card"><div class="sm mut">Jogo ${i + 1}</div><div class="b">${g.map(id => dot(id) + ' ' + esc(tname(id))).join(' <span class="mut">vs</span> ')}${g.length < 2 ? ' <span class="badge">folga</span>' : ''}</div></div>`).join('');
  if (c.format === 'groups') return `<div class="gboard">${d.groups.map((g, i) => `<div class="g"><b>Grupo ${C.LET[i]}</b>${g.map(id => `<div>${dot(id)} ${esc(tname(id))}</div>`).join('')}</div>`).join('')}</div>`;
  return `<div class="card">${d.groups[0].map((id, i) => `<div class="chk"><span class="pill">${i + 1}</span> ${dot(id)} ${esc(tname(id))}</div>`).join('')}</div>`;
}
function tDraw(c) {
  if (c.status !== 'setup') {
    return `<div class="card sm mut">Sorteio realizado. Os jogos já foram gerados.</div>` + (c.draw ? drawBoard(c, c.draw) : '') + `<button class="btn dng" data-a="draw-redo" style="margin-top:8px">↺ Refazer sorteio (apaga os jogos)</button>`;
  }
  const ms = METHODS[c.format], m = S.dm && ms.some(x => x[0] === S.dm) ? S.dm : ms[0][0];
  let h = `<div class="card row" style="border-color:var(--warn)"><div class="sp sm">Sorteio feito noutro lado? Insira os grupos${c.format === 'groups' ? '' : ' e jogos'} à mão.</div><button class="btn sm" data-a="draw-ext">✍️ Inserir à mão</button></div><h2>Tipo de sorteio</h2><div class="chips">${ms.map(([k, l]) => `<button class="chip ${m === k ? 'on' : ''}" data-a="dm" data-k="${k}">${l}</button>`).join('')}</div><div class="sm mut" style="margin-bottom:10px">${METHOD_INFO[m] || ''}</div>`;
  if (m === 'manual') {
    S.manual = S.manual || {};
    h += c.teamIds.map(id => `<div class="chk">${dot(id)} <span class="sp">${esc(tname(id))}</span><select data-c="man" data-id="${id}" style="padding:8px;border-radius:8px;background:var(--bg);color:var(--txt);border:1px solid var(--line)">${Array.from({ length: c.G }, (_, g) => `<option value="${g}"${(S.manual[id] || 0) == g ? ' selected' : ''}>Grupo ${C.LET[g]}</option>`).join('')}</select></div>`).join('');
    return h + `<button class="btn pri" data-a="draw-manual" style="margin-top:12px">Confirmar grupos e gerar jogos automáticos</button><button class="btn" data-a="groups-only" style="margin-top:8px">Só definir os grupos (vou inserir os jogos à mão)</button>`;
  }
  h += `<div class="bar"><button class="btn" data-a="draw-do">🎲 Sortear</button><button class="btn pri" data-a="draw-live">🎬 Sorteio ao vivo</button></div>`;
  const d = S.draw && S.draw.comp === c.id ? S.draw : null;
  if (d) h += `<h2>Resultado do sorteio</h2>` + drawBoard(c, d) + `<div class="bar"><button class="btn" data-a="draw-do">↺ Repetir</button><button class="btn pri" data-a="draw-ok">✔ Confirmar e gerar jogos</button></div>`;
  else h += `<div class="sm mut c" style="padding:18px">Sorteie para ver o resultado — só é guardado quando confirmar.</div>`;
  return h;
}
function teamsForDraw(c) { return c.teamIds.map(id => ({ id, level: (team(id) || {}).level || 3 })); }
function runDraw(c) { const m = S.dm && METHODS[c.format].some(x => x[0] === S.dm) ? S.dm : METHODS[c.format][0][0]; S.draw = Object.assign({ comp: c.id }, C.makeDraw(c, teamsForDraw(c), m)); return S.draw; }
function liveDraw(c, d) {
  const ov = document.createElement('div'); ov.className = 'live';
  const shown = d.groups.map(() => []); let i = 0, iv = null, to = null, skipped = false;
  const nm = id => tname(id);
  const board = () => { $('.gb', ov).innerHTML = d.groups.map((_, g) => `<div class="g"><b>${drawLabel(c, g)}</b>${shown[g].map(id => `<div>${dot(id)} ${esc(nm(id))}</div>`).join('')}</div>`).join(''); };
  ov.innerHTML = `<div class="row"><b class="sp" style="font-size:18px">🎬 Sorteio — ${esc(c.name)}</b><button class="btn sm" data-live="skip">Saltar ⏭</button></div><div class="slot" id="slot">…</div><div class="gboard gb"></div><button class="btn pri" id="lv-ok" style="display:none;margin-top:14px">Concluir</button>`;
  document.body.appendChild(ov); board();
  const end = () => { clearInterval(iv); clearTimeout(to); $('#lv-ok', ov).style.display = ''; $('#slot', ov).textContent = '✔ Sorteio completo'; };
  function next() {
    if (skipped) return; if (i >= d.steps.length) return end();
    const st = d.steps[i], names = c.teamIds.map(nm); let n = 0; const slot = $('#slot', ov);
    iv = setInterval(() => {
      slot.textContent = names[Math.floor(Math.random() * names.length)];
      if (++n > 14) { clearInterval(iv); slot.textContent = nm(st.team); shown[st.g].push(st.team); i++; board(); if (navigator.vibrate) navigator.vibrate(30); to = setTimeout(next, 1000); }
    }, 70);
  }
  ov.addEventListener('click', e => {
    if (e.target.dataset.live === 'skip') { skipped = true; clearInterval(iv); clearTimeout(to); d.groups.forEach((g, k) => shown[k] = g.slice()); board(); end(); }
    if (e.target.id === 'lv-ok') { skipped = true; clearInterval(iv); clearTimeout(to); ov.remove(); S.draw = d; render(); }
  });
  setTimeout(next, 500);
}

/* ----- Jogos ----- */
function matchRow(c, m) {
  const s = C.score(m), live = m.status === 'live', done = C.isDone(m);
  if (m.bye) return `<div class="card row"><span class="sp">${dot(m.home)} <b>${esc(tname(m.home))}</b></span><span class="badge">folga · avança</span></div>`;
  const mid = m.status === 'sched' ? '<span class="mut">vs</span>' : `${s.h} - ${s.a}`;
  return `<div class="card tap" data-a="mopen" data-id="${m.id}"><div class="match" style="padding:0"><div class="tm a"><span class="ell b">${esc(tname(m.home))}</span>${dot(m.home)}</div><div class="score">${mid}</div><div class="tm">${dot(m.away)}<span class="ell b">${esc(tname(m.away))}</span></div></div><div class="sm mut c" style="margin-top:6px">${live ? '<span class="badge live">AO VIVO</span> ' : done ? '' : ''}${m.pen ? `(${m.pen.h}-${m.pen.a} g.p.) ` : ''}${m.date ? '📅 ' + fdate(m.date) + ' ' : ''}${m.place ? '📍 ' + esc(m.place) : ''}${m.status === 'sched' && !m.date && !m.place ? 'Por jogar' : ''}${done && !m.pen && !m.date && !m.place ? 'Terminado' : ''}</div></div>`;
}
function tGames(c) {
  if (!c.matches.length) return `<div class="bar"><button class="btn pri" data-a="mn-new">＋ Adicionar jogo à mão</button></div>` + empty('📅', 'Sem jogos', 'Faça o sorteio para gerar o calendário, ou insira os jogos à mão.');
  const f = S.gf || 'all'; let h = (c.status !== 'finished' ? `<div class="bar"><button class="btn sm" data-a="mn-new">＋ Adicionar jogo à mão</button></div>` : '') + `<div class="chips">${[['all', 'Todos'], ['todo', 'Por jogar'], ['done', 'Terminados']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-a="gf" data-k="${k}">${l}</button>`).join('')}</div>`;
  let last = null, any = false;
  c.matches.forEach(m => {
    if (f === 'todo' && C.isDone(m)) return; if (f === 'done' && !C.isDone(m)) return; any = true;
    if (m.stage !== last) { h += `<h2>${esc(m.stage)}</h2>`; last = m.stage; } h += matchRow(c, m);
  });
  return any ? h : h + empty('✔', 'Nada para mostrar');
}

/* ----- Inserção/edição manual de jogos ----- */
function extStart(c) {
  if (c.status !== 'setup') return;
  c.status = 'running'; c.draw = null; c.manual = true;
  if (c.format === 'league' || c.format === 'swiss') c.groups = [c.teamIds.slice()];
  c.phase = c.format === 'ko' ? 'ko' : c.format === 'swiss' ? 'swiss' : 'groups';
}
function teamOpts(c, sel, extra) { return opts((extra || []).concat(c.teamIds.map(id => [id, tname(id)])), sel); }
function matchForm() {
  const c = comp(S.comp), stages = [...new Set(c.matches.map(m => m.stage))], last = stages[stages.length - 1];
  const def = last || ({ league: 'Jornada 1', groups: 'Jornada 1', swiss: 'Ronda 1', ko: 'Meias-finais', friendly: 'Amistoso' }[c.format]);
  sheet('Adicionar jogo',
    fld('Fase / jornada', `<input id="mn-s" list="mn-sl" value="${esc(last && c.format === 'groups' ? last.replace(/^Grupo \w+ · /, '') : def)}"><datalist id="mn-sl">${stages.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`) +
    (c.format === 'groups' && c.groups ? fld('Grupo', `<select id="mn-g">${opts(c.groups.map((_, i) => [i, 'Grupo ' + C.LET[i]]).concat([['ko', 'Eliminatória']]), '0')}</select>`) : '') +
    fld('Casa', `<select id="mn-h">${teamOpts(c, '')}</select>`) + fld('Fora', `<select id="mn-a">${teamOpts(c, '', [['', '— folga (avança) —']])}</select>`) +
    `<div class="grid2">${fld('Data', `<input id="mn-d" type="date">`)}${fld('Local', `<input id="mn-p">`)}</div>`,
    `<button class="btn pri" data-a="mn-save">Adicionar</button>`);
}
function addMatch() {
  const c = comp(S.comp), h = val('mn-h'), a = val('mn-a'), txt = val('mn-s') || 'Jogo', gsel = $('#sheet-root #mn-g') ? val('mn-g') : null;
  if (h === a) throw new Error('Escolha duas equipas diferentes');
  let group = null, ko = c.format === 'ko', stage = txt;
  if (c.format === 'groups') {
    if (gsel === 'ko') ko = true;
    else {
      group = +gsel;
      [h, a].filter(Boolean).forEach(id => { const o = c.groups.findIndex(g => g.includes(id)); if (o >= 0 && o !== group) throw new Error(tname(id) + ' está no Grupo ' + C.LET[o]); });
      [h, a].filter(Boolean).forEach(id => { if (!c.groups[group].includes(id)) c.groups[group].push(id); });
      if (!/^Grupo /.test(txt)) stage = `Grupo ${C.LET[group]} · ${txt}`;
    }
  }
  const same = c.matches.find(m => m.stage === stage && !!m.ko === ko), ds = stage.match(/(\d+)\s*$/);
  const pool = c.matches.filter(m => !!m.ko === ko);
  const round = same ? same.round : (!ko && ds ? +ds[1] : Math.max(0, ...pool.map(m => m.round)) + 1);
  extStart(c);
  const o = { home: h, away: a || null, stage, round, group, ko, date: val('mn-d'), place: val('mn-p') };
  if (!a) Object.assign(o, { bye: true, status: 'done', doneAt: Date.now() });
  c.matches.push(C.newMatch(o)); save();
}

/* ----- Tabela ----- */
function tableHtml(c, tab, qn) {
  return `<table><tr><th class="t">#  Equipa</th><th>J</th><th>V</th><th>E</th><th>D</th><th>DG</th><th>Pts</th></tr>${tab.map((t, i) => `<tr class="${qn && i < qn ? 'q' : ''}"><td class="t ell" style="max-width:150px">${i + 1}. ${dot(t.id)} ${esc(tname(t.id))}</td><td>${t.p}</td><td>${t.w}</td><td>${t.d}</td><td>${t.l}</td><td>${t.gd > 0 ? '+' : ''}${t.gd}</td><td><b>${t.pts}</b>${t.ded ? `<sup class="mut" title="dedução">-${t.ded}</sup>` : ''}</td></tr>`).join('')}</table>`;
}
function tTable(c) {
  if (c.status === 'setup') return empty('📊', 'Ainda sem classificação', 'Faça o sorteio primeiro.');
  let h = '';
  if (c.format === 'league' || c.format === 'groups') {
    C.groupTables(c).forEach((tab, g) => { h += `<h2>${c.format === 'groups' ? 'Grupo ' + C.LET[g] : 'Classificação'}</h2><div class="card">${tableHtml(c, tab, c.format === 'groups' ? c.adv : 0)}</div>`; });
    if (c.format === 'groups') h += `<div class="sm mut">Barra verde = apurados (${c.adv} por grupo).</div>`;
  }
  if (c.format === 'swiss') h += `<h2>Classificação · ${C.lastRound(c.matches)}/${c.rounds} rondas</h2><div class="card">${tableHtml(c, C.standings(c.teamIds, c.matches, c.rules, c.deductions), 0)}</div>`;
  if (c.format === 'ko' || (c.format === 'groups' && c.matches.some(m => m.ko))) {
    let last = null; c.matches.filter(m => m.ko).forEach(m => { if (m.round !== last) { h += `<h2>${esc(m.stage)}</h2>`; last = m.round; } h += matchRow(c, m); });
  }
  if (c.format === 'friendly') h += c.matches.map(m => matchRow(c, m)).join('');
  return h + `<button class="btn" data-a="share" style="margin-top:10px">📤 Partilhar (texto)</button>`;
}
function shareText(c) {
  let t = `🏆 ${c.name}\n`;
  if (c.groups && (c.format === 'league' || c.format === 'groups')) C.groupTables(c).forEach((tab, g) => { t += `\n${c.format === 'groups' ? 'Grupo ' + C.LET[g] : 'Classificação'}\n` + tab.map((x, i) => `${i + 1}. ${tname(x.id)} — ${x.pts} pts (J${x.p} ${x.w}V ${x.d}E ${x.l}D, ${x.gd >= 0 ? '+' : ''}${x.gd})`).join('\n') + '\n'; });
  if (c.format === 'swiss') t += C.standings(c.teamIds, c.matches, c.rules, c.deductions).map((x, i) => `${i + 1}. ${tname(x.id)} — ${x.pts} pts`).join('\n') + '\n';
  const res = c.matches.filter(m => C.isDone(m) && !m.bye);
  if (res.length) t += '\nResultados\n' + res.slice(-12).map(m => { const s = C.score(m); return `${tname(m.home)} ${s.h}-${s.a} ${tname(m.away)}${m.pen ? ` (g.p. ${m.pen.h}-${m.pen.a})` : ''}`; }).join('\n');
  return t;
}

/* ----- Estatísticas ----- */
function tStats(c) {
  const st = C.playerStats(db, c.id), rows = [];
  c.teamIds.forEach(tid => (team(tid) ? team(tid).players : []).forEach(p => { const s = st[p.id]; if (s) rows.push({ p, tid, s }); }));
  const sc = rows.filter(r => r.s.g).sort((a, b) => b.s.g - a.s.g).slice(0, 10), cd = rows.filter(r => r.s.y || r.s.r).sort((a, b) => b.s.r - a.s.r || b.s.y - a.s.y);
  let h = '<h2>⚽ Melhores marcadores</h2>' + (sc.length ? `<div class="card">${sc.map((r, i) => `<div class="chk"><b style="width:22px">${i + 1}</b>${dot(r.tid)}<span class="sp ell">${esc(r.p.name)} <span class="mut sm">${esc(tname(r.tid))}</span></span><b>${r.s.g}</b></div>`).join('')}</div>` : '<div class="mut sm">Ainda sem golos registados por jogador.</div>');
  h += '<h2>🟨🟥 Disciplina</h2>' + (cd.length ? `<div class="card">${cd.map(r => `<div class="chk">${dot(r.tid)}<span class="sp ell">${esc(r.p.name)} <span class="mut sm">${esc(tname(r.tid))}</span></span><span>🟨${r.s.y} 🟥${r.s.r}</span></div>`).join('')}</div>` : '<div class="mut sm">Sem cartões.</div>');
  const fair = c.teamIds.map(id => { let y = 0, r = 0; c.matches.forEach(m => m.events.forEach(e => { if (e.team === id) { if (e.type === 'yellow') y++; if (e.type === 'red') r++; } })); return { id, y, r }; }).sort((a, b) => (a.y + a.r * 3) - (b.y + b.r * 3));
  h += '<h2>Fair-play (equipas)</h2><div class="card">' + fair.map((f, i) => `<div class="chk"><b style="width:22px">${i + 1}</b>${dot(f.id)}<span class="sp ell">${esc(tname(f.id))}</span><span>🟨${f.y} 🟥${f.r}</span></div>`).join('') + '</div>';
  return h;
}

/* ----- Definições ----- */
function tCfg(c) {
  const r = c.rules;
  return `<div class="card">` + fld('Nome', `<input id="cf-n" value="${esc(c.name)}">`) + `<div class="grid2">${fld('Minutos por parte', `<input id="cf-h" type="number" value="${r.halfMin}">`)}${fld('Amarelos p/ suspensão', `<input id="cf-y" type="number" value="${r.yellowLimit}">`)}${fld('Jogos por vermelho', `<input id="cf-b" type="number" value="${r.redBan}">`)}${fld('Pts vitória / empate', `<input id="cf-w" value="${r.winPts}/${r.drawPts}">`)}</div><button class="btn pri" data-a="cfg-save">Guardar</button></div><div class="sm mut">Alterações às regras de pontos aplicam-se logo à classificação; as de cartões valem a partir do próximo jogo terminado.</div>${c.status === 'running' && c.matches.length ? '<button class="btn" data-a="cfg-finish" style="margin-top:14px">🏁 Encerrar campeonato agora</button>' : ''}<button class="btn dng" data-a="comp-del" style="margin-top:14px">Eliminar campeonato</button>`;
}

/* ======================= JOGO ======================= */
function curMatch() { const c = comp(S.comp); return c ? [c, c.matches.find(m => m.id === S.match)] : [null, null]; }
function clockHtml(c, m) {
  const ph = m.timer.phase, ms = C.clockMs(m), f = C.fmtClock(ms, c, ph);
  const lab = { pre: 'Por iniciar', h1: '1.ª parte', ht: 'Intervalo', h2: '2.ª parte', ft: 'Terminado' }[ph] + (m.timer.running || ph === 'pre' || ph === 'ft' || ph === 'ht' ? '' : ' · ⏸ pausado');
  return `${f.main}${f.extra ? `<small>${f.extra}</small>` : ''}<div class="sm mut" style="font-family:system-ui;font-weight:600">${lab}</div>`;
}
function vMatch() {
  const [c, m] = curMatch(); if (!m) return empty('?', 'Jogo não encontrado');
  const s = C.score(m), ph = m.timer.phase, done = C.isDone(m), run = m.timer.running;
  let ctl = '';
  if (m.status === 'sched') ctl = `<button class="btn pri" data-a="m-start">▶ Iniciar jogo</button>`;
  else if (!done) {
    if (ph === 'h1') ctl = `<div class="grid2"><button class="btn" data-a="m-${run ? 'pause' : 'resume'}">${run ? '⏸ Pausar' : '▶ Retomar'}</button><button class="btn pri" data-a="m-ht">Intervalo ⏭</button></div>`;
    else if (ph === 'ht') ctl = `<button class="btn pri" data-a="m-2h">▶ Iniciar 2.ª parte</button>`;
    else if (ph === 'h2') ctl = `<div class="grid2"><button class="btn" data-a="m-${run ? 'pause' : 'resume'}">${run ? '⏸ Pausar' : '▶ Retomar'}</button><button class="btn dng" data-a="m-end">⏹ Terminar jogo</button></div>`;
    else ctl = `<button class="btn dng" data-a="m-end">⏹ Terminar jogo</button>`;
    if (ph === 'h1' || ph === 'ht') ctl += `<button class="btn dng sm" data-a="m-end" style="margin-top:8px;width:100%">⏹ Terminar jogo agora</button>`;
  } else ctl = `<button class="btn" data-a="m-reopen">↩ Reabrir jogo</button>`;
  const sus = C.suspendedMap(db, c.id), side = tid => {
    const ns = (team(tid) ? team(tid).players : []).filter(p => sus[p.id]).length;
    return `<div class="evb" data-t="${tid}"><button data-a="ev" data-t="${tid}" data-k="goal">⚽</button><button data-a="ev" data-t="${tid}" data-k="yellow">🟨</button><button data-a="ev" data-t="${tid}" data-k="red">🟥</button></div>${ns ? `<div class="sm" style="color:var(--red);margin-top:4px">⚠ ${ns} suspenso(s) nesta equipa</div>` : ''}`;
  };
  let h = `<div class="sb"><div class="sm mut">${esc(m.stage)}${m.date ? ' · ' + fdate(m.date) : ''}${m.place ? ' · ' + esc(m.place) : ''} <a data-a="m-info" style="color:var(--ac)">✏️</a></div>
    <div class="tms" style="margin-top:8px"><div>${dot(m.home)}<div class="nm">${esc(tname(m.home))}</div></div><div class="sc">${s.h}<span class="mut"> - </span>${s.a}</div><div>${dot(m.away)}<div class="nm">${esc(tname(m.away))}</div></div></div>
    ${m.pen ? `<div class="sm">Penáltis ${m.pen.h} - ${m.pen.a}</div>` : ''}<div class="clock" id="clk">${clockHtml(c, m)}</div></div>${ctl}`;
  h += `<h2>Registar acontecimento</h2><div class="grid2"><div><div class="sm b c">${esc(tname(m.home))}</div>${side(m.home)}</div><div><div class="sm b c">${esc(tname(m.away))}</div>${side(m.away)}</div></div>`;
  h += `<h2>Cronologia</h2><div class="card">${m.events.length ? m.events.slice().reverse().sort((a, b) => b.min - a.min).map(e => `<div class="ev"><span class="m">${esc(e.label)}'</span><span>${{ goal: '⚽', own: '⚽ AG', yellow: '🟨', red: '🟥' }[e.type]}</span><span class="sp ell">${esc(e.pname || 'Sem jogador')} <span class="mut sm">${e.pnum ? '#' + esc(e.pnum) + ' ' : ''}${esc(tname(e.team))}${e.auto ? ' · 2.º amarelo' : ''}</span></span><button class="x" data-a="ev-del" data-id="${e.id}">✕</button></div>`).join('') : '<div class="mut sm c">Sem acontecimentos.</div>'}</div>`;
  h += `<button class="btn sm" data-a="m-manual" style="margin-top:6px">✏️ Corrigir resultado manualmente${m.manual ? ' (ativo)' : ''}</button>`;
  return h;
}
function eventSheet(type, tid) {
  const [c, m] = curMatch(), t = team(tid), sus = C.suspendedMap(db, c.id), ms = C.clockMs(m);
  const lb = C.eventLabel(ms, c, m.timer.phase);
  const title = { goal: '⚽ Golo', yellow: '🟨 Cartão amarelo', red: '🟥 Cartão vermelho' }[type] + ' — ' + esc(t.name);
  const list = t.players.slice().sort((a, b) => (+a.num || 999) - (+b.num || 999)).map(p => `<label class="chk"><input type="radio" name="ep" value="${p.id}"> <span class="pill">${esc(p.num || '–')}</span><span class="sp">${esc(p.name)}</span>${sus[p.id] ? '<span class="badge r">SUSPENSO</span>' : ''}</label>`).join('');
  sheet(title, (list || '<div class="mut sm">Equipa sem jogadores registados.</div>') +
    `<label class="chk"><input type="radio" name="ep" value="" ${list ? '' : 'checked'}> <span class="sp mut">Outro / sem identificar</span></label>` +
    `<div style="margin-top:10px">${fld('Nome (opcional, se não estiver na lista)', `<input id="ev-n" maxlength="40">`)}${fld('Minuto', `<input id="ev-m" type="number" min="0" value="${lb.min}">`)}</div>` +
    (type === 'goal' ? `<label class="chk"><input type="checkbox" id="ev-og"> Auto-golo (conta para o adversário)</label>` : ''),
    `<button class="btn pri" data-a="ev-save" data-t="${tid}" data-k="${type}" data-lb="${lb.label}" data-lm="${lb.min}">Registar</button>`);
}
function saveEvent(type, tid, lb, lm) {
  const [c, m] = curMatch(), sel = $('#sheet-root input[name=ep]:checked'), pid = sel ? sel.value : '', free = val('ev-n');
  const min = Math.max(0, Math.floor(num('ev-m', +lm))), same = min === +lm;
  const p = pid ? player(tid, pid) : null;
  const og = type === 'goal' && $('#ev-og') && $('#ev-og').checked;
  const e = { id: uid(), type: og ? 'own' : type, team: tid, player: pid || null, pname: p ? p.name : free, pnum: p ? p.num : '', min: min, label: same ? lb : String(min) };
  m.events.push(e);
  if (type === 'yellow' && pid && m.events.filter(x => x.type === 'yellow' && x.player === pid).length >= 2) {
    m.events.push({ id: uid(), type: 'red', team: tid, player: pid, pname: e.pname, pnum: e.pnum, min: e.min, label: e.label, auto: true, link: e.id });
    toast('🟨🟨 2.º amarelo → 🟥 vermelho automático');
  }
  if (C.isDone(m)) { C.regenAuto(db, c, m); }
  closeSheet(); save(); render();
}

/* ======================= TREINOS ======================= */
const ATT = ['', 'p', 'l', 'a', 'i'], ATT_I = { '': '·', p: '✅', l: '⏰', a: '❌', i: '🩹' }, ATT_L = { '': 'sem registo', p: 'presente', l: 'atraso', a: 'falta', i: 'lesão' };
function vTrains() {
  let h = `<div class="bar"><button class="btn pri" data-a="tr-new">＋ Novo treino</button></div><div class="grid2" style="margin-bottom:12px"><button class="btn" data-a="split">🎲 Sorteio de equipas</button><button class="btn" data-a="timer">⏱ Cronómetro</button></div><div class="bar"><button class="btn" data-a="tr-stats">📊 Estatística de presenças</button></div>`;
  if (!db.trainings.length) return h + empty('🏃', 'Sem treinos', 'Crie uma sessão, marque presenças e guarde o plano de treino.');
  db.trainings.slice().sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))).forEach(t => {
    const pres = Object.values(t.att || {}).filter(x => x === 'p' || x === 'l').length;
    h += `<div class="card tap row" data-a="tr-open" data-id="${t.id}"><div class="sp"><div class="b ell">${esc(t.title || 'Treino')}</div><div class="sm mut">📅 ${fdate(t.date)} ${esc(t.time || '')} · ${esc(tname(t.team))}${t.place ? ' · 📍 ' + esc(t.place) : ''}</div></div><span class="badge ok">${pres} presentes</span></div>`;
  });
  return h;
}
function trainForm() {
  if (!db.teams.length) { toast('Registe uma equipa primeiro'); return; }
  sheet('Novo treino', fld('Equipa', `<select id="tr-t">${opts(db.teams.map(t => [t.id, t.name]), '')}</select>`) + fld('Tema / título', `<input id="tr-n" placeholder="Ex.: Finalização e bolas paradas">`) + `<div class="grid2">${fld('Data', `<input id="tr-d" type="date" value="${today()}">`)}${fld('Hora', `<input id="tr-h" type="time" value="17:00">`)}</div>` + fld('Local', `<input id="tr-p">`), `<button class="btn pri" data-a="tr-save">Criar</button>`);
}
function vTrain() {
  const t = db.trainings.find(x => x.id === S.train); if (!t) return empty('?', 'Treino não encontrado');
  const tm = team(t.team), pl = tm ? tm.players.slice().sort((a, b) => (+a.num || 999) - (+b.num || 999)) : [];
  const cnt = k => Object.values(t.att || {}).filter(x => x === k).length;
  let h = `<div class="card"><div class="b">${esc(t.title || 'Treino')}</div><div class="sm mut">📅 ${fdate(t.date)} ${esc(t.time || '')} · ${esc(tname(t.team))}${t.place ? ' · 📍 ' + esc(t.place) : ''}</div><div class="sm" style="margin-top:6px">✅ ${cnt('p')} · ⏰ ${cnt('l')} · ❌ ${cnt('a')} · 🩹 ${cnt('i')}</div></div>`;
  h += `<h2>Presenças <span class="mut" style="text-transform:none">(toque para alterar)</span></h2><div class="bar"><button class="btn sm" data-a="att-all">Marcar todos presentes</button></div><div class="card">`;
  h += pl.length ? pl.map(p => `<div class="chk" data-a="att" data-id="${p.id}" style="cursor:pointer"><span class="pill">${esc(p.num || '–')}</span><span class="sp">${esc(p.name)}</span><span class="sm mut">${ATT_L[t.att[p.id] || '']}</span><span style="font-size:22px;width:30px;text-align:center">${ATT_I[t.att[p.id] || '']}</span></div>`).join('') : '<div class="mut sm">A equipa não tem jogadores.</div>';
  h += `</div><h2>Plano / exercícios</h2>` + `<textarea id="tr-plan" data-c="tr-plan" placeholder="Aquecimento 15' · Rondo 4x4 · Jogo reduzido…" style="width:100%;padding:11px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--txt);font:inherit">${esc(t.plan || '')}</textarea>`;
  h += `<h2>Notas</h2><textarea id="tr-notes" data-c="tr-notes" placeholder="Observações, lesões, avaliação…" style="width:100%;padding:11px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--txt);font:inherit">${esc(t.notes || '')}</textarea>`;
  h += `<div class="grid2" style="margin-top:12px"><button class="btn" data-a="split" data-from="${t.id}">🎲 Sortear equipas</button><button class="btn" data-a="timer">⏱ Cronómetro</button></div><button class="btn dng" data-a="tr-del" style="margin-top:14px">Eliminar treino</button>`;
  return h;
}
function statsSheet() {
  const rows = db.teams.map(t => {
    const ts = db.trainings.filter(x => x.team === t.id); if (!ts.length || !t.players.length) return '';
    return `<h2>${esc(t.name)} · ${ts.length} treinos</h2><div class="card">` + t.players.map(p => { const pr = ts.filter(x => x.att[p.id] === 'p' || x.att[p.id] === 'l').length, pc = Math.round(100 * pr / ts.length); return { p, pr, pc }; }).sort((a, b) => b.pc - a.pc).map(r => `<div class="chk"><span class="sp ell">${esc(r.p.name)}</span><span class="mut sm">${r.pr}/${ts.length}</span><b style="width:44px;text-align:right;color:${r.pc >= 75 ? 'var(--ac)' : r.pc >= 50 ? 'var(--warn)' : 'var(--red)'}">${r.pc}%</b></div>`).join('') + '</div>';
  }).join('');
  sheet('📊 Presenças por jogador', rows || '<div class="mut c">Sem dados de treinos ainda.</div>');
}

/* Sorteio de equipas (treino/pelada) */
let lastSplit = null;
function splitSheet(fromTrain) {
  const t0 = fromTrain ? db.trainings.find(x => x.id === fromTrain) : null, tid = t0 ? t0.team : (db.teams[0] || {}).id;
  sheet('🎲 Sorteio de equipas', fld('Origem dos jogadores', `<select id="sp-t" data-c="sp-t">${opts([['', '✍️ Lista manual']].concat(db.teams.map(t => [t.id, t.name])), tid || '')}</select>`) + `<div id="sp-list"></div>` + fld('Jogadores extra / lista manual (um por linha: Nome, nível 1-5, GR)', `<textarea id="sp-x" placeholder="Carlos, 4&#10;Pedro, 3, GR"></textarea>`) +
    `<div class="grid2">${fld('Nº de equipas', `<select id="sp-n">${opts([2, 3, 4, 5, 6].map(n => [n, n]), '2')}</select>`)}${fld('Modo', `<select id="sp-m">${opts([['balanced', 'Equilibrado por nível'], ['gk', 'Equilibrado + separar GR'], ['random', 'Totalmente aleatório']], 'balanced')}</select>`)}</div><div id="sp-res"></div>`,
    `<button class="btn" data-a="split-share" style="width:auto">📤</button><button class="btn pri" data-a="split-do" data-from="${fromTrain || ''}">🎲 Sortear</button>`);
  splitList(fromTrain);
}
function splitList(from) {
  const tid = val('sp-t'), el = $('#sp-list'); if (!el) return; const t = team(tid);
  const tr = from ? db.trainings.find(x => x.id === from) : null;
  el.innerHTML = t ? `<div class="sm mut" style="margin-bottom:4px">Jogadores (desmarque quem faltou)</div>` + t.players.map(p => `<label class="chk"><input type="checkbox" class="sp-p" value="${p.id}" ${tr ? (tr.att[p.id] === 'p' || tr.att[p.id] === 'l' ? 'checked' : '') : 'checked'}> <span class="sp">${esc(p.name)}</span><span class="mut sm">${p.pos} ${'★'.repeat(p.level || 3)}</span></label>`).join('') : '';
}
function splitDo() {
  const t = team(val('sp-t')), players = [];
  if (t) $('#sheet-root').querySelectorAll('.sp-p:checked').forEach(c => { const p = player(t.id, c.value); if (p) players.push({ name: p.name, level: p.level || 3, pos: p.pos }); });
  val('sp-x').split('\n').map(l => l.trim()).filter(Boolean).forEach(l => { const [n, lv, ps] = l.split(',').map(x => x.trim()); players.push({ name: n, level: Math.min(5, Math.max(1, parseInt(lv) || 3)), pos: (ps || '').toUpperCase() === 'GR' ? 'GR' : 'X' }); });
  const n = +val('sp-n');
  if (players.length < n) { toast('Poucos jogadores para ' + n + ' equipas'); return; }
  const res = C.splitTeams(players, n, val('sp-m')); lastSplit = res;
  $('#sp-res').innerHTML = res.map((r, i) => `<div class="card"><div class="b" style="color:var(--ac)">Equipa ${i + 1} <span class="mut sm">· ${r.players.length} jog. · nível médio ${(r.sum / r.players.length).toFixed(1)}</span></div>${r.players.map(p => `<div>${p.pos === 'GR' ? '🧤' : '•'} ${esc(p.name)}</div>`).join('')}</div>`).join('');
}

/* Cronómetro de treino */
const tt = { left: 600, total: 600, run: false, iv: 0, end: 0 };
function timerSheet() {
  sheet('⏱ Cronómetro de treino', `<div class="big-t" id="tt"></div><div class="chips" style="justify-content:center">${[3, 5, 10, 15, 20, 45].map(m => `<button class="chip" data-a="tt-set" data-m="${m}">${m}'</button>`).join('')}</div>`, `<button class="btn" data-a="tt-reset">↺</button><button class="btn pri" data-a="tt-go" id="tt-go">▶ Iniciar</button>`);
  ttPaint();
}
function ttPaint() { const e = $('#tt'); if (!e) return; const s = Math.max(0, Math.ceil(tt.left / 1000)); e.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(); [0, .3, .6].forEach(d => { const o = a.createOscillator(); o.connect(a.destination); o.frequency.value = 880; o.start(a.currentTime + d); o.stop(a.currentTime + d + .18); }); } catch (e) {} if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 500]); }

/* ======================= SANÇÕES ======================= */
function vSanc() {
  const f = S.sanf || 'act'; let list = db.sanctions.slice().sort((a, b) => b.at - a.at);
  if (f === 'act') list = list.filter(s => s.type === 'suspensao' ? C.remaining(db, s) > 0 : s.type === 'multa' ? !s.paid : false);
  let h = `<div class="bar"><button class="btn pri" data-a="sn-new">＋ Nova sanção</button></div><div class="chips">${[['act', 'Ativas / por pagar'], ['all', 'Todas']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-a="snf" data-k="${k}">${l}</button>`).join('')}</div>`;
  if (!list.length) return h + empty('✅', f === 'act' ? 'Sem sanções ativas' : 'Sem sanções', 'Cartões vermelhos e acumulação de amarelos geram suspensões automaticamente quando termina o jogo.');
  list.forEach(s => {
    const c = comp(s.compId), who = s.pname || (s.player && (player(s.team, s.player) || {}).name) || 'Equipa', rem = C.remaining(db, s);
    let info = '';
    if (s.type === 'suspensao') info = rem > 0 ? `<span class="badge r">${rem} de ${s.games} jogo${s.games > 1 ? 's' : ''} em falta</span>` : `<span class="badge ok">Cumprida</span>`;
    else if (s.type === 'multa') info = `<span class="badge ${s.paid ? 'ok' : 'y'}" data-a="sn-paid" data-id="${s.id}">💰 ${esc(s.amount)} · ${s.paid ? 'pago' : 'por pagar (tocar)'}</span>`;
    else if (s.type === 'pontos') info = `<span class="badge r">−${s.points} pts</span>`; else info = `<span class="badge y">Advertência</span>`;
    h += `<div class="card"><div class="row"><div class="sp"><div class="b ell">${{ suspensao: '⛔', multa: '💰', pontos: '📉', adv: '⚠️' }[s.type]} ${esc(who)}</div><div class="sm mut">${esc(tname(s.team))} · ${esc(c ? c.name : '—')}</div></div><button class="x" data-a="sn-del" data-id="${s.id}">🗑</button></div><div class="sm" style="margin:6px 0">${esc(s.reason || '')}${s.auto ? ' <span class="mut">(automática)</span>' : ''}</div>${info}</div>`;
  });
  return h;
}
function sancForm() {
  const cs = db.comps.filter(c => c.teamIds.length); if (!cs.length) { toast('Crie um campeonato primeiro'); return; }
  sheet('Nova sanção', fld('Campeonato', `<select id="sn-c" data-c="sn-c">${opts(cs.map(c => [c.id, c.name]), '')}</select>`) + fld('Equipa', `<select id="sn-t" data-c="sn-t"></select>`) + fld('Jogador (opcional)', `<select id="sn-p"></select>`) +
    fld('Tipo', `<select id="sn-k" data-c="sn-k">${opts([['suspensao', '⛔ Suspensão (nº de jogos)'], ['multa', '💰 Multa'], ['pontos', '📉 Dedução de pontos'], ['adv', '⚠️ Advertência']], 'suspensao')}</select>`) + fld('<span id="sn-vl">Nº de jogos</span>', `<input id="sn-v" type="number" min="1" value="1">`) + fld('Motivo', `<input id="sn-r" placeholder="Ex.: agressão ao árbitro">`),
    `<button class="btn pri" data-a="sn-save">Aplicar</button>`);
  sancFill('c');
}
function sancFill(level) {
  const c = comp(val('sn-c')); if (!c) return;
  if (level === 'c') $('#sn-t').innerHTML = opts(c.teamIds.map(id => [id, tname(id)]), '');
  const t = team(val('sn-t')); $('#sn-p').innerHTML = opts([['', '— toda a equipa —']].concat(t ? t.players.map(p => [p.id, (p.num ? p.num + ' · ' : '') + p.name]) : []), '');
}

/* ======================= Ações ======================= */
const A = {
  back() { if (history.length > 1) history.back(); else { S.match ? S.match = null : S.comp ? S.comp = null : S.team = null; S.train = null; render(); } },
  tab(d) { S = { tab: d.k, comp: null, ctab: 'jogos', match: null, team: null, train: null, sanf: S.sanf || 'act' }; nav({}); },
  sclose() { closeSheet(); },
  /* equipas */
  'team-new'() { teamForm(); }, 'team-edit'(d) { teamForm(team(d.id)); },
  'team-save'(d) {
    const n = val('tf-n'); if (!n) return toast('Indique o nome');
    if (d.id) { const t = team(d.id); Object.assign(t, { name: n, color: val('tf-c'), level: +val('tf-l') }); }
    else db.teams.push({ id: uid(), name: n, color: val('tf-c'), level: +val('tf-l'), players: [] });
    save(); closeSheet(); render();
  },
  'team-bulk'() { sheet('Várias equipas', fld('Um nome por linha', `<textarea id="bk" placeholder="Benfica FC&#10;Os Craques&#10;Unidos do Bairro"></textarea>`), `<button class="btn pri" data-a="team-bulk-ok">Adicionar</button>`); },
  'team-bulk-ok'() { const ls = val('bk').split('\n').map(x => x.trim()).filter(Boolean); ls.forEach((n, i) => db.teams.push({ id: uid(), name: n, color: COLORS[(db.teams.length + i) % COLORS.length], level: 3, players: [] })); save(); closeSheet(); render(); toast(ls.length + ' equipas adicionadas'); },
  'team-open'(d) { nav({ team: d.id }); },
  'team-del'(d) { if (db.comps.some(c => c.teamIds.includes(d.id))) return toast('Equipa usada num campeonato — não pode ser eliminada'); if (!confirm('Eliminar esta equipa e os seus jogadores?')) return; db.teams = db.teams.filter(t => t.id !== d.id); save(); S.team = null; history.back(); setTimeout(render, 30); },
  'pl-new'() { playerForm(); }, 'pl-edit'(d) { playerForm(player(S.team, d.id)); },
  'pl-save'(d) {
    const n = val('pf-n'); if (!n) return toast('Indique o nome'); const t = team(S.team), data = { name: n, num: val('pf-u'), pos: val('pf-p'), level: +val('pf-l') };
    if (d.id) Object.assign(player(S.team, d.id), data); else t.players.push(Object.assign({ id: uid() }, data));
    save(); closeSheet(); render();
  },
  'pl-del'(d) { if (!confirm('Eliminar jogador?')) return; const t = team(S.team); t.players = t.players.filter(p => p.id !== d.id); save(); closeSheet(); render(); },
  'pl-bulk'() { sheet('Vários jogadores', fld('Um por linha: nº nome (ex.: 10 João Silva). Opcional: , posição', `<textarea id="bk" placeholder="1 Mário Gomes, GR&#10;7 Paulo Dias, ATA&#10;10 Rui Costa"></textarea>`), `<button class="btn pri" data-a="pl-bulk-ok">Adicionar</button>`); },
  'pl-bulk-ok'() {
    const t = team(S.team); let n = 0;
    val('bk').split('\n').map(x => x.trim()).filter(Boolean).forEach(l => { const [main, ps] = l.split(','); const m = main.trim().match(/^(\d+)?[\s.\-)]*(.+)$/); if (!m) return; t.players.push({ id: uid(), name: m[2].trim(), num: m[1] || '', pos: POS.includes((ps || '').trim().toUpperCase()) ? ps.trim().toUpperCase() : 'MED', level: 3 }); n++; });
    save(); closeSheet(); render(); toast(n + ' jogadores adicionados');
  },
  /* campeonatos */
  'comp-new'() { compForm(); },
  'cn-all'() { const cs = [...$('#sheet-root').querySelectorAll('.cn-t')], on = cs.some(c => !c.checked); cs.forEach(c => c.checked = on); },
  'comp-save'() {
    const f = val('cn-f'), ids = [...$('#sheet-root').querySelectorAll('.cn-t:checked')].map(c => c.value), name = val('cn-n') || FMT[f];
    const min = { league: 2, groups: 4, ko: 2, swiss: 3, friendly: 2 }[f]; if (ids.length < min) return toast('Selecione pelo menos ' + min + ' equipas');
    if (f === 'friendly' && ids.length !== 2) return toast('Jogo amistoso: escolha exatamente 2 equipas');
    const G = Math.max(2, Math.floor(num('cn-g', 2))), adv = Math.max(1, Math.floor(num('cn-a', 2)));
    if (f === 'groups' && ids.length < G * 2) return toast('Cada grupo precisa de pelo menos 2 equipas');
    const [w, d] = val('cn-w').split('/').map(x => parseInt(x)); const rules = { halfMin: Math.max(1, num('cn-h', 20)), yellowLimit: Math.max(0, num('cn-y', 3)), redBan: Math.max(0, num('cn-b', 1)), winPts: isNaN(w) ? 3 : w, drawPts: isNaN(d) ? 1 : d };
    const c = { id: uid(), name, format: f, legs: +val('cn-l') || 1, G, adv, rounds: Math.max(2, Math.floor(num('cn-r', 4))), rules, teamIds: ids, groups: null, matches: [], status: 'setup', phase: 'setup', deductions: {}, created: Date.now() };
    if (f === 'groups') c.adv = Math.min(adv, Math.floor(ids.length / G));
    if (f === 'friendly') { c.status = 'running'; c.phase = 'friendly'; c.matches = [C.newMatch({ home: ids[0], away: ids[1], stage: 'Amistoso' })]; }
    db.comps.push(c); save(); closeSheet(); S.dm = null; S.draw = null; nav({ comp: c.id, ctab: f === 'friendly' ? 'jogos' : 'sorteio' });
  },
  'comp-open'(d) { S.dm = null; S.draw = null; S.gf = 'all'; const c = comp(d.id); nav({ comp: d.id, ctab: c.status === 'setup' ? 'sorteio' : 'jogos' }); },
  'comp-del'() { if (!confirm('Eliminar este campeonato e todos os jogos?')) return; const id = S.comp; db.comps = db.comps.filter(c => c.id !== id); db.sanctions = db.sanctions.filter(s => s.compId !== id); save(); S.comp = null; history.back(); setTimeout(render, 30); },
  ctab(d) { S.ctab = d.k; render(); }, gf(d) { S.gf = d.k; render(); },
  dm(d) { S.dm = d.k; S.draw = null; render(); },
  'draw-do'() { runDraw(comp(S.comp)); render(); },
  'draw-live'() { const c = comp(S.comp); liveDraw(c, runDraw(c)); },
  'draw-ok'() { const c = comp(S.comp); C.applyDraw(c, S.draw); S.draw = null; S.ctab = 'jogos'; save(); render(); toast('Sorteio confirmado — jogos gerados'); },
  'draw-manual'() {
    const c = comp(S.comp), d = C.drawGroups(teamsForDraw(c), c.G, 'manual', S.manual || {});
    if (d.groups.some(g => g.length < 2)) return toast('Cada grupo precisa de pelo menos 2 equipas');
    C.applyDraw(c, d); S.ctab = 'jogos'; save(); render();
  },
  'draw-redo'() {
    const c = comp(S.comp), n = c.matches.filter(C.isDone).length;
    if (!confirm(n ? `Já há ${n} jogo(s) terminados. Refazer apaga TODOS os jogos e resultados. Continuar?` : 'Refazer o sorteio?')) return;
    db.sanctions = db.sanctions.filter(s => !(s.compId === c.id && s.auto)); c.matches = []; c.groups = null; c.draw = null; c.status = 'setup'; c.phase = 'setup'; c.deductions = {};
    S.draw = null; S.ctab = 'sorteio'; save(); render();
  },
  advance(d) {
    const c = comp(S.comp);
    if (d.k === 'ko-start') { sheet('Eliminatórias', `<div class="sm mut" style="margin-bottom:10px">Apurados: ${c.adv} por grupo.</div><div class="chips"><button class="chip on" data-a="ko-go" data-k="seeded">Cruzamento por classificação</button><button class="chip" data-a="ko-go" data-k="random">Sorteio (evita mesmo grupo)</button></div>`); return; }
    C.advance(c, d.k); save(); S.ctab = d.k === 'finish' ? 'tabela' : 'jogos'; render();
  },
  'ko-go'(d) { const c = comp(S.comp); C.advance(c, 'ko-start', d.k); closeSheet(); save(); S.ctab = 'jogos'; render(); },
  share() { const t = shareText(comp(S.comp)); if (navigator.share) navigator.share({ text: t }).catch(() => {}); else if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('Copiado!')); },
  'cfg-finish'() { const c = comp(S.comp); if (!confirm('Encerrar o campeonato agora? Os jogos por jogar ficam como estão.')) return; C.advance(c, 'finish'); save(); S.ctab = 'tabela'; render(); },
  'cfg-save'() {
    const g = id => $('#main #' + id).value.trim(), n = (id, d) => { const x = parseFloat(g(id)); return isNaN(x) ? d : x; };
    const c = comp(S.comp), [w, d] = g('cf-w').split('/').map(x => parseInt(x));
    c.name = g('cf-n') || c.name; Object.assign(c.rules, { halfMin: Math.max(1, n('cf-h', c.rules.halfMin)), yellowLimit: Math.max(0, n('cf-y', c.rules.yellowLimit)), redBan: Math.max(0, n('cf-b', c.rules.redBan)), winPts: isNaN(w) ? c.rules.winPts : w, drawPts: isNaN(d) ? c.rules.drawPts : d });
    save(); toast('Guardado'); render();
  },
  /* jogo */
  mopen(d) { nav({ match: d.id }); },
  'm-start'() { const [c, m] = curMatch(); if (m.bye) return; C.T.start(m); save(); render(); wake(); },
  'm-pause'() { C.T.pause(m()); save(); render(); }, 'm-resume'() { C.T.resume(m()); save(); render(); },
  'm-ht'() { C.T.half(m()); save(); render(); },
  'm-2h'() { const [c, mm] = curMatch(); C.T.second(mm, c); save(); render(); },
  'm-end'() {
    const [c, mm] = curMatch(), s = C.score(mm);
    if (mm.ko && s.h === s.a) return sheet('Empate — desempate por penáltis', `<div class="grid2">${fld(esc(tname(mm.home)), `<input id="pn-h" type="number" min="0" inputmode="numeric">`)}${fld(esc(tname(mm.away)), `<input id="pn-a" type="number" min="0" inputmode="numeric">`)}</div>`, `<button class="btn pri" data-a="pen-ok">Terminar jogo</button>`);
    finish(c, mm, null);
  },
  'pen-ok'() { const h = num('pn-h', -1), a = num('pn-a', -1); if (h < 0 || a < 0 || h === a) return toast('Indique um resultado de penáltis sem empate'); const [c, mm] = curMatch(); closeSheet(); finish(c, mm, { h, a }); },
  'm-reopen'() {
    const [c, mm] = curMatch();
    if (mm.ko && c.matches.some(x => x.ko && x.round > mm.round)) return toast('Já foi gerada a ronda seguinte — não é possível reabrir');
    if (c.status === 'finished') { c.status = 'running'; c.phase = c.format === 'friendly' ? 'friendly' : c.phase === 'done' ? (c.format === 'ko' ? 'ko' : c.format === 'swiss' ? 'swiss' : 'groups') : c.phase; }
    mm.status = 'live'; mm.pen = null; mm.doneAt = 0; mm.timer.phase = 'h2'; mm.timer.running = false; C.regenAuto(db, c, mm); save(); render();
  },
  'm-info'() {
    const [c, mm] = curMatch(), lock = mm.events.length || C.isDone(mm), pool = mm.group != null && !mm.ko && c.groups ? c.groups[mm.group] : c.teamIds, o = sel => opts(pool.map(id => [id, tname(id)]), sel);
    sheet('Editar jogo', fld('Fase / jornada', `<input id="mi-s" value="${esc(mm.stage)}">`) + (lock ? '<div class="sm mut" style="margin-bottom:10px">Equipas bloqueadas: o jogo já tem acontecimentos ou terminou (reabra ou apague os eventos para trocar).</div>' : '') + `<div class="grid2">${fld('Casa', `<select id="mi-h2" ${lock ? 'disabled' : ''}>${o(mm.home)}</select>`)}${fld('Fora', `<select id="mi-a2" ${lock || mm.bye ? 'disabled' : ''}>${o(mm.away)}</select>`)}</div><div class="grid2">${fld('Data', `<input id="mi-d" type="date" value="${mm.date || ''}">`)}${fld('Local', `<input id="mi-p" value="${esc(mm.place)}">`)}</div>`,
      `<button class="btn dng" data-a="m-del" style="width:auto">🗑 Apagar</button><button class="btn pri" data-a="mi-save">Guardar</button>`);
  },
  'mi-save'() {
    const [c, mm] = curMatch(), lock = mm.events.length || C.isDone(mm);
    if (!lock && !mm.bye) { const h = val('mi-h2'), a = val('mi-a2'); if (h === a) return toast('Escolha duas equipas diferentes'); mm.home = h; mm.away = a; }
    mm.stage = val('mi-s') || mm.stage; mm.date = val('mi-d'); mm.place = val('mi-p'); save(); closeSheet(); render();
  },
  'm-del'() {
    const [c, mm] = curMatch(); if (!confirm('Apagar este jogo' + (C.isDone(mm) ? ' (já terminado — a classificação muda)' : '') + '?')) return;
    db.sanctions = db.sanctions.filter(x => !(x.auto && x.matchId === mm.id)); c.matches = c.matches.filter(x => x.id !== mm.id); save(); closeSheet(); S.match = null; history.back(); setTimeout(render, 30);
  },
  'mn-new'() { const c = comp(S.comp); if (c.format === 'groups' && !c.groups) { S.dm = 'manual'; S.ctab = 'sorteio'; render(); return toast('Defina primeiro os grupos (Manual → "Só definir os grupos")'); } matchForm(); },
  'mn-save'() { try { addMatch(); } catch (e) { return toast('⚠ ' + e.message); } closeSheet(); S.ctab = 'jogos'; render(); toast('Jogo adicionado'); },
  'draw-ext'() { const c = comp(S.comp); if (c.format === 'groups') { S.dm = 'manual'; render(); return toast('Escolha o grupo de cada equipa e toque em "Só definir os grupos"'); } extStart(c); save(); S.ctab = 'jogos'; render(); matchForm(); },
  'groups-only'() {
    const c = comp(S.comp), d = C.drawGroups(teamsForDraw(c), c.G, 'manual', S.manual || {});
    if (d.groups.some(g => g.length < 1)) return toast('Cada grupo precisa de pelo menos 1 equipa');
    c.groups = d.groups; c.draw = d; extStart(c); save(); S.ctab = 'jogos'; render(); toast('Grupos definidos — adicione os jogos');
  },
  'm-manual'() {
    const [c, mm] = curMatch(), s = C.score(mm);
    sheet('Corrigir resultado', `<div class="sm mut" style="margin-bottom:10px">Útil para registar só o resultado final, sem golos individuais.</div><div class="grid2">${fld(esc(tname(mm.home)), `<input id="mr-h" type="number" min="0" value="${s.h}">`)}${fld(esc(tname(mm.away)), `<input id="mr-a" type="number" min="0" value="${s.a}">`)}</div>`,
      `${mm.manual ? '<button class="btn" data-a="mr-auto" style="width:auto">Usar golos</button>' : ''}<button class="btn pri" data-a="mr-ok">Guardar</button>`);
  },
  'mr-ok'() { const [c, mm] = curMatch(); mm.manual = true; mm.hg = Math.max(0, num('mr-h', 0)); mm.ag = Math.max(0, num('mr-a', 0)); save(); closeSheet(); render(); },
  'mr-auto'() { const [c, mm] = curMatch(); mm.manual = false; save(); closeSheet(); render(); },
  ev(d) { eventSheet(d.k, d.t); }, 'ev-save'(d) { saveEvent(d.k, d.t, d.lb, d.lm); },
  'ev-del'(d) { const [c, mm] = curMatch(); mm.events = mm.events.filter(e => e.id !== d.id && e.link !== d.id); if (C.isDone(mm)) C.regenAuto(db, c, mm); save(); render(); },
  /* treinos */
  'tr-new'() { trainForm(); },
  'tr-save'() { const t = { id: uid(), team: val('tr-t'), title: val('tr-n'), date: val('tr-d') || today(), time: val('tr-h'), place: val('tr-p'), att: {}, plan: '', notes: '' }; db.trainings.push(t); save(); closeSheet(); nav({ train: t.id }); },
  'tr-open'(d) { nav({ train: d.id }); },
  att(d) { const t = db.trainings.find(x => x.id === S.train), cur = t.att[d.id] || ''; const n = ATT[(ATT.indexOf(cur) + 1) % ATT.length]; if (n) t.att[d.id] = n; else delete t.att[d.id]; save(); render(); },
  'att-all'() { const t = db.trainings.find(x => x.id === S.train), tm = team(t.team); tm.players.forEach(p => t.att[p.id] = 'p'); save(); render(); },
  'tr-del'() { if (!confirm('Eliminar este treino?')) return; db.trainings = db.trainings.filter(x => x.id !== S.train); save(); S.train = null; history.back(); setTimeout(render, 30); },
  'tr-stats'() { statsSheet(); },
  split(d) { splitSheet(d.from); }, 'split-do'() { splitDo(); },
  'split-share'() { if (!lastSplit) return toast('Faça o sorteio primeiro'); const t = lastSplit.map((r, i) => `Equipa ${i + 1}\n` + r.players.map(p => '• ' + p.name).join('\n')).join('\n\n'); if (navigator.share) navigator.share({ text: t }).catch(() => {}); else navigator.clipboard.writeText(t).then(() => toast('Copiado!')); },
  timer() { timerSheet(); },
  'tt-set'(d) { tt.total = tt.left = d.m * 60000; tt.run = false; clearInterval(tt.iv); $('#tt-go').textContent = '▶ Iniciar'; ttPaint(); },
  'tt-reset'() { tt.left = tt.total; tt.run = false; clearInterval(tt.iv); $('#tt-go').textContent = '▶ Iniciar'; ttPaint(); },
  'tt-go'() {
    if (tt.run) { tt.run = false; clearInterval(tt.iv); $('#tt-go').textContent = '▶ Retomar'; return; }
    if (tt.left <= 0) tt.left = tt.total; tt.run = true; tt.end = Date.now() + tt.left; $('#tt-go').textContent = '⏸ Pausar';
    tt.iv = setInterval(() => { tt.left = tt.end - Date.now(); if (tt.left <= 0) { tt.left = 0; tt.run = false; clearInterval(tt.iv); beep(); const b = $('#tt-go'); if (b) b.textContent = '▶ Iniciar'; } ttPaint(); }, 200);
  },
  /* sanções */
  'sn-new'() { sancForm(); }, snf(d) { S.sanf = d.k; render(); },
  'sn-save'() {
    const c = comp(val('sn-c')), k = val('sn-k'), tid = val('sn-t'), pid = val('sn-p'), v = num('sn-v', 1), p = pid ? player(tid, pid) : null;
    if (k === 'suspensao' && !pid) return toast('Escolha o jogador a suspender');
    const s = { id: uid(), compId: c.id, team: tid, player: pid || null, pname: p ? p.name : '', type: k, reason: val('sn-r'), at: Date.now(), auto: false };
    if (k === 'suspensao') s.games = Math.max(1, Math.floor(v)); if (k === 'multa') { s.amount = String(val('sn-v')); s.paid = false; } if (k === 'pontos') s.points = Math.max(1, Math.floor(v));
    db.sanctions.push(s); C.recomputeDeductions(db, c); save(); closeSheet(); render();
  },
  'sn-paid'(d) { const s = db.sanctions.find(x => x.id === d.id); s.paid = !s.paid; save(); render(); },
  'sn-del'(d) { if (!confirm('Anular/eliminar esta sanção?')) return; const s = db.sanctions.find(x => x.id === d.id); db.sanctions = db.sanctions.filter(x => x.id !== d.id); const c = comp(s.compId); if (c) C.recomputeDeductions(db, c); save(); render(); },
  /* dados */
  data() {
    sheet('⚙ Dados da aplicação', `<div class="sm mut" style="margin-bottom:12px">Tudo fica guardado só neste telemóvel. Faça cópias de segurança com regularidade.</div><button class="btn" data-a="exp">💾 Exportar cópia (ficheiro)</button><label class="btn" style="display:block;text-align:center;margin-top:8px">📥 Importar cópia<input type="file" accept=".json,application/json" id="imp" data-c="imp" hidden></label><button class="btn dng" data-a="reset" style="margin-top:8px">Apagar tudo</button><div class="sm mut" style="margin-top:14px">Para instalar: menu do navegador → "Adicionar ao ecrã principal".</div>`);
  },
  exp() { const b = new Blob([JSON.stringify(db)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'campeonato-backup-' + today() + '.json'; document.body.appendChild(a); a.click(); a.remove(); },
  reset() { if (confirm('Apagar TODOS os dados (equipas, campeonatos, treinos, sanções)?') && confirm('Tem a certeza? Não há volta.')) { db = { v: 1, teams: [], comps: [], sanctions: [], trainings: [] }; save(); closeSheet(); S = { tab: 'comps', comp: null, ctab: 'jogos', match: null, team: null, train: null, sanf: 'act' }; render(); } },
};
const m = () => curMatch()[1];
function finish(c, mm, pen) {
  C.T.end(mm); mm.status = 'done'; mm.doneAt = Date.now(); if (pen) mm.pen = pen;
  C.regenAuto(db, c, mm); save(); render();
  const n = db.sanctions.filter(s => s.matchId === mm.id).length; if (n) toast(`⛔ ${n} sanção(ões) automática(s) gerada(s)`);
}

/* ---------- Eventos globais ---------- */
document.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (!el) return; const f = A[el.dataset.a]; if (f) { e.preventDefault(); f(el.dataset, el); } });
document.addEventListener('change', e => {
  const c = e.target.dataset.c; if (!c) return;
  if (c === 'cn-f') compFormToggle();
  else if (c === 'man') { S.manual = S.manual || {}; S.manual[e.target.dataset.id] = +e.target.value; }
  else if (c === 'sp-t') splitList();
  else if (c === 'sn-c') sancFill('c'); else if (c === 'sn-t') sancFill('t');
  else if (c === 'sn-k') { const k = val('sn-k'); $('#sn-vl').textContent = { suspensao: 'Nº de jogos', multa: 'Valor', pontos: 'Pontos a retirar', adv: 'Valor (ignorado)' }[k]; }
  else if (c === 'tr-plan' || c === 'tr-notes') { const t = db.trainings.find(x => x.id === S.train); if (t) { t[c === 'tr-plan' ? 'plan' : 'notes'] = e.target.value; save(); toast('Guardado'); } }
  else if (c === 'imp') {
    const f = e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => { try { const d = JSON.parse(r.result); if (!d.teams || !d.comps) throw 0; if (!confirm('Substituir todos os dados atuais pela cópia importada?')) return; db = d; save(); closeSheet(); render(); toast('Importado'); } catch (x) { toast('Ficheiro inválido'); } };
    r.readAsText(f);
  }
});
document.addEventListener('input', e => { if (e.target.dataset.c === 'tr-plan' || e.target.dataset.c === 'tr-notes') { clearTimeout(input.t); input.t = setTimeout(() => e.target.dispatchEvent(new Event('change', { bubbles: true })), 900); } });
function input() {}

/* ---------- Relógio ao vivo ---------- */
const alerted = new Set();
function tick() {
  if (!S.match) return; const [c, mm] = curMatch(); if (!mm) return;
  const el = $('#clk'); if (el && mm.timer.running) el.innerHTML = clockHtml(c, mm);
  if (mm.timer.running) {
    const ms = C.clockMs(mm), lim = mm.timer.phase === 'h1' ? C.halfMs(c) : mm.timer.phase === 'h2' ? 2 * C.halfMs(c) : 0, k = mm.id + mm.timer.phase;
    if (lim && ms >= lim && !alerted.has(k)) { alerted.add(k); if (navigator.vibrate) navigator.vibrate([400, 150, 400]); toast('⏱ Tempo regulamentar completo — acréscimos?'); }
  }
}
setInterval(tick, 500);
let wl = null;
async function wake() { try { if (navigator.wakeLock) wl = await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { render(); if (S.match) wake(); } });

render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
