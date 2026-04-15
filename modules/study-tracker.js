/**
 * study-tracker.js
 * Office-style attendance & study session tracking via Firestore.
 *
 * Firestore schema:
 *  users/{uid}/totalStudyHours  (number, cumulative)
 *  sessions/{sessionId}         (full session record)
 *
 * Workflow:
 *  User logs in  → StudyTracker.recordLogin(uid)
 *  Timer started → StudyTracker.startSession(uid, subject, type)
 *  Timer stopped → StudyTracker.endSession(sessionId, uid)
 *  User logs out → StudyTracker.recordLogout(uid)
 */

import { db, firebase } from '../firebase/firebase-config.js';
import { LS, getToday } from '../js/utils.js';

// Safe shims — work with both real Firebase and offline mock mode
const TS = (firebase && firebase.firestore && firebase.firestore.Timestamp)
  || { now: () => ({ seconds: Math.floor(Date.now()/1000), toDate: () => new Date() }) };

const FieldValue = (firebase && firebase.firestore && firebase.firestore.FieldValue)
  || {
    serverTimestamp: () => new Date().toISOString(),
    arrayUnion:  (...i) => ({ _arrayUnion: i }),
    arrayRemove: (...i) => ({ _arrayRemove: i }),
    increment:    (n)  => ({ _increment: n })
  };

export const StudyTracker = {

  /* ──────────────────────────────────────────────────────
     LOGIN — record login time
  ────────────────────────────────────────────────────── */
  async recordLogin(uid) {
    const today = getToday();
    // Store in Firestore
    try {
      await db.collection('attendance').doc(`${uid}_${today}`).set({
        uid,
        date:       today,
        loginTime:  TS.now(),
        logoutTime: null,
        totalMins:  0
      }, { merge: true });
    } catch (err) {
      console.warn('StudyTracker.recordLogin:', err);
    }
    // Also persist in localStorage for offline
    LS.set('sf_loginTime', new Date().toISOString());
  },

  /* ──────────────────────────────────────────────────────
     LOGOUT — compute and persist daily total
  ────────────────────────────────────────────────────── */
  async recordLogout(uid) {
    const today    = getToday();
    const loginISO = LS.get('sf_loginTime');
    if (!loginISO) return;
    const loginTime  = new Date(loginISO);
    const logoutTime = new Date();
    const totalMins  = Math.round((logoutTime - loginTime) / 60000);
    try {
      await db.collection('attendance').doc(`${uid}_${today}`).set({
        logoutTime: TS.now(),
        totalMins
      }, { merge: true });
      // Increment user's cumulative totalStudyHours
      await db.collection('users').doc(uid).update({
        totalStudyHours: FieldValue.increment(totalMins / 60),
        lastLogout: TS.now()
      });
    } catch (err) {
      console.warn('StudyTracker.recordLogout:', err);
    }
    LS.remove('sf_loginTime');
  },

  /* ──────────────────────────────────────────────────────
     START a focus session (timer pressed)
  ────────────────────────────────────────────────────── */
  async startSession(uid, subject, type = 'focus') {
    const ref = db.collection('sessions').doc();
    const sessionData = {
      sessionId: ref.id,
      uid,
      subject,
      type,
      startTime: TS.now(),
      endTime:   null,
      duration:  null,       // filled on end
      date:      getToday()
    };
    try {
      await ref.set(sessionData);
    } catch (err) {
      console.warn('StudyTracker.startSession:', err);
    }
    // Cache session ID locally so we can close it even on refresh
    LS.set('sf_activeSessionId', ref.id);
    return ref.id;
  },

  /* ──────────────────────────────────────────────────────
     END a focus session (timer paused/reset/phase change)
  ────────────────────────────────────────────────────── */
  async endSession(sessionId, uid, durationMins) {
    if (!sessionId) return;
    try {
      await db.collection('sessions').doc(sessionId).update({
        endTime:  TS.now(),
        duration: durationMins
      });
      // Increment user's totalStudyHours
      await db.collection('users').doc(uid).update({
        totalStudyHours: FieldValue.increment(durationMins / 60)
      });
    } catch (err) {
      console.warn('StudyTracker.endSession:', err);
    }
    LS.remove('sf_activeSessionId');
  },

  /* ──────────────────────────────────────────────────────
     GET today's stats for a user
  ────────────────────────────────────────────────────── */
  async getTodayStats(uid) {
    const today = getToday();
    try {
      const snap = await db.collection('sessions')
        .where('uid', '==', uid)
        .where('date', '==', today)
        .get();
      const sessions = snap.docs.map(d => d.data());
      const totalMins = sessions.reduce((s, sess) => s + (sess.duration || 0), 0);
      return { sessions, totalMins, totalHours: (totalMins / 60).toFixed(2) };
    } catch (err) {
      console.warn('StudyTracker.getTodayStats:', err);
      return { sessions: [], totalMins: 0, totalHours: '0.00' };
    }
  },

  /* ──────────────────────────────────────────────────────
     GET weekly stats
  ────────────────────────────────────────────────────── */
  async getWeeklyStats(uid) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    try {
      const snap = await db.collection('sessions')
        .where('uid', '==', uid)
        .where('startTime', '>=', TS.fromDate(sevenDaysAgo))
        .orderBy('startTime', 'desc')
        .get();
      const sessions = snap.docs.map(d => d.data());
      const totalMins = sessions.reduce((s, sess) => s + (sess.duration || 0), 0);
      // Group by day
      const byDay = {};
      sessions.forEach(sess => {
        const day = sess.date || 'unknown';
        byDay[day] = (byDay[day] || 0) + (sess.duration || 0);
      });
      return { sessions, totalMins, totalHours: (totalMins / 60).toFixed(2), byDay };
    } catch (err) {
      console.warn('StudyTracker.getWeeklyStats:', err);
      return { sessions: [], totalMins: 0, totalHours: '0.00', byDay: {} };
    }
  },

  /* ──────────────────────────────────────────────────────
     UPDATE streak in Firestore
  ────────────────────────────────────────────────────── */
  async updateStreak(uid, streak) {
    try {
      await db.collection('users').doc(uid).update({ streak });
    } catch {}
  }
};
