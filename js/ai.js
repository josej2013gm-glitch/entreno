// =====================================================================
//  ai.js — Planificación con Google AI (Gemini API, nivel gratuito)
//  La llamada se hace desde el navegador con tu API key (guardada en
//  Ajustes, dentro de tu cuenta). Restringe la key a tu dominio de
//  GitHub Pages (Manual, paso 7).
// =====================================================================
import * as A from './algorithm.js?v=20261109b';

const API = 'https://generativelanguage.googleapis.com/v1beta';

export async function listModels(apiKey) {
  const r = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Error ${r.status}`);
  return (j.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name))
    .map(m => ({ id: m.name.replace('models/', ''), name: m.displayName || m.name }));
}

async function generate(apiKey, model, prompt) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
  };
  const r = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.error?.message || `Error ${r.status}`;
    if (r.status === 429) throw new Error('Has superado el límite gratuito de peticiones de Gemini. Espera un minuto (o hasta mañana) y vuelve a intentarlo. Detalle: ' + msg);
    if (r.status === 403) throw new Error('La API key no tiene permiso desde este dominio o no es válida (revisa el Manual, paso 7). Detalle: ' + msg);
    if (r.status === 404) throw new Error(`El modelo "${model}" no existe o no está disponible. Pulsa "Comprobar key y listar modelos" en Ajustes y elige otro. Detalle: ${msg}`);
    throw new Error(msg);
  }
  const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  if (!text) throw new Error('La IA no devolvió contenido (puede haber sido bloqueado). Vuelve a intentarlo.');
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch { throw new Error('La respuesta de la IA no es un JSON válido. Vuelve a generar.'); }
}

/** Construye el contexto del atleta a partir del historial */
export function buildContext({ sessions, extras, plans, settings }) {
  const today = A.isoDate(new Date());
  const obj1000 = Number(settings.objective1000) || 205;
  const obj50 = Number(settings.objective50) || 7;
  const wp = A.workPace(settings, sessions);
  const sims = A.simulacros1000(sessions);
  const t50 = A.tests50(sessions);
  const weeks = A.weeklyVolume(sessions, today).slice(-10);
  const ladder = A.ladderState(sessions);
  const vol = A.volumeAdvice(sessions, today);
  const recent = [...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20).reverse();
  const lastPlan = [...plans].sort((a, b) => (b.end || '').localeCompare(a.end || ''))[0];
  const extrasBy = k => extras.filter(e => e.kind === k).sort((a, b) => a.date.localeCompare(b.date)).slice(-6);
  const lines = [];
  lines.push(`Fecha de hoy: ${today}.`);
  lines.push(`Objetivos de examen: 1000 m en ${A.fmtTime(obj1000)} y 50 m en ${obj50.toFixed(2).replace('.', ',')} s.${settings.examDate ? ` Fecha del examen: ${settings.examDate}.` : ' Fecha de examen sin confirmar.'}`);
  lines.push(`Ritmo de trabajo actual (RP): ${A.fmtTime(Math.round(wp.rp))}/km. Motivo: ${wp.reason}.`);
  lines.push(`Simulacros 1000 m: ${sims.map(s => `${s.date} ${A.fmtTime(s.time)}${s.splits ? ` (parciales ${s.splits.map(x => A.fmtTime(x)).join('/')})` : ''}`).join('; ') || 'ninguno'}.`);
  lines.push(`Tests 50 m (mejor del día): ${t50.map(s => `${s.date} ${String(s.time).replace('.', ',')} s`).join('; ') || 'ninguno'}.`);
  lines.push(`Escalera de especificidad: nivel actual ${ladder.level}, nivel recomendado para la próxima sesión ${ladder.next} (${ladder.reason}).`);
  lines.push(`Volumen: última semana completa ${vol.lastKm ?? '—'} km; máximo recomendado la próxima semana ${vol.maxNext ?? '—'} km (${vol.reason}); calidad últimas 4 semanas ${vol.qualityPct ?? '—'} %.`);
  lines.push(`Volumen semanal últimas 10 semanas (lunes, km totales, km calidad): ${weeks.map(w => `${w.week}: ${w.km} / ${w.quality}`).join('; ')}.`);
  lines.push('Sesiones recientes (fecha · tipo · contenido · RPE · molestia rodilla · semáforo · notas):');
  for (const s of recent) lines.push(`- ${s.date} · ${s.type} · ${A.summarize(s)} · RPE ${s.rpe ?? '—'} · molestia ${s.pain ?? '—'}/10 · ${s.semaforo?.color || '—'}${s.notes ? ` · ${s.notes}` : ''}`);
  const sj = extrasBy('salto'), dm = extrasBy('dominadas');
  if (sj.length) lines.push(`Salto a pies juntos (mejor por sesión, cm): ${sj.map(e => `${e.date} ${e.best}`).join('; ')}.`);
  if (dm.length) lines.push(`Dominadas (total reps / mejor serie): ${dm.map(e => `${e.date} ${e.total}/${e.best}`).join('; ')}.`);
  if (lastPlan) lines.push(`Último plan cargado: "${lastPlan.name}" (${lastPlan.start} a ${lastPlan.end}).`);
  lines.push('Antecedente: molestias en la rodilla izquierda (cintilla iliotibial) en abril de 2026, pinchazo 6/10 el 28/04; sin molestias desde mayo.');
  return { text: lines.join('\n'), wp, ladder, vol, lastPlan };
}

const RULES = `REGLAS DEL ALGORITMO (obligatorias):
1. Ritmos: todos los tiempos de serie = distancia/1000 × RP (RP = ritmo de trabajo en s/km). Tras cada simulacro: si el 1000 m queda a ≤ 2 s del objetivo, RP = marca − 3 s; si no, RP = objetivo.
2. Semáforo: VERDE (todas las series a ±1 s y RPE ≤ 8) → progresar UNA variable en este orden: recuperación −15/−30 s, +1 serie, serie más larga (400→500→600), −1 s por 400 m. ÁMBAR (1 serie a +2 s o RPE 9) → repetir. ROJO (2+ series a +2 s) → bajar un nivel. Molestia ≥ 3/10 → 48–72 h sin impacto.
3. Escalera del 1000 m (subir tras dos sesiones verdes seguidas): N1 6×400 rec 2:00 · N2 6×400 rec 1:30 · N3 5×500 rec 2:30 · N4 4×500 rec 1:45 · N5 3×600 rec 3:00 · N6 2×(600+400) 1:00/4:00 · N7 800+200 rec 1:00 · N8 simulacro. Empieza el bloque en el nivel recomendado.
4. Volumen: máximo +10 % semanal; 3 semanas de carga + 1 de descarga (−20 a −30 %). Calidad (series, velocidad, tests) = 20–25 % de los km. Rodaje más largo ≤ 35–40 % del volumen semanal.
5. 50 m: una sesión semanal de velocidad en fresco (salidas de 20–30 m y 3–4×50 m al máximo con recuperación completa 3–5 min); cortar si un intento sale > 0,1 s peor que el mejor del día; progresar 6→8→10 salidas.
6. Estructura semanal tipo: 4 días de carrera (rodaje + rectas, específico 1000, velocidad/tolerancia, rodaje largo o progresivo) + 2 de fuerza (A: potencia de tren inferior; B: cadera/rodilla para la cintilla). La última semana del bloque es de descarga y termina con un simulacro 50 m + 1000 m.
7. Si hay fecha de examen a menos de 3 semanas, la última semana del bloque es de afinamiento y el simulacro se sustituye por el examen.`;

const SCHEMA = `Devuelve SOLO un JSON con esta forma exacta (sin texto adicional):
{
 "name": "Bloque específico N (dd/mm – dd/mm/aaaa)",
 "summary": "2-4 frases: por qué este bloque, ritmos y niveles elegidos",
 "rp": <ritmo de trabajo en segundos por km, número>,
 "weeks": [
  {"n": 1, "title": "...", "focus": "≈km totales · objetivo de la semana",
   "sessions": [
    {"date": "AAAA-MM-DD", "type": "rodaje|series|velocidad|tempo|simulacro|fuerza|libre",
     "title": "...", "content": "descripción para el atleta", "targets": "ritmos objetivo en texto",
     "km": <km totales sin recuperaciones>, "evaluate": <true solo en la sesión específica del 1000 y el simulacro>,
     "ladderLevel": <1-8 solo en sesiones específicas del 1000>,
     "prefill": [ {"kind": "calentamiento|rodaje|tempo|serie|recta|salida|sprint|test50|test1000|enfriamiento",
                   "dist": <metros>, "target": "m:ss o s,cc (opcional)", "rest": "m:ss recuperación antes de esta repetición (opcional)"} ]
    }]
  }]
}
Incluye una entrada de prefill por cada repetición (6×400 = 6 objetos "serie"). Las sesiones de fuerza llevan prefill vacío.`;

export async function generatePlan({ apiKey, model, sessions, extras, plans, settings, weeks = 4, startDate, extraInstructions = '' }) {
  const ctx = buildContext({ sessions, extras, plans, settings });
  const prompt = `Eres un entrenador de atletismo experto en preparar las pruebas físicas de oposición a Policía Local en España (1000 m y 50 m).
Diseña el SIGUIENTE bloque de entrenamiento de ${weeks} semanas para este opositor, empezando el lunes ${startDate}.

DATOS DEL ATLETA
${ctx.text}

${RULES}

${SCHEMA}
${extraInstructions ? `\nINDICACIONES ADICIONALES DEL ATLETA: ${extraInstructions}` : ''}
Escribe en español. Usa fechas reales consecutivas desde ${startDate}.`;
  const raw = await generate(apiKey, model, prompt);
  const plan = A.normalizePlan({ ...raw, source: 'ia', model, generatedAt: new Date().toISOString() });
  if (!plan.weeks.length) throw new Error('La IA devolvió un plan sin semanas. Vuelve a generar.');
  return { plan, prompt };
}
