/**
 * WorldSelectScene.js
 * Inserted between InstructionsScene and the world scenes.
 * Player picks their assignment: Fulfillment Center (World 1) or Engineering (World 2).
 *
 * Navigation:
 *   LEFT / RIGHT arrows  — move highlight between cards
 *   Hover / click        — pointer selects; click on selected card confirms
 *   ENTER                — confirm current selection
 *   ESC                  — back to InstructionsScene
 */
export class WorldSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WorldSelectScene' });
  }

  // Phaser calls init() before every create() — guarantees a clean slate
  init() {
    this._selected      = 0;     // 0 = World 1, 1 = World 2
    this._transitioning = false;
    this._inputReady    = false;
    this._onKeyDown     = null;
  }

  create() {
    const { width: w, height: h } = this.scale;
    this._w = w;
    this._h = h;

    this._audio = this.registry.get('audio');

    this._buildBackground();
    this._buildHeader();
    this._buildCards();
    this._buildHint();

    // ── Input — 300 ms delay absorbs stray click from InstructionsScene ──────
    this.time.delayedCall(300, () => {
      this._inputReady = true;

      this._onKeyDown = (e) => {
        if (!this._inputReady || this._transitioning) return;
        switch (e.keyCode) {
          case 37: this._setSelected(0); break;   // LEFT  → Card 1
          case 39: this._setSelected(1); break;   // RIGHT → Card 2
          case 13: this._confirm();      break;   // ENTER → launch
          case 27: this._goBack();       break;   // ESC   → instructions
        }
      };
      window.addEventListener('keydown', this._onKeyDown);
    });
  }

  // ── Background (same dark starfield + vignette as IntroScene) ──────────────

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

  // ── Header ────────────────────────────────────────────────────────────────

  _buildHeader() {
    const { _w: w } = this;

    this.add.text(w / 2, 18, 'SELECT ASSIGNMENT', {
      fontFamily: "'Press Start 2P'",
      fontSize:   '12px',
      color:      '#00FFFF'
    }).setOrigin(0.5);
  }

  // ── Cards ─────────────────────────────────────────────────────────────────

  _buildCards() {
    const { _w: w, _h: h } = this;

    const cS  = Math.round(h * 0.65);   // square — same value for both axes
    const cW  = cS;
    const cH  = cS;
    const gap = 64;

    this._cW = cW;
    this._cH = cH;

    this._CARDS = [
      { title: 'HERMES LOGISTICS', sub: 'A PROMETHEUS INC. COMPANY', label: '[ WORLD 01 ]', target: 'World1Scene', world: 1 },
      { title: 'SPHINX SYSTEMS',   sub: 'A PROMETHEUS INC. COMPANY', label: '[ WORLD 02 ]', target: 'World2Scene', world: 2 },
    ];

    // Side-by-side if both cards fit with minimal margin; otherwise stack vertically.
    const sideBySide = (2 * cW + gap + 20) <= w;

    let positions;
    if (sideBySide) {
      const cx1 = Math.round(w / 2 - gap / 2 - cW);
      const cx2 = Math.round(w / 2 + gap / 2);
      // Vertically: leave header (~38px top) and hint (~18px bottom)
      const cy  = Math.round((h - cH) / 2 + 4);
      positions = [{ x: cx1, y: cy }, { x: cx2, y: cy }];
    } else {
      const cx     = Math.round(w / 2 - cW / 2);
      const totalH = cH * 2 + gap;
      const cy1    = Math.round((h - totalH) / 2);
      positions = [{ x: cx, y: cy1 }, { x: cx, y: cy1 + cH + gap }];
    }
    this._cardPositions = positions;

    const logoKeys = ['hermes_logo', 'sphinx_logo'];
    this._borderGfx = [];
    this._logos     = [];

    this._CARDS.forEach((card, i) => {
      const { x, y } = positions[i];

      // ── Image — full card size ────────────────────────────────────────────
      const logo = this.add.image(x + cW / 2, y + cH / 2, logoKeys[i])
        .setOrigin(0.5)
        .setDisplaySize(cS, cS)
        .setDepth(1);
      logo._baseScaleX = logo.scaleX;
      logo._baseScaleY = logo.scaleY;
      if (i !== 0) logo.setTint(0x555555);
      this._logos.push(logo);

      // ── Text scrim — bottom 35% ───────────────────────────────────────────
      const scrimH   = Math.round(cH * 0.35);   // 168 px
      const scrimTop = y + cH - scrimH;
      const scrim    = this.add.graphics().setDepth(2);
      scrim.fillStyle(0x000000, 0.75);
      scrim.fillRect(x, scrimTop, cW, scrimH);

      // ── Text ──────────────────────────────────────────────────────────────
      const tx = x + cW / 2;
      this.add.text(tx, scrimTop + 22, card.title, {
        fontFamily: "'Press Start 2P'",
        fontSize:   '9px',
        color:      '#FFFFFF'
      }).setOrigin(0.5, 0).setDepth(3);

      this.add.text(tx, scrimTop + 52, card.sub, {
        fontFamily: "'Press Start 2P'",
        fontSize:   '6px',
        color:      '#007788',
        wordWrap:   { width: cW - 24 }
      }).setOrigin(0.5, 0).setDepth(3);

      this.add.text(tx, scrimTop + 76, card.label, {
        fontFamily: "'Press Start 2P'",
        fontSize:   '9px',
        color:      '#FFD700'
      }).setOrigin(0.5, 0).setDepth(3);

      // ── Border ────────────────────────────────────────────────────────────
      this._borderGfx.push(this.add.graphics().setDepth(4));

      // ── Interactive zone ──────────────────────────────────────────────────
      const zone = this.add.zone(x, y, cW, cH).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });

      zone.on('pointerover', () => {
        if (this._selected !== i) this._setSelected(i);
      });
      zone.on('pointerdown', () => {
        if (!this._inputReady || this._transitioning) return;
        this._setSelected(i);
        this._confirm();
      });
    });

    this._drawCards();
  }

  /** Redraws both card borders to reflect _selected state. */
  _drawCards() {
    const cW = this._cW;
    const cH = this._cH;

    for (let i = 0; i < 2; i++) {
      const { x, y } = this._cardPositions[i];
      const sel = (i === this._selected);
      const br  = this._borderGfx[i];
      br.clear();
      if (sel) {
        br.lineStyle(3, 0x00FFFF, 1);
        br.strokeRect(x, y, cW, cH);
      } else {
        br.lineStyle(2, 0x333355, 0.8);
        br.strokeRect(x, y, cW, cH);
      }
    }
  }

  _setSelected(idx) {
    if (this._selected === idx) return;
    const prev = this._selected;
    this._selected = idx;
    this._drawCards();

    // Deactivate previous — grey tint, snap back to base scale
    if (this._logos[prev]) {
      this.tweens.killTweensOf(this._logos[prev]);
      const pl = this._logos[prev];
      pl.setTint(0x555555);
      pl.setScale(pl._baseScaleX, pl._baseScaleY);
    }

    // Activate new — full color + scale pop 0.95 → 1.0
    if (this._logos[idx]) {
      const logo = this._logos[idx];
      logo.clearTint();
      logo.setScale(logo._baseScaleX * 0.95, logo._baseScaleY * 0.95);
      this.tweens.add({
        targets:  logo,
        scaleX:   logo._baseScaleX,
        scaleY:   logo._baseScaleY,
        duration: 150,
        ease:     'Quad.easeOut'
      });
    }
  }

  // ── Bottom hint ────────────────────────────────────────────────────────────

  _buildHint() {
    const { _w: w, _h: h } = this;

    this.add.text(w / 2, h - 12, '← → NAVIGATE     ENTER CONFIRM     ESC BACK', {
      fontFamily: "'Press Start 2P'",
      fontSize:   '7px',
      color:      '#007788'
    }).setOrigin(0.5);
  }

  // ── Transitions ────────────────────────────────────────────────────────────

  _confirm() {
    if (!this._inputReady || this._transitioning) return;
    this._transitioning = true;

    const card = this._CARDS[this._selected];

    // Reset game state for a fresh run with the chosen world
    this.registry.set('gameState', {
      currentDay:        0,
      efficiency:        50,
      currentWorld:      card.world,
      totalDaysEmployed: 0,
      pandoraStatus:     'OBSERVING'
    });

    const flash = document.getElementById('flash-overlay');
    flash.style.transition = 'opacity 0.25s ease-in';
    flash.style.opacity    = '1';

    this.time.delayedCall(300, () => {
      this.scene.start(card.target);
      setTimeout(() => {
        flash.style.transition = 'opacity 0.4s ease-out';
        flash.style.opacity    = '0';
      }, 200);
    });
  }

  _goBack() {
    if (!this._inputReady || this._transitioning) return;
    this._transitioning = true;

    const flash = document.getElementById('flash-overlay');
    flash.style.transition = 'opacity 0.2s ease-in';
    flash.style.opacity    = '1';

    this.time.delayedCall(250, () => {
      this.scene.start('InstructionsScene');
      setTimeout(() => {
        flash.style.transition = 'opacity 0.3s ease-out';
        flash.style.opacity    = '0';
      }, 150);
    });
  }

  shutdown() {
    this._transitioning = false;
    this._inputReady    = false;
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
  }
}
