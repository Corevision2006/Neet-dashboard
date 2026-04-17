/**
 * auth.js — Firebase Authentication with stable session handling.
 *
 * Fixes:
 *  - Google sign-in popup no longer flashes/disappears
 *  - Sign-out properly clears session and stays on login page
 *  - Demo mode is explicitly separated from real Firebase auth
 *  - Auth state resolves exactly once before acting (prevents double-fire)
 */

import { auth, db, firebase, isDemo } from '../firebase/firebase-config.js';
import { StudyTracker } from '../modules/study-tracker.js';

/* ── Re-export ──────────────────────────────────────────── */
export function getCurrentUser() { return auth.currentUser; }
export { isDemo };

/* ── Require auth guard ─────────────────────────────────── */
export function requireAuth(redirectPath = 'login.html') {
  return new Promise((resolve, reject) => {
    const unsub = auth.onAuthStateChanged(user => {
      unsub();
      if (user) {
        resolve(user);
      } else {
        const base = window.location.href.replace(/[^/]*$/, '');
        window.location.href = base + redirectPath;
        reject(new Error('Not authenticated'));
      }
    });
  });
}

/* ── Initialise auth observer ───────────────────────────── */
export function initAuth({ onLogin, onLogout } = {}) {
  let resolved = false; // prevent double-fire on rapid state changes

  auth.onAuthStateChanged(async user => {
    if (user) {
      // Skip double-fire for the same user
      if (resolved && auth.currentUser?.uid === user.uid) return;
      resolved = true;

      try {
        await _upsertUserDoc(user);
        await StudyTracker.recordLogin(user.uid);
      } catch (e) {
        console.warn('initAuth background tasks:', e);
      }
      if (onLogin) onLogin(user);
    } else {
      resolved = false;
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
    await cred.user.updateProfile({ displayName });
    return { user: cred.user, error: null };
  } catch (err) {
    return { user: null, error: _friendlyError(err.code) };
  }
}

/* ── Google sign-in popup ───────────────────────────────── */
export async function loginGoogle() {
  if (isDemo) {
    // Demo mode: just return demo user
    return { user: auth.currentUser, error: null };
  }
  try {
    // Use the real GoogleAuthProvider from the Firebase compat SDK
    const Provider = window.firebase?.auth?.GoogleAuthProvider;
    if (!Provider) throw new Error('GoogleAuthProvider not available');
    const provider = new Provider();
    provider.addScope('profile');
    provider.addScope('email');
    const cred = await auth.signInWithPopup(provider);
    return { user: cred.user, error: null };
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user') {
      return { user: null, error: null }; // user cancelled — not a real error
    }
    return { user: null, error: _friendlyError(err.code) };
  }
}

/* ── Logout ─────────────────────────────────────────────── */
export async function logout() {
  try {
    const user = auth.currentUser;
    if (user) await StudyTracker.recordLogout(user.uid);
  } catch(e) {}

  try {
    await auth.signOut();
  } catch(e) {}

  // Clear any demo session flags
  try { sessionStorage.removeItem('sf_demo_entered'); } catch(e) {}

  const _href = window.location.href;
  const _base = _href.substring(0, _href.lastIndexOf('/') + 1);
  window.location.href = _base + 'login.html';
}

async function _upsertUserDoc(user) {
  if (!user || !auth.currentUser || auth.currentUser.uid !== user.uid) return;
  const FV = (firebase && firebase.firestore && firebase.firestore.FieldValue)
    || { serverTimestamp: () => new Date().toISOString() };

  try {
    const ref = db.collection('users').doc(user.uid);
    let isOffline = false;
    let exists = false;

    try {
      const snap = await ref.get();
      exists = snap.exists;
    } catch (err) {
      // 4. Proper Error Handling (Differentiate unavailable vs permission denied)
      if (err.code === 'unavailable' || err.message.includes('offline')) {
        isOffline = true;
        console.warn('⚠️ Network offline or Firestore establishing WebSocket. Queuing safe background write.');
      } else if (err.code === 'permission-denied') {
        console.error('❌ Auth valid, but Firestore denied access. Check your Security Rules.');
        return; // Abort write if explicitly denied
      } else {
        throw err;
      }
    }

    if (exists) {
      // Online and exists: safe to just update lastLogin
      await ref.update({ lastLogin: FV.serverTimestamp() });
    } else {
      // 2. Ensure idempotent user document creation
      // If we are offline, we cannot know if the doc exists or not, so we use merge: true
      // to ensure we NEVER overwrite core stats like totalStudyHours if it DID already exist.
      const payload = {
        name:      user.displayName || user.email?.split('@')[0] || 'Scholar',
        email:     user.email || '',
        photoURL:  user.photoURL || null,
        lastLogin: FV.serverTimestamp()
      };
      
      // If we are 100% online and know it's a fresh creation, append creation stats
      if (!isOffline) {
        payload.totalStudyHours = 0;
        payload.streak = 0;
        payload.createdAt = FV.serverTimestamp();
        payload.groupIds = [];
      }

      // Merge true prevents overwrite of stats if we were offline but the doc existed
      await ref.set(payload, { merge: true });
    }
  } catch(e) {
    console.error('❌ _upsertUserDoc critical failure:', e);
  }
}

/* ── Error helper ───────────────────────────────────────── */
function _friendlyError(code) {
  const map = {
    'auth/user-not-found':         'No account found with this email.',
    'auth/wrong-password':         'Incorrect password.',
    'auth/invalid-credential':     'Email or password is incorrect.',
    'auth/email-already-in-use':   'An account with this email already exists.',
    'auth/weak-password':          'Password must be at least 6 characters.',
    'auth/invalid-email':          'Please enter a valid email address.',
    'auth/popup-closed-by-user':   'Sign-in popup was closed.',
    'auth/popup-blocked':          'Popup was blocked. Allow popups for this site.',
    'auth/network-request-failed': 'Network error — check your connection.',
    'auth/too-many-requests':      'Too many attempts. Please wait a moment.'
  };
  return map[code] || `Sign-in failed. (${code})`;
}
