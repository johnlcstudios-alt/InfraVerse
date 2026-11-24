/* ============================================================
   TWINHOST — runs the REAL digital-twin applications headless
   inside the game.

   Each infrastructure's own class (SmartWaterTank, SolarBattery,
   ConveyorSortingLine, ColdStorageRoom, SmartParkingLot) is
   instantiated against a faithful replica of the platform's
   SceneView environment — same world group, same category
   system, same interactive/collider registry and the same
   lighting rig — and its own buildWorld() constructs the EXACT
   facility model, layout and setup used in the Digital Twin
   program. Its own updateSimulation(dt) then drives that model
   every tick, with its own config loaded from the program's
   saved configuration store.

   Nothing here re-implements a twin; it only provides the
   environment the twins already expect.
   ============================================================ */
import * as THREE from 'three';
import { group, textSprite } from '../core/scene.js';

/* Faithful headless replica of the platform SceneView surface used
   by the twin worlds: world group, categories, interactives,
   colliders, lighting rig, camera/controls/fps stubs. */
export class TwinSceneShim {
  constructor() {
    this.scene = new THREE.Scene();

    /* Lighting rig — identical to SceneView._setupEnvironment() */
    const hemi = new THREE.HemisphereLight(0x9cc9ff, 0x182531, 1.0);
    hemi.position.set(0, 30, 0);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff1dd, 2.3);
    key.position.set(22, 34, 16);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -34;
    key.shadow.camera.right = 34;
    key.shadow.camera.top = 34;
    key.shadow.camera.bottom = -34;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 100;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    this.keyLight = key;
    const fill = new THREE.DirectionalLight(0x7db5ff, 0.55);
    fill.position.set(-24, 16, -18);
    this.scene.add(fill);
    this.rim = new THREE.DirectionalLight(0x4fd6c3, 0.42);
    this.rim.position.set(-8, 8, 22);
    this.scene.add(this.rim);
    this.scene.add(new THREE.AmbientLight(0x3b4e63, 0.46));

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1200);
    this.camera.position.set(18, 14, 20);
    this.controls = { target: new THREE.Vector3(0, 2, 0) };

    this.world = group('world');
    this.scene.add(this.world);
    this.categories = new Map();
    this.categoryOrder = [];
    this.interactives = new Map();
    this.interactiveMeshes = [];
    this.colliders = [];
    this.selectedRoot = null;
    this.selectedId = null;
    this.fps = { frames: 0, last: performance.now(), value: 60, tris: 0, calls: 0 };
    this.onSelect = null;
    this.onDoubleClick = null;
    this.onHover = null;
  }

  addCategory({ id, label, kind = 'structure', parent = null, hidden = false }) {
    if (this.categories.has(id)) return this.categories.get(id).group;
    const g = group(`cat-${id}`);
    (parent || this.world).add(g);
    const cat = { id, label, kind, group: g, hidden };
    this.categories.set(id, cat);
    this.categoryOrder.push(cat);
    g.visible = !hidden;
    return g;
  }

  getCategory(id) { return this.categories.get(id); }

  registerInteractive(root, spec) {
    root.userData.interactiveId = spec.id;
    root.traverse(o => {
      if (o.isMesh) o.userData.interactiveId = spec.id;
      if (o.isSprite) o.raycast = () => {};
    });
    this.interactives.set(spec.id, { ...spec, root });
    return root;
  }

  unregister(id) {
    this.interactives.delete(id);
  }

  addCollider(obj) {
    obj.traverse(o => { if (o.isMesh) this.colliders.push(o); });
    return obj;
  }

  setBackground() { /* the game owns sky/fog */ }

  getVisibility() {
    const map = {};
    for (const cat of this.categoryOrder) map[cat.id] = { visible: cat.group.visible, hidden: cat.hidden };
    return map;
  }

  setVisibility() { /* visibility UI not used in the game */ }
  showAll() { for (const cat of this.categoryOrder) { cat.group.visible = true; cat.hidden = false; } }
  hideAll() { for (const cat of this.categoryOrder) { cat.group.visible = false; cat.hidden = true; } }
  hideKind() {}
  showKind() {}
  select() {}
  clearSelection() {}
  isolateCategory() {}
  update() {}
  render() {}
  resize() {}
  dispose() {}
}

/* Instantiate one REAL twin application headless: real class, real saved
   configuration, real sensors/alarms, real buildWorld geometry. */
export function createHeadlessTwin(FacilityClass, stubHost) {
  const inst = new FacilityClass(stubHost);
  inst.config = inst.loadConfig();                    // the program's saved configuration
  inst.speed = inst.config.simSpeed || 1;
  inst.manualMode = !!inst.config.manual;
  inst.range = inst.config.analyticsRange || 900;
  inst.sensorDefs = inst.defineSensors();
  inst.initSensors();
  inst.initAlarmRules();
  inst.loadHistory();
  inst.scene = new TwinSceneShim();
  inst.initFirstPerson = () => {};                    // the game brings its own controller
  inst.buildWorld();                                  // EXACT twin model, layout & setup
  return inst;
}

/* Shared stub host — the twins only need a root element. */
export function createStubHost() {
  const root = document.createElement('div');
  return {
    root,
    openInfrastructure: () => {},
    closeInfrastructure: () => {},
    global: {},
  };
}

/* Attach a built twin world into the game campus. Returns nothing;
   the caller positions the returned wrapper. */
export function extractWorld(inst) {
  const wrapper = new THREE.Group();
  wrapper.name = `twin-${inst.id}`;
  // move the twin's world content (categories + everything else) under the wrapper
  const src = inst.scene.world;
  while (src.children.length) wrapper.add(src.children[0]);
  return wrapper;
}

/* Re-attach labels sprite helper re-export for callers that need it */
export { textSprite };
