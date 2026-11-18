/* ============================================================
   SCENARIO SYSTEM — step-by-step operational scenarios
   ============================================================ */
import * as ui from './ui.js';

const { el, icon, button, toast, modal, confirmDialog } = ui;

/**
 * Base scenario step definition
 * @typedef {Object} ScenarioStep
 * @property {string} id - Unique step identifier
 * @property {string} title - Step title
 * @property {string} description - Detailed description
 * @property {string} objective - Current objective for the player
 * @property {Function} [onEnter] - Called when step starts
 * @property {Function} [onExit] - Called when step ends
 * @property {Function} [checkComplete] - Returns true when step is complete
 * @property {number} [autoAdvanceDelay] - Auto-advance after ms (0 = manual)
 * @property {boolean} [allowSkip] - Allow skipping this step
 * @property {Object} [camera] - Camera position/target for auto camera
 * @property {string} [narration] - Text for narration
 */

/**
 * Scenario definition
 * @typedef {Object} Scenario
 * @property {string} id - Scenario ID
 * @property {string} name - Display name
 * @property {string} description - Scenario description
 * @property {string} infrastructure - Infrastructure ID this scenario belongs to
 * @property {ScenarioStep[]} steps - Ordered steps
 * @property {Object} [initialState] - Initial infrastructure state
 */

export class ScenarioManager {
  constructor(infrastructure) {
    this.infrastructure = infrastructure;
    this.currentScenario = null;
    this.currentStepIndex = -1;
    this.currentStep = null;
    this.isRunning = false;
    this.isPaused = false;
    this.stepStartTime = 0;
    this.scenarioStartTime = 0;
    this.completedSteps = [];
    this.stepHistory = [];
    this.autoAdvanceTimer = null;
    this.narrationEnabled = true;
    this.instructionsEnabled = true;
    this.autoCameraEnabled = true;
    this.speed = 1.0;
    this.eventCallbacks = {};
  }

  /**
   * Register a scenario
   * @param {Scenario} scenario
   */
  registerScenario(scenario) {
    if (!this.scenarios) this.scenarios = {};
    this.scenarios[scenario.id] = scenario;
  }

  /**
   * Get available scenarios for this infrastructure
   */
  getAvailableScenarios() {
    if (!this.scenarios) return [];
    return Object.values(this.scenarios).filter(s => s.infrastructure === this.infrastructure.id);
  }

  /**
   * Start a scenario
   * @param {string} scenarioId
   * @param {Object} options
   */
  async startScenario(scenarioId, options = {}) {
    const scenario = this.scenarios?.[scenarioId];
    if (!scenario) {
      toast(`Scenario not found: ${scenarioId}`, { type: 'danger' });
      return false;
    }

    // Apply initial state if provided
    if (scenario.initialState) {
      this._applyInitialState(scenario.initialState);
    }

    this.currentScenario = scenario;
    this.currentStepIndex = -1;
    this.completedSteps = [];
    this.stepHistory = [];
    this.isRunning = true;
    this.isPaused = false;
    this.scenarioStartTime = this.infrastructure.simTime || 0;

    this.infrastructure.logEvent('Scenario started', `${scenario.name} initiated`, 'ok');
    toast(`Scenario: ${scenario.name}`, { type: 'info', title: 'Use-Case Scenario' });

    // Notify HUD
    if (this.infrastructure.firstPersonHUD) {
      this.infrastructure.firstPersonHUD.setMode('scenario', {
        name: scenario.name,
        currentStep: 1,
        totalSteps: scenario.steps.length,
        progress: 0,
        currentObjective: scenario.steps[0]?.objective || '',
      });
    }

    // Fire event
    this._fireEvent('onScenarioStart', { scenario });

    // Advance to first step
    await this.nextStep();

    return true;
  }

