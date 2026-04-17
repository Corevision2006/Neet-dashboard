/**
 * timer.js  ·  StudyFlow Focus Timer
 *
 * NEW in this version:
 *  ✦ Three focus presets: Ultra Focus (90/20), Deep Focus (50/10), Quick Focus (25/5)
 *  ✦ Picture-in-Picture (PiP) mode — keeps timer on top of PDFs / other windows
 *  ✦ Dispatches `sf:sessionComplete` event → Progress page auto-refreshes
 *  ✦ Sessions persist correctly across page navigations
 */

import { LS, SUBJ_COLORS, showToast, formatDuration } from './utils.js';
import { StudyTracker } from '../modules/study-tracker.js';

/* ── Presets ──────────────────────────────────────────────── */
const PRESETS = {
  ultra: { label: '🔥 Ultra Focus', focus: 90, short: 20, long: 30, emoji: '🔥', desc: '90 / 20 min' },
  deep:  { label: '⚡ Deep Focus',  focus: 50, short: 10, long: 20, emoji: '⚡', desc: '50 / 10 min' },
  quick: { label: '⏱ Quick Focus',  focus: 25, short: 5,  long: 15, emoji: '⏱', desc: '25 / 5 min'  },
};

/* ── Timer state ──────────────────────────────────────────── */
let _preset     = 'quick';
let _settings   = { focus: 25, short: 5, long: 15 };
let _subjects   = ['Physics', 'Chemistry', 'Biology', 'Mathematics', 'English'];
let _subject    = _subjects[0];
let _mode       = 'focus';
let _seconds    = 25 * 60;
let _total      = 25 * 60;
let _running    = false;
let _interval   = null;
let _pomDone    = 0;
let _timerLog   = [];
let _sessionStart = null;

/* ── PiP state ────────────────────────────────────────────── */
let _pipWindow    = null;
let _pipInterval  = null;

