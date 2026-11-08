// =====================================================================
//  store.js — Almacenamiento de datos
//   · Modo nube: Firebase Auth (Google) + Cloud Firestore
//   · Modo local: localStorage del navegador (si config.js no está
//     rellenado todavía). Sirve para probar la app sin configurar nada.
//
//  Estructura en Firestore:
//    users/{uid}/meta/settings          → ajustes (objetivos, API key IA…)
//    users/{uid}/sessions/{id}          → sesiones de carrera
//    users/{uid}/plans/{id}             → planes (Bloque I, planes IA…)
//    users/{uid}/extras/{id}            → salto a pies juntos y dominadas
// =====================================================================
import { firebaseConfig, FIREBASE_VERSION } from './config.js';

export const COLLECTIONS = ['sessions', 'plans', 'extras'];
const isConfigured = () => firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('PEGA_AQUI') && !firebaseConfig.projectId.startsWith('TU-PROYECTO');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const clean = obj => JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));

// ------------------------- modo local -------------------------------
class LocalStore {
  constructor() { this.mode = 'local'; this.user = { displayName: 'Modo local', email: 'sin cuenta', photoURL: '' }; }
  async init(onUser) { onUser(this.user); }
  async signIn() { return this.user; }
  async signOut() { alert('En modo local no hay sesión que cerrar. Configura Firebase (Manual, pasos 2–6) para usar tu cuenta de Google.'); }
  _key(c) { return `entrenos.${c}`; }
  _read(c) { try { return JSON.parse(localStorage.getItem(this._key(c)) || '[]'); } catch { return []; } }
  _write(c, arr) { localStorage.setItem(this._key(c), JSON.stringify(arr)); }
  async list(c) { return this._read(c); }
  async put(c, obj) {
    const arr = this._read(c); const o = clean({ ...obj, id: obj.id || uid(), updatedAt: new Date().toISOString() });
    const i = arr.findIndex(x => x.id === o.id); if (i >= 0) arr[i] = o; else arr.push(o);
    this._write(c, arr); return o;
  }
  async putMany(c, objs) { const arr = this._read(c); const out = [];
    for (const obj of objs) { const o = clean({ ...obj, id: obj.id || uid(), updatedAt: new Date().toISOString() });
      const i = arr.findIndex(x => x.id === o.id); if (i >= 0) arr[i] = o; else arr.push(o); out.push(o); }
    this._write(c, arr); return out; }
  async del(c, id) { this._write(c, this._read(c).filter(x => x.id !== id)); }
  async getSettings() { try { return JSON.parse(localStorage.getItem('entrenos.settings') || '{}'); } catch { return {}; } }
  async saveSettings(s) { localStorage.setItem('entrenos.settings', JSON.stringify(clean(s))); }
}

// ------------------------- modo Firebase ----------------------------
class FirebaseStore {
  constructor() { this.mode = 'firebase'; this.user = null; }
  async init(onUser) {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const [{ initializeApp }, auth, fs] = await Promise.all([
      import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`)]);
    this.authMod = auth; this.fs = fs;
    this.app = initializeApp(firebaseConfig);
    this.auth = auth.getAuth(this.app);
    try { // caché offline: puedes registrar en la pista sin cobertura
      this.db = fs.initializeFirestore(this.app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    } catch { this.db = fs.getFirestore(this.app); }
    try { await auth.getRedirectResult(this.auth); } catch (e) { console.warn(e); }
    auth.onAuthStateChanged(this.auth, u => { this.user = u; onUser(u); });
  }
  async signIn() {
    const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = this.authMod;
    const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
    try { return await signInWithPopup(this.auth, provider); }
    catch (e) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) return signInWithRedirect(this.auth, provider);
      throw e;
    }
  }
  async signOut() { return this.authMod.signOut(this.auth); }
  _col(c) { return this.fs.collection(this.db, 'users', this.user.uid, c); }
  async list(c) { const snap = await this.fs.getDocs(this._col(c)); return snap.docs.map(d => ({ ...d.data(), id: d.id })); }
  async put(c, obj) {
    const o = clean({ ...obj, id: obj.id || uid(), updatedAt: new Date().toISOString() });
    await this.fs.setDoc(this.fs.doc(this._col(c), o.id), o); return o;
  }
  async putMany(c, objs) { // lotes de 400 (límite de Firestore: 500 operaciones)
    const out = [];
    for (let i = 0; i < objs.length; i += 400) {
      const batch = this.fs.writeBatch(this.db);
      for (const obj of objs.slice(i, i + 400)) {
        const o = clean({ ...obj, id: obj.id || uid(), updatedAt: new Date().toISOString() });
        batch.set(this.fs.doc(this._col(c), o.id), o); out.push(o);
      }
      await batch.commit();
    }
    return out;
  }
  async del(c, id) { await this.fs.deleteDoc(this.fs.doc(this._col(c), id)); }
  _settingsRef() { return this.fs.doc(this.db, 'users', this.user.uid, 'meta', 'settings'); }
  async getSettings() { const s = await this.fs.getDoc(this._settingsRef()); return s.exists() ? s.data() : {}; }
  async saveSettings(s) { await this.fs.setDoc(this._settingsRef(), clean(s)); }
}

export function createStore() { return isConfigured() ? new FirebaseStore() : new LocalStore(); }
