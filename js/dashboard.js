/**
 * dashboard.js
 * Dashboard page module — lazy loaded by router.js on first visit.
 *
 * Renders:
 *  - Greeting + streak
 *  - Stat cards (study hours, targets, score, sessions)
 *  - Today's sessions list
 *  - Subject progress bars
 *  - Mini calendar
 *  - Quick actions
 *  - Motivational quote
 *  - Group leaderboard widget
 *  - Productivity score ring
 */

import { db }           from '../firebase/firebase-config.js';
import { LS, showToast, getGreeting, calcStreak, SUBJ_COLORS, getToday, formatDate } from './utils.js';

const QUOTES = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
  { text: "The beautiful thing about learning is that no one can take it away from you.", author: "B.B. King" },
  { text: "Education is the most powerful weapon you can use to change the world.", author: "Nelson Mandela" },
  { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
  { text: "The more that you read, the more things you will know.", author: "Dr. Seuss" },
];

/* ── Module-level state (loaded from localStorage) ────────── */
let _user   = null;
let _timerLog = [];
let _schSessions = [];
let _targets = [];
let _testEntries = [];

/* ══════════════════════════════════════════════════════════
   PUBLIC API
   ══════════════════════════════════════════════════════════ */

export async function initDashboard(user) {
  _user = user;
  _loadLocalState();
  _renderAll();
  _initCalendar();
  // Fetch live Firestore data in background
  _syncFirestore(user.uid);
}

export function refreshDashboard(user) {
  _loadLocalState();
  _renderAll();
}

/* ── Group leaderboard (called by app.js router) ─────────── */
export async function initGroups(user) {
  const { GroupSystem } = await import('../modules/group-system.js');
  GroupSystem.init(user);
}

/* ══════════════════════════════════════════════════════════
   INTERNAL
   ══════════════════════════════════════════════════════════ */

function _loadLocalState() {
  _timerLog    = LS.get('sf_timerLog',    []);
  _schSessions = LS.get('sf_schedule',    []);
  _targets     = LS.get('sf_targets',     []);
  _testEntries = LS.get('sf_testEntries', []);
}

function _renderAll() {
  _renderGreeting();
  _renderStatCards();
  _renderTodaySessions();
  _renderSubjectProgress();
  _renderQuote();
  _renderProductivityScore();
  _renderGroupLeaderboard();
}

/* ── Greeting ─────────────────────────────────────────────── */
function _renderGreeting() {
  const salEl = document.getElementById('greetingSalutation');
  const subEl = document.getElementById('dashSubtitle');
  const stEl  = document.getElementById('dash-streak');
  const nameEl = document.getElementById('greetingName');

  const name = _user?.displayName?.split(' ')[0] || 'Scholar';
  if (salEl) salEl.textContent = getGreeting() + ',';
  if (nameEl) nameEl.textContent = name;

  const todaySess = _getTodaySessions();
  if (subEl) subEl.textContent = todaySess.length > 0
    ? `You have ${todaySess.length} session${todaySess.length > 1 ? 's' : ''} today. Keep the momentum going!`
    : 'No sessions scheduled today. Add one to get started!';

  if (stEl) stEl.textContent = calcStreak(_timerLog);
}

/* ── Stat cards ───────────────────────────────────────────── */
function _renderStatCards() {
  // Study hours
  const totalMins = _timerLog.reduce((s, l) => s + (l.dur || l.duration || 0), 0);
  const totalH    = (totalMins / 60).toFixed(1);
  _setText('dash-stat-hours', totalH + 'h');
  _setText('dash-stat-hours-sub', totalMins > 0 ? `${_timerLog.length} sessions total` : 'Start your first session!');

  // Targets
  const done   = _targets.filter(t => t.status === 'done').length;
  const total  = _targets.length;
  _setText('dash-stat-targets', `${done}/${total}`);
  _setText('dash-stat-targets-sub', total > 0 ? `${Math.round((done/total)*100)}% completion rate` : 'Add your first target!');

  // Score
  const avgScore = _testEntries.length
    ? (_testEntries.reduce((s, e) => s + (e.pct || 0), 0) / _testEntries.length).toFixed(1) + '%'
    : '—';
  _setText('dash-stat-score', avgScore);
  _setText('dash-stat-score-sub', _testEntries.length ? `Across ${_testEntries.length} tests` : 'Log your first test!');

  // Sessions
  const sessCount = _timerLog.length;
  _setText('dash-stat-sessions', sessCount);
  _setText('dash-stat-sessions-sub', sessCount > 0 ? `${sessCount} session${sessCount > 1 ? 's' : ''} completed` : 'Use the Focus Timer!');
}

