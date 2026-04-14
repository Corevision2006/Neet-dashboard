/**
 * auth.js
 * Firebase Authentication: login, signup, Google OAuth, logout,
 * session persistence, and route protection.
 *
 * Uses window.firebase (loaded from CDN in login.html / dashboard.html)
 * and the db/auth objects from firebase-config.js
 *
 * Exports:
 *  - initAuth()         → call once on page load
 *  - loginEmail(e,p)    → sign in with email + password
 *  - signupEmail(e,p,n) → create account with display name
 *  - loginGoogle()      → Google OAuth popup
 *  - logout()           → sign out + redirect to login
 *  - getCurrentUser()   → returns firebase.auth().currentUser
 *  - requireAuth()      → redirects to login if not authenticated
 */

import { auth, db } from '../firebase/firebase-config.js';
import { StudyTracker } from '../modules/study-tracker.js';

/* ── Re-export for convenience ──────────────────────────── */
export function getCurrentUser() {
  return auth.currentUser;
}

/* ── Require auth guard ─────────────────────────────────── */
export function requireAuth(redirectPath = '/login.html') {
  return new Promise((resolve, reject) => {
    const unsub = auth.onAuthStateChanged(user => {
      unsub();
      if (user) {
        resolve(user);
      } else {
        window.location.href = redirectPath;
        reject(new Error('Not authenticated'));
      }
    });
  });
}

/* ── Initialise auth observer ───────────────────────────── */
export function initAuth({ onLogin, onLogout } = {}) {
  auth.onAuthStateChanged(async user => {
    if (user) {
      // Ensure user doc exists in Firestore
      await _upsertUserDoc(user);
      // Record login time for study tracking
      await StudyTracker.recordLogin(user.uid);
      if (onLogin) onLogin(user);
    } else {
      if (onLogout) onLogout();
    }
  });
}

/* ── Email sign-in ──────────────────────────────────────── */
export async function loginEmail(email, password) {
  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return { user: cred.user, error: null };
  } catch (err) {
    return { user: null, error: _friendlyError(err.code) };
  }
}

/* ── Email sign-up ──────────────────────────────────────── */
export async function signupEmail(email, password, displayName) {
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    // Update display name
    await cred.user.updateProfile({ displayName });
    return { user: cred.user, error: null };
  } catch (err) {
    return { user: null, error: _friendlyError(err.code) };
  }
}

/* ── Google sign-in popup ───────────────────────────────── */
export async function loginGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const cred     = await auth.signInWithPopup(provider);
    return { user: cred.user, error: null };
  } catch (err) {
    return { user: null, error: _friendlyError(err.code) };
  }
}

/* ── Logout ─────────────────────────────────────────────── */
export async function logout() {
  const user = auth.currentUser;
  if (user) {
    await StudyTracker.recordLogout(user.uid);
  }
  await auth.signOut();
  window.location.href = '/login.html';
}

/* ── Upsert Firestore user doc ──────────────────────────── */
async function _upsertUserDoc(user) {
  const ref = db.collection('users').doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      name:            user.displayName || user.email.split('@')[0],
      email:           user.email,
      photoURL:        user.photoURL || null,
      totalStudyHours: 0,
      lastLogin:       firebase.firestore.FieldValue.serverTimestamp(),
      streak:          0,
      createdAt:       firebase.firestore.FieldValue.serverTimestamp(),
      groupIds:        []
    });
  } else {
    await ref.update({
      lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

/* ── Error helper ───────────────────────────────────────── */
function _friendlyError(code) {
  const map = {
    'auth/user-not-found':       'No account found with this email.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/invalid-email':        'Please enter a valid email address.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed.',
    'auth/network-request-failed': 'Network error — check your connection.'
  };
  return map[code] || 'Something went wrong. Please try again.';
}
