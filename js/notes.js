/**
 * notes.js
 * Notes page module — lazy loaded.
 * Rich text note-taking with subject filtering and search, saved to localStorage.
 */

import { LS, showToast, genId, SUBJ_COLORS, formatDate } from './utils.js';

let _notes   = [];
let _filter  = 'all';
let _search  = '';
let _editId  = null;
let _debounceSearch;

export function initNotes() {
  _notes = LS.get('sf_notes', []);
  _buildUI();
  _bindEvents();
  _renderNotes();
}

/* ══════════════════════════════════════════════════════════
   BUILD UI
   ══════════════════════════════════════════════════════════ */
function _buildUI() {
  const page = document.getElementById('page-notes');
  if (!page || page.dataset.built) return;
  page.dataset.built = '1';

  const subjects = ['Physics','Chemistry','Biology','Mathematics','English','General'];

  page.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
      <div>
        <h2 style="font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:400;">My <span style="color:var(--primary)">Notes</span></h2>
        <p style="font-size:13.5px;color:var(--text3);margin-top:3px;">Capture ideas, formulas, and summaries</p>
      </div>
      <button class="btn-primary" id="addNoteBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Note
      </button>
    </div>

    <!-- Filter + Search -->
    <div class="filter-bar" style="margin-bottom:20px;">
      <div class="filter-chip active" data-filter="all">All</div>
      ${subjects.map(s => `<div class="filter-chip" data-filter="${s}">${s}</div>`).join('')}
      <div class="filter-chip" data-filter="starred">⭐ Starred</div>
      <div class="filter-search" style="margin-left:auto;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="noteSearch" placeholder="Search notes..." style="width:160px;" />
      </div>
    </div>

    <!-- Stats -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:24px;" id="notesStats">
      <div class="tstat"><div class="tstat-val" id="ns-total">0</div><div class="tstat-label">Total Notes</div></div>
      <div class="tstat"><div class="tstat-val" id="ns-starred">0</div><div class="tstat-label">Starred</div></div>
      <div class="tstat"><div class="tstat-val" id="ns-subjects">0</div><div class="tstat-label">Subjects</div></div>
    </div>

    <!-- Notes grid -->
    <div id="notesGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;"></div>

    <!-- Note Editor Modal -->
    <div class="modal-overlay" id="noteModal">
      <div class="modal" style="width:620px;max-height:90vh;overflow-y:auto;">
        <div style="padding:24px 28px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <h3 id="noteModalTitle" style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:400;">New Note</h3>
            <div style="display:flex;gap:8px;">
              <button id="nm-star" title="Star" style="background:none;border:1.5px solid var(--border);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:16px;transition:all .18s;">☆</button>
              <button onclick="document.getElementById('noteModal').classList.remove('open')" style="background:none;border:1.5px solid var(--border);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:16px;">✕</button>
            </div>
          </div>
          <div class="ls-field">
            <label class="form-label">Title</label>
            <input id="nm-title" class="ls-input" placeholder="Note title..." />
          </div>
          <div class="ls-field">
            <label class="form-label">Subject</label>
            <select id="nm-subject" class="ls-input">
              ${subjects.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
          <div class="ls-field">
            <label class="form-label">Content</label>
            <textarea id="nm-content" class="ls-input" rows="10" style="resize:vertical;font-family:'DM Sans',sans-serif;line-height:1.7;" placeholder="Start typing your note...&#10;&#10;Tip: Use markdown-style formatting:&#10;# Heading&#10;**bold** _italic_&#10;- list item"></textarea>
          </div>
          <div class="ls-field">
            <label class="form-label">Tags (comma separated)</label>
            <input id="nm-tags" class="ls-input" placeholder="e.g. important, formula, chapter3" />
          </div>
          <div id="nm-error" class="ls-error"></div>
          <div style="display:flex;gap:10px;margin-top:16px;">
            <button id="nm-delete" style="display:none;padding:10px 16px;border-radius:10px;border:1px solid #E8A8A8;background:white;color:#C0392B;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;">🗑 Delete</button>
            <div style="flex:1;"></div>
            <button class="btn-secondary" onclick="document.getElementById('noteModal').classList.remove('open')">Cancel</button>
            <button class="btn-primary" id="nm-save">Save Note</button>
          </div>
        </div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   BIND EVENTS
   ══════════════════════════════════════════════════════════ */
function _bindEvents() {
  document.getElementById('addNoteBtn')?.addEventListener('click', () => _openModal());

  // Filters
  document.querySelectorAll('#page-notes .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#page-notes .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _filter = chip.dataset.filter;
      _renderNotes();
    });
  });

  // Search
  document.getElementById('noteSearch')?.addEventListener('input', e => {
    clearTimeout(_debounceSearch);
    _debounceSearch = setTimeout(() => { _search = e.target.value.toLowerCase(); _renderNotes(); }, 280);
  });

  // Modal save
  document.getElementById('nm-save')?.addEventListener('click', _saveNote);
  document.getElementById('nm-delete')?.addEventListener('click', _deleteNote);

  // Star button
  document.getElementById('nm-star')?.addEventListener('click', function() {
    const isStarred = this.textContent === '⭐';
    this.textContent = isStarred ? '☆' : '⭐';
  });

  // Modal overlay close
  document.getElementById('noteModal')?.addEventListener('click', e => {
    if (e.target.id === 'noteModal') e.target.classList.remove('open');
  });
}

/* ══════════════════════════════════════════════════════════
   RENDER NOTES GRID
   ══════════════════════════════════════════════════════════ */
