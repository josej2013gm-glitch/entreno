// =====================================================================
//  app.js — Interfaz de la aplicación
// =====================================================================
import { createStore } from './store.js';
import { DEFAULT_GEMINI_MODEL } from './config.js';
import * as A from './algorithm.js';
import * as AI from './ai.js';
import * as P from './pullups.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const km = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');

const S = {
  store: createStore(), user: null, settings: {}, sessions: [], plans: [], extras: [],
  charts: {}, view: 'panel', editing: null, draft: null, aiResult: null, extraDraft: null,
};
const today = () => A.isoDate(new Date());

// ------------------------------------------------------------------ util UI
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), ms); }
function modal(html) { $('#modal-body').innerHTML = html; $('#modal').classList.remove('hidden'); }
$('#modal-close').onclick = () => $('#modal').classList.add('hidden');
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); });
function pickFile() {
  return new Promise(res => { const fp = $('#filepicker'); fp.value = ''; fp.onchange = async () => { const f = fp.files[0]; if (!f) return res(null); try { res(JSON.parse(await f.text())); } catch { toast('El archivo no es un JSON válido'); res(null); } }; fp.click(); });
}
function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function chart(id, config) {
  if (typeof window.Chart === 'undefined') { const el = document.getElementById(id); if (el) el.parentElement.innerHTML = '<p class="muted small">Gráfico no disponible (sin conexión con el CDN de Chart.js).</p>'; return; }
  if (S.charts[id]) S.charts[id].destroy();
  const el = document.getElementById(id); if (!el) return;
  const css = getComputedStyle(document.documentElement);
  Chart.defaults.color = css.getPropertyValue('--muted').trim(); Chart.defaults.borderColor = css.getPropertyValue('--line').trim();
  S.charts[id] = new Chart(el, config);
}
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const semBadge = s => s?.semaforo?.color ? `<span class="badge ${A.SEMAFORO[s.semaforo.color].css}">${A.SEMAFORO[s.semaforo.color].label}</span>` : '';

// ------------------------------------------------------------------ datos
async function loadAll() {
  const [sessions, plans, extras, settings] = await Promise.all([S.store.list('sessions'), S.store.list('plans'), S.store.list('extras'), S.store.getSettings()]);
  S.sessions = sessions.sort((a, b) => a.date.localeCompare(b.date));
  S.plans = plans.sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  S.extras = extras.sort((a, b) => a.date.localeCompare(b.date));
  S.settings = { objective1000: 205, objective50: 7.0, model: DEFAULT_GEMINI_MODEL, ...settings };
}
async function saveSettings(patch) { S.settings = { ...S.settings, ...patch }; await S.store.saveSettings(S.settings); }
const activePlan = () => { const rp = S.plans.filter(p => !P.isPullPlan(p)); return rp.find(p => p.id === S.settings.activePlanId) || rp[0] || null; };
const doneMap = () => { const m = new Map(); for (const s of S.sessions) if (s.planRef?.sessionId) m.set(`${s.planRef.planId}|${s.planRef.sessionId}`, s); return m; };

// ------------------------------------------------------------------ router
const VIEWS = ['panel', 'plan', 'registrar', 'historial', 'extras', 'ia', 'ajustes'];
function go(view) { location.hash = view; }
function render() {
  const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'panel';
  S.view = v;
  $$('.view').forEach(el => el.classList.add('hidden'));
  $(`#view-${v}`).classList.remove('hidden');
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === v));
  ({ panel: renderPanel, plan: renderPlan, registrar: renderRegistrar, historial: renderHistorial, extras: renderExtras, ia: renderIA, ajustes: renderAjustes })[v]();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { if (S.user) render(); });

// ================================================================== PANEL
function renderPanel() {
  const el = $('#view-panel');
  const sims = A.simulacros1000(S.sessions), t50 = A.tests50(S.sessions);
  const last = sims.at(-1), best1000 = A.best(sims), best50 = A.best(t50);
  const obj1000 = Number(S.settings.objective1000), obj50 = Number(S.settings.objective50);
  const wp = A.workPace(S.settings, S.sessions), ladder = A.ladderState(S.sessions), vol = A.volumeAdvice(S.sessions);
  const weeks = A.weeklyVolume(S.sessions);
  const thisWeek = weeks.find(w => w.week === A.weekKey(today()));
  const plan = activePlan(); const dm = doneMap();
  const upcoming = plan ? plan.weeks.flatMap(w => w.sessions).filter(s => s.date >= today() && !dm.has(`${plan.id}|${s.id}`)).slice(0, 3) : [];
  const pplan = activePullPlan(); const pdm = pullDoneMap();
  const pullUp = pplan ? pplan.weeks.flatMap(w => w.sessions).filter(s => s.date >= today() && !pdm.has(`${pplan.id}|${s.id}`)).slice(0, 2) : [];
  const lastJump = S.extras.filter(e => e.kind === 'salto'), lastPull = S.extras.filter(e => e.kind === 'dominadas');
  const bestJump = lastJump.length ? Math.max(...lastJump.map(e => e.best || 0)) : null;
  const bestPull = lastPull.length ? Math.max(...lastPull.map(e => e.best || 0)) : null;

  if (!S.sessions.length && !S.plans.length) {
    el.innerHTML = `<div class="card"><h1>¡Bienvenido!</h1><p>Aún no hay datos. Para empezar:</p>
      <ol><li>Importa tu historial (94 sesiones de 2026) desde <a href="#historial">Historial</a>.</li>
      <li>Carga el plan Bloque I desde <a href="#plan">Plan</a>.</li><li>Revisa tus objetivos y la API key de Google AI en <a href="#ajustes">Ajustes</a>.</li></ol>
      <div class="row"><button class="btn primary" id="q-hist">Importar historial incluido</button><button class="btn" id="q-plan">Cargar plan Bloque I</button></div></div>`;
    $('#q-hist').onclick = importHistorial; $('#q-plan').onclick = loadBundledPlan; return;
  }
  el.innerHTML = `
  <div class="kpis">
    <div class="kpi"><div class="label">Último 1000 m</div><div class="value">${last ? A.fmtTime(last.time) : '—'}</div><div class="sub">Objetivo ${A.fmtTime(obj1000)}${last ? ` · faltan ${Math.max(0, last.time - obj1000)} s` : ''}${best1000 && last && best1000.time < last.time ? ` · mejor ${A.fmtTime(best1000.time)}` : ''}</div></div>
    <div class="kpi"><div class="label">Mejor 50 m</div><div class="value">${best50 ? A.fmtTime(best50.time, { short: true }) + ' s' : '—'}</div><div class="sub">Objetivo ${obj50.toFixed(2).replace('.', ',')} s${best50 ? ` · faltan ${Math.max(0, best50.time - obj50).toFixed(2).replace('.', ',')} s` : ''}</div></div>
    <div class="kpi"><div class="label">Km esta semana</div><div class="value">${km(thisWeek?.km || 0)}</div><div class="sub">Máx. recomendado ${vol.maxNext != null ? km(vol.maxNext) : '—'} km${vol.deload ? ' (descarga)' : ''}</div></div>
    <div class="kpi"><div class="label">Calidad (4 sem.)</div><div class="value">${vol.qualityPct ?? '—'} %</div><div class="sub">Rango ideal 20–25 %</div></div>
    <div class="kpi"><div class="label">Ritmo de trabajo</div><div class="value">${A.fmtTime(Math.round(wp.rp))}/km</div><div class="sub">400 m en ${A.fmtTime(A.targetFor(400, wp.rp))}</div></div>
    <div class="kpi"><div class="label">Escalera 1000</div><div class="value">Nivel ${ladder.next}</div><div class="sub">${esc(A.LADDER[ladder.next].name)}</div></div>
    ${bestJump != null ? `<div class="kpi"><div class="label">Mejor salto pies juntos</div><div class="value">${bestJump} cm</div><div class="sub">${lastJump.length} sesiones</div></div>` : ''}
    ${bestPull != null ? `<div class="kpi"><div class="label">Mejor serie dominadas</div><div class="value">${bestPull} reps</div><div class="sub">${lastPull.length} sesiones</div></div>` : ''}
  </div>
  <div class="grid grid-2">
    <div class="card"><h2>Próximos entrenamientos</h2>${upcoming.length ? upcoming.map(s => psCard(plan, s, null)).join('') : `<p class="muted">${plan ? 'No quedan sesiones pendientes en el plan activo.' : 'No hay plan cargado.'} <a href="#${plan ? 'ia' : 'plan'}">${plan ? 'Planifica el siguiente bloque' : 'Cargar plan'}</a></p>`}
      ${pullUp.length ? `<h3 style="margin-top:12px">Dominadas</h3>${pullUp.map(s => pullCard(pplan, s, null)).join('')}` : ''}</div>
    <div class="card"><h2>Algoritmo · qué toca ahora</h2>
      <p><b>Escalera:</b> ${esc(ladder.reason)} Próxima sesión específica: <b>nivel ${ladder.next}</b> — ${esc(A.LADDER[ladder.next].desc)}.</p>
      <p><b>Volumen:</b> ${esc(vol.reason)}</p>
      <p><b>Ritmos:</b> ${esc(wp.reason)}.</p>
      <div class="table-wrap"><table class="table"><tr>${A.paceTable(wp.rp).map(p => `<th>${p.dist} m</th>`).join('')}</tr><tr>${A.paceTable(wp.rp).map(p => `<td>${A.fmtTime(Math.round(p.target))}</td>`).join('')}</tr></table></div>
    </div>
  </div>
  <div class="card"><h2>Volumen semanal (últimas 20 semanas)</h2><div class="chart-box"><canvas id="ch-vol"></canvas></div></div>
  <div class="grid grid-2">
    <div class="card"><h2>Simulacros 1000 m</h2><div class="chart-box"><canvas id="ch-1000"></canvas></div></div>
    <div class="card"><h2>Tests 50 m</h2><div class="chart-box"><canvas id="ch-50"></canvas></div></div>
  </div>`;
  bindPsButtons(el);
  const w20 = weeks.slice(-20);
  const accent = cssVar('--accent'), muted = '#b9c0cb';
  chart('ch-vol', { type: 'bar', data: { labels: w20.map(w => A.fmtDate(w.week).slice(0, 5)), datasets: [
    { label: 'Rodaje / calentamiento', data: w20.map(w => +(w.km - w.quality).toFixed(2)), backgroundColor: muted, stack: 'a' },
    { label: 'Calidad', data: w20.map(w => w.quality), backgroundColor: accent, stack: 'a' }] },
    options: { maintainAspectRatio: false, scales: { y: { title: { display: true, text: 'km' } } }, plugins: { tooltip: { callbacks: { footer: it => `Total: ${km(w20[it[0].dataIndex].km)} km` } } } } });
  const timeAxis = (fmt) => ({ ticks: { callback: v => fmt(v) } });
  chart('ch-1000', { type: 'line', data: { labels: sims.map(s => A.fmtDate(s.date).slice(0, 5)), datasets: [
    { label: '1000 m', data: sims.map(s => s.time), borderColor: accent, backgroundColor: accent, tension: .2 },
    { label: 'Objetivo', data: sims.map(() => obj1000), borderColor: cssVar('--red'), borderDash: [6, 4], pointRadius: 0 }] },
    options: { maintainAspectRatio: false, scales: { y: timeAxis(v => A.fmtTime(v)) }, plugins: { tooltip: { callbacks: { label: c => `${c.dataset.label}: ${A.fmtTime(c.parsed.y)}` } } } } });
  chart('ch-50', { type: 'line', data: { labels: t50.map(s => A.fmtDate(s.date).slice(0, 5)), datasets: [
    { label: '50 m', data: t50.map(s => s.time), borderColor: accent, backgroundColor: accent, tension: .2 },
    { label: 'Objetivo', data: t50.map(() => obj50), borderColor: cssVar('--red'), borderDash: [6, 4], pointRadius: 0 }] },
    options: { maintainAspectRatio: false, scales: { y: timeAxis(v => v.toFixed(2).replace('.', ',') + ' s') } } });
}

