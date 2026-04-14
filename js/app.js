/**
 * app.js
 * Main entry point for the StudyFlow dashboard shell.
 *
 * Responsibilities:
 *  1. Wait for Firebase auth state
 *  2. Populate user info in the sidebar
 *  3. Initialise the Router with lazy page loaders
 *  4. Wire up global UI (dark mode, notifications, mobile sidebar, toast)
 *  5. Start the floating timer
 */

import { initAuth, logout, getCurrentUser } from './auth.js';
import { Router }   from './router.js';
import { showToast } from './utils.js';

// ── Local storage key helpers ──────────────────────────────
const LS = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v)        => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

// ── Router instance (configured below) ────────────────────
let router;

/* ══════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initAuth({
    onLogin:  user => _startApp(user),
    onLogout: ()   => { window.location.href = '/login.html'; }
  });
});

async function _startApp(user) {
  // Populate sidebar user card
  _populateSidebar(user);

  // Dark mode restore
  if (LS.get('sf_dark')) document.body.classList.add('dark');

  // Router with lazy page initializers
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
      // Refresh hooks — run every visit (not just first)
      'dashboard:refresh': async () => {
        const { refreshDashboard } = await import('./dashboard.js');
        refreshDashboard(user);
      }
    },
    onNavigate: (pageId) => {
      // Sync floating timer visibility
      const ft = document.getElementById('floatTimer');
      if (ft) ft.style.display = pageId === 'timer' ? 'none' : 'flex';
    }
  });

  // Expose window.navigate for inline onclick handlers
  router.exposeGlobal();

  // Wire global UI
  _wireSidebarNav();
  _wireDarkToggle();
  _wireNotifications();
  _wireMobileSidebar();
  _wireLogout();

  // Start floating timer
  _initFloatingTimer();

  // Global toast exposed
  window.showToast = showToast;

  // Show welcome notification
  setTimeout(() => showToast(`👋 Welcome back, ${user.displayName || 'Scholar'}!`), 800);
}

/* ── Populate sidebar user info ───────────────────────────── */
function _populateSidebar(user) {
  const name   = user.displayName || user.email?.split('@')[0] || 'Scholar';
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const avatarEl = document.querySelector('.sidebar-bottom .avatar');
  const nameEl   = document.querySelector('.sidebar-bottom .user-info .name');
  const roleEl   = document.querySelector('.sidebar-bottom .user-info .role');
  const greetEl  = document.getElementById('greetingName');

  if (avatarEl) avatarEl.textContent = initials;
  if (nameEl)   nameEl.textContent   = name;
  if (greetEl)  greetEl.textContent  = name.split(' ')[0];

  // Topbar title initial name
  const pageTitleEl = document.getElementById('pageTitle');
  if (pageTitleEl) pageTitleEl.innerHTML = `Good Morning, <span>${name.split(' ')[0]}</span> ✦`;
}

/* ── Sidebar nav item click wiring ───────────────────────── */
function _wireSidebarNav() {
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    el.addEventListener('click', () => router.navigate(el.dataset.page, el));
  });
}

/* ── Dark mode ───────────────────────────────────────────── */
function _wireDarkToggle() {
  const btn  = document.getElementById('darkToggleBtn');
  const icon = document.getElementById('darkIcon');
  if (!btn) return;
  // Restore saved state
  if (LS.get('sf_dark')) { document.body.classList.add('dark'); if (icon) icon.textContent = '☀️'; }
  btn.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    if (icon) icon.textContent = isDark ? '☀️' : '🌙';
    LS.set('sf_dark', isDark);
  });
}

/* ── Notification panel ──────────────────────────────────── */
function _wireNotifications() {
  const btn   = document.getElementById('notifBtn');
  const panel = document.getElementById('notifPanel');
  if (!btn || !panel) return;
  btn.addEventListener('click', e => {
    e.stopPropagation();
    panel.classList.toggle('open');
  });
  document.addEventListener('click', () => panel.classList.remove('open'));
  panel.addEventListener('click', e => e.stopPropagation());

  const markAll = document.getElementById('notifMarkAll');
  if (markAll) {
    markAll.addEventListener('click', () => {
      document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
      const count = document.getElementById('notifCount');
      if (count) count.textContent = '0';
      count?.classList.add('zero');
    });
  }
}

/* ── Mobile sidebar ──────────────────────────────────────── */
function _wireMobileSidebar() {
  const menuBtn  = document.getElementById('mobileMenuBtn');
  const sidebar  = document.querySelector('.sidebar');
  const overlay  = document.getElementById('sidebarOverlay');
  const close    = () => { sidebar?.classList.remove('open'); overlay?.classList.remove('visible'); };
  if (menuBtn) menuBtn.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    overlay?.classList.toggle('visible');
  });
  if (overlay) overlay.addEventListener('click', close);
  // Close when a nav item is clicked on mobile
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      if (window.innerWidth <= 900) close();
    });
  });
}

/* ── Logout button ───────────────────────────────────────── */
function _wireLogout() {
  document.getElementById('logoutBtn')?.addEventListener('click', () => logout());
}

/* ══════════════════════════════════════════════════════════
   FLOATING TIMER (minimal — delegates to timer.js state)
   ══════════════════════════════════════════════════════════ */
let _ftInterval  = null;
let _ftRunning   = false;
let _ftSeconds   = 25 * 60;
let _ftTotal     = 25 * 60;
let _ftPhase     = 'Focus';

function _initFloatingTimer() {
  const pill    = document.getElementById('ftPill');
  const playBtn = document.getElementById('ftPlayBtn');
  const timeEl  = document.getElementById('ftPillTime');
  const dot     = document.getElementById('ftStatusDot');

  if (!pill) return;

  _updateFtDisplay();

  playBtn?.addEventListener('click', e => { e.stopPropagation(); _toggleFt(); });
  document.getElementById('ftResetBtn')?.addEventListener('click', e => { e.stopPropagation(); _resetFt(); });
  document.getElementById('ftCloseBtn')?.addEventListener('click', e => { e.stopPropagation(); pill.style.display = 'none'; });
  pill.addEventListener('click', () => router.navigate('timer'));

  // Expose for timer.js synchronisation
  window._ftGetState = () => ({ running: _ftRunning, seconds: _ftSeconds, total: _ftTotal, phase: _ftPhase });
  window._ftSetState = (s) => { Object.assign({ _ftSeconds: s.seconds, _ftRunning: s.running, _ftTotal: s.total, _ftPhase: s.phase }); _updateFtDisplay(); };
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
  // Switch to break
  _ftPhase   = _ftPhase === 'Focus' ? 'Break' : 'Focus';
  _ftSeconds = _ftPhase === 'Focus' ? 25 * 60 : 5 * 60;
  _ftTotal   = _ftSeconds;
  _updateFtDisplay();
}

function _updateFtDisplay() {
  const mm  = String(Math.floor(_ftSeconds / 60)).padStart(2, '0');
  const ss  = String(_ftSeconds % 60).padStart(2, '0');
  const timeEl = document.getElementById('ftPillTime');
  if (timeEl) timeEl.textContent = `${mm}:${ss}`;
  const dot = document.getElementById('ftStatusDot');
  if (dot) {
    dot.className = 'ft-status-dot' + (_ftRunning ? ' running' : ' paused');
  }
  const playBtn = document.getElementById('ftPlayBtn');
  if (playBtn) playBtn.textContent = _ftRunning ? '⏸' : '▶';
  const pill = document.getElementById('ftPill');
  if (pill) {
    pill.classList.toggle('break-mode', _ftPhase === 'Break');
  }
}
