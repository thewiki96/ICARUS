/**
 * Kronos.js
 * Per-task countdown timer. Determines fast/slow/failed outcomes.
 */
export class Kronos {
  constructor(scene) {
    this.scene = scene;
    this._timer = null;
    this._remaining = 0;
    this._total = 0;
    this._running = false;

    // Callbacks
    this.onExpire = null;       // called when time runs out
    this.onTick = null;         // called every second with remaining seconds
    this.onWarning = null;      // called when under 5 seconds
    this._warned = false;
  }

  // Start a new countdown. timeSeconds: total time for this task.
  start(timeSeconds) {
    this.stop();
    this._total = timeSeconds;
    this._remaining = timeSeconds;
    this._running = true;
    this._warned = false;

    this._timer = this.scene.time.addEvent({
      delay: 1000,
      callback: this._tick,
      callbackScope: this,
      loop: true
    });
  }

  stop() {
    if (this._timer) {
      this._timer.remove(false);
      this._timer = null;
    }
    this._running = false;
  }

  pause() {
    if (this._timer) this._timer.paused = true;
    this._running = false;
  }

  resume() {
    if (this._timer) this._timer.paused = false;
    this._running = true;
  }

  _tick() {
    this._remaining--;

    if (this.onTick) this.onTick(this._remaining);

    if (this._remaining <= 5 && !this._warned) {
      this._warned = true;
      if (this.onWarning) this.onWarning();
    }

    if (this._remaining <= 0) {
      this.stop();
      if (this.onExpire) this.onExpire();
    }
  }

  getRemaining() { return this._remaining; }
  getTotal()     { return this._total; }
  isRunning()    { return this._running; }

  // Returns 'fast' | 'slow' based on how much time was left when task completed
  // Fast: completed with > 50% time remaining
  getSpeed() {
    const ratio = this._remaining / this._total;
    return ratio > 0.5 ? 'fast' : 'slow';
  }
}
