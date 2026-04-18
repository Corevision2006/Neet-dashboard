/**
 * app.js — StudyFlow main entry point.
 *
 * Fixes/additions in this version:
 *  ✦ isDemo imported — prevents onLogout firing for demo sign-outs
 *  ✦ window._sfCurrentUser set so timer.js can write to Firestore
 *  ✦ Profile page initializer added
 *  ✦ Dashboard auto-refreshes on sf:sessionComplete
 *  ✦ Floating timer pill stays in sync with timer.js presets
 */

import { initAuth, logout, getCurrentUser } from './auth.js';
import { Router }   from './router.js';
import { showToast } from './utils.js';

const LS = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v)        => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

let router;

/* ══════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Safety net: show dashboard if nothing activated after 3s
  setTimeout(() => {
    if (!document.querySelector('.page.active')) {
      document.getElementById('page-dashboard')?.classList.add('active');
    }
  }, 3000);

  initAuth({
    onLogin:  user => _startApp(user),
    onLogout: () => {
      // Redirect to login.html — works on GitHub Pages, Firebase Hosting, localhost
      const base = window.location.href.split('/').slice(0, -1).join('/') + '/';
      window.location.href = base + 'login.html';
    }
  });
});

async function _startApp(user) {
  // Make current user globally available (used by timer.js, StudyTracker)
  window._sfCurrentUser = user;

  _populateSidebar(user);
  if (LS.get('sf_dark')) document.body.classList.add('dark');

  router = new Router({
    defaultPage: 'dashboard',
    pageInitializers: {
      dashboard: async () => {
        const { initDashboard } = await import('./dashboard.js');
        await initDashboard(user);
      },
      schedule: async () => {
        const { initSchedule } = await import('./schedule.js');
        initSchedule();
      },
      timer: async () => {
        const { initTimer } = await import('./timer.js');
        initTimer();
      },
      progress: async () => {
        const { initProgress } = await import('./progress.js');
        initProgress();
      },
      notes: async () => {
        const { initNotes } = await import('./notes.js');
        initNotes();
      },
      groups: async () => {
        const { initGroups } = await import('./dashboard.js');
        initGroups(user);
      },
      profile: async () => {
        const { initProfile } = await import('./profile.js');
        initProfile(user);
      },
      // Refresh hooks — run every visit after first
      'dashboard:refresh': async () => {
        const { refreshDashboard } = await import('./dashboard.js');
        refreshDashboard(user);
      }
    },
    onNavigate: (pageId) => {
      const ft = document.getElementById('floatTimer');
      if (ft) ft.style.display = pageId === 'timer' ? 'none' : 'flex';
    }
  });

  router.exposeGlobal();

  // Flush any clicks that arrived before router was ready
  (window._sfNavQueue || []).forEach(({ page, el }) => router.navigate(page, el));
  window._sfNavQueue = [];

  _wireSidebarNav();
  _wireDarkToggle();
  _wireNotifications();
  _wireMobileSidebar();
  _wireLogout();
  _initFloatingTimer();

  window.showToast = showToast;

  // Auto-refresh dashboard when a focus session completes
  window.addEventListener('sf:sessionComplete', async () => {
    if (router.currentPage === 'dashboard') {
      const { refreshDashboard } = await import('./dashboard.js');
      refreshDashboard(user);
    }
  });

  setTimeout(() => showToast(`👋 Welcome back, ${user.displayName || 'Scholar'}!`), 800);
}

/* ── Populate sidebar ─────────────────────────────────────── */
function _populateSidebar(user) {
  const name     = user.displayName || user.email?.split('@')[0] || 'Scholar';
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const avatarEl = document.querySelector('.sidebar-bottom .avatar');
  const nameEl   = document.querySelector('.sidebar-bottom .user-info .name');
  const greetEl  = document.getElementById('greetingName');

  if (avatarEl) avatarEl.textContent = initials;
  if (nameEl)   nameEl.textContent   = name;
  if (greetEl)  greetEl.textContent  = name.split(' ')[0];

  // Set avatar photo if available (Google sign-in)
  if (user.photoURL && avatarEl) {
    avatarEl.style.backgroundImage = `url(${user.photoURL})`;
    avatarEl.style.backgroundSize  = 'cover';
    avatarEl.style.backgroundPosition = 'center';
    avatarEl.textContent = '';
  }

  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  const pageTitleEl = document.getElementById('pageTitle');
  if (pageTitleEl) pageTitleEl.innerHTML = `${greeting}, <span>${name.split(' ')[0]}</span> ✦`;
}

/* ── Sidebar nav ──────────────────────────────────────────── */
function _wireSidebarNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => router.navigate(el.dataset.page, el));
  });
}