/* ── Today's sessions ─────────────────────────────────────── */
function _renderTodaySessions() {
  const el = document.getElementById('dashTodaySessions');
  if (!el) return;
  const sessions = _getTodaySessions();
  if (!sessions.length) {
    el.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text3);font-size:13px;">
      No sessions today. <span style="color:var(--primary);cursor:pointer" onclick="navigate('schedule')">Add one →</span>
    </div>`;
    return;
  }
  const today = getToday();
  const states = LS.get('sf_sessionStates_' + today, {});
  el.innerHTML = sessions.map(s => {
    const state    = states[s.id] || 'pending';
    const isDone   = state === 'done';
    const isSkipped= state === 'skipped';
    const color    = SUBJ_COLORS[s.subject] || '#8AADA5';
    const check    = isDone ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : '';
    return `<div class="session-item ${isDone?'done':''} ${isSkipped?'skipped':''}" onclick="toggleSessionState('${s.id}','${today}')">
      <div class="session-dot" style="background:${color};"></div>
      <div class="session-info">
        <div class="session-subject">${s.subject}</div>
        <div class="session-meta">${s.topic || s.type} · ${s.dur * 30}min</div>
      </div>
      <div class="session-time">${_slotToTime(s.startSlot)}</div>
      <div class="session-check">${check}</div>
    </div>`;
  }).join('');
}

/* ── Subject progress ─────────────────────────────────────── */
function _renderSubjectProgress() {
  const el = document.getElementById('subjectProgressList');
  if (!el) return;
  const subjects = [...new Set(_schSessions.map(s => s.subject))];
  if (!subjects.length) {
    el.innerHTML = `<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px 0;">Add schedule sessions to track progress.</div>`;
    return;
  }
  const totalPerSubject = {};
  _schSessions.forEach(s => { totalPerSubject[s.subject] = (totalPerSubject[s.subject] || 0) + s.dur * 0.5; });
  const maxH = Math.max(...Object.values(totalPerSubject), 1);
  el.innerHTML = subjects.map(subj => {
    const hrs = totalPerSubject[subj] || 0;
    const pct = Math.min(100, Math.round((hrs / Math.max(hrs * 1.5, 1)) * 100)); // relative to target
    const color = SUBJ_COLORS[subj] || '#3A7A6C';
    return `<div class="sp-item">
      <div class="sp-header">
        <div class="sp-name">${subj}</div>
        <div class="sp-pct">${hrs.toFixed(1)}h</div>
      </div>
      <div class="sp-track">
        <div class="sp-fill" style="width:${pct}%;background:${color};"></div>
      </div>
    </div>`;
  }).join('');
}

/* ── Motivational quote ───────────────────────────────────── */
function _renderQuote() {
  const q = QUOTES[new Date().getDay() % QUOTES.length];
  const textEl = document.querySelector('.quote-text');
  const authEl = document.querySelector('.quote-author');
  if (textEl) textEl.textContent = `"${q.text}"`;
  if (authEl) authEl.textContent = `— ${q.author}`;
}

/* ── Productivity score ring ──────────────────────────────── */
function _renderProductivityScore() {
  const today    = getToday();
  const states   = LS.get('sf_sessionStates_' + today, {});
  const sessions = _getTodaySessions();
  if (!sessions.length) return;
  const done    = sessions.filter(s => (states[s.id] || '') === 'done').length;
  const score   = Math.round((done / sessions.length) * 100);
  const ring    = document.getElementById('prodScoreRing');
  const scoreEl = document.getElementById('prodScoreVal');
  if (ring) {
    const circ   = 2 * Math.PI * 45;
    ring.style.strokeDasharray  = circ;
    ring.style.strokeDashoffset = circ - (score / 100) * circ;
  }
  if (scoreEl) scoreEl.textContent = score + '%';
}

