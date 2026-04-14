/**
 * timer.js
 * Pomodoro / Focus timer page module — lazy loaded.
 * Syncs state with the floating pill timer in app.js.
 * Writes completed sessions to localStorage and Firestore via StudyTracker.
 */

import { LS, SUBJ_COLORS, showToast, formatDuration } from './utils.js';
import { StudyTracker } from '../modules/study-tracker.js';

/* ── Timer state ──────────────────────────────────────────── */
let _settings   = { focus: 25, short: 5, long: 15 };
let _subjects   = ['Physics', 'Chemistry', 'Biology'];
let _subject    = _subjects[0];
let _mode       = 'focus'; // 'focus'|'short'|'long'|'infinity'
let _seconds    = 25 * 60;
let _total      = 25 * 60;
let _running    = false;
let _interval   = null;
let _pomDone    = 0;
let _timerLog   = [];
let _activeSessionId = null;
let _sessionStart    = null;

/* ── Floating timer bridge ────────────────────────────────── */
let _ftBridge = null; // injected by app.js

export function initTimer() {
  _settings = LS.get('sf_timerSettings', { focus: 25, short: 5, long: 15 });
  _timerLog = LS.get('sf_timerLog', []);
  _subject  = _subjects[0];
  _seconds  = _settings.focus * 60;
  _total    = _seconds;

  _buildUI();
  _bindEvents();
  _updateDisplay();
  _renderPomDots();
  _renderLog();
}

/* ══════════════════════════════════════════════════════════
   BUILD UI (injected into #page-timer)
   ══════════════════════════════════════════════════════════ */
