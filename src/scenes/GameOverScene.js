/**
 * GameOverScene.js
 * Two variants: 'pandora' (automated) and 'fired' (underperformance).
 * Cold, formal, impersonal. No score. Just days.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data) {
    this._type         = data.type || 'fired';
    this._day          = data.day  || 0;
    this._transitioning = false;
  }

  create() {
    const { width, height } = this.scale;
    this._w = width;
    this._h = height;

    // ── Audio ─────────────────────────────────────────────────────────────
    this._audio = this.registry.get('audio');
    if (this._audio) {
      this._audio.stopAll();
      this._audio.setVolume(1.0);
      this._audio.resume();
      if (this._type === 'pandora') {
        this._audio.playGameOverPandora();
      } else {
        this._audio.playGameOverFired();
      }
    }

    // ── Reset game state ──────────────────────────────────────────────────
    this.registry.set('gameState', null);

    // ── Background ────────────────────────────────────────────────────────
    this._buildBackground();

    // ── GAME OVER title — flickers in immediately, before animation ───────
    this._buildGameOverTitle();

    // ── Scene-specific content ────────────────────────────────────────────
    if (this._type === 'pandora') {
      this._buildPandoraScene();
    } else {
      this._buildFiredScene();
    }

    // ── Restart button ────────────────────────────────────────────────────
    this._buildRestartButton();

    // ── Input ─────────────────────────────────────────────────────────────
    this.input.keyboard.on('keydown-ENTER', () => this._restart());
    this.input.keyboard.on('keydown-M',     () => this._mainMenu());
  }

  // ── GAME OVER title ───────────────────────────────────────────────────────

  _buildGameOverTitle() {
    const color = this._type === 'pandora' ? '#CC00FF' : '#FF2200';
    const title = this.add.text(this._w / 2, 60, 'GAME OVER', {
      fontFamily: "'Press Start 2P'",
      fontSize:   '32px',
      color
    }).setOrigin(0.5).setDepth(60).setAlpha(0);

    // Flicker: 3 rapid 0→1 pulses over ~400ms, then hand off to persistent tweens
    let count = 0;
    const flicker = this.time.addEvent({
      delay: 66,
      callback: () => {
        count++;
        title.setAlpha(title.alpha > 0 ? 0 : 1);
        if (count >= 6) {          // 3 full off/on cycles
          flicker.remove();
          title.setAlpha(1);

          // Strobe 3× → pause 1.5 s → repeat
          const strobeSequence = () => {
            this.tweens.add({
              targets:    title,
              alpha:      { from: 1, to: 0 },
              duration:   80,
              yoyo:       true,
              repeat:     2,
              ease:       'Stepped',
              easeParams: [1],
              onComplete: () => {
                title.setAlpha(1);
                this.time.delayedCall(1500, strobeSequence);
              }
            });
          };
          strobeSequence();

          // Scale pulse — slow breath on top of the strobe
          this.tweens.add({
            targets:  title,
            scaleX:   { from: 1, to: 1.05 },
            scaleY:   { from: 1, to: 1.05 },
            duration: 600,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut'
          });
        }
      },
      repeat: 6
    });
  }

  // ── Background ────────────────────────────────────────────────────────────

  _buildBackground() {
    const { _w: w, _h: h } = this;
    const gfx = this.add.graphics();

    gfx.fillStyle(0x050510, 1);
    gfx.fillRect(0, 0, w, h);

    // Vignette
    for (let r = Math.max(w, h) * 0.75; r > 0; r -= 25) {
      const alpha = 0.03 * (r / (Math.max(w, h) * 0.75));
      gfx.fillStyle(0x0D0D2B, alpha);
      gfx.fillCircle(w / 2, h / 2, r);
    }

    // Stars
    const stars = this.registry.get('stars') || [];
    const starGfx = this.add.graphics();
    stars.forEach(s => {
      starGfx.fillStyle(0xFFFFFF, s.alpha * 0.6);
      starGfx.fillRect(s.x, s.y, s.size, s.size);
    });

    // Scanlines
    const scanGfx = this.add.graphics();
    scanGfx.fillStyle(0x000000, 0.08);
    for (let y = 0; y < h; y += 3) scanGfx.fillRect(0, y, w, 1);
  }

  // ── Pandora variant ────────────────────────────────────────────────────────

  _buildPandoraScene() {
    const { _w: w, _h: h } = this;

    // Sun fixed at top — Icarus falls away from it
    this._sunSprite = this.add.sprite(w / 2, h * 0.10, 'sun')
      .setScale(0.5)
      .setAlpha(0.85)
      .setDepth(4)
      .play('sun_pulse');

    // Panel built first so it sits above the sprite (depth 50 vs sprite depth 5)
    // Starts invisible — fades in when Icarus reaches mid-screen
    this._buildPandoraPanel();

    // Icarus starts at top center, same as fired variant
    this._icarusSprite = this.add.sprite(w / 2, h * 0.05, 'icarus_falling')
      .setScale(0.8)
      .setDepth(5)     // below panel (depth 50) so panel reads over sprite
      .play('falling');

    // Falls past mid-screen and off the bottom — no splash, no stop
    let panelFaded = false;
    this.tweens.add({
      targets:  this._icarusSprite,
      y:        h * 1.2,
      duration: 5500,
      ease:     'Quad.easeIn',
      onUpdate: () => {
        // Fade panel in exactly when sprite crosses the mid-screen threshold
        if (!panelFaded && this._icarusSprite.y >= h * 0.5) {
          panelFaded = true;
          this.tweens.add({
            targets:  this._pandoraPanelObjects,
            alpha:    1,
            duration: 600,
            ease:     'Sine.easeIn'
          });
        }
      }
    });
  }

  _spawnFeathers() {
    const { _w: w, _h: h } = this;
    const sprite = this._icarusSprite;

    // Emit orange rectangles as "feathers"
    const particles = this.add.graphics();
    const feathers = [];
    for (let i = 0; i < 20; i++) {
      feathers.push({
        x: sprite.x + Phaser.Math.Between(-60, 60),
        y: sprite.y + Phaser.Math.Between(-40, 20),
        vx: Phaser.Math.FloatBetween(-1.5, 1.5),
        vy: Phaser.Math.FloatBetween(0.5, 2.0),
        alpha: 1.0,
        w: Phaser.Math.Between(4, 10),
        h: Phaser.Math.Between(2, 5),
        color: Math.random() < 0.5 ? 0xFF6600 : 0xFFAA00
      });
    }

    // Animate feathers falling
    this.time.addEvent({
      delay: 50,
      callback: () => {
        particles.clear();
        feathers.forEach(f => {
          f.x  += f.vx;
          f.y  += f.vy;
          f.vy += 0.08; // gravity
          f.alpha = Math.max(0, f.alpha - 0.008);
          if (f.alpha > 0) {
            particles.fillStyle(f.color, f.alpha);
            particles.fillRect(f.x, f.y, f.w, f.h);
          }
        });
      },
      repeat: 150
    });
  }

  // ── Fired variant ─────────────────────────────────────────────────────────

  _buildFiredScene() {
    const { _w: w, _h: h } = this;

    // Sea graphics — created once here, cleared and redrawn every frame in update()
    this._seaGraphics = this.add.graphics().setDepth(1);

    // Icarus falling — top center, explicit depth + visibility
    this._icarusSprite = this.add.sprite(w / 2, h * 0.05, 'icarus_falling')
      .setScale(0.8)
      .setDepth(2)
      .setVisible(true)
      .play('falling');

    // Icarus falls downward — splash fires on arrival
    this.tweens.add({
      targets:  this._icarusSprite,
      y:        h * 0.52,
      duration: 3500,
      ease:     'Quad.easeIn',
      onComplete: () => this._icarusSplash()
    });

    // Panel — red border, invisible until after splash
    this._buildFiredPanel();
  }

  _drawSea(time) {
    const { _w: w, _h: h } = this;
    if (!this._seaGraphics) return;
    this._seaGraphics.clear();

    const layers = [
      { color: 0x0A0A3E, baseY: h * 0.85, height: h * 0.15 },
      { color: 0x0D1B5E, baseY: h * 0.78, height: 40 },
      { color: 0x1A2F7A, baseY: h * 0.73, height: 30 },
      { color: 0x2644A8, baseY: h * 0.70, height: 20 },
    ];

    layers.forEach((layer, i) => {
      const wave = Math.sin(time * 0.001 + i * 0.8) * 6;
      this._seaGraphics.fillStyle(layer.color, 1);
      this._seaGraphics.fillRect(0, layer.baseY + wave, w, layer.height);
    });
  }

  _icarusSplash() {
    const { _w: w } = this;
    const splashY = this._icarusSprite.y;  // impact point — wherever Icarus landed
    this._icarusSprite.setVisible(false);

    // White circle expands from impact point and fades (~300 ms total)
    const splashGfx = this.add.graphics().setDepth(10);
    let radius = 5;
    let alpha  = 1.0;

    const splash = this.time.addEvent({
      delay: 30,
      callback: () => {
        splashGfx.clear();
        splashGfx.fillStyle(0xFFFFFF, alpha);
        splashGfx.fillCircle(w / 2, splashY, radius);
        radius += 8;
        alpha  -= 0.08;
        if (alpha <= 0) {
          splash.remove();
          splashGfx.destroy();
          // Panel fades in immediately after splash
          if (this._firedPanelObjects) {
            this.tweens.add({
              targets:  this._firedPanelObjects,
              alpha:    1,
              duration: 400,
              ease:     'Sine.easeIn'
            });
          }
        }
      },
      repeat: 14
    });
  }

  // ── Fired panel — starts invisible, fades in after splash ────────────────

  _buildFiredPanel() {
    const { _w: w, _h: h } = this;
    const borderHex   = 0xFF2200;
    const borderColor = '#FF2200';
    const panelW = Math.min(420, w - 40);
    const panelX = w / 2 - panelW / 2;
    const dayStr = String(this._day).padStart(3, '0');

    const lines = [
      'PROMETHEUS INC.',
      'HR NOTIFICATION',
      '',
      'Your employment has been',
      'terminated due to sustained',
      'underperformance.',
      '',
      'We wish you well in your',
      'future endeavors.',
      '',
      `DAY ${dayStr} — FINAL`,
    ];

    const maxPanelH = h * 0.45 - 60;
    const lineH     = Math.min(16, Math.floor((maxPanelH - 32) / lines.length));
    const panelH    = lines.length * lineH + 32;
    const panelY    = h - panelH - 60;

    const panelObjs = [];

    const gfx = this.add.graphics().setDepth(50).setAlpha(0);
    gfx.fillStyle(0x000014, 0.94);
    gfx.fillRect(panelX, panelY, panelW, panelH);
    gfx.lineStyle(3, borderHex, 1);
    gfx.strokeRect(panelX, panelY, panelW, panelH);
    gfx.lineStyle(1, borderHex, 0.25);
    gfx.strokeRect(panelX + 3, panelY + 3, panelW - 6, panelH - 6);
    panelObjs.push(gfx);

    lines.forEach((line, i) => {
      if (line === '') return;
      const t = this.add.text(panelX + panelW / 2, panelY + 14 + i * lineH, line, {
        fontFamily: "'Press Start 2P'",
        fontSize:   '8px',
        color:      borderColor,
        align:      'center'
      }).setOrigin(0.5, 0).setDepth(51).setAlpha(0);
      panelObjs.push(t);
    });

    this._firedPanelObjects = panelObjs;
    this._panelBottom = panelY + panelH;
  }

  // ── Pandora panel — variable-spaced to let copy breathe ──────────────────

  _buildPandoraPanel() {
    const { _w: w, _h: h } = this;
    const color    = '#CC00FF';
    const colorHex = 0xCC00FF;
    const panelW   = Math.min(420, w - 40);
    const panelX   = w / 2 - panelW / 2;
    const dayStr   = String(this._day).padStart(3, '0');

    // [marginTop, fontSizePx, text]
    // marginTop = gap ABOVE this line (from bottom of previous line).
    // LH8 / LH7 = approximate rendered glyph height for each font size.
    const TOP  = 14;   // inner top padding
    const BOT  = 14;   // inner bottom padding
    const LH8  = 12;   // Press Start 2P at 8px
    const LH7  = 10;   // Press Start 2P at 7px

    const entries = [
      [0,  8, 'PROMETHEUS INC.'],
      [10, 8, 'AUTOMATED TRANSITION NOTICE'],
      [18, 7, 'Effective immediately, your role has been'],
      [9,  7, 'assumed by Pandora v2.1.'],
      [18, 7, `Your performance data — ${this._day} days`],
      [9,  7, 'of recorded labor — has been used to'],
      [9,  7, 'train the system that replaces you.'],
      [18, 7, 'Your contribution to our automation'],
      [9,  7, 'infrastructure has been invaluable.'],
      [26, 8, 'You are no longer required.'],  // ← extra top gap for isolation
      [16, 7, 'We wish you well.'],
      [16, 8, `DAY ${dayStr} — FINAL`],
    ];

    // Compute total panel height from content
    let contentH = TOP;
    entries.forEach(([mt, fs]) => { contentH += mt + (fs === 8 ? LH8 : LH7); });
    contentH += BOT;

    const panelH = contentH;
    const panelY = h - panelH - 58;   // 58 px above bottom leaves room for buttons

    // All panel objects start invisible — _buildPandoraScene() tweens them in
    const panelObjs = [];

    // Draw panel background + border
    const gfx = this.add.graphics().setDepth(50).setAlpha(0);
    gfx.fillStyle(0x000014, 0.94);
    gfx.fillRect(panelX, panelY, panelW, panelH);
    gfx.lineStyle(3, colorHex, 1);
    gfx.strokeRect(panelX, panelY, panelW, panelH);
    gfx.lineStyle(1, colorHex, 0.25);
    gfx.strokeRect(panelX + 3, panelY + 3, panelW - 6, panelH - 6);
    panelObjs.push(gfx);

    // Render lines with individual vertical offsets
    let curY = panelY + TOP;
    entries.forEach(([mt, fs, text]) => {
      curY += mt;
      const t = this.add.text(panelX + panelW / 2, curY, text, {
        fontFamily: "'Press Start 2P'",
        fontSize:   `${fs}px`,
        color,
        align:      'center'
      }).setOrigin(0.5, 0).setDepth(51).setAlpha(0);
      panelObjs.push(t);
      curY += (fs === 8 ? LH8 : LH7);
    });

    this._pandoraPanelObjects = panelObjs;
    this._panelBottom = panelY + panelH;
  }

  // ── Shared panel ─────────────────────────────────────────────────────────

  _buildPanel(type) {
    const { _w: w, _h: h } = this;

    const isPandora   = type === 'pandora';
    const borderHex   = isPandora ? 0xCC00FF : 0xFF2200;
    const borderColor = isPandora ? '#CC00FF' : '#FF2200';

    const panelW = Math.min(420, w - 40);
    const panelX = w / 2 - panelW / 2;
    const dayStr = String(this._day).padStart(3, '0');

    const lines = isPandora ? [
      'PROMETHEUS INC.',
      'INTERNAL NOTICE',
      '',
      'Your position has been automated.',
      '',
      'Pandora has assumed your',
      'responsibilities effective',
      'immediately.',
      '',
      'Thank you for your contribution',
      'to our infrastructure.',
      '',
      `DAY ${dayStr} — FINAL`,
    ] : [
      'PROMETHEUS INC.',
      'HR NOTIFICATION',
      '',
      'Your employment has been',
      'terminated due to sustained',
      'underperformance.',
      '',
      'We wish you well in your',
      'future endeavors.',
      '',
      `DAY ${dayStr} — FINAL`,
    ];

    // Calculate panel size to always fit on screen
    // Panel occupies lower ~45% of screen; leave 60px for buttons below
    const maxPanelH = h * 0.45 - 60;
    const lineH = Math.min(16, Math.floor((maxPanelH - 32) / lines.length));
    const panelH = lines.length * lineH + 32;
    // Anchor panel so buttons always stay on screen
    const panelY = h - panelH - 60;

    const gfx = this.add.graphics().setDepth(50);
    gfx.fillStyle(0x000014, 0.94);
    gfx.fillRect(panelX, panelY, panelW, panelH);
    gfx.lineStyle(3, borderHex, 1);
    gfx.strokeRect(panelX, panelY, panelW, panelH);
    gfx.lineStyle(1, borderHex, 0.25);
    gfx.strokeRect(panelX + 3, panelY + 3, panelW - 6, panelH - 6);

    lines.forEach((line, i) => {
      if (line === '') return;
      this.add.text(panelX + panelW / 2, panelY + 14 + i * lineH, line, {
        fontFamily: "'Press Start 2P'",
        fontSize: '8px',
        color: borderColor,
        align: 'center'
      }).setOrigin(0.5, 0).setDepth(51);
    });

    this._panelBottom = panelY + panelH;
  }

  // ── Buttons: RESTART + MAIN MENU ─────────────────────────────────────────

  _buildRestartButton() {
    const { _w: w, _h: h } = this;
    // Anchor buttons to bottom of screen, always visible
    const btnY = h - 26;
    const gap  = 180;

    // [ RESTART ] — left of center, blinks, ENTER key triggers this
    const restartBtn = this.add.text(w / 2 - gap / 2, btnY, '[ RESTART ]', {
      fontFamily: "'Press Start 2P'",
      fontSize: '10px',
      color: '#00FFFF'
    }).setOrigin(0.5).setDepth(52).setInteractive({ useHandCursor: true });

    this.tweens.add({
      targets: restartBtn,
      alpha: 0,
      duration: 500,
      ease: 'Linear',
      yoyo: true,
      repeat: -1
    });

    restartBtn.on('pointerover',  () => restartBtn.setColor('#FFD700'));
    restartBtn.on('pointerout',   () => restartBtn.setColor('#00FFFF'));
    restartBtn.on('pointerdown',  () => this._restart());

    // [ MAIN MENU ] — right of center, dim, M key triggers this
    const menuBtn = this.add.text(w / 2 + gap / 2, btnY, '[ MAIN MENU ]', {
      fontFamily: "'Press Start 2P'",
      fontSize: '10px',
      color: '#007788'
    }).setOrigin(0.5).setDepth(52).setInteractive({ useHandCursor: true });

    menuBtn.on('pointerover',  () => menuBtn.setColor('#00FFFF'));
    menuBtn.on('pointerout',   () => menuBtn.setColor('#007788'));
    menuBtn.on('pointerdown',  () => this._mainMenu());

    // Key hint labels below buttons
    this.add.text(w / 2 - gap / 2, btnY + 16, 'ENTER', {
      fontFamily: "'Press Start 2P'", fontSize: '6px', color: '#007788'
    }).setOrigin(0.5, 0).setDepth(52);

    this.add.text(w / 2 + gap / 2, btnY + 16, 'M', {
      fontFamily: "'Press Start 2P'", fontSize: '6px', color: '#007788'
    }).setOrigin(0.5, 0).setDepth(52);
  }

  _doFlashTransition(targetScene, data = {}) {
    if (this._transitioning) return;
    this._transitioning = true;

    if (this._audio) {
      this._audio.stopAll();
      this._audio.setVolume(1.0);
    }

    const flash = document.getElementById('flash-overlay');
    flash.style.transition = 'opacity 0.2s ease-in';
    flash.style.opacity = '1';

    setTimeout(() => {
      if (Object.keys(data).length > 0) {
        this.scene.start(targetScene, data);
      } else {
        this.scene.start(targetScene);
      }
      setTimeout(() => {
        flash.style.transition = 'opacity 0.4s ease-out';
        flash.style.opacity = '0';
      }, 200);
    }, 300);
  }

  _restart() {
    // Reset state and jump straight into the game — no title screen
    this.registry.set('gameState', {
      currentDay:        0,
      efficiency:        50,
      currentWorld:      1,
      totalDaysEmployed: 0,
      pandoraStatus:     'OBSERVING'
    });
    this._doFlashTransition('World1Scene');
  }

  _mainMenu() {
    // Full reset → title screen
    this.registry.set('gameState', null);
    this._doFlashTransition('IntroScene');
  }

  update(time) {
    if (this._type === 'fired') {
      this._drawSea(time);
    }
  }
}
