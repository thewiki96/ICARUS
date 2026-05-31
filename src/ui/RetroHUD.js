/**
 * RetroHUD.js
 * Argos bar + Kronos timer + Days Employed counter.
 * All drawn via Phaser Graphics — retro pixel-block style.
 */
export class RetroHUD {
  constructor(scene) {
    this.scene = scene;
    this._dayFlashTween = null;

    // Container depth — always on top
    this._depth = 100;

    this._build();
  }

  _build() {
    const { width, height } = this.scene.scale;

    // ── Days Employed — top left ──────────────────────────────────────────
    this._dayBg = this.scene.add.graphics().setDepth(this._depth);
    this._dayText = this.scene.add.text(14, 8, 'DAY 0001', {
      fontFamily: "'Press Start 2P'",
      fontSize: '12px',
      color: '#FFD700'
    }).setDepth(this._depth + 1);
    this._drawDayPanel();

    // ── Kronos Timer — top right ──────────────────────────────────────────
    this._kronosBg = this.scene.add.graphics().setDepth(this._depth);
    this._kronosText = this.scene.add.text(width - 14, 8, 'KRONOS 00', {
      fontFamily: "'Press Start 2P'",
      fontSize: '11px',
      color: '#FFD700'
    }).setOrigin(1, 0).setDepth(this._depth + 1);
    this._drawKronosPanel();

    // ── Argos Bar — bottom of screen ─────────────────────────────────────
    this._argosBg   = this.scene.add.graphics().setDepth(this._depth);
    this._argosFill = this.scene.add.graphics().setDepth(this._depth + 1);
    this._argosLabel = this.scene.add.text(14, height - 40, 'ARGOS', {
      fontFamily: "'Press Start 2P'",
      fontSize: '8px',
      color: '#00FFFF'
    }).setDepth(this._depth + 2);
    this._argosPercent = this.scene.add.text(width - 14, height - 40, '50%', {
      fontFamily: "'Press Start 2P'",
      fontSize: '8px',
      color: '#00FFFF'
    }).setOrigin(1, 0).setDepth(this._depth + 2);
    this._drawArgosPanel(50);

    // ── SOMA Bar — above ARGOS, hidden until somaSystem activates ────────
    const somaBarY = height - 70;
    this._somaBg    = this.scene.add.graphics().setDepth(this._depth).setVisible(false);
    this._somaFill  = this.scene.add.graphics().setDepth(this._depth + 1).setVisible(false);
    this._somaLabel = this.scene.add.text(14 + 8, somaBarY + 2, 'SOMA', {
      fontFamily: "'Press Start 2P'",
      fontSize:   '8px',
      color:      '#00FFFF'
    }).setDepth(this._depth + 2).setVisible(false);
    this._somaVisible = false;
    this._somaPulse   = null;

    // ── Pulse tween for danger state ──────────────────────────────────────
    this._dangerPulse = null;
  }

  // ── Day counter ────────────────────────────────────────────────────────────

  _drawDayPanel() {
    const g = this._dayBg;
    g.clear();
    g.fillStyle(0x000014, 0.88);
    g.fillRect(6, 4, 130, 28);
    g.lineStyle(2, 0x00FFFF, 1);
    g.strokeRect(6, 4, 130, 28);
    // Inner glow
    g.lineStyle(1, 0x007788, 0.4);
    g.strokeRect(8, 6, 126, 24);
  }

  updateDay(day) {
    const padded = String(day).padStart(4, '0');
    this._dayText.setText(`DAY ${padded}`);

    // Scale flash animation
    this.scene.tweens.add({
      targets: this._dayText,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 100,
      ease: 'Quad.easeOut',
      yoyo: true
    });
  }

  // ── Kronos timer ───────────────────────────────────────────────────────────

  _drawKronosPanel() {
    const { width } = this.scene.scale;
    const g = this._kronosBg;
    g.clear();
    g.fillStyle(0x000014, 0.88);
    g.fillRect(width - 136, 4, 130, 28);
    g.lineStyle(2, 0x00FFFF, 1);
    g.strokeRect(width - 136, 4, 130, 28);
    g.lineStyle(1, 0x007788, 0.4);
    g.strokeRect(width - 134, 6, 126, 24);
  }

  updateKronos(seconds, warn = false) {
    const padded = String(Math.max(0, seconds)).padStart(2, '0');
    this._kronosText.setText(`KRONOS ${padded}`);
    this._kronosText.setColor(warn ? '#FF2200' : '#FFD700');

    // Flash border red on warning
    if (warn) {
      const { width } = this.scene.scale;
      this._kronosBg.clear();
      this._kronosBg.fillStyle(0x1A0000, 0.88);
      this._kronosBg.fillRect(width - 136, 4, 130, 28);
      this._kronosBg.lineStyle(2, 0xFF2200, 1);
      this._kronosBg.strokeRect(width - 136, 4, 130, 28);
    } else {
      this._drawKronosPanel();
    }
  }

  hideKronos() {
    this._kronosText.setText('');
    this._drawKronosPanel();
  }

  // ── Argos bar ──────────────────────────────────────────────────────────────