function _buildUI() {
  const page = document.getElementById('page-timer');
  if (!page || page.dataset.built) return;
  page.dataset.built = '1';

  page.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 320px;gap:20px;align-items:start;max-width:1000px;margin:0 auto;">
      <!-- Left: main timer -->
      <div class="timer-card" style="padding:36px;text-align:center;border-radius:var(--radius);border:1px solid var(--border);background:var(--card);">
        <!-- Subject pills -->
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:28px;" id="timerSubjPills"></div>

        <!-- Mode tabs -->
        <div style="display:flex;gap:8px;justify-content:center;margin-bottom:32px;" id="timerModeTabs">
          <button class="tm-tab active" data-mode="focus"    data-dur="25">Focus</button>
          <button class="tm-tab"        data-mode="short"    data-dur="5">Short Break</button>
          <button class="tm-tab"        data-mode="long"     data-dur="15">Long Break</button>
          <button class="tm-tab"        data-mode="infinity" data-dur="0">∞ Flow</button>
        </div>

        <!-- SVG ring timer -->
        <div style="position:relative;display:inline-flex;align-items:center;justify-content:center;margin-bottom:28px;">
          <svg width="240" height="240" viewBox="0 0 240 240">
            <circle cx="120" cy="120" r="108" fill="none" stroke="var(--bg)" stroke-width="10"/>
            <circle id="timerRing" cx="120" cy="120" r="108" fill="none"
              stroke="var(--primary)" stroke-width="10"
              stroke-linecap="round"
              stroke-dasharray="678.58"
              stroke-dashoffset="0"
              transform="rotate(-90 120 120)"
              style="transition:stroke-dashoffset 0.8s linear;"/>
          </svg>
          <div style="position:absolute;text-align:center;">
            <div id="timerDisplay" style="font-family:'Cormorant Garamond',serif;font-size:64px;font-weight:300;color:var(--text);line-height:1;letter-spacing:-2px;">25:00</div>
            <div id="timerPhase" style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--text3);margin-top:4px;">Focus Session</div>
            <div id="timerInfTime" style="font-size:13px;color:var(--text3);margin-top:2px;display:none;"></div>
          </div>
        </div>

        <!-- Controls -->
        <div style="display:flex;gap:14px;align-items:center;justify-content:center;margin-bottom:24px;">
          <button id="timerResetBtn" style="width:48px;height:48px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);cursor:pointer;font-size:18px;transition:all .18s;" title="Reset">↺</button>
          <button id="timerPlayBtn"  style="width:72px;height:72px;border-radius:50%;border:none;background:var(--primary);color:white;cursor:pointer;font-size:26px;box-shadow:0 6px 20px rgba(58,122,108,0.35);transition:all .2s;" title="Start/Pause">▶</button>
          <button id="timerSkipBtn"  style="width:48px;height:48px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);cursor:pointer;font-size:18px;transition:all .18s;" title="Skip">⏭</button>
          <button id="timerFsBtn"    style="width:48px;height:48px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);cursor:pointer;font-size:16px;transition:all .18s;" title="Fullscreen">⛶</button>
        </div>

        <!-- Pomodoro dots -->
        <div id="pomDots" style="display:flex;gap:8px;justify-content:center;margin-bottom:20px;"></div>

        <!-- Settings inline -->
        <details style="margin-top:8px;">
          <summary style="font-size:13px;color:var(--text3);cursor:pointer;user-select:none;list-style:none;">⚙ Timer Settings</summary>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px;text-align:left;">
            ${_settingInput('Focus', 'sf-focus', _settings.focus)}
            ${_settingInput('Short Break', 'sf-short', _settings.short)}
            ${_settingInput('Long Break', 'sf-long', _settings.long)}
          </div>
          <button id="saveTimerSettings" style="margin-top:12px;padding:8px 20px;border-radius:8px;border:none;background:var(--primary);color:white;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;">Save</button>
        </details>
      </div>

      <!-- Right: log + stats -->
      <div style="display:flex;flex-direction:column;gap:16px;">
        <!-- Stats -->
        <div class="card" style="padding:20px;">
          <div class="card-title" style="margin-bottom:14px;">Today's Stats</div>
          <div style="display:flex;flex-direction:column;gap:10px;" id="timerTodayStats">
            <div style="display:flex;justify-content:space-between;font-size:13.5px;"><span style="color:var(--text3);">Sessions</span><strong id="ts-sessions">0</strong></div>
            <div style="display:flex;justify-content:space-between;font-size:13.5px;"><span style="color:var(--text3);">Study time</span><strong id="ts-time">0m</strong></div>
            <div style="display:flex;justify-content:space-between;font-size:13.5px;"><span style="color:var(--text3);">Streak</span><strong id="ts-streak">0 🔥</strong></div>
          </div>
        </div>
        <!-- Session log -->
        <div class="sessions-log card" style="padding:20px;">
          <div class="card-title" style="margin-bottom:14px;">Session Log</div>
          <div id="timerLogList" style="display:flex;flex-direction:column;gap:8px;max-height:360px;overflow-y:auto;"></div>
        </div>
      </div>
    </div>

    <!-- Fullscreen overlay (reused from original) -->
    <div id="fsTimerOverlay">
      <button class="fs-close-btn" onclick="closeFsTimer()">✕</button>
      <div class="fs-mode-bar">
        <button class="fs-mode-btn active" id="fsModeFlip" onclick="setFsMode('flip')">⏱ 3D Flip</button>
        <button class="fs-mode-btn" id="fsModeNormal" onclick="setFsMode('normal')">◷ Normal</button>
      </div>
      <div id="fsFlipView" class="flip-clock-wrap">
        <div id="fsSubjectBadge" class="fs-subject-badge">Focus</div>
        <div class="flip-clock" id="flipClock">
          ${_flipDigit('m1','2')}
          ${_flipDigit('m2','5')}
          <div class="flip-sep">:</div>
          ${_flipDigit('s1','0')}
          ${_flipDigit('s2','0')}
        </div>
        <div class="flip-phase-label" id="fsFlipPhase">Focus Session</div>
      </div>
      <div id="fsNormalView" class="fs-normal-wrap" style="display:none;">
        <div id="fsSubjectBadge2" class="fs-subject-badge">Focus</div>
        <div class="fs-normal-time" id="fsNormalTime">25:00</div>
        <div class="fs-normal-phase" id="fsNormalPhase">Focus Session</div>
        <div class="fs-progress-bar"><div class="fs-progress-fill" id="fsProgressFill" style="width:100%;"></div></div>
      </div>
      <div class="fs-controls">
        <button class="fs-btn sec" onclick="_resetTimer()">↺</button>
        <button class="fs-btn play" id="fsPlayBtn" onclick="_toggleTimer()">▶</button>
        <button class="fs-btn sec" onclick="_skipTimer()">⏭</button>
      </div>
    </div>`;

  // Build subject pills
  _buildSubjectPills();
}

function _settingInput(label, id, val) {
  return `<div>
    <div style="font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:var(--text3);margin-bottom:6px;">${label} (min)</div>
    <input id="${id}" type="number" min="1" max="180" value="${val}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:14px;color:var(--text);background:var(--bg);outline:none;" />
  </div>`;
}

function _flipDigit(key, val) {
  return `<div class="flip-digit" id="fd-${key}">
    <div class="flip-card">
      <div class="flip-top"><div class="flip-num" id="fnt-${key}">${val}</div></div>
      <div class="flip-bottom"><div class="flip-num" style="transform:translateY(-50%);" id="fnb-${key}">${val}</div></div>
    </div>
    <div class="flip-flap" id="ff-${key}"><div class="flip-flap-inner" id="ffi-${key}">${val}</div></div>
    <div class="flip-flap flip-bottom-flap" id="ffb-${key}" style="top:50%;transform-origin:top center;transform:rotateX(90deg);">
      <div class="flip-flap-inner" style="top:auto;bottom:0;transform:translateY(50%);" id="ffbi-${key}">${val}</div>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════
   BIND EVENTS
   ══════════════════════════════════════════════════════════ */
