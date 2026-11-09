// =====================================================================
//  scoring.js — Baremo oficial de las pruebas físicas
//  Cada tramo: [umbral, nota]. Si no se alcanza el umbral de la nota 5,
//  la marca es de ELIMINACIÓN.
//   · Salto de longitud (cm):   2,40 o más = 10 … 2,15–2,19 = 5 · 2,14 o menos = eliminación
//   · Flexión de brazos (reps): 12 = 10 … 7 = 5 · 6 o menos = eliminación
//   · 50 m (s):                 7,0 = 10 … 7,5 = 5 · 7,6 o más = eliminación
//   · 1000 m (s):               3:25 o menos = 10 … 3:46–3:50 = 5 · 3:51 o más = eliminación
//  Para el 50 m, una marca con centésimas entre dos tramos (p. ej. 7,15)
//  se puntúa con el tramo inferior (7,2 → 8): criterio prudente.
// =====================================================================
import { fmtTime } from './algorithm.js?v=20261109b';

const f2 = v => v.toFixed(2).replace('.', ',');
export const BAREMO = {
  salto: { label: 'Salto de longitud', higher: true, fmt: cm => `${f2(cm / 100)} m`,
    bands: [[240, 10], [235, 9], [230, 8], [225, 7], [220, 6], [215, 5]] },
  dominadas: { label: 'Flexión de brazos (dominadas)', higher: true, fmt: r => `${r} reps`,
    bands: [[12, 10], [11, 9], [10, 8], [9, 7], [8, 6], [7, 5]] },
  c50: { label: 'Carrera 50 m', higher: false, fmt: s => `${f2(s)} s`,
    bands: [[7.0, 10], [7.1, 9], [7.2, 8], [7.3, 7], [7.4, 6], [7.5, 5]] },
  c1000: { label: 'Resistencia 1000 m', higher: false, fmt: s => fmtTime(Math.round(s)),
    bands: [[205, 10], [210, 9], [215, 8], [220, 7], [225, 6], [230, 5]] },
};

/** Devuelve { grade: 5–10 | 0 (eliminación), next: {grade, need, gap} | null } */
export function score(key, value) {
  const b = BAREMO[key];
  if (value == null || isNaN(value)) return null;
  const ok = thr => (b.higher ? value >= thr - 1e-9 : value <= thr + 1e-9);
  const hit = b.bands.find(([thr]) => ok(thr));
  const grade = hit ? hit[1] : 0;
  const nextBand = [...b.bands].reverse().find(([, g]) => g > grade);
  const next = nextBand ? { grade: nextBand[1], need: nextBand[0], gap: Math.abs(value - nextBand[0]) } : null;
  return { grade, next };
}

/** Texto de lo que falta para la siguiente nota */
export function gapText(key, res) {
  if (!res?.next) return 'Nota máxima';
  const b = BAREMO[key]; const { grade, need, gap } = res.next;
  const g = key === 'salto' ? `+${Math.round(gap)} cm` : key === 'dominadas' ? `+${Math.round(gap)} rep${Math.round(gap) === 1 ? '' : 's'}`
    : key === 'c50' ? `−${f2(gap)} s` : `−${Math.round(gap)} s`;
  return `Para el ${grade}: ${b.fmt(need)} (${g})`;
}
