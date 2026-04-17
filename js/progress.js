/**
 * progress.js
 * Progress & analytics page — lazy loaded.
 * Charts: bar chart (weekly hours), score trend, heatmap, KPI cards.
 * Pure CSS/SVG charts — no external chart libraries.
 */

import { LS, calcStreak, SUBJ_COLORS, formatDuration, formatDate, showToast } from './utils.js';

let _timerLog    = [];
let _testEntries = [];
let _schSessions = [];

export function initProgress() {
  _timerLog    = LS.get('sf_timerLog',    []);
  _testEntries = LS.get('sf_testEntries', []);
  _schSessions = LS.get('sf_schedule',    []);
  _buildUI();
  _renderKPIs();
  _renderBarChart();
  _renderScoreTrend();
  _renderHeatmap();
  _renderSubjectScores();
  _renderRecentTests();

  // ── Auto-refresh when a focus session completes (from timer.js) ──
  window.addEventListener('sf:sessionComplete', (e) => {
    _timerLog = LS.get('sf_timerLog', []);
    _renderKPIs();
    _renderBarChart();
    _renderHeatmap();
    _renderSubjectScores();
    showToast(`📊 Progress updated: +${e.detail?.dur || 0} min`);
  });
}

/* ══════════════════════════════════════════════════════════
   BUILD UI
   ══════════════════════════════════════════════════════════ */