function _bindEvents() {
  document.getElementById('timerPlayBtn')?.addEventListener('click',  () => _toggleTimer());
  document.getElementById('timerResetBtn')?.addEventListener('click', () => _resetTimer());
  document.getElementById('timerSkipBtn')?.addEventListener('click',  () => _skipTimer());
  document.getElementById('timerFsBtn')?.addEventListener('click',    () => openFsTimer());

  // Mode tabs
  document.querySelectorAll('.tm-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tm-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _mode    = btn.dataset.mode;
      const dur = parseInt(btn.dataset.dur) || 0;
      _seconds  = dur * 60;
      _total    = _seconds;
      if (_mode === 'infinity') { _seconds = 0; }
      _stopTimer();
      _updateDisplay();
    });
  });

  // Save settings
  document.getElementById('saveTimerSettings')?.addEventListener('click', () => {
    _settings.focus = parseInt(document.getElementById('sf-focus').value) || 25;
    _settings.short = parseInt(document.getElementById('sf-short').value) || 5;
    _settings.long  = parseInt(document.getElementById('sf-long').value)  || 15;
    LS.set('sf_timerSettings', _settings);
    showToast('⚙ Timer settings saved!');
  });
}

function _buildSubjectPills() {
  const el = document.getElementById('timerSubjPills');
  if (!el) return;
  el.innerHTML = _subjects.map(s => `
    <div class="timer-pill ${s === _subject ? 'active' : ''}"
      style="${s === _subject ? `background:${SUBJ_COLORS[s]||'var(--primary)'};color:white;` : ''}"
      onclick="timerSelectSubj('${s}',this)">${s}</div>`).join('');
}

window.timerSelectSubj = (s, el) => {
  _subject = s;
  document.querySelectorAll('.timer-pill').forEach(p => { p.classList.remove('active'); p.style.background=''; p.style.color=''; });
  el.classList.add('active');
  el.style.background = SUBJ_COLORS[s] || 'var(--primary)';
  el.style.color = 'white';
};

/* ══════════════════════════════════════════════════════════
   TIMER LOGIC
   ══════════════════════════════════════════════════════════ */
function _toggleTimer() {
  _running = !_running;
  if (_running) {
    if (!_sessionStart) _sessionStart = Date.now();
    _interval = setInterval(_tick, 1000);
  } else {
    _stopTimer(false);
  }
  const btn = document.getElementById('timerPlayBtn');
  if (btn) btn.textContent = _running ? '⏸' : '▶';
  const fsBtn = document.getElementById('fsPlayBtn');
  if (fsBtn) fsBtn.textContent = _running ? '⏸' : '▶';
}

function _tick() {
  if (_mode === 'infinity') {
    _seconds++;
    _updateInfinityDisplay();
  } else {
    if (_seconds <= 0) { _onComplete(); return; }
    _seconds--;
  }
  _updateDisplay();
  _syncFsTimer();
}

function _stopTimer(resetStart = true) {
  clearInterval(_interval);
  _interval = null;
  _running  = false;
  if (resetStart) _sessionStart = null;
  const btn = document.getElementById('timerPlayBtn');
  if (btn) btn.textContent = '▶';
}

