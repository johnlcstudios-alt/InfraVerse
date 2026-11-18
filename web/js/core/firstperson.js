/* ============================================================
   FIRST-PERSON EXPERIENCE — core controller, collision, interaction
   ============================================================ */
import * as THREE from 'three';
import { Controls, Vector3, Vector2, Raycaster, Sphere, Box3, MathUtils } from 'three';

const _EPS = 1e-4;
const _PLAYER_HEIGHT = 1.7;
const _PLAYER_RADIUS = 0.35;
const _STEP_HEIGHT = 0.4;
const _GRAVITY = 20;
const _JUMP_SPEED = 8;
const _WALK_SPEED = 3.5;
const _SPRINT_SPEED = 7;
const _CROUCH_SPEED = 1.5;
const _CROUCH_HEIGHT = 1.0;
const _INTERACTION_DISTANCE = 3.0;

export class FirstPersonControls extends Controls {
  constructor(object, domElement = null) {
    super(object, domElement);

    // Movement settings
    this.movementSpeed = _WALK_SPEED;
    this.sprintSpeed = _SPRINT_SPEED;
    this.crouchSpeed = _CROUCH_SPEED;
    this.lookSpeed = 0.002;
    this.lookVertical = true;
    this.constrainVertical = true;
    this.verticalMin = -85;
    this.verticalMax = 85;

    // Physics
    this.gravity = _GRAVITY;
    this.jumpSpeed = _JUMP_SPEED;
    this.stepHeight = _STEP_HEIGHT;
    this.playerHeight = _PLAYER_HEIGHT;
    this.crouchHeight = _CROUCH_HEIGHT;
    this.playerRadius = _PLAYER_RADIUS;

    // Collision
    this.collisionMeshes = [];
    this.enableCollision = true;

    // Interaction
    this.interactionDistance = _INTERACTION_DISTANCE;
    this.interactableObjects = new Map();
    this.raycaster = new Raycaster();
    this.raycaster.near = 0.1;
    this.raycaster.far = this.interactionDistance;
    this.currentInteractable = null;

    // State
    this._moveForward = false;
    this._moveBackward = false;
    this._moveLeft = false;
    this._moveRight = false;
    this._moveUp = false;
    this._moveDown = false;
    this._sprint = false;
    this._crouch = false;
    this._jump = false;

    this._pointerX = 0;
    this._pointerY = 0;
    this._lat = 0;
    this._lon = 0;
    this._velocity = new Vector3();
    this._onFloor = false;
    this._wasOnFloor = false;
    this._crouching = false;

    // Event handlers
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseWheel = this._onMouseWheel.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onPointerLockError = this._onPointerLockError.bind(this);

    if (domElement !== null) {
      this.connect();
      this.handleResize();
    }
    this._setOrientation();
  }

  connect() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('pointerlockchange', this._onPointerLockChange);
    window.addEventListener('pointerlockerror', this._onPointerLockError);