function _buildUI() {
  const page = document.getElementById('page-progress');
  if (!page || page.dataset.built) return;
  page.dataset.built = '1';

  page.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
      <div>
        <h2 style="font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:400;">Progress <span style="color:var(--primary)">Tracker</span></h2>
        <p style="font-size:13.5px;color:var(--text3);margin-top:3px;">Track study hours, test scores and improvement</p>
      </div>
      <button class="btn-primary" id="logTestBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Log Test Score
      </button>
    </div>

    <!-- KPI cards -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px;" id="progKpis">
      ${_kpiCard('prog-kpi-hours',    '0h',   'Total Study Hours',    '0 sessions total')}
      ${_kpiCard('prog-kpi-score',    '—',    'Average Test Score',   'Log tests to see avg')}
      ${_kpiCard('prog-kpi-sessions', '0',    'Focus Sessions',       'Use the timer!')}
      ${_kpiCard('prog-kpi-streak',   '0 🔥', 'Study Streak',        'Study daily!')}
    </div>

    <!-- Charts row -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
      <!-- Weekly bar chart -->
      <div class="prog-card" style="padding:22px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div class="card-title">Weekly Study Hours</div>
        </div>
        <div id="barChart" style="display:flex;align-items:flex-end;gap:8px;height:140px;"></div>
        <div id="barChartLabels" style="display:flex;gap:8px;margin-top:6px;"></div>
      </div>
      <!-- Score trend -->
      <div class="prog-card" style="padding:22px;">
        <div class="card-title" style="margin-bottom:16px;">Test Score Trend</div>
        <div id="scoreTrend" style="min-height:160px;"></div>
      </div>
    </div>

    <!-- Subject scores + Recent tests -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
      <div class="prog-card" style="padding:22px;">
        <div class="card-title" style="margin-bottom:16px;">Subject Performance</div>
        <div id="subjectScoreList" style="display:flex;flex-direction:column;gap:12px;"></div>
      </div>
      <div class="prog-card" style="padding:22px;">
        <div class="card-title" style="margin-bottom:16px;">Recent Tests</div>
        <div id="recentTestsList" style="display:flex;flex-direction:column;gap:8px;"></div>
      </div>
    </div>

    <!-- Study heatmap -->
    <div class="prog-card" style="padding:22px;margin-bottom:20px;">
      <div class="card-title" style="margin-bottom:16px;">Activity Heatmap (Last 12 Weeks)</div>
      <div id="studyHeatmap" style="overflow-x:auto;"></div>
    </div>

    <!-- Log Test Modal -->
    <div class="modal-overlay" id="logTestModal">
      <div class="modal" style="width:440px;padding:28px;">
        <h3 style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:400;margin-bottom:20px;">Log Test Score</h3>
        <div class="ls-field"><label class="form-label">Test Name</label><input id="lt-name" class="ls-input" placeholder="e.g. Physics Unit Test 3" /></div>
        <div class="ls-field"><label class="form-label">Subject</label>
          <select id="lt-subject" class="ls-input">
            ${['Physics','Chemistry','Biology','Mathematics','English','Other'].map(s=>`<option>${s}</option>`).join('')}
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="ls-field"><label class="form-label">Score</label><input id="lt-score" class="ls-input" type="number" placeholder="e.g. 72" /></div>
          <div class="ls-field"><label class="form-label">Max Score</label><input id="lt-max" class="ls-input" type="number" placeholder="e.g. 100" /></div>
        </div>
        <div class="ls-field"><label class="form-label">Date</label><input id="lt-date" class="ls-input" type="date" /></div>
        <div id="lt-error" class="ls-error"></div>
        <div style="display:flex;gap:10px;margin-top:16px;">
          <button class="btn-secondary" style="flex:1;" onclick="document.getElementById('logTestModal').classList.remove('open')">Cancel</button>
          <button class="btn-primary" style="flex:2;" id="lt-save">Log Test</button>
        </div>
      </div>
    </div>`;

  // Set today's date in the input
  const dateInput = document.getElementById('lt-date');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  // Bind events
  document.getElementById('logTestBtn')?.addEventListener('click', () => document.getElementById('logTestModal').classList.add('open'));
  document.getElementById('lt-save')?.addEventListener('click', _saveTest);
  document.getElementById('logTestModal')?.addEventListener('click', e => { if (e.target.id === 'logTestModal') e.target.classList.remove('open'); });
}

function _kpiCard(id, val, label, delta) {
  return `<div class="prog-kpi" style="padding:18px 20px;">
    <div id="${id}" style="font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:400;color:var(--text);line-height:1;">${val}</div>
    <div style="font-size:12.5px;color:var(--text3);margin-top:4px;">${label}</div>
    <div id="${id}-delta" style="font-size:11.5px;color:var(--text2);margin-top:6px;">${delta}</div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════
   KPI CARDS
   ══════════════════════════════════════════════════════════ */
function _renderKPIs() {
  const totalMins = _timerLog.reduce((s, l) => s + (l.dur || l.duration || 0), 0);
  const streak    = calcStreak(_timerLog);
  const sessions  = _timerLog.length;
  const avgScore  = _testEntries.length
    ? (_testEntries.reduce((s,e) => s + (e.pct||0), 0) / _testEntries.length).toFixed(1) + '%'
    : '—';

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('prog-kpi-hours',         (totalMins/60).toFixed(1) + 'h');
  set('prog-kpi-hours-delta',   totalMins > 0 ? `${sessions} sessions total` : 'Start studying to track!');
  set('prog-kpi-score',         avgScore);
  set('prog-kpi-score-delta',   _testEntries.length ? `Across ${_testEntries.length} test${_testEntries.length>1?'s':''}` : 'Log tests to see avg');
  set('prog-kpi-sessions',      sessions);
  set('prog-kpi-sessions-delta',sessions > 0 ? `${(totalMins / Math.max(sessions,1)).toFixed(0)} min avg/session` : 'Use the timer!');
  set('prog-kpi-streak',        streak + ' 🔥');
  set('prog-kpi-streak-delta',  streak >= 7 ? '🔥 On fire! Keep going' : streak > 0 ? `${7-streak} days to 7-day streak` : 'Study daily to build a streak!');
}

/* ══════════════════════════════════════════════════════════
   BAR CHART (weekly hours, pure CSS)
   ══════════════════════════════════════════════════════════ */
function _renderBarChart() {
  const el = document.getElementById('barChart');
  const lb = document.getElementById('barChartLabels');
  if (!el) return;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return d;
  });

  const hoursPerDay = days.map(d => {
    const key = d.toDateString();
    const mins = _timerLog
      .filter(l => new Date(l.ts || 0).toDateString() === key)
      .reduce((s, l) => s + (l.dur || 0), 0);
    return parseFloat((mins / 60).toFixed(2));
  });

  const maxH = Math.max(...hoursPerDay, 1);
  const dayNames = ['S','M','T','W','T','F','S'];
  const today = new Date().toDateString();

  el.innerHTML = hoursPerDay.map((h, i) => {
    const pct    = Math.round((h / maxH) * 100);
    const isToday= days[i].toDateString() === today;
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;">
      <div style="font-size:10px;color:var(--text3);">${h > 0 ? h.toFixed(1)+'h' : ''}</div>
      <div style="flex:1;width:100%;display:flex;align-items:flex-end;">
        <div style="width:100%;height:${Math.max(pct,3)}%;background:${isToday?'var(--primary)':'var(--sage)'};border-radius:5px 5px 0 0;opacity:${h===0?0.25:1};transition:height 0.8s ease;min-height:4px;"></div>
      </div>
    </div>`;
  }).join('');

  if (lb) lb.innerHTML = days.map((d, i) => {
    const isToday = d.toDateString() === today;
    return `<div style="flex:1;text-align:center;font-size:10.5px;color:${isToday?'var(--primary)':'var(--text3)'};font-weight:${isToday?'600':'400'};">${dayNames[d.getDay()]}</div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════
   SCORE TREND (SVG sparkline)
   ══════════════════════════════════════════════════════════ */
function _renderScoreTrend() {
  const el = document.getElementById('scoreTrend');
  if (!el) return;
  const sorted = [..._testEntries].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-10);
  if (sorted.length < 2) {
    el.innerHTML = `<div style="text-align:center;padding:40px;font-size:13px;color:var(--text3);">Log at least 2 tests to see the trend.</div>`;
    return;
  }
  const W = 300, H = 120, pad = 20;
  const minP = 0, maxP = 100;
  const pts  = sorted.map((e, i) => {
    const x = pad + (i / (sorted.length - 1)) * (W - pad * 2);
    const y = H - pad - ((e.pct - minP) / (maxP - minP)) * (H - pad * 2);
    return `${x},${y}`;
  }).join(' ');
  const scores = sorted.map(e => e.pct);
  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible;">
      <!-- Grid lines -->
      ${[0,25,50,75,100].map(v => {
        const y = H - pad - ((v - minP) / (maxP - minP)) * (H - pad * 2);
        return `<line x1="${pad}" y1="${y}" x2="${W-pad}" y2="${y}" stroke="var(--bg)" stroke-width="1.5"/>
          <text x="${pad-4}" y="${y+4}" font-size="9" text-anchor="end" fill="var(--text3)">${v}%</text>`;
      }).join('')}
      <!-- Gradient fill -->
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${pts} ${W-pad},${H-pad} ${pad},${H-pad}" fill="url(#sg)"/>
      <polyline points="${pts}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${sorted.map((e, i) => {
        const x = pad + (i / (sorted.length - 1)) * (W - pad * 2);
        const y = H - pad - ((e.pct - minP) / (maxP - minP)) * (H - pad * 2);
        return `<circle cx="${x}" cy="${y}" r="4" fill="var(--primary)"/>
          <text x="${x}" y="${y-8}" font-size="9" text-anchor="middle" fill="var(--primary)">${e.pct.toFixed(0)}%</text>`;
      }).join('')}
    </svg>`;
}

/* ══════════════════════════════════════════════════════════
   HEATMAP
   ══════════════════════════════════════════════════════════ */
function _renderHeatmap() {
  const el = document.getElementById('studyHeatmap');
  if (!el) return;
  const weeks    = 12;
  const cellSize = 16;
  const gap      = 3;

  const dayMap = {};
  _timerLog.forEach(l => {
    const d = new Date(l.ts || 0).toDateString();
    dayMap[d] = (dayMap[d] || 0) + (l.dur || 0);
  });

  const today = new Date();
  today.setHours(0,0,0,0);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - weeks * 7 + 1);

  let cols = [];
  let cur  = new Date(startDate);
  let week = [];
  while (cur <= today) {
    const mins  = dayMap[cur.toDateString()] || 0;
    const level = mins === 0 ? 0 : mins < 30 ? 1 : mins < 60 ? 2 : mins < 120 ? 3 : 4;
    const colors= ['var(--bg)','#C8E6DE','#7BAE9A','#3A7A6C','#162420'];
    week.push({ date: new Date(cur), mins, level, color: colors[level] });
    if (week.length === 7) { cols.push(week); week = []; }
    cur.setDate(cur.getDate() + 1);
  }
  if (week.length) cols.push(week);

  const dayLabels = ['','Mon','','Wed','','Fri',''];
  const W = cols.length * (cellSize + gap);
  const H = 7 * (cellSize + gap);

  el.innerHTML = `
    <div style="display:flex;gap:3px;align-items:flex-start;">
      <!-- Day labels -->
      <div style="display:flex;flex-direction:column;gap:${gap}px;margin-right:6px;padding-top:2px;">
        ${dayLabels.map(d=>`<div style="height:${cellSize}px;font-size:9px;color:var(--text3);display:flex;align-items:center;">${d}</div>`).join('')}
      </div>
      <!-- Grid -->
      <div style="display:flex;gap:${gap}px;">
        ${cols.map(week => `<div style="display:flex;flex-direction:column;gap:${gap}px;">
          ${week.map(day => `<div title="${formatDate(day.date)} — ${day.mins ? formatDuration(day.mins) : 'No study'}"
            style="width:${cellSize}px;height:${cellSize}px;border-radius:3px;background:${day.color};cursor:default;"></div>`).join('')}
        </div>`).join('')}
      </div>
    </div>
    <!-- Legend -->
    <div style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;color:var(--text3);">
      <span>Less</span>
      ${['var(--bg)','#C8E6DE','#7BAE9A','#3A7A6C','#162420'].map(c=>`<div style="width:12px;height:12px;background:${c};border-radius:2px;"></div>`).join('')}
      <span>More</span>
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   SUBJECT SCORES
   ══════════════════════════════════════════════════════════ */
