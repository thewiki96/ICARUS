/**
 * RetroNotification.js
 * HTML/CSS notification system. Slides in from right, auto-dismisses.
 * type: 'INFO' | 'WARNING' | 'SYSTEM' | 'HR'
 */
export class RetroNotification {
  constructor() {
    this._container = document.getElementById('notification-container');
    this._queue = [];
    this._showing = false;
  }

  show(type, message, delay = 0) {
    setTimeout(() => {
      this._enqueue(type, message);
    }, delay);
  }

  _enqueue(type, message) {
    this._queue.push({ type, message });
    if (!this._showing) this._processQueue();
  }

  _processQueue() {
    if (this._queue.length === 0) {
      this._showing = false;
      return;
    }
    this._showing = true;
    const { type, message } = this._queue.shift();
    this._display(type, message);
  }

  _display(type, message) {
    const el = document.createElement('div');
    el.className = `retro-notification type-${type}`;

    el.innerHTML = `
      <span class="notif-type">[${type}]</span>
      <span class="notif-text">${message}</span>
    `;

    this._container.appendChild(el);

    // Slide in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add('show');
      });
    });

    // Auto-dismiss after 4s
    setTimeout(() => {
      el.classList.add('hide');
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
        // Small delay before next notification
        setTimeout(() => this._processQueue(), 300);
      }, 500);
    }, 4000);
  }

  clearAll() {
    this._queue = [];
    this._showing = false;
    while (this._container.firstChild) {
      this._container.removeChild(this._container.firstChild);
    }
  }
}
