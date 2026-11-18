/* ============================================================
   NEXUS UI — DOM helpers, icons, controls, charts, modals, toasts
   No third-party dependencies.
   ============================================================ */

/* ---------------- DOM ---------------- */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, val] of Object.entries(attrs)) {
      if (val === undefined || val === null || val === false) continue;
      if (key === 'class' || key === 'className') node.className = val;
      else if (key === 'html') node.innerHTML = val;
      else if (key === 'text') node.textContent = val;
      else if (key === 'style' && typeof val === 'object') Object.assign(node.style, val);
      else if (key === 'dataset') Object.assign(node.dataset, val);
      else if (key === 'onClick') node.addEventListener('click', val);
      else if (key === 'onInput') node.addEventListener('input', val);
      else if (key === 'onChange') node.addEventListener('change', val);
      else if (key === 'onPointerDown') node.addEventListener('pointerdown', val);
      else if (key === 'onBlur') node.addEventListener('blur', val);
      else if (key === 'onKeyDown') node.addEventListener('keydown', val);
      else if (key === 'value') node.value = val;
      else if (key === 'checked') node.checked = !!val;
      else if (key === 'disabled') node.disabled = !!val;
      else if (key === 'selected') node.selected = !!val;
      else node.setAttribute(key, val === true ? '' : val);
    }
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    if (child instanceof Node) { node.appendChild(child); continue; }
    const str = String(child);
    if (/^\s*<[\w!]/.test(str)) {
      const tpl = document.createElement('template');
      tpl.innerHTML = str;
      while (tpl.content.firstChild) node.appendChild(tpl.content.firstChild);
    } else {
      node.appendChild(document.createTextNode(str));
    }
  }
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
export function mount(parent, ...children) { clear(parent); append(parent, children); return parent; }
export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

