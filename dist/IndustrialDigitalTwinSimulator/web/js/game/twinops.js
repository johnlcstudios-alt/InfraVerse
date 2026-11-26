/* ============================================================
   TWIN OPS: FIELD ENGINEER — the 3D game
   ------------------------------------------------------------
   A playable first-person game that runs on the live data of
   the InfraVerse digital-twin program:

   · On entry it reads each facility's saved configuration
     (idt.<id>.config — the exact persistence schema the twins
     load) and seeds five shadow engines, so the campus starts
     in the state the program left it in.
   · Every frame the shadow twins evolve; the 3D world and HUD
     mirror their telemetry (tank level, battery SoC, belt and
     cartons, zone temperatures, bay occupancy).
   · Player actions — control panels, repairs, citations — flow
     back through TwinLink into the twins' configuration store
     and, when a twin control room is open in a co-open tab,
     straight into the running twin via the live bus.
   · Evolved operating points are written back to the twins'
     config keys, so the program continues where the game left
     off. Twin → game and game → twin, both directions, live.
   ============================================================ */
import * as THREE from 'three';
import { storage } from '../core/storage.js';
import { buildCampus, SERVICE_POINTS } from './world.js';
import { createHeadlessTwin, createStubHost, extractWorld } from './twinhost.js';
import {
  createTwinLink, createTwinBus, FACILITIES, facilityMeta,
  clamp,
} from './twinlink.js';

export const meta = {
  id: 'game',
  code: 'OPS-07',
  name: 'TWIN OPS: Field Engineer',
  description: 'First-person operations game across all five infrastructure twins.',
};

const CONFIG_KEY = 'idt.game.config';
const DAY_LENGTH = 86400;

const REPAIR_LABELS = {
  water: 'Pump Skid Service Hatch',
  solar: 'Array Junction Box',
  conveyor: 'Drive Station Service Point',
  cold: 'Refrigeration Plant Hatch',
  parking: 'Gate Control Point',
};

const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
};

/* Collision push-out directions (module-level, allocation-free) */
const _COL_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/* ============================================================
   TwinOpsControls — purpose-built first-person controller.

   Written for this game after two defects surfaced in the
   shared platform controller: `activeLook` is never assigned so
   mouse look speed is permanently zero, and the floor ray
   (origin eye+0.35, reach 1.12) cannot detect a floor at the
   standing eye height, so the body sinks and snaps upward in an
   endless bounce. This controller:

   · applies mouse look from raw yaw/pitch (pointer lock when
     available, with an automatic drag-to-look fallback when
     pointer lock is unavailable — VMs / RDP sessions),
   · rests the eye exactly on the ground height and only jumps
     from a fresh, grounded Space press (no stored impulses,
     no key-repeat bouncing),
   · resolves horizontal collisions with the same push-out
     raycast approach against the game's collider list.
   ============================================================ */
class TwinOpsControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.enabled = true;

    this.movementSpeed = 4.6;
    this.sprintSpeed = 9.2;
    this.crouchSpeed = 1.8;
    this.lookSpeed = 0.0021;
    this.eyeHeight = 1.7;
    this.crouchEye = 1.05;
    this.playerRadius = 0.38;
    this.gravity = 22;
    this.jumpSpeed = 7.2;
    this.interactionDistance = 3.2;

    this.collisionMeshes = [];
    this.interactableObjects = new Map();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = this.interactionDistance;

    /* look + physics state */
    this.yaw = 0;                    // radians, 0 faces -Z
    this.pitch = 0;                  // radians
    this.velocityY = 0;
    this.grounded = true;
    this.crouching = false;
    this._wantJump = false;
    this._keys = new Set();
    this._dragLook = false;          // pointer-lock fallback active
    this._dragging = false;
    this._lastDragX = 0;
    this._lastDragY = 0;
    this._pointerLockBroken = false;
    this.hasEntered = false;
    this.currentInteractable = null;

    this.onInteract = null;
    this.onInspect = null;
    this.onInteractableEnter = null;
    this.onInteractableLeave = null;
    this.onLookChange = null;

    this._bound = {
      keyDown: (e) => this._onKeyDown(e),
      keyUp: (e) => this._onKeyUp(e),
      pointerMove: (e) => this._onPointerMove(e),
      pointerDown: (e) => this._onPointerDown(e),
      pointerUp: () => { this._dragging = false; },
      contextMenu: (e) => e.preventDefault(),
      lockChange: () => this._emitLookChange(),
      lockError: () => { this._pointerLockBroken = true; this._enableDragLook(); },
      blur: () => this._keys.clear(),
    };
    this.connect();
  }

  connect() {
    window.addEventListener('keydown', this._bound.keyDown);
    window.addEventListener('keyup', this._bound.keyUp);
    window.addEventListener('blur', this._bound.blur);
    document.addEventListener('pointerlockchange', this._bound.lockChange);
    document.addEventListener('pointerlockerror', this._bound.lockError);
    this.domElement.addEventListener('pointermove', this._bound.pointerMove);
    this.domElement.addEventListener('pointerdown', this._bound.pointerDown);
    this.domElement.addEventListener('pointerup', this._bound.pointerUp);
    this.domElement.addEventListener('contextmenu', this._bound.contextMenu);
  }

  dispose() {
    window.removeEventListener('keydown', this._bound.keyDown);
    window.removeEventListener('keyup', this._bound.keyUp);
    window.removeEventListener('blur', this._bound.blur);
    document.removeEventListener('pointerlockchange', this._bound.lockChange);
    document.removeEventListener('pointerlockerror', this._bound.lockError);
    this.domElement.removeEventListener('pointermove', this._bound.pointerMove);
    this.domElement.removeEventListener('pointerdown', this._bound.pointerDown);
    this.domElement.removeEventListener('pointerup', this._bound.pointerUp);
    this.domElement.removeEventListener('contextmenu', this._bound.contextMenu);
    this.exitLook();
    this.interactableObjects.clear();
    this.collisionMeshes = [];
  }

  /* ---------------- look session ---------------- */
  isLocked() { return document.pointerLockElement === this.domElement || this._dragLook; }

  requestLook() {
    this.hasEntered = true;
    if (this._pointerLockBroken || this._dragLook) { this._dragLook = true; this._emitLookChange(); return; }
    try {
      this.domElement.requestPointerLock();
      clearTimeout(this._lockTimer);
      this._lockTimer = setTimeout(() => {
        if (document.pointerLockElement !== this.domElement) this._enableDragLook();
      }, 700);
    } catch {
      this._enableDragLook();
    }
  }

  exitLook() {
    clearTimeout(this._lockTimer);
    this._dragging = false;
    this._dragLook = false;
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* ignore */ }
    this._emitLookChange();
  }

  _enableDragLook() {
    clearTimeout(this._lockTimer);
    if (!this._dragLook) {
      this._dragLook = true;
      this._emitLookChange();
    }
  }

  _emitLookChange() { if (this.onLookChange) this.onLookChange(this.isLocked()); }

  /* ---------------- input ---------------- */
  _onKeyDown(e) {
    if (!this.enabled) { this._keys.clear(); return; }
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this._keys.add('fwd'); break;
      case 'KeyS': case 'ArrowDown': this._keys.add('back'); break;
      case 'KeyA': case 'ArrowLeft': this._keys.add('left'); break;
      case 'KeyD': case 'ArrowRight': this._keys.add('right'); break;
      case 'ShiftLeft': case 'ShiftRight': this._keys.add('sprint'); break;
      case 'KeyC': this._keys.add('crouch'); break;
      case 'Space':
        if (!e.repeat) this._wantJump = true;   // fresh press only — no bounce
        e.preventDefault();
        break;
      case 'KeyE': if (this.isLocked()) this.interact(); break;
      case 'KeyF': if (this.isLocked()) this.inspect(); break;
      default: return;
    }
  }

  _onKeyUp(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this._keys.delete('fwd'); break;
      case 'KeyS': case 'ArrowDown': this._keys.delete('back'); break;
      case 'KeyA': case 'ArrowLeft': this._keys.delete('left'); break;
      case 'KeyD': case 'ArrowRight': this._keys.delete('right'); break;
      case 'ShiftLeft': case 'ShiftRight': this._keys.delete('sprint'); break;
      case 'KeyC': this._keys.delete('crouch'); break;
    }
  }

  _onPointerMove(e) {
    if (!this.enabled) return;
    const locked = document.pointerLockElement === this.domElement;
    const dragging = this._dragLook && this._dragging;
    if (!locked && !dragging) return;
    const dx = e.movementX || 0, dy = e.movementY || 0;
    this.yaw -= dx * this.lookSpeed;
    this.pitch -= dy * this.lookSpeed;
    this.pitch = clamp(this.pitch, -1.483, 1.483); // ±85°
  }

  _onPointerDown(e) {
    if (!this.enabled) return;
    if (e.button === 0 && this._dragLook && document.pointerLockElement !== this.domElement) {
      this._dragging = true;
      this._lastDragX = e.clientX; this._lastDragY = e.clientY;
    }
  }

  /* ---------------- teleport / persistence ---------------- */
  setCollisionMeshes(list) { this.collisionMeshes = list || []; }

  teleportTo(x, y, z, yaw = 0, pitch = 0) {
    this.camera.position.set(x, y, z);
    this.yaw = yaw; this.pitch = pitch;
    this.velocityY = 0; this.grounded = true;
    this._applyRotation();
  }

  /* ---------------- simulation ---------------- */
  update(dt) {
    if (!this.enabled) { if (this._rayFrame++ % 2 === 0) this._updateInteract(); return; }
    this._rayFrame = (this._rayFrame || 0) + 1;
    const groundedEye = this._keys.has('crouch') ? this.crouchEye : this.eyeHeight;
    this.crouching = this._keys.has('crouch');

    /* jump: only from a fresh press while grounded */
    if (this._wantJump && this.grounded) {
      this.velocityY = this.jumpSpeed;
      this.grounded = false;
    }
    this._wantJump = false;

    /* gravity + exact floor rest (no sink, no snap fight) */
    this.velocityY -= this.gravity * dt;
    this.camera.position.y += this.velocityY * dt;
    if (this.camera.position.y <= groundedEye) {
      this.camera.position.y = groundedEye;
      this.velocityY = 0;
      this.grounded = true;
    } else if (this.camera.position.y > groundedEye + 0.05) {
      this.grounded = false;
    }

    /* horizontal movement relative to yaw */
    let fx = 0, fz = 0;
    if (this._keys.has('fwd')) fz += 1;
    if (this._keys.has('back')) fz -= 1;
    if (this._keys.has('left')) fx -= 1;
    if (this._keys.has('right')) fx += 1;
    if (fx !== 0 || fz !== 0) {
      const len = Math.hypot(fx, fz);
      fx /= len; fz /= len;
      let speed = this._keys.has('sprint') ? this.sprintSpeed : this.crouching ? this.crouchSpeed : this.movementSpeed;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // forward = (-sin(yaw), -cos(yaw)), right = (cos(yaw), -sin(yaw))
      const dx = (-sin * fz + cos * fx) * speed * dt;
      const dz = (-cos * fz - sin * fx) * speed * dt;
      this.camera.position.x += dx;
      this.camera.position.z += dz;
      this._resolveCollisions();
    }

    this._applyRotation();
    if (this._rayFrame % 2 === 0) this._updateInteract();   // 30 Hz is plenty for prompts
  }

  _applyRotation() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  _resolveCollisions() {
    const ray = this._collisionRay || (this._collisionRay = new THREE.Raycaster());
    const origin = this._colOrigin || (this._colOrigin = new THREE.Vector3());
    const dir = this._colDir || (this._colDir = new THREE.Vector3());
    ray.far = this.playerRadius + 0.12;
    origin.set(this.camera.position.x, Math.max(0.5, this.camera.position.y - 0.9), this.camera.position.z);
    for (const [dx, dz] of _COL_DIRS) {
      dir.set(dx, 0, dz);
      ray.set(origin, dir);
      const hits = ray.intersectObjects(this.collisionMeshes, true);
      if (hits.length > 0 && hits[0].distance < this.playerRadius + 0.12) {
        const push = (this.playerRadius + 0.12) - hits[0].distance;
        this.camera.position.x -= dx * push;
        this.camera.position.z -= dz * push;
        origin.x -= dx * push; origin.z -= dz * push;
      }
    }
  }

  /* ---------------- interaction ---------------- */
  addInteractable(id, object, data) {
    this.interactableObjects.set(id, { object, data });
    const tag = (o) => { o.userData.interactableId = id; };
    if (Array.isArray(object)) object.forEach(tag); else tag(object);
  }

  removeInteractable(id) {
    const entry = this.interactableObjects.get(id);
    if (entry) {
      const clear = (o) => { delete o.userData.interactableId; };
      if (Array.isArray(entry.object)) entry.object.forEach(clear); else clear(entry.object);
      this.interactableObjects.delete(id);
    }
  }

  _updateInteract() {
    if (!this.enabled) { this._setInteractable(null); return; }
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = this.interactionDistance;
    let best = null, bestDist = Infinity;
    for (const [id, entry] of this.interactableObjects) {
      const objects = Array.isArray(entry.object) ? entry.object : [entry.object];
      const hits = this.raycaster.intersectObjects(objects, true);
      if (hits.length > 0 && hits[0].distance < bestDist) {
        bestDist = hits[0].distance;
        best = { id, ...entry, distance: hits[0].distance, point: hits[0].point };
      }
    }
    this._setInteractable(best);
  }

  _setInteractable(next) {
    if (next === this.currentInteractable) return;
    if (this.currentInteractable && this.onInteractableLeave) this.onInteractableLeave(this.currentInteractable);
    this.currentInteractable = next;
    if (next && this.onInteractableEnter) this.onInteractableEnter(next);
  }

  interact() { if (this.currentInteractable && this.onInteract) this.onInteract(this.currentInteractable); }
  inspect() { if (this.currentInteractable && this.onInspect) this.onInspect(this.currentInteractable, true); }
}

