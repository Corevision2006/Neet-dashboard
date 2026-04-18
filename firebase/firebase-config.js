/**
 * firebase-config.js — StudyFlow
 * Real Firebase credentials. Demo mode disabled.
 */

const firebaseConfig = {
  apiKey:            "AIzaSyCx5dxenYxfqqiYZVVV3E15kt3UTEZEBuU",
  authDomain:        "neet25032006.firebaseapp.com",
  databaseURL:       "https://neet25032006-default-rtdb.firebaseio.com",
  projectId:         "neet25032006",
  storageBucket:     "neet25032006.firebasestorage.app",
  messagingSenderId: "491795804146",
  appId:             "1:491795804146:web:ab742a28f521fb961e056b"
};

// Real credentials → demo mode OFF
export const isDemo = false;
window.__SF_IS_DEMO  = false;
window.__SF_NEED_MOCK = false;

// Initialize Firebase (compat SDK already loaded via CDN <script> tags)
if (!window.firebase.apps.length) {
  window.firebase.initializeApp(firebaseConfig);
}

export const db      = window.firebase.firestore();
export const auth    = window.firebase.auth();
export const firebase = window.firebase;

// Keep session across reloads
auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

// Offline persistence for Firestore
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
    console.warn('Firestore persistence error:', err);
  }
});

console.log('%c StudyFlow %c 🔥 Firebase Connected ',
  'background:#1C3833;color:#8AADA5;font-weight:bold;padding:2px 6px;border-radius:3px 0 0 3px;',
  'background:#3A7A6C;color:#fff;padding:2px 6px;border-radius:0 3px 3px 0;');
