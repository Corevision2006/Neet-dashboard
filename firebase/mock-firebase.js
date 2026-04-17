/**
 * mock-firebase.js
 * Offline mock implementation to allow the app to run without Firebase credentials.
 */

const LS_KEY = 'sf_mock_fs';

function _load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } 
  catch (e) { return {}; }
}

function _save(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } 
  catch (e) {}
}

function _applyUpdate(existing, updates) {
  const r = Object.assign({}, existing);
  Object.keys(updates).forEach(k => {
    const v = updates[k];
    if (v && v._arrayUnion) r[k] = (r[k] || []).concat(v._arrayUnion.filter(x => (r[k] || []).indexOf(x) === -1));
    else if (v && v._arrayRemove) r[k] = (r[k] || []).filter(x => v._arrayRemove.indexOf(x) === -1);
    else if (v && v._increment !== undefined) r[k] = (r[k] || 0) + v._increment;
    else r[k] = v;
  });
  return r;
}

function _docRef(col, id) {
  return {
    id: id,
    get: () => Promise.resolve((() => {
      const s = _load(), d = (s[col] || {})[id];
      return { exists: d != null, id: id, data: () => d || null };
    })()),
    set: (data, opts) => Promise.resolve((() => {
      const s = _load(); s[col] = s[col] || {};
      s[col][id] = (opts && opts.merge && s[col][id]) ? _applyUpdate(s[col][id], data) : Object.assign({}, data);
      _save(s);
    })()),
    update: (data) => Promise.resolve((() => {
      const s = _load(); s[col] = s[col] || {};
      s[col][id] = _applyUpdate(s[col][id] || {}, data);
      _save(s);
    })()),
    delete: () => Promise.resolve((() => {
      const s = _load(); if (s[col]) delete s[col][id];
      _save(s);
    })())
  };
}

const _emptyQ = {
  get: () => Promise.resolve({ empty: true, docs: [], forEach: () => {} }),
  limit: () => _emptyQ, orderBy: () => _emptyQ, where: () => _emptyQ
};

function _collRef(name) {
  return {
    doc: (id) => _docRef(name, id || (Math.random().toString(36).slice(2))),
    add: (data) => {
      const id = Math.random().toString(36).slice(2);
      _docRef(name, id).set(data);
      return Promise.resolve({ id });
    },
    where: () => _emptyQ, orderBy: () => _emptyQ, limit: () => _emptyQ,
    get: () => {
      const s = _load();
      const docs = Object.keys(s[name] || {}).map(id => ({
        exists: true, id, data: () => s[name][id]
      }));
      return Promise.resolve({ empty: docs.length === 0, docs, forEach: (fn) => docs.forEach(fn) });
    }
  };
}

const mockDb = {
  collection: _collRef,
  enablePersistence: () => Promise.resolve(),
  batch: () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: () => Promise.resolve() })
};

const FieldValue = {
  serverTimestamp: () => new Date().toISOString(),
  arrayUnion: (...i) => ({ _arrayUnion: i }),
  arrayRemove: (...i) => ({ _arrayRemove: i }),
  increment: (n) => ({ _increment: n })
};

const Timestamp = {
  now: () => ({ seconds: Math.floor(Date.now() / 1000), toDate: () => new Date() })
};

const demoUser = {
  uid: 'demo-user-local',
  displayName: 'Demo Scholar',
  email: 'demo@studyflow.app',
  photoURL: null,
  updateProfile: (d) => { if (d && d.displayName) demoUser.displayName = d.displayName; return Promise.resolve(); }
};

let listeners = [];
const mockAuth = {
  currentUser: demoUser,
  onAuthStateChanged: (cb) => {
    listeners.push(cb);
    setTimeout(() => cb(demoUser), 0);
    return () => { listeners = listeners.filter(l => l !== cb); };
  },
  signInWithEmailAndPassword: (email) => {
    demoUser.email = email;
    demoUser.displayName = email.split('@')[0];
    listeners.forEach(l => l(demoUser));
    return Promise.resolve({ user: demoUser });
  },
  createUserWithEmailAndPassword: (email) => {
    demoUser.email = email;
    return Promise.resolve({ user: demoUser });
  },
  signInWithPopup: () => Promise.resolve({ user: demoUser }),
  signOut: () => {
    mockAuth.currentUser = null;
    listeners.forEach(l => l(null));
    return Promise.resolve();
  }
};

export { mockAuth, mockDb, FieldValue, Timestamp };
