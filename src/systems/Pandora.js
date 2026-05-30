/**
 * Pandora.js
 * Manages the AI status line displayed below the HUD.
 * Also owns the Level 4 arm-interference timer.
 * Small, dim, easy to miss. That's intentional.
 */
export class Pandora {
  constructor(scene, worldName) {
    this.scene = scene;
    this.worldName = worldName; // 'LOGISTICS' or 'ENGINEERING'
    this._statusText = null;

    // Arm interference timer (Level 4)
    this._armScene       = null;
    this._armTriggerFn   = null;
    this._armLevelDayFn  = null;
    this._armTimerHandle = null;

    this._build();
  }

  _build() {
    const { width, height } = this.scene.scale;

    // Position: bottom of screen, above Hermes bar (which is 48px tall)
    // Press Start 2P 7px, dim purple #6600AA — easy to miss
    this._statusText = this.scene.add.text(
      width / 2,
      height - 54,
      this._buildLabel('OBSERVING'),
      {
        fontFamily: "'Press Start 2P'",
        fontSize: '7px',
        color: '#6600AA',
        align: 'center'
      }
    ).setOrigin(0.5, 1).setDepth(90);
  }

  _buildLabel(status) {
    return `PANDORA ${this.worldName} MODULE — ${status}`;
  }

  // Update status based on current day
  updateForDay(day) {
    let status;
    if (day < 10)      status = 'OBSERVING';
    else if (day < 20) status = 'LEARNING';
    else if (day < 30) status = 'CALIBRATING';
    else               status = 'READY';

    this._statusText.setText(this._buildLabel(status));
    return status;
  }

  // ── Level 4 arm interference ──────────────────────────────────────────────

  /**
   * Begin the arm interference loop for Level 4.
   * @param {Phaser.Scene} scene          — Phaser scene (for time.delayedCall)
   * @param {Function}     triggerFn      — () => void  called when arm fires
   * @param {Function}     getLevelDayFn  — () => number  days elapsed in Level 4
   */
  startArmInterference(scene, triggerFn, getLevelDayFn) {
    this._stopArmTimer();
    this._armScene      = scene;
    this._armTriggerFn  = triggerFn;
    this._armLevelDayFn = getLevelDayFn;
    this._scheduleNextArm();
  }

  /**
   * Called by World1Scene after each arm sequence finishes — schedules next trigger.
   */
  rescheduleArm() {
    this._scheduleNextArm();
  }

  stopArmInterference() {
    this._stopArmTimer();
  }

  // ── Internal timing ───────────────────────────────────────────────────────

  _scheduleNextArm() {
    this._stopArmTimer();
    if (!this._armScene || !this._armTriggerFn) return;

    const levelDay = this._armLevelDayFn ? this._armLevelDayFn() : 0;
    // Days 1–4 of Level 4: 10–12 s; Days 5+: 6–8 s
    const delay = levelDay >= 5
      ? Phaser.Math.Between(6000, 8000)
      : Phaser.Math.Between(10000, 12000);

    this._armTimerHandle = this._armScene.time.delayedCall(delay, () => {
      if (this._armTriggerFn) this._armTriggerFn();
      // Rescheduling is handled by World1Scene via rescheduleArm()
      // after the arm animation completes.
    });
  }

  _stopArmTimer() {
    if (this._armTimerHandle) {
      this._armTimerHandle.remove(false);
      this._armTimerHandle = null;
    }
    this._armScene      = null;
    this._armTriggerFn  = null;
    this._armLevelDayFn = null;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroy() {
    this.stopArmInterference();
    if (this._statusText) this._statusText.destroy();
  }
}