function _renderSubjectScores() {
  const el = document.getElementById('subjectScoreList');
  if (!el) return;
  const subjects = ['Physics','Chemistry','Biology'];
  const data = subjects.map(name => {
    const tests  = _testEntries.filter(e => e.subject === name);
    const avg    = tests.length ? tests.reduce((s,t) => s+(t.pct||0),0) / tests.length : null;
    const color  = SUBJ_COLORS[name] || '#3A7A6C';
    return { name, avg, color, count: tests.length };
  });

  if (data.every(d => d.avg === null)) {
    el.innerHTML = `<div style="text-align:center;padding:20px;font-size:13px;color:var(--text3);">Log subject-wise tests to see scores here.</div>`;
    return;
  }

  el.innerHTML = data.map(({ name, avg, color, count }) => `
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:36px;height:36px;border-radius:9px;background:${color}22;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">
        ${name==='Physics'?'⚛️':name==='Chemistry'?'🧪':'🧬'}
      </div>
      <div style="flex:1;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:13.5px;font-weight:500;color:var(--text);">${name}</span>
          <span style="font-size:13px;font-weight:600;color:${color};">${avg !== null ? avg.toFixed(1)+'%' : '—'}</span>
        </div>
        <div style="height:5px;background:var(--bg);border-radius:5px;overflow:hidden;">
          <div style="width:${avg||0}%;height:100%;background:${color};border-radius:5px;transition:width 1s ease;"></div>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-top:3px;">${count} test${count!==1?'s':''}</div>
      </div>
    </div>`).join('');
}