  /**
   * Advance to next step
   */
  async nextStep() {
    if (!this.currentScenario || !this.isRunning) return false;

    // Complete current step
    if (this.currentStep) {
      this._completeCurrentStep();
    }

    this.currentStepIndex++;
    if (this.currentStepIndex >= this.currentScenario.steps.length) {
      return this.completeScenario();
    }

    this.currentStep = this.currentScenario.steps[this.currentStepIndex];
    this.stepStartTime = this.infrastructure.simTime || 0;

    // Fire step start event
    this._fireEvent('onStepStart', { step: this.currentStep, index: this.currentStepIndex });

    // Run step entry logic
    if (this.currentStep.onEnter) {
      try {
        await this.currentStep.onEnter(this.infrastructure, this);
      } catch (e) {
        console.error('Step onEnter error:', e);
      }
    }

    // Update HUD
    this._updateHUD();

    // Show narration/instructions
    if (this.narrationEnabled && this.currentStep.narration) {
      this._showNarration(this.currentStep.narration);
    }
    if (this.instructionsEnabled) {
      this._showInstructions(this.currentStep);
    }

    // Auto camera
    if (this.autoCameraEnabled && this.currentStep.camera) {
      this._moveCamera(this.currentStep.camera);
    }

    // Auto-advance timer
    if (this.currentStep.autoAdvanceDelay && this.currentStep.autoAdvanceDelay > 0) {
      this.autoAdvanceTimer = setTimeout(() => {
        if (this.isRunning && !this.isPaused) {
          this.nextStep();
        }
      }, this.currentStep.autoAdvanceDelay / this.speed);
    }

    // Check for immediate completion
    if (this.currentStep.checkComplete && this.currentStep.checkComplete(this.infrastructure, this)) {
      await this.nextStep();
    }

    return true;
  }

  /**
   * Go to previous step
   */
  async previousStep() {
    if (!this.currentScenario || this.currentStepIndex <= 0) return false;

    // Exit current step
    if (this.currentStep && this.currentStep.onExit) {
      try {
        await this.currentStep.onExit(this.infrastructure, this);
      } catch (e) {
        console.error('Step onExit error:', e);
      }
    }

    // Restore previous step from history
    const prevStep = this.stepHistory.pop();
    if (prevStep) {
      this.currentStepIndex = prevStep.index;
      this.currentStep = this.currentScenario.steps[this.currentStepIndex];
      this._updateHUD();

      if (this.currentStep.onEnter) {
        try {
          await this.currentStep.onEnter(this.infrastructure, this);
        } catch (e) {
          console.error('Step onEnter error:', e);
        }
      }
    }

    return true;
  }

  /**
   * Skip current step
   */
  async skipStep() {
    if (!this.currentScenario || !this.currentStep || !this.currentStep.allowSkip) {
      toast('This step cannot be skipped', { type: 'warn' });
      return false;
    }

    this.infrastructure.logEvent('Step skipped', `${this.currentStep.title} skipped by operator`, 'warn');
    return this.nextStep();
  }

  /**
   * Pause scenario
   */
  pause() {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
    this.infrastructure.logEvent('Scenario paused', 'Timeline paused by operator', 'warn');
    toast('Scenario paused', { type: 'info' });
    this._fireEvent('onPause', {});
  }

  /**
   * Resume scenario
   */
  resume() {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.infrastructure.logEvent('Scenario resumed', 'Timeline resumed', 'ok');
    toast('Scenario resumed', { type: 'ok' });

    // Restart auto-advance if applicable
    if (this.currentStep && this.currentStep.autoAdvanceDelay && this.currentStep.autoAdvanceDelay > 0) {
      const elapsed = (this.infrastructure.simTime || 0) - this.stepStartTime;
      const remaining = Math.max(0, this.currentStep.autoAdvanceDelay - elapsed * 1000);
      if (remaining > 0) {
        this.autoAdvanceTimer = setTimeout(() => {
          if (this.isRunning && !this.isPaused) this.nextStep();
        }, remaining / this.speed);
      } else {
        this.nextStep();
      }
    }

    this._fireEvent('onResume', {});
  }

  /**
   * Restart current scenario
   */
  async restart() {
    if (!this.currentScenario) return;
    const id = this.currentScenario.id;
    this.stop();
    await this.startScenario(id);
  }

  /**
   * Stop scenario
   */
  stop() {
    if (!this.isRunning) return;

    if (this.currentStep && this.currentStep.onExit) {
      try {
        this.currentStep.onExit(this.infrastructure, this);
      } catch (e) {
        console.error('Step onExit error:', e);
      }
    }

    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }

    this.isRunning = false;
    this.isPaused = false;
    this.currentScenario = null;
    this.currentStep = null;
    this.currentStepIndex = -1;

    if (this.infrastructure.firstPersonHUD) {
      this.infrastructure.firstPersonHUD.setMode('explore');
    }