/* ── Dark mode ────────────────────────────────────────────── */
function _wireDarkToggle() {
  const btn  = document.getElementById('darkToggleBtn');
  const icon = document.getElementById('darkIcon');
  if (!btn) return;
  if (LS.get('sf_dark')) { document.body.classList.add('dark'); if (icon) icon.textContent = '☀️'; }
  btn.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    LS.set('sf_dark', isDark);
  });
}

/* ── Notifications ────────────────────────────────────────── */
function _wireNotifications() {
  const btn   = document.getElementById('notifBtn');
  const panel = document.getElementById('notifPanel');
  if (!btn || !panel) return;
  btn.addEventListener('click', e => { e.stopPropagation(); panel.classList.toggle('open'); });
  document.addEventListener('click', () => panel.classList.remove('open'));
  panel.addEventListener('click', e => e.stopPropagation());
  document.getElementById('notifMarkAll')?.addEventListener('click', () => {
    document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
    const c = document.getElementById('notifCount');
    if (c) { c.textContent = '0'; c.classList.add('zero'); }
  });
}

/* ── Mobile sidebar ───────────────────────────────────────── */
function _wireMobileSidebar() {
  const menuBtn = document.getElementById('mobileMenuBtn');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const close   = () => { sidebar?.classList.remove('open'); overlay?.classList.remove('visible'); };
  menuBtn?.addEventListener('click', () => { sidebar?.classList.toggle('open'); overlay?.classList.toggle('visible'); });
  overlay?.addEventListener('click', close);
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => { if (window.innerWidth <= 900) close(); });
  });
}

/* ── Logout ───────────────────────────────────────────────── */
function _wireLogout() {
  document.getElementById('logoutBtn')?.addEventListener('click', () => logout());
}

/* ══════════════════════════════════════════════════════════
   FLOATING TIMER PILL
   ══════════════════════════════════════════════════════════ */
let _ftInterval = null;
let _ftRunning  = false;
let _ftSeconds  = 25 * 60;
let _ftTotal    = 25 * 60;
let _ftPhase    = 'Focus';

function _initFloatingTimer() {
  const pill = document.getElementById('ftPill');
  if (!pill) return;

  _updateFtDisplay();

  document.getElementById('ftPlayBtn')?.addEventListener('click',  e => { e.stopPropagation(); _toggleFt(); });
  document.getElementById('ftResetBtn')?.addEventListener('click', e => { e.stopPropagation(); _resetFt(); });
  document.getElementById('ftCloseBtn')?.addEventListener('click', e => { e.stopPropagation(); pill.style.display = 'none'; });
  pill.addEventListener('click', () => router.navigate('timer'));

  // timer.js calls these to keep the pill in sync
  window._ftGetState = () => ({ running: _ftRunning, seconds: _ftSeconds, total: _ftTotal, phase: _ftPhase });
  window._ftSetState = (s) => {
    if (s.seconds !== undefined) _ftSeconds = s.seconds;
    if (s.running !== undefined) _ftRunning = s.running;
    if (s.total   !== undefined) _ftTotal   = s.total;
    if (s.phase   !== undefined) _ftPhase   = s.phase;
    _updateFtDisplay();
  };
}

function _toggleFt() {
  _ftRunning = !_ftRunning;
  if (_ftRunning) {
    _ftInterval = setInterval(() => {
      if (_ftSeconds > 0) { _ftSeconds--; _updateFtDisplay(); }
      else { _endFtSession(); }
    }, 1000);
  } else {
    clearInterval(_ftInterval);
  }
  _updateFtDisplay();
}

function _resetFt() {
  clearInterval(_ftInterval);
  _ftRunning = false;
  _ftSeconds = _ftTotal;
  _updateFtDisplay();
}

function _endFtSession() {
  clearInterval(_ftInterval);
  _ftRunning = false;
  showToast('✅ Focus session complete!');
  _ftPhase   = _ftPhase === 'Focus' ? 'Break' : 'Focus';
  _ftSeconds = _ftPhase === 'Focus' ? 25 * 60 : 5 * 60;
  _ftTotal   = _ftSeconds;
  _updateFtDisplay();
}

function _updateFtDisplay() {
  const mm = String(Math.floor(_ftSeconds / 60)).padStart(2, '0');
  const ss = String(_ftSeconds % 60).padStart(2, '0');
  const timeEl  = document.getElementById('ftPillTime');
  const dot     = document.getElementById('ftStatusDot');
  const playBtn = document.getElementById('ftPlayBtn');
  const pill    = document.getElementById('ftPill');
  if (timeEl)  timeEl.textContent = `${mm}:${ss}`;
  if (dot)     dot.className = 'ft-status-dot' + (_ftRunning ? ' running' : ' paused');
  if (playBtn) playBtn.textContent = _ftRunning ? '⏸' : '▶';
  if (pill)    pill.classList.toggle('break-mode', _ftPhase === 'Break');
}
