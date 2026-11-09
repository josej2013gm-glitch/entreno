# Entrenos · Oposición Policía Local

App web gratuita para registrar y planificar los entrenamientos de carrera (1000 m y 50 m) y las pruebas adicionales (salto de longitud a pies juntos y dominadas).

- **Inicio de sesión con Google** (Firebase Authentication, plan gratuito Spark)
- **Datos en la nube** (Cloud Firestore, plan gratuito Spark), también sin conexión
- **Alojamiento** en GitHub Pages (gratis)
- **Planificación con IA** usando tu API key de Google AI (Gemini, nivel gratuito)
- Sin servidor, sin compilación: HTML + JavaScript

> El manual de instalación completo, paso a paso, está en el documento «Manual de instalación — App de entrenamientos Policía Local» que acompaña a este proyecto.

## Funciones

| Sección | Qué hace |
| --- | --- |
| Panel | Último 1000 m, mejor 50 m, km de la semana frente al máximo recomendado, % de calidad, ritmo de trabajo, nivel de la escalera, próximos entrenos y gráficos |
| Plan | Carga el plan **Bloque I** incluido (`data/plan-bloque1.json`) o cualquier plan JSON; marca las sesiones hechas y abre el registro ya rellenado |
| Registrar | Sesiones planificadas o libres: partes (calentamiento, rodaje, series, salidas, tests…), tiempos, objetivos, recuperación, parciales del 1000, RPE, molestia de rodilla y notas. Calcula el **semáforo** y la recomendación al guardar |
| Historial | Lista y edición de sesiones; importa tu historial de 2026 (`data/historial.json`, 94 sesiones, 285,2 km); copia de seguridad y restauración |
| Plan → Dominadas | Planes de dominadas que haces tú, añadidos con **Añadir plan de dominadas (.json)**. Se **añaden** sin borrar nada (ni otros planes de dominadas ni el de carrera). Cada sesión se registra con su botón y se marca CUMPLIDO / INCOMPLETO. La IA no los toca |
| Extras | Salto a pies juntos (marca de cada salto en cm por serie) y dominadas (repeticiones por serie, distintas en cada serie, lastre opcional), con descanso entre series |
| IA | Genera el siguiente bloque con Gemini aplicando el algoritmo. Se activa al registrar el primer simulacro de 1000 m posterior al inicio del primer plan |
| Ajustes | Objetivos, fecha de examen, API key y modelo de Gemini |

## Estructura

```
index.html                 interfaz
css/styles.css             estilos (claro/oscuro, móvil)
js/config.js               ← AQUÍ VA LA CONFIGURACIÓN DE FIREBASE
js/store.js                Firebase Auth + Firestore (o modo local)
js/algorithm.js            algoritmo: ritmos, semáforo, escalera, volumen
js/ai.js                   llamada a Gemini y construcción del contexto
js/app.js                  pantallas
data/plan-bloque1.json     plan Bloque I (9/11 – 6/12/2026)
data/historial.json        historial 05/01 – 07/11/2026
data/plan-dominadas-1.json plan de dominadas inicial (10/11 – 23/11/2026)
js/pullups.js              planes de dominadas: validación y evaluación
firestore.rules            reglas de seguridad para Firestore
manifest.webmanifest       para "Añadir a pantalla de inicio"
```

## Prueba rápida sin configurar nada

Si `js/config.js` no tiene tus datos de Firebase, la app arranca en **modo local** (los datos se guardan solo en ese navegador). Sirve para probarla, pero no sincroniza entre dispositivos.

Para abrirla en tu ordenador hace falta un servidor local (los módulos JavaScript no funcionan con `file://`):

```
python -m http.server 8000
```

y abre `http://localhost:8000`.

## Seguridad

- Los valores de `js/config.js` **no son secretos**; la protección la dan las reglas de `firestore.rules`.
- La API key de Gemini **no se sube a GitHub**: se escribe en Ajustes y se guarda en tu cuenta. Restríngela a tu dominio de GitHub Pages en Google Cloud.

## Formato JSON de un plan de dominadas

Copia `data/plan-dominadas-1.json`, cambia fechas y series, y añádelo desde **Plan → Dominadas → Añadir plan de dominadas (.json)**.

```json
{
  "discipline": "dominadas",
  "name": "Plan de dominadas 2 (24/11 – 5/12)",
  "rest": { "min": "2:00", "max": "3:00" },
  "notes": ["Mínimo 120 s entre series…"],
  "complementary": [
    { "id": "hollow", "name": "Hollow body hold", "group": "core", "sets": 3, "unit": "s", "target": "20", "rest": "45-60", "cues": ["Lumbar pegada al suelo"] },
    { "id": "farmer", "name": "Farmer hold", "group": "agarre", "sets": 2, "unit": "s", "target": "30-40", "rest": "90", "load": "10-12,5 kg por mano", "hasLoad": true }
  ],
  "weeks": [
    { "n": 1, "title": "Primera semana", "focus": "texto libre",
      "sessions": [
        { "n": 1, "date": "2026-11-24", "title": "Sesión 1", "sets": [3, 4, 3, 3, { "max": true, "min": 5 }],
          "complementary": ["hollow"], "content": "texto libre", "after": "Después: un día de descanso." },
        { "date": "2026-12-07", "test": true, "title": "Test de máximo", "sets": [{ "max": true, "min": null }] }
      ] }
  ]
}
```

- `discipline` tiene que ser `"dominadas"`. Si no, el archivo se trata como plan de carrera.
- Una serie fija es un número (`3`) y una serie máxima es `{ "max": true, "min": 5 }`.
- En `complementary` de cada sesión se ponen los `id` del catálogo de arriba. `unit` puede ser `"s"`, `"reps"` o `"reps/lado"`, y `hasLoad: true` añade una casilla de kg.
- Fechas en formato `AAAA-MM-DD`.
