/**
 * firebase-config.js
 *
 * ┌─ TO USE REAL FIREBASE ────────────────────────────────────────────┐
 * │ Replace the placeholder values below with your actual credentials │
 * │ from https://console.firebase.google.com → Project Settings.      │
 * └───────────────────────────────────────────────────────────────────┘
 *
 * Without real credentials the app runs in Offline Demo Mode —
 * all data is saved in localStorage, no account required.
 */

const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// ── Detect real vs placeholder credentials ────────────────────────────
const _hasRealCreds = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  firebaseConfig.projectId !== "YOUR_PROJECT_ID"
);

window.__SF_NEED_MOCK = !_hasRealCreds;

// ── Build auth and db references ──────────────────────────────────────
let _auth, _db;

if (_hasRealCreds) {
  // Real Firebase
  if (!window.firebase.apps.length) {
    window.firebase.initializeApp(firebaseConfig);
  }
  _db   = window.firebase.firestore();
  _auth = window.firebase.auth();
  _db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

  console.log('%c StudyFlow %c 🔥 Firebase Connected ', 
    'background:#1C3833;color:#8AADA5;font-weight:bold;padding:2px 6px;border-radius:3px 0 0 3px;',
    'background:#3A7A6C;color:#fff;padding:2px 6px;border-radius:0 3px 3px 0;');

} else {
  // Offline Demo Mode — use the mock installed by the inline script in index.html
  _auth = window.__SF_MOCK_AUTH;
  _db   = window.__SF_MOCK_DB;

  const _FV = window.__SF_FIELD_VALUE;
  const _TS = window.__SF_TIMESTAMP;

  // Re-patch window.firebase in case CDN scripts overwrote the inline mock
  try {
    window.firebase.auth      = () => _auth;
    window.firebase.firestore = () => _db;
    if (window.firebase.auth)      window.firebase.auth.GoogleAuthProvider      = class {};
    if (window.firebase.firestore) window.firebase.firestore.FieldValue = _FV;
    if (window.firebase.firestore) window.firebase.firestore.Timestamp  = _TS;
  } catch(e) { /* read-only props — ignore */ }

  console.log('%c StudyFlow %c 🔧 Offline Demo Mode — add Firebase credentials to go live ',
    'background:#1C3833;color:#8AADA5;font-weight:bold;padding:2px 6px;border-radius:3px 0 0 3px;',
    'background:#3A7A6C;color:#fff;padding:2px 6px;border-radius:0 3px 3px 0;');
}

export const db      = _db;
export const auth    = _auth;
export const firebase = window.firebase;
