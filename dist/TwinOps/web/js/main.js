/* ============================================================
   InfraVerse — platform launcher and window manager
   ============================================================ */
import { REGISTRY } from './core/registry.js';
import { PREVIEWS } from './core/previews.js';
import { storage, loadGlobal, saveGlobal } from './core/storage.js';
import * as ui from './core/ui.js';

const { el, icon, button, badge, modal, toast, confirmDialog } = ui;

/* ---------------- Project credits ---------------- */
const PROJECT_CREDITS = [
  {
    id: 'water', group: 'Group 1', facility: 'Smart Water Tank Monitoring Twin',
    members: [
      'GERMAN, EARL ZACHARRY P.',
      'GUILLENA, JASMINE L.',
      'LLEGO, MAURIZZ JULIENNE B.',
      'MORENO, REXXAIRE JUSTIN',
      'ROBIS, BRENT KRISTIAN L.',
      'VELOSO, ELLA PATRISHA M.',
    ],
  },
  {
    id: 'conveyor', group: 'Group 3', facility: 'Conveyor Belt Sorting Line Twin',
    members: [
      'ALVERO, BOBBY D.',
      'GUNDA, MICHAELO ANGELO A.',
      'GUNDA, PHILIP JUSTINE',
      'SANTOS, VANNAH MAIE R.',
      'ECHIGORIN',
    ],
  },
  {
    id: 'parking', group: 'Group 4', facility: 'Smart Parking Lot Twin',
    members: [
      'AUCILLA, CRISELDA VHIE O.',
      'BARDILLON, LUIGI R.',
      'CABAJA-AN, JOHN LAURENCE M.',
      'COMANDAO, SHEILA MAE B.',
      'LACAMBRA, ALFONSE C.',
      'MAGSANAY, CHRISTIAN A.',
    ],
  },
  {
    id: 'solar', group: 'Group 5', facility: 'Solar Panel and Battery System Twin',
    members: [
      'ARTOZA, DRAIZEN JOHN B.',
      'CALVO, CHEROSE ANGELA C.',
      'CANONCE, BEVERLY F.',
      'ESPERAS, JOHN JAKE B.',
      'MARCELLANO, JANE C.',
      'URSABIA, APRIL N.',
    ],
  },
  {
    id: 'cold', group: 'Group 6', facility: 'Cold Storage Room Twin',
    members: [
      'CAALIM, ARRIANE MAE',
      'MORILES, RAYMUND CARL R.',
      'PRISNO, WYNE C.',
      'RAFALES, CAREN A.',
    ],
  },
];

class InfraVerseApp {
  constructor() {
    this.root = document.getElementById('app');
    this.current = null;
    this.currentMeta = null;
    this.global = loadGlobal();
    this.loading = null;
    this.menuBuilt = false;
    this._clockTimer = null;
    this._importInput = null;
    this._applyTheme(this.global.theme || 'dark');
    if (this.global.reduceMotion) document.documentElement.style.setProperty('--reduce-motion', '1');
    this._bindGlobal();
  }

  init() {
    this.showMenu();
    this._restartClock();
    this.bootDone();
    this._handleNativeMessages();
    // TWIN OPS deployment bridge: when the game (or the simulator launch
    // arguments) requests a facility, open its Digital Twin control room.
    let launchOpen = null;
    try { launchOpen = window.__IDT_LAUNCH_ARGS__?.open || null; } catch { /* ignore */ }
    if (!launchOpen) {
      try { launchOpen = new URLSearchParams(window.location.search).get('open'); } catch { /* ignore */ }
    }
    if (launchOpen && REGISTRY.some(r => r.id === launchOpen)) {
      setTimeout(() => this.openInfrastructure(launchOpen), 400);
    }
  }

  bootDone() {
    const boot = document.getElementById('boot-screen');
    const status = document.getElementById('boot-status');
    if (status) status.textContent = 'Platform ready · local runtime active';
    setTimeout(() => boot?.classList.add('done'), 280);
  }

