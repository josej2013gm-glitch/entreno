// =====================================================================
//  pullups.js — Planes de dominadas (planificados a mano, importados por JSON)
//  No intervienen en la planificación con IA, que es solo de carrera.
// =====================================================================
import { dowOf, parseTime, fmtTime } from './algorithm.js?v=20261109b';

export const isPullPlan = p => p && p.discipline === 'dominadas';

/** "2" / "Máx. (mín. 3)" */
export const setLabel = s => (s.max ? `Máx.${s.min ? ` (mín. ${s.min})` : ''}` : String(s.target));

/** Valida y normaliza un plan de dominadas importado */
export function normalizePullPlan(raw) {
  if (!raw || raw.discipline !== 'dominadas') throw new Error('El JSON no es un plan de dominadas (falta "discipline": "dominadas").');
  if (!Array.isArray(raw.weeks) || !raw.weeks.length) throw new Error('El plan no tiene semanas ("weeks").');
  const p = JSON.parse(JSON.stringify(raw));
  const restMin = parseTime(p.rest?.min ?? 120) ?? 120;
  const restMax = parseTime(p.rest?.max ?? restMin) ?? restMin;
  p.rest = { min: restMin, max: restMax };
  const catalog = Object.fromEntries((p.complementary || []).map(c => [c.id, c]));
  p.weeks = p.weeks.map((w, wi) => ({
    ...w, n: w.n || wi + 1,
    sessions: (w.sessions || []).map((s, si) => {
      if (!s.date || !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) throw new Error(`Sesión ${si + 1} de la semana ${wi + 1}: fecha no válida (usa AAAA-MM-DD).`);
      if (!Array.isArray(s.sets) || !s.sets.length) throw new Error(`Sesión del ${s.date}: faltan las series ("sets").`);
      const sets = s.sets.map(x => {
        if (typeof x === 'number') return { target: x };
        if (x && x.max) return { max: true, min: x.min != null ? Number(x.min) : null };
        if (x && x.target != null) return { target: Number(x.target) };
        throw new Error(`Sesión del ${s.date}: serie no válida (${JSON.stringify(x)}).`);
      });
      const comp = (s.complementary || []).map(c => (typeof c === 'string' ? catalog[c] : c)).filter(Boolean)
        .map(c => ({ id: c.id, name: c.name, group: c.group || '', sets: Number(c.sets) || 1, unit: c.unit || 'reps', target: c.target != null ? String(c.target) : '',
          rest: c.rest != null ? String(c.rest) : '', load: c.load || '', hasLoad: !!c.hasLoad, cues: c.cues || [] }));
      return {
        id: s.id || `pull-${s.date}-${si + 1}`, date: s.date, dow: dowOf(s.date), n: s.n ?? null, test: !!s.test,
        title: s.title || (s.test ? 'Test de máximo' : `Sesión ${s.n ?? si + 1}`), content: s.content || '', sets,
        rest: s.rest ? { min: parseTime(s.rest.min ?? restMin), max: parseTime(s.rest.max ?? restMax) } : { ...p.rest },
        complementary: comp, after: s.after || '',
      };
    }).sort((a, b) => a.date.localeCompare(b.date)),
  }));
  const dates = p.weeks.flatMap(w => w.sessions.map(s => s.date)).sort();
  p.start = p.start || dates[0]; p.end = p.end || dates.at(-1);
  p.source = p.source || 'manual';
  delete p.id;
  return p;
}

/** Compara las repeticiones hechas con las planificadas */
export function evaluatePull(plannedSets, reps, rests = []) {
  const items = plannedSets.map((ps, i) => {
    const r = reps[i] ?? null;
    const need = ps.max ? (ps.min ?? 0) : ps.target;
    return { label: setLabel(ps), reps: r, ok: r != null && r >= need };
  });
  const extra = reps.slice(plannedSets.length);
  const ok = items.every(x => x.ok);
  const fails = items.map((x, i) => (x.ok ? null : `S${i + 1}: ${x.reps ?? '—'} de ${x.label}`)).filter(Boolean);
  const shortRest = rests.map((r, i) => (i > 0 && r != null && r < 120 ? `S${i + 1} (${fmtTime(r)})` : null)).filter(Boolean);
  let detail = ok ? 'Todas las series alcanzan lo planificado.' : `No alcanzadas: ${fails.join(' · ')}.`;
  if (extra.length) detail += ` Series extra: ${extra.join(', ')}.`;
  if (shortRest.length) detail += ` Descanso por debajo de 2:00 antes de ${shortRest.join(', ')}.`;
  return { ok, detail, items };
}

/** Texto compacto de las series planificadas: "2 · 3 · 2 · 2 · Máx. (mín. 3)" */
export const setsText = sets => sets.map(setLabel).join(' · ');
export const restText = r => (r ? (r.max && r.max !== r.min ? `${fmtTime(r.min)}–${fmtTime(r.max)}` : fmtTime(r.min)) : '');
export const compText = c => `${c.sets} × ${c.target}${c.unit === 's' ? ' s' : ` ${c.unit}`}${c.rest ? ` · desc. ${c.rest} s` : ''}${c.load ? ` · ${c.load}` : ''}`;