    this.infrastructure.logEvent('Scenario stopped', 'Manual operation — scenario timeline paused', 'info');
    this._fireEvent('onStop', {});
  }

  /**
   * Complete scenario
   */
  async completeScenario() {
    if (!this.currentScenario) return false;

    const scenario = this.currentScenario;
    const duration = (this.infrastructure.simTime || 0) - this.scenarioStartTime;

    // Generate completion report
    const report = this._generateReport(scenario, duration);

    // Show completion modal
    await this._showCompletionReport(report);

    this.infrastructure.logEvent('Scenario completed', `${scenario.name} finished successfully`, 'ok');
    toast(`Scenario completed: ${scenario.name}`, { type: 'ok', title: 'Scenario Complete' });

    this._fireEvent('onComplete', { scenario, report });

    // Reset state but keep report available
    this.isRunning = false;
    this.currentScenario = null;
    this.currentStep = null;
    this.currentStepIndex = -1;

    if (this.infrastructure.firstPersonHUD) {
      this.infrastructure.firstPersonHUD.setMode('explore');
    }

    return true;
  }

  /**
   * Complete current step
   */
  _completeCurrentStep() {
    if (!this.currentStep) return;

    this.stepHistory.push({
      index: this.currentStepIndex,
      step: this.currentStep,
      startTime: this.stepStartTime,
      endTime: this.infrastructure.simTime || 0,
      duration: (this.infrastructure.simTime || 0) - this.stepStartTime,
    });

    this.completedSteps.push(this.currentStep.id);

    if (this.currentStep.onExit) {
      try {
        this.currentStep.onExit(this.infrastructure, this);
      } catch (e) {
        console.error('Step onExit error:', e);
      }
    }

    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }

    this._fireEvent('onStepComplete', { step: this.currentStep, index: this.currentStepIndex });
  }

  /**
   * Apply initial state to infrastructure
   */
  _applyInitialState(state) {
    for (const [key, value] of Object.entries(state)) {
      if (key in this.infrastructure) {
        this.infrastructure[key] = value;
      }
    }
    if (this.infrastructure.config) {
      this.infrastructure.config = { ...this.infrastructure.config, ...state };
    }
    this.infrastructure.saveSoon();
    this.infrastructure.refreshLive();
  }

  /**
   * Update HUD with current step info
   */
  _updateHUD() {
    if (!this.infrastructure.firstPersonHUD || !this.currentScenario || !this.currentStep) return;

    const progress = (this.currentStepIndex + 1) / this.currentScenario.steps.length;
    this.infrastructure.firstPersonHUD.scenarioData = {
      name: this.currentScenario.name,
      currentStep: this.currentStepIndex + 1,
      totalSteps: this.currentScenario.steps.length,
      progress,
      currentObjective: this.currentStep.objective || '',
    };
  }

  /**
   * Show narration text
   */
  _showNarration(text) {
    if (this.infrastructure.firstPersonHUD) {
      this.infrastructure.firstPersonHUD.setObjective(text);
    }
    toast(text, { type: 'info', duration: 5000, title: 'Scenario Narration' });
  }

  /**
   * Show step instructions
   */
  _showInstructions(step) {
    const instructions = [
      step.title,
      step.description,
      step.objective ? `Objective: ${step.objective}` : '',
    ].filter(Boolean).join('\n');

    if (this.infrastructure.firstPersonHUD) {
      this.infrastructure.firstPersonHUD.setObjective(instructions);
    }
  }

  /**
   * Move camera to position
   */
  _moveCamera(cameraData) {
    if (!this.infrastructure.scene) return;

    const { position, target, duration = 2000 } = cameraData;
    if (position) {
      this.infrastructure.scene.animateCamera(position, target, duration);
    }
  }

  /**
   * Generate completion report
   */
  _generateReport(scenario, duration) {
    const activeAlarms = this.infrastructure.getActiveAlarms?.() || [];
    const equipment = this.infrastructure.equipment || [];

    return {
      scenarioName: scenario.name,
      infrastructureName: this.infrastructure.meta?.name,
      infrastructureId: this.infrastructure.id,
      startTime: new Date(Date.now() - duration * 1000).toISOString(),
      completionTime: new Date().toISOString(),
      durationSeconds: duration,
      durationFormatted: this._formatDuration(duration),
      completedSteps: this.completedSteps.length,
      totalSteps: scenario.steps.length,
      stepsDetail: this.stepHistory.map(h => ({
        id: h.step.id,
        title: h.step.title,
        duration: h.duration,
        durationFormatted: this._formatDuration(h.duration),
      })),
      equipmentActivated: equipment.filter(e => e.status?.()?.includes('RUNNING') || e.status?.()?.includes('ENERGISED')).map(e => e.name),
      sensorReadings: this._captureSensorReadings(),
      alarmsGenerated: activeAlarms.map(a => ({
        title: a.title,
        severity: a.severity,
        message: a.message,
        raisedAt: a.raisedSim,
      })),
      operatorResponses: this.stepHistory.filter(h => h.operatorAction).map(h => h.operatorAction),
      finalEquipmentStatus: equipment.map(e => ({
        name: e.name,
        status: e.status?.(),
        tone: e.tone?.(),
      })),
      performanceSummary: this._generatePerformanceSummary(),
    };
  }

  _captureSensorReadings() {
    const readings = {};
    for (const sensor of this.infrastructure.sensorDefs || []) {
      const value = this.infrastructure.sensorValue?.(sensor.id);
      if (value !== null && value !== undefined) {
        readings[sensor.name] = { value, unit: sensor.unit, status: this.infrastructure.sensorStatus?.(sensor.id) };
      }
    }
    return readings;
  }

  _generatePerformanceSummary() {
    const summary = [];
    if (this.infrastructure.producedToday !== undefined) {
      summary.push(`Production: ${this.infrastructure.producedToday} units`);
    }
    if (this.infrastructure.energyToday !== undefined) {
      summary.push(`Energy generated: ${this.infrastructure.energyToday.toFixed(1)} kWh`);
    }
    if (this.infrastructure.waterToday !== undefined) {
      summary.push(`Water processed: ${Math.round(this.infrastructure.waterToday)} L`);
    }
    const alarms = this.infrastructure.getActiveAlarms?.() || [];
    summary.push(`Alarms triggered: ${alarms.length}`);
    return summary.join(' | ');
  }

  _formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  /**
   * Show completion report modal
   */
  async _showCompletionReport(report) {
    return new Promise((resolve) => {
      const body = document.createElement('div');
      body.style.maxHeight = '70vh';
      body.style.overflowY = 'auto';

      body.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #1e293b">
          <div style="width:56px;height:56px;border-radius:50%;background:rgba(54,226,194,0.15);border:1px solid rgba(54,226,194,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#36e2c2" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <h2 style="margin:0 0 4px;font-size:22px;color:#f0f9ff">Scenario Completed</h2>
          <p style="margin:0;color:#94a3b8">${report.scenarioName} · ${report.infrastructureName}</p>
        </div>

        <div class="report-section" style="margin-bottom:16px">
          <h3 style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px">Summary</h3>
          <div class="kv-list">
            ${[
              ['Duration', report.durationFormatted],
              ['Steps Completed', `${report.completedSteps}/${report.totalSteps}`],
              ['Equipment Activated', report.equipmentActivated.length],
              ['Alarms Generated', report.alarmsGenerated.length],
              ['Performance', report.performanceSummary],
            ].map(([k, v]) => `<div class="kv-row"><span class="k">${k}</span><span class="v text">${v}</span></div>`).join('')}
          </div>
        </div>

        <div class="report-section" style="margin-bottom:16px">
          <h3 style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px">Step Timeline</h3>
          <div style="max-height:200px;overflow-y:auto">
            ${report.stepsDetail.map(s => `
              <div class="kv-row" style="padding:8px 0;border-bottom:1px solid rgba(30,41,59,0.5)">
                <span class="k">${s.title}</span>
                <span class="v">${s.durationFormatted}</span>
              </div>
            `).join('')}
          </div>
        </div>

        ${report.alarmsGenerated.length > 0 ? `
        <div class="report-section" style="margin-bottom:16px">
          <h3 style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px">Alarms Triggered</h3>
          <div style="max-height:150px;overflow-y:auto">
            ${report.alarmsGenerated.map(a => `
              <div class="alarm-item" style="padding:8px 0">
                <span class="sev ${a.severity}"></span>
                <div class="tt">
                  <b>${a.title}</b>
                  <span>${a.message}</span>
                </div>
                <div class="tm">${ui.fmtTime(a.raisedAt)}</div>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        <div class="report-section">
          <h3 style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px">Final Equipment Status</h3>
          <div style="max-height:200px;overflow-y:auto">
            ${report.finalEquipmentStatus.map(e => `
              <div class="kv-row" style="padding:6px 0">
                <span class="k">${e.name}</span>
                <span class="v" style="color:${e.tone === 'ok' ? 'var(--ok)' : e.tone === 'warn' ? 'var(--warn)' : e.tone === 'danger' ? 'var(--danger)' : 'var(--muted)'}">${e.status}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;

      const m = modal({
        title: 'Scenario Complete',
        subtitle: `${report.scenarioName} · ${report.infrastructureName}`,
        body,
        footer: [
          button('Replay Scenario', { variant: 'subtle', iconName: 'restart', onClick: () => { m.close(); this.restart(); resolve(); } }),
          button('New Scenario', { iconName: 'play', onClick: () => { m.close(); this.showScenarioSelector(); resolve(); } }),
          button('Return to Explore', { variant: 'primary', iconName: 'eye', onClick: () => { m.close(); resolve(); } }),
        ],
        size: 'large',
      });
    });
  }

  /**
   * Show scenario selector
   */
  showScenarioSelector() {
    const scenarios = this.getAvailableScenarios();
    if (!scenarios.length) {
      toast('No scenarios available for this infrastructure', { type: 'info' });
      return;
    }

    const body = document.createElement('div');
    for (const s of scenarios) {
      const card = document.createElement('div');
      card.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;background:#0b1220;border:1px solid #1e293b;border-radius:10px;margin-bottom:8px';
      card.innerHTML = `
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:#f0f9ff">${s.name}</div>
          <div style="font-size:12px;color:#94a3b8">${s.description}</div>
          <div style="font-size:11px;color:#64748b;margin-top:4px">${s.steps.length} steps</div>
        </div>
      `;
      const btn = button('Start', { size: 'small', variant: 'subtle', iconName: 'play', onClick: () => { this.startScenario(s.id); } });
      card.appendChild(btn);
      body.appendChild(card);
    }

    modal({
      title: 'Select Scenario',
      subtitle: 'Choose a scenario to run',
      body,
      footer: [button('Cancel', { onClick: () => {} })],
      size: 'medium',
    });
  }

  /**
   * Event system
   */
  on(event, callback) {
    if (!this.eventCallbacks[event]) this.eventCallbacks[event] = [];
    this.eventCallbacks[event].push(callback);
  }

  off(event, callback) {
    if (!this.eventCallbacks[event]) return;
    this.eventCallbacks[event] = this.eventCallbacks[event].filter(cb => cb !== callback);
  }

  _fireEvent(event, data) {
    if (this.eventCallbacks[event]) {
      for (const cb of this.eventCallbacks[event]) {
        try { cb(data); } catch (e) { console.error('Scenario event callback error:', e); }
      }
    }
  }

  /**
   * Get current scenario state for saving
   */
  getState() {
    return {
      currentScenarioId: this.currentScenario?.id,
      currentStepIndex: this.currentStepIndex,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      scenarioStartTime: this.scenarioStartTime,
      completedSteps: this.completedSteps,
      stepHistory: this.stepHistory,
      narrationEnabled: this.narrationEnabled,
      instructionsEnabled: this.instructionsEnabled,
      autoCameraEnabled: this.autoCameraEnabled,
      speed: this.speed,
    };
  }

  /**
   * Restore scenario state
   */
  restoreState(state) {
    this.narrationEnabled = state.narrationEnabled ?? true;
    this.instructionsEnabled = state.instructionsEnabled ?? true;
    this.autoCameraEnabled = state.autoCameraEnabled ?? true;
    this.speed = state.speed ?? 1.0;

    if (state.currentScenarioId && state.isRunning) {
      this.startScenario(state.currentScenarioId).then(() => {
        if (state.currentStepIndex >= 0) {
          this.currentStepIndex = state.currentStepIndex - 1;
          this.nextStep();
        }
        if (state.isPaused) this.pause();
      });
    }
  }
}

/**
 * Create standard infrastructure scenarios
 * These can be customized per infrastructure
 */
export function createStandardScenarios(infrastructureId) {
  const scenarios = {};

  // Generic scenarios that work for any infrastructure
  scenarios[`${infrastructureId}-startup`] = {
    id: `${infrastructureId}-startup`,
    name: 'Cold Startup Sequence',
    description: 'Bring the facility from cold shutdown to full operational status',
    infrastructure: infrastructureId,
    steps: [
      {
        id: 'init',
        title: 'Initialize Facility',
        description: 'Verify all systems are in safe state and ready for startup',
        objective: 'Confirm all equipment is offline and sensors are nominal',
        checkComplete: (infra) => infra.manualMode === true,
        autoAdvanceDelay: 5000,
      },
      {
        id: 'power',
        title: 'Energize Power Systems',
        description: 'Activate main power distribution and verify voltages',
        objective: 'Turn on main power and confirm all buses are energized',
        onEnter: (infra) => { infra.setManual?.(false); },
        checkComplete: (infra) => !infra.manualMode,
        autoAdvanceDelay: 8000,
      },
      {
        id: 'equipment',
        title: 'Start Primary Equipment',
        description: 'Bring main process equipment online in sequence',
        objective: 'Start primary motors, pumps, or generators',
        checkComplete: (infra) => true, // Infrastructure-specific
        autoAdvanceDelay: 10000,
      },
      {
        id: 'stabilize',
        title: 'Stabilize Process',
        description: 'Allow process variables to stabilize at setpoints',
        objective: 'Monitor key parameters until they reach steady state',
        checkComplete: (infra) => true,
        autoAdvanceDelay: 15000,
      },
      {
        id: 'verify',
        title: 'Verify Full Operation',
        description: 'Confirm all systems operational and alarms clear',
        objective: 'Verify no active alarms and all sensors reading nominal',
        checkComplete: (infra) => (infra.getActiveAlarms?.()?.length || 0) === 0,
        autoAdvanceDelay: 5000,
      },
    ],
  };

  scenarios[`${infrastructureId}-shutdown`] = {
    id: `${infrastructureId}-shutdown`,
    name: 'Controlled Shutdown',
    description: 'Safely shut down the facility following proper procedures',
    infrastructure: infrastructureId,
    steps: [
      {
        id: 'reduce',
        title: 'Reduce Load',
        description: 'Gradually reduce production/process load',
        objective: 'Decrease equipment output to minimum safe levels',
        autoAdvanceDelay: 10000,
      },
      {
        id: 'stop-equipment',
        title: 'Stop Equipment',
        description: 'Shut down process equipment in reverse startup order',
        objective: 'Stop all motors, pumps, and active equipment',
        autoAdvanceDelay: 10000,
      },
      {
        id: 'isolate',
        title: 'Isolate Energy Sources',
        description: 'De-energize and isolate all energy sources',
        objective: 'Open breakers, close valves, engage safety locks',
        autoAdvanceDelay: 8000,
      },
      {
        id: 'verify-safe',
        title: 'Verify Safe State',
        description: 'Confirm facility is in safe, zero-energy state',
        objective: 'Verify all hazards isolated and facility secure',
        autoAdvanceDelay: 5000,
      },
    ],
  };

  scenarios[`${infrastructureId}-emergency`] = {
    id: `${infrastructureId}-emergency`,
    name: 'Emergency Response Drill',
    description: 'Practice responding to a critical alarm condition',
    infrastructure: infrastructureId,
    steps: [
      {
        id: 'alarm',
        title: 'Emergency Alarm',
        description: 'A critical alarm has been triggered',
        objective: 'Acknowledge the alarm and assess the situation',
        onEnter: (infra) => { /* Inject fault */ },
        checkComplete: (infra) => true,
        autoAdvanceDelay: 5000,
      },
      {
        id: 'respond',
        title: 'Emergency Response',
        description: 'Execute emergency procedures',
        objective: 'Follow the emergency response checklist',
        checkComplete: (infra) => true,
        autoAdvanceDelay: 15000,
      },
      {
        id: 'recover',
        title: 'Recovery',
        description: 'Return facility to normal operation',
        objective: 'Clear the fault and restore normal operation',
        checkComplete: (infra) => (infra.getActiveAlarms?.()?.length || 0) === 0,
        autoAdvanceDelay: 10000,
      },
    ],
  };

  return scenarios;
}

export default ScenarioManager;