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
import { mockAuth, mockDb, FieldValue, Timestamp } from './mock-firebase.js';
import { ENV } from './env.js';

const firebaseConfig = {
  apiKey:            ENV.FIREBASE_API_KEY,
  authDomain:        ENV.FIREBASE_AUTH_DOMAIN,
  databaseURL:       ENV.FIREBASE_DATABASE_URL,
  projectId:         ENV.FIREBASE_PROJECT_ID,
  storageBucket:     ENV.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.FIREBASE_MESSAGING_SENDER_ID,
  appId:             ENV.FIREBASE_APP_ID
};

// ── Detect real vs placeholder credentials ────────────────────────────
const _hasRealCreds = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  firebaseConfig.projectId !== "YOUR_PROJECT_ID"
);

// Export demo mode flag for use across the app
export const isDemo = !_hasRealCreds;
window.__SF_IS_DEMO = !_hasRealCreds;

// ── Build auth and db references ──────────────────────────────────────
let _auth, _db;

if (_hasRealCreds) {
  // Real Firebase
  if (window.firebase && !window.firebase.apps.length) {
    window.firebase.initializeApp(firebaseConfig);
  }
  _db   = window.firebase.firestore();
  _auth = window.firebase.auth();
  // Maintain session across page reloads
  _auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
  try {
    _db.settings({
      localCache: window.firebase.firestore.persistentLocalCache({
        tabManager: window.firebase.firestore.persistentMultipleTabManager()
      })
    });
  } catch (e) {
    console.warn("Could not enable Firestore persistence:", e);
  }

  console.log('%c StudyFlow %c 🔥 Firebase Connected ',
    'background:#1C3833;color:#8AADA5;font-weight:bold;padding:2px 6px;border-radius:3px 0 0 3px;',
    'background:#3A7A6C;color:#fff;padding:2px 6px;border-radius:0 3px 3px 0;');

} else {
  // Offline Demo Mode
  _auth = mockAuth;
  _db   = mockDb;

  // Initialize fake global firebase object for plugins
  if (!window.firebase) {
    window.firebase = {
      apps: ['mock'],
      auth: () => _auth,
      firestore: () => _db,
    };
    window.firebase.auth.GoogleAuthProvider = class { addScope(){} };
    window.firebase.firestore.FieldValue = FieldValue;
    window.firebase.firestore.Timestamp  = Timestamp;
  }

  console.log('%c StudyFlow %c 🔧 Offline Demo Mode — add Firebase credentials to go live ',
    'background:#1C3833;color:#8AADA5;font-weight:bold;padding:2px 6px;border-radius:3px 0 0 3px;',
    'background:#3A7A6C;color:#fff;padding:2px 6px;border-radius:0 3px 3px 0;');
}

export const db       = _db;
export const auth     = _auth;
export const firebase = window.firebase;