/* ---------------- Icons (inline SVG, stroke style) ---------------- */
const ICON_PATHS = {
  logo: '<path d="M12 2 21 7v10l-9 5-9-5V7Z"/><path d="M8 16V9l8 6V9"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  cube: '<path d="m12 2 8.5 5v10L12 22l-8.5-5V7Z"/><path d="m3.5 7 8.5 5 8.5-5"/><path d="M12 12v10"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 14l4-4"/><circle cx="12" cy="18" r="1.5"/>',
  sliders: '<path d="M4 6h9"/><path d="M17 6h3"/><circle cx="15" cy="6" r="2"/><path d="M4 12h3"/><path d="M11 12h9"/><circle cx="9" cy="12" r="2"/><path d="M4 18h11"/><path d="M19 18h1"/><circle cx="17" cy="18" r="2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  alert: '<path d="M10.3 3.2 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><circle cx="12" cy="17" r=".6"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 8 10 8a18.6 18.6 0 0 1-2.2 3.2"/><path d="M6.6 6.6A18.3 18.3 0 0 0 2 12s3.5 8 10 8a10.7 10.7 0 0 0 5.4-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m2 2 20 20"/>',
  box: '<path d="m21 8-9 5-9-5 9-5 9 5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/><path d="m7 5.5 9 5"/>',
  inventory: '<path d="M3 9 12 3l9 6"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>',
  package: '<path d="m16.5 9.4-9-5.2"/><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/>',
  water: '<path d="M12 2.7s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 9.7 12 2.7 12 2.7Z"/><path d="M9 14.5a3 3 0 0 0 3 3"/>',
  tank: '<path d="M5 8h14"/><path d="M5 8v9a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8"/><path d="M5 8a7 3 0 0 1 14 0"/><path d="M5 13h14"/><path d="M8 17h8"/>',
  parking: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
  conveyor: '<path d="M3 8h18"/><circle cx="5" cy="15" r="3"/><circle cx="19" cy="15" r="3"/><path d="M7 8v4"/><path d="M17 8v4"/><rect x="8" y="4" width="8" height="4" rx="1"/>',
  cold: '<path d="M12 2v20"/><path d="m4.5 6.5 15 11"/><path d="m19.5 6.5-15 11"/><path d="M9 4.5 12 7l3-2.5"/><path d="M9 19.5 12 17l3 2.5"/><path d="m4.8 10.5 3.9-.3-.7-3.9"/><path d="m19.2 13.5-3.9.3.7 3.9"/>',
  solar: '<rect x="2" y="4" width="20" height="12" rx="1.5"/><path d="M2 9h20"/><path d="M8 4v12"/><path d="M16 4v12"/><path d="M12 16v5"/><path d="M8 21h8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/>',
  snowflake: '<path d="M12 2v20"/><path d="m4.2 6.5 15.6 11"/><path d="m19.8 6.5-15.6 11"/><path d="m9 4.5 3 2.5 3-2.5"/><path d="m9 19.5 3-2.5 3 2.5"/><path d="m5 10.5 3.8-.3-.7-3.7"/><path d="m19 13.5-3.8.3.7 3.7"/>',
  play: '<path d="m6 3 15 9-15 9Z"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  reset: '<path d="M3 2v6h6"/><path d="M3.5 8a9 9 0 1 1-.4 4"/>',
  back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
  camera: '<path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5Z"/><circle cx="12" cy="13" r="3.5"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  top: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/>',
  front: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M10 7h4"/>',
  side: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h2"/>',
  iso: '<path d="m12 2 8.5 5v10L12 22l-8.5-5V7Z"/><path d="m3.5 7 8.5 5 8.5-5"/><path d="M12 12v10"/>',
  fit: '<path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><circle cx="12" cy="12" r="3"/>',
  power: '<path d="M18.4 6.6a9 9 0 1 1-12.8 0"/><path d="M12 2v9"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.7"/>',
  arrowDown: '<path d="M12 4v16"/><path d="m6 14 6 6 6-6"/>',
  arrowUp: '<path d="M12 20V4"/><path d="m6 10 6-6 6 6"/>',
  door: '<path d="M13 4h6v16h-6"/><path d="M13 4 5 6v12l8 2Z"/><circle cx="10" cy="12" r=".8"/>',
  gate: '<path d="M3 21V5h7"/><path d="M14 5h7v16"/><path d="M6 12h12"/><path d="M6 16h12"/>',
  vehicle: '<path d="m5 17-1-5 2-5h12l2 5-1 5Z"/><path d="M4 17h16v3H4z"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/><path d="M6 12h12"/>',
  sensor: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4"/><path d="M16.2 16.2a6 6 0 0 0 0-8.4"/><path d="M4.9 4.9a10 10 0 0 0 0 14.2"/><path d="M19.1 19.1a10 10 0 0 0 0-14.2"/>',
  pump: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 4v3"/><path d="M12 17v3"/><path d="M4 12h3"/><path d="M17 12h3"/>',
  valve: '<circle cx="12" cy="12" r="4"/><path d="M12 2v6"/><path d="M12 16v6"/><path d="M2 12h6"/><path d="M16 12h6"/><path d="m9.2 9.2 5.6 5.6"/><path d="m14.8 9.2-5.6 5.6"/>',
  compressor: '<rect x="3" y="7" width="18" height="12" rx="3"/><circle cx="9" cy="13" r="3"/><path d="M15 10h3"/><path d="M15 16h3"/><path d="M6 7V4"/>',
  fan: '<circle cx="12" cy="12" r="2"/><path d="M12 10c-1-4 2-7 4-5s1 5-2 6"/><path d="M14 12c4-1 7 2 5 4s-5 1-6-2"/><path d="M10 12c1 4-2 7-4 5s-1-5 2-6"/><path d="M12 14c-4 1-7-2-5-4s5-1 6 2"/>',
  battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 10v4"/><path d="M6 10v4"/><path d="M10 10v4"/>',
  inverter: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m9 15 2-6 2 6"/><path d="M15 9h3v6h-3z"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 3v18"/><path d="M16 3v18"/><path d="M3 12h18"/>',
  motor: '<rect x="4" y="8" width="13" height="8" rx="2"/><circle cx="8" cy="12" r="1.5"/><path d="M17 10h4"/><path d="M17 14h4"/><path d="M4 12H2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".6"/>',
  warning: '<path d="M10.3 3.2 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><circle cx="12" cy="17" r=".6"/>',
  shield: '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/>',
  wifi: '<path d="M2 8.8a16 16 0 0 1 20 0"/><path d="M5 12.2a11 11 0 0 1 14 0"/><path d="M8.5 15.6a6 6 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
  xray: '<path d="M12 2v20"/><path d="M4 6h16"/><path d="M4 18h16"/><path d="M5 10h14"/><path d="M5 14h14"/><circle cx="12" cy="12" r="9" opacity=".35"/>',
  isolate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/><circle cx="12" cy="12" r="9" opacity=".35" stroke-dasharray="2 3"/>',
  transparent: '<rect x="3" y="3" width="18" height="18" rx="2" opacity=".45"/><path d="M3 9h18" opacity=".6"/><path d="M9 3v18" opacity=".6"/>',
  equipment: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2.4-2.4Z"/>',
  thermometer: '<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0Z"/><path d="M12 8v8"/>',
  droplet: '<path d="M12 2.7s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 9.7 12 2.7 12 2.7Z"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7a2 2 0 1 1-2 2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  menu: '<path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>',
  exit: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  clipboard: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2"/><path d="M9 10h6"/><path d="M9 14h6"/><path d="M9 18h4"/>',
  timeline: '<path d="M3 12h4"/><path d="M9 12h5"/><path d="M16 12h5"/><circle cx="7" cy="12" r="1.5"/><circle cx="14" cy="12" r="1.5"/>',
  shieldCheck: '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  menuArrow: '<path d="M4 12h16"/><path d="m14 6 6 6-6 6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  filter: '<path d="M3 4h18l-7 8v6l-4 2v-8Z"/>',
  light: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.4 1 1.3 1 2.3h6c0-1 .4-1.9 1-2.3A7 7 0 0 0 12 2Z"/>',
  location: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.4-.3-.4-.5-.9-.5-1.4 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 22 10.6 10 10 0 0 0 12 2Z"/>',
};

