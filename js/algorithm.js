// =====================================================================
//  algorithm.js — Lógica de entrenamiento (sin dependencias)
//  Implementa el "algoritmo de progresión" del informe:
//   · ritmos de trabajo a partir del objetivo / último simulacro
//   · semáforo tras cada sesión específica
//   · escalera de especificidad del 1000 m
//   · reglas de volumen (+10 % / 3 semanas carga + 1 descarga)
// =====================================================================

export const SEGMENT_KINDS = {
  calentamiento: { label: 'Calentamiento', quality: false },
  rodaje:        { label: 'Rodaje',        quality: false },
  tempo:         { label: 'Tempo / umbral', quality: true },
  serie:         { label: 'Serie',         quality: true },
  recta:         { label: 'Recta / progresivo', quality: false },
  salida:        { label: 'Salida (aceleración)', quality: true },
  sprint:        { label: 'Sprint 50 m (entreno)', quality: true },
  test50:        { label: 'Test 50 m',     quality: true },
  test1000:      { label: 'Test 1000 m',   quality: true },
  enfriamiento:  { label: 'Enfriamiento',  quality: false },
};

export const SESSION_TYPES = {
  rodaje: 'Rodaje', series: 'Series / específico', velocidad: 'Velocidad 50 m',
  tempo: 'Tempo', simulacro: 'Simulacro / test', fuerza: 'Fuerza', libre: 'Libre',
};

// Escalera de especificidad (rp = ritmo de trabajo en s/km)
export const LADDER = [
  null,
  { level: 1, name: '6×400 m', reps: [[400, 6]], rest: 120, desc: '6×400 m a ritmo objetivo (+1 s), rec. 2:00' },
  { level: 2, name: '6×400 m', reps: [[400, 6]], rest: 90,  desc: '6×400 m a ritmo objetivo, rec. 1:30' },
  { level: 3, name: '5×500 m', reps: [[500, 5]], rest: 150, desc: '5×500 m a ritmo objetivo, rec. 2:30' },
  { level: 4, name: '4×500 m', reps: [[500, 4]], rest: 105, desc: '4×500 m a ritmo objetivo, rec. 1:45' },
  { level: 5, name: '3×600 m', reps: [[600, 3]], rest: 180, desc: '3×600 m a ritmo objetivo, rec. 3:00' },
  { level: 6, name: '2×(600+400 m)', reps: [[600, 1], [400, 1], [600, 1], [400, 1]], rest: 60, desc: '2×(600 + 400 m) a ritmo objetivo, 1:00 dentro del bloque y 4:00 entre bloques' },
  { level: 7, name: '800 + 200 m', reps: [[800, 1], [200, 1]], rest: 60, desc: '800 m + 200 m a ritmo objetivo con 1:00 de pausa (1000 fraccionado)' },
  { level: 8, name: 'Simulacro 1000 m', reps: [[1000, 1]], rest: 0, desc: 'Simulacro en condiciones de examen' },
];