// ================================================================== PLAN
const runPlans = () => S.plans.filter(p => !P.isPullPlan(p));
const pullPlans = () => S.plans.filter(P.isPullPlan);
const activePullPlan = () => pullPlans().find(p => p.id === S.settings.activePullPlanId) || pullPlans()[0] || null;
const pullDoneMap = () => { const m = new Map(); for (const e of S.extras) if (e.planRef?.sessionId) m.set(`${e.planRef.planId}|${e.planRef.sessionId}`, e); return m; };

function psCard(plan, s, dm) {
  const done = dm ? dm.get(`${plan.id}|${s.id}`) : null;
  return `<div class="ps ${done ? 'done' : ''} ${s.date === today() ? 'today' : ''}">
    <div class="date">${esc(s.dow || A.dowOf(s.date))} ${A.fmtDate(s.date)} · <span class="badge grey">${esc(A.SESSION_TYPES[s.type] || s.type)}</span>${s.ladderLevel ? ` <span class="badge">Nivel ${s.ladderLevel}</span>` : ''}</div>
    <div class="title">${esc(s.title)}</div>
    <div class="content">${esc(s.content)}</div>
    ${s.targets && s.targets !== '—' ? `<div class="targets">🎯 ${esc(s.targets)}</div>` : ''}
    ${s.km ? `<div class="small muted">≈ ${km(s.km)} km</div>` : ''}
    <div class="actions">${done ? `<span class="badge green">✓ Hecho</span> ${semBadge(done)} <span class="small muted">${esc(A.summarize(done))}</span>` : `<button class="btn small primary" data-reg="${esc(plan.id)}|${esc(s.id)}">Registrar</button>`}</div>
  </div>`;
}
const evalBadge = e => (e?.evaluation ? `<span class="badge ${e.evaluation.ok ? 'green' : 'amber'}">${e.evaluation.ok ? 'CUMPLIDO' : 'INCOMPLETO'}</span>` : '');
function pullCard(plan, s, dm) {
  const done = dm ? dm.get(`${plan.id}|${s.id}`) : null;
  return `<div class="ps ${done ? 'done' : ''} ${s.date === today() ? 'today' : ''}">
    <div class="date">${esc(s.dow)} ${A.fmtDate(s.date)} · <span class="badge grey">Dominadas</span>${s.test ? ' <span class="badge">Test</span>' : ''}</div>
    <div class="title">${esc(s.title)}</div>
    <div class="targets">🎯 ${esc(P.setsText(s.sets))}</div>
    ${s.content ? `<div class="content">${esc(s.content)}</div>` : ''}
    ${s.sets.length > 1 ? `<div class="small muted">Descanso entre series: ${P.restText(s.rest)}</div>` : ''}
    ${s.complementary.length ? `<div class="small">+ ${s.complementary.map(c => `<b>${esc(c.group ? c.group[0].toUpperCase() + c.group.slice(1) : '')}</b> ${esc(c.name)}`).join(' · ')}</div>` : ''}
    ${s.after ? `<div class="small muted">${esc(s.after)}</div>` : ''}
    <div class="actions">${done ? `<span class="badge green">✓ Hecho</span> ${evalBadge(done)} <span class="small muted">${done.sets.map(x => x.values.join('')).join(' · ')} reps</span>` : `<button class="btn small primary" data-pull="${esc(plan.id)}|${esc(s.id)}">Registrar</button>`}</div>
  </div>`;
}
function bindPsButtons(root) {
  $$('[data-reg]', root).forEach(b => b.onclick = () => {
    const [pid, sid] = b.dataset.reg.split('|'); const plan = S.plans.find(p => p.id === pid);
    const ps = plan?.weeks.flatMap(w => w.sessions).find(x => x.id === sid); if (!ps) return;
    S.editing = null; S.draft = draftFromPlanned(plan, ps); go('registrar');
  });
  $$('[data-pull]', root).forEach(b => b.onclick = () => {
    const [pid, sid] = b.dataset.pull.split('|'); const plan = S.plans.find(p => p.id === pid);
    const ps = plan?.weeks.flatMap(w => w.sessions).find(x => x.id === sid); if (!ps) return;
    S.extraDraft = pullDraftFromPlanned(plan, ps); go('extras');
  });
}
function renderPlan() {
  const el = $('#view-plan'); const tab = S.planTab || 'carrera';
  const tabs = `<div class="row" style="margin-bottom:12px"><button class="btn ${tab === 'carrera' ? 'primary' : ''}" data-tab="carrera">🏃 Carrera</button><button class="btn ${tab === 'dominadas' ? 'primary' : ''}" data-tab="dominadas">💪 Dominadas</button></div>`;
  el.innerHTML = tabs + (tab === 'carrera' ? runPlanHTML() : pullPlanHTML());
  $$('[data-tab]', el).forEach(b => b.onclick = () => { S.planTab = b.dataset.tab; renderPlan(); });
  if (tab === 'carrera') bindRunPlan(); else bindPullPlan();
  bindPsButtons(el);
}
function runPlanHTML() {
  const plan = activePlan(); const dm = doneMap(); const plans = runPlans();
  const total = plan ? plan.weeks.flatMap(w => w.sessions) : []; const done = total.filter(s => dm.has(`${plan.id}|${s.id}`)).length;
  return `<div class="card"><div class="row between"><h1>Plan de carrera</h1>
    <div class="row">${plans.length ? `<select id="plan-sel" style="width:auto">${plans.map(p => `<option value="${esc(p.id)}" ${plan && p.id === plan.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}</div></div>
    <div class="row"><button class="btn primary" id="pl-bundled">Cargar plan Bloque I (incluido)</button><button class="btn" id="pl-import">Importar plan (.json)</button>
    ${plan ? `<button class="btn" id="pl-export">Exportar plan</button><button class="btn danger" id="pl-del">Eliminar plan</button>` : ''}</div>
    ${plan ? `<p class="muted small">${esc(plan.notes || plan.summary || '')}</p><p><b>${done}/${total.length}</b> sesiones registradas · ${A.fmtDate(plan.start)} → ${A.fmtDate(plan.end)} · origen: ${plan.source === 'ia' ? 'IA (' + esc(plan.model || '') + ')' : 'informe'}</p>` : ''}
  </div>
  ${plan ? plan.weeks.map(w => `<div class="week"><div class="week-head"><h2>Semana ${w.n} · ${esc(w.title || '')}</h2><span class="muted small">${esc(w.focus || '')}</span></div>
    <div class="sessions">${w.sessions.map(s => psCard(plan, s, dm)).join('')}</div></div>`).join('') : '<div class="empty">No hay ningún plan de carrera cargado todavía.</div>'}`;
}
function bindRunPlan() {
  const plan = activePlan();
  $('#pl-bundled').onclick = loadBundledPlan;
  $('#pl-import').onclick = async () => { const j = await pickFile(); if (j) await savePlan(j, 'importado'); };
  if (plan) {
    $('#plan-sel').onchange = async e => { await saveSettings({ activePlanId: e.target.value }); renderPlan(); };
    $('#pl-export').onclick = () => download(`plan-${plan.start}.json`, plan);
    $('#pl-del').onclick = async () => { if (!confirm(`¿Eliminar el plan "${plan.name}"? Las sesiones ya registradas se conservan.`)) return; await S.store.del('plans', plan.id); S.plans = S.plans.filter(p => p.id !== plan.id); await saveSettings({ activePlanId: runPlans()[0]?.id || null }); renderPlan(); };
  }
}
function pullPlanHTML() {
  const plan = activePullPlan(); const dm = pullDoneMap(); const plans = pullPlans();
  const total = plan ? plan.weeks.flatMap(w => w.sessions) : []; const done = total.filter(s => dm.has(`${plan.id}|${s.id}`)).length;
  return `<div class="card"><div class="row between"><h1>Plan de dominadas</h1>
    <div class="row">${plans.length ? `<select id="pull-sel" style="width:auto">${plans.map(p => `<option value="${esc(p.id)}" ${plan && p.id === plan.id ? 'selected' : ''}>${esc(p.name)} (${A.fmtDate(p.start)})</option>`).join('')}</select>` : ''}</div></div>
    <p class="small muted">Lo planificas tú y lo añades con un archivo JSON. Añadir un plan nunca borra los que ya tienes ni el plan de carrera. La planificación con IA no lo modifica.</p>
    <div class="row"><button class="btn primary" id="pu-import">Añadir plan de dominadas (.json)</button><button class="btn" id="pu-bundled">Añadir plan inicial (incluido)</button>
    ${plan ? `<button class="btn" id="pu-export">Exportar plan</button><button class="btn danger" id="pu-del">Eliminar este plan</button>` : ''}</div>
    ${plan ? `<p><b>${done}/${total.length}</b> sesiones registradas · ${A.fmtDate(plan.start)} → ${A.fmtDate(plan.end)}</p>
      ${(plan.notes || []).length ? `<details open><summary>Descansos y normas</summary><ul class="small">${[].concat(plan.notes).map(n => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}
      ${(plan.complementary || []).length ? `<details><summary>Trabajo complementario (agarre y core)</summary><ul class="small">${plan.complementary.map(c => `<li><b>${esc(c.name)}</b>: ${esc(P.compText(c))}${(c.cues || []).length ? ` — ${esc(c.cues.join('; '))}` : ''}</li>`).join('')}</ul></details>` : ''}` : ''}
  </div>
  ${plan ? plan.weeks.map(w => `<div class="week"><div class="week-head"><h2>${esc(w.title || `Semana ${w.n}`)}</h2><span class="muted small">${esc(w.focus || '')}</span></div>
    <div class="sessions">${w.sessions.map(s => pullCard(plan, s, dm)).join('')}</div></div>`).join('') : '<div class="empty">No hay ningún plan de dominadas. Pulsa «Añadir plan de dominadas (.json)».</div>'}`;
}
function bindPullPlan() {
  const plan = activePullPlan();
  $('#pu-import').onclick = async () => { const j = await pickFile(); if (j) await addPullPlan(j); };
  $('#pu-bundled').onclick = async () => {
    let j = null;
    try { const r = await fetch('data/plan-dominadas-1.json', { cache: 'no-store' }); if (!r.ok) throw new Error(); j = await r.json(); }
    catch { if (!confirm('No se encuentra data/plan-dominadas-1.json en la web.\n\n¿Quieres elegir el archivo desde tu dispositivo?')) return; j = await pickFile(); }
    if (j) await addPullPlan(j);
  };
  if (plan) {
    $('#pull-sel').onchange = async e => { await saveSettings({ activePullPlanId: e.target.value }); renderPlan(); };
    $('#pu-export').onclick = () => download(`plan-dominadas-${plan.start}.json`, plan);
    $('#pu-del').onclick = async () => { if (!confirm(`¿Eliminar el plan "${plan.name}"? Los registros de dominadas ya guardados se conservan.`)) return; await S.store.del('plans', plan.id); S.plans = S.plans.filter(p => p.id !== plan.id); await saveSettings({ activePullPlanId: pullPlans()[0]?.id || null }); renderPlan(); };
  }
}
async function addPullPlan(raw) {
  let plan;
  try { plan = P.normalizePullPlan(raw); } catch (e) { toast(e.message, 5000); return null; }
  const dup = pullPlans().find(p => p.name === plan.name && p.start === plan.start);
  if (dup && !confirm(`Ya tienes un plan de dominadas "${plan.name}" con la misma fecha de inicio.\n\n¿Añadirlo igualmente como otro plan? (no se borra ni sustituye nada)`)) return null;
  const saved = await S.store.put('plans', plan); // id nuevo: siempre se AÑADE
  S.plans = [saved, ...S.plans].sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  await saveSettings({ activePullPlanId: saved.id });
  S.planTab = 'dominadas'; toast(`Plan de dominadas añadido: ${saved.name}`);
  if (S.view === 'plan') renderPlan(); else go('plan');
  return saved;
}
async function savePlan(raw, label) {
  if (raw && raw.discipline === 'dominadas') return addPullPlan(raw);
  if (!raw || !Array.isArray(raw.weeks)) { toast('El JSON no tiene el formato de plan (falta "weeks")'); return null; }
  const plan = A.normalizePlan(raw);
  const existing = runPlans().find(p => p.name === plan.name && p.start === plan.start);
  if (existing && !confirm(`Ya existe "${plan.name}". ¿Sustituirlo?`)) return null;
  const saved = await S.store.put('plans', { ...plan, discipline: 'carrera', id: existing?.id || plan.id });
  S.plans = [saved, ...S.plans.filter(p => p.id !== saved.id)].sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  await saveSettings({ activePlanId: saved.id });
  S.planTab = 'carrera'; toast(`Plan ${label}: ${saved.name}`); if (S.view === 'plan') renderPlan(); else go('plan');
  return saved;
}
async function loadBundledPlan() {
  try { const r = await fetch('data/plan-bloque1.json', { cache: 'no-store' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); await savePlan({ ...(await r.json()), id: 'bloque-1-2026' }, 'cargado'); }
  catch (e) {
    if (!confirm('No se encuentra data/plan-bloque1.json en la web (¿no subiste la carpeta data?).\n\n¿Quieres elegir el archivo plan-bloque1.json desde tu dispositivo?')) return;
    const j = await pickFile(); if (j) await savePlan({ ...j, id: 'bloque-1-2026' }, 'cargado');
  }
}

// ================================================================== REGISTRAR
const blankSeg = (kind = 'serie') => ({ kind, dist: '', time: '', target: '', rest: '', splits: '' });
function draftFromPlanned(plan, ps) {
  return { date: ps.date <= today() ? ps.date : today(), plannedDate: ps.date, type: ps.type, title: ps.title, ladderLevel: ps.ladderLevel || '',
    planRef: { planId: plan.id, sessionId: ps.id }, rpe: '', pain: '', notes: '', evaluate: !!ps.evaluate,
    segments: ps.prefill.length ? ps.prefill.map(g => ({ kind: g.kind, dist: g.dist, time: '', target: g.target != null ? A.fmtTime(g.target, { short: g.dist <= 100 }) : '', rest: g.rest != null ? A.fmtTime(g.rest) : '', splits: '' })) : [],
    hint: `${ps.content}${ps.targets && ps.targets !== '—' ? ` · 🎯 ${ps.targets}` : ''}` };
}
function draftFromSession(s) {
  return { ...s, segments: (s.segments || []).map(g => ({ kind: g.kind, dist: g.dist, time: g.time != null ? A.fmtTime(Number(g.time), { short: g.dist <= 100 }) : '',
    target: g.target != null ? A.fmtTime(Number(g.target), { short: g.dist <= 100 }) : '', rest: g.rest != null ? A.fmtTime(Number(g.rest)) : '', splits: (g.splits || []).map(x => A.fmtTime(x)).join(' '), excluded: g.excluded })),
    rpe: s.rpe ?? '', pain: s.pain ?? '', ladderLevel: s.ladderLevel || '' };
}
function renderRegistrar() {
  const el = $('#view-registrar');
  if (!S.draft) S.draft = { date: today(), type: 'series', title: '', ladderLevel: '', rpe: '', pain: '', notes: '', segments: [blankSeg('calentamiento'), blankSeg()], planRef: null };
  const d = S.draft; const plan = activePlan(); const dm = doneMap();
  const pending = plan ? plan.weeks.flatMap(w => w.sessions).filter(s => !dm.has(`${plan.id}|${s.id}`) || (d.planRef && d.planRef.sessionId === s.id)) : [];
  el.innerHTML = `<div class="card">
    <div class="row between"><h1>${S.editing ? 'Editar sesión' : 'Registrar entrenamiento'}</h1>${S.editing || d.planRef ? '<button class="btn small" id="r-new">Nueva sesión libre</button>' : ''}</div>
    ${d.hint ? `<p class="small" style="background:var(--accent-soft);padding:8px 10px;border-radius:8px">📋 ${esc(d.hint)}</p>` : ''}
    <div class="form-grid">
      <div class="field"><label>Fecha</label><input type="date" id="r-date" value="${esc(d.date)}"></div>
      <div class="field"><label>Tipo</label><select id="r-type">${Object.entries(A.SESSION_TYPES).map(([k, v]) => `<option value="${k}" ${d.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>Sesión del plan</label><select id="r-plan"><option value="">— Entrenamiento libre —</option>${pending.map(s => `<option value="${esc(s.id)}" ${d.planRef?.sessionId === s.id ? 'selected' : ''}>${A.fmtDate(s.date)} · ${esc(s.title)}</option>`).join('')}</select></div>
      <div class="field"><label>Nivel escalera (solo específico 1000)</label><select id="r-level"><option value="">—</option>${A.LADDER.slice(1).map(l => `<option value="${l.level}" ${Number(d.ladderLevel) === l.level ? 'selected' : ''}>N${l.level} · ${esc(l.name)}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Título (opcional)</label><input id="r-title" value="${esc(d.title || '')}" placeholder="p. ej. 6×400 en pista"></div>
  </div>
  <div class="card"><div class="row between"><h2>Partes de la sesión</h2><span class="muted small">Tiempo: m:ss (1:23) · 50 m en s,cc (7,15) · Recuperación previa: m:ss</span></div>
    <div id="r-segs"></div>
    <div class="row"><button class="btn small" id="r-add">+ Añadir parte</button>
      <span class="muted small">Añadir</span><input id="q-n" type="number" min="1" value="4" style="width:64px"><span class="muted small">×</span>
      <input id="q-d" type="number" placeholder="m" style="width:80px"><input id="q-t" placeholder="objetivo" style="width:90px"><input id="q-r" placeholder="rec." style="width:80px">
      <button class="btn small" id="q-add">+ Series iguales</button></div>
  </div>
  <div class="card"><div class="form-grid">
      <div class="field"><label>Esfuerzo percibido RPE (1–10)</label><input type="number" min="1" max="10" id="r-rpe" value="${esc(d.rpe)}"></div>
      <div class="field"><label>Molestia rodilla (0–10)</label><input type="number" min="0" max="10" id="r-pain" value="${esc(d.pain)}"></div>
    </div>
    <div class="field"><label>Notas (sensaciones, FC, calzado, superficie, sueño…)</label><textarea id="r-notes">${esc(d.notes || '')}</textarea></div>
    <div class="row"><button class="btn primary big" id="r-save">${S.editing ? 'Guardar cambios' : 'Guardar sesión'}</button><span id="r-total" class="muted"></span></div>
  </div>`;
  renderSegs();
  const sync = () => { d.date = $('#r-date').value; d.type = $('#r-type').value; d.title = $('#r-title').value; d.ladderLevel = $('#r-level').value; d.rpe = $('#r-rpe').value; d.pain = $('#r-pain').value; d.notes = $('#r-notes').value; };
  ['#r-date', '#r-type', '#r-title', '#r-level', '#r-rpe', '#r-pain', '#r-notes'].forEach(s => $(s).addEventListener('input', sync));
  $('#r-plan').onchange = e => {
    sync(); const sid = e.target.value;
    if (!sid) { d.planRef = null; d.hint = ''; renderRegistrar(); return; }
    const ps = plan.weeks.flatMap(w => w.sessions).find(s => s.id === sid);
    const keepDate = d.date; S.draft = draftFromPlanned(plan, ps); S.draft.date = keepDate; renderRegistrar();
  };
  $('#r-add').onclick = () => { sync(); d.segments.push(blankSeg()); renderSegs(); };
  $('#q-add').onclick = () => { sync(); const n = Number($('#q-n').value) || 1, dist = $('#q-d').value; if (!dist) return toast('Indica la distancia');
    for (let i = 0; i < n; i++) d.segments.push({ ...blankSeg(), dist, target: $('#q-t').value, rest: $('#q-r').value }); renderSegs(); };
  if ($('#r-new')) $('#r-new').onclick = () => { S.editing = null; S.draft = null; renderRegistrar(); };
  $('#r-save').onclick = () => { sync(); saveDraft(); };
}
function renderSegs() {
  const d = S.draft; const box = $('#r-segs');
  box.innerHTML = d.segments.map((g, i) => {
    const t = A.parseTime(g.time), p = A.paceOf(Number(g.dist), t), tg = A.parseTime(g.target);
    const diff = t != null && tg != null ? Math.round((t - tg) * 10) / 10 : null;
    return `<div class="seg" data-i="${i}">
      <div class="kind"><label>Parte ${i + 1}</label><select data-f="kind">${Object.entries(A.SEGMENT_KINDS).map(([k, v]) => `<option value="${k}" ${g.kind === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      <div><label>Metros</label><input data-f="dist" type="number" inputmode="numeric" value="${esc(g.dist)}"></div>
      <div><label>Tiempo</label><input data-f="time" inputmode="decimal" value="${esc(g.time)}" placeholder="${g.kind === 'test50' || g.kind === 'sprint' ? '7,15' : '1:23'}"></div>
      <div><label>Objetivo</label><input data-f="target" inputmode="decimal" value="${esc(g.target)}" placeholder="opcional"></div>
      <div><label>Rec. previa</label><input data-f="rest" inputmode="decimal" value="${esc(g.rest)}" placeholder="2:00"></div>
      <div><button class="btn small danger" data-del="${i}" title="Quitar">✕</button></div>
      ${g.kind === 'test1000' ? `<div class="splits"><label>Parciales 400 / 400 / 200 (separados por espacios)</label><input data-f="splits" value="${esc(g.splits)}" placeholder="1:22 1:23 0:40"></div>` : ''}
      <div class="info">${p ? `Ritmo ${A.fmtPace(p)}` : ''}${diff != null ? ` · ${diff > 0 ? '+' : ''}${String(diff).replace('.', ',')} s vs objetivo ${Math.abs(diff) <= 1 ? '✅' : diff > 2 ? '🔴' : diff > 1 ? '🟠' : '⚡'}` : ''}${g.excluded ? ' · excluido de estadísticas' : ''}</div>
    </div>`;
  }).join('') || '<p class="muted">Sin partes. Una sesión de fuerza puede guardarse solo con notas.</p>';
  $$('.seg', box).forEach(row => {
    const i = Number(row.dataset.i);
    $$('[data-f]', row).forEach(inp => inp.addEventListener('change', () => { d.segments[i][inp.dataset.f] = inp.value; if (inp.dataset.f === 'kind') renderSegs(); else updateInfo(); }));
    $$('[data-f]', row).forEach(inp => inp.addEventListener('input', () => { d.segments[i][inp.dataset.f] = inp.value; }));
  });
  $$('[data-del]', box).forEach(b => b.onclick = () => { d.segments.splice(Number(b.dataset.del), 1); renderSegs(); });
  updateInfo();
  function updateInfo() {
    const tot = d.segments.reduce((a, g) => a + (Number(g.dist) || 0), 0) / 1000;
    if ($('#r-total')) $('#r-total').textContent = `Total ${km(tot)} km`;
    $$('.seg', box).forEach(row => { const g = d.segments[Number(row.dataset.i)]; const t = A.parseTime(g.time), p = A.paceOf(Number(g.dist), t), tg = A.parseTime(g.target);
      const diff = t != null && tg != null ? Math.round((t - tg) * 10) / 10 : null;
      $('.info', row).textContent = `${p ? `Ritmo ${A.fmtPace(p)}` : ''}${diff != null ? ` · ${diff > 0 ? '+' : ''}${String(diff).replace('.', ',')} s vs objetivo ${Math.abs(diff) <= 1 ? '✅' : diff > 2 ? '🔴' : diff > 1 ? '🟠' : '⚡'}` : ''}`; });
  }
}
async function saveDraft() {
  const d = S.draft;
  if (!d.date) return toast('Indica la fecha');
  const segments = [];
  for (const [i, g] of d.segments.entries()) {
    if (!g.dist && !g.time) continue;
    const dist = Number(g.dist); const time = A.parseTime(g.time); const target = A.parseTime(g.target); const rest = A.parseTime(g.rest);
    if (!dist) return toast(`Parte ${i + 1}: falta la distancia`);
    if (g.time && time == null) return toast(`Parte ${i + 1}: tiempo no válido (usa 1:23 o 7,15)`);
    const seg = { kind: g.kind, dist, time };
    if (target != null) seg.target = target; if (rest != null) seg.rest = rest; if (g.excluded) seg.excluded = true;
    if (g.kind === 'test1000' && g.splits) seg.splits = g.splits.trim().split(/[\s;/]+/).map(A.parseTime).filter(x => x != null);
    segments.push(seg);
  }
  const session = { ...(S.editing ? S.sessions.find(s => s.id === S.editing) : {}), date: d.date, type: d.type, title: d.title || '', segments,
    rpe: num(d.rpe), pain: num(d.pain), notes: d.notes || '', ladderLevel: num(d.ladderLevel), planRef: d.planRef || null, source: S.editing ? (d.source || 'app') : 'app' };
  const ev = A.evaluateSession(session);
  session.semaforo = ev ? { color: ev.color, detail: ev.detail } : null;
  const saved = await S.store.put('sessions', session);
  S.sessions = [...S.sessions.filter(s => s.id !== saved.id), saved].sort((a, b) => a.date.localeCompare(b.date));
  S.editing = null; S.draft = null;
  showSavedResult(saved, ev);
}
function showSavedResult(s, ev) {
  const ladder = A.ladderState(S.sessions); const vol = A.volumeAdvice(S.sessions);
  const sem = ev ? A.SEMAFORO[ev.color] : null;
  const sims = A.simulacros1000(S.sessions); const isSim = (s.segments || []).some(g => g.kind === 'test1000');
  modal(`<h2>Sesión guardada ✓</h2><p>${A.fmtDate(s.date)} · ${esc(A.summarize(s))} · ${km(A.sessionKm(s))} km</p>
    ${sem ? `<div class="semaforo ${sem.css}"><div class="big">Semáforo: ${sem.label}</div><div class="small">${esc(ev.detail)}</div><p>${esc(sem.rec)}</p></div>` : '<p class="muted small">Sin series con objetivo: no se evalúa con semáforo.</p>'}
    ${s.ladderLevel ? `<p><b>Escalera:</b> ${esc(ladder.reason)} Próxima sesión específica: nivel ${ladder.next} (${esc(A.LADDER[ladder.next].desc)}).</p>` : ''}
    ${isSim ? `<p><b>Simulacro registrado.</b> Nuevo ritmo de trabajo: ${A.fmtTime(Math.round(A.workPace(S.settings, S.sessions).rp))}/km. ${A.aiAvailability(S.sessions, runPlans()).ok ? 'Ya puedes <a href="#ia">planificar el siguiente bloque con IA</a>.' : ''}</p>` : ''}
    <p class="small muted">Volumen: ${esc(vol.reason)} Máximo próxima semana: ${vol.maxNext != null ? km(vol.maxNext) + ' km' : '—'}.</p>`);
  go(s.planRef ? 'plan' : 'historial');
}

// ================================================================== HISTORIAL
function renderHistorial() {
  const el = $('#view-historial');
  const f = S.histFilter || { type: '', q: '' };
  const list = [...S.sessions].reverse().filter(s => (!f.type || s.type === f.type) && (!f.q || (A.summarize(s) + ' ' + (s.notes || '') + ' ' + s.date).toLowerCase().includes(f.q.toLowerCase())));
  const totalKm = S.sessions.reduce((a, s) => a + A.sessionKm(s), 0);
  el.innerHTML = `<div class="card"><div class="row between"><h1>Historial</h1><span class="muted">${S.sessions.length} sesiones · ${km(totalKm)} km</span></div>
    <div class="row"><button class="btn" id="h-import">Importar historial incluido (2026)</button><button class="btn" id="h-backup">Copia de seguridad (.json)</button><button class="btn" id="h-restore">Importar archivo (.json)</button></div>
    <p class="small muted">«Importar archivo» acepta una copia de seguridad, el historial.json o un plan.</p>
    <div class="form-grid" style="margin-top:10px"><div><label>Tipo</label><select id="h-type"><option value="">Todos</option>${Object.entries(A.SESSION_TYPES).map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div><label>Buscar</label><input id="h-q" value="${esc(f.q)}" placeholder="400, molestias, 2026-10…"></div></div></div>
  <div class="card table-wrap">${list.length ? `<table class="table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Contenido</th><th class="right">Km</th><th>RPE</th><th>Rodilla</th><th></th></tr></thead><tbody>
    ${list.slice(0, S.histLimit || 60).map(s => `<tr><td class="nowrap">${A.fmtDate(s.date)}</td><td><span class="badge grey">${esc(A.SESSION_TYPES[s.type] || s.type)}</span> ${semBadge(s)}</td>
      <td>${esc(s.title ? s.title + ': ' : '')}${esc(A.summarize(s))}${s.notes ? `<div class="small muted">${esc(s.notes)}</div>` : ''}</td><td class="right">${km(A.sessionKm(s))}</td><td>${s.rpe ?? ''}</td><td>${s.pain != null ? s.pain + '/10' : ''}</td>
      <td class="nowrap"><button class="btn small" data-edit="${esc(s.id)}">Editar</button> <button class="btn small danger" data-del="${esc(s.id)}">✕</button></td></tr>`).join('')}
    </tbody></table>${list.length > (S.histLimit || 60) ? '<div class="row" style="justify-content:center;margin-top:10px"><button class="btn" id="h-more">Ver más</button></div>' : ''}` : '<div class="empty">No hay sesiones.</div>'}</div>`;
  $('#h-type').onchange = e => { S.histFilter = { ...f, type: e.target.value }; renderHistorial(); };
  $('#h-q').onchange = e => { S.histFilter = { ...f, q: e.target.value }; renderHistorial(); };
  $('#h-import').onclick = importHistorial; $('#h-backup').onclick = backup; $('#h-restore').onclick = restore;
  if ($('#h-more')) $('#h-more').onclick = () => { S.histLimit = (S.histLimit || 60) + 100; renderHistorial(); };
  $$('[data-edit]', el).forEach(b => b.onclick = () => { const s = S.sessions.find(x => x.id === b.dataset.edit); S.editing = s.id; S.draft = draftFromSession(s); go('registrar'); });
  $$('[data-del]', el).forEach(b => b.onclick = async () => { if (!confirm('¿Eliminar esta sesión?')) return; await S.store.del('sessions', b.dataset.del); S.sessions = S.sessions.filter(s => s.id !== b.dataset.del); renderHistorial(); });
}
async function importHistorial() {
  let j = null;
  try {
    const r = await fetch('data/historial.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    j = await r.json();
  } catch (e) {
    if (!confirm('No se encuentra data/historial.json en la web (¿no subiste la carpeta data?).\n\n¿Quieres elegir el archivo historial.json desde tu dispositivo?')) return;
    j = await pickFile(); if (!j) return;
  }
  await importHistorialData(j);
}
async function importHistorialData(j) {
  if (!j || !Array.isArray(j.sessions)) return toast('El archivo no tiene el formato del historial (falta "sessions")', 4000);
  try {
    const already = S.sessions.filter(s => s.source === 'historial').length;
    if (already && !confirm(`Ya hay ${already} sesiones importadas del historial. ¿Volver a importarlas? (se sobrescriben, no se duplican)`)) return;
    toast('Importando…');
    const items = j.sessions.filter(s => s && s.date).map(s => { const o = { source: 'historial', ...s, id: s.id || `hist-${s.date}` }; const ev = A.evaluateSession(o); o.semaforo = o.semaforo || (ev && ev.color === 'parar' ? { color: ev.color, detail: ev.detail } : null); return o; });
    const saved = await S.store.putMany('sessions', items);
    const ids = new Set(saved.map(s => s.id));
    S.sessions = [...S.sessions.filter(s => !ids.has(s.id)), ...saved].sort((a, b) => a.date.localeCompare(b.date));
    toast(`${saved.length} sesiones importadas`); render();
  } catch (e) { toast('No se pudo importar: ' + e.message, 5000); }
}
async function backup() {
  const { geminiKey, ...settings } = S.settings;
  download(`entrenos-backup-${today()}.json`, { app: 'entrenos-policia-local', version: 1, exportedAt: new Date().toISOString(), settings, sessions: S.sessions, plans: S.plans, extras: S.extras });
}
async function restore() {
  const j = await pickFile(); if (!j) return;
  if (j.app !== 'entrenos-policia-local') {
    if (Array.isArray(j.sessions)) return importHistorialData(j);            // historial.json
    if (Array.isArray(j.weeks)) return savePlan(j, 'importado');              // un plan
    return toast('No es una copia de seguridad, un historial ni un plan de esta app', 4000);
  }
  if (!confirm(`Restaurar ${j.sessions?.length || 0} sesiones, ${j.plans?.length || 0} planes y ${j.extras?.length || 0} extras? Los registros con el mismo id se sobrescriben.`)) return;
  for (const c of ['sessions', 'plans', 'extras']) if (j[c]?.length) await S.store.putMany(c, j[c]);
  if (j.settings) await saveSettings({ ...j.settings, geminiKey: S.settings.geminiKey });
  await loadAll(); toast('Copia restaurada'); render();
}

// ================================================================== EXTRAS
const EXTRA_KINDS = { salto: { label: 'Salto de longitud a pies juntos', unit: 'cm' }, dominadas: { label: 'Dominadas', unit: 'reps' } };
const blankExtra = (kind = 'salto') => ({ date: today(), kind, weight: '', notes: '', sets: [{ values: '', rest: '' }] });
function pullDraftFromPlanned(plan, ps) {
  return { date: ps.date <= today() ? ps.date : today(), kind: 'dominadas', weight: '', notes: '',
    planRef: { planId: plan.id, sessionId: ps.id }, planned: { title: ps.title, date: ps.date, content: ps.content, sets: ps.sets, rest: ps.rest, test: ps.test, planName: plan.name },
    sets: ps.sets.map((x, i) => ({ values: '', rest: i ? A.fmtTime(ps.rest.min) : '', planned: x })),
    comp: ps.complementary.map(c => ({ ...c, values: Array.from({ length: c.sets }, () => ''), kg: '' })) };
}
function extraDraftFromRecord(e) {
  const d = { id: e.id, date: e.date, kind: e.kind, weight: e.weight ?? '', notes: e.notes || '', planRef: e.planRef || null, planned: e.planned || null,
    sets: e.sets.map((s, i) => ({ values: s.values.join(' '), rest: s.rest != null ? A.fmtTime(s.rest) : '', planned: e.planned?.sets?.[i] })),
    comp: (e.complementary || []).map(c => ({ ...c, values: Array.from({ length: Math.max(c.sets || 0, c.values.length) }, (_, i) => c.values[i] ?? ''), kg: c.kg ?? '' })) };
  // series planificadas que no se llegaron a registrar
  if (d.planned) for (let i = d.sets.length; i < d.planned.sets.length; i++) d.sets.push({ values: '', rest: '', planned: d.planned.sets[i] });
  return d;
}
function renderExtras() {
  const el = $('#view-extras');
  if (!S.extraDraft) S.extraDraft = blankExtra();
  const d = S.extraDraft; const unit = EXTRA_KINDS[d.kind].unit; const pl = d.planned;
  const hist = [...S.extras].reverse();
  el.innerHTML = `<div class="card"><div class="row between"><h1>Pruebas adicionales</h1>${pl ? '<button class="btn small" id="x-free">Registro libre</button>' : ''}</div>
    ${pl ? `<div class="semaforo" style="background:var(--accent-soft);border:1px solid var(--accent)"><b>💪 ${esc(pl.planName || 'Plan de dominadas')} · ${esc(pl.title)}</b> (${A.fmtDate(pl.date)})<br>
      🎯 ${esc(P.setsText(pl.sets))}${pl.sets.length > 1 ? ` · descanso ${P.restText(pl.rest)}` : ''}${pl.content ? `<div class="small">${esc(pl.content)}</div>` : ''}</div>`
      : '<p class="muted small">En salto anota la marca de cada intento (cm); en dominadas, las repeticiones de cada serie (pueden ser distintas). Para registrar una sesión del plan de dominadas, usa su botón «Registrar» en Plan → Dominadas.</p>'}
    <div class="form-grid" style="margin-top:10px"><div><label>Fecha</label><input type="date" id="x-date" value="${esc(d.date)}"></div>
      <div><label>Prueba</label><select id="x-kind" ${pl ? 'disabled' : ''}>${Object.entries(EXTRA_KINDS).map(([k, v]) => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      ${d.kind === 'dominadas' ? `<div><label>Lastre (kg, opcional)</label><input id="x-weight" type="number" step="0.5" value="${esc(d.weight)}"></div>` : ''}</div>
    <h3 style="margin-top:12px">Series</h3>
    <div id="x-sets">${d.sets.map((s, i) => `<div class="seg" style="grid-template-columns:auto 2fr 1fr auto" data-i="${i}"><div><label>Serie</label><b>${i + 1}</b></div>
      <div><label>${d.kind === 'salto' ? 'Marcas de cada salto (cm, separadas por espacios)' : `Repeticiones${s.planned ? ` · objetivo <b>${esc(P.setLabel(s.planned))}</b>` : ''}`}</label><input data-f="values" inputmode="decimal" value="${esc(s.values)}" placeholder="${d.kind === 'salto' ? '245 251 248' : s.planned ? (s.planned.max ? (s.planned.min ? `mín. ${s.planned.min}` : 'máx.') : String(s.planned.target)) : '8'}"></div>
      <div><label>Descanso previo</label><input data-f="rest" value="${esc(s.rest)}" placeholder="${i === 0 ? '—' : '2:00'}"></div>
      <div><button class="btn small danger" data-del="${i}">✕</button></div></div>`).join('')}</div>
    <div class="row"><button class="btn small" id="x-add">+ Añadir serie</button><span id="x-sum" class="muted small"></span></div>
    ${d.kind === 'dominadas' && (d.comp || []).length ? `<h3 style="margin-top:14px">Trabajo complementario</h3><div id="x-comp">${d.comp.map((c, ci) => `<div class="seg" style="grid-template-columns:1fr" data-ci="${ci}">
      <div><b>${esc(c.name)}</b> <span class="badge grey">${esc(c.group || '')}</span> <span class="small muted">${esc(P.compText(c))}${(c.cues || []).length ? ' · ' + esc(c.cues.join('; ')) : ''}</span></div>
      <div class="row">${c.values.map((v, vi) => `<div style="width:120px"><label>Serie ${vi + 1} (${c.unit === 's' ? 's' : esc(c.unit)})</label><input data-cv="${vi}" inputmode="decimal" value="${esc(v)}" placeholder="${esc(c.target)}"></div>`).join('')}
        ${c.hasLoad ? `<div style="width:120px"><label>Peso (kg/mano)</label><input data-ck="1" inputmode="decimal" value="${esc(c.kg)}" placeholder="10"></div>` : ''}</div></div>`).join('')}</div>` : ''}
    <div class="field" style="margin-top:10px"><label>Notas</label><textarea id="x-notes">${esc(d.notes)}</textarea></div>
    <button class="btn primary big" id="x-save">${d.id ? 'Guardar cambios' : 'Guardar'}</button> ${d.id ? '<button class="btn" id="x-cancel">Cancelar edición</button>' : ''}
  </div>
  <div class="grid grid-2"><div class="card"><h2>Salto a pies juntos (mejor por sesión)</h2><div class="chart-box"><canvas id="ch-salto"></canvas></div></div>
    <div class="card"><h2>Dominadas (total y mejor serie)</h2><div class="chart-box"><canvas id="ch-dom"></canvas></div></div></div>
  <div class="card table-wrap"><h2>Historial de extras</h2>${hist.length ? `<table class="table"><thead><tr><th>Fecha</th><th>Prueba</th><th>Series</th><th>Mejor</th><th>Total</th><th></th></tr></thead><tbody>
    ${hist.map(e => `<tr><td class="nowrap">${A.fmtDate(e.date)}</td><td>${esc(EXTRA_KINDS[e.kind]?.label || e.kind)}${e.weight ? ` (+${e.weight} kg)` : ''}${e.planned ? `<div class="small muted">${esc(e.planned.title)}</div>${evalBadge(e)}` : ''}</td>
      <td class="small">${e.sets.map((s, i) => `S${i + 1}: ${s.values.join(' · ')}${e.planned?.sets?.[i] ? ` <span class="muted">/ ${esc(P.setLabel(e.planned.sets[i]))}</span>` : ''}${s.rest ? ` <span class="muted">(rec. ${A.fmtTime(s.rest)})</span>` : ''}`).join('<br>')}
        ${(e.complementary || []).map(c => `<div>+ ${esc(c.name)}: ${c.values.join(' · ')}${c.unit === 's' ? ' s' : ' ' + esc(c.unit)}${c.kg ? ` · ${String(c.kg).replace('.', ',')} kg` : ''}</div>`).join('')}
        ${e.evaluation && !e.evaluation.ok ? `<div class="muted">${esc(e.evaluation.detail)}</div>` : ''}${e.notes ? `<div class="muted">${esc(e.notes)}</div>` : ''}</td>
      <td><b>${e.best} ${EXTRA_KINDS[e.kind]?.unit}</b></td><td>${e.kind === 'dominadas' ? e.total + ' reps' : e.count + ' saltos'}</td>
      <td class="nowrap"><button class="btn small" data-xedit="${esc(e.id)}">Editar</button> <button class="btn small danger" data-xdel="${esc(e.id)}">✕</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin registros todavía.</div>'}</div>`;
  const sync = () => { d.date = $('#x-date').value; d.notes = $('#x-notes').value; if ($('#x-weight')) d.weight = $('#x-weight').value;
    $$('#x-sets .seg').forEach(r => { const i = Number(r.dataset.i); $$('[data-f]', r).forEach(inp => d.sets[i][inp.dataset.f] = inp.value); });
    $$('#x-comp .seg').forEach(r => { const c = d.comp[Number(r.dataset.ci)]; $$('[data-cv]', r).forEach(inp => c.values[Number(inp.dataset.cv)] = inp.value); const k = $('[data-ck]', r); if (k) c.kg = k.value; });
    const vals = d.sets.flatMap(s => parseVals(s.values)); $('#x-sum').textContent = vals.length ? `Mejor ${Math.max(...vals)} ${unit}${d.kind === 'dominadas' ? ` · total ${vals.reduce((a, b) => a + b, 0)} reps` : ''}` : ''; };
  $$('#view-extras input, #view-extras textarea').forEach(i => i.addEventListener('input', sync)); sync();
  $('#x-kind').onchange = e => { sync(); d.kind = e.target.value; renderExtras(); };
  $('#x-add').onclick = () => { sync(); d.sets.push({ values: '', rest: d.sets.at(-1)?.rest || (d.planned ? A.fmtTime(d.planned.rest.min) : '') }); renderExtras(); };
  $$('[data-del]', $('#x-sets')).forEach(b => b.onclick = () => { sync(); d.sets.splice(Number(b.dataset.del), 1); renderExtras(); });
  if ($('#x-cancel')) $('#x-cancel').onclick = () => { S.extraDraft = null; renderExtras(); };
  if ($('#x-free')) $('#x-free').onclick = () => { S.extraDraft = blankExtra('dominadas'); renderExtras(); };
  $('#x-save').onclick = async () => {
    sync();
    const sets = d.sets.map(s => ({ values: parseVals(s.values), rest: A.parseTime(s.rest) })).filter(s => s.values.length);
    if (!sets.length) return toast('Añade al menos una serie con marcas');
    if (d.kind === 'dominadas' && sets.some(s => s.values.length > 1)) return toast('En dominadas pon un único número de repeticiones por serie');
    const vals = sets.flatMap(s => s.values);
    const rec = { id: d.id, date: d.date, kind: d.kind, sets, weight: num(d.weight), notes: d.notes, best: Math.max(...vals), total: vals.reduce((a, b) => a + b, 0), count: vals.length,
      planRef: d.planRef || null, planned: d.planned || null, evaluation: null, complementary: [] };
    if (d.kind === 'dominadas' && d.planned) {
      // las series se comparan en orden con las planificadas (las vacías cuentan como no hechas)
      const reps = d.sets.map(s => parseVals(s.values)[0] ?? null);
      while (reps.length && reps.at(-1) == null && reps.length > d.planned.sets.length) reps.pop();
      rec.evaluation = P.evaluatePull(d.planned.sets, reps, d.sets.map(s => A.parseTime(s.rest)));
    }
    if (d.kind === 'dominadas') rec.complementary = (d.comp || []).map(c => ({ id: c.id, name: c.name, group: c.group, unit: c.unit, sets: c.sets, target: c.target, rest: c.rest, load: c.load, hasLoad: c.hasLoad, cues: c.cues,
      values: c.values.map(v => parseVals(v)[0]).filter(v => v != null), kg: num(String(c.kg).replace(',', '.')) })).filter(c => c.values.length || c.kg != null);
    const saved = await S.store.put('extras', rec);
    S.extras = [...S.extras.filter(e => e.id !== saved.id), saved].sort((a, b) => a.date.localeCompare(b.date));
    S.extraDraft = blankExtra(d.kind);
    if (saved.planned) {
      const ev = saved.evaluation;
      modal(`<h2>Dominadas guardadas ✓</h2><p>${A.fmtDate(saved.date)} · ${esc(saved.planned.title)} · ${saved.sets.map(s => s.values[0]).join(' · ')} reps (total ${saved.total})</p>
        ${ev ? `<div class="semaforo ${ev.ok ? 'green' : 'amber'}"><div class="big">${ev.ok ? 'CUMPLIDO' : 'INCOMPLETO'}</div><p>${esc(ev.detail)}</p></div>` : ''}
        ${saved.complementary.length ? `<p class="small">Complementario: ${saved.complementary.map(c => `${esc(c.name)} ${c.values.join('/')}${c.unit === 's' ? ' s' : ' ' + esc(c.unit)}${c.kg ? ` (${String(c.kg).replace('.', ',')} kg)` : ''}`).join(' · ')}</p>` : ''}`);
      S.planTab = 'dominadas'; go('plan');
    } else { toast(`Guardado · mejor ${saved.best} ${EXTRA_KINDS[saved.kind].unit}`); renderExtras(); }
  };
  $$('[data-xedit]').forEach(b => b.onclick = () => { S.extraDraft = extraDraftFromRecord(S.extras.find(x => x.id === b.dataset.xedit)); renderExtras(); window.scrollTo(0, 0); });
  $$('[data-xdel]').forEach(b => b.onclick = async () => { if (!confirm('¿Eliminar este registro?')) return; await S.store.del('extras', b.dataset.xdel); S.extras = S.extras.filter(e => e.id !== b.dataset.xdel); renderExtras(); });
  const sj = S.extras.filter(e => e.kind === 'salto'), dm = S.extras.filter(e => e.kind === 'dominadas'); const accent = cssVar('--accent');
  chart('ch-salto', { type: 'line', data: { labels: sj.map(e => A.fmtDate(e.date).slice(0, 5)), datasets: [{ label: 'Mejor salto (cm)', data: sj.map(e => e.best), borderColor: accent, backgroundColor: accent }] }, options: { maintainAspectRatio: false } });
  chart('ch-dom', { type: 'bar', data: { labels: dm.map(e => A.fmtDate(e.date).slice(0, 5)), datasets: [{ label: 'Total reps', data: dm.map(e => e.total), backgroundColor: '#b9c0cb' }, { label: 'Mejor serie', data: dm.map(e => e.best), backgroundColor: accent }] }, options: { maintainAspectRatio: false } });
}
const parseVals = str => String(str || '').replace(/,/g, '.').split(/[\s;]+/).map(Number).filter(v => v > 0);

// ================================================================== IA
function nextMonday(fromIso) { const d = A.parseISO(fromIso); const add = ((8 - d.getDay()) % 7) || 7; d.setDate(d.getDate() + add); return A.isoDate(d); }
function renderIA() {
  const el = $('#view-ia');
  const av = A.aiAvailability(S.sessions, runPlans());
  const lastEnd = runPlans().map(p => p.end).filter(Boolean).sort().at(-1);
  const defStart = nextMonday(lastEnd && lastEnd >= today() ? lastEnd : today());
  const ctx = AI.buildContext({ sessions: S.sessions, extras: S.extras, plans: runPlans(), settings: S.settings });
  const r = S.aiResult;
  el.innerHTML = `<div class="card"><h1>Planificación con IA</h1>
    <p>Gemini diseña el siguiente bloque aplicando el algoritmo (ritmos, semáforo, escalera y reglas de volumen) sobre tu historial.</p>
    <div class="semaforo ${av.ok ? 'green' : 'amber'}"><b>${av.ok ? 'Disponible' : 'Todavía no disponible'}:</b> ${esc(av.reason)}</div>
    ${!S.settings.geminiKey ? '<p class="small">⚠️ Falta la API key de Google AI: añádela en <a href="#ajustes">Ajustes</a>.</p>' : ''}
    <div class="form-grid" style="margin-top:12px"><div><label>Empieza el lunes</label><input type="date" id="ia-start" value="${defStart}"></div>
      <div><label>Semanas</label><select id="ia-weeks">${[3, 4, 5, 6].map(n => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div><label>Modelo</label><input id="ia-model" value="${esc(S.settings.model || DEFAULT_GEMINI_MODEL)}"></div></div>
    <div class="field"><label>Indicaciones adicionales (opcional)</label><textarea id="ia-extra" placeholder="p. ej. el jueves no puedo entrenar; examen el 20/02/2027; tengo pista solo los miércoles"></textarea></div>
    <button class="btn primary big" id="ia-go" ${av.ok && S.settings.geminiKey ? '' : 'disabled'}>Generar siguiente bloque</button>
    <details><summary>Ver los datos que se envían a la IA</summary><pre class="ctx">${esc(ctx.text)}</pre></details>
  </div>
  <div id="ia-result">${r ? renderAIPlan(r) : ''}</div>`;
  $('#ia-go').onclick = async () => {
    const btn = $('#ia-go'); btn.disabled = true; btn.textContent = 'Generando… (puede tardar 20–60 s)';
    try {
      const out = await AI.generatePlan({ apiKey: S.settings.geminiKey, model: $('#ia-model').value.trim() || DEFAULT_GEMINI_MODEL, sessions: S.sessions, extras: S.extras, plans: runPlans(),
        settings: S.settings, weeks: Number($('#ia-weeks').value), startDate: $('#ia-start').value, extraInstructions: $('#ia-extra').value.trim() });
      S.aiResult = out.plan; renderIA(); $('#ia-result').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { modal(`<h2>No se pudo generar</h2><p>${esc(e.message)}</p>`); btn.disabled = false; btn.textContent = 'Generar siguiente bloque'; }
  };
  if (r) {
    $('#ia-save').onclick = async () => { const saved = await savePlan({ ...S.aiResult, id: undefined }, 'guardado'); if (saved) S.aiResult = null; };
    $('#ia-discard').onclick = () => { S.aiResult = null; renderIA(); };
    $('#ia-json').onclick = () => download(`plan-ia-${S.aiResult.start}.json`, S.aiResult);
  }
}
function renderAIPlan(p) {
  return `<div class="card"><h2>${esc(p.name || 'Plan generado')}</h2><p>${esc(p.summary || '')}</p>
    ${p.rp ? `<p class="small">Ritmo de trabajo propuesto: <b>${A.fmtTime(Math.round(p.rp))}/km</b> (400 m en ${A.fmtTime(A.targetFor(400, p.rp))}).</p>` : ''}
    <div class="row"><button class="btn primary" id="ia-save">Guardar como plan activo</button><button class="btn" id="ia-json">Descargar JSON</button><button class="btn danger" id="ia-discard">Descartar</button></div></div>
    ${p.weeks.map(w => `<div class="week"><div class="week-head"><h2>Semana ${w.n} · ${esc(w.title || '')}</h2><span class="muted small">${esc(w.focus || '')}</span></div>
      <div class="sessions">${w.sessions.map(s => `<div class="ps"><div class="date">${esc(s.dow || '')} ${A.fmtDate(s.date)} · <span class="badge grey">${esc(A.SESSION_TYPES[s.type] || s.type)}</span>${s.ladderLevel ? ` <span class="badge">Nivel ${s.ladderLevel}</span>` : ''}</div>
        <div class="title">${esc(s.title)}</div><div class="content">${esc(s.content)}</div>${s.targets ? `<div class="targets">🎯 ${esc(s.targets)}</div>` : ''}<div class="small muted">≈ ${km(s.km || 0)} km</div></div>`).join('')}</div></div>`).join('')}`;
}

// ================================================================== AJUSTES
function renderAjustes() {
  const el = $('#view-ajustes'); const s = S.settings;
  el.innerHTML = `<div class="card"><h1>Ajustes</h1>
    <h2>Objetivos</h2><div class="form-grid">
      <div><label>Objetivo 1000 m (m:ss)</label><input id="s-o1000" value="${A.fmtTime(Number(s.objective1000))}"></div>
      <div><label>Objetivo 50 m (s)</label><input id="s-o50" value="${Number(s.objective50).toFixed(2).replace('.', ',')}"></div>
      <div><label>Fecha del examen (opcional)</label><input type="date" id="s-exam" value="${esc(s.examDate || '')}"></div></div>
    <h2 style="margin-top:14px">Google AI (Gemini)</h2>
    <div class="field"><label>API key (empieza por "AIza…"). Se guarda solo en tu cuenta.</label><div class="row"><input id="s-key" type="password" value="${esc(s.geminiKey || '')}" style="flex:1" autocomplete="off"><button class="btn small" id="s-show">Ver</button></div></div>
    <div class="field"><label>Modelo</label><div class="row"><input id="s-model" list="s-models" value="${esc(s.model || DEFAULT_GEMINI_MODEL)}" style="flex:1"><datalist id="s-models"></datalist><button class="btn small" id="s-test">Comprobar key y listar modelos</button></div>
      <p class="small muted">Recomendado: un modelo "flash" (gratuito). "${DEFAULT_GEMINI_MODEL}" apunta siempre al último Flash disponible.</p><p class="small" id="s-test-out"></p></div>
    <button class="btn primary" id="s-save">Guardar ajustes</button></div>
  <div class="card"><h2>Cuenta y datos</h2>
    <p>Modo: <b>${S.store.mode === 'firebase' ? 'Firebase (nube)' : 'Local (solo este navegador)'}</b>${S.user?.email ? ` · ${esc(S.user.email)}` : ''}</p>
    <div class="row"><button class="btn" id="s-backup">Descargar copia de seguridad</button><button class="btn" id="s-restore">Restaurar copia</button>
    ${S.store.mode === 'firebase' ? '<button class="btn" id="s-logout">Cerrar sesión</button>' : ''}<button class="btn danger" id="s-wipe">Borrar todos mis datos</button></div></div>`;
  $('#s-show').onclick = () => { const i = $('#s-key'); i.type = i.type === 'password' ? 'text' : 'password'; };
  $('#s-test').onclick = async () => {
    const out = $('#s-test-out'); out.textContent = 'Comprobando…';
    try { const ms = await AI.listModels($('#s-key').value.trim());
      $('#s-models').innerHTML = ms.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
      out.innerHTML = `✅ Key válida. ${ms.length} modelos disponibles. Flash: ${ms.filter(m => /flash/i.test(m.id)).slice(0, 8).map(m => `<code>${esc(m.id)}</code>`).join(', ') || '—'}`; }
    catch (e) { out.textContent = '❌ ' + e.message; }
  };
  $('#s-save').onclick = async () => {
    const o1000 = A.parseTime($('#s-o1000').value), o50 = A.parseTime($('#s-o50').value);
    if (!o1000 || !o50) return toast('Revisa los objetivos (ej. 3:25 y 7,00)');
    await saveSettings({ objective1000: o1000, objective50: o50, examDate: $('#s-exam').value || null, geminiKey: $('#s-key').value.trim(), model: $('#s-model').value.trim() || DEFAULT_GEMINI_MODEL });
    toast('Ajustes guardados');
  };
  $('#s-backup').onclick = backup; $('#s-restore').onclick = restore;
  if ($('#s-logout')) $('#s-logout').onclick = () => S.store.signOut();
  $('#s-wipe').onclick = async () => {
    if (prompt('Esto borra TODAS tus sesiones, planes y extras. Escribe BORRAR para confirmar.') !== 'BORRAR') return;
    for (const c of ['sessions', 'plans', 'extras']) for (const x of S[c]) await S.store.del(c, x.id);
    S.sessions = []; S.plans = []; S.extras = []; toast('Datos borrados'); go('panel');
  };
}

// ================================================================== ARRANQUE
function showOnly(id) { $$('.view').forEach(v => v.classList.add('hidden')); $(id).classList.remove('hidden'); }
async function start() {
  if (S.store.mode === 'local') { const b = $('#modebanner'); b.innerHTML = '⚠️ <b>Modo local</b>: Firebase no está configurado (js/config.js). Los datos se guardan solo en este navegador. Sigue el Manual para conectar tu cuenta de Google.'; b.classList.remove('hidden'); }
  $('#btn-login').onclick = async () => { try { $('#login-error').textContent = ''; await S.store.signIn(); } catch (e) { $('#login-error').textContent = `Error: ${e.code || ''} ${e.message}`; } };
  try {
    await S.store.init(async user => {
      S.user = user;
      if (!user) { $('#nav').classList.add('hidden'); $('#userbox').innerHTML = ''; showOnly('#view-login'); return; }
      $('#userbox').innerHTML = `${user.photoURL ? `<img src="${esc(user.photoURL)}" alt="">` : ''}<span>${esc(user.displayName || user.email || '')}</span>`;
      showOnly('#view-loading');
      try { await loadAll(); } catch (e) { $('#view-loading').innerHTML = `<div class="card"><h2>No se pudieron cargar los datos</h2><p>${esc(e.message)}</p><p class="small muted">Revisa las reglas de Firestore (Manual, paso 4).</p></div>`; return; }
      $('#nav').classList.remove('hidden'); render();
    });
  } catch (e) {
    $('#view-loading').innerHTML = `<div class="card"><h2>Error al iniciar Firebase</h2><p>${esc(e.message)}</p><p class="small muted">Revisa js/config.js (Manual, paso 5) y tu conexión.</p></div>`;
  }
}
start();