export function icon(name, size = 16) {
  const body = ICON_PATHS[name] || ICON_PATHS.info;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = body;
  return svg;
}

/* ---------------- Formatting ---------------- */
export function fmt(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(+value)) return '—';
  const n = +value;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  const fixed = n.toFixed(digits);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}
export function fmtInt(value) {
  if (!Number.isFinite(+value)) return '—';
  return Math.round(+value).toLocaleString('en-US');
}
export function pad(n) { return String(n).padStart(2, '0'); }
export function fmtTime(seconds, withSeconds = true) {
  const s = ((seconds % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return withSeconds ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}`;
}
export function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${s % 60}s`;
}
export function fmtDate(ts = Date.now()) {
  return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
export function statusTone(state) {
  const s = String(state || '').toLowerCase();
  if (/(critical|fault|fail|alarm|jam|error|overheat|unauthor|overflow)/.test(s)) return 'danger';
  if (/(warn|low|high|open|manual|paused|reserved|idle|overstay|degraded|maintenance)/.test(s)) return 'warn';
  if (/(ok|online|running|active|available|normal|closed|auto|charged|healthy|operational|secured|occupied|full)/.test(s)) return 'ok';
  return 'muted';
}

/* ---------------- Basic components ---------------- */
export function button(label, opts = {}) {
  const { variant = '', size = '', iconName = null, onClick = null, disabled = false, title = '', block = false, iconOnly = false } = opts;
  const cls = ['btn', variant, size, block ? 'block' : '', iconOnly ? 'icon' : ''].filter(Boolean).join(' ');
  const b = el('button', { class: cls, disabled, title, onClick: onClick || undefined });
  if (iconName) b.appendChild(icon(iconName, size === 'small' ? 13 : 15));
  if (!iconOnly) b.appendChild(el('span', { text: label }));
  else if (label) b.setAttribute('aria-label', label);
  return b;
}

export function badge(text, tone = '', dot = true) {
  const b = el('span', { class: `badge ${tone}` });
  if (dot) b.appendChild(el('span', { class: 'dot' }));
  b.appendChild(el('span', { text }));
  return b;
}

export function statusDot(tone = '') { return el('span', { class: `dot-status ${tone}` }); }

export function metric({ label, value = '—', unit = '', sub = '', tone = '', iconName = '', bind = null, compact = false, wide = false }) {
  const m = el('div', { class: `metric ${tone ? 'tone-' + tone : ''} ${compact ? 'compact' : ''} ${wide ? 'wide' : ''}` });
  const lbl = el('div', { class: 'lbl' }, label);
  if (iconName) { const ic = el('div', { class: 'ic' }); ic.appendChild(icon(iconName, 13)); m.appendChild(ic); }
  const val = el('div', { class: 'val' });
  const v = el('span', { class: 'v', text: typeof value === 'function' ? '—' : String(value) });
  val.appendChild(v);
  if (unit) val.appendChild(el('span', { class: 'unit', text: unit }));
  const subject = el('div', { class: 'sub', text: sub });
  m.append(lbl, val, subject);
  if (bind) m._bind = () => {
    const out = bind();
    if (out && typeof out === 'object') {
      v.textContent = out.value ?? '—';
      if (out.unit !== undefined) {
        let u = val.querySelector('.unit');
        if (!u) { u = el('span', { class: 'unit' }); val.appendChild(u); }
        u.textContent = out.unit;
      }
      if (out.sub !== undefined) subject.textContent = out.sub;
      if (out.tone !== undefined) {
        m.className = `metric ${out.tone ? 'tone-' + out.tone : ''} ${compact ? 'compact' : ''} ${wide ? 'wide' : ''}`;
      }
    } else {
      v.textContent = out ?? '—';
    }
  };
  return m;
}

export function kvRow(key, value, opts = {}) {
  const row = el('div', { class: `kv-row ${opts.className || ''}` });
  row.appendChild(el('span', { class: 'k', text: key }));
  const v = el('span', { class: `v ${opts.text ? 'text' : ''}` });
  if (opts.bind) { v.textContent = '—'; row._bind = () => { v.textContent = opts.bind(); }; }
  else if (value instanceof Node) v.appendChild(value);
  else v.textContent = value;
  row.appendChild(v);
  return row;
}

export function section(title, body, opts = {}) {
  const wrap = el('div', { class: `section ${opts.className || ''}` });
  if (title) {
    const head = el('div', { class: 'section-title' }, title);
    if (opts.iconName) head.prepend(icon(opts.iconName, 12));
    if (opts.side) head.appendChild(el('span', { class: 'side', text: opts.side }));
    wrap.appendChild(head);
  }
  if (opts.desc) wrap.appendChild(el('p', { class: 'section-desc', text: opts.desc }));
  if (body) {
    if (opts.card === false) wrap.appendChild(body);
    else { const card = el('div', { class: 'section-card' }); card.appendChild(body); wrap.appendChild(card); }
  }
  return wrap;
}

export function notice(text, type = 'info') {
  const n = el('div', { class: `notice ${type}` });
  n.appendChild(icon(type === 'warn' ? 'warning' : 'info', 13));
  n.appendChild(el('span', { text }));
  return n;
}

/* ---------------- Controls ---------------- */
export function toggle(def) {
  const row = el('div', { class: 'toggle-row' });
  const txt = el('div', { class: 'txt' }, el('b', { text: def.label }));
  if (def.description) txt.appendChild(el('span', { text: def.description }));
  row.appendChild(txt);
  const sw = el('button', {
    class: `switch ${def.value ? 'on' : ''} ${def.disabled ? 'disabled' : ''}`,
    title: def.value ? 'Disable' : 'Enable',
    onClick: () => {
      if (def.disabled) return;
      const next = !sw.classList.contains('on');
      sw.classList.toggle('on', next);
      def.onChange?.(next);
    }
  });
  row.appendChild(sw);
  row._set = (v) => { sw.classList.toggle('on', !!v); };
  return row;
}

export function slider(def) {
  const wrap = el('div', { class: 'slider-row' });
  const head = el('div', { class: 'sh' });
  head.appendChild(el('span', { text: def.label }));
  const out = el('b', { text: def.format ? def.format(def.value) : `${fmt(def.value, def.digits ?? 1)}${def.unit ? ' ' + def.unit : ''}` });
  head.appendChild(out);
  wrap.appendChild(head);
  const row = el('div', { class: 'range-row' });
  const input = el('input', { type: 'range', min: def.min, max: def.max, step: def.step ?? 1, value: def.value, disabled: def.disabled });
  const num = el('input', { class: 'number-input', type: 'number', min: def.min, max: def.max, step: def.step ?? 1, value: def.value, disabled: def.disabled });
  const fill = () => {
    const pct = ((+input.value - def.min) / (def.max - def.min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
    out.textContent = def.format ? def.format(+input.value) : `${fmt(+input.value, def.digits ?? 1)}${def.unit ? ' ' + def.unit : ''}`;
  };
  fill();
  input.addEventListener('input', () => {
    num.value = input.value;
    fill();
    def.onInput?.(+input.value);
  });
  input.addEventListener('change', () => def.onChange?.(+input.value));
  num.addEventListener('change', () => {
    let v = Math.min(def.max, Math.max(def.min, +num.value || def.min));
    input.value = v; num.value = v; fill();
    def.onInput?.(v); def.onChange?.(v);
  });
  row.append(input, num);
  wrap.appendChild(row);
  wrap._set = (v) => { input.value = v; num.value = v; fill(); };
  return wrap;
}

export function selectField(def) {
  const wrap = el('div', { class: 'field' });
  if (def.label) wrap.appendChild(el('label', { text: def.label }));
  const sel = el('select', { class: 'select-input', onChange: (e) => def.onChange?.(e.target.value) });
  for (const opt of def.options) {
    const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
    const node = el('option', { value: o.value, text: o.label, selected: String(o.value) === String(def.value) });
    sel.appendChild(node);
  }
  sel.value = def.value;
  wrap.appendChild(sel);
  wrap._set = (v) => { sel.value = v; };
  return wrap;
}

export function numberField(def) {
  const wrap = el('div', { class: 'field' });
  if (def.label) wrap.appendChild(el('label', {}, def.label, def.unit ? el('b', { text: def.unit }) : null));
  const input = el('input', { class: 'number-input', type: 'number', min: def.min, max: def.max, step: def.step ?? 1, value: def.value, placeholder: def.placeholder || '' });
  const commit = () => {
    let v = +input.value;
    if (!Number.isFinite(v)) return;
    if (def.min !== undefined) v = Math.max(def.min, v);
    if (def.max !== undefined) v = Math.min(def.max, v);
    input.value = v;
    def.onChange?.(v);
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { commit(); input.blur(); } });
  wrap.appendChild(input);
  wrap._set = (v) => { input.value = v; };
  return wrap;
}

export function textField(def) {
  const wrap = el('div', { class: 'field' });
  if (def.label) wrap.appendChild(el('label', { text: def.label }));
  const input = el('input', { class: 'input', type: 'text', value: def.value ?? '', placeholder: def.placeholder || '' });
  input.addEventListener('change', () => def.onChange?.(input.value.trim()));
  wrap.appendChild(input);
  return wrap;
}

export function segmented(options, value, onChange, opts = {}) {
  const wrap = el('div', { class: `seg ${opts.wrap ? 'wrap' : ''}` });
  for (const opt of options) {
    const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
    const b = el('button', {
      class: String(o.value) === String(value) ? 'active' : '',
      onClick: () => {
        wrap.querySelectorAll('button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        onChange?.(o.value);
      }
    }, o.iconName ? icon(o.iconName, 12) : null, o.label);
    wrap.appendChild(b);
  }
  return wrap;
}

export function renderControl(def) {
  switch (def.type) {
    case 'button': {
      const b = button(def.label, { variant: def.variant, size: def.size || 'small', iconName: def.iconName, onClick: def.onClick, disabled: def.disabled, block: def.block, title: def.title });
      if (def.full) b.classList.add('block');
      return b;
    }
    case 'toggle': return toggle(def);
    case 'slider': return slider(def);
    case 'select': return selectField(def);
    case 'number': return numberField(def);
    case 'text': return textField(def);
    case 'segment': return segmented(def.options, def.value, def.onChange, def);
    case 'divider': return el('div', { class: 'divider' });
    case 'row': {
      const row = el('div', { class: 'input-row' });
      for (const d of def.controls) row.appendChild(renderControl(d));
      return row;
    }
    case 'pair': {
      const row = el('div', { class: 'inline-pair' });
      for (const d of def.controls) row.appendChild(renderControl(d));
      return row;
    }
    case 'label': return el('div', { class: 'help', text: def.text });
    case 'notice': return notice(def.text, def.tone || 'info');
    default: return el('div');
  }
}

export function renderControls(container, defs = []) {
  const list = el('div', { class: 'control-list' });
  for (const def of defs) {
    if (!def) continue;
    if (def.type === 'html') { list.appendChild(def.node); continue; }
    if (def.type === 'section') {
      const s = el('div', { class: 'section' });
      if (def.label) s.appendChild(el('div', { class: 'section-title', text: def.label }));
      const body = el('div', { class: 'control-list' });
      for (const d of def.controls) body.appendChild(renderControl(d));
      s.appendChild(body);
      list.appendChild(s);
      continue;
    }
    list.appendChild(renderControl(def));
  }
  container.appendChild(list);
  return list;
}

export function segmentedControl(label, options, value, onChange) {
  return el('div', { class: 'field' }, el('label', { text: label }), segmented(options, value, onChange));
}

export function progressBar(percent, tone = '') {
  const p = el('div', { class: `progress ${tone}` });
  p.appendChild(el('span', { style: { width: `${Math.max(0, Math.min(100, percent))}%` } }));
  p._set = (v) => { p.firstChild.style.width = `${Math.max(0, Math.min(100, v))}%`; };
  return p;
}

export function progressRing(percent, size = 68) {
  const pct = Math.max(0, Math.min(100, percent));
  const r = (size / 2) - 5;
  const c = 2 * Math.PI * r;
  const wrap = el('div', { class: 'health-ring', style: { width: `${size}px`, height: `${size}px` } });
  wrap.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(120,160,190,.14)" stroke-width="4"/>
    <circle class="ring-value" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="4"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c - (pct / 100) * c}"/>
  </svg><div class="val">${Math.round(pct)}<span class="pct">%</span></div>`;
  wrap._set = (v) => {
    const p = Math.max(0, Math.min(100, v));
    wrap.querySelector('.ring-value').setAttribute('stroke-dashoffset', c - (p / 100) * c);
    wrap.querySelector('.val').innerHTML = `${Math.round(p)}<span class="pct">%</span>`;
  };
  return wrap;
}

export function chartLegend(series) {
  const legend = el('div', { class: 'chart-legend' });
  for (const s of series || []) {
    const li = el('div', { class: 'li' });
    li.appendChild(el('i', { style: { background: s.color } }));
    li.appendChild(document.createTextNode(s.label));
    legend.appendChild(li);
  }
  return legend;
}

/* ---------------- Charts ---------------- */
class CanvasChart {
  constructor(opts = {}) {
    this.height = opts.height || 150;
    this.padding = opts.padding || { l: 30, r: 8, t: 8, b: 16 };
    this.wrap = el('div', { class: 'chart-box' });
    this.canvas = el('canvas', { class: 'chart-canvas' });
    this.canvas.style.height = `${this.height}px`;
    this.ctx = this.canvas.getContext('2d');
    this.wrap.appendChild(this.canvas);
    this.series = [];
    this.labels = null;
    this.unit = opts.unit || '';
    this.min = opts.min;
    this.max = opts.max;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.wrap);
    requestAnimationFrame(() => this.resize());
  }
  resize() {
    const w = this.wrap.clientWidth;
    if (!w) return;
    this.w = w;
    this.h = this.height;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.draw();
  }
  setSeries(series) { this.series = series || []; this.draw(); }
  update(series) { if (series) this.series = series; this.draw(); }
  bounds() {
    let min = this.min, max = this.max;
    if (min === undefined || max === undefined) {
      const vals = this.series.flatMap(s => s.data).filter(Number.isFinite);
      if (!vals.length) return { min: 0, max: 1 };
      let lo = Math.min(...vals), hi = Math.max(...vals);
      if (lo === hi) { lo -= 1; hi += 1; }
      const pad = (hi - lo) * 0.15;
      if (min === undefined) min = lo - pad;
      if (max === undefined) max = hi + pad;
    }
    if (min === max) max = min + 1;
    return { min, max };
  }
  drawEmpty(msg = 'Awaiting telemetry…') {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(122,150,172,.55)';
    ctx.font = '9px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(msg, w / 2, h / 2);
  }
  drawBase(min, max, yTicks = 4) {
    const { ctx, w, h } = this;
    const p = this.padding;
    ctx.clearRect(0, 0, w, h);
    const iw = w - p.l - p.r, ih = h - p.t - p.b;
    // horizontal grid + labels
    ctx.font = '7.5px "Cascadia Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= yTicks; i++) {
      const y = p.t + (ih * i) / yTicks;
      ctx.strokeStyle = 'rgba(130,165,190,.09)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.l, y); ctx.lineTo(w - p.r, y); ctx.stroke();
      ctx.fillStyle = 'rgba(130,160,180,.55)';
      const val = max - ((max - min) * i) / yTicks;
      ctx.fillText(fmt(val, Math.abs(max - min) < 3 ? 2 : Math.abs(max - min) < 20 ? 1 : 0), p.l - 5, y);
    }
    // vertical grid
    for (let i = 1; i < 4; i++) {
      const x = p.l + (iw * i) / 4;
      ctx.strokeStyle = 'rgba(130,165,190,.055)';
      ctx.beginPath(); ctx.moveTo(x, p.t); ctx.lineTo(x, p.t + ih); ctx.stroke();
    }
    return { iw, ih, x0: p.l, y0: p.t };
  }
  destroy() { this.resizeObserver.disconnect(); }
}

export class LineChart extends CanvasChart {
  constructor(opts = {}) {
    super(opts);
    this.area = opts.area !== false;
    this.maxPoints = opts.maxPoints || 240;
    this.legend = null;
    if (opts.series) this.setSeries(opts.series);
  }
  setSeries(series) {
    this.series = series || [];
    if (!this.legend && this.wrap.parentNode) {
      this.legend = chartLegend(this.series);
      this.wrap.parentNode.insertBefore(this.legend, this.wrap);
    } else if (this.legend) {
      this.legend.replaceWith(chartLegend(this.series));
      this.legend = null;
    }
    this.draw();
  }
  draw() {
    if (!this.w || !this.series.length) { this.drawEmpty(); return; }
    const { ctx, w, h } = this;
    const { min, max } = this.bounds();
    const { iw, ih, x0, y0 } = this.drawBase(min, max, 4);
    const count = Math.max(...this.series.map(s => s.data.length));
    if (count < 2) { this.drawEmpty(); return; }
    for (const s of this.series) {
      const data = s.data.filter(Number.isFinite);
      if (data.length < 2) continue;
      const xStep = iw / Math.max(1, data.length - 1);
      const pts = data.map((v, i) => [x0 + i * xStep, y0 + ih - ((v - min) / (max - min)) * ih]);
      if (this.area) {
        const grad = ctx.createLinearGradient(0, y0, 0, y0 + ih);
        grad.addColorStop(0, hexA(s.color, .22));
        grad.addColorStop(1, hexA(s.color, .01));
        ctx.beginPath();
        ctx.moveTo(pts[0][0], y0 + ih);
        for (const [x, y] of pts) ctx.lineTo(x, y);
        ctx.lineTo(pts[pts.length - 1][0], y0 + ih);
        ctx.closePath();
        ctx.fillStyle = grad; ctx.fill();
      }
      ctx.beginPath();
      pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.strokeStyle = s.color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.globalAlpha = .95; ctx.stroke(); ctx.globalAlpha = 1;
      const [lx, ly] = pts[pts.length - 1];
      ctx.beginPath(); ctx.arc(lx, ly, 2.2, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill();
      ctx.beginPath(); ctx.arc(lx, ly, 4.5, 0, Math.PI * 2); ctx.fillStyle = hexA(s.color, .18); ctx.fill();
    }
  }
}

export class BarChart extends CanvasChart {
  constructor(opts = {}) {
    super(opts);
    this.categories = opts.categories || [];
    this.values = opts.values || [];
    this.colors = opts.colors || [];
    this.draw();
  }
  setData(categories, values, colors) { this.categories = categories; this.values = values; this.colors = colors || []; this.draw(); }
  draw() {
    if (!this.w) return;
    const { ctx, w, h } = this;
    const p = this.padding;
    ctx.clearRect(0, 0, w, h);
    if (!this.values.length) { this.drawEmpty('No records yet'); return; }
    const max = Math.max(...this.values, 1);
    const iw = w - p.l - p.r, ih = h - p.t - p.b;
    const bw = iw / this.values.length * .58;
    this.values.forEach((v, i) => {
      const x = p.l + (iw / this.values.length) * (i + .5) - bw / 2;
      const bh = Math.max(2, (v / max) * ih);
      const y = p.t + ih - bh;
      const color = this.colors[i] || 'var(--accent)';
      const grad = ctx.createLinearGradient(0, y, 0, p.t + ih);
      grad.addColorStop(0, color); grad.addColorStop(1, hexA(color, .12));
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, bw, bh, 3); ctx.fill();
      ctx.fillStyle = 'rgba(190,210,225,.8)'; ctx.font = '8px "Cascadia Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText(fmt(v, 0), x + bw / 2, y - 4);
      ctx.fillStyle = 'rgba(130,160,180,.65)'; ctx.font = '7.5px "Segoe UI",sans-serif';
      ctx.fillText(this.categories[i] || '', x + bw / 2, h - 4);
    });
  }
}

function roundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2; if (h < 2 * r) r = h / 2;
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function hexA(color, alpha) {
  if (!color) return `rgba(54,226,194,${alpha})`;
  if (color.startsWith('var(') || color.startsWith('#')) {
    if (color.startsWith('#')) {
      const c = color.replace('#', '');
      const full = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
      const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    return color;
  }
  if (color.startsWith('rgb')) return color.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
  return color;
}

/* ---------------- Toasts ---------------- */
export function toast(message, opts = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const type = opts.type || 'info';
  const t = el('div', { class: `toast ${type}` });
  const ic = el('div', { class: 'ic' });
  ic.appendChild(icon(type === 'danger' ? 'alert' : type === 'warn' ? 'warning' : type === 'ok' ? 'check' : 'info', 14));
  const tt = el('div', { class: 'tt' }, el('b', { text: opts.title || (type === 'danger' ? 'Alarm' : type === 'warn' ? 'Warning' : type === 'ok' ? 'Completed' : 'Notice') }), el('span', { text: message }));
  const x = el('button', { class: 'x', onClick: () => remove() });
  x.appendChild(icon('close', 12));
  t.append(ic, tt, x);
  root.appendChild(t);
  let removed = false;
  const remove = () => { if (removed) return; removed = true; t.classList.add('out'); setTimeout(() => t.remove(), 260); };
  const timer = setTimeout(remove, opts.duration || 5000);
  x.addEventListener('click', () => clearTimeout(timer), { once: true });
  return { remove };
}

/* ---------------- Modals ---------------- */
export function modal({ title, subtitle = '', body, footer, size = '', onClose = null, closeOnBackdrop = true }) {
  const root = document.getElementById('modal-root');
  const backdrop = el('div', { class: 'modal-backdrop' });
  const box = el('div', { class: `modal ${size}` });
  const head = el('div', { class: 'modal-head' });
  const tt = el('div', {}, el('h3', { text: title }));
  if (subtitle) tt.appendChild(el('div', { class: 'sub', text: subtitle }));
  head.appendChild(tt);
  const closeBtn = el('button', { class: 'btn icon ghost modal-close', onClick: () => close(), title: 'Close' });
  closeBtn.appendChild(icon('close', 15));
  head.appendChild(closeBtn);
  const bodyEl = el('div', { class: 'modal-body' });
  if (body) bodyEl.appendChild(body);
  box.append(head, bodyEl);
  if (footer) { const foot = el('div', { class: 'modal-foot' }); footer.forEach(f => foot.appendChild(f)); box.appendChild(foot); }
  backdrop.appendChild(box);
  root.appendChild(backdrop);
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    backdrop.remove(); onClose?.();
  }
  backdrop.addEventListener('mousedown', e => { if (e.target === backdrop && closeOnBackdrop) close(); });
  const esc = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', esc); close(); } };
  document.addEventListener('keydown', esc);
  return { close, body: bodyEl, backdrop };
}

export function confirmDialog({ title = 'Confirm Action', message = '', confirmLabel = 'Confirm', danger = false, cancelLabel = 'Cancel' } = {}) {
  return new Promise(resolve => {
    let settled = false;
    const done = (v) => { if (settled) return; settled = true; m.close(); resolve(v); };
    const body = el('div', {}, el('p', { class: 'about-p', text: message, style: { margin: 0 } }));
    const cancel = button(cancelLabel, { onClick: () => done(false) });
    const ok = button(confirmLabel, { variant: danger ? 'danger' : 'primary', onClick: () => done(true) });
    const m = modal({ title, body, footer: [cancel, ok], onClose: () => { if (!settled) { settled = true; resolve(false); } } });
  });
}

/* ---------------- File helpers ---------------- */
export function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(filename, blob);
}
export function downloadText(filename, text, mime = 'text/plain') {
  downloadBlob(filename, new Blob([text], { type: mime }));
}
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function pickFile(accept = '.json') {
  return new Promise(resolve => {
    const input = el('input', { type: 'file', accept, style: { display: 'none' } });
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, text: reader.result });
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
    input.click();
  });
}

/* ---------------- Misc ---------------- */
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function rand(a, b) { return a + Math.random() * (b - a); }
export function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function debounce(fn, ms = 150) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
export function throttle(fn, ms = 100) {
  let last = 0; return (...args) => { const now = performance.now(); if (now - last >= ms) { last = now; fn(...args); } };
}
export function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
