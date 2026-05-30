/**
 * InstructionsScene.js
 * Employee onboarding. Explains controls — never mentions the sweet spot.
 * Icarus still hovers. Intro music keeps playing.
 * START → fly-forward → World1Scene
 * BACK  → IntroScene
 */
export class InstructionsScene extends Phaser.Scene {
  constructor() {
    super({ key: 'InstructionsScene' });
    this._transitioning = false;
    this._inputReady = false;
  }

  // Reset flags before every create() call
  init() {
    this._transitioning = false;
    this._inputReady = false;
  }

  create() {
    const { width: w, height: h } = this.scale;
    this._w = w;
    this._h = h;

    this._audio = this.registry.get('audio');

    // ── Background (same dark starfield) ─────────────────────────────────
    this._buildBackground();

    // ── Icarus hovers — small, top-left corner ────────────────────────────
    this._sprite = this.add.sprite(72, h * 0.18, 'icarus_hover')
      .setScale(0.5)
      .play('hover')
      .setAlpha(0.85);

    this.tweens.add({
      targets: this._sprite,
      y: this._sprite.y - 6,
      duration: 2000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });

    // ── Main instructions panel ───────────────────────────────────────────
    this._buildPanel(w, h);

    // ── Buttons ───────────────────────────────────────────────────────────
    this._buildButtons(w, h);

    // ── Input — delay 300ms to drop any stray pointer/key carried from
    //   the previous scene's click (IntroScene fly-forward) ───────────────
    this.time.delayedCall(300, () => {
      this._inputReady = true;
      this.input.keyboard.on('keydown-ENTER', () => this._startGame());

      // ESC via native DOM (version-proof across Phaser key-name changes)
      this._onKeyDown = (e) => {
        if (e.keyCode === 27) this._goBack();
      };
      window.addEventListener('keydown', this._onKeyDown);
    });
  }

  // ── Background ────────────────────────────────────────────────────────────

  _buildBackground() {
    const { _w: w, _h: h } = this;
    const gfx = this.add.graphics();

    gfx.fillStyle(0x050510, 1);
    gfx.fillRect(0, 0, w, h);

    for (let r = Math.max(w, h) * 0.8; r > 0; r -= 30) {
      gfx.fillStyle(0x0D0D2B, 0.025 * (r / (Math.max(w, h) * 0.8)));
      gfx.fillCircle(w / 2, h / 2, r);
    }

    const stars = this.registry.get('stars') || [];
    const sg = this.add.graphics();
    stars.forEach(s => {
      sg.fillStyle(0xFFFFFF, s.alpha * 0.7);
      sg.fillRect(s.x, s.y, s.size, s.size);
    });

    const sc = this.add.graphics();
    sc.fillStyle(0x000000, 0.08);
    for (let y = 0; y < h; y += 3) sc.fillRect(0, y, w, 1);
  }

  // ── Panel ─────────────────────────────────────────────────────────────────

  _buildPanel(w, h) {
    const panelW = Math.min(820, w - 32);
    const panelH = 310;
    const panelX = w / 2 - panelW / 2;
    const panelY = h / 2 - panelH / 2 - 16;

    // Border + background
    const gfx = this.add.graphics();
    gfx.fillStyle(0x000014, 0.93);
    gfx.fillRect(panelX, panelY, panelW, panelH);
    gfx.lineStyle(3, 0x00FFFF, 1);
    gfx.strokeRect(panelX, panelY, panelW, panelH);
    gfx.lineStyle(1, 0x007788, 0.35);
    gfx.strokeRect(panelX + 3, panelY + 3, panelW - 6, panelH - 6);

    // ── Header ────────────────────────────────────────────────────────────
    this.add.text(panelX + panelW / 2, panelY + 14, 'PROMETHEUS INC. — EMPLOYEE ONBOARDING', {
      fontFamily: "'Press Start 2P'",
      fontSize: '9px',
      color: '#FFD700'
    }).setOrigin(0.5, 0);

    gfx.lineStyle(1, 0x007788, 0.6);
    gfx.lineBetween(panelX + 12, panelY + 34, panelX + panelW - 12, panelY + 34);

    // ── Layout constants ──────────────────────────────────────────────────
    const col1X  = panelX + 20;
    const col2X  = panelX + panelW / 2 + 14;
    const startY = panelY + 46;
    const LBL    = '#007788';  // section label color
    const BODY   = '#00FFFF';  // body text color
    const LH8    = 14;         // line height — 8px Press Start 2P
    const LH7    = 13;         // line height — 7px Press Start 2P
    const GAP    = 14;         // vertical gap between sections

    // Renders a section label + body lines; returns Y below the last body line
    const section = (x, y, label, lines) => {
      this._line(x, y, label, LBL, '8px');
      let cy = y + LH8;
      for (const ln of lines) {
        this._line(x, cy, ln, BODY, '7px');
        cy += LH7;
      }
      return cy;
    };

    // ── LEFT column: YOUR ROLE + HERMES LOGISTICS ────────────────────────
    let ly = startY;

    ly = section(col1X, ly, '— YOUR ROLE —', [
      'Welcome to Prometheus Inc.',
      'You have been assigned to an active',
      'fulfillment or engineering position.',
      'Your performance is monitored',
      'continuously.',
    ]);
    ly += GAP;

    section(col1X, ly, '— HERMES LOGISTICS —', [
      'Packages arrive on the conveyor.',
      'Deliver each package to its',
      'designated slot before time expires.',
      'Package types vary. Read labels carefully.',
      'Protocols are subject to change.',
    ]);

    // ── RIGHT column: ENGINEERING + PERFORMANCE + CONTROLS + footer ───────
    let ry = startY;

    ry = section(col2X, ry, '— SPHINX SYSTEMS —', [
      'Tickets are assigned in order of priority.',
      'Connect logic nodes to complete each task.',
      'Efficient solutions are preferred.',
      'Incomplete submissions will be noted.',
    ]);
    ry += GAP;

    ry = section(col2X, ry, '— PERFORMANCE —', [
      'KRONOS    time remaining per task',
      'ARGOS     your current employment status',
      'DAY       days in active service',
    ]);
    ry += GAP;

    ry = section(col2X, ry, '— CONTROLS —', [
      'CLICK     interact / deliver / connect',
      'ENTER     confirm',
      'ESC       return to menu',
    ]);
    ry += GAP;

    this._line(col2X, ry,        'Prometheus Inc. thanks you',         LBL, '7px');
    this._line(col2X, ry + LH7,  'for your commitment to excellence.', LBL, '7px');

    // Vertical divider
    gfx.lineStyle(1, 0x007788, 0.4);
    gfx.lineBetween(panelX + panelW / 2, panelY + 38, panelX + panelW / 2, panelY + panelH - 14);

    this._panelBottom = panelY + panelH;
  }

