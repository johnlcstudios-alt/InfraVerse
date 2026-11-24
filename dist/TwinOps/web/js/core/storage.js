/* Local persistence — structured JSON, mirrored to native files when
   running inside the Windows WebView2 host. Falls back to localStorage. */
const PREFIX = 'idt.';
const BOOT = (() => {
  const b = window.__IDT_BOOT_CONFIG__;
  if (!b || typeof b !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(b)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && (value.__json !== undefined)) {
      try { out[key] = JSON.parse(value.__json); } catch { /* ignore */ }
    } else out[key] = value;
  }
  return out;
})();

const native = typeof window.chrome !== 'undefined' && window.chrome.webview;
let reqId = 0;

function nativeWrite(key, value) {
  if (!native) return;
  try {
    window.chrome.webview.postMessage({
      channel: 'idt-storage', action: 'write', key,
      requestId: `req-${++reqId}`,
      json: JSON.stringify(value),
    });
  } catch (e) { console.warn('native storage write failed', e); }
}

function nativeRemove(key) {
  if (!native) return;
  try {
    window.chrome.webview.postMessage({ channel: 'idt-storage', action: 'remove', key, requestId: `req-${++reqId}` });
  } catch (e) { /* ignore */ }
}

export const storage = {
  native: !!native,
  boot: BOOT,
  get(key, fallback = null) {
    try {
      if (Object.prototype.hasOwnProperty.call(BOOT, key)) {
        const v = BOOT[key];
        return v ?? fallback;
      }
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { console.warn('localStorage full', e); }
    nativeWrite(key, value);
    return value;
  },
  remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
    nativeRemove(key);
  },
  keys() {
    const set = new Set(Object.keys(BOOT));
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) set.add(k.slice(PREFIX.length));
      }
    } catch { /* ignore */ }
    return [...set];
  },
  all() {
    const out = {};
    for (const key of this.keys()) out[key] = this.get(key, null);
    return out;
  },
  resetAll() {
    for (const key of this.keys()) this.remove(key);
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) localStorage.removeItem(k);
      }
    } catch { /* ignore */ }
  },
  usage() {
    let bytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) bytes += (k.length + (localStorage.getItem(k)?.length || 0)) * 2;
      }
    } catch { /* ignore */ }
    return bytes;
  },
  exportAll() {
    return {
      app: 'NEXUS Industrial Digital Twin Simulator',
      schema: 1,
      exportedAt: new Date().toISOString(),
      entries: this.all(),
    };
  },
  importAll(data) {
    if (!data || typeof data !== 'object') throw new Error('Invalid configuration document.');
    const entries = data.entries || (data.app ? {} : data);
    if (!entries || typeof entries !== 'object') throw new Error('No configuration entries found.');
    let count = 0;
    for (const [key, value] of Object.entries(entries)) {
      if (!/^[a-zA-Z0-9._-]+$/.test(key)) continue;
      if (key === 'app' || key === 'schema' || key === 'exportedAt') continue;
      if (value === null || typeof value !== 'object') continue;
      this.set(key, value);
      count++;
    }
    return count;
  },
};

export const GLOBAL_KEY = 'idt.global';

export function loadGlobal() {
  const def = { theme: 'dark', reduceMotion: false, alarmSound: true, panelWidth: 404, lastInfra: null, version: 1 };
  return { ...def, ...(storage.get(GLOBAL_KEY, {}) || {}) };
}
export function saveGlobal(patch) {
  const g = { ...loadGlobal(), ...patch };
  storage.set(GLOBAL_KEY, g);
  return g;
}