function _resetTimer() {
  _stopTimer();
  _seconds = _mode === 'infinity' ? 0 : _total;
  _updateDisplay();
}

function _skipTimer() {
  _onComplete(false /* don't log skip */);
}

function _onComplete(log = true) {
  _stopTimer();
  if (log && _sessionStart) {
    const durationMins = Math.round((Date.now() - _sessionStart) / 60000);
    _logSession(durationMins);
    _pomDone = (_pomDone + 1) % 4;
    _renderPomDots();
    _sessionStart = null;
    showToast(`✅ ${_mode === 'infinity' ? 'Flow' : 'Focus'} session complete! (${formatDuration(durationMins)})`);
  }
  // Cycle: focus → short break → (every 4th → long break)
  if (_mode === 'focus') {
    _mode    = _pomDone === 0 ? 'long' : 'short';
    _seconds = (_mode === 'long' ? _settings.long : _settings.short) * 60;
    _total   = _seconds;
  } else {
    _mode    = 'focus';
    _seconds = _settings.focus * 60;
    _total   = _seconds;
  }
  _updateDisplay();
  _updateModeTabs();
}

function _logSession(durationMins) {
  if (durationMins < 1) return;
  const entry = { id: Date.now(), subject: _subject, dur: durationMins, ts: new Date().toISOString() };
  _timerLog.push(entry);
  LS.set('sf_timerLog', _timerLog);
  _renderLog();
  _renderTodayStats();
  // Write to Firestore via StudyTracker
  const user = window._sfCurrentUser;
  if (user) StudyTracker.endSession(_activeSessionId, user.uid, durationMins).catch(() => {});
}

/* ══════════════════════════════════════════════════════════
   DISPLAY
   ══════════════════════════════════════════════════════════ */
function _updateDisplay() {
  const secs = _mode === 'infinity' ? _seconds : Math.max(0, _seconds);
  const mm   = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss   = String(secs % 60).padStart(2, '0');
  const timeStr = `${mm}:${ss}`;

  const dispEl  = document.getElementById('timerDisplay');
  const phaseEl = document.getElementById('timerPhase');
  const ringEl  = document.getElementById('timerRing');

  if (dispEl) dispEl.textContent = timeStr;

  const phaseNames = { focus: 'Focus Session', short: 'Short Break', long: 'Long Break', infinity: '∞ Flow Mode' };
  if (phaseEl) phaseEl.textContent = phaseNames[_mode] || 'Focus Session';

  if (ringEl && _mode !== 'infinity') {
    const circ = 2 * Math.PI * 108;
    const pct  = _total > 0 ? _seconds / _total : 1;
    ringEl.style.strokeDasharray  = circ;
    ringEl.style.strokeDashoffset = circ * (1 - pct);
    ringEl.setAttribute('stroke', _mode === 'focus' ? 'var(--primary)' : _mode === 'short' ? '#3AB8A0' : '#E8C17A');
  }
  _renderTodayStats();
}

function _updateInfinityDisplay() {
  const el = document.getElementById('timerInfTime');
  if (!el) return;
  el.style.display = 'block';
  el.textContent   = formatDuration(Math.round(_seconds / 60));
}

function _updateModeTabs() {
  document.querySelectorAll('.tm-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === _mode);
  });
}

function _renderPomDots() {
  const el = document.getElementById('pomDots');
  if (!el) return;
  el.innerHTML = Array.from({ length: 4 }, (_, i) =>
    `<div style="width:10px;height:10px;border-radius:50%;background:${i < _pomDone ? 'var(--primary)' : 'var(--border)'};transition:background .3s;"></div>`
  ).join('');
}

