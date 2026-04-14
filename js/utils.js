/**
 * utils.js
 * Shared utility helpers used across all modules.
 */

/* ── Local storage with JSON serialisation ─────────────── */
export const LS = {
  get: (key, defaultVal = null) => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : defaultVal;
    } catch {
      return defaultVal;
    }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
  remove: (key) => { try { localStorage.removeItem(key); } catch {} }
};

/* ── Toast notification ─────────────────────────────────── */
export function showToast(message, duration = 3000, icon = '') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = icon ? `<span>${icon}</span> ${message}` : message;
  container.appendChild(toast);
  // Trigger show
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ── Time / Date helpers ─────────────────────────────────── */
export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatTime(date = new Date()) {
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(date = new Date(), opts = {}) {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', ...opts });
}

export function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function daysBetween(dateA, dateB) {
  const a = new Date(dateA); a.setHours(0,0,0,0);
  const b = new Date(dateB); b.setHours(0,0,0,0);
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

/* ── Generate random ID ─────────────────────────────────── */
export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ── Debounce ───────────────────────────────────────────── */
export function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

/* ── Subject color map ──────────────────────────────────── */
export const SUBJ_COLORS = {
  Physics:    '#5AADCC',
  Chemistry:  '#E8C17A',
  Biology:    '#7BAE9A',
  Mathematics:'#E8846A',
  English:    '#A07BAE',
  History:    '#AE8A7B',
  Geography:  '#7BAE9A',
  // NEET PG subjects
  Anatomy:      '#5B8FE8',
  Physiology:   '#E85B6E',
  Biochemistry: '#8B5CF6',
  Pathology:    '#E85B9A',
  Microbiology: '#3AB8A0',
  Pharmacology: '#F5A623',
  Medicine:     '#3A7A6C',
  Surgery:      '#2563EB'
};

export const TYPE_COLORS = {
  study:    { bg: '#E6F2EF', border: '#3A7A6C', text: '#2D7A5E' },
  revision: { bg: '#FBF3E2', border: '#C4922A', text: '#C4922A' },
  practice: { bg: '#EEF0FA', border: '#5A5AC4', text: '#5A5AC4' },
  mock:     { bg: '#FDECEA', border: '#C0392B', text: '#C0392B' }
};

/* ── Greeting by time of day ────────────────────────────── */
export function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

/* ── Streak calculator ──────────────────────────────────── */
export function calcStreak(timerLog = []) {
  if (!timerLog.length) return 0;
  const days = new Set(timerLog.map(l => {
    const d = new Date(l.ts || Date.now());
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }));
  let streak = 0;
  const d = new Date();
  while (true) {
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!days.has(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