/* ══════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════ */
export function initTimer() {
  const saved = LS.get('sf_timerSettings', null);
  if (saved) {
    _settings = saved;
    // Restore preset from saved settings
    if (_settings.focus === 90) _preset = 'ultra';
    else if (_settings.focus === 50) _preset = 'deep';
    else _preset = 'quick';
  } else {
    _applyPreset('quick');
  }

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
   BUILD UI
   ══════════════════════════════════════════════════════════ */
function _buildUI() {
  const page = document.getElementById('page-timer');
  if (!page || page.dataset.built) return;
  page.dataset.built = '1';

  page.innerHTML = `
    <style>
      .preset-card {
        flex: 1; padding: 10px 14px; border-radius: 12px;
        border: 2px solid var(--border); background: var(--card);
        cursor: pointer; text-align: center; transition: all .2s;
        font-family: 'DM Sans', sans-serif;
      }
      .preset-card:hover { border-color: var(--primary); transform: translateY(-1px); }
      .preset-card.active { border-color: var(--primary); background: #E6F2EF; }
      body.dark .preset-card.active { background: #1C3833; }
      .preset-card .pc-emoji { font-size: 22px; display: block; margin-bottom: 4px; }
      .preset-card .pc-name  { font-size: 12px; font-weight: 600; color: var(--text); }
      .preset-card .pc-desc  { font-size: 11px; color: var(--text3); margin-top: 2px; }
      .tm-tab { padding: 7px 16px; border-radius: 20px; border: 1.5px solid var(--border);
        background: var(--bg); font-family:'DM Sans',sans-serif; font-size:13px;
        color:var(--text3); cursor:pointer; transition:all .18s; }
      .tm-tab.active { background: var(--primary); color: #fff; border-color: var(--primary); }
      .timer-pill { padding: 7px 16px; border-radius: 20px; border: 1.5px solid var(--border);
        background: var(--bg); font-family:'DM Sans',sans-serif; font-size:13px; color:var(--text3);
        cursor:pointer; transition:all .18s; }
      .timer-pill.active { color:#fff; }
      .pip-btn { width:48px;height:48px;border-radius:50%;border:1.5px solid var(--border);
        background:var(--bg);cursor:pointer;font-size:16px;transition:all .18s;
        display:flex;align-items:center;justify-content:center; }
      .pip-btn:hover { border-color:var(--primary); }
      .pip-btn.active { background:var(--primary);color:#fff;border-color:var(--primary); }
    </style>

    <div style="display:grid;grid-template-columns:1fr 320px;gap:20px;align-items:start;max-width:1000px;margin:0 auto;">
      <!-- LEFT: main timer -->
      <div class="timer-card" style="padding:32px;text-align:center;border-radius:var(--radius);border:1px solid var(--border);background:var(--card);">

        <!-- Preset selector -->
        <div style="margin-bottom:24px;">
          <div style="font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--text3);margin-bottom:10px;">Focus Preset</div>
          <div style="display:flex;gap:10px;" id="timerPresets">
            ${Object.entries(PRESETS).map(([key, p]) => `
              <div class="preset-card ${key === _preset ? 'active' : ''}" data-preset="${key}">
                <span class="pc-emoji">${p.emoji}</span>
                <div class="pc-name">${p.label.replace(/^[^ ]+ /, '')}</div>
                <div class="pc-desc">${p.desc}</div>
              </div>`).join('')}
          </div>
        </div>

        <!-- Subject pills -->
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:20px;" id="timerSubjPills"></div>

        <!-- Mode tabs -->
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:28px;" id="timerModeTabs">
          <button class="tm-tab active" data-mode="focus">Focus</button>
          <button class="tm-tab" data-mode="short">Short Break</button>
          <button class="tm-tab" data-mode="long">Long Break</button>
          <button class="tm-tab" data-mode="infinity">∞ Flow</button>
        </div>

        <!-- SVG ring timer -->
        <div style="position:relative;display:inline-flex;align-items:center;justify-content:center;margin-bottom:24px;">
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
        <div style="display:flex;gap:12px;align-items:center;justify-content:center;margin-bottom:20px;">
          <button id="timerResetBtn" style="width:48px;height:48px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);cursor:pointer;font-size:18px;transition:all .18s;" title="Reset">↺</button>
          <button id="timerPlayBtn"  style="width:72px;height:72px;border-radius:50%;border:none;background:var(--primary);color:white;cursor:pointer;font-size:26px;box-shadow:0 6px 20px rgba(58,122,108,0.35);transition:all .2s;" title="Start/Pause">▶</button>
          <button id="timerSkipBtn"  style="width:48px;height:48px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);cursor:pointer;font-size:18px;transition:all .18s;" title="Skip">⏭</button>
          <button id="timerFsBtn"    style="width:48px;height:48px;border-radius:50%;border:1.5px solid var(--border);background:var(--bg);cursor:pointer;font-size:16px;transition:all .18s;" title="Fullscreen">⛶</button>
          <button id="timerPipBtn"   class="pip-btn" title="Picture-in-Picture — keep timer on top">⧉</button>
        </div>

        <!-- Pomodoro dots -->
        <div id="pomDots" style="display:flex;gap:8px;justify-content:center;margin-bottom:16px;"></div>

        <!-- PiP hint -->
        <div id="pipHint" style="font-size:11.5px;color:var(--text3);margin-bottom:8px;display:none;">
          ⧉ Timer is in Picture-in-Picture mode
          <button onclick="_closePip()" style="border:none;background:none;color:var(--primary);cursor:pointer;font-size:11.5px;font-family:'DM Sans',sans-serif;padding:0 4px;">Close PiP</button>
        </div>
      </div>

      <!-- RIGHT: log + stats -->
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

    <!-- Fullscreen overlay -->
    <div id="fsTimerOverlay">
      <button class="fs-close-btn" onclick="closeFsTimer()">✕</button>
      <div class="fs-mode-bar">
        <button class="fs-mode-btn active" id="fsModeFlip" onclick="setFsMode('flip')">⏱ 3D Flip</button>
        <button class="fs-mode-btn" id="fsModeNormal" onclick="setFsMode('normal')">◷ Normal</button>
      </div>
      <div id="fsFlipView" class="flip-clock-wrap">
        <div id="fsSubjectBadge" class="fs-subject-badge">Focus</div>
        <div class="flip-clock" id="flipClock">
          ${_flipDigit('m1','2')}${_flipDigit('m2','5')}
          <div class="flip-sep">:</div>
          ${_flipDigit('s1','0')}${_flipDigit('s2','0')}
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

  _buildSubjectPills();
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
   PRESET LOGIC
   ══════════════════════════════════════════════════════════ */
function _applyPreset(key) {
  const p = PRESETS[key];
  if (!p) return;
  _preset   = key;
  _settings = { focus: p.focus, short: p.short, long: p.long };
  LS.set('sf_timerSettings', _settings);

  // Update mode durations
  const modeSeconds = { focus: p.focus*60, short: p.short*60, long: p.long*60, infinity: 0 };
  _seconds = modeSeconds[_mode] || p.focus*60;
  _total   = _seconds;
  if (_mode === 'infinity') _seconds = 0;

  _stopTimer();
  _updateDisplay();
  _updatePresetCards();
}

function _updatePresetCards() {
  document.querySelectorAll('.preset-card').forEach(el => {
    el.classList.toggle('active', el.dataset.preset === _preset);
  });
}

/* ══════════════════════════════════════════════════════════
   BIND EVENTS
   ══════════════════════════════════════════════════════════ */
function _bindEvents() {
  document.getElementById('timerPlayBtn')?.addEventListener('click',  () => _toggleTimer());
  document.getElementById('timerResetBtn')?.addEventListener('click', () => _resetTimer());
  document.getElementById('timerSkipBtn')?.addEventListener('click',  () => _skipTimer());
  document.getElementById('timerFsBtn')?.addEventListener('click',    () => openFsTimer());
  document.getElementById('timerPipBtn')?.addEventListener('click',   () => _pipWindow ? _closePip() : _openPip());

  // Preset cards
  document.querySelectorAll('.preset-card').forEach(el => {
    el.addEventListener('click', () => {
      if (_running) {
        if (!confirm('Switch preset? This will reset the current session.')) return;
      }
      _applyPreset(el.dataset.preset);
      showToast(`${PRESETS[el.dataset.preset].label} preset selected`);
    });
  });

  // Mode tabs
  document.querySelectorAll('.tm-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tm-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _mode = btn.dataset.mode;
      const modeMap = { focus: _settings.focus*60, short: _settings.short*60, long: _settings.long*60, infinity: 0 };
      _seconds = modeMap[_mode] ?? _settings.focus*60;
      _total   = _seconds;
      _stopTimer();
      _updateDisplay();
    });
  });
}

function _buildSubjectPills() {
  const el = document.getElementById('timerSubjPills');
  if (!el) return;
  el.innerHTML = _subjects.map(s => `
    <div class="timer-pill ${s === _subject ? 'active' : ''}"
      style="${s === _subject ? `background:${SUBJ_COLORS[s]||'var(--primary)'};color:white;border-color:${SUBJ_COLORS[s]||'var(--primary)'};` : ''}"
      onclick="timerSelectSubj('${s}',this)">${s}</div>`).join('');
}

window.timerSelectSubj = (s, el) => {
  _subject = s;
  document.querySelectorAll('.timer-pill').forEach(p => { p.classList.remove('active'); p.style.background=''; p.style.color=''; p.style.borderColor=''; });
  el.classList.add('active');
  el.style.background  = SUBJ_COLORS[s] || 'var(--primary)';
  el.style.color       = 'white';
  el.style.borderColor = SUBJ_COLORS[s] || 'var(--primary)';
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
  _refreshPlayBtns();
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
  _syncPip();

  // Sync floating timer pill
  if (window._ftSetState) {
    window._ftSetState({
      seconds: _mode === 'infinity' ? _seconds : Math.max(0, _seconds),
      running: _running,
      total:   _total,
      phase:   _mode === 'focus' ? 'Focus' : _mode === 'infinity' ? '∞ Flow' : 'Break'
    });
  }
}

function _stopTimer(resetStart = true) {
  clearInterval(_interval);
  _interval = null;
  _running  = false;
  if (resetStart) _sessionStart = null;
  _refreshPlayBtns();
}

function _refreshPlayBtns() {
  const icon = _running ? '⏸' : '▶';
  ['timerPlayBtn','fsPlayBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = icon;
  });
}

function _resetTimer() {
  _stopTimer();
  _seconds = _mode === 'infinity' ? 0 : _total;
  _updateDisplay();
}

function _skipTimer() { _onComplete(false); }

function _onComplete(log = true) {
  _stopTimer();
  if (log && _sessionStart) {
    const durationMins = Math.round((Date.now() - _sessionStart) / 60000);
    _logSession(durationMins);
    _pomDone = (_pomDone + 1) % 4;
    _renderPomDots();
    _sessionStart = null;
    showToast(`✅ ${_mode === 'infinity' ? 'Flow' : 'Focus'} complete! (${formatDuration(durationMins)})`);
  }
  // Auto-cycle: focus → break → focus
  if (_mode === 'focus' || _mode === 'infinity') {
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
  const entry = {
    id:      Date.now(),
    subject: _subject,
    dur:     durationMins,
    preset:  _preset,
    ts:      new Date().toISOString()
  };
  _timerLog.push(entry);
  LS.set('sf_timerLog', _timerLog);
  _renderLog();
  _renderTodayStats();

  // ── Notify Progress page & Dashboard to auto-refresh ──────
  window.dispatchEvent(new CustomEvent('sf:sessionComplete', { detail: entry }));

  // Write to Firestore via StudyTracker
  const user = window._sfCurrentUser;
  if (user) StudyTracker.endSession(null, user.uid, durationMins).catch(() => {});
}

/* ══════════════════════════════════════════════════════════
   DISPLAY
   ══════════════════════════════════════════════════════════ */
function _updateDisplay() {
  const secs    = _mode === 'infinity' ? _seconds : Math.max(0, _seconds);
  const mm      = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss      = String(secs % 60).padStart(2, '0');
  const timeStr = `${mm}:${ss}`;

  const dispEl  = document.getElementById('timerDisplay');
  const phaseEl = document.getElementById('timerPhase');
  const ringEl  = document.getElementById('timerRing');

  if (dispEl)  dispEl.textContent  = timeStr;
  const phaseNames = { focus: 'Focus Session', short: 'Short Break', long: 'Long Break', infinity: '∞ Flow Mode' };
  if (phaseEl) phaseEl.textContent = phaseNames[_mode] || 'Focus Session';

  if (ringEl && _mode !== 'infinity') {
    const circ = 2 * Math.PI * 108;
    const pct  = _total > 0 ? _seconds / _total : 1;
    ringEl.style.strokeDasharray  = circ;
    ringEl.style.strokeDashoffset = circ * (1 - pct);
    const colors = { focus: 'var(--primary)', short: '#3AB8A0', long: '#E8C17A' };
    ringEl.setAttribute('stroke', colors[_mode] || 'var(--primary)');
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
    const d     = new Date(entry.ts || Date.now());
    const time  = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const color = SUBJ_COLORS[entry.subject] || 'var(--primary)';
    const preset= entry.preset ? PRESETS[entry.preset]?.emoji || '' : '';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;background:var(--bg);">
      <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></div>
      <div style="flex:1;font-size:13px;color:var(--text);">${entry.subject} <span style="color:var(--text3);font-size:11px;">${preset}</span></div>
      <div style="font-size:12px;color:var(--primary);font-weight:600;">${formatDuration(entry.dur)}</div>
      <div style="font-size:11px;color:var(--text3);">${time}</div>
    </div>`;
  }).join('');
}