/* ── Group leaderboard widget ─────────────────────────────── */
async function _renderGroupLeaderboard() {
  const el = document.getElementById('groupLeaderboard');
  if (!el) return;
  // Try to get from Firestore
  const uid = _user?.uid;
  if (!uid) return;
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    const groupIds = userData?.groupIds || [];
    if (!groupIds.length) {
      el.innerHTML = `<div style="text-align:center;padding:20px;font-size:13px;color:var(--text3);">
        <div style="font-size:28px;opacity:0.25;margin-bottom:8px;">👥</div>
        Join a group to see the leaderboard.
        <br><span style="color:var(--primary);cursor:pointer;font-weight:500;" onclick="navigate('groups')">Explore Groups →</span>
      </div>`;
      return;
    }
    // Fetch members of first group
    const groupId  = groupIds[0];
    const groupDoc = await db.collection('groups').doc(groupId).get();
    const members  = groupDoc.data()?.members || [];
    // Fetch their study hours
    const memberData = await Promise.all(
      members.slice(0, 5).map(mid => db.collection('users').doc(mid).get())
    );
    const sorted = memberData
      .filter(d => d.exists)
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.totalStudyHours || 0) - (a.totalStudyHours || 0));

    const rankClass = ['gold','silver','bronze'];
    el.innerHTML = sorted.map((m, i) => {
      const initials = (m.name || 'U').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
      return `<div class="lb-item">
        <div class="lb-rank ${rankClass[i] || ''}">${i + 1}</div>
        <div class="lb-avatar">${initials}</div>
        <div class="lb-name">${m.name || 'User'} ${m.id === uid ? '(You)' : ''}</div>
        <div class="lb-hours">${(m.totalStudyHours || 0).toFixed(1)}h</div>
      </div>`;
    }).join('');
  } catch (err) {
    console.warn('Dashboard: leaderboard fetch failed', err);
  }
}

/* ── Mini calendar ────────────────────────────────────────── */
let _calYear, _calMonth;
function _initCalendar() {
  const now = new Date();
  _calYear  = now.getFullYear();
  _calMonth = now.getMonth();
  _renderCalendar();
  document.getElementById('calPrev')?.addEventListener('click', () => { _calMonth--; if (_calMonth < 0) { _calMonth = 11; _calYear--; } _renderCalendar(); });
  document.getElementById('calNext')?.addEventListener('click', () => { _calMonth++; if (_calMonth > 11) { _calMonth = 0; _calYear++; } _renderCalendar(); });
}

function _renderCalendar() {
  const label = document.getElementById('calMonthLabel');
  const grid  = document.getElementById('calGrid');
  if (!label || !grid) return;

  label.textContent = new Date(_calYear, _calMonth).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const firstDay = new Date(_calYear, _calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(_calYear, _calMonth + 1, 0).getDate();
  const today       = new Date();
  const dayNames    = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  let html = dayNames.map(d => `<div class="cal-day-name">${d}</div>`).join('');

  // Blank cells before month starts
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day other-month"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate() && _calMonth === today.getMonth() && _calYear === today.getFullYear();
    const hasEv   = _schSessions.some(s => {
      // rough mapping: just mark days that have sessions
      return true; // simplified — all days with sessions get dots
    });
    html += `<div class="cal-day${isToday?' today':''}">${d}</div>`;
  }
  grid.innerHTML = html;
}

/* ── Firestore sync ───────────────────────────────────────── */
async function _syncFirestore(uid) {
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      // Update streak from Firestore
      const stEl = document.getElementById('dash-streak');
      if (stEl && data.streak !== undefined) stEl.textContent = data.streak;
    }
  } catch (err) {
    console.warn('Dashboard: Firestore sync error', err);
  }
}

/* ── Helpers ──────────────────────────────────────────────── */
function _setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function _getTodaySessions() {
  const dow = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1; // Mon=0
  return _schSessions.filter(s => s.day === dow).sort((a, b) => a.startSlot - b.startSlot);
}

function _slotToTime(slot) {
  // slot = absolute 30-min slot from midnight
  const totalMins = slot * 30;
  const h  = Math.floor(totalMins / 60);
  const m  = totalMins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h-1)%12)+1}:${String(m).padStart(2,'0')} ${ap}`;
}

/* ── Session state toggle (exposed globally) ─────────────── */
window.toggleSessionState = function(id, today) {
  const states = LS.get('sf_sessionStates_' + today, {});
  const current = states[id] || 'pending';
  states[id] = current === 'pending' ? 'done' : current === 'done' ? 'skipped' : 'pending';
  LS.set('sf_sessionStates_' + today, states);
  _renderTodaySessions();
  _renderProductivityScore();
};
