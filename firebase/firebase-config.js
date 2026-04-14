/**
 * firebase-config.js
 * Central Firebase initialization — imported by auth.js and all modules that need Firestore.
 * Replace the placeholder values below with your actual Firebase project credentials.
 */

const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// ── Guard: only initialize once ──────────────────────────────────────────────
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db   = firebase.firestore();
const auth = firebase.auth();

// Enable offline persistence (Firestore caches data locally)
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore persistence: multiple tabs open.');
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore persistence: browser not supported.');
  }
});

export { db, auth, firebase };
