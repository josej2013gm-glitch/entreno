// =====================================================================
//  config.js — PEGA AQUÍ LA CONFIGURACIÓN DE TU PROYECTO DE FIREBASE
//  (Consola de Firebase → ⚙ Configuración del proyecto → Tus apps → SDK
//   setup and configuration → "Config"). Ver Manual, paso 5.
//
//  Estos valores NO son secretos: identifican tu proyecto. La seguridad
//  la ponen las reglas de Firestore (firestore.rules).
//  La API key de Google AI (Gemini) NO va aquí: se introduce dentro de la
//  app, en Ajustes, y se guarda en tu cuenta.
// =====================================================================

export const firebaseConfig = {
  apiKey: "PEGA_AQUI_TU_API_KEY_DE_FIREBASE",
  authDomain: "TU-PROYECTO.firebaseapp.com",
  projectId: "TU-PROYECTO",
  storageBucket: "TU-PROYECTO.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000",
};

// Versión del SDK de Firebase que se descarga del CDN oficial (gstatic).
// Si la consola de Firebase te muestra otra versión en su fragmento de
// código, puedes poner esa misma aquí.
export const FIREBASE_VERSION = "12.15.0";

// Modelo de Gemini por defecto (se puede cambiar en Ajustes de la app).
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