  _drawArgosPanel(efficiency) {
    const { width, height } = this.scene.scale;
    const barX = 8;
    const barY = height - 48;
    const barW = width - 16;
    const barH = 36;

    // Panel background
    const bg = this._argosBg;
    bg.clear();
    bg.fillStyle(0x000014, 0.88);
    bg.fillRect(barX, barY, barW, barH);
    bg.lineStyle(2, 0x00FFFF, 1);
    bg.strokeRect(barX, barY, barW, barH);

    // Inner fill
    const fill = this._argosFill;
    fill.clear();

    // Chunk-style fill — 8px blocks with 2px gaps
    const innerX = barX + 4;
    const innerY = barY + 12;
    const innerW = barW - 8;
    const innerH = 18;
    const filledW = Math.round((efficiency / 100) * innerW);

    const chunkW = 8;
    const chunkGap = 2;
    const stride = chunkW + chunkGap;

    // Determine color based on zone
    let fillColor;
    const zone = this._getZone(efficiency);
    if (zone === 'danger')    fillColor = 0xFF2200;
    else if (zone === 'warn') fillColor = 0xFFD700;
    else                      fillColor = 0x00FF66;

    let drawn = 0;
    while (drawn + chunkW <= filledW) {
      fill.fillStyle(fillColor, 1);
      fill.fillRect(innerX + drawn, innerY, chunkW, innerH);
      drawn += stride;
    }
    // Partial last chunk
    const remainder = filledW - drawn;
    if (remainder > 0) {
      fill.fillStyle(fillColor, 0.7);
      fill.fillRect(innerX + drawn, innerY, remainder, innerH);
    }

    // Update label text positions
    this._argosLabel.setPosition(barX + 8, barY + 3);
    this._argosPercent.setPosition(barX + barW - 4, barY + 3);
    this._argosPercent.setText(`${Math.round(efficiency)}%`);

    // Danger pulse
    if (zone === 'danger') {
      this._startDangerPulse();
    } else {
      this._stopDangerPulse();
    }
  }

  _getZone(eff) {
    // Approximate — HUD doesn't know exact thresholds, just uses visual heuristics
    // Real check is in Hermes.js; this drives color only
    if (eff <= 30 || eff >= 70) return 'danger';
    if (eff <= 38 || eff >= 64) return 'warn';
    return 'safe';
  }

  _startDangerPulse() {
    if (this._dangerPulse) return;
    this._dangerPulse = this.scene.tweens.add({
      targets: this._argosFill,
      alpha: 0.4,
      duration: 300,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });
  }

  _stopDangerPulse() {
    if (this._dangerPulse) {
      this._dangerPulse.stop();
      this._dangerPulse = null;
      this._argosFill.setAlpha(1);
    }
  }

  updateArgos(efficiency) {
    this._drawArgosPanel(efficiency);
  }

  // ── SOMA bar ───────────────────────────────────────────────────────────────

  setSoma(value) {
    if (!this._somaVisible) {
      this._somaBg.setVisible(true);
      this._somaFill.setVisible(true);
      this._somaLabel.setVisible(true);
      this._somaVisible = true;
    }
    this._drawSomaPanel(value);
  }

  _drawSomaPanel(value) {
    const { width, height } = this.scene.scale;
    const barX = 8;
    const barY = height - 70;
    const barW = width - 16;
    const barH = 18;

    const bg = this._somaBg;
    bg.clear();
    bg.fillStyle(0x000014, 0.88);
    bg.fillRect(barX, barY, barW, barH);
    bg.lineStyle(2, 0xFF6600, 1);
    bg.strokeRect(barX, barY, barW, barH);

    const fill = this._somaFill;
    fill.clear();

    const innerX   = barX + 4;
    const innerY   = barY + 4;
    const innerW   = barW - 8;
    const innerH   = 10;
    const filledW  = Math.round((Math.min(100, Math.max(0, value)) / 100) * innerW);
    const chunkW   = 8;
    const stride   = chunkW + 2;
    const fillColor = value >= 70 ? 0xFF2200 : 0xFF6600;

    let drawn = 0;
    while (drawn + chunkW <= filledW) {
      fill.fillStyle(fillColor, 1);
      fill.fillRect(innerX + drawn, innerY, chunkW, innerH);
      drawn += stride;
    }
    const remainder = filledW - drawn;
    if (remainder > 0) {
      fill.fillStyle(fillColor, 0.7);
      fill.fillRect(innerX + drawn, innerY, remainder, innerH);
    }

    // Pulse in red zone (70–99%)
    if (value >= 70 && value < 100) {
      this._startSomaPulse();
    } else {
      this._stopSomaPulse();
    }
  }

  _startSomaPulse() {
    if (this._somaPulse) return;
    this._somaPulse = this.scene.tweens.add({
      targets:  this._somaFill,
      alpha:    0.4,
      duration: 400,
      ease:     'Sine.easeInOut',
      yoyo:     true,
      repeat:   -1
    });
  }

  _stopSomaPulse() {
    if (this._somaPulse) {
      this._somaPulse.stop();
      this._somaPulse = null;
      this._somaFill.setAlpha(1);
    }
  }

  destroy() {
    this._stopDangerPulse();
    this._stopSomaPulse();
    this._dayBg.destroy();
    this._dayText.destroy();
    this._kronosBg.destroy();
    this._kronosText.destroy();
    this._argosBg.destroy();
    this._argosFill.destroy();
    this._argosLabel.destroy();
    this._argosPercent.destroy();
    this._somaBg.destroy();
    this._somaFill.destroy();
    this._somaLabel.destroy();
  }
}