/* ============================================================
   GameApp — duck-typed launcher application
   ============================================================ */
export default class TwinOpsGame {
  constructor(host) {
    this.host = host;
    this.root = host.root;
    this.meta = { ...meta };
    this.config = null;
    this.destroyed = false;
    this.raf = null;
    this.missions = [];
    this.stats = { missions: 0, incidents: 0, citations: 0, failed: 0 };
    this.incidentCooldown = {};
    this.panelOpen = false;
    this.paused = false;
    this._acc = { hud: 0, screens: 0, missions: 0, director: 0 };
    this._keys = (e) => this._onKey(e);
  }

  /* ---------------- persistence ---------------- */
  loadGameConfig() {
    const saved = storage.get(CONFIG_KEY, null) || {};
    return {
      xp: +saved.xp || 0,
      credits: +saved.credits || 0,
      pos: Array.isArray(saved.pos) ? saved.pos : [0, 1.7, -6],
      yaw: +saved.yaw || 0,
      simTime: Number.isFinite(+saved.simTime) ? +saved.simTime : 10 * 3600 + 20 * 60,
      settings: { sensitivity: 1, fov: 72, speed: 1, ...(saved.settings || {}) },
      stats: { missions: 0, incidents: 0, citations: 0, failed: 0, ...(saved.stats || {}) },
    };
  }

  saveConfig() {
    if (this.destroyed || !this.config) return;
    try {
      if (this.controls) {
        const p = this.camera.position;
        this.config.pos = [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
        this.config.yaw = +this.controls.yaw.toFixed(3);
      }
      this.config.simTime = Math.round(this.twinLink.clock % DAY_LENGTH);
      this.config.stats = this.stats;
      storage.set(CONFIG_KEY, this.config);
      this.twinLink?.persistAll();
    } catch (e) { console.warn('game save failed', e); }
  }

  /* ---------------- lifecycle ---------------- */
  async mount() {
    this.config = this.loadGameConfig();
    this.stats = this.config.stats;
    this._injectStyles();

    /* DOM root */
    this.rootEl = el('div', { class: 'twops-root', id: 'twops-root' });
    this.canvasWrap = el('div', { class: 'twops-canvas' });
    this.rootEl.appendChild(this.canvasWrap);
    this.root.innerHTML = '';
    this.root.appendChild(this.rootEl);

    /* renderer */
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      this.rootEl.appendChild(el('div', { class: 'twops-fatal' }, 'WebGL is not available in this runtime.', el('br'), String(err?.message || err)));
      throw err;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.renderer.setSize(this.rootEl.clientWidth || window.innerWidth, this.rootEl.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'twops-gl';
    this.canvasWrap.appendChild(this.renderer.domElement);

    /* scene */
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1420);
    // linear fog doubles as the district visibility cover: far districts fade
    // out fully before the cull radius hides them (no popping)
    this.scene.fog = new THREE.Fog(0x0a1420, 22, 68);
    this.camera = new THREE.PerspectiveCamera(this.config.settings.fov || 72, 16 / 9, 0.1, 180);
    this.camera.position.set(...this.config.pos);

    this.hemi = new THREE.HemisphereLight(0x9fc4dd, 0x1c2a33, 0.55);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 1.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 5;
    this.sun.shadow.camera.far = 160;
    const S = 40; // tight, player-following frustum (see _syncWorld)
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.target.position.set(0, 0, 0);
    this.scene.add(this.sun, this.sun.target);
    this.ambient = new THREE.AmbientLight(0x223646, 0.5);
    this.scene.add(this.ambient);

    /* campus terrain + the five REAL twin applications */
    this.world = buildCampus(this.scene);
    this.twinLink = await createTwinLink();
    this.twinLink.clock = this.config.simTime || (10 * 3600 + 20 * 60);

    /* live bus — the program side (base.js) publishes here when co-open */
    this.bus = createTwinBus();
    window.__TWINBUS__ = this.bus;
    this.twinLink.attachBus(this.bus);

    /* place each real twin world on its campus plot */
    this.twinWrappers = {};
    for (const f of FACILITIES) {
      const twin = this.twinLink.twins[f.id];
      const wrap = extractWorld(twin);
      const plot = this.world.plots[f.id];
      wrap.position.set(plot.x, 0, plot.z);
      wrap.rotation.y = plot.yaw;
      this.scene.add(wrap);
      wrap.updateMatrixWorld(true);
      this.twinWrappers[f.id] = wrap;
    }

    /* player controls (purpose-built controller) */
    this.controls = new TwinOpsControls(this.camera, this.renderer.domElement);
    this.controls.lookSpeed = 0.0021 * (this.config.settings.sensitivity || 1);
    this.controls.onInteract = (it) => this._interact(it);
    this.controls.onInspect = (it) => this._interact(it, true);
    this.controls.onInteractableEnter = (it) => this._showPrompt(it);
    this.controls.onInteractableLeave = () => this._showPrompt(null);
    this.controls.onLookChange = () => this._refreshLockOverlay();
    this._collectColliders();
    this._buildInteractables();

    /* HUD */
    this._buildHud();

    /* restore orientation */
    this.controls.teleportTo(this.config.pos[0], this.config.pos[1], this.config.pos[2], this.config.yaw, 0);

    /* input */
    this.renderer.domElement.addEventListener('click', this._canvasClick = () => {
      if (!this.panelOpen && !this.paused && !this.menuOpen) this.controls.requestLook();
    });
    window.addEventListener('keydown', this._keys);
    window.addEventListener('resize', this._resize = () => this._onResize());
    this._onResize();
    requestAnimationFrame(() => !this.destroyed && this._onResize());

    /* prewarm every shader/texture while the loading overlay is still up —
       eliminates first-appearance compile hitches during play */
    try { this.renderer.compile(this.scene, this.camera); } catch { /* ignore */ }

    /* intro toast + start loop */
    this.toast('TWIN OPS shift started — five twins linked. Respond to work orders, keep the site running.', 'ok', 6000);
    this._loop = this._loop.bind(this);
    this._lastT = performance.now();
    this.raf = requestAnimationFrame(this._loop);
    this._saveTimer = setInterval(() => this.saveConfig(), 15000);

    /* the game's main menu: choose the deployment district */
    this.showDeploymentMenu();
    return this;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    clearInterval(this._saveTimer);
    window.removeEventListener('keydown', this._keys);
    window.removeEventListener('resize', this._resize);
    try { this.controls?.dispose(); } catch { /* ignore */ }

    try { this.saveConfig(); } catch { /* ignore */ }
    try { this.twinLink?.dispose(); } catch { /* ignore */ }
    try { this.bus?.close(); } catch { /* ignore */ }
    if (window.__TWINBUS__ === this.bus) delete window.__TWINBUS__;
    try { this.scene?.traverse((o) => { o.geometry?.dispose?.(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { m.map?.dispose?.(); m.dispose?.(); }); } }); } catch { /* ignore */ }
    try { this.renderer?.dispose(); } catch { /* ignore */ }
    document.getElementById('twops-style')?.remove();
    this.root.innerHTML = '';
  }