function _renderTodayStats() {
  const today    = new Date().toDateString();
  const todayLog = _timerLog.filter(l => new Date(l.ts || 0).toDateString() === today);
  const totalMins= todayLog.reduce((s, l) => s + (l.dur || 0), 0);
  const { calcStreak } = window._sfUtils || {};
  const streak   = typeof calcStreak === 'function' ? calcStreak(_timerLog) : 0;
  const setText  = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('ts-sessions', todayLog.length);
  setText('ts-time',     formatDuration(totalMins));
  setText('ts-streak',   streak + ' 🔥');
}

/* ══════════════════════════════════════════════════════════
   PICTURE-IN-PICTURE
   ══════════════════════════════════════════════════════════ */
async function _openPip() {
  if (_pipWindow && !_pipWindow.closed) { _closePip(); return; }

  const timeStr = document.getElementById('timerDisplay')?.textContent || '00:00';
  const phase   = document.getElementById('timerPhase')?.textContent   || 'Focus';

  // Try native Document PiP API (Chrome 116+)
  if ('documentPictureInPicture' in window) {
    try {
      _pipWindow = await window.documentPictureInPicture.requestWindow({ width: 300, height: 200 });
      _buildPipUI(_pipWindow.document);
      _pipWindow.addEventListener('pagehide', () => _closePip());
      _startPipSync();
      _showPipHint(true);
      document.getElementById('timerPipBtn')?.classList.add('active');
      showToast('⧉ Timer floating on top');
      return;
    } catch(e) { /* fallback */ }
  }

  // Fallback: tiny popup window
  const left   = window.screen.width  - 310;
  const top    = window.screen.height - 220;
  const popup  = window.open('', 'sf_pip_timer',
    `width=300,height=190,top=${top},left=${left},resizable=yes,scrollbars=no,` +
    `status=no,location=no,toolbar=no,menubar=no,alwaysOnTop=1`);

  if (!popup) {
    showToast('⚠ Allow popups for Picture-in-Picture support'); return;
  }
  _pipWindow = popup;
  _buildPipUI(popup.document);
  popup.addEventListener('beforeunload', () => _closePip());
  _startPipSync();
  _showPipHint(true);
  document.getElementById('timerPipBtn')?.classList.add('active');
  showToast('⧉ Timer floating in a mini window');
}