function _renderNotes() {
  const grid = document.getElementById('notesGrid');
  if (!grid) return;

  let filtered = _notes;
  if (_filter !== 'all') {
    if (_filter === 'starred') filtered = filtered.filter(n => n.starred);
    else filtered = filtered.filter(n => n.subject === _filter);
  }
  if (_search) {
    filtered = filtered.filter(n =>
      n.title.toLowerCase().includes(_search) ||
      n.content.toLowerCase().includes(_search) ||
      (n.tags || []).some(t => t.toLowerCase().includes(_search))
    );
  }

  // Sort: starred first, then by date
  filtered.sort((a, b) => (b.starred?1:0) - (a.starred?1:0) || new Date(b.updatedAt) - new Date(a.updatedAt));

  if (!filtered.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
      <div style="font-size:48px;opacity:0.2;margin-bottom:16px;">📝</div>
      <h3 style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:400;color:var(--text);">No notes found</h3>
      <p style="font-size:13.5px;color:var(--text3);margin-top:8px;">${_filter==='all' && !_search ? 'Click "New Note" to create your first note.' : 'Try a different filter or search.'}</p>
    </div>`;
  } else {
    grid.innerHTML = filtered.map(note => _noteCard(note)).join('');
    grid.querySelectorAll('.note-card').forEach(el => {
      el.addEventListener('click', () => _openModal(el.dataset.id));
    });
  }

  // Update stats
  const setText = (id, v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
  setText('ns-total',    _notes.length);
  setText('ns-starred',  _notes.filter(n => n.starred).length);
  setText('ns-subjects', new Set(_notes.map(n => n.subject)).size);
}

function _noteCard(note) {
  const color   = SUBJ_COLORS[note.subject] || 'var(--primary)';
  const preview = note.content.slice(0, 180).replace(/[#*_`]/g,'');
  const dateStr = formatDate(new Date(note.updatedAt));
  return `<div class="target-card note-card" data-id="${note.id}" style="cursor:pointer;">
    <div style="height:4px;background:${color};border-radius:var(--radius) var(--radius) 0 0;"></div>
    <div style="padding:18px 20px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;">
        <span style="font-size:11px;font-weight:600;color:${color};background:${color}22;padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">${note.subject}</span>
        ${note.starred ? '<span style="font-size:16px;">⭐</span>' : ''}
      </div>
      <h4 style="font-size:16px;font-weight:500;color:var(--text);margin-bottom:8px;line-height:1.3;">${note.title || 'Untitled'}</h4>
      <p style="font-size:13px;color:var(--text3);line-height:1.6;margin-bottom:12px;">${preview}${note.content.length > 180 ? '…' : ''}</p>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;flex-wrap:wrap;gap:5px;">
          ${(note.tags||[]).slice(0,3).map(t => `<span style="font-size:10px;background:var(--bg);border:1px solid var(--border);border-radius:20px;padding:2px 8px;color:var(--text3);">#${t}</span>`).join('')}
        </div>
        <span style="font-size:11px;color:var(--text3);">${dateStr}</span>
      </div>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════
   MODAL
   ══════════════════════════════════════════════════════════ */
function _openModal(id = null) {
  _editId = id;
  const modal      = document.getElementById('noteModal');
  const titleEl    = document.getElementById('noteModalTitle');
  const deleteBtn  = document.getElementById('nm-delete');
  const starBtn    = document.getElementById('nm-star');

  if (id) {
    const note = _notes.find(n => n.id === id);
    if (!note) return;
    titleEl.textContent                           = 'Edit Note';
    document.getElementById('nm-title').value    = note.title || '';
    document.getElementById('nm-subject').value  = note.subject || 'Physics';
    document.getElementById('nm-content').value  = note.content || '';
    document.getElementById('nm-tags').value     = (note.tags || []).join(', ');
    starBtn.textContent = note.starred ? '⭐' : '☆';
    deleteBtn.style.display = 'inline-flex';
  } else {
    titleEl.textContent                           = 'New Note';
    document.getElementById('nm-title').value    = '';
    document.getElementById('nm-content').value  = '';
    document.getElementById('nm-tags').value     = '';
    starBtn.textContent = '☆';
    deleteBtn.style.display = 'none';
  }
  document.getElementById('nm-error').classList.remove('show');
  modal.classList.add('open');
}

function _saveNote() {
  const title   = document.getElementById('nm-title').value.trim();
  const subject = document.getElementById('nm-subject').value;
  const content = document.getElementById('nm-content').value.trim();
  const tagsRaw = document.getElementById('nm-tags').value;
  const starred = document.getElementById('nm-star').textContent === '⭐';
  const errEl   = document.getElementById('nm-error');

  if (!title) { errEl.textContent = 'Title is required.'; errEl.classList.add('show'); return; }
  errEl.classList.remove('show');

  const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
  const now  = new Date().toISOString();

  if (_editId) {
    const idx = _notes.findIndex(n => n.id === _editId);
    if (idx > -1) _notes[idx] = { ..._notes[idx], title, subject, content, tags, starred, updatedAt: now };
  } else {
    _notes.unshift({ id: genId(), title, subject, content, tags, starred, createdAt: now, updatedAt: now });
  }

  LS.set('sf_notes', _notes);
  document.getElementById('noteModal').classList.remove('open');
  _renderNotes();
  showToast(_editId ? '✅ Note updated!' : '✅ Note saved!');
}

function _deleteNote() {
  if (!_editId) return;
  if (!confirm('Delete this note?')) return;
  _notes = _notes.filter(n => n.id !== _editId);
  LS.set('sf_notes', _notes);
  document.getElementById('noteModal').classList.remove('open');
  _renderNotes();
  showToast('🗑 Note deleted.');
}
