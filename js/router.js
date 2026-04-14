/**
 * router.js
 * Lightweight SPA router for the dashboard shell.
 * Pages are <div class="page" id="page-{id}"> sections already in the DOM.
 * JS modules for each page are lazy-loaded on first visit.
 *
 * Usage:
 *   import { Router } from './router.js';
 *   const router = new Router({ defaultPage: 'dashboard' });
 *   router.navigate('schedule');
 */

export class Router {
  /**
   * @param {Object} config
   * @param {string} config.defaultPage
   * @param {Object} config.pageInitializers  — { pageId: () => Promise<void> }
   * @param {Function} config.onNavigate      — called after each navigation
   */
  constructor({ defaultPage = 'dashboard', pageInitializers = {}, onNavigate } = {}) {
    this.currentPage     = null;
    this.defaultPage     = defaultPage;
    this.initializers    = pageInitializers;
    this.onNavigate      = onNavigate;
    this.initialised     = new Set(); // track pages that have been init'd
  }

  /** Navigate to a page by id. Updates DOM, runs initialiser once. */
  async navigate(pageId, navEl = null) {
    const targetId = pageId || this.defaultPage;
    if (this.currentPage === targetId) return;

    // ── Hide all pages ──────────────────────────────────
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + targetId);
    if (!target) {
      console.warn(`Router: page #page-${targetId} not found`);
      return;
    }
    target.classList.add('active');
    this.currentPage = targetId;

    // ── Update sidebar active state ─────────────────────
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (navEl) navEl.classList.add('active');

    // ── Update topbar title ─────────────────────────────
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) {
      const map = this._titleMap();
      if (map[targetId]) {
        titleEl.innerHTML = map[targetId];
      }
    }

    // ── Lazy-init page module (once) ────────────────────
    if (!this.initialised.has(targetId) && this.initializers[targetId]) {
      try {
        await this.initializers[targetId]();
        this.initialised.add(targetId);
      } catch (err) {
        console.error(`Router: init error for page "${targetId}"`, err);
      }
    } else if (this.initialised.has(targetId) && this.initializers[`${targetId}:refresh`]) {
      // Optional per-visit refresh hook
      this.initializers[`${targetId}:refresh`]();
    }

    // ── Stagger card animations ─────────────────────────
    this._staggerCards(target);

    // ── Callback ────────────────────────────────────────
    if (this.onNavigate) this.onNavigate(targetId);
  }

  /** Expose navigate globally for inline onclick="navigate('x')" usage */
  exposeGlobal() {
    window.navigate = (pageId, el) => this.navigate(pageId, el);
    // Activate default page link in sidebar
    const defaultNav = document.querySelector(`[data-page="${this.defaultPage}"]`);
    if (defaultNav) defaultNav.classList.add('active');
    this.navigate(this.defaultPage);
  }

  _staggerCards(pageEl) {
    const cards = pageEl.querySelectorAll(
      '.stat-card,.card,.prog-kpi,.target-card,.tstat,.prog-card'
    );
    cards.forEach((c, i) => {
      c.style.opacity = '0';
      c.style.animation = 'none';
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          c.style.opacity   = '';
          c.style.animation = `cardEnter .5s cubic-bezier(.34,1.2,.64,1) ${i * 0.07}s both`;
        })
      );
    });
  }

  _titleMap() {
    return {
      dashboard: 'Good Morning, <span id="greetingName">Scholar</span> ✦',
      schedule:  'Study <span>Schedule</span>',
      targets:   'My <span>Targets</span>',
      progress:  'Progress <span>Tracker</span>',
      timer:     'Focus <span>Timer</span>',
      notes:     'My <span>Notes</span>',
      testlog:   'Test <span>Log</span>',
      profile:   'My <span>Profile</span>',
      settings:  '<span>Settings</span>',
      groups:    'Study <span>Groups</span>',
    };
  }
}