    this.domElement.addEventListener('pointermove', this._onPointerMove);
    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.domElement.addEventListener('pointerup', this._onPointerUp);
    this.domElement.addEventListener('contextmenu', this._onContextMenu);
    this.domElement.addEventListener('wheel', this._onMouseWheel, { passive: false });
  }

  disconnect() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('pointerlockchange', this._onPointerLockChange);
    window.removeEventListener('pointerlockerror', this._onPointerLockError);

    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    this.domElement.removeEventListener('wheel', this._onMouseWheel);

    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock();
    }
  }

  dispose() {
    this.disconnect();
    this.interactableObjects.clear();
    this.collisionMeshes = [];
  }

  handleResize() {
    if (this.domElement === document) {
      this._viewHalfX = window.innerWidth / 2;
      this._viewHalfY = window.innerHeight / 2;
    } else {
      this._viewHalfX = this.domElement.offsetWidth / 2;
      this._viewHalfY = this.domElement.offsetHeight / 2;
    }
  }

  setCollisionMeshes(meshes) {
    this.collisionMeshes = meshes;
  }

  addInteractable(id, object, data) {
    this.interactableObjects.set(id, { object, data });
    if (Array.isArray(object)) {
      object.forEach(o => o.userData.interactableId = id);
    } else {
      object.userData.interactableId = id;
    }
  }

  removeInteractable(id) {
    const entry = this.interactableObjects.get(id);
    if (entry) {
      if (Array.isArray(entry.object)) {
        entry.object.forEach(o => delete o.userData.interactableId);
      } else {
        delete entry.object.userData.interactableId;
      }
      this.interactableObjects.delete(id);
    }
  }

  getCurrentInteractable() {
    return this.currentInteractable;
  }

  requestPointerLock() {
    this.domElement.requestPointerLock();
  }

  exitPointerLock() {
    document.exitPointerLock();
  }

  isLocked() {
    return document.pointerLockElement === this.domElement;
  }

  lookAt(x, y, z) {
    const target = x instanceof Vector3 ? x : new Vector3(x, y, z);
    this.object.lookAt(target);
    this._setOrientation();
    return this;
  }

  setPosition(x, y, z) {
    this.object.position.set(x, y, z);
  }

  teleportTo(x, y, z, yaw = 0, pitch = 0) {
    this.object.position.set(x, y, z);
    this._lon = yaw;
    this._lat = pitch;
    this._updateRotation();
  }

  update(delta) {
    if (!this.enabled) return;

    const actualMoveSpeed = delta * (this._sprint ? this.sprintSpeed : (this._crouching ? this.crouchSpeed : this.movementSpeed));

    // Horizontal movement
    if (this._moveForward) this.object.translateZ(-actualMoveSpeed);
    if (this._moveBackward) this.object.translateZ(actualMoveSpeed);
    if (this._moveLeft) this.object.translateX(-actualMoveSpeed);
    if (this._moveRight) this.object.translateX(actualMoveSpeed);

    // Vertical movement (jump/gravity)
    if (this._onFloor && this._jump) {
      this._velocity.y = this.jumpSpeed;
      this._onFloor = false;
      this._jump = false;
    }

    this._velocity.y -= this.gravity * delta;
    this.object.translateY(this._velocity.y * delta);

    // Collision detection and resolution
    if (this.enableCollision && this.collisionMeshes.length > 0) {
      this._resolveCollisions();
    }

    // Floor check
    this._checkFloor(delta);

    // Crouch handling
    if (this._crouch && !this._crouching) {
      this._crouching = true;
      this.object.position.y -= (this.playerHeight - this.crouchHeight);
    } else if (!this._crouch && this._crouching) {
      // Check if we can stand up
      if (this._canStandUp()) {
        this._crouching = false;
        this.object.position.y += (this.playerHeight - this.crouchHeight);
      } else {
        this._crouch = true; // Force stay crouched
      }
    }

    // Update look rotation
    if (this.isLocked()) {
      let actualLookSpeed = delta * this.lookSpeed;
      if (!this.activeLook) actualLookSpeed = 0;

      let verticalLookRatio = 1;
      if (this.constrainVertical) {
        verticalLookRatio = Math.PI / (MathUtils.degToRad(this.verticalMax) - MathUtils.degToRad(this.verticalMin));
      }

      this._lon -= this._pointerX * actualLookSpeed;
      if (this.lookVertical) this._lat -= this._pointerY * actualLookSpeed * verticalLookRatio;

      this._lat = Math.max(this.verticalMin, Math.min(this.verticalMax, this._lat));
      this._updateRotation();
    }

    // Reset pointer movement
    this._pointerX = 0;
    this._pointerY = 0;

    // Update interaction raycast
    this._updateInteractionRaycast();
  }

  _updateRotation() {
    const phi = MathUtils.degToRad(90 - this._lat);
    const theta = MathUtils.degToRad(this._lon);
    const targetPosition = new Vector3().setFromSphericalCoords(1, phi, theta).add(this.object.position);
    this.object.lookAt(targetPosition);
  }

  _setOrientation() {
    const quaternion = this.object.quaternion;
    const lookDirection = new Vector3(0, 0, -1).applyQuaternion(quaternion);
    const spherical = new THREE.Spherical().setFromVector3(lookDirection);
    this._lat = 90 - MathUtils.radToDeg(spherical.phi);
    this._lon = MathUtils.radToDeg(spherical.theta);
  }

  _checkFloor(delta) {
    const raycaster = new Raycaster(
      this.object.position.clone().add(new Vector3(0, this.playerRadius, 0)),
      new Vector3(0, -1, 0),
      0,
      this.playerHeight * 0.6 + 0.1
    );
    raycaster.filter = (obj) => this.collisionMeshes.includes(obj) || this.collisionMeshes.some(m => m === obj || m.contains(obj));
    const intersects = raycaster.intersectObjects(this.collisionMeshes, true);
    this._wasOnFloor = this._onFloor;
    this._onFloor = intersects.length > 0 && intersects[0].distance < this.playerHeight * 0.6 + 0.05;

    if (this._onFloor && this._velocity.y < 0) {
      this._velocity.y = 0;
      // Snap to floor
      const floorY = intersects[0].point.y + this.playerHeight - this.playerRadius;
      if (Math.abs(this.object.position.y - floorY) < 0.5) {
        this.object.position.y = floorY;
      }
    }
  }

  _canStandUp() {
    const raycaster = new Raycaster(
      this.object.position.clone(),
      new Vector3(0, 1, 0),
      0,
      this.playerHeight
    );
    raycaster.filter = (obj) => this.collisionMeshes.includes(obj) || this.collisionMeshes.some(m => m === obj || m.contains(obj));
    const intersects = raycaster.intersectObjects(this.collisionMeshes, true);
    return intersects.length === 0 || intersects[0].distance > this.playerHeight - 0.1;
  }

  _resolveCollisions() {
    const directions = [
      new Vector3(1, 0, 0),
      new Vector3(-1, 0, 0),
      new Vector3(0, 0, 1),
      new Vector3(0, 0, -1),
    ];

    for (const dir of directions) {
      const raycaster = new Raycaster(
        this.object.position.clone().add(new Vector3(0, this.playerHeight * 0.5, 0)),
        dir,
        0,
        this.playerRadius + 0.05
      );
      raycaster.filter = (obj) => this.collisionMeshes.includes(obj) || this.collisionMeshes.some(m => m === obj || m.contains(obj));
      const intersects = raycaster.intersectObjects(this.collisionMeshes, true);
      if (intersects.length > 0 && intersects[0].distance < this.playerRadius + 0.05) {
        const push = (this.playerRadius + 0.05) - intersects[0].distance;
        this.object.position.addScaledVector(dir, -push);
      }
    }
  }

  _updateInteractionRaycast() {
    this.raycaster.setFromCamera(new Vector2(0, 0), this.object);
    this.raycaster.far = this.interactionDistance;

    let closestInteractable = null;
    let closestDistance = Infinity;

    for (const [id, entry] of this.interactableObjects) {
      const objects = Array.isArray(entry.object) ? entry.object : [entry.object];
      const intersects = this.raycaster.intersectObjects(objects, true);
      if (intersects.length > 0 && intersects[0].distance < closestDistance) {
        closestDistance = intersects[0].distance;
        closestInteractable = { id, ...entry, distance: intersects[0].distance, point: intersects[0].point, face: intersects[0].face };
      }
    }

    if (closestInteractable !== this.currentInteractable) {
      if (this.currentInteractable && this.onInteractableLeave) {
        this.onInteractableLeave(this.currentInteractable);
      }
      this.currentInteractable = closestInteractable;
      if (this.currentInteractable && this.onInteractableEnter) {
        this.onInteractableEnter(this.currentInteractable);
      }
    }
  }

  interact() {
    if (this.currentInteractable && this.onInteract) {
      this.onInteract(this.currentInteractable);
    }
  }

  inspect() {
    if (this.currentInteractable && this.onInspect) {
      this.onInspect(this.currentInteractable);
    }
  }

  _onPointerMove(event) {
    if (!this.isLocked()) return;
    const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
    this._pointerX = movementX;
    this._pointerY = movementY;
  }

  _onPointerDown(event) {
    if (!this.isLocked()) {
      return;
    }
    if (event.button === 0 && this.onPrimaryAction) {
      this.onPrimaryAction();
    }
  }

  _onPointerUp(event) {
    // Handled by key events for movement
  }

  _onContextMenu(event) {
    event.preventDefault();
  }

  _onMouseWheel(event) {
    if (!this.isLocked()) return;
    // Could be used for zoom or other actions
  }

  _onKeyDown(event) {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'SELECT')) return;
    if (!this.isLocked() && event.code !== 'Escape') return;

    switch (event.code) {
      case 'KeyW': case 'ArrowUp': this._moveForward = true; break;
      case 'KeyS': case 'ArrowDown': this._moveBackward = true; break;
      case 'KeyA': case 'ArrowLeft': this._moveLeft = true; break;
      case 'KeyD': case 'ArrowRight': this._moveRight = true; break;
      case 'ShiftLeft': case 'ShiftRight': this._sprint = true; break;
      case 'ControlLeft': case 'ControlRight': this._crouch = true; break;
      case 'Space': this._jump = true; break;
      case 'KeyE': if (this.isLocked()) this.interact(); break;
      case 'KeyF': if (this.isLocked()) this.inspect(); break;
      case 'Escape': if (this.isLocked() && this.onPauseMenu) this.onPauseMenu(); break;
      case 'KeyC': this._crouch = true; break; // Toggle crouch
    }
  }

  _onKeyUp(event) {
    if (!this.isLocked()) return;
    switch (event.code) {
      case 'KeyW': case 'ArrowUp': this._moveForward = false; break;
      case 'KeyS': case 'ArrowDown': this._moveBackward = false; break;
      case 'KeyA': case 'ArrowLeft': this._moveLeft = false; break;
      case 'KeyD': case 'ArrowRight': this._moveRight = false; break;
      case 'ShiftLeft': case 'ShiftRight': this._sprint = false; break;
      case 'ControlLeft': case 'ControlRight': this._crouch = false; break;
      case 'Space': this._jump = false; break;
      case 'KeyC': this._crouch = false; break;
    }
  }

  _onPointerLockChange() {
    if (this.isLocked()) {
      this._pointerX = 0;
      this._pointerY = 0;
      if (this.onPointerLock) this.onPointerLock(true);
    } else {
      this._moveForward = this._moveBackward = this._moveLeft = this._moveRight = false;
      this._sprint = this._crouch = this._jump = false;
      if (this.onPointerLock) this.onPointerLock(false);
    }
  }

  _onPointerLockError() {
    console.warn('Pointer lock failed');
  }
}