function _buildPipUI(doc) {
  const isDark = document.body.classList.contains('dark');
  const bg     = isDark ? '#141F1B' : '#EEF2EE';
  const card   = isDark ? '#1C2E28' : '#ffffff';
  const text   = isDark ? '#E8EFE8' : '#1C2820';
  const primary= '#3A7A6C';

  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>StudyFlow Timer</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',sans-serif; background:${bg}; color:${text};
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      height:100vh; user-select:none; }
    .pip-time { font-size:52px; font-weight:200; letter-spacing:-2px; line-height:1; color:${text}; }
    .pip-phase { font-size:11px; letter-spacing:2px; text-transform:uppercase;
      color:#8AADA5; margin-top:6px; margin-bottom:16px; }
    .pip-subject { font-size:12px; font-weight:600; color:${primary};
      background:${isDark?'#1C3833':'#E6F2EF'}; border-radius:12px;
      padding:3px 12px; margin-bottom:14px; }
    .pip-controls { display:flex; gap:10px; }
    .pip-btn { width:38px;height:38px;border-radius:50%;border:1.5px solid #2D5548;
      background:${card};color:${text};cursor:pointer;font-size:16px; }
    .pip-play { width:48px;height:48px;background:${primary};color:#fff;border:none;font-size:20px; }
  </style>
  </head><body>
  <div class="pip-subject" id="pipSubj">Focus</div>
  <div class="pip-time" id="pipTime">00:00</div>
  <div class="pip-phase" id="pipPhase">Focus Session</div>
  <div class="pip-controls">
    <button class="pip-btn" onclick="window.opener?._resetTimer?.()">↺</button>
    <button class="pip-btn pip-play" id="pipPlay" onclick="window.opener?._toggleTimer?.()">▶</button>
    <button class="pip-btn" onclick="window.opener?._skipTimer?.()">⏭</button>
  </div>
  </body></html>`);
  doc.close();
}

function _startPipSync() {
  clearInterval(_pipInterval);
  _pipInterval = setInterval(() => {
    if (!_pipWindow || _pipWindow.closed) { _closePip(); return; }
    try {
      const doc = _pipWindow.document;
      const timeStr = document.getElementById('timerDisplay')?.textContent || '00:00';
      const phase   = document.getElementById('timerPhase')?.textContent   || 'Focus';
      const t = doc.getElementById('pipTime');
      const p = doc.getElementById('pipPhase');
      const s = doc.getElementById('pipSubj');
      const b = doc.getElementById('pipPlay');
      if (t) t.textContent = timeStr;
      if (p) p.textContent = phase;
      if (s) s.textContent = _subject;
      if (b) b.textContent = _running ? '⏸' : '▶';
    } catch(e) {}
  }, 500);
}

function _closePip() {
  clearInterval(_pipInterval);
  _pipInterval = null;
  if (_pipWindow && !_pipWindow.closed) {
    try { _pipWindow.close(); } catch(e) {}
  }
  _pipWindow = null;
  _showPipHint(false);
  document.getElementById('timerPipBtn')?.classList.remove('active');
}
window._closePip = _closePip;

function _showPipHint(show) {
  const el = document.getElementById('pipHint');
  if (el) el.style.display = show ? 'block' : 'none';
}

function _syncPip() {
  if (_pipWindow && !_pipWindow.closed) {
    try {
      const timeStr = document.getElementById('timerDisplay')?.textContent || '00:00';
      const phase   = document.getElementById('timerPhase')?.textContent   || 'Focus';
      const doc = _pipWindow.document;
      const t = doc.getElementById('pipTime');
      const p = doc.getElementById('pipPhase');
      const b = doc.getElementById('pipPlay');
      if (t) t.textContent = timeStr;
      if (p) p.textContent = phase;
      if (b) b.textContent = _running ? '⏸' : '▶';
    } catch(e) {}
  }
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
  document.getElementById('fsFlipView').style.display   = m === 'flip'   ? 'flex' : 'none';
  document.getElementById('fsNormalView').style.display = m === 'normal' ? 'flex' : 'none';
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
  const g = id => document.getElementById(id);
  if (g('ffi-'+key))  g('ffi-'+key).textContent  = oldV;
  if (g('ffbi-'+key)) g('ffbi-'+key).textContent = newV;
  if (g('fnt-'+key))  g('fnt-'+key).textContent  = newV;
  if (g('fnb-'+key))  g('fnb-'+key).textContent  = newV;
  fd.classList.remove('flipping');
  void fd.offsetWidth;
  fd.classList.add('flipping');
  setTimeout(() => fd.classList.remove('flipping'), 520);
}

function _syncFsTimer() {
  if (document.getElementById('fsTimerOverlay')?.classList.contains('open')) _fsSyncNow();
}

// Expose for fullscreen controls
window._toggleTimer = _toggleTimer;
window._resetTimer  = _resetTimer;
window._skipTimer   = _skipTimer;
