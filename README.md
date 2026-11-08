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
