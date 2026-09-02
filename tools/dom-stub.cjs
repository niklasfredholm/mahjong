/* A DOM small enough to run js/ui.js under Node, so the real click handlers,
   undo stack and persistence can be exercised without a browser. */
'use strict';

function makeClassList(el) {
  const set = new Set();
  return {
    add: (...c) => c.forEach(x => set.add(x)),
    remove: (...c) => c.forEach(x => set.delete(x)),
    contains: c => set.has(c),
    toggle: (c, on) => { const v = on === undefined ? !set.has(c) : !!on; v ? set.add(c) : set.delete(c); return v; },
    _set: set
  };
}

class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.attrs = {};
    this.listeners = {};
    this.classList = makeClassList(this);
    this._text = '';
    this.hidden = false;
    this.disabled = false;
    this.offsetWidth = 10;
    this.clientWidth = 412;
    this.clientHeight = 700;
  }
  set className(v) { this.classList._set.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => this.classList._set.add(c)); }
  get className() { return [...this.classList._set].join(' '); }
  set textContent(v) { this._text = String(v); if (v === '') this.children = []; }
  get textContent() { return this._text; }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html || ''; }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  click() { (this.listeners.click || []).forEach(fn => fn({})); }
  querySelector(sel) {
    const want = sel.replace('.', '');
    const walk = n => {
      for (const c of n.children) {
        if (c.classList.contains(want)) return c;
        const hit = walk(c); if (hit) return hit;
      }
      return null;
    };
    return walk(this);
  }
}

function install(html) {
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  const byId = {};
  ids.forEach(id => { byId[id] = new El('div'); byId[id].attrs.id = id; });
  // Match the markup: overlays start hidden.
  ['menu', 'win', 'stuck', 'rotate-hint'].forEach(id => { if (byId[id]) byId[id].hidden = true; });

  const timers = [];
  const store = new Map();

  const win = {
    document: {
      readyState: 'complete',
      hidden: false,
      getElementById: id => byId[id] || null,
      createElement: t => new El(t),
      addEventListener: () => {}
    },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    navigator: {},
    addEventListener: () => {},
    setTimeout: (fn, ms) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    setInterval: () => 0
  };
  win.window = win;
  return {
    win, byId, store,
    flush(limit = 200) {            // run queued animation/deferred callbacks
      let n = 0;
      while (timers.length && n++ < limit) timers.shift()();
    }
  };
}

module.exports = { install, El };