// ---------- tiempos ----------
/** "1:23" -> 83 · "44:48" -> 2688 · "1:02:30" -> 3750 · "7,15" -> 7.15 · "83" -> 83 */
export function parseTime(str) {
  if (str === null || str === undefined) return null;
  if (typeof str === 'number') return isFinite(str) ? str : null;
  const s = String(str).trim().replace(',', '.');
  if (!s) return null;
  const parts = s.split(':');
  if (parts.some(p => p === '' || isNaN(Number(p)))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

/** 83 -> "1:23" · 7.15 -> "7,15" (menos de 60 s con decimales) */
export function fmtTime(sec, opts = {}) {
  if (sec === null || sec === undefined || isNaN(sec)) return '—';
  if (sec < 60 && (opts.short || sec % 1 !== 0)) return sec.toFixed(2).replace('.', ',');
  const neg = sec < 0; sec = Math.abs(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = s % 1 === 0 ? String(s).padStart(2, '0') : s.toFixed(1).padStart(4, '0').replace('.', ',');
  const body = h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  return (neg ? '-' : '') + body;
}

export const paceOf = (dist, time) => (dist && time ? time / dist * 1000 : null); // s/km
export const fmtPace = p => (p ? `${fmtTime(Math.round(p))}/km` : '—');
export const targetFor = (dist, rp) => Math.round(dist / 1000 * rp * 10) / 10;

// ---------- fechas ----------
export const isoDate = d => {
  const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export function weekKey(dateStr) { // lunes de la semana (ISO)
  const d = parseISO(dateStr); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return isoDate(d);
}
export const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return isoDate(d); };
export const fmtDate = s => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
export const DOW = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const dowOf = s => DOW[(parseISO(s).getDay() + 6) % 7];

// ---------- volumen ----------
export const segKm = g => (Number(g.dist) || 0) / 1000;
export const sessionKm = s => (s.segments || []).reduce((a, g) => a + segKm(g), 0);
export const isQualitySeg = g => !!(SEGMENT_KINDS[g.kind] || {}).quality;
export const sessionQualityKm = s => (s.segments || []).filter(isQualitySeg).reduce((a, g) => a + segKm(g), 0);

/** Volumen por semana (lunes-domingo), con semanas vacías rellenadas */
export function weeklyVolume(sessions, untilDate = isoDate(new Date())) {
  if (!sessions.length) return [];
  const map = new Map();
  for (const s of sessions) {
    const k = weekKey(s.date);
    const w = map.get(k) || { week: k, km: 0, quality: 0, sessions: 0 };
    w.km += sessionKm(s); w.quality += sessionQualityKm(s); w.sessions += 1;
    map.set(k, w);
  }
  const first = [...map.keys()].sort()[0];
  const last = weekKey(untilDate) > [...map.keys()].sort().at(-1) ? weekKey(untilDate) : [...map.keys()].sort().at(-1);
  const out = [];
  for (let k = first; k <= last; k = addDays(k, 7)) out.push(map.get(k) || { week: k, km: 0, quality: 0, sessions: 0 });
  return out.map(w => ({ ...w, km: Math.round(w.km * 100) / 100, quality: Math.round(w.quality * 100) / 100 }));
}

// ---------- tests ----------
export function simulacros1000(sessions) {
  const out = [];
  for (const s of sessions) for (const g of s.segments || []) {
    if (g.kind === 'test1000' && g.time && !g.excluded) out.push({ date: s.date, time: Number(g.time), splits: g.splits || null, sessionId: s.id });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
export function tests50(sessions) { // mejor intento de cada día
  const byDay = new Map();
  for (const s of sessions) for (const g of s.segments || []) {
    if (g.kind === 'test50' && g.time && !g.excluded) {
      const t = Number(g.time); const prev = byDay.get(s.date);
      if (!prev || t < prev.time) byDay.set(s.date, { date: s.date, time: t });
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export const best = (arr) => arr.length ? arr.reduce((a, b) => (b.time < a.time ? b : a)) : null;

// ---------- ritmo de trabajo ----------
/**
 * Regla del informe: si el último simulacro queda a ≤ 2 s del objetivo,
 * el nuevo ritmo de trabajo es (marca − 3 s); si no, se entrena al objetivo.
 */
export function workPace(settings, sessions) {
  const obj = Number(settings.objective1000) || 205;
  const sims = simulacros1000(sessions);
  const last = sims.at(-1);
  if (last && last.time <= obj + 2) return { rp: last.time - 3, reason: `Último simulacro ${fmtTime(last.time)} ≤ objetivo + 2 s → marca − 3 s` };
  return { rp: obj, reason: `Se entrena al ritmo objetivo (${fmtTime(obj)}/km)${last ? `; último simulacro ${fmtTime(last.time)}` : ''}` };
}

export function paceTable(rp) {
  return [200, 300, 400, 500, 600, 800, 1000].map(d => ({ dist: d, target: targetFor(d, rp) }));
}

// ---------- semáforo ----------
export const SEMAFORO = {
  verde: { label: 'VERDE', css: 'green', rec: 'Progresa UNA variable en la próxima sesión: 1.º recuperación −15/−30 s · 2.º +1 serie · 3.º serie más larga · 4.º −1 s por 400 m.' },
  ambar: { label: 'ÁMBAR', css: 'amber', rec: 'Repite la misma sesión (misma carga) la próxima vez.' },
  rojo:  { label: 'ROJO',  css: 'red',   rec: 'Baja un nivel de la escalera en la próxima sesión específica.' },
  parar: { label: 'PARAR', css: 'red',   rec: 'Molestia ≥ 3/10: 48–72 h sin impacto. Al volver, repite el nivel anterior. Si persiste, consulta con un fisioterapeuta.' },
};

/**
 * Evalúa una sesión. Usa las series con tiempo objetivo (target).
 * Devuelve null si no hay nada que evaluar.
 */
export function evaluateSession(session) {
  const pain = session.pain === '' || session.pain === null || session.pain === undefined ? null : Number(session.pain);
  const rpe = session.rpe === '' || session.rpe === null || session.rpe === undefined ? null : Number(session.rpe);
  const reps = (session.segments || []).filter(g => g.kind === 'serie' && g.target && g.time);
  if (pain !== null && pain >= 3) return { color: 'parar', detail: `Molestia ${pain}/10`, diffs: [] };
  if (!reps.length) return null;
  const diffs = reps.map(g => Math.round((Number(g.time) - Number(g.target)) * 10) / 10);
  const big = diffs.filter(d => d > 2).length;
  const off = diffs.filter(d => d > 1).length;
  let color;
  if (big >= 2) color = 'rojo';
  else if (big === 1 || off > 0 || (rpe !== null && rpe >= 9)) color = 'ambar';
  else color = 'verde';
  const detail = `${reps.length} series · desviaciones: ${diffs.map(d => (d > 0 ? '+' : '') + String(d).replace('.', ',')).join(' / ')} s${rpe !== null ? ` · RPE ${rpe}` : ''}`;
  return { color, detail, diffs };
}

/** Estado de la escalera a partir de las sesiones evaluadas con nivel */
export function ladderState(sessions) {
  const ev = sessions.filter(s => s.ladderLevel && s.semaforo && s.semaforo.color)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!ev.length) return { level: 1, next: 1, reason: 'Sin sesiones específicas evaluadas: empieza en el nivel 1.', history: [] };
  const last = ev.at(-1); const lvl = Number(last.ladderLevel);
  let next = lvl, reason;
  const c = last.semaforo.color;
  if (c === 'rojo') { next = Math.max(1, lvl - 1); reason = 'Última sesión en ROJO → bajar un nivel.'; }
  else if (c === 'parar') { next = Math.max(1, lvl - 1); reason = 'Última sesión con molestias (PARAR) → descanso y nivel anterior.'; }
  else if (c === 'ambar') { reason = 'Última sesión en ÁMBAR → repetir el nivel.'; }
  else {
    const prev = ev.at(-2);
    if (prev && Number(prev.ladderLevel) === lvl && prev.semaforo.color === 'verde') { next = Math.min(8, lvl + 1); reason = 'Dos sesiones VERDES seguidas en el nivel → subir de nivel.'; }
    else reason = 'Una sesión VERDE en el nivel: hace falta otra verde para subir.';
  }
  return { level: lvl, next, reason, history: ev.map(s => ({ date: s.date, level: s.ladderLevel, color: s.semaforo.color })) };
}

/** Regla de volumen: +10 % máx. y descarga tras 3 semanas de carga */
export function volumeAdvice(sessions, today = isoDate(new Date())) {
  const weeks = weeklyVolume(sessions, today).filter(w => w.week < weekKey(today)); // semanas completas
  if (!weeks.length) return { maxNext: null, reason: 'Sin datos suficientes.' };
  const last = weeks.at(-1);
  let rising = 0;
  for (let i = weeks.length - 1; i > 0 && rising < 4; i--) { if (weeks[i].km > weeks[i - 1].km * 0.95) rising++; else break; }
  const last4 = weeks.slice(-4);
  const tot4 = last4.reduce((a, w) => a + w.km, 0), q4 = last4.reduce((a, w) => a + w.quality, 0);
  const qualityPct = tot4 ? Math.round(q4 / tot4 * 100) : 0;
  const ref = Math.max(...last4.map(w => w.km)); // semana más alta de las últimas 4
  if (rising >= 3) return { maxNext: Math.round(last.km * 0.75 * 10) / 10, deload: true, lastKm: last.km, refKm: ref, qualityPct, reason: `${rising} semanas seguidas subiendo → toca descarga (−25 % sobre la última semana).` };
  return { maxNext: Math.round(ref * 1.1 * 10) / 10, deload: false, lastKm: last.km, refKm: ref, qualityPct, reason: `Máximo +10 % sobre tu semana más alta de las últimas 4 (${String(Math.round(ref * 10) / 10).replace('.', ',')} km).` };
}

/** Resumen compacto de una sesión: "1,5 km calent. + 6×400 (1:23…) r2:00" */
export function summarize(session) {
  const segs = session.segments || [];
  if (!segs.length) return session.title || SESSION_TYPES[session.type] || '';
  const groups = [];
  for (const g of segs) {
    const key = `${g.kind}|${g.dist}`;
    const lastG = groups.at(-1);
    if (lastG && lastG.key === key && !['rodaje', 'calentamiento', 'enfriamiento', 'tempo'].includes(g.kind)) lastG.items.push(g);
    else groups.push({ key, kind: g.kind, dist: g.dist, items: [g] });
  }
  return groups.map(gr => {
    const n = gr.items.length;
    if (['rodaje', 'calentamiento', 'enfriamiento', 'tempo'].includes(gr.kind)) {
      const g = gr.items[0]; const tag = gr.kind === 'rodaje' ? '' : ` ${SEGMENT_KINDS[gr.kind].label.toLowerCase().slice(0, 7)}.`;
      return `${(g.dist / 1000).toFixed(1).replace('.', ',')} km${tag}${g.time ? ` (${fmtPace(paceOf(g.dist, g.time))})` : ''}`;
    }
    const times = gr.items.filter(g => g.time).map(g => fmtTime(Number(g.time), { short: g.dist <= 100 }));
    const lbl = gr.kind === 'test50' ? 'Test 50 m' : gr.kind === 'test1000' ? 'Test 1000 m' : `${n > 1 ? n + '×' : ''}${gr.dist} m`;
    return `${lbl}${times.length ? ` [${times.join(', ')}]` : ''}`;
  }).join(' + ');
}

/** ¿Está disponible la planificación con IA? Requiere un simulacro de 1000 m
 *  registrado el día de inicio del primer plan cargado o después. */
export function aiAvailability(sessions, plans) {
  if (!plans.length) return { ok: false, reason: 'Carga primero un plan (por ejemplo, el Bloque I incluido).' };
  const firstStart = plans.map(p => p.start).filter(Boolean).sort()[0];
  const sim = simulacros1000(sessions).find(s => s.date >= firstStart);
  if (!sim) return { ok: false, reason: `La planificación con IA se activa al registrar el primer simulacro de 1000 m a partir del ${fmtDate(firstStart)} (en el Bloque I, el sábado 05/12/2026).` };
  return { ok: true, reason: `Simulacro del ${fmtDate(sim.date)} registrado (${fmtTime(sim.time)}).` };
}

/** Normaliza un plan (manual o generado por IA): ids, km, fechas */
export function normalizePlan(plan) {
  const p = JSON.parse(JSON.stringify(plan));
  p.weeks = (p.weeks || []).map((w, wi) => ({
    ...w, n: w.n || wi + 1,
    sessions: (w.sessions || []).map((s, si) => {
      const prefill = (s.prefill || []).map(g => ({
        kind: SEGMENT_KINDS[g.kind] ? g.kind : 'serie',
        dist: Number(g.dist) || 0,
        target: g.target != null && g.target !== '' ? parseTime(g.target) : null,
        rest: g.rest != null && g.rest !== '' ? parseTime(g.rest) : null,
      }));
      const km = s.km != null ? Number(s.km) : Math.round(prefill.reduce((a, g) => a + g.dist, 0) / 100) / 10;
      return { id: s.id || `w${wi + 1}s${si + 1}-${s.date}`, ...s, dow: s.date ? dowOf(s.date) : s.dow, prefill, km };
    }).sort((a, b) => (a.date || '').localeCompare(b.date || '')),
  }));
  const dates = p.weeks.flatMap(w => w.sessions.map(s => s.date)).filter(Boolean).sort();
  p.start = p.start || dates[0]; p.end = p.end || dates.at(-1);
  return p;
}