  /* ---------------- collision + interactables ---------------- */
  _collectColliders() {
    const list = [];
    // walkable site floor (invisible slab, top surface at y = 0)
    const floor = new THREE.Mesh(new THREE.BoxGeometry(200, 1, 200), new THREE.MeshBasicMaterial({ visible: false }));
    floor.position.set(0, -0.5, 0);
    this.scene.add(floor);
    list.push(floor);
    // the real twins register their own colliders — use them
    for (const f of FACILITIES) {
      const twin = this.twinLink.twins[f.id];
      for (const m of (twin.scene?.colliders || [])) list.push(m);
    }
    // cold storage walls (solid envelope around the real building)
    try {
      const coldWalls = this.twinLink.twins.cold.scene.getCategory('walls');
      if (coldWalls) coldWalls.traverse(o => { if (o.isMesh) list.push(o); });
    } catch { /* ignore */ }
    // terminals (solid pedestals)
    for (const t of this.terminals || []) list.push(t.mesh);
    // perimeter walls (invisible)
    const B = 96, H = 6;
    const wallMat = new THREE.MeshBasicMaterial({ visible: false });
    const mk = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat); m.position.set(x, H / 2, z); this.scene.add(m); list.push(m); };
    mk(B * 2 + 4, 2, 0, -B); mk(B * 2 + 4, 2, 0, B); mk(2, B * 2 + 4, -B, 0); mk(2, B * 2 + 4, B, 0);
    this.collisionMeshes = list;
    this.controls.setCollisionMeshes(list);
  }

  _makeTerminal(x, z, facility, label) {
    const g = new THREE.Group();
    const fm = facilityMeta(facility);
    const pedestal = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 1.05, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x24313b, roughness: 0.6, metalness: 0.3 }),
    );
    pedestal.position.set(0, 0.52, 0);
    pedestal.castShadow = true; pedestal.receiveShadow = true;
    g.add(pedestal);
    const scr = makePanelScreen(fm);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.62), new THREE.MeshBasicMaterial({ map: scr.tex }));
    screen.position.set(0, 1.08, 0.31);
    screen.rotation.x = -0.28;
    g.add(screen);
    g.position.set(x, 0, z);
    g.lookAt(0, 0, -12);
    this.scene.add(g);
    return { group: g, mesh: pedestal, screen, scr, facility, label };
  }

  _buildInteractables() {
    this.terminals = [];
    /* field terminals + repair hatches at each twin's real service points */
    for (const f of FACILITIES) {
      const sp = SERVICE_POINTS[f.id];
      const wrap = this.twinWrappers[f.id];
      const tPos = wrap.localToWorld(new THREE.Vector3(sp.terminal[0], 0, sp.terminal[1]));
      const rPos = wrap.localToWorld(new THREE.Vector3(sp.repair[0], 0, sp.repair[1]));
      const t = this._makeTerminal(tPos.x, tPos.z, f.id, f.name);
      this.terminals.push(t);
      this.controls.addInteractable(`terminal:${f.id}`, [t.mesh, t.screen], { type: 'terminal', facility: f.id, label: `${f.name} Control Panel` });
      const hatch = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.7, 0.16),
        new THREE.MeshStandardMaterial({ color: 0xd9a63c, roughness: 0.5, metalness: 0.3, emissive: 0x6a4d12, emissiveIntensity: 0.4 }),
      );
      hatch.position.set(rPos.x, 1.05, rPos.z);
      hatch.castShadow = true;
      this.scene.add(hatch);
      this.repairHatches = this.repairHatches || {};
      this.repairHatches[f.id] = hatch;
      this.controls.addInteractable(`repair:${f.id}`, hatch, { type: 'repair', facility: f.id, label: REPAIR_LABELS[f.id] });
    }
    /* interact directly with the REAL twin objects */
    const inter = (id) => this.twinLink.twins[id]?.scene?.interactives || null;
    const coldDoor = inter('cold')?.get('door-freezer');
    if (coldDoor) this.controls.addInteractable('cold-door', coldDoor.root, { type: 'door', facility: 'cold', label: 'Walk-in Freezer Door' });
    const binA = inter('conveyor')?.get('bin.A');
    const binB = inter('conveyor')?.get('bin.B');
    if (binA) this.controls.addInteractable('bin:A', binA.root, { type: 'bin', bin: 'A', label: 'Sort Bin A' });
    if (binB) this.controls.addInteractable('bin:B', binB.root, { type: 'bin', bin: 'B', label: 'Sort Bin B' });
    const booth = inter('parking')?.get('booth');
    if (booth) this.controls.addInteractable('booth', booth.root, { type: 'booth', label: 'Enforcement Booth' });
  }

  /* ---------------- HUD ---------------- */
  _injectStyles() {
    if (document.getElementById('twops-style')) return;
    const st = document.createElement('style');
    st.id = 'twops-style';
    st.textContent = `
.twops-root{position:absolute;inset:0;background:#050a10;overflow:hidden;font-family:"Segoe UI",system-ui,sans-serif;color:#dfe9f0}
.twops-canvas{position:absolute;inset:0}
.twops-gl{display:block;width:100%;height:100%;cursor:crosshair}
.twops-hud{position:absolute;inset:0;pointer-events:none;user-select:none}
.twops-hud .clickable{pointer-events:auto}
.twops-top{position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;gap:18px;align-items:center;background:rgba(7,14,20,.82);border:1px solid rgba(70,169,255,.25);border-radius:12px;padding:8px 18px;backdrop-filter:blur(6px)}
.twops-top b{font-size:15px;letter-spacing:.4px}
.twops-top .sep{opacity:.25}
.twops-xp{min-width:150px}
.twops-xpbar{height:4px;background:#13212c;border-radius:3px;margin-top:4px;overflow:hidden}
.twops-xpbar i{display:block;height:100%;background:linear-gradient(90deg,#36e2c2,#46a9ff);border-radius:3px;transition:width .4s}
.twops-cards{position:absolute;right:14px;top:64px;display:flex;flex-direction:column;gap:8px;width:252px}
.twops-card{background:rgba(7,14,20,.82);border:1px solid rgba(255,255,255,.08);border-left:3px solid var(--acc,#46a9ff);border-radius:10px;padding:8px 11px;backdrop-filter:blur(6px)}
.twops-card h4{margin:0 0 2px;font-size:12px;letter-spacing:.6px;color:var(--acc,#46a9ff);display:flex;justify-content:space-between;align-items:center}
.twops-card h4 .live{font-size:9px;padding:1px 6px;border-radius:8px;background:rgba(60,229,139,.15);color:#3ce58b;border:1px solid rgba(60,229,139,.4)}
.twops-card h4 .live.shadow{background:rgba(127,151,166,.1);color:#7f97a6;border-color:rgba(127,151,166,.3)}
.twops-card .pv{font-size:20px;font-weight:700}
.twops-card .pv small{font-size:11px;color:#7f97a6;font-weight:600;margin-left:3px}
.twops-card .meter{height:4px;background:#13212c;border-radius:3px;margin:5px 0 4px;overflow:hidden}
.twops-card .meter i{display:block;height:100%;border-radius:3px;transition:width .3s}
.twops-card .st{font-size:11px;color:#9db2c0}
.twops-card.warn{border-left-color:#ffb547}.twops-card.danger{border-left-color:#ff4a5f;box-shadow:0 0 18px rgba(255,74,95,.25)}
.twops-missions{position:absolute;left:14px;top:64px;width:280px;display:flex;flex-direction:column;gap:8px}
.twops-missions h3{margin:0 0 2px;font-size:11px;letter-spacing:1.4px;color:#7f97a6}
.twops-mission{background:rgba(7,14,20,.85);border:1px solid rgba(255,181,71,.3);border-radius:10px;padding:9px 12px;backdrop-filter:blur(6px)}
.twops-mission.urgent{border-color:rgba(255,74,95,.55);animation:twops-pulse 1.2s infinite}
.twops-mission h5{margin:0 0 3px;font-size:13px;color:#ffd58a}
.twops-mission.urgent h5{color:#ff8a96}
.twops-mission p{margin:0;font-size:11px;color:#9db2c0;line-height:1.45}
.twops-mission .ttl{font-size:10px;color:#7f97a6;margin-top:4px}
@keyframes twops-pulse{0%,100%{box-shadow:0 0 0 rgba(255,74,95,0)}50%{box-shadow:0 0 16px rgba(255,74,95,.35)}}
.twops-cross{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:16px;height:16px;opacity:.75}
.twops-cross:before,.twops-cross:after{content:"";position:absolute;background:#cfe3ef}
.twops-cross:before{left:7px;top:0;width:2px;height:16px}
.twops-cross:after{top:7px;left:0;width:16px;height:2px}
.twops-prompt{position:absolute;left:50%;top:57%;transform:translateX(-50%);background:rgba(7,14,20,.9);border:1px solid rgba(70,169,255,.4);border-radius:10px;padding:8px 16px;font-size:13px;display:none}
.twops-prompt b{color:#46a9ff}
.twops-toasts{position:absolute;bottom:86px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;align-items:center}
.twops-toast{background:rgba(7,14,20,.92);border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px 16px;font-size:13px;max-width:520px;animation:twops-in .25s ease}
.twops-toast.ok{border-color:rgba(60,229,139,.5)}.twops-toast.warn{border-color:rgba(255,181,71,.5)}.twops-toast.danger{border-color:rgba(255,74,95,.6)}
@keyframes twops-in{from{opacity:0;transform:translateY(8px)}to{opacity:1}}
.twops-hint{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);font-size:11px;color:#7f97a6;letter-spacing:.4px;background:rgba(7,14,20,.6);padding:5px 14px;border-radius:8px}
.twops-lock{position:absolute;inset:0;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;background:rgba(4,8,12,.72);backdrop-filter:blur(4px);cursor:pointer}
.twops-lock h2{margin:0;font-size:26px;letter-spacing:2px;color:#9fd8ef}
.twops-lock p{margin:0;color:#7f97a6;font-size:13px}
.twops-menu,.twops-panel{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(3,7,11,.66);backdrop-filter:blur(5px);pointer-events:auto}
.twops-panel input,.twops-panel select,.twops-panel button{pointer-events:auto}
.twops-dialog{background:#0b141c;border:1px solid rgba(70,169,255,.3);border-radius:16px;min-width:420px;max-width:640px;max-height:82vh;overflow:auto;box-shadow:0 18px 60px rgba(0,0,0,.5)}
.twops-dialog header{padding:16px 20px 10px;border-bottom:1px solid rgba(255,255,255,.07);display:flex;justify-content:space-between;align-items:center}
.twops-dialog header h2{margin:0;font-size:17px;letter-spacing:.4px}
.twops-dialog header span{font-size:11px;color:#7f97a6;letter-spacing:1px}
.twops-dialog .bd{padding:14px 20px}
.twops-dialog footer{padding:12px 20px 16px;display:flex;gap:10px;justify-content:flex-end}
.twops-btn{pointer-events:auto;cursor:pointer;background:#15242f;color:#dfe9f0;border:1px solid rgba(255,255,255,.14);border-radius:9px;padding:8px 16px;font-size:13px;font-weight:600;font-family:inherit}
.twops-btn:hover{background:#1c3140}
.twops-btn.primary{background:#123a52;border-color:rgba(70,169,255,.5);color:#bfe3f7}
.twops-btn.primary:hover{background:#164663}
.twops-btn.danger{background:#3a151c;border-color:rgba(255,74,95,.5);color:#ffb9c1}
.twops-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.twops-row:last-child{border-bottom:0}
.twops-row .lb{font-size:13px;color:#c8d8e4}
.twops-row .lb small{display:block;color:#7f97a6;font-size:11px;margin-top:2px}
.twops-row input[type=range]{width:170px;accent-color:#46a9ff}
.twops-row select{background:#15242f;color:#dfe9f0;border:1px solid rgba(255,255,255,.15);border-radius:7px;padding:5px 8px;font-family:inherit}
.twops-switch{pointer-events:auto;cursor:pointer;width:40px;height:21px;border-radius:12px;background:#25333e;border:1px solid rgba(255,255,255,.15);position:relative;transition:background .2s}
.twops-switch i{position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#8ba3b4;transition:all .2s}
.twops-switch.on{background:#1b4d68}.twops-switch.on i{left:21px;background:#5fd7f2}
.twops-kv{font-size:13px;color:#9db2c0;line-height:1.7}
.twops-kv b{color:#dfe9f0}
.twops-deploy-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(212px,1fr));gap:10px;margin-top:10px}
.twops-deploy-card{cursor:pointer;border:1px solid rgba(255,255,255,.1);border-left:3px solid var(--acc,#46a9ff);border-radius:12px;padding:11px 13px;background:rgba(13,22,30,.9);transition:transform .15s,background .15s}
.twops-deploy-card:hover{background:rgba(24,40,52,.95);transform:translateY(-2px)}
.twops-deploy-code{font-size:11px;letter-spacing:.8px;font-weight:700;margin-bottom:4px}
.twops-deploy-status{font-size:12px;color:#9db2c0;margin-bottom:8px;line-height:1.5}
.twops-deploy-cta{font-size:11px;color:#7f97a6}
.twops-deploy-head{font-size:11px;letter-spacing:1.6px;color:#7f97a6;margin:4px 0 2px}
.twops-fatal{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ff8a96;font-size:15px;text-align:center;line-height:1.8}
`;
    document.head.appendChild(st);
  }

  _buildHud() {
    this.hud = el('div', { class: 'twops-hud' });
    /* top bar */
    this.clockEl = el('b', {}, '--:--');
    this.xpVal = el('span', {}, '0');
    this.levelEl = el('span', {}, '1');
    this.xpBar = el('i', { style: { width: '0%' } });
    this.credEl = el('b', {}, '0');
    this.alarmEl = el('b', { style: { color: '#3ce58b' } }, '0');
    this.hud.append(
      el('div', { class: 'twops-top' },
        el('span', {}, 'OPS-07'), el('span', { class: 'sep' }, '|'),
        this.clockEl, el('span', { class: 'sep' }, '|'),
        el('span', { style: { color: '#7f97a6', fontSize: '11px', letterSpacing: '1px' } }, 'ENGINEER LV '), this.levelEl,
        el('span', { class: 'twops-xp' }, el('span', { style: { fontSize: '12px', color: '#9fd8ef' } }, 'XP '), this.xpVal,
          el('div', { class: 'twops-xpbar' }, this.xpBar)),
        el('span', { class: 'sep' }, '|'),
        el('span', { style: { color: '#7f97a6', fontSize: '11px' } }, 'CR '), this.credEl,
        el('span', { class: 'sep' }, '|'),
        el('span', { style: { color: '#7f97a6', fontSize: '11px' } }, 'ALARMS '), this.alarmEl,
      ),
    );
    /* facility cards */
    this.cards = {};
    const cardsWrap = el('div', { class: 'twops-cards' });
    for (const f of FACILITIES) {
      const pv = el('div', { class: 'pv' }, '--', el('small', {}, ''));
      const meter = el('i', { style: { width: '0%', background: f.accent } });
      const st = el('div', { class: 'st' }, '');
      const live = el('span', { class: 'live shadow' }, 'SHADOW');
      const card = el('div', { class: 'twops-card', style: { '--acc': f.accent } },
        el('h4', {}, `${f.code} ${f.name.toUpperCase()}`, live),
        pv, el('div', { class: 'meter' }, meter), st);
      cardsWrap.appendChild(card);
      this.cards[f.id] = { card, pv, meter, st, live, fm: f };
    }
    this.hud.appendChild(cardsWrap);
    /* missions */
    this.missionList = el('div', { class: 'twops-missions' }, el('h3', {}, 'WORK ORDERS'));
    this.hud.appendChild(this.missionList);
    /* crosshair + prompt */
    this.hud.append(el('div', { class: 'twops-cross' }));
    this.promptEl = el('div', { class: 'twops-prompt' });
    this.hud.appendChild(this.promptEl);
    /* toasts */
    this.toastWrap = el('div', { class: 'twops-toasts' });
    this.hud.appendChild(this.toastWrap);
    this.hud.appendChild(el('div', { class: 'twops-hint' },
      'WASD move · SHIFT sprint · SPACE jump · E interact · ESC menu — panel changes apply to the real digital twins'));
    /* click-to-play lock screen */
    this.lockEl = el('div', { class: 'twops-lock clickable' },
      el('h2', {}, 'TWIN OPS'),
      el('p', {}, 'FIELD ENGINEER · FIVE TWINS LINKED'),
      el('p', { style: { color: '#46a9ff' } }, 'Click to enter the site'),
    );
    this.lockEl.addEventListener('click', () => { if (!this.panelOpen && !this.paused) this.controls.requestLook(); });
    this.hud.appendChild(this.lockEl);
    this.rootEl.appendChild(this.hud);
  }

  /* ---------------- interaction ---------------- */
  _showPrompt(it) {
    if (!it) { this.promptEl.style.display = 'none'; return; }
    const d = it.data || {};
    let verb = 'Open';
    if (d.type === 'repair') verb = 'Service';
    else if (d.type === 'bin') verb = 'Empty';
    else if (d.type === 'booth') verb = 'Use';
    else if (d.type === 'door') verb = 'Toggle';
    this.promptEl.innerHTML = '';
    this.promptEl.append(`[E] ${verb} — `, el('b', {}, d.label || it.id));
    this.promptEl.style.display = 'block';
  }

  _interact(it, inspect = false) {
    if (!it) return;
    const d = it.data || {};
    if (d.type === 'terminal') this.openPanel(d.facility);
    else if (d.type === 'repair') this._doRepair(d.facility);
    else if (d.type === 'bin') this._emptyBin(d.bin);
    else if (d.type === 'booth') this._citeOverstays();
    else if (d.type === 'door') {
      const eng = this.twinLink.engines.cold;
      const open = !eng.doorOpen;
      this.twinLink.commandFacility('cold', { type: 'set-door', value: open });
      this.toast(open ? 'Cold room door opened — watch the zone temperatures.' : 'Cold room door closed.', open ? 'warn' : 'ok');
    }
  }

  _doRepair(facility) {
    const eng = this.twinLink.engines[facility];
    let fixed = null;
    if (facility === 'water' && eng.leak) { this.twinLink.commandFacility('water', { type: 'set-leak', value: false }); fixed = 'Reservoir leak sealed'; }
    else if (facility === 'solar' && eng.panelFault) { this.twinLink.commandFacility('solar', { type: 'set-panel-fault', value: false }); fixed = 'PV string re-commissioned'; }
    else if (facility === 'conveyor' && eng.jam) { this.twinLink.commandFacility('conveyor', { type: 'set-jam', value: false }); fixed = 'Line jam cleared'; }
    else if (facility === 'cold' && eng.compressorFault) {
      this.twinLink.commandFacility('cold', { type: 'set-compressor-fault', value: false });
      this.twinLink.commandFacility('cold', { type: 'set-compressor', value: true });
      fixed = 'Refrigeration plant restarted';
    }
    if (fixed) {
      this.stats.incidents++;
      this._award(20, 10, fixed);
      this.toast(`${fixed} — ${facilityMeta(facility).name} recovering.`, 'ok');
    } else {
      this.toast('Service point nominal — nothing to repair right now.', 'info');
    }
  }

  _emptyBin(bin) {
    this.twinLink.commandFacility('conveyor', { type: 'empty-bin', bin });
    this.toast(`Sort bin ${bin} emptied — line ready for the next batch.`, 'ok');
  }

  _citeOverstays() {
    const res = this.twinLink.commandFacility('parking', { type: 'cite-overstays' });
    const n = res?.cited || 0;
    if (n > 0) {
      this.stats.citations += n;
      this._award(12 * n, 8 * n, `${n} overstay citation${n > 1 ? 's' : ''} issued`);
      this.toast(`${n} overstay citation${n > 1 ? 's' : ''} issued from the enforcement booth.`, 'ok');
    } else {
      this.toast('No un-cited overstays in the yard.', 'info');
    }
  }

  /* ---------------- missions ---------------- */
  _missionCheck() {
    const L = this.twinLink;
    for (const f of FACILITIES) {
      const eng = L.engines[f.id];
      const cfg = eng.cfg;
      const tel = eng.telemetry();
      if (tel.status === 'ok') continue;
      const hasOpen = this.missions.some(m => m.facility === f.id && !m.resolved);
      if (hasOpen) continue;
      const m = this._missionFor(f.id, eng, cfg, tel);
      if (m) {
        this.missions.push(m);
        this.toast(`NEW WORK ORDER — ${m.title}`, m.urgent ? 'danger' : 'warn', 5000);
        this._renderMissions();
      }
    }
    // resolution + escalation
    const clock = L.clock;
    for (const m of this.missions) {
      if (m.resolved) continue;
      if (m.done()) {
        m.resolved = true;
        this.stats.missions++;
        this._award(m.xp, m.credits, m.title);
        this.toast(`WORK ORDER COMPLETE — ${m.title} (+${m.xp} XP, +${m.credits} CR)`, 'ok', 5000);
      } else if (clock - m.created > m.deadline) {
        m.resolved = true; m.failed = true;
        this.stats.failed++;
        this.config.xp = Math.max(0, this.config.xp - 15);
        this.toast(`Work order expired — ${m.title}. Reputation -15 XP.`, 'danger', 5000);
      }
    }
    this.missions = this.missions.filter(m => !m.resolved || (Date.now() - m.resolvedAt < 100));
    this.missions.forEach(m => { if (m.resolved && !m.resolvedAt) m.resolvedAt = Date.now(); });
    this.missions = this.missions.filter(m => !m.resolved);
    this._renderMissions();
  }

  _missionFor(id, eng, cfg, tel) {
    const t = Date.now();
    const mk = (title, desc, done, opts = {}) => ({
      id: `${id}-${t}-${Math.random().toString(36).slice(2, 6)}`,
      facility: id, title, desc, done, created: this.twinLink.clock, deadline: opts.deadline ?? 150,
      xp: opts.xp ?? 25, credits: opts.credits ?? 15, urgent: !!opts.urgent,
    });
    switch (id) {
      case 'water': {
        const level = eng.level;
        if (eng.leak) return mk('Restore water supply', 'Booster pump P-01 has failed and the reservoir is draining. Use the pump skid service hatch to restart it.', () => !eng.leak, { urgent: true, deadline: 120, xp: 35, credits: 25 });
        if (level < (cfg.thresholds?.lowLevel ?? 20)) return mk('Refill the reservoir', `Tank level ${level.toFixed(0)}% is below the low threshold. Open the water control panel and start filling.`, () => eng.level > (cfg.thresholds?.lowLevel ?? 20) + 4, { xp: 25, credits: 15 });
        break;
      }
      case 'solar': {
        if (eng.panelFault) return mk('Repair PV string', 'Array output collapsed — a string dropped offline. Inspect the junction box on the array.', () => !eng.panelFault, { urgent: true, deadline: 120, xp: 35, credits: 25 });
        if (eng.soc < (cfg.thresholds?.batteryLow ?? 20)) return mk('Restore battery reserve', `Battery SoC ${eng.soc.toFixed(0)}% is under the reserve floor. Shed non-essential loads at the solar panel or wait for the sun.`, () => eng.soc > (cfg.load?.reserveSoc ?? 30) + 4, { xp: 25, credits: 15 });
        break;
      }
      case 'conveyor': {
        if (eng.jam) return mk('Clear line jam', 'Cartons stalled at the diverter. Clear the jam at the drive station service point.', () => !eng.jam, { urgent: true, deadline: 90, xp: 30, credits: 20 });
        const binFullPct = cfg.thresholds?.binFullPercent ?? 92;
        if (eng.binAPct >= binFullPct || eng.binBPct >= binFullPct) return mk('Empty sort bins', 'A sort bin is at capacity and diverting is failing. Empty the full bin.', () => eng.binAPct < binFullPct && eng.binBPct < binFullPct, { xp: 20, credits: 12 });
        break;
      }
      case 'cold': {
        if (eng.compressorFault) return mk('Restart refrigeration plant', 'Compressor fault — zones are drifting warm and stock is at risk. Restart at the plant hatch.', () => !eng.compressorFault, { urgent: true, deadline: 100, xp: 40, credits: 30 });
        const worst = Math.max(eng.zones.A, eng.zones.B, eng.zones.C, eng.zones.D);
        if (worst > (cfg.thresholds?.criticalTempC ?? -8)) return mk('Cold chain critical', `Warmest zone ${worst.toFixed(1)}°C exceeds the critical band. Close the door / restore compression now.`, () => Math.max(eng.zones.A, eng.zones.B, eng.zones.C, eng.zones.D) < (cfg.thresholds?.criticalTempC ?? -8), { urgent: true, deadline: 90, xp: 40, credits: 30 });
        if (worst > (cfg.thresholds?.safeTempC ?? -12)) return mk('Cold chain at risk', `Warmest zone ${worst.toFixed(1)}°C above the safe band. Check the door and compressor settings.`, () => Math.max(eng.zones.A, eng.zones.B, eng.zones.C, eng.zones.D) < (cfg.thresholds?.safeTempC ?? -12), { xp: 30, credits: 20 });
        break;
      }
      case 'parking': {
        if (eng.overstayCount > 0) return mk('Cite overstay vehicles', `${eng.overstayCount} vehicle(s) past the overstay limit. Issue citations from the enforcement booth.`, () => eng.overstayCount === 0 || eng.allOverstaysCited(), { xp: 20, credits: 12 });
        if (eng.occupancyPct >= (cfg.thresholds?.fullPercent ?? 95)) return mk('Yard at capacity', 'The parking yard is effectively full and arrivals are queuing. Manage turnover from the panel.', () => eng.occupancyPct < (cfg.thresholds?.fullPercent ?? 95) - 5, { xp: 20, credits: 12 });
        break;
      }
    }
    return null;
  }

  _award(xp, credits, label) {
    this.config.xp += xp;
    this.config.credits += credits;
    const before = Math.floor(this.config.xp / 100);
    this._renderHudStats();
    if (Math.floor(this.config.xp / 100) > before) this.toast(`PROMOTION — Engineer level ${Math.floor(this.config.xp / 100) + 1}.`, 'ok', 5000);
  }

  /* incident director — injects faults the field engineer must answer */
  _director(dt) {
    this._acc.director += dt;
    if (this._acc.director < 50) return;
    this._acc.director = 0;
    const clock = this.twinLink.clock;
    const candidates = [
      { id: 'water', can: () => !this.twinLink.engines.water.leak && this.twinLink.engines.water.level > 15, run: () => { this.twinLink.commandFacility('water', { type: 'set-leak', value: true }); return 'Hydraulic fault reported at the water tower — outlet line leaking.'; } },
      { id: 'solar', can: () => !this.twinLink.engines.solar.panelFault && this.twinLink.engines.solar.irradiance > 300, run: () => { this.twinLink.commandFacility('solar', { type: 'set-panel-fault', value: true }); return 'PV string fault — array output dropped.'; } },
      { id: 'conveyor', can: () => !this.twinLink.engines.conveyor.jam && this.twinLink.engines.conveyor.speed > 0.5, run: () => { this.twinLink.commandFacility('conveyor', { type: 'set-jam', value: true }); return 'Carton jam at the diverter — line stalled.'; } },
      { id: 'cold', can: () => !this.twinLink.engines.cold.compressorFault, run: () => { this.twinLink.commandFacility('cold', { type: 'set-compressor-fault', value: true }); this.twinLink.commandFacility('cold', { type: 'set-compressor', value: false }); return 'Refrigeration compressor trip — cold chain drifting.'; } },
    ];
    const avail = candidates.filter(c => c.can() && clock - (this.incidentCooldown[c.id] || -9999) > 240 && !this.missions.some(m => m.facility === c.id));
    if (!avail.length) return;
    const pick = avail[Math.floor(Math.random() * avail.length)];
    this.incidentCooldown[pick.id] = clock;
    const msg = pick.run();
    this.toast(`INCIDENT — ${msg}`, 'danger', 6000);
  }

  /* ---------------- panels (in-game twin control) ---------------- */
  openPanel(facility) {
    if (this.panelOpen) return;
    this.panelOpen = true;
    this.controls.enabled = false;
    this.controls.exitLook();
    const fm = facilityMeta(facility);
    const eng = this.twinLink.engines[facility];
    const body = el('div', {});
    const rows = [];

    const row = (label, sub, control) => {
      const r = el('div', { class: 'twops-row' }, el('div', { class: 'lb' }, label, sub ? el('small', {}, sub) : null), control);
      rows.push(r); body.appendChild(r);
      return r;
    };
    const sw = (on, onChange) => {
      const s = el('div', { class: `twops-switch clickable ${on ? 'on' : ''}` }, el('i', {}));
      s.addEventListener('click', () => { const now = !s.classList.contains('on'); s.classList.toggle('on', now); onChange(now); });
      return s;
    };
    const slider = (min, max, step, value, onInput, fmt = (v) => v) => {
      const wrap = el('span', {}, el('b', { style: { minWidth: '52px', display: 'inline-block', textAlign: 'right', fontSize: '12px' } }, fmt(value)));
      const inp = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
      inp.addEventListener('input', () => { wrap.firstChild.textContent = fmt(+inp.value); onInput(+inp.value); });
      wrap.appendChild(inp);
      return wrap;
    };

    if (facility === 'water') {
      row('Auto-fill', 'Pump fills toward the target level', sw(eng.cfg.autoFill !== false, v => this.twinLink.commandFacility('water', { type: 'set-auto-fill', value: v })));
      row('Target level', 'Auto-fill cutoff', slider(10, 100, 1, eng.cfg.targetLevel ?? 80, v => this.twinLink.commandFacility('water', { type: 'set-target-level', value: v }), v => `${v}%`));
      row('Outlet demand profile', 'Opens the outlet valve on the demand curve', sw(!!eng.cfg.demand?.active, v => this.twinLink.commandFacility('water', { type: 'set-demand', value: v })));
      row('Emergency top-up', 'Push 25% of capacity in now', el('button', { class: 'twops-btn clickable', onclick: () => { this.twinLink.commandFacility('water', { type: 'fill', value: 0.25 }); this.toast('Emergency top-up dispatched — 25% capacity.', 'ok'); } }, 'Fill +25%'));
    } else if (facility === 'solar') {
      for (const l of (eng.cfg.load?.loads || []).slice(0, 6)) {
        row(l.name, `${l.watts} W · ${l.essential ? 'essential' : 'sheddable'}`, sw(!!l.enabled, v => this.twinLink.commandFacility('solar', { type: 'set-load', load: l.id, value: v })));
      }
      row('Cloud cover', 'Weather front over the array', slider(0, 1, 0.05, eng.cfg.sun?.cloudCover ?? 0.08, v => this.twinLink.commandFacility('solar', { type: 'set-cloud', value: v }), v => `${Math.round(v * 100)}%`));
    } else if (facility === 'conveyor') {
      row('Drive motor', 'Main belt drive', sw(!!eng.cfg.motorOn, v => this.twinLink.commandFacility('conveyor', { type: 'set-motor', value: v })));
      row('Belt speed', 'Transport setpoint', slider(0.2, 3, 0.1, eng.cfg.beltSpeed ?? 1.2, v => this.twinLink.commandFacility('conveyor', { type: 'set-speed', value: v }), v => `${v.toFixed(1)} m/s`));
      row('Empty bin A', 'Reset bin A counter', el('button', { class: 'twops-btn clickable', onclick: () => this._emptyBin('A') }, 'Empty A'));
      row('Empty bin B', 'Reset bin B counter', el('button', { class: 'twops-btn clickable', onclick: () => this._emptyBin('B') }, 'Empty B'));
    } else if (facility === 'cold') {
      row('Compressor', 'Refrigeration plant master', sw(!!eng.cfg.compressor?.on, v => this.twinLink.commandFacility('cold', { type: 'set-compressor', value: v })));
      row('Target temperature', 'Plant setpoint', slider(-26, 0, 0.5, eng.cfg.compressor?.targetTemp ?? -18, v => this.twinLink.commandFacility('cold', { type: 'set-target-temp', value: v }), v => `${v.toFixed(1)}°C`));
      row('Room door', 'Open doors warm the zones', sw(!!eng.doorOpen, v => this.twinLink.commandFacility('cold', { type: 'set-door', value: v })));
      row('Zone A damper', 'Cooling air share', slider(0.2, 1, 0.05, eng.cfg.zones?.A?.damper ?? 0.8, v => this.twinLink.commandFacility('cold', { type: 'set-damper', zone: 'A', value: v }), v => `${Math.round(v * 100)}%`));
    } else if (facility === 'parking') {
      row('Automatic arrivals', 'Vehicles keep arriving when on', sw(eng.cfg.spawn?.autoSpawn !== false, v => this.twinLink.commandFacility('parking', { type: 'set-auto-spawn', value: v })));
      row('Arrival interval', 'Average gap between arrivals', slider(5, 90, 1, eng.cfg.spawn?.interval ?? 22, v => { eng.cfg.spawn.interval = v; this.twinLink.markDirty('parking'); }, v => `${v} min`));
      row('Overstay limit', 'Citations apply past this', slider(5, 120, 5, eng.cfg.thresholds?.overstayMinutes ?? 15, v => this.twinLink.commandFacility('parking', { type: 'set-overstay-limit', value: v }), v => `${v} min`));
      row('Issue citations', 'Enforce overstays now', el('button', { class: 'twops-btn clickable', onclick: () => this._citeOverstays() }, 'Cite all'));
    }

    /* live telemetry block */
    const tel = eng.telemetry();
    const kv = el('div', { class: 'twops-kv', style: { marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,.08)' } });
    kv.append(el('div', {}, el('b', {}, `${tel.primary.label}: `), `${fmtVal(tel.primary.value)}${tel.primary.unit || ''}`));
    for (const r of tel.rows.slice(0, 4)) kv.append(el('div', {}, el('b', {}, `${r.label}: `), `${fmtVal(r.value)}${r.unit || ''}`));
    body.appendChild(kv);

    const dlg = el('div', { class: 'twops-dialog' },
      el('header', {}, el('div', {}, el('h2', {}, `${fm.name} — Control Panel`), el('span', {}, `${fm.code} · TWIN LINK ACTIVE`)),
        el('button', { class: 'twops-btn clickable', onclick: () => close() }, 'Close')),
      el('div', { class: 'bd' }, body),
      el('footer', {},
        el('button', { class: 'twops-btn clickable', onclick: () => close() }, 'Done'),
        el('button', { class: 'twops-btn primary clickable', onclick: () => { this.twinLink.persistAll(); this.toast(`${fm.name}: changes written to the twin's saved configuration.`, 'ok'); close(); } }, 'Apply to Twin')),
    );
    const wrapEl = el('div', { class: 'twops-panel clickable' }, dlg);
    const close = () => { wrapEl.remove(); this.panelOpen = false; this.controls.enabled = true; };
    wrapEl.addEventListener('click', (e) => { if (e.target === wrapEl) close(); });
    this.hud.appendChild(wrapEl);
  }

  openPause() {
    if (this.panelOpen || this.paused) return;
    this.paused = true;
    this.controls.enabled = false;
    this.controls.exitLook();
    const body = el('div', {});
    body.appendChild(el('div', { class: 'twops-kv' },
      el('div', {}, el('b', {}, 'Shift report: '), `${this.stats.missions} work orders · ${this.stats.incidents} repairs · ${this.stats.citations} citations · ${this.stats.failed} expired`),
      el('div', {}, el('b', {}, 'Rank: '), `Engineer level ${Math.floor(this.config.xp / 100) + 1} · ${this.config.xp} XP · ${this.config.credits} CR`),
      el('div', {}, el('b', {}, 'Twin link: '), 'config store + live bus active — all changes persist to the program'),
    ));
    const sens = el('input', { type: 'range', min: '0.3', max: '2.5', step: '0.05', value: String(this.config.settings.sensitivity || 1) });
    sens.addEventListener('input', () => { this.config.settings.sensitivity = +sens.value; this.controls.lookSpeed = 0.0021 * this.config.settings.sensitivity; });
    body.appendChild(el('div', { class: 'twops-row' }, el('div', { class: 'lb' }, 'Mouse sensitivity'), sens));
    const spd = el('input', { type: 'range', min: '0.25', max: '4', step: '0.25', value: String(this.config.settings.speed || 1) });
    spd.addEventListener('input', () => { this.config.settings.speed = +spd.value; });
    body.appendChild(el('div', { class: 'twops-row' }, el('div', { class: 'lb' }, 'Site time scale', el('small', {}, 'speeds the twin engines')), spd));
    const q = el('select', {},
      ...['auto', 'performance', 'balanced', 'high'].map(v => {
        const o = el('option', { value: v }, v === 'auto' ? 'Auto (recommended)' : v[0].toUpperCase() + v.slice(1));
        if ((this.config.settings.quality || 'auto') === v) o.setAttribute('selected', '');
        return o;
      }));
    q.addEventListener('change', () => { this.config.settings.quality = q.value; this._applyQuality(); });
    body.appendChild(el('div', { class: 'twops-row' }, el('div', { class: 'lb' }, 'Render quality', el('small', {}, 'auto scales resolution to hold framerate')), q));
    body.appendChild(el('div', { class: 'twops-kv', style: { marginTop: '8px' } },
      'WASD move · SHIFT sprint · SPACE jump · E interact · F inspect · ESC menu'));
    const dlg = el('div', { class: 'twops-dialog' },
      el('header', {}, el('div', {}, el('h2', {}, 'Paused — TWIN OPS'), el('span', {}, 'OPS-07 · FIELD ENGINEER'))),
      el('div', { class: 'bd' }, body),
      el('footer', {},
        el('button', { class: 'twops-btn primary clickable', onclick: () => close() }, 'Resume Shift'),
        el('button', { class: 'twops-btn clickable', onclick: () => { close(); this.showDeploymentMenu(); } }, 'Deployment Menu'),
        el('button', { class: 'twops-btn clickable', onclick: () => { this.saveConfig(); this.toast('Shift saved.', 'ok'); close(); } }, 'Save'),
        el('button', { class: 'twops-btn danger clickable', onclick: () => { this.saveConfig(); close(); this.host.closeInfrastructure?.(); } }, 'End Shift & Save')),
    );
    const wrapEl = el('div', { class: 'twops-panel clickable' }, dlg);
    const close = () => { wrapEl.remove(); this.paused = false; this.controls.enabled = true; };
    wrapEl.addEventListener('click', (e) => { if (e.target === wrapEl) close(); });
    this.hud.appendChild(wrapEl);
  }

  /* ---------------- deployment menu (the game's main menu) ---------------- */
  showDeploymentMenu() {
    if (this.menuOpen || this.destroyed) return;
    this.menuOpen = true;
    this.controls.enabled = false;
    this.controls.exitLook();
    this._refreshLockOverlay();

    const L = this.twinLink;
    const grid = el('div', { class: 'twops-deploy-grid' });
    for (const f of FACILITIES) {
      const tel = L.engines[f.id].telemetry();
      const pv = tel.primary;
      const statusColor = tel.status === 'danger' ? '#ff8a96' : tel.status === 'warn' ? '#ffd58a' : '#3ce58b';
      const card = el('div', { class: 'twops-deploy-card clickable', style: { '--acc': f.accent }, onclick: () => this.deploy(f.id) },
        el('div', { class: 'twops-deploy-code', style: { color: f.accent } }, `${f.code} · ${f.name.toUpperCase()}`),
        el('div', { class: 'twops-deploy-status' },
          el('b', { style: { color: '#dfe9f0' } }, `${fmtVal(pv.value, pv.digits ?? 1)}${pv.unit || ''}`), ` ${pv.label.toLowerCase()}`,
          el('br'), 'Status: ', el('span', { style: { color: statusColor } }, tel.status.toUpperCase())),
        el('div', { class: 'twops-deploy-cta' }, 'Spawn here · open its Digital Twin control room'));
      grid.appendChild(card);
    }

    const body = el('div', {});
    body.appendChild(el('div', { class: 'twops-deploy-head' }, 'SELECT DEPLOYMENT — THE MATCHING DIGITAL TWIN OPENS AUTOMATICALLY'));
    body.appendChild(grid);
    const util = el('div', { class: 'twops-deploy-grid' });
    util.appendChild(el('div', { class: 'twops-deploy-card clickable', style: { '--acc': '#ff8a5c' }, onclick: () => this.deploy(null) },
      el('div', { class: 'twops-deploy-code', style: { color: '#ff8a5c' } }, 'OPS-07 · FULL SITE COMMAND'),
      el('div', { class: 'twops-deploy-status' }, 'Spawn at the central command post with all five twins linked.'),
      el('div', { class: 'twops-deploy-cta' }, 'Whole-site patrol')));
    if (this.config.pos) {
      util.appendChild(el('div', { class: 'twops-deploy-card clickable', style: { '--acc': '#3ce58b' }, onclick: () => this.deploy('resume') },
        el('div', { class: 'twops-deploy-code', style: { color: '#3ce58b' } }, 'RESUME SHIFT'),
        el('div', { class: 'twops-deploy-status' }, 'Continue where you left off — no twin room opened.'),
        el('div', { class: 'twops-deploy-cta' }, 'Back on duty')));
    }
    body.appendChild(el('div', { class: 'twops-deploy-head', style: { marginTop: '12px' } }, 'SITE MOVEMENT'));
    body.appendChild(util);

    const dlg = el('div', { class: 'twops-dialog', style: { width: '660px', maxWidth: '94vw' } },
      el('header', {}, el('div', {}, el('h2', {}, 'TWIN OPS — Deployment'), el('span', {}, 'OPS-07 · FIELD ENGINEER · FIVE TWINS LINKED')),
        el('button', { class: 'twops-btn clickable', onclick: () => this.deploy('resume') }, 'Skip')),
      el('div', { class: 'bd' }, body),
      el('footer', {},
        el('button', { class: 'twops-btn clickable', onclick: () => this.deploy('resume') }, 'Resume Shift')));
    const wrapEl = el('div', { class: 'twops-panel clickable' }, dlg);
    this.menuEl = wrapEl;
    wrapEl.addEventListener('click', (e) => { if (e.target === wrapEl) this.deploy('resume'); });
    this.hud.appendChild(wrapEl);
  }

  closeDeploymentMenu() {
    this.menuOpen = false;
    this.menuEl?.remove();
    this.menuEl = null;
    if (!this.destroyed) this.controls.enabled = true;
    this._refreshLockOverlay();
  }

  /* Deploy: spawn the engineer at the chosen district and open the same
     infrastructure on the Digital Twin Simulator. */
  deploy(id) {
    if (this.destroyed) return;
    this.closeDeploymentMenu();
    if (id === 'resume') {
      this.toast('Back on duty — controls live.', 'ok', 2600);
      this.controls.requestLook();
      return;
    }
    if (id) {
      const fm = facilityMeta(id);
      const plot = this.world.plots[id];
      const wrap = this.twinWrappers[id];
      const sp = SERVICE_POINTS[id];
      const tPos = wrap.localToWorld(new THREE.Vector3(sp.terminal[0], 0, sp.terminal[1]));
      const dir = new THREE.Vector3(plot.x - tPos.x, 0, plot.z - tPos.z).normalize();
      const yaw = Math.atan2(-dir.x, -dir.z);
      this.controls.teleportTo(tPos.x - dir.x * 4, 1.7, tPos.z - dir.z * 4, yaw, 0);
      this.config.lastDistrict = id;
      this.saveConfig();
      this.toast(`Deployed to ${fm.name} — opening its Digital Twin control room…`, 'ok', 5200);
      // The same infrastructure opens on the Digital Twin Simulator:
      // embedded (launcher) → its app manager swaps to the control room;
      // standalone (TwinOps.exe) → the native shell launches
      // IndustrialDigitalTwinSimulator.exe --open=<facility> beside this window.
      this.host.openInfrastructure?.(id);
      if (!this.destroyed) this.controls.requestLook();
    } else {
      this.controls.teleportTo(0, 1.7, -6, 0, 0);
      this.config.lastDistrict = null;
      this.saveConfig();
      this.toast('Full site command — all five twins linked. Patrol the site.', 'ok', 4200);
      this.controls.requestLook();
    }
  }

  _onKey(e) {
    if (e.code !== 'Escape') return;
    if (this.panelOpen) {
      // panel closes via its own buttons; Esc only backs out of the look session
      return;
    }
    if (this.paused) return; // pause dialog handles itself
    this.controls.exitLook();
    this.openPause();
  }

  /* lock-overlay visibility — re-evaluated on look changes and each HUD tick */
  _refreshLockOverlay() {
    if (!this.lockEl || this.destroyed) return;
    const hide = this.panelOpen || this.paused || this.menuOpen
      || this.controls.isLocked()
      || this.controls.hasEntered;   // once inside, dragging / clicking recaptures look
    this.lockEl.style.display = hide ? 'none' : 'flex';
  }

  _onResize() {
    const w = this.rootEl.clientWidth || window.innerWidth;
    const h = this.rootEl.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  toast(msg, tone = 'info', duration = 3800) {
    if (!this.toastWrap) return;
    const t = el('div', { class: `twops-toast ${tone}` }, msg);
    this.toastWrap.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 420); }, duration);
  }

  /* ---------------- main loop ---------------- */
  _loop() {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this._loop);
    const now = performance.now();
    const raw = Math.min((now - this._lastT) / 1000, 0.1);
    this._lastT = now;
    this._frame = (this._frame || 0) + 1;
    const active = !this.paused && !this.panelOpen && !this.menuOpen;
    const simDt = active ? raw * (this.config.settings.speed || 1) : 0;

    /* twin engines tick (this IS the game's heartbeat) — far culled districts
       run staggered at reduced cadence inside tick() */
    if (simDt > 0) {
      this.twinLink.tick(simDt, this._frame, this._nearSet);
      this._acc.missions += simDt;
      this._director(simDt);
    }

    /* player — purpose-built controller, exact ground rest, no bounce */
    this.controls.update(Math.min(raw, 1 / 30));

    /* world mirror: sky, district culling, shadow follow, adaptive resolution */
    this._syncWorld(raw);

    /* HUD throttle */
    this._acc.hud += raw;
    if (this._acc.hud >= 0.25) { this._acc.hud = 0; this._updateHud(); }
    this._acc.screens += raw;
    if (this._acc.screens >= 0.5) { this._acc.screens = 0; this._redrawScreens(); }
    if (this._acc.missions >= 1.5) { this._acc.missions = 0; this._missionCheck(); }

    this.renderer.render(this.scene, this.camera);
  }

  /* ---------------- world sync ---------------- */
  _syncWorld(raw) {
    const L = this.twinLink;
    const clock = L.clock;

    /* sky / sun from the shared sim clock — the twin worlds light and
       animate themselves through their own updateSimulation() */
    const hour = (clock / 3600) % 24;
    const sunT = Math.sin(((hour - 6) / 12) * Math.PI); // 0 at 6/18h
    const dayF = clamp(sunT, 0, 1);
    const cloud = clamp(L.engines.solar.cfg.sun?.cloudCover ?? 0.08, 0, 1);
    const ang = ((hour - 6) / 12) * Math.PI;
    const sunDirX = Math.cos(ang), sunDirY = Math.max(0.12, Math.sin(ang)), sunDirZ = 0.42;
    this.sun.intensity = dayF * 2.2 * (1 - cloud * 0.55);
    this.sun.color.setHSL(0.09 + dayF * 0.045, 0.55 - dayF * 0.25, 0.62);
    this.hemi.intensity = 0.38 + dayF * 0.55;
    this.ambient.intensity = 0.32 + dayF * 0.34;
    const night = new THREE.Color(0x050a12), dawn = new THREE.Color(0x251b2e), day = new THREE.Color(0x7fb2d6);
    const sky = day.clone().lerp(night, 1 - dayF);
    if (hour < 7.5 || hour > 17.5) sky.lerp(dawn, Math.max(0, 1 - Math.abs(hour - 6.5) / 1.5));
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    const lampOn = dayF < 0.25 ? 1.15 : 0;
    for (const lm of this.world.lampMaterials) lm.emissiveIntensity = lampOn;
    for (const wm of this.world.windowMaterials) wm.emissiveIntensity = 0.15 + lampOn * 0.5;

    /* district culling — the performance backbone. The player can only see a
       fraction of the site at once; districts beyond the fog wall are hidden
       (their whole subtree skips render + shadow) and their engines stagger.
       Hysteresis on the radius prevents boundary flicker. */
    const px = this.camera.position.x, pz = this.camera.position.z;
    const nearSet = this._nearSet || (this._nearSet = new Set());
    nearSet.clear();
    for (const f of FACILITIES) {
      const plot = this.world.plots[f.id];
      const dx = px - plot.x, dz = pz - plot.z;
      const d2 = dx * dx + dz * dz;
      const wrap = this.twinWrappers[f.id];
      if (!wrap) continue;
      const vis = wrap.__vis === true;
      if (vis ? d2 < 82 * 82 : d2 < 70 * 70) {
        if (!vis) { wrap.visible = true; wrap.__vis = true; }
      } else if (vis || wrap.__vis === undefined) {
        wrap.visible = false; wrap.__vis = false;
      }
      if (wrap.__vis) nearSet.add(f.id);
    }

    /* shadow camera follows the player — a tight frustum keeps shadow
       texels dense and the pass cheap */
    this.sun.position.set(px + sunDirX * 80, sunDirY * 80, pz + sunDirZ * 80);
    this.sun.target.position.set(px, 0, pz);
    this.sun.target.updateMatrixWorld();

    /* adaptive resolution — guards against GPU shortfalls (integrated
       laptops) by scaling the render target, not the scene */
    this._fpsAcc = (this._fpsAcc || 0) + raw;
    this._fpsFrames = (this._fpsFrames || 0) + 1;
    if (this._fpsAcc >= 1.5) {
      const fps = this._fpsFrames / this._fpsAcc;
      this._fpsAcc = 0; this._fpsFrames = 0;
      const quality = this.config.settings.quality || 'auto';
      if (quality === 'auto') {
        const base = Math.min(window.devicePixelRatio || 1, 1.25);
        let scale = this._qualityScale ?? 1;
        if (fps < 27 && scale > 0.6) scale = Math.max(0.6, scale - 0.15);
        else if (fps > 52 && scale < 1) scale = Math.min(1, scale + 0.1);
        if (scale !== this._qualityScale) {
          this._qualityScale = scale;
          this.renderer.setPixelRatio(base * scale);
        }
      }
    }
  }

  /* quality preset from the pause menu */
  _applyQuality() {
    const quality = this.config.settings.quality || 'auto';
    const base = Math.min(window.devicePixelRatio || 1, 1.25);
    if (quality === 'performance') { this._qualityScale = 0.6; this.renderer.setPixelRatio(base * 0.6); }
    else if (quality === 'balanced') { this._qualityScale = 0.8; this.renderer.setPixelRatio(base * 0.8); }
    else if (quality === 'high') { this._qualityScale = 1; this.renderer.setPixelRatio(base); }
    else { this._qualityScale = 1; this.renderer.setPixelRatio(base); } // auto re-scales itself
  }

  /* ---------------- HUD sync ---------------- */
  _updateHud() {
    const L = this.twinLink;
    const h = Math.floor(L.clock / 3600) % 24, m = Math.floor((L.clock % 3600) / 60);
    this.clockEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    this._renderHudStats();
    this._refreshLockOverlay();
    let alarms = 0;
    for (const f of FACILITIES) {
      const c = this.cards[f.id];
      const eng = L.engines[f.id];
      const tel = eng.telemetry();
      const live = L.isLive(f.id);
      c.live.textContent = live ? 'TWIN LIVE' : 'SHADOW';
      c.live.className = `live ${live ? '' : 'shadow'}`;
      const digits = tel.primary.value > 999 ? 0 : 1;
      c.pv.firstChild.textContent = fmtVal(tel.primary.value, digits);
      c.pv.lastChild.textContent = tel.primary.unit || '';
      c.meter.style.width = `${clamp(tel.primary.pct ?? 0, 0, 100)}%`;
      c.meter.style.background = tel.status === 'danger' ? '#ff4a5f' : tel.status === 'warn' ? '#ffb547' : f.accent;
      c.st.textContent = tel.rows.slice(0, 2).map(r => `${r.label} ${fmtVal(r.value)}${r.unit || ''}`).join(' · ');
      c.card.className = `twops-card ${tel.status === 'ok' ? '' : tel.status}`;
      if (tel.status !== 'ok') alarms++;
    }
    this.alarmEl.textContent = String(alarms);
    this.alarmEl.style.color = alarms === 0 ? '#3ce58b' : alarms > 2 ? '#ff4a5f' : '#ffb547';
  }

  _renderHudStats() {
    const lvl = Math.floor(this.config.xp / 100) + 1;
    const into = this.config.xp % 100;
    this.levelEl.textContent = String(lvl);
    this.xpVal.textContent = String(this.config.xp);
    this.xpBar.style.width = `${into}%`;
    this.credEl.textContent = String(this.config.credits);
  }

  _renderMissions() {
    this.missionList.innerHTML = '';
    this.missionList.appendChild(el('h3', {}, `WORK ORDERS${this.missions.length ? ` · ${this.missions.length}` : ''}`));
    if (!this.missions.length) {
      this.missionList.appendChild(el('div', { class: 'twops-mission', style: { borderColor: 'rgba(60,229,139,.35)' } },
        el('h5', { style: { color: '#3ce58b' } }, 'All clear'),
        el('p', {}, 'Every twin is inside its operating band. The site incident director may inject faults at any time — stay sharp.')));
      return;
    }
    for (const m of this.missions) {
      const fm = facilityMeta(m.facility);
      const left = Math.max(0, Math.round(m.deadline - (this.twinLink.clock - m.created)));
      this.missionList.appendChild(el('div', { class: `twops-mission ${m.urgent ? 'urgent' : ''}` },
        el('h5', {}, m.title),
        el('p', {}, m.desc),
        el('div', { class: 'ttl' }, `${fm.code} · +${m.xp} XP · expires in ${left}s`)));
    }
  }

  _redrawScreens() {
    const L = this.twinLink;
    for (const t of this.terminals) {
      try { t.scr.draw({ status: L.engines[t.facility].telemetry().status }); } catch { /* ignore */ }
    }
  }
}