  _bindGlobal() {
    window.addEventListener('error', (e) => {
      console.error(e.error || e.message);
      if (this.loading) this.loading.classList.add('done');
      toast(String(e.message || 'Unexpected application error'), { type: 'danger', title: 'Application Error', duration: 7000 });
    });
    window.addEventListener('unhandledrejection', (e) => {
      console.error(e.reason);
      toast(String(e.reason?.message || e.reason || 'Unexpected error'), { type: 'danger', title: 'Application Error', duration: 7000 });
    });
    window.addEventListener('beforeunload', () => {
      try { this.current?.saveConfig?.(false); this.current?.destroy?.(); } catch { /* ignore */ }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.current && document.activeElement?.tagName !== 'INPUT') {
        if (document.querySelector('.modal-backdrop')) return;
        if (this.current.selectedId) this.current.closeInspector();
      }
    });
  }

  _handleNativeMessages() {
    if (!(window.chrome && window.chrome.webview)) return;
    try {
      window.chrome.webview.addEventListener('message', (ev) => {
        const msg = ev.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.channel === 'idt-storage-response' && !msg.ok) {
          console.warn('Storage bridge error', msg.error);
        }
        if (msg.channel === 'idt-app-response' && msg.action === 'close') {
          // host is closing
        }
      });
    } catch { /* ignore */ }
  }

  native(action, payload = {}) {
    try {
      if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage({ channel: 'idt-app', action, ...payload });
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }

  _applyTheme(theme) {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
  }

  _restartClock() {
    clearInterval(this._clockTimer);
    const update = () => {
      const now = new Date();
      const wall = document.getElementById('menu-wallclock');
      const day = document.getElementById('menu-day');
      if (wall) wall.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
      if (day) day.textContent = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    };
    update();
    this._clockTimer = setInterval(update, 1000);
  }

  /* ---------------- Main menu ---------------- */
  showMenu() {
    clearInterval(this._menuTicker);
    const global = this.global;
    const totalSensors = REGISTRY.reduce((a, r) => a + r.sensors, 0);
    const totalEquip = REGISTRY.reduce((a, r) => a + r.equipment, 0);
    const shell = el('div', { class: 'menu-screen', id: 'menu-screen' });
    const header = el('header', { class: 'menu-header' });
    const brand = el('div', { class: 'brand' });
    const mark = el('div', { class: 'brand-mark' });
    mark.appendChild(icon('logo', 23));
    brand.append(mark, el('div', {}, el('div', { class: 'brand-name' }, 'InfraVerse', el('span', { text: ' /' })), el('div', { class: 'brand-sub', text: 'Industrial Digital Twin Platform' })));
    const headerActions = el('div', { class: 'header-actions' });
    const online = el('div', { class: 'header-status' }, ui.statusDot('live'), 'PLATFORM ONLINE');
    const settingsBtn = button('Settings', { variant: 'ghost', iconName: 'settings', onClick: () => this.openSettings() });
    const aboutBtn = button('About', { variant: 'ghost', iconName: 'info', onClick: () => this.openAbout() });
    const exitBtn = button('Exit', { variant: 'ghost', iconName: 'exit', onClick: () => this.requestExit() });
    headerActions.append(online, el('div', { class: 'header-divider' }), settingsBtn, aboutBtn, exitBtn);
    header.append(brand, headerActions);

    const main = el('main', { class: 'menu-main' });
    const inner = el('div', { class: 'menu-inner' });
    const hero = el('section', { class: 'menu-hero' });
    const heroCopy = el('div', { class: 'hero-copy' });
    heroCopy.append(
      el('div', { class: 'eyebrow' }, 'INDUSTRIAL DIGITAL TWIN · CONTROL PLATFORM'),
      el('h1', { class: 'hero-title' }, 'Five facilities. ', el('span', { class: 'thin', text: 'One integrated ' }), el('span', { class: 'grad', text: 'operating twin.' })),
      el('p', { class: 'hero-desc', text: 'Inspect, operate and optimise connected infrastructure in real time. Each of the five facilities runs its own simulation engine and control room, and the Integrated Use-Case Scenario couples all five into a single operating site — entirely on this machine.' }),
    );
    const stats = el('div', { class: 'hero-stats' });
    const stat = (val, label, tone = 'live') => el('div', { class: 'hero-stat' }, ui.statusDot(tone), el('b', { text: val }), el('span', { text: label }));
    stats.append(stat('06', 'APPLICATIONS'), stat(String(totalSensors), 'SENSORS'), stat(String(totalEquip), 'EQUIPMENT'), stat('100%', 'OFFLINE READY'));
    heroCopy.appendChild(stats);
    hero.appendChild(heroCopy);

    const overview = el('aside', { class: 'overview-card' });
    const oh = el('div', { class: 'overview-head' }, el('div', {}, el('div', { class: 'overview-title', text: 'System Overview' }), el('div', { class: 'overview-sub', text: 'Unified platform telemetry' })), badge('NOMINAL', 'ok'));
    const health = el('div', { class: 'health-ring-wrap' });
    const ring = ui.progressRing(100, 62);
    const healthCopy = el('div', { class: 'health-copy' }, el('b', { text: 'All systems operational' }), el('span', { text: '6 simulation engines ready · local runtime' }));
    health.append(ring, healthCopy);
    const list = el('div', { class: 'overview-list' });
    REGISTRY.forEach(r => {
      const row = el('div', { class: 'overview-row' }, ui.statusDot('live'), r.name, el('span', { class: 'num', text: `${String(r.sensors).padStart(2, '0')} SEN` }));
      list.appendChild(row);
    });
    const actions = el('div', { class: 'overview-actions' },
      button('Settings', { size: 'small', iconName: 'sliders', onClick: () => this.openSettings() }),
      button('About', { size: 'small', iconName: 'info', onClick: () => this.openAbout() }));
    overview.append(oh, health, list, actions);
    hero.appendChild(overview);

    const heading = el('div', { class: 'section-heading' });
    heading.append(
      el('div', {}, el('h2', { text: 'Infrastructure Modules' }), el('div', { class: 'sub', text: 'Select an application to enter its dedicated control environment' })),
      el('div', { class: 'side' }, ui.statusDot('live'), `${String(REGISTRY.length).padStart(2, '0')} ONLINE`, el('span', { text: '·' }), 'LOCAL RUNTIME'),
    );
    const grid = el('div', { class: 'facility-grid' });
    REGISTRY.forEach((r, idx) => grid.appendChild(this._facilityCard(r, idx)));

    inner.append(hero, heading, grid, this._platformBar());
    main.appendChild(inner);
    const footer = el('footer', { class: 'menu-footer' });
    const wall = el('span', { text: '--:--:--', class: 'mono', id: 'menu-wallclock' });
    const day = el('span', { text: '—', id: 'menu-day' });
    footer.append(
      el('span', {}, 'InfraVerse DIGITAL TWIN '), el('span', { class: 'sep' }),
      el('span', {}, 'BUILD 2026.11.16'), el('span', { class: 'sep' }),
      el('span', { class: 'right' }, el('span', {}, 'LOCAL TIME ', wall), el('span', {}, day),
        el('span', { class: 'sep' }), el('span', {}, 'v1.0.0')),
    );

    shell.append(header, main, footer);
    ui.mount(this.root, shell);
    this.menuBuilt = true;
    this._restartClock();
    this.root.classList.remove('hidden');
  }

  _facilityCard(r, idx) {
    const card = el('article', {
      class: 'facility-card',
      style: { '--preview-accent': r.accent, '--preview-accent-rgb': r.accentRgb },
      tabindex: '0',
      role: 'button',
      'aria-label': `Open ${r.name}`,
    });
    card.addEventListener('click', (e) => { if (!e.target.closest('button')) this.openInfrastructure(r.id); });
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openInfrastructure(r.id); } });
    if (r.integrated) card.classList.add('integrated');
    const preview = el('div', { class: 'card-preview', html: PREVIEWS[r.preview] || '' });
    const topline = el('div', { class: 'card-topline' },
      el('span', { class: 'card-index', text: `${String(idx + 1).padStart(2, '0')} / ${r.code}` }),
      r.integrated ? badge('INTEGRATED', 'info') : badge('ONLINE', 'ok'));
    topline.lastChild.classList.add('card-status');
    preview.appendChild(topline);
    const body = el('div', { class: 'card-body' });
    body.append(
      el('div', { class: 'card-kicker', text: r.kicker }),
      el('h3', { class: 'card-title', text: r.name }),
      el('p', { class: 'card-desc', text: r.description }),
    );
    const foot = el('div', { class: 'card-foot' });
    foot.append(
      el('div', { class: 'card-sensors' }, el('b', { text: String(r.sensors).padStart(2, '0') }), el('span', { text: 'Sensors' })),
      el('div', { class: 'card-sensors' }, el('b', { text: String(r.equipment).padStart(2, '0') }), el('span', { text: 'Equipment' })),
    );
    const openBtn = button(r.integrated ? 'Open Scenario' : 'Open Application', {
      variant: 'subtle', size: 'small', iconName: 'menuArrow',
      onClick: (e) => { e.stopPropagation(); this.openInfrastructure(r.id); },
    });
    openBtn.classList.add('card-open');
    foot.appendChild(openBtn);
    body.appendChild(foot);
    card.append(preview, body);
    return card;
  }

  _platformBar() {
    const bar = el('div', { class: 'platform-bar' });
    const left = el('div', { class: 'platform-bar-left' });
    const mark = el('div', { class: 'platform-bar-mark' });
    mark.appendChild(icon('layers', 16));
    left.append(
      mark,
      el('div', {},
        el('div', { class: 'platform-bar-title', text: 'Platform Services' }),
        el('div', { class: 'platform-bar-sub', text: 'Renderer · simulation runtimes · local persistence · diagnostics' })),
    );
    const chips = el('div', { class: 'platform-bar-chips' });
    const chip = (label, value, tone = 'live') => el('div', { class: 'platform-chip' }, ui.statusDot(tone), el('span', { text: label }), el('b', { text: value }));
    chips.append(
      chip('3D Renderer', 'WEBGL 2'),
      chip('Persistence', 'LOCAL JSON'),
      chip('Runtime', storage.native ? 'NATIVE HOST' : 'BROWSER'),
      chip('Network', 'NOT REQUIRED', 'warn'),
    );
    const actions = el('div', { class: 'platform-bar-actions' });
    actions.append(
      button('Settings', { size: 'small', iconName: 'sliders', onClick: () => this.openSettings() }),
      button('About & Credits', { size: 'small', iconName: 'info', onClick: () => this.openAbout() }),
      button('Exit', { size: 'small', variant: 'ghost', iconName: 'exit', onClick: () => this.requestExit() }),
    );
    bar.append(left, chips, actions);
    return bar;
  }

  /* ---------------- Infrastructure lifecycle ---------------- */
  async openInfrastructure(id) {
    if (this.current?.meta?.id === id) return;
    const meta = REGISTRY.find(r => r.id === id);
    if (!meta) return;

    this.showLoading(meta);
    try {
      if (this.current) { this.current._skipSave = true; this._destroyCurrent(); }
      const mod = await meta.loader();
      const Cls = mod.default;
      if (!Cls) throw new Error(`Module ${id} failed to load.`);
      this.currentMeta = meta;
      const instance = new Cls(this);
      this.current = instance;
      await instance.mount();

      this.hideLoading();
      saveGlobal({ lastInfra: id });
    } catch (err) {
      console.error(err);
      this.hideLoading(true);
      toast(`Unable to open ${meta.name}: ${err.message || err}`, { type: 'danger', title: 'Facility unavailable', duration: 8000 });
      this.showMenu();
    }
  }

  _destroyCurrent() {
    try { this.current?.destroy?.(); } catch (err) { console.error('destroy failed', err); }
    this.current = null;
    this.currentMeta = null;
  }

  closeInfrastructure() {
    if (this.current) {
      try { this.current.saveConfig?.(false); } catch { /* ignore */ }
      this._destroyCurrent();
    }
    ui.mount(this.root, '');
    this.showMenu();
  }

  reopenCurrent({ keepConfig = true } = {}) {
    const id = this.current?.meta?.id || this.currentMeta?.id;
    if (!id) return;
    if (keepConfig) { try { this.current.saveConfig?.(false); } catch { /* ignore */ } }
    else if (this.current) this.current._skipSave = true;
    this._destroyCurrent();
    this.openInfrastructure(id);
  }

  showLoading(meta) {
    this.hideLoading();
    const overlay = el('div', { class: 'loading-overlay' });
    overlay.append(
      el('div', { class: 'loader-ring' }),
      el('div', { class: 'loading-title', text: meta.name }),
      el('div', { class: 'loading-sub', text: 'Loading simulation engine · building 3D environment' }),
    );
    document.body.appendChild(overlay);
    requestAnimationFrame(() => setTimeout(() => overlay.classList.add('done'), 2500));
    this.loading = overlay;
    setTimeout(() => { if (this.loading === overlay) { overlay.classList.add('done'); } }, 12000);
  }

  hideLoading(fail = false) {
    if (!this.loading) return;
    const overlay = this.loading;
    this.loading = null;
    if (fail) overlay.remove();
    else { overlay.classList.add('done'); setTimeout(() => overlay.remove(), 400); }
  }

  /* ---------------- Global settings / about ---------------- */
  openSettings() {
    const g = { ...this.global };
    const body = el('div', { class: 'control-list' });
    body.appendChild(ui.notice('Platform preferences are stored locally and retained after restart.'));
    const themeWrap = el('div', { class: 'field' });
    themeWrap.append(el('label', { text: 'Interface theme' }), ui.segmented([{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }], g.theme, v => { g.theme = v; this._applyTheme(v); }));
    body.appendChild(themeWrap);
    body.appendChild(ui.toggle({ label: 'Reduce interface motion', description: 'Minimise animated transitions and background effects.', value: g.reduceMotion, onChange: v => { g.reduceMotion = v; } }));
    body.appendChild(ui.toggle({ label: 'Audible alarm notifications', description: 'Play a short alert tone when a critical alarm is raised.', value: g.alarmSound, onChange: v => { g.alarmSound = v; } }));
    body.appendChild(el('div', { class: 'divider' }));
    const storageSize = (storage.usage() / 1024).toFixed(1);
    body.append(
      el('div', { class: 'section-title', text: 'Local Data' }),
      el('div', { class: 'kv-list' },
        ui.kvRow('Storage engine', storage.native ? 'Native JSON files' : 'Browser localStorage'),
        ui.kvRow('Saved profiles', String(storage.keys().length)),
        ui.kvRow('Local data size', `${storageSize} KB`),
        ui.kvRow('Data location', storage.native ? '%LOCALAPPDATA%\\IndustrialDigitalTwinSimulator\\config' : 'This browser profile', { text: true }),
      ),
    );
    const dataBtns = el('div', { class: 'btn-row', style: { marginTop: '10px' } });
    dataBtns.append(
      button('Export Configuration', { size: 'small', iconName: 'download', onClick: () => { ui.downloadJSON(`nexus-config-${new Date().toISOString().slice(0, 10)}.json`, storage.exportAll()); toast('Configuration exported.', { type: 'ok' }); } }),
      button('Import Configuration', { size: 'small', iconName: 'upload', onClick: () => this._importConfig() }),
      button('Reset All Data', { size: 'small', variant: 'danger', iconName: 'trash', onClick: async () => {
        const ok = await confirmDialog({ title: 'Reset all local data?', message: 'All facility configurations, calibration values, visibility settings and history will be erased. This cannot be undone.', confirmLabel: 'Erase All Data', danger: true });
        if (!ok) return;
        storage.resetAll();
        toast('Local data cleared. Reloading platform…', { type: 'warn' });
        setTimeout(() => location.reload(), 900);
      } }),
    );
    body.appendChild(dataBtns);
    body.appendChild(el('div', { class: 'divider' }));
    body.appendChild(el('div', { class: 'section-title', text: 'Runtime' }));
    body.appendChild(el('div', { class: 'kv-list' },
      ui.kvRow('Application', 'InfraVerse Digital Twin Simulator'),
      ui.kvRow('Version', '1.0.0 (build 2026.11.16)'),
      ui.kvRow('Host', storage.native ? 'Windows WebView2 host' : 'Web development runtime'),
      ui.kvRow('Offline mode', 'Always available', { text: true }),
    ));
    const save = button('Apply & Close', { variant: 'primary', onClick: () => {
      this.global = saveGlobal({ theme: g.theme, reduceMotion: g.reduceMotion, alarmSound: g.alarmSound });
      this._applyTheme(g.theme);
      document.documentElement.classList.toggle('reduce-motion', !!g.reduceMotion);
      m.close();
      toast('Platform settings saved.', { type: 'ok' });
    } });
    const cancel = button('Cancel', { onClick: () => m.close() });
    const m = modal({ title: 'Platform Settings', subtitle: 'Global preferences · InfraVerse core', body, footer: [cancel, save], size: 'large', onClose: () => { this._applyTheme(this.global.theme); } });
  }

  async _importConfig() {
    const file = await ui.pickFile('.json,application/json');
    if (!file) return;
    try {
      const data = JSON.parse(file.text);
      const count = storage.importAll(data);
      toast(`${count} configuration profiles imported. Reloading…`, { type: 'ok' });
      setTimeout(() => location.reload(), 1100);
    } catch (err) {
      toast(`Import failed: ${err.message}`, { type: 'danger', title: 'Invalid configuration' });
    }
  }

  openAbout() {
    const body = el('div', {});
    const hero = el('div', { class: 'about-hero' });
    const mark = el('div', { class: 'mark' });
    mark.appendChild(icon('logo', 30));
    hero.append(mark, el('div', {}, el('h2', { text: 'InfraVerse' }), el('span', { text: 'Industrial Digital Twin Simulator' })));
    body.appendChild(hero);
    body.append(
      el('p', { class: 'about-p', text: 'A compact, offline-first industrial digital twin platform. Five independently simulated facilities share a unified control experience, interactive 3D environments and local data persistence — plus an integrated use-case scenario that couples all five into one operating site.' }),
      el('div', { class: 'kv-list' },
        ui.kvRow('Version', '2.2.8'),
        ui.kvRow('Build', '2026.11.16'),
        ui.kvRow('Rendering', 'WebGL 2 · Three.js r170'),
        ui.kvRow('Runtime', storage.native ? 'Windows WebView2' : 'Browser (development)'),
        ui.kvRow('Simulation', '6 independent engines'),
        ui.kvRow('Contributors', `${PROJECT_CREDITS.reduce((a, c) => a + c.members.length, 0)} members · ${PROJECT_CREDITS.length} groups`, { text: true }),
        ui.kvRow('Data', 'Local structured JSON'),
        ui.kvRow('Network', 'Not required', { text: true }),
      ),
      el('div', { class: 'divider' }),
      el('div', { class: 'section-title', text: 'Third-Party Components' }),
    );
    const lic = el('div', { class: 'license-list' });
    [
      ['Three.js r170', 'MIT License'],
      ['WebView2 SDK', 'Microsoft Software License'],
      ['.NET Framework 4.8', 'Microsoft .NET Library License'],
      ['UI, models & shaders', 'Original procedural work'],
    ].forEach(([name, license]) => lic.appendChild(el('div', { class: 'license-item' }, el('span', { text: name }), license)));
    body.appendChild(lic);
    body.appendChild(el('div', { class: 'divider' }));

    /* ---------------- Project credits ---------------- */
    const creditsHead = el('div', { class: 'section-title' }, 'Project Credits');
    creditsHead.appendChild(el('span', { class: 'side', text: `${PROJECT_CREDITS.reduce((a, c) => a + c.members.length, 0)} MEMBERS` }));
    body.appendChild(creditsHead);
    body.appendChild(el('p', { class: 'about-p', text: 'The five infrastructure twins were developed by five student groups. The Integrated Use-Case Scenario is a platform-level application that couples all five twins into a single operating site.' }));

    const creditsGrid = el('div', { class: 'credits-grid' });
    for (const credit of PROJECT_CREDITS) {
      const card = el('div', { class: 'credit-card' });
      const head = el('div', { class: 'credit-head' });
      head.append(
        el('span', { class: 'credit-group', text: credit.group }),
        el('span', { class: 'credit-count', text: `${credit.members.length} members` }),
      );
      card.appendChild(head);
      card.appendChild(el('div', { class: 'credit-facility', text: credit.facility }));
      const ul = el('ol', { class: 'credit-list' });
      credit.members.forEach(name => ul.appendChild(el('li', { text: name })));
      card.appendChild(ul);
      const foot = el('div', { class: 'credit-foot' });
      foot.appendChild(button('Open twin', {
        size: 'small', variant: 'subtle', iconName: 'menuArrow',
        onClick: () => { m.close(); this.openInfrastructure(credit.id); },
      }));
      card.appendChild(foot);
      creditsGrid.appendChild(card);
    }
    body.appendChild(creditsGrid);
    body.appendChild(el('div', { class: 'divider' }));
    body.appendChild(el('p', { class: 'about-p', text: 'All operational sensor readings, equipment states and environmental values are generated by the on-device simulation engines. No external services, accounts, API keys or network connections are used during operation.' }));
    const close = button('Close', { variant: 'primary', onClick: () => m.close() });
    const settings = button('Platform Settings', { iconName: 'sliders', onClick: () => { m.close(); this.openSettings(); } });
    const m = modal({ title: 'About InfraVerse', subtitle: 'Platform information, credits & licensing', body, footer: [settings, close], size: 'large' });
  }

  requestExit() {
    if (this.current) {
      confirmDialog({ title: 'Exit InfraVerse?', message: 'Current facility configuration will be saved. The application will close.', confirmLabel: 'Save & Exit' }).then(ok => {
        if (!ok) return;
        this.current?.saveConfig?.(false);
        this._doExit();
      });
    } else this._doExit();
  }

  _doExit() {
    if (this.native('close')) {
      toast('Closing application…', { type: 'info', duration: 1200 });
      return;
    }
    const body = el('div', {}, el('p', { class: 'about-p', text: 'InfraVerse is running in a browser preview. Close this tab or window to exit the platform. In the packaged Windows application, this button shuts down the native host.' }));
    const m = modal({ title: 'Exit Application', body, footer: [button('OK', { variant: 'primary', onClick: () => m.close() })] });
  }
}

/* Instantiate */
const app = new InfraVerseApp();
window.__INFRAVERSE_APP__ = app;
app.init();