function _renderLog() {
  const el = document.getElementById('timerLogList');
  if (!el) return;
  if (!_timerLog.length) {
    el.innerHTML = `<div style="text-align:center;padding:20px;font-size:13px;color:var(--text3);">No sessions yet. Start your first focus session!</div>`;
    return;
  }
  const sorted = [..._timerLog].reverse().slice(0, 20);
  el.innerHTML = sorted.map(entry => {
    const d    = new Date(entry.ts || Date.now());
    const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const color= SUBJ_COLORS[entry.subject] || 'var(--primary)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;background:var(--bg);">
      <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></div>
      <div style="flex:1;font-size:13px;color:var(--text);">${entry.subject}</div>
      <div style="font-size:12px;color:var(--primary);font-weight:600;">${formatDuration(entry.dur)}</div>
      <div style="font-size:11px;color:var(--text3);">${time}</div>
    </div>`;
  }).join('');
}

function _renderTodayStats() {
  const today = new Date().toDateString();
  const todayLog = _timerLog.filter(l => new Date(l.ts || 0).toDateString() === today);
  const totalMins = todayLog.reduce((s, l) => s + (l.dur || 0), 0);
  const { calcStreak } = window._sfUtils || {};
  const streak = typeof calcStreak === 'function' ? calcStreak(_timerLog) : 0;
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('ts-sessions', todayLog.length);
  setText('ts-time', formatDuration(totalMins));
  setText('ts-streak', streak + ' 🔥');
}

/* ══════════════════════════════════════════════════════════
   FULLSCREEN TIMER
   ══════════════════════════════════════════════════════════ */
let _fsMode = 'flip';
let _fsLastDigits = { m1:'', m2:'', s1:'', s2:'' };
let _fsSyncInterval = null;

window.openFsTimer  = () => {
  document.getElementById('fsTimerOverlay').classList.add('open');
  _fsSyncNow();
  _fsSyncInterval = setInterval(_fsSyncNow, 300);
  document.addEventListener('keydown', _fsEsc);
};
window.closeFsTimer = () => {
  document.getElementById('fsTimerOverlay').classList.remove('open');
  clearInterval(_fsSyncInterval);
  document.removeEventListener('keydown', _fsEsc);
};
function _fsEsc(e) { if (e.key === 'Escape') closeFsTimer(); }

window.setFsMode = (m) => {
  _fsMode = m;
  document.getElementById('fsModeFlip').classList.toggle('active', m === 'flip');
  document.getElementById('fsModeNormal').classList.toggle('active', m === 'normal');
  document.getElementById('fsFlipView').style.display   = m === 'flip'   ? 'flex'  : 'none';
  document.getElementById('fsNormalView').style.display = m === 'normal' ? 'flex'  : 'none';
  _fsSyncNow();
};

function _fsSyncNow() {
  const disp = document.getElementById('timerDisplay');
  if (!disp) return;
  const timeStr = disp.textContent || '00:00';
  const [mm, ss] = timeStr.split(':');
  const digits   = { m1: mm[0]||'0', m2: mm[1]||'0', s1: ss[0]||'0', s2: ss[1]||'0' };
  if (_fsMode === 'flip') {
    ['m1','m2','s1','s2'].forEach(k => {
      if (digits[k] !== _fsLastDigits[k]) _flipAnim(k, _fsLastDigits[k] || digits[k], digits[k]);
      _fsLastDigits[k] = digits[k];
    });
    const phaseEl = document.getElementById('timerPhase');
    const fpEl    = document.getElementById('fsFlipPhase');
    if (phaseEl && fpEl) fpEl.textContent = phaseEl.textContent;
  } else {
    const ntEl = document.getElementById('fsNormalTime');
    if (ntEl) ntEl.textContent = timeStr;
  }
}

function _flipAnim(key, oldV, newV) {
  const fd = document.getElementById('fd-' + key);
  if (!fd) return;
  const ids = { fnt: 'fnt-'+key, fnb: 'fnb-'+key, ffi: 'ffi-'+key, ffbi: 'ffbi-'+key };
  const g   = id => document.getElementById(id);
  if (g(ids.ffi))  g(ids.ffi).textContent  = oldV;
  if (g(ids.ffbi)) g(ids.ffbi).textContent = newV;
  if (g(ids.fnt))  g(ids.fnt).textContent  = newV;
  if (g(ids.fnb))  g(ids.fnb).textContent  = newV;
  fd.classList.remove('flipping');
  void fd.offsetWidth;
  fd.classList.add('flipping');
  setTimeout(() => fd.classList.remove('flipping'), 520);
}

function _syncFsTimer() {
  if (document.getElementById('fsTimerOverlay')?.classList.contains('open')) {
    _fsSyncNow();
  }
}

// Expose for fullscreen controls
window._toggleTimer = _toggleTimer;
window._resetTimer  = _resetTimer;
window._skipTimer   = _skipTimer;
