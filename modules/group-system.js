/**
 * group-system.js
 * Create, join, and manage study groups via Firestore.
 *
 * Firestore schema:
 *  groups/{groupId}
 *    name, createdBy, createdAt, members[], inviteCode, description
 *
 * Usage:
 *  import { GroupSystem } from '../modules/group-system.js';
 *  GroupSystem.init(user);
 */

import { db, firebase, auth } from '../firebase/firebase-config.js';
import { LS, showToast, genId } from '../js/utils.js';

// Safe shims — work with both real Firebase and offline mock
const TS = (firebase && firebase.firestore && firebase.firestore.Timestamp)
  || { now: () => ({ seconds: Math.floor(Date.now()/1000), toDate: () => new Date() }) };

const FieldValue = (firebase && firebase.firestore && firebase.firestore.FieldValue)
  || {
    arrayUnion:  (...items) => ({ _arrayUnion: items }),
    arrayRemove: (...items) => ({ _arrayRemove: items }),
    serverTimestamp: () => new Date().toISOString()
  };

export const GroupSystem = {
  _user:    null,
  _groups:  [],
  _unsubscribers: [],

  /* ──────────────────────────────────────────────────────
     INIT — render the groups page and bind events
  ────────────────────────────────────────────────────── */
  async init(user) {
    this._user = user;
    this._render();
    await this._loadUserGroups();
    this._bindEvents();
  },

  /* ──────────────────────────────────────────────────────
     RENDER — inject HTML into #page-groups
  ────────────────────────────────────────────────────── */
  _render() {
    const page = document.getElementById('page-groups');
    if (!page) return;
    page.innerHTML = `
      <div class="targets-header">
        <div class="targets-header-left">
          <h2>Study <span style="color:var(--primary)">Groups</span></h2>
          <p>Collaborate, compete, and grow together</p>
        </div>
        <div style="display:flex;gap:10px;">
          <button class="btn-secondary" id="joinGroupBtn">🔗 Join Group</button>
          <button class="btn-primary"   id="createGroupBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create Group
          </button>
        </div>
      </div>

      <!-- Stats row -->
      <div class="target-stats-row" id="groupStatsRow">
        <div class="tstat"><div class="tstat-val" id="gs-mygroups">0</div><div class="tstat-label">My Groups</div></div>
        <div class="tstat"><div class="tstat-val" id="gs-members">0</div><div class="tstat-label">Total Members</div></div>
        <div class="tstat"><div class="tstat-val" id="gs-rank">—</div><div class="tstat-label">Your Rank (Top Group)</div></div>
        <div class="tstat"><div class="tstat-val" id="gs-hours">0h</div><div class="tstat-label">Group Study Hours</div></div>
      </div>

      <!-- My Groups grid -->
      <div id="groupsGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px;"></div>

      <!-- Create Group Modal -->
      <div class="modal-overlay" id="createGroupModal">
        <div class="modal" style="width:480px;padding:28px;">
          <h3 style="font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:400;margin-bottom:6px;">Create a Group</h3>
          <p style="font-size:13px;color:var(--text3);margin-bottom:24px;">Set up a study group and invite your friends.</p>
          <div class="ls-field">
            <label class="form-label">Group Name</label>
            <input class="ls-input" id="cg-name" placeholder="e.g. NEET 2026 Warriors" />
          </div>
          <div class="ls-field">
            <label class="form-label">Description</label>
            <input class="ls-input" id="cg-desc" placeholder="What's this group about?" />
          </div>
          <div class="ls-field">
            <label class="form-label">Max Members</label>
            <select class="ls-input" id="cg-max">
              <option value="5">5</option>
              <option value="10" selected>10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>
          <div id="cg-error" class="ls-error"></div>
          <div style="display:flex;gap:10px;margin-top:20px;">
            <button class="btn-secondary" style="flex:1;" id="cg-cancel">Cancel</button>
            <button class="btn-primary"   style="flex:2;" id="cg-submit">Create Group</button>
          </div>
        </div>
      </div>

      <!-- Join Group Modal -->
      <div class="modal-overlay" id="joinGroupModal">
        <div class="modal" style="width:420px;padding:28px;">
          <h3 style="font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:400;margin-bottom:6px;">Join a Group</h3>
          <p style="font-size:13px;color:var(--text3);margin-bottom:24px;">Enter the invite code shared by your group admin.</p>
          <div class="ls-field">
            <label class="form-label">Invite Code</label>
            <input class="ls-input" id="jg-code" placeholder="e.g. ABC12345" style="text-transform:uppercase;letter-spacing:2px;font-family:'DM Mono',monospace;" />
          </div>
          <div id="jg-error" class="ls-error"></div>
          <div style="display:flex;gap:10px;margin-top:20px;">
            <button class="btn-secondary" style="flex:1;" id="jg-cancel">Cancel</button>
            <button class="btn-primary"   style="flex:2;" id="jg-submit">Join Group</button>
          </div>
        </div>
      </div>

      <!-- Group Detail Modal -->
      <div class="modal-overlay" id="groupDetailModal">
        <div class="modal" style="width:560px;max-height:85vh;overflow-y:auto;">
          <div id="groupDetailContent" style="padding:28px;"></div>
        </div>
      </div>
    `;
  },

  /* ──────────────────────────────────────────────────────
     LOAD user's groups from Firestore
  ────────────────────────────────────────────────────── */
  async _loadUserGroups() {
    const uid = this._user.uid;
    try {
      const snap = await db.collection('groups')
        .where('members', 'array-contains', uid)
        .get();
      this._groups = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      this._renderGroups();
      this._renderStats();
    } catch (err) {
      console.warn('GroupSystem._loadUserGroups:', err);
      this._renderGroups();
    }
  },

  /* ──────────────────────────────────────────────────────
     RENDER groups grid
  ────────────────────────────────────────────────────── */
  _renderGroups() {
    const grid = document.getElementById('groupsGrid');
    if (!grid) return;
    if (!this._groups.length) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:280px;border:2px dashed var(--border);border-radius:var(--radius);text-align:center;padding:40px;cursor:pointer;" id="emptyGroupState">
          <div style="font-size:48px;opacity:0.2;margin-bottom:16px;">👥</div>
          <h3 style="font-family:'Cormorant Garamond',serif;font-size:24px;font-weight:400;color:var(--text);">No groups yet</h3>
          <p style="font-size:13.5px;color:var(--text3);margin-top:8px;max-width:320px;">Create a group to study with friends or join an existing one with an invite code.</p>
        </div>`;
      document.getElementById('emptyGroupState')?.addEventListener('click', () => this._openCreateModal());
      return;
    }
    grid.innerHTML = this._groups.map(g => this._groupCard(g)).join('');
    grid.querySelectorAll('.group-card').forEach(el => {
      el.addEventListener('click', () => this._openGroupDetail(el.dataset.id));
    });
  },

  _groupCard(group) {
    const memberCount  = (group.members || []).length;
    const maxMembers   = group.maxMembers || 10;
    const isAdmin      = group.createdBy === this._user.uid;
    const colors       = ['#3A7A6C','#E8C17A','#5AADCC','#D4886A','#7BAE9A'];
    const color        = colors[parseInt(group.id, 36) % colors.length];
    return `
      <div class="target-card group-card" data-id="${group.id}" style="cursor:pointer;">
        <div style="height:6px;background:${color};border-radius:var(--radius) var(--radius) 0 0;"></div>
        <div class="tc-top">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
            <div style="width:46px;height:46px;border-radius:12px;background:${color}22;display:flex;align-items:center;justify-content:center;font-size:22px;">👥</div>
            <div style="display:flex;gap:6px;">
              ${isAdmin ? '<span class="badge badge-accent">Admin</span>' : ''}
              <span class="badge badge-primary">${memberCount}/${maxMembers}</span>
            </div>
          </div>
          <div class="tc-name">${group.name}</div>
          <div class="tc-goal">${group.description || 'Study group'}</div>
        </div>
        <div class="tc-progress">
          <div class="tc-prog-header">
            <span class="tc-prog-label">Members</span>
            <span class="tc-prog-pct">${Math.round((memberCount/maxMembers)*100)}%</span>
          </div>
          <div class="tc-track"><div class="tc-fill" style="width:${Math.round((memberCount/maxMembers)*100)}%;background:${color};"></div></div>
        </div>
        <div class="tc-actions">
          <button class="tc-btn" onclick="event.stopPropagation();GroupSystem._copyInviteCode('${group.inviteCode}')">📋 Copy Invite</button>
          <button class="tc-btn" onclick="event.stopPropagation();GroupSystem._openGroupDetail('${group.id}')">View →</button>
        </div>
      </div>`;
  },

  /* ──────────────────────────────────────────────────────
     RENDER stats row
  ────────────────────────────────────────────────────── */
  async _renderStats() {
    const myGroups = this._groups.length;
    let totalMembers = 0, totalHours = 0;
    this._groups.forEach(g => { totalMembers += (g.members || []).length; });
    document.getElementById('gs-mygroups').textContent = myGroups;
    document.getElementById('gs-members').textContent  = totalMembers;
    // Fetch group hours from Firestore
    try {
      const uid = this._user.uid;
      const userDoc = await db.collection('users').doc(uid).get();
      const hours = userDoc.data()?.totalStudyHours || 0;
      document.getElementById('gs-hours').textContent = hours.toFixed(1) + 'h';
    } catch {}
  },

  /* ──────────────────────────────────────────────────────
     OPEN GROUP DETAIL — leaderboard + members
  ────────────────────────────────────────────────────── */
  async _openGroupDetail(groupId) {
    const group = this._groups.find(g => g.id === groupId);
    if (!group) return;
    const modal   = document.getElementById('groupDetailModal');
    const content = document.getElementById('groupDetailContent');
    content.innerHTML = `<div style="text-align:center;color:var(--text3);padding:40px;">Loading...</div>`;
    modal.classList.add('open');

    // Fetch member data
    const members = group.members || [];
    const memberDocs = await Promise.all(members.map(mid => db.collection('users').doc(mid).get().catch(()=>null)));
    const memberData = memberDocs
      .filter(d => d && d.exists)
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => (b.totalStudyHours||0) - (a.totalStudyHours||0));

    const rankEmoji = ['🥇','🥈','🥉'];
    const isAdmin = group.createdBy === this._user.uid;
    content.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
        <div>
          <h2 style="font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:400;">${group.name}</h2>
          <p style="font-size:13px;color:var(--text3);margin-top:4px;">${group.description || ''}</p>
        </div>
        <button onclick="document.getElementById('groupDetailModal').classList.remove('open')"
          style="background:none;border:1px solid var(--border);border-radius:8px;padding:6px 12px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;color:var(--text2);">✕ Close</button>
      </div>

      <div style="background:var(--bg);border-radius:12px;padding:14px 16px;margin-bottom:20px;display:flex;align-items:center;gap:10px;">
        <div style="font-size:13px;color:var(--text3);">Invite Code:</div>
        <div style="font-family:'DM Mono',monospace;font-size:15px;font-weight:500;color:var(--primary);letter-spacing:2px;">${group.inviteCode}</div>
        <button onclick="GroupSystem._copyInviteCode('${group.inviteCode}')"
          style="margin-left:auto;background:var(--primary-light);border:none;border-radius:8px;padding:5px 12px;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:12px;color:var(--primary);font-weight:500;">📋 Copy</button>
      </div>

      <h3 style="font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:400;margin-bottom:14px;">Leaderboard 🏆</h3>
      <div class="leaderboard-list">
        ${memberData.map((m, i) => `
          <div class="lb-item" style="${m.id===this._user.uid?'background:var(--primary-light);':''}">
            <div class="lb-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${rankEmoji[i]||i+1}</div>
            <div class="lb-avatar">${(m.name||'U').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}</div>
            <div class="lb-name">${m.name||'User'} ${m.id===this._user.uid?'<span style="font-size:11px;color:var(--primary);font-weight:600;">(You)</span>':''}</div>
            <div class="lb-hours">${(m.totalStudyHours||0).toFixed(1)}h</div>
          </div>`).join('')}
      </div>
      ${isAdmin ? `<button class="btn-secondary" style="width:100%;margin-top:20px;color:#C0392B;border-color:#E8A8A8;" onclick="GroupSystem._deleteGroup('${groupId}')">🗑 Delete Group</button>` : 
      `<button class="btn-secondary" style="width:100%;margin-top:20px;" onclick="GroupSystem._leaveGroup('${groupId}')">Leave Group</button>`}`;
  },

  /* ──────────────────────────────────────────────────────
     CREATE GROUP
  ────────────────────────────────────────────────────── */
  async _createGroup() {
    const name = document.getElementById('cg-name').value.trim();
    const desc = document.getElementById('cg-desc').value.trim();
    const max  = parseInt(document.getElementById('cg-max').value) || 10;
    const errEl= document.getElementById('cg-error');
    if (!name) { errEl.textContent = 'Group name is required.'; errEl.classList.add('show'); return; }
    errEl.classList.remove('show');

    const uid        = this._user.uid;
    const inviteCode = this._generateCode();
    const groupData  = {
      name, description: desc, maxMembers: max,
      createdBy:  uid,
      createdAt:  TS.now(),
      members:    [uid],
      inviteCode,
      totalStudyHours: 0
    };
    try {
      const ref = await db.collection('groups').add(groupData);
      await db.collection('users').doc(uid).update({
        groupIds: FieldValue.arrayUnion(ref.id)
      });
      document.getElementById('createGroupModal').classList.remove('open');
      showToast('✅ Group created! Share code: ' + inviteCode);
      await this._loadUserGroups();
    } catch (err) {
      errEl.textContent = 'Failed to create group. Please try again.';
      errEl.classList.add('show');
      console.error(err);
    }
  },

  /* ──────────────────────────────────────────────────────
     JOIN GROUP
  ────────────────────────────────────────────────────── */
  async _joinGroup() {
    const code  = document.getElementById('jg-code').value.trim().toUpperCase();
    const errEl = document.getElementById('jg-error');
    if (!code) { errEl.textContent = 'Enter an invite code.'; errEl.classList.add('show'); return; }
    errEl.classList.remove('show');

    try {
      const snap = await db.collection('groups').where('inviteCode', '==', code).get();
      if (snap.empty) { errEl.textContent = 'Invalid invite code.'; errEl.classList.add('show'); return; }
      const groupDoc = snap.docs[0];
      const group    = groupDoc.data();
      const uid      = this._user.uid;
      if (group.members.includes(uid)) { errEl.textContent = 'You are already in this group.'; errEl.classList.add('show'); return; }
      if ((group.members || []).length >= (group.maxMembers || 10)) { errEl.textContent = 'This group is full.'; errEl.classList.add('show'); return; }

      await groupDoc.ref.update({ members: FieldValue.arrayUnion(uid) });
      await db.collection('users').doc(uid).update({ groupIds: FieldValue.arrayUnion(groupDoc.id) });
      document.getElementById('joinGroupModal').classList.remove('open');
      showToast('🎉 Joined "' + group.name + '"!');
      await this._loadUserGroups();
    } catch (err) {
      errEl.textContent = 'Failed to join group.';
      errEl.classList.add('show');
      console.error(err);
    }
  },

  /* ──────────────────────────────────────────────────────
     LEAVE GROUP
  ────────────────────────────────────────────────────── */
  async _leaveGroup(groupId) {
    const uid = this._user.uid;
    if (!confirm('Are you sure you want to leave this group?')) return;
    try {
      await db.collection('groups').doc(groupId).update({ members: FieldValue.arrayRemove(uid) });
      await db.collection('users').doc(uid).update({ groupIds: FieldValue.arrayRemove(groupId) });
      document.getElementById('groupDetailModal').classList.remove('open');
      showToast('Left the group.');
      await this._loadUserGroups();
    } catch (err) { console.error(err); }
  },

  /* ──────────────────────────────────────────────────────
     DELETE GROUP (admin only)
  ────────────────────────────────────────────────────── */
  async _deleteGroup(groupId) {
    if (!confirm('Delete this group? This cannot be undone.')) return;
    try {
      const group = this._groups.find(g => g.id === groupId);
      await db.collection('groups').doc(groupId).delete();
      // Remove from all members
      await Promise.all((group?.members || []).map(mid =>
        db.collection('users').doc(mid).update({ groupIds: FieldValue.arrayRemove(groupId) })
      ));
      document.getElementById('groupDetailModal').classList.remove('open');
      showToast('Group deleted.');
      await this._loadUserGroups();
    } catch (err) { console.error(err); }
  },

  /* ── Helpers ──────────────────────────────────────────── */
  _generateCode() {
    return Math.random().toString(36).slice(2, 10).toUpperCase();
  },

  _copyInviteCode(code) {
    navigator.clipboard.writeText(code).then(() => showToast('📋 Invite code copied: ' + code));
  },

  _openCreateModal() { document.getElementById('createGroupModal').classList.add('open'); },

  /* ──────────────────────────────────────────────────────
     BIND EVENTS
  ────────────────────────────────────────────────────── */
  _bindEvents() {
    document.getElementById('createGroupBtn')?.addEventListener('click',  () => this._openCreateModal());
    document.getElementById('joinGroupBtn')?.addEventListener('click',    () => document.getElementById('joinGroupModal').classList.add('open'));
    document.getElementById('cg-cancel')?.addEventListener('click',       () => document.getElementById('createGroupModal').classList.remove('open'));
    document.getElementById('jg-cancel')?.addEventListener('click',       () => document.getElementById('joinGroupModal').classList.remove('open'));
    document.getElementById('cg-submit')?.addEventListener('click',       () => this._createGroup());
    document.getElementById('jg-submit')?.addEventListener('click',       () => this._joinGroup());
    // Close modals on overlay click
    ['createGroupModal','joinGroupModal','groupDetailModal'].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
    });
  }
};

// Expose for inline onclick handlers
window.GroupSystem = GroupSystem;
