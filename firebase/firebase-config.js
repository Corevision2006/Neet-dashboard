/**
 * firebase-config.js
 * Firebase initialization — supports both real credentials and offline/demo mode.
 *
 * To use real Firebase: replace the placeholder values below with your
 * actual Firebase project credentials from console.firebase.google.com
 *
 * If credentials are still placeholders, the app switches to OFFLINE DEMO MODE
 * where all data is stored in localStorage and a demo user is used.
 */

const firebaseConfig = {
  apiKey: "AIzaSyCx5dxenYxfqqiYZVVV3E15kt3UTEZEBuU",
  authDomain: "neet25032006.firebaseapp.com",
  databaseURL: "https://neet25032006-default-rtdb.firebaseio.com",
  projectId: "neet25032006",
  storageBucket: "neet25032006.firebasestorage.app",
  messagingSenderId: "491795804146",
  appId: "1:491795804146:web:ab742a28f521fb961e056b"
};

// Detect placeholder credentials
const _isPlaceholder = !firebaseConfig.apiKey
  || firebaseConfig.apiKey === "AIzaSyCx5dxenYxfqqiYZVVV3E15kt3UTEZEBuU"
  || firebaseConfig.projectId === "neet25032006";

// ─── OFFLINE DEMO MODE ────────────────────────────────────────────────────────
function _buildMocks() {
  const _demoUser = {
    uid: 'demo-user-local',
    displayName: 'Demo Scholar',
    email: 'demo@studyflow.app',
    photoURL: null,
    updateProfile: async (d) => { if (d.displayName) _demoUser.displayName = d.displayName; }
  };

  const FieldValue = {
    serverTimestamp: () => new Date().toISOString(),
    arrayUnion:  (...items) => ({ _arrayUnion: items }),
    arrayRemove: (...items) => ({ _arrayRemove: items }),
    increment:    (n)       => ({ _increment: n }),
  };
  const Timestamp = {
    now: () => ({ seconds: Math.floor(Date.now()/1000), toDate: () => new Date() })
  };

  const _LS_KEY = 'sf_mock_firestore';
  const _load  = () => { try { return JSON.parse(localStorage.getItem(_LS_KEY)||'{}'); } catch { return {}; } };
  const _save  = s  => { try { localStorage.setItem(_LS_KEY, JSON.stringify(s)); } catch {} };
  function _applyUpdate(existing, updates) {
    const r = { ...existing };
    for (const [k, v] of Object.entries(updates)) {
      if (v && v._arrayUnion) r[k] = [...new Set([...(r[k]||[]), ...v._arrayUnion])];
      else if (v && v._arrayRemove) r[k] = (r[k]||[]).filter(x => !v._arrayRemove.includes(x));
      else if (v && v._increment !== undefined) r[k] = (r[k] || 0) + v._increment;
      else r[k] = v;
    }
    return r;
  }
  function _docRef(col, id) {
    return {
      id,
      get: async () => { const s=_load(); const d=s[col]?.[id]??null; return { exists:d!==null, id, data:()=>d }; },
      set: async (data, opts={}) => { const s=_load(); s[col]=s[col]||{}; s[col][id]=opts.merge&&s[col][id]?_applyUpdate(s[col][id],data):{...data}; _save(s); },
      update: async (data) => { const s=_load(); s[col]=s[col]||{}; s[col][id]=_applyUpdate(s[col][id]||{},data); _save(s); },
      delete: async () => { const s=_load(); if(s[col]) delete s[col][id]; _save(s); }
    };
  }
  const _emptyQ = { get: async()=>({empty:true,docs:[],forEach:()=>{}}), limit:()=>_emptyQ, orderBy:()=>_emptyQ, where:()=>_emptyQ };
  function _collRef(name) {
    return {
      doc: (id) => _docRef(name, id||Math.random().toString(36).slice(2)),
      add: async (data) => { const id=Math.random().toString(36).slice(2); await _docRef(name,id).set(data); return {id}; },
      where: ()=>_emptyQ, orderBy:()=>_emptyQ, limit:()=>_emptyQ,
      get: async () => { const s=_load(); const docs=Object.entries(s[name]||{}).map(([id,data])=>({exists:true,id,data:()=>data})); return {empty:docs.length===0,docs,forEach:(fn)=>docs.forEach(fn)}; }
    };
  }
  const mockDb = {
    collection: _collRef,
    enablePersistence: () => Promise.resolve(),
    batch: () => ({ set:()=>{}, update:()=>{}, delete:()=>{}, commit: async()=>{} })
  };

  let _listeners = [];
  const mockAuth = {
    currentUser: _demoUser,
    onAuthStateChanged: (cb) => {
      _listeners.push(cb);
      setTimeout(() => cb(_demoUser), 0);
      return () => { _listeners = _listeners.filter(l => l !== cb); };
    },
    signInWithEmailAndPassword: async (email) => { _demoUser.email=email; _demoUser.displayName=email.split('@')[0]; return { user: _demoUser }; },
    createUserWithEmailAndPassword: async (email) => { _demoUser.email=email; return { user: _demoUser }; },
    signInWithPopup: async () => ({ user: _demoUser }),
    signOut: async () => { mockAuth.currentUser=null; _listeners.forEach(l=>l(null)); }
  };

  // Patch global firebase object
  window.firebase = window.firebase || {};
  window.firebase.apps = ['mock'];
  window.firebase.auth = () => mockAuth;
  window.firebase.auth.GoogleAuthProvider = class {};
  window.firebase.firestore = () => mockDb;
  window.firebase.firestore.FieldValue = FieldValue;
  window.firebase.firestore.Timestamp  = Timestamp;
  window.firebase.initializeApp = () => {};

  return { db: mockDb, auth: mockAuth };
}

// ─── REAL FIREBASE MODE ───────────────────────────────────────────────────────
function _buildReal() {
  if (!window.firebase.apps.length) window.firebase.initializeApp(firebaseConfig);
  const db   = window.firebase.firestore();
  const auth = window.firebase.auth();
  db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  return { db, auth };
}

const { db, auth } = _isPlaceholder ? _buildMocks() : _buildReal();

if (_isPlaceholder) {
  console.log('%c StudyFlow %c 🔧 OFFLINE DEMO MODE — Add Firebase credentials to go live ',
    'background:#1C3833;color:#8AADA5;font-weight:bold;padding:2px 4px;border-radius:3px 0 0 3px;',
    'background:#3A7A6C;color:#fff;padding:2px 4px;border-radius:0 3px 3px 0;');
}

export { db, auth };
export const firebase = window.firebase;