/* ============================================================
   FIRST-PERSON PAUSE MENU
   ============================================================ */
export class FirstPersonPauseMenu {
  constructor(infrastructure, onClose, onExitToMenu, onExitToSelection) {
    this.infrastructure = infrastructure;
    this.onClose = onClose;
    this.onExitToMenu = onExitToMenu;
    this.onExitToSelection = onExitToSelection;
    this.element = null;
    this.visible = false;
  }

  create() {
    if (this.element) return this.element;

    const menu = document.createElement('div');
    menu.id = 'fp-pause-menu';
    menu.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(5, 11, 18, 0.92); z-index: 2000;
      display: none; align-items: center; justify-content: center;
      font-family: 'Segoe UI', system-ui, sans-serif;
    `;

    menu.innerHTML = `
      <div style="background: linear-gradient(180deg, #0b1220 0%, #101b2f 100%); border: 1px solid #1e293b; border-radius: 18px; padding: 40px 48px; max-width: 420px; width: 90%; box-shadow: 0 24px 80px rgba(0,0,0,0.6); text-align: center;">
        <div style="width: 56px; height: 56px; border-radius: 14px; background: rgba(54, 226, 194, 0.15); border: 1px solid rgba(54, 226, 194, 0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#36e2c2" stroke-width="2">
            <rect x="6" y="4" width="12" height="16" rx="2"/>
            <line x1="6" y1="9" x2="18" y2="9" stroke-linecap="round"/>
            <line x1="6" y1="14" x2="18" y2="14" stroke-linecap="round"/>
          </svg>
        </div>
        <h1 style="font-size: 24px; font-weight: 650; color: #f0f9ff; margin: 0 0 6px;">PAUSED</h1>
        <p style="color: #94a3b8; margin: 0 0 28px; font-size: 14px;">First-Person Experience Mode</p>

        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button id="fp-resume" class="fp-menu-btn primary" style="background: #36e2c2; color: #05141e;">Resume</button>
          <button id="fp-restart" class="fp-menu-btn" style="background: #1e293b; color: #e2e8f0; border: 1px solid #334155;">Restart Scenario</button>
          <button id="fp-controls" class="fp-menu-btn" style="background: #1e293b; color: #e2e8f0; border: 1px solid #334155;">Controls & Settings</button>
          <button id="fp-return-monitor" class="fp-menu-btn" style="background: #1e293b; color: #e2e8f0; border: 1px solid #334155;">Return to Monitoring Mode</button>
          <button id="fp-return-selection" class="fp-menu-btn warn" style="background: #3a2a1a; color: #ffdc9a; border: 1px solid #5a4a2a;">Return to Infrastructure Selection</button>
          <button id="fp-exit" class="fp-menu-btn danger" style="background: #3a1a1a; color: #ff8a9a; border: 1px solid #5a2a2a;">Exit Application</button>
        </div>
      </div>
      <style>
        .fp-menu-btn { padding: 14px 24px; border-radius: 10px; font-size: 14px; font-weight: 550; cursor: pointer; transition: all 0.15s ease; border: none; }
        .fp-menu-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
        .fp-menu-btn.primary:hover { box-shadow: 0 4px 20px rgba(54, 226, 194, 0.4); }
        .fp-menu-btn.warn:hover { box-shadow: 0 4px 20px rgba(246, 180, 75, 0.3); }
        .fp-menu-btn.danger:hover { box-shadow: 0 4px 20px rgba(255, 73, 95, 0.3); }
      </style>
    `;

    this.element = menu;
    document.body.appendChild(menu);

    // Event listeners
    menu.querySelector('#fp-resume').addEventListener('click', () => this.hide());
    menu.querySelector('#fp-restart').addEventListener('click', () => { this.hide(); this.infrastructure.restartScenario?.(); });
    menu.querySelector('#fp-controls').addEventListener('click', () => { this.hide(); this.showControlsSettings(); });
    menu.querySelector('#fp-return-monitor').addEventListener('click', () => { this.hide(); this.onExitToMenu?.(); });
    menu.querySelector('#fp-return-selection').addEventListener('click', () => { this.hide(); this.onExitToSelection?.(); });
    menu.querySelector('#fp-exit').addEventListener('click', () => { this.hide(); this.infrastructure.host?.requestExit?.(); });

    return menu;
  }

  show() {
    this.visible = true;
    if (!this.element) this.create();
    this.element.style.display = 'flex';
    this.infrastructure.firstPersonControls?.exitPointerLock();
  }

  hide() {
    this.visible = false;
    if (this.element) this.element.style.display = 'none';
    if (this.onClose) this.onClose();
  }

  toggle() {
    if (this.visible) this.hide(); else this.show();
  }

  showControlsSettings() {
    // Could open a settings modal
    alert('Controls settings - to be implemented');
  }

  destroy() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
  }
}

/* ============================================================
   EXPERIENCE MODE SELECTION DIALOG
   ============================================================ */
export function showExperienceModeDialog(infrastructure, onSelect) {
  const modes = [
    {
      id: 'monitor',
      title: 'Digital Twin Monitoring Mode',
      subtitle: 'Default · Professional SCADA oversight',
      description: 'Interactive 3D overview, dashboards, equipment controls, sensor monitoring, analytics, alarms, and visibility management.',
      icon: 'grid',
      color: '#36e2c2',
      recommended: true,
    },
  ];

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(5, 11, 18, 0.95); z-index: 3000;
      display: flex; align-items: center; justify-content: center;
      font-family: 'Segoe UI', system-ui, sans-serif;
    `;

    overlay.innerHTML = `
      <div style="width: 100%; max-width: 900px; padding: 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="font-size: 12px; font-weight: 600; color: #64748b; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px;">SELECT EXPERIENCE MODE</div>
          <h1 style="font-size: 28px; font-weight: 700; color: #f0f9ff; margin: 0;">${infrastructure.meta?.name}</h1>
          <p style="color: #94a3b8; margin: 8px 0 0;">Choose how you want to experience this infrastructure</p>
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;" id="mode-grid">
          ${modes.map(m => `
            <button class="mode-card" data-mode="${m.id}" style="
              background: linear-gradient(180deg, #0b1220 0%, #101b2f 100%);
              border: 2px solid ${m.recommended ? m.color : '#1e293b'};
              border-radius: 16px;
              padding: 24px;
              cursor: pointer;
              transition: all 0.2s ease;
              text-align: left;
              position: relative;
              overflow: hidden;
            ">
              ${m.recommended ? `<div style="position:absolute;top:0;left:0;right:0;height:3px;background:${m.color}"></div>` : ''}
              ${m.recommended ? `<span style="position:absolute;top:12px;right:12px;background:${m.color};color:#05141e;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700">DEFAULT</span>` : ''}
              <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:12px;">
                <div style="width:44px;height:44px;border-radius:10px;background:rgba(${parseInt(m.color.slice(1,3),16)},${parseInt(m.color.slice(3,5),16)},${parseInt(m.color.slice(5,7),16)},0.15);border:1px solid ${m.color}40;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${m.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    ${m.icon === 'grid' ? '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' : ''}
                  </svg>
                </div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:16px;font-weight:650;color:#f0f9ff">${m.title}</div>
                  <div style="font-size:12px;color:${m.color};font-weight:500;text-transform:uppercase;letter-spacing:0.05em">${m.subtitle}</div>
                </div>
              </div>
              <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0">${m.description}</p>
            </button>
          `).join('')}
        </div>
      </div>
      <style>
        .mode-card:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.4); border-color: ${modes[0].color} !important; }
        .mode-card:active { transform: translateY(0); }
      </style>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll('.mode-card').forEach(card => {
      card.addEventListener('click', () => {
        const modeId = card.dataset.mode;
        document.body.removeChild(overlay);
        resolve(modeId);
      });
      card.addEventListener('mouseenter', () => {
        card.style.borderColor = modes.find(m => m.id === card.dataset.mode).color;
      });
      card.addEventListener('mouseleave', () => {
        const mode = modes.find(m => m.id === card.dataset.mode);
        card.style.borderColor = mode.recommended ? mode.color : '#1e293b';
      });
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve('monitor'); // Default
      }
    });
  });
}