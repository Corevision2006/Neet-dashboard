/**
 * attendance-system.js
 * Office-style attendance report UI — shows daily/weekly login+study time.
 * Reads from Firestore 'attendance' collection written by study-tracker.js.
 */

import { db } from '../firebase/firebase-config.js';
import { formatDate, formatDuration } from '../js/utils.js';

export const AttendanceSystem = {

  /* ──────────────────────────────────────────────────────
     RENDER attendance table for a user (last 30 days)
  ────────────────────────────────────────────────────── */
  async renderTable(uid, containerId = 'attendanceTable') {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text3);">Loading attendance...</div>`;

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const snap = await db.collection('attendance')
        .where('uid', '==', uid)
        .orderBy('loginTime', 'desc')
        .limit(30)
        .get();

      const records = snap.docs.map(d => d.data());
      if (!records.length) {
        el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3);font-size:13px;">
          <div style="font-size:36px;opacity:0.2;margin-bottom:12px;">📅</div>
          No attendance data yet. Start studying to build your record!
        </div>`;
        return;
      }

      const rows = records.map(r => {
        const loginTime  = r.loginTime?.toDate ? r.loginTime.toDate() : new Date(r.loginTime || Date.now());
        const logoutTime = r.logoutTime?.toDate ? r.logoutTime.toDate() : null;
        const totalMins  = r.totalMins || 0;
        const status     = totalMins >= 180 ? 'excellent' : totalMins >= 60 ? 'good' : totalMins > 0 ? 'partial' : 'absent';
        const statusLabels = { excellent: '🟢 Excellent', good: '🔵 Good', partial: '🟡 Partial', absent: '🔴 Absent' };
        const statusColors = { excellent: '#2D7A5E', good: '#3A7A6C', partial: '#C4922A', absent: '#C0392B' };
        return `<tr>
          <td style="padding:12px 16px;font-size:13.5px;color:var(--text);border-bottom:1px solid var(--bg);">${formatDate(loginTime)}</td>
          <td style="padding:12px 16px;font-family:'DM Mono',monospace;font-size:13px;color:var(--text2);border-bottom:1px solid var(--bg);">${this._formatTimeOnly(loginTime)}</td>
          <td style="padding:12px 16px;font-family:'DM Mono',monospace;font-size:13px;color:var(--text2);border-bottom:1px solid var(--bg);">${logoutTime ? this._formatTimeOnly(logoutTime) : '—'}</td>
          <td style="padding:12px 16px;font-size:13px;font-weight:600;color:var(--primary);border-bottom:1px solid var(--bg);">${formatDuration(totalMins)}</td>
          <td style="padding:12px 16px;border-bottom:1px solid var(--bg);">
            <span style="font-size:12px;font-weight:600;color:${statusColors[status]};">${statusLabels[status]}</span>
          </td>
        </tr>`;
      }).join('');

      el.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--bg);">
              <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);font-weight:600;">Date</th>
              <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);font-weight:600;">Login</th>
              <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);font-weight:600;">Logout</th>
              <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);font-weight:600;">Study Time</th>
              <th style="padding:10px 16px;text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);font-weight:600;">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;

      // Summary stats
      const totalDays   = records.length;
      const activeDays  = records.filter(r => (r.totalMins || 0) > 0).length;
      const totalMins   = records.reduce((s, r) => s + (r.totalMins || 0), 0);
      const avgMins     = totalDays ? Math.round(totalMins / totalDays) : 0;
      this._renderSummary(totalDays, activeDays, totalMins, avgMins, containerId);

    } catch (err) {
      console.warn('AttendanceSystem.renderTable:', err);
      el.innerHTML = `<div style="color:var(--text3);padding:20px;text-align:center;">Could not load attendance data.</div>`;
    }
  },

  _renderSummary(totalDays, activeDays, totalMins, avgMins, containerId) {
    const summaryEl = document.getElementById(containerId + 'Summary');
    if (!summaryEl) return;
    summaryEl.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px;">
        <div class="tstat"><div class="tstat-val">${totalDays}</div><div class="tstat-label">Days Logged</div></div>
        <div class="tstat"><div class="tstat-val">${activeDays}</div><div class="tstat-label">Active Days</div></div>
        <div class="tstat"><div class="tstat-val">${(totalMins/60).toFixed(1)}h</div><div class="tstat-label">Total Study Time</div></div>
        <div class="tstat"><div class="tstat-val">${formatDuration(avgMins)}</div><div class="tstat-label">Daily Average</div></div>
      </div>`;
  },

  _formatTimeOnly(date) {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
};