/* ---------------- helpers ---------------- */
function fmtVal(v, digits = 1) {
  if (typeof v === 'string') return v;
  if (!Number.isFinite(+v)) return '--';
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('en-US');
  return (+v).toFixed(digits);
}

function clamp01(v) { return Math.max(0, Math.min(1, +v || 0)); }

function makePanelScreen(fm) {
  const cnv = document.createElement('canvas');
  cnv.width = 128; cnv.height = 84;
  const tex = new THREE.CanvasTexture(cnv);
  const scr = { tex };
  scr.draw = ({ status = 'ok' } = {}) => {
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = '#0a1119'; ctx.fillRect(0, 0, 128, 84);
    ctx.strokeStyle = '#2c3d4c'; ctx.strokeRect(2, 2, 124, 80);
    ctx.fillStyle = fm.accent; ctx.font = '700 17px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(fm.code, 64, 26);
    const col = status === 'danger' ? '#ff4a5f' : status === 'warn' ? '#ffb547' : '#3ce58b';
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(64, 54, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7f97a6'; ctx.font = '600 11px "Segoe UI", sans-serif';
    ctx.fillText(status === 'ok' ? 'NOMINAL' : status.toUpperCase(), 64, 74);
    tex.needsUpdate = true;
  };
  scr.draw();
  return scr;
}
