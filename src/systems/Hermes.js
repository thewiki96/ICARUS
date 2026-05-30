/**
 * Hermes.js
 * Efficiency system — the "sweet spot" meter.
 * Thresholds are NEVER shown to the player.
 */
export class Hermes {
  constructor(scene, gameState) {
    this.scene = scene;
    this.gameState = gameState;

    // Hidden thresholds
    this._minThreshold = 25;
    this._maxThreshold = 75;

    // Natural decay interval
    this._decayTimer = null;
    this._decayInterval = 1000; // 1 second
    this._decayAmount = 1;      // -1% per second toward 50%

    // Callbacks
    this.onFired = null;
    this.onPandora = null;
    this.onEfficiencyChange = null;
  }

  start() {
    this._decayTimer = this.scene.time.addEvent({
      delay: this._decayInterval,
      callback: this._applyDecay,
      callbackScope: this,
      loop: true
    });
  }

  stop() {
    if (this._decayTimer) {
      this._decayTimer.remove(false);
      this._decayTimer = null;
    }
  }

  // Called every 5 in-game days — narrows the safe zone
  narrowSweetSpot() {
    this._minThreshold = Math.min(this._minThreshold + 2, 45);
    // maxThreshold never rises — ceiling stays fixed at 75
    console.debug(`[Hermes] Sweet spot narrowed: ${this._minThreshold}–${this._maxThreshold}`);
  }

  // ── Efficiency adjustments ────────────────────────────────────────────────

  onTaskFast() {
    // Fast + correct: +8%
    this._adjust(+8);
  }

  onTaskSlow() {
    // Slow + correct: -3%
    this._adjust(-3);
  }

  onTaskFailed() {
    // Kronos expired: -15%
    this._adjust(-15);
  }

  onTaskWrongSlot() {
    // Wrong delivery slot: -8%
    this._adjust(-8);
  }

  onPriorityFast() {
    // Priority package fast: +12%
    this._adjust(+12);
  }

  onFragileWrong() {
    // Fragile in wrong slot: doubles normal wrong penalty = -16%
    this._adjust(-16);
  }

  onConveyorTimeout() {
    // Package scrolled off the right edge without delivery: -10%
    this._adjust(-10);
  }

  onPandoraIntervene() {
    // Pandora auto-delivered a package on the player's behalf: +6%
    // (Pushes efficiency UP toward the danger zone — that's the point)
    this._adjust(+6);
  }

  // ── World 2 — Engineering outcomes ────────────────────────────────────────

  /** Wrong solution submitted — bad topology, no INPUT→OUTPUT path: −15% */
  onTaskWrong() {
    this._adjust(-15);
  }

  /** Incomplete solution submitted — disconnected nodes present: −10% */
  onTaskIncomplete() {
    this._adjust(-10);
  }

  /** Correct solution with extra connections (acceptable): +3% */
  onTaskAcceptable() {
    this._adjust(+3);
  }

  /** Over-engineered solution — maximum connections (messy): −2% */
  onTaskMessy() {
    this._adjust(-2);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _adjust(amount) {
    const prev = this.gameState.efficiency;
    this.gameState.efficiency = Math.max(0, Math.min(100, prev + amount));
    if (this.onEfficiencyChange) this.onEfficiencyChange(this.gameState.efficiency);
    this._checkGameOver();
  }

  _applyDecay() {
    const eff = this.gameState.efficiency;
    // Decay toward 50 baseline
    if (eff > 50) {
      this._adjust(-this._decayAmount);
    } else if (eff < 50) {
      this._adjust(+this._decayAmount);
    }
  }

  _checkGameOver() {
    const eff = this.gameState.efficiency;
    if (eff < this._minThreshold) {
      this.stop();
      if (this.onFired) this.onFired();
    } else if (eff > this._maxThreshold) {
      this.stop();
      if (this.onPandora) this.onPandora();
    }
  }

  // ── Public getters for HUD ────────────────────────────────────────────────

  getEfficiency() {
    return this.gameState.efficiency;
  }

  // Returns 'safe' | 'warn' | 'danger'
  getZone() {
    const eff = this.gameState.efficiency;
    const min = this._minThreshold;
    const max = this._maxThreshold;

    if (eff <= min + 10 || eff >= max - 10) {
      // Within 10% of either threshold = warn
      if (eff <= min || eff >= max) return 'danger';
      return 'warn';
    }
    return 'safe';
  }

  getMinThreshold() { return this._minThreshold; }
  getMaxThreshold() { return this._maxThreshold; }
}
