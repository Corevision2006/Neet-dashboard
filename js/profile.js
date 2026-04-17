/**
 * profile.js — User Profile page
 *
 * Shows:
 *  - Avatar, name, email, join date
 *  - Stats summary (total hours, sessions, streak, avg score)
 *  - Subject breakdown (hours per subject pie + bars)
 *  - Study heatmap preview
 *  - Edit display name
 *  - Sign out button
 */

import { LS, calcStreak, SUBJ_COLORS, formatDuration } from './utils.js';
import { logout, isDemo } from './auth.js';
import { db, auth, firebase } from '../firebase/firebase-config.js';

export function initProfile(user) {
  const page = document.getElementById('page-profile');
  if (!page) return;

  // Re-render each visit with fresh data
  _buildUI(page, user);
}

function _buildUI(page, user) {
  const timerLog    = LS.get('sf_timerLog',    []);
  const testEntries = LS.get('sf_testEntries', []);
  const name        = user.displayName || user.email?.split('@')[0] || 'Scholar';
  const initials    = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const email       = user.email || (isDemo ? 'demo@studyflow.app' : '');

  // Stats
  const totalMins   = timerLog.reduce((s, l) => s + (l.dur || 0), 0);
  const totalHours  = (totalMins / 60).toFixed(1);
  const sessions    = timerLog.length;
  const streak      = calcStreak(timerLog);
  const scores      = testEntries.map(t => t.score).filter(Boolean);
  const avgScore    = scores.length ? Math.round(scores.reduce((a,b) => a+b,0) / scores.length) : null;

  // Subject totals
  const subjectMap  = {};
  timerLog.forEach(l => {
    if (!l.subject) return;
    subjectMap[l.subject] = (subjectMap[l.subject] || 0) + (l.dur || 0);
  });
  const subjects    = Object.entries(subjectMap).sort((a,b) => b[1]-a[1]);
  const topSubject  = subjects[0]?.[0] || 'N/A';

  // Join date — try Firestore, fall back to localStorage
  const joinDateStr = _getJoinDate();

  page.innerHTML = `
  <style>
    .prof-grid    { display:grid; grid-template-columns:340px 1fr; gap:20px; max-width:1000px; margin:0 auto; }
    .prof-card    { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:24px; }
    .prof-avatar  { width:80px;height:80px;border-radius:50%;background:var(--primary);color:#fff;
                    font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:400;
                    display:flex;align-items:center;justify-content:center;
                    margin:0 auto 16px; overflow:hidden; position:relative; }
    .prof-avatar img { width:100%;height:100%;object-fit:cover;border-radius:50%; }
    .prof-name    { font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:400;
                    color:var(--text);text-align:center;margin-bottom:4px; }
    .prof-email   { font-size:12.5px;color:var(--text3);text-align:center;margin-bottom:20px; }
    .prof-badge   { display:inline-flex;align-items:center;gap:6px;padding:4px 12px;
                    border-radius:20px;font-size:11px;font-weight:600;letter-spacing:0.5px; }
    .stat-row     { display:flex;justify-content:space-between;align-items:center;
                    padding:10px 0;border-bottom:1px solid var(--border); }
    .stat-row:last-child { border-bottom:none; }
    .stat-row-label { font-size:13px;color:var(--text3); }
    .stat-row-val   { font-size:14px;font-weight:600;color:var(--text); }
    .subj-bar-wrap  { margin-bottom:10px; }
    .subj-bar-label { display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px; }
    .subj-bar-track { height:7px;border-radius:4px;background:var(--border);overflow:hidden; }
    .subj-bar-fill  { height:100%;border-radius:4px;transition:width .6s ease; }
    .edit-name-row  { display:flex;gap:8px;align-items:center;margin-top:16px; }
    .edit-name-row input { flex:1;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;
      font-family:'DM Sans',sans-serif;font-size:13px;color:var(--text);background:var(--bg);outline:none; }
    .edit-name-row input:focus { border-color:var(--primary); }
    .edit-name-row button { padding:8px 14px;border-radius:8px;border:none;background:var(--primary);
      color:#fff;font-size:13px;font-family:'DM Sans',sans-serif;cursor:pointer;white-space:nowrap; }
    .signout-btn { width:100%;padding:11px;border-radius:10px;border:1.5px solid #C0392B;
      background:transparent;color:#C0392B;font-size:13.5px;font-family:'DM Sans',sans-serif;
      cursor:pointer;font-weight:500;margin-top:16px;transition:all .18s; }
    .signout-btn:hover { background:#C0392B;color:#fff; }
    @media(max-width:760px){ .prof-grid { grid-template-columns:1fr; } }
  </style>

  <div class="prof-grid">
    <!-- LEFT: Identity card -->
    <div style="display:flex;flex-direction:column;gap:16px;">
      <div class="prof-card" style="text-align:center;">
        <div class="prof-avatar" id="profAvatarEl">
          ${user.photoURL
            ? `<img src="${user.photoURL}" alt="${name}" />`
            : initials}
        </div>
        <div class="prof-name" id="profNameDisplay">${name}</div>
        <div class="prof-email">${email}</div>

        <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
          <span class="prof-badge" style="background:#E6F2EF;color:#2D7A5E;">
            🎓 StudyFlow ${isDemo ? 'Demo' : 'Member'}
          </span>
          ${streak >= 7 ? `<span class="prof-badge" style="background:#FBF3E2;color:#C4922A;">🔥 ${streak}-Day Streak</span>` : ''}
          ${totalHours >= 10 ? `<span class="prof-badge" style="background:#EEF0FA;color:#5A5AC4;">📚 ${totalHours}h Scholar</span>` : ''}
        </div>

        ${joinDateStr ? `<div style="font-size:12px;color:var(--text3);margin-bottom:12px;">Member since ${joinDateStr}</div>` : ''}

        <!-- Edit name -->
        <div style="text-align:left;">
          <div style="font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:var(--text3);margin-bottom:6px;">Display Name</div>
          <div class="edit-name-row">
            <input id="profNameInput" type="text" value="${name}" placeholder="Your name" />
            <button id="profSaveNameBtn">Save</button>
          </div>
          <div id="profSaveMsg" style="font-size:12px;color:var(--primary);margin-top:6px;min-height:16px;"></div>
        </div>

        <button class="signout-btn" id="profSignOutBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign Out
        </button>
      </div>
    </div>

    <!-- RIGHT: Stats + Subject breakdown -->
    <div style="display:flex;flex-direction:column;gap:16px;">
      <!-- Stats summary -->
      <div class="prof-card">
        <div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:400;margin-bottom:16px;">Study <span style="color:var(--primary)">Statistics</span></div>
        <div class="stat-row"><span class="stat-row-label">Total Study Hours</span><span class="stat-row-val">${totalHours}h</span></div>
        <div class="stat-row"><span class="stat-row-label">Focus Sessions</span><span class="stat-row-val">${sessions}</span></div>
        <div class="stat-row"><span class="stat-row-label">Current Streak</span><span class="stat-row-val">${streak} 🔥</span></div>
        <div class="stat-row"><span class="stat-row-label">Average Test Score</span><span class="stat-row-val">${avgScore !== null ? avgScore + '%' : '—'}</span></div>
        <div class="stat-row"><span class="stat-row-label">Top Subject</span><span class="stat-row-val" style="color:${SUBJ_COLORS[topSubject]||'var(--primary)'};">${topSubject}</span></div>
        <div class="stat-row"><span class="stat-row-label">Tests Logged</span><span class="stat-row-val">${testEntries.length}</span></div>
      </div>

      <!-- Subject breakdown -->
      <div class="prof-card">
        <div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:400;margin-bottom:16px;">Subject <span style="color:var(--primary)">Breakdown</span></div>
        ${subjects.length === 0
          ? `<div style="text-align:center;padding:24px;font-size:13px;color:var(--text3);">No sessions logged yet. Start your first focus session!</div>`
          : subjects.map(([subj, mins]) => {
              const pct   = subjects[0][1] > 0 ? Math.round((mins / subjects[0][1]) * 100) : 0;
              const color = SUBJ_COLORS[subj] || 'var(--primary)';
              return `<div class="subj-bar-wrap">
                <div class="subj-bar-label">
                  <span style="color:var(--text);font-weight:500;">${subj}</span>
                  <span style="color:var(--text3);">${formatDuration(mins)}</span>
                </div>
                <div class="subj-bar-track">
                  <div class="subj-bar-fill" style="width:${pct}%;background:${color};"></div>
                </div>
              </div>`;
            }).join('')
        }
      </div>

      <!-- Recent activity preview -->
      ${timerLog.length > 0 ? `
      <div class="prof-card">
        <div style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:400;margin-bottom:16px;">Recent <span style="color:var(--primary)">Activity</span></div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${[...timerLog].reverse().slice(0,5).map(l => {
            const d = new Date(l.ts || Date.now());
            const dateStr = d.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
            const timeStr = d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
            const color = SUBJ_COLORS[l.subject] || 'var(--primary)';
            return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;background:var(--bg);">
              <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></div>
              <div style="flex:1;font-size:13px;color:var(--text);">${l.subject}</div>
              <div style="font-size:12px;color:var(--primary);font-weight:600;">${formatDuration(l.dur)}</div>
              <div style="font-size:11px;color:var(--text3);">${dateStr} · ${timeStr}</div>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}
    </div>
  </div>`;

  // ── Wire events ────────────────────────────────────────────
  document.getElementById('profSignOutBtn')?.addEventListener('click', () => logout());

  document.getElementById('profSaveNameBtn')?.addEventListener('click', async () => {
    const newName = document.getElementById('profNameInput')?.value?.trim();
    if (!newName) return;
    const msg = document.getElementById('profSaveMsg');
    try {
      await user.updateProfile({ displayName: newName });
      // Update Firestore
      const FV = (firebase && firebase.firestore && firebase.firestore.FieldValue)
        || { serverTimestamp: () => new Date().toISOString() };
      await db.collection('users').doc(user.uid).update({ name: newName });

      // Refresh sidebar name
      const sidebarName = document.querySelector('.sidebar-bottom .user-info .name');
      if (sidebarName) sidebarName.textContent = newName;
      const greetEl = document.getElementById('greetingName');
      if (greetEl) greetEl.textContent = newName.split(' ')[0];
      document.getElementById('profNameDisplay').textContent = newName;

      if (msg) { msg.textContent = '✓ Name updated!'; setTimeout(() => msg.textContent = '', 2500); }
    } catch(e) {
      if (msg) { msg.style.color = '#C0392B'; msg.textContent = 'Could not save. Try again.'; }
    }
  });
}

function _getJoinDate() {
  // Try localStorage first for demo mode
  const stored = LS.get('sf_joinDate', null);
  if (stored) return new Date(stored).toLocaleDateString('en-IN', { month:'long', year:'numeric' });
  // Set it now if not set
  const now = new Date().toISOString();
  LS.set('sf_joinDate', now);
  return new Date(now).toLocaleDateString('en-IN', { month:'long', year:'numeric' });
}