  _label(x, y, text, color, size) {
    this.add.text(x, y, text, {
      fontFamily: "'Press Start 2P'",
      fontSize: size || '8px',
      color: color
    });
  }

  _line(x, y, text, color, size) {
    this.add.text(x, y, text, {
      fontFamily: "'Press Start 2P'",
      fontSize: size || '8px',
      color: color
    });
  }

  // ── Buttons ───────────────────────────────────────────────────────────────

  _buildButtons(w, h) {
    const btnY = this._panelBottom + 20;
    const gap  = 200;

    // [ START ]
    const startBtn = this.add.text(w / 2 - gap / 2, btnY, '[ START ]', {
      fontFamily: "'Press Start 2P'",
      fontSize: '12px',
      color: '#00FFFF'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this.tweens.add({
      targets: startBtn,
      alpha: 0,
      duration: 500,
      ease: 'Linear',
      yoyo: true,
      repeat: -1
    });

    startBtn.on('pointerover',  () => startBtn.setColor('#FFD700'));
    startBtn.on('pointerout',   () => startBtn.setColor('#00FFFF'));
    startBtn.on('pointerdown',  () => this._startGame());

    // [ BACK TO MENU ]
    const backBtn = this.add.text(w / 2 + gap / 2, btnY, '[ BACK TO MENU ]', {
      fontFamily: "'Press Start 2P'",
      fontSize: '10px',
      color: '#007788'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    backBtn.on('pointerover',  () => backBtn.setColor('#00FFFF'));
    backBtn.on('pointerout',   () => backBtn.setColor('#007788'));
    backBtn.on('pointerdown',  () => this._goBack());
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  _startGame() {
    if (!this._inputReady || this._transitioning) return;
    this._transitioning = true;

    // Ensure AudioContext is live for the first user gesture case
    if (this._audio) {
      this._audio.resume();
      this._audio.stopAll();          // kill any lingering loop schedules
      this._audio.setVolume(1.0);     // cancel any in-flight fade ramp
    }

    // Flash into WorldSelectScene (player picks World 1 or World 2 there)
    const flash = document.getElementById('flash-overlay');
    flash.style.transition = 'opacity 0.25s ease-in';
    flash.style.opacity = '1';

    setTimeout(() => {
      this.scene.start('WorldSelectScene');
      setTimeout(() => {
        flash.style.transition = 'opacity 0.4s ease-out';
        flash.style.opacity = '0';
      }, 200);
    }, 300);
  }

  _goBack() {
    if (!this._inputReady || this._transitioning) return;
    this._transitioning = true;

    const flash = document.getElementById('flash-overlay');
    flash.style.transition = 'opacity 0.2s ease-in';
    flash.style.opacity = '1';

    setTimeout(() => {
      this.scene.start('IntroScene');
      setTimeout(() => {
        flash.style.transition = 'opacity 0.3s ease-out';
        flash.style.opacity = '0';
      }, 150);
    }, 250);
  }

  shutdown() {
    this._transitioning = false;
    this._inputReady = false;
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
  }
}