/* ══════════════════════════════════════════════════════════
   RECENT TESTS
   ══════════════════════════════════════════════════════════ */
function _renderRecentTests() {
  const el = document.getElementById('recentTestsList');
  if (!el) return;
  if (!_testEntries.length) {
    el.innerHTML = `<div style="text-align:center;padding:24px;font-size:13px;color:var(--text3);">📋 Log tests to see them here.</div>`;
    return;
  }
  const sorted = [..._testEntries].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  el.innerHTML = sorted.map(e => {
    const color     = SUBJ_COLORS[e.subject] || '#8AADA5';
    const scoreClass= e.pct >= 80 ? '#3A9E6C' : e.pct >= 60 ? '#C4922A' : '#C0392B';
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:9px;background:var(--bg);">
      <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></div>
      <div style="flex:1;">
        <div style="font-size:13.5px;font-weight:500;color:var(--text);">${e.name}</div>
        <div style="font-size:11px;color:var(--text3);">${e.subject} · ${formatDate(new Date(e.date))}</div>
      </div>
      <div style="font-size:14px;font-weight:600;color:${scoreClass};">${e.score}/${e.maxScore}</div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════
   SAVE TEST
   ══════════════════════════════════════════════════════════ */
function _saveTest() {
  const name    = document.getElementById('lt-name').value.trim();
  const subject = document.getElementById('lt-subject').value;
  const score   = parseFloat(document.getElementById('lt-score').value);
  const maxScore= parseFloat(document.getElementById('lt-max').value);
  const date    = document.getElementById('lt-date').value;
  const errEl   = document.getElementById('lt-error');

  if (!name || isNaN(score) || isNaN(maxScore) || !date) {
    errEl.textContent = 'Please fill in all fields.'; errEl.classList.add('show'); return;
  }
  if (score > maxScore) { errEl.textContent = 'Score cannot exceed max score.'; errEl.classList.add('show'); return; }
  errEl.classList.remove('show');

  const pct = parseFloat(((score / maxScore) * 100).toFixed(1));
  _testEntries.push({ id: Date.now(), name, subject, score, maxScore, pct, date });
  LS.set('sf_testEntries', _testEntries);
  document.getElementById('logTestModal').classList.remove('open');
  _renderKPIs();
  _renderScoreTrend();
  _renderSubjectScores();
  _renderRecentTests();
  const { showToast: toast } = window._sfUtils || {};
  if (toast) toast(`✅ Test logged: ${score}/${maxScore} (${pct}%)`);
}
