/* ============================================================
   TWIN OPS — campus terrain (from scratch)

   The five infrastructure twins in this game are the REAL twin
   applications (built by twinhost.js from the program's own
   classes). This module provides only the connective site:
   terrain, the road network, street lighting and the central
   command post, plus the PLOTS each real twin world is placed
   on — arranged after the campus site plan of the Integrated
   Use-Case Scenario, scaled for the full-size twin worlds.
   ============================================================ */
import * as THREE from 'three';

const C = {
  asphalt: 0x1c2229, asphaltLine: 0x9fb4c4, ground: 0x20303c, kerb: 0x2c3944,
  steel: 0x7d94a6, darkSteel: 0x36454f, concrete: 0x4c565e, panel: 0x24313b,
  glass: 0x9fd8ef,
};

/* Site plan — district positions for the real twin worlds
   (after the Integrated Use-Case Scenario arrangement, scaled). */
export const PLOTS = {
  water:    { x: -52, z: -44, yaw: 0.2 },
  solar:    { x: 54,  z: -44, yaw: 0 },
  conveyor: { x: 56,  z: 12,  yaw: -Math.PI / 2 + 0.35 },
  cold:     { x: -54, z: 12,  yaw: 0 },
  parking:  { x: 2,   z: 60,  yaw: 0 },
};

/* Service points in each twin's LOCAL coordinates (from the twin
   worlds themselves): where the field terminal and the repair
   hatch stand. */
export const SERVICE_POINTS = {
  water:    { terminal: [0, 11],    repair: [-5.8, 2.4] },
  solar:    { terminal: [0, 13],    repair: [-10, -2] },
  conveyor: { terminal: [0, 9],     repair: [8.6, 2.2] },
  cold:     { terminal: [0, 10],    repair: [2.5, 0.8] },
  parking:  { terminal: [3, -8.6],  repair: [-11.4, -4.4] },
};

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0.08, ...(opts.emissive ? { emissive: opts.emissive, emissiveIntensity: opts.ei ?? 0.9 } : {}) });
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, seg = 18) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* ============================================================ */
export function buildCampus(scene) {
  const lampMaterials = [];
  const windowMaterials = [];

  /* ---------------- terrain ---------------- */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), mat(C.ground, { rough: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
  scene.add(ground);

  /* ---------------- roads ---------------- */
  function road(x, z, w, d) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(C.asphalt, { rough: 0.95 }));
    r.rotation.x = -Math.PI / 2; r.position.set(x, 0.01, z); r.receiveShadow = true;
    scene.add(r);
    const lineMat = mat(C.asphaltLine, { rough: 0.7 });
    const along = w > d ? 'x' : 'z';
    const long = Math.max(w, d);
    for (let i = -long / 2 + 2; i < long / 2 - 2; i += 6) {
      const dash = box(along === 'x' ? 2.6 : 0.28, 0.02, along === 'x' ? 0.28 : 2.6, lineMat);
      dash.position.set(along === 'x' ? x + i : x, 0.02, along === 'x' ? z : z + i);
      dash.castShadow = false;
      scene.add(dash);
    }
  }
  road(0, 4, 7, 150);            // main N-S spine
  road(-6, -20, 140, 7);         // north EW
  road(-6, 36, 140, 7);          // south EW
  road(-52, -8, 7, 44);          // west spur (water <-> cold)
  road(56, -32, 7, 22);          // east spur (solar <-> conveyor)

  function kerb(x, z, w, d) {
    const k = box(w, 0.22, d, mat(C.kerb), x, 0.11, z);
    k.castShadow = false; scene.add(k);
  }
  kerb(-3.9, 4, 0.6, 150); kerb(3.9, 4, 0.6, 150);
  kerb(-6, -23.9, 140, 0.6); kerb(-6, -16.1, 140, 0.6);
  kerb(-6, 32.1, 140, 0.6); kerb(-6, 39.9, 140, 0.6);

  /* ---------------- street lighting ---------------- */
  function lampPost(x, z) {
    const g = new THREE.Group();
    g.add(cyl(0.07, 0.1, 5.2, mat(C.darkSteel, { metal: 0.4 }), 0, 2.6, 0));
    g.add(box(1.4, 0.09, 0.09, mat(C.darkSteel, { metal: 0.4 }), 0.65, 5.15, 0));
    const lampMat = mat(0xfff2cc, { emissive: 0xffdf9e, ei: 0 });
    lampMaterials.push(lampMat);
    g.add(box(0.5, 0.12, 0.24, lampMat, 1.3, 5.05, 0));
    g.position.set(x, 0, z);
    scene.add(g);
  }
  [[-5, -34], [5, -34], [-5, -8], [5, -8], [-5, 14], [5, 14], [-5, 46], [5, 46], [-30, -20], [30, -20], [-30, 36], [30, 36], [-52, -30], [56, -20], [-52, 2]].forEach(([x, z]) => lampPost(x, z));

  /* ---------------- central command post ---------------- */
  const handles = {};
  {
    const g = new THREE.Group();
    g.add(box(10, 0.3, 8, mat(C.concrete), 0, 0.15, 0));
    g.add(box(8.4, 3.4, 6.4, mat(C.panel), 0, 2, 0));
    g.add(box(9, 0.35, 7, mat(C.darkSteel), 0, 3.85, 0));
    const winMat = new THREE.MeshStandardMaterial({ color: 0x0d2431, emissive: 0x1d4b63, emissiveIntensity: 0.55, roughness: 0.2, metalness: 0.4 });
    windowMaterials.push(winMat);
    g.add(box(8.42, 1.2, 3.2, winMat, 0, 2.1, 0.02));
    const site = makeScreen(1024, 256, (ctx, w, h) => {
      ctx.fillStyle = '#06121a'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#36e2c2'; ctx.font = '800 64px "Segoe UI", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('TWIN OPS · SITE COMMAND', w / 2, 74);
      ctx.fillStyle = '#5f7b8c'; ctx.font = '600 34px "Segoe UI", sans-serif';
      ctx.fillText('FIVE DIGITAL TWINS LINKED · FIELD ENGINEER ON DUTY', w / 2, 168);
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 1.85), new THREE.MeshBasicMaterial({ map: site.tex }));
    screen.position.set(0, 2.35, 3.23);
    g.add(screen);
    g.position.set(0, 0, -12);
    scene.add(g);
    handles.control = { screen, scr: site, group: g };
  }

  /* ---------------- scattered site props ---------------- */
  for (const [x, z] of [[-14, -30], [16, -28], [-18, 28], [22, 44], [-12, 50], [14, -12], [-26, -14]]) {
    const c = box(1 + (x % 2) * 0.4, 0.8 + (z % 3) * 0.2, 1 + (x % 3) * 0.3, mat(0x3a4a56, { rough: 0.9 }), x, 0.5, z);
    c.rotation.y = x * 0.7;
    scene.add(c);
  }

  /* site fence ring */
  const fenceMat = mat(0x33424e, { metal: 0.4 });
  for (let x = -95; x <= 95; x += 5) {
    for (const z of [-95, 97]) scene.add(box(0.08, 1.1, 0.08, fenceMat, x, 0.55, z));
  }

  return { handles, plots: PLOTS, servicePoints: SERVICE_POINTS, lampMaterials, windowMaterials };
}

function makeScreen(w, h, drawFn) {
  const cnv = document.createElement('canvas');
  cnv.width = w; cnv.height = h;
  const tex = new THREE.CanvasTexture(cnv);
  drawFn(cnv.getContext('2d'), w, h);
  return { tex };
}
