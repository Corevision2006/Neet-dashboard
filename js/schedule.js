/**
 * schedule.js
 * Weekly schedule page — lazy loaded.
 * Preserves all original logic (week grid, day view, session modal, agenda).
 */

import { LS, SUBJ_COLORS, TYPE_COLORS, showToast } from './utils.js';

/* ── State ────────────────────────────────────────────────── */
let _sessions   = [];
let _weekOffset = 0;
let _dayOffset  = 0; // Mon=0..Sun=6
let _view       = 'week';
let _editId     = null;
let _selSubj    = 'Physics';
let _selType    = 'study';

// Slot helpers — 30-min slots, anchor at 6 AM = slot 12
const ANCHOR_SLOT   = 12; // 6 AM in absolute 30-min slots from midnight
const DISPLAY_SLOTS = 34; // 6 AM to 11 PM = 17 hours × 2

export function initSchedule() {
  _sessions = LS.get('sf_schedule', []);
  _buildUI();
  _bindEvents();
  _updateWeekLabel();
  _renderWeekGrid();
  _renderAgenda();
  _updateSummary();
}

/* ══════════════════════════════════════════════════════════
   BUILD UI
   ══════════════════════════════════════════════════════════ */
function _buildUI() {
  const page = document.getElementById('page-schedule');
  if (!page || page.dataset.built) return;
  page.dataset.built = '1';

  page.innerHTML = `
    <div class="sch-header">
      <div class="sch-header-left">
        <h2>Study Schedule</h2>
        <p>Plan and track your weekly study sessions</p>
      </div>
      <div class="sch-controls">
        <div class="week-nav">
          <div class="icon-btn" id="prevWeekBtn">&#8249;</div>
          <div class="week-label" id="weekLabel"></div>
          <div class="icon-btn" id="nextWeekBtn">&#8250;</div>
        </div>
        <div class="view-toggle">
          <button class="vt-btn active" id="vtWeek" onclick="schSetView('week',this)">Week</button>
          <button class="vt-btn"        id="vtDay"  onclick="schSetView('day',this)">Day</button>
        </div>
        <button class="btn-primary" id="addSchBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Session
        </button>
      </div>
    </div>

    <!-- Summary -->
    <div class="sch-summary">
      <div class="sch-sum-card"><div class="sch-sum-val" id="ss-sessions">0</div><div class="sch-sum-label">Sessions This Week</div></div>
      <div class="sch-sum-card"><div class="sch-sum-val" id="ss-hours">0h</div><div class="sch-sum-label">Study Hours</div></div>
      <div class="sch-sum-card"><div class="sch-sum-val" id="ss-today">0</div><div class="sch-sum-label">Sessions Today</div></div>
      <div class="sch-sum-card"><div class="sch-sum-val" id="ss-subjects">0</div><div class="sch-sum-label">Subjects</div></div>
    </div>

    <div class="sch-layout">
      <!-- Week / Day view -->
      <div>
        <div id="weekView">
          <div class="week-grid-wrap">
            <div class="wg-day-headers" id="wgDayHeaders"></div>
            <div class="wg-body" id="wgBody"></div>
          </div>
        </div>
        <div id="dayView" style="display:none;">
          <div class="day-view-wrap">
            <div class="dv-header">
              <div>
                <div class="dv-day-label" id="dvDayLabel">Monday</div>
                <div style="font-size:12px;color:var(--text3);margin-top:2px;" id="dvDaySub"></div>
              </div>
              <div style="display:flex;gap:8px;">
                <div class="icon-btn" id="prevDayBtn">&#8249;</div>
                <div class="icon-btn" id="nextDayBtn">&#8250;</div>
              </div>
            </div>
            <div class="dv-body" id="dvBody"></div>
          </div>
        </div>
      </div>

      <!-- Right panel -->
      <div class="sch-right">
        <div class="agenda-card">
          <div class="agenda-header">
            <div class="agenda-title">Today's Agenda</div>
            <div style="font-size:12px;color:var(--text3);" id="agendaDate"></div>
          </div>
          <div class="agenda-list" id="agendaList"></div>
        </div>
        <div class="agenda-card">
          <div class="agenda-header"><div class="agenda-title">Hours by Subject</div></div>
          <div style="padding:14px 18px;display:flex;flex-direction:column;gap:10px;" id="subjectHours"></div>
        </div>
      </div>
    </div>

    <!-- Session Modal -->
    <div class="sch-modal-overlay" id="schModal">
      <div class="sch-modal">
        <div class="sm-header">
          <div>
            <h3 id="smTitle" style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:400;">Add Session</h3>
            <p style="font-size:13px;color:var(--text3);margin-top:3px;">Fill in the details below</p>
          </div>
          <button onclick="closeSchModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3);">✕</button>
        </div>
        <div class="sm-body">
          <!-- Day chips -->
          <div>
            <div style="font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:var(--text2);margin-bottom:8px;">Day</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;" id="dayChips">
              ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d,i) => `<div class="sm-day-chip" data-day="${i}">${d}</div>`).join('')}
            </div>
          </div>
          <!-- Subject -->
          <div>
            <div style="font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:var(--text2);margin-bottom:8px;">Subject</div>
            <div class="subj-select-row" id="subjSelectRow"></div>
          </div>
          <!-- Type -->
          <div>
            <div style="font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:var(--text2);margin-bottom:8px;">Type</div>
            <div class="type-row">
              ${['study','revision','practice','mock'].map(t => `<div class="type-opt" data-type="${t}">${t.charAt(0).toUpperCase()+t.slice(1)}</div>`).join('')}
            </div>
          </div>
          <!-- Topic -->
          <div>
            <div style="font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:var(--text2);margin-bottom:8px;">Topic</div>
            <input id="sm-topic" class="form-input" placeholder="e.g. Organic Chemistry - Reactions" />
          </div>
          <!-- Start + Duration -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <div style="font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:var(--text2);margin-bottom:8px;">Start Time</div>
              <select id="sm-start" class="form-input"></select>
            </div>
            <div>
              <div style="font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:var(--text2);margin-bottom:8px;">Duration</div>
              <select id="sm-dur" class="form-input">
                <option value="1">30 min</option>
                <option value="2" selected>1 hour</option>
                <option value="3">1.5 hours</option>
                <option value="4">2 hours</option>
                <option value="6">3 hours</option>
              </select>
            </div>
          </div>
          <!-- Notes -->
          <div>
            <div style="font-size:11px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:var(--text2);margin-bottom:8px;">Notes (optional)</div>
            <textarea id="sm-notes" class="form-input" rows="2" placeholder="Any additional notes..."></textarea>
          </div>
        </div>
        <div class="sm-footer">
          <button id="smDeleteBtn" style="display:none;padding:10px 16px;border-radius:10px;border:1px solid #E8A8A8;background:white;color:#C0392B;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;" onclick="deleteSchSession()">🗑 Delete</button>
          <button class="btn-secondary" onclick="closeSchModal()" style="flex:1;">Cancel</button>
          <button class="btn-primary"   id="smSaveBtn" onclick="saveSchSession()" style="flex:2;">Save Session</button>
        </div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   BIND EVENTS
   ══════════════════════════════════════════════════════════ */
function _bindEvents() {
  document.getElementById('addSchBtn')?.addEventListener('click', () => openSchModal());
  document.getElementById('prevWeekBtn')?.addEventListener('click', () => changeWeek(-1));
  document.getElementById('nextWeekBtn')?.addEventListener('click', () => changeWeek(1));
  document.getElementById('prevDayBtn')?.addEventListener('click',  () => changeDayView(-1));
  document.getElementById('nextDayBtn')?.addEventListener('click',  () => changeDayView(1));

  // Type opts
  document.addEventListener('click', e => {
    const to = e.target.closest('.type-opt');
    if (to) {
      _selType = to.dataset.type;
      document.querySelectorAll('.type-opt').forEach(t => t.className = 'type-opt');
      to.className = `type-opt sel-${_selType}`;
    }
    const sp = e.target.closest('#subjSelectRow .subj-pill');
    if (sp) {
      _selSubj = sp.dataset.s;
      document.querySelectorAll('#subjSelectRow .subj-pill').forEach(p => { p.classList.remove('selected'); p.style.background=''; p.style.color=''; });
      sp.classList.add('selected');
      sp.style.background = SUBJ_COLORS[_selSubj] || 'var(--primary)';
      sp.style.color = 'white';
    }
    // Modal overlay close
    if (e.target.id === 'schModal') closeSchModal();
  });
}

/* ══════════════════════════════════════════════════════════
   WEEK GRID
   ══════════════════════════════════════════════════════════ */
function _renderWeekGrid() {
  const headerEl = document.getElementById('wgDayHeaders');
  const bodyEl   = document.getElementById('wgBody');
  if (!headerEl || !bodyEl) return;

  const dates    = _getWeekDates();
  const today    = new Date();
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  // Headers
  headerEl.innerHTML = '<div class="wg-time-col"></div>' +
    dates.map((d, i) => {
      const isToday = d.toDateString() === today.toDateString();
      return `<div class="wg-day-head ${isToday?'today':''}">
        <div class="wg-day-name">${dayNames[i]}</div>
        <div class="wg-day-num">${d.getDate()}</div>
      </div>`;
    }).join('');

  // Body
  let html = '';
  for (let slot = ANCHOR_SLOT; slot < ANCHOR_SLOT + DISPLAY_SLOTS; slot++) {
    const isHour = slot % 2 === 0;
    html += `<div class="wg-time-label ${slot===0?'wg-midnight':''}">${isHour ? _absSlotToTime(slot) : ''}</div>`;
    for (let day = 0; day < 7; day++) {
      const sess = _sessions.find(s => s.day === day && s.startSlot === slot);
      if (sess) {
        const col = SUBJ_COLORS[sess.subject] || '#3A7A6C';
        const tc  = TYPE_COLORS[sess.type] || TYPE_COLORS.study;
        html += `<div class="wg-cell has-session ${slot===0?'wg-cell-midnight':''}">
          <div class="session-block" style="background:${tc.bg};border-left-color:${col};top:0;bottom:0;" onclick="editSchSession(${sess.id})">
            <div class="sb-name" style="color:${col};">${sess.subject}</div>
            <div class="sb-time" style="color:${tc.text};">${sess.topic||''}</div>
          </div>
        </div>`;
      } else {
        html += `<div class="wg-cell ${slot===0?'wg-cell-midnight':''}" onclick="openSchModal(${day},${slot})"></div>`;
      }
    }
  }
  bodyEl.innerHTML = html;

  // Now line
  _drawNowLine();
}

function _drawNowLine() {
  const bodyEl = document.getElementById('wgBody');
  if (!bodyEl) return;
  const now       = new Date();
  const dowToday  = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0
  const nowSlot   = now.getHours() * 2 + (now.getMinutes() >= 30 ? 1 : 0);
  const relSlot   = nowSlot - ANCHOR_SLOT;
  if (relSlot < 0 || relSlot >= DISPLAY_SLOTS) return;
  // Remove old
  bodyEl.querySelectorAll('.wg-now-line').forEach(e => e.remove());
  // Cells are 29px tall; cols are (1 time col + 7 day cols)
  const rowH     = 29;
  const colW     = 100 / 8; // % approximation
  const top      = relSlot * rowH;
  const nowLine  = document.createElement('div');
  nowLine.className = 'wg-now-line';
  nowLine.style.top  = top + 'px';
  nowLine.style.left = `${(1/8)*100}%`;
  bodyEl.style.position = 'relative';
  bodyEl.appendChild(nowLine);
}

/* ══════════════════════════════════════════════════════════
   DAY VIEW
   ══════════════════════════════════════════════════════════ */
function _renderDayView() {
  const dates    = _getWeekDates();
  const d        = dates[_dayOffset];
  const dayNames = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const dvLab    = document.getElementById('dvDayLabel');
  const dvSub    = document.getElementById('dvDaySub');
  if (dvLab) dvLab.textContent = dayNames[_dayOffset];
  if (dvSub) dvSub.textContent = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  const bodyEl = document.getElementById('dvBody');
  if (!bodyEl) return;
  const sess    = _sessions.filter(s => s.day === _dayOffset).sort((a,b) => a.startSlot - b.startSlot);
  let html = '';
  for (let slot = ANCHOR_SLOT; slot < ANCHOR_SLOT + DISPLAY_SLOTS; slot += 2) {
    const s = sess.find(x => x.startSlot === slot || x.startSlot === slot + 1);
    html += `<div class="dv-slot">
      <div class="dv-slot-time">${_absSlotToTime(slot)}</div>
      <div class="dv-slot-content">
        ${s ? `<div class="dv-session-card" style="border-left-color:${SUBJ_COLORS[s.subject]||'var(--primary)'};" onclick="editSchSession(${s.id})">
          <div class="dv-sc-title">${s.subject} — ${s.topic}</div>
          <div class="dv-sc-meta">${_absSlotToTime(s.startSlot)} · ${s.dur * 30}min · ${s.type}</div>
        </div>` : `<div class="dv-add-slot" onclick="openSchModal(${_dayOffset},${slot})">+ Add session</div>`}
      </div>
    </div>`;
  }
  bodyEl.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════
   AGENDA + SUBJECT HOURS
   ══════════════════════════════════════════════════════════ */
function _renderAgenda() {
  const todayDow = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const sess     = _sessions.filter(s => s.day === todayDow).sort((a,b) => a.startSlot - b.startSlot);
  const dateEl   = document.getElementById('agendaDate');
  const listEl   = document.getElementById('agendaList');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' });
  if (!listEl) return;
  if (!sess.length) { listEl.innerHTML = '<div style="text-align:center;font-size:13px;color:var(--text3);padding:20px 0;">No sessions today</div>'; }
  else {
    listEl.innerHTML = sess.map(s => {
      const c = SUBJ_COLORS[s.subject] || 'var(--primary)';
      return `<div class="agenda-item">
        <div class="ag-time-col"><div class="ag-time">${_absSlotToTime(s.startSlot)}</div><div class="ag-line" style="background:${c};"></div><div class="ag-dur">${s.dur*30}m</div></div>
        <div class="ag-dot" style="background:${c};"></div>
        <div class="ag-info"><div class="ag-subj">${s.subject}</div><div class="ag-type">${s.topic||s.type}</div></div>
      </div>`;
    }).join('');
  }
  // Subject hours bar
  const shEl = document.getElementById('subjectHours');
  if (!shEl) return;
  const map = {};
  _sessions.forEach(s => { map[s.subject] = (map[s.subject]||0) + s.dur * 0.5; });
  const maxH = Math.max(...Object.values(map), 1);
  shEl.innerHTML = Object.entries(map).map(([name, hrs]) => {
    const c = SUBJ_COLORS[name] || 'var(--primary)';
    return `<div style="display:flex;align-items:center;gap:10px;">
      <div style="width:10px;height:10px;border-radius:50%;background:${c};flex-shrink:0;"></div>
      <div style="flex:1;font-size:13px;color:var(--text);">${name}</div>
      <div style="width:70px;height:5px;background:var(--bg);border-radius:5px;overflow:hidden;"><div style="width:${Math.round((hrs/maxH)*100)}%;height:100%;background:${c};border-radius:5px;"></div></div>
      <div style="font-size:12px;color:var(--text2);">${hrs.toFixed(1)}h</div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════
   MODAL
   ══════════════════════════════════════════════════════════ */
window.openSchModal = (day, slot) => {
  _editId   = null;
  _selSubj  = 'Physics';
  _selType  = 'study';
  document.getElementById('smTitle').textContent = 'Add Session';
  document.getElementById('smDeleteBtn').style.display = 'none';
  document.getElementById('sm-topic').value  = '';
  document.getElementById('sm-notes').value  = '';
  document.querySelectorAll('.sm-day-chip').forEach(c => c.classList.remove('selected'));
  if (day !== undefined) document.querySelector(`.sm-day-chip[data-day="${day}"]`)?.classList.add('selected');
  _buildSubjPills();
  _buildStartTimes(slot);
  document.querySelectorAll('.type-opt').forEach(t => t.className = 'type-opt');
  document.querySelector('.type-opt[data-type="study"]').classList.add('sel-study');
  document.getElementById('schModal').classList.add('open');
};

window.editSchSession = (id) => {
  const s = _sessions.find(x => x.id === id);
  if (!s) return;
  _editId  = id;
  _selSubj = s.subject;
  _selType = s.type;
  document.getElementById('smTitle').textContent = 'Edit Session';
  document.getElementById('smDeleteBtn').style.display = 'inline-flex';
  document.getElementById('sm-topic').value  = s.topic || '';
  document.getElementById('sm-notes').value  = s.notes || '';
  document.querySelectorAll('.sm-day-chip').forEach(c => c.classList.remove('selected'));
  document.querySelector(`.sm-day-chip[data-day="${s.day}"]`)?.classList.add('selected');
  _buildSubjPills();
  _buildStartTimes(s.startSlot);
  document.getElementById('sm-dur').value = s.dur;
  document.querySelectorAll('.type-opt').forEach(t => t.className = 'type-opt');
  document.querySelector(`.type-opt[data-type="${s.type}"]`)?.classList.add(`sel-${s.type}`);
  document.getElementById('schModal').classList.add('open');
};

window.closeSchModal = () => document.getElementById('schModal').classList.remove('open');

window.saveSchSession = () => {
  const dayChip = document.querySelector('.sm-day-chip.selected');
  if (!dayChip) { showToast('⚠ Please select a day.'); return; }
  const day     = parseInt(dayChip.dataset.day);
  const slot    = parseInt(document.getElementById('sm-start').value);
  const dur     = parseInt(document.getElementById('sm-dur').value);
  const topic   = document.getElementById('sm-topic').value.trim() || _selType;
  const notes   = document.getElementById('sm-notes').value.trim();
  if (!_selSubj) { showToast('⚠ Please select a subject.'); return; }

  if (_editId) {
    const idx = _sessions.findIndex(s => s.id === _editId);
    if (idx > -1) _sessions[idx] = { ..._sessions[idx], day, startSlot: slot, dur, subject: _selSubj, type: _selType, topic, notes };
  } else {
    _sessions.push({ id: Date.now(), day, startSlot: slot, dur, subject: _selSubj, type: _selType, topic, notes });
  }
  LS.set('sf_schedule', _sessions);
  closeSchModal();
  _rerender();
  showToast(_editId ? '✅ Session updated!' : '✅ Session added!');
};

window.deleteSchSession = () => {
  if (!_editId) return;
  _sessions = _sessions.filter(s => s.id !== _editId);
  LS.set('sf_schedule', _sessions);
  closeSchModal();
  _rerender();
  showToast('🗑 Session deleted.');
};

/* ── Build subject pills ──────────────────────────────────── */
function _buildSubjPills() {
  const subjects = ['Physics','Chemistry','Biology','Mathematics','English'];
  const el = document.getElementById('subjSelectRow');
  if (!el) return;
  el.innerHTML = subjects.map(s => {
    const sel = s === _selSubj;
    return `<div class="subj-pill ${sel?'selected':''}" data-s="${s}"
      style="${sel?`background:${SUBJ_COLORS[s]};color:white;`:''}">${s}</div>`;
  }).join('');
}

function _buildStartTimes(defaultSlot) {
  const sel = document.getElementById('sm-start');
  if (!sel) return;
  let html = '';
  for (let slot = ANCHOR_SLOT; slot < ANCHOR_SLOT + DISPLAY_SLOTS; slot++) {
    html += `<option value="${slot}" ${slot === defaultSlot ? 'selected':''}>${_absSlotToTime(slot)}</option>`;
  }
  sel.innerHTML = html;
}

/* ── Rerender all views ───────────────────────────────────── */
function _rerender() {
  if (_view === 'week') _renderWeekGrid(); else _renderDayView();
  _renderAgenda();
  _updateSummary();
}

/* ── Summary row ──────────────────────────────────────────── */
function _updateSummary() {
  const todayDow = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  const setText  = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  setText('ss-sessions', _sessions.length);
  setText('ss-hours',    (_sessions.reduce((a,s) => a + s.dur * 0.5, 0)).toFixed(1) + 'h');
  setText('ss-today',    _sessions.filter(s => s.day === todayDow).length);
  setText('ss-subjects', new Set(_sessions.map(s => s.subject)).size);
}

/* ── Week / day navigation ────────────────────────────────── */
function changeWeek(d)    { _weekOffset += d; _updateWeekLabel(); _renderWeekGrid(); }
function changeDayView(d) { _dayOffset = (_dayOffset + d + 7) % 7; _renderDayView(); }
function _updateWeekLabel() {
  const dates = _getWeekDates();
  const opts  = { month:'short', day:'numeric' };
  const el    = document.getElementById('weekLabel');
  if (el) el.textContent = `${dates[0].toLocaleDateString('en-IN',opts)} – ${dates[6].toLocaleDateString('en-IN',opts)}`;
}

window.schSetView = (v, el) => {
  _view = v;
  document.querySelectorAll('.vt-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('weekView').style.display = v==='week' ? 'block' : 'none';
  document.getElementById('dayView').style.display  = v==='day'  ? 'block' : 'none';
  if (v==='week') _renderWeekGrid(); else _renderDayView();
};

/* ── Helpers ──────────────────────────────────────────────── */
function _getWeekDates() {
  const today  = new Date();
  const dow    = today.getDay() === 0 ? 6 : today.getDay() - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - dow + _weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function _absSlotToTime(slot) {
  const totalMins = slot * 30;
  const h  = Math.floor(totalMins / 60);
  const m  = totalMins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2,'0')} ${ap}`;
}
