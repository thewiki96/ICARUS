/**
 * BootScene.js
 * Loads all assets, generates shared star field, then transitions to IntroScene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // ── Loading bar ───────────────────────────────────────────────────────
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    const barBg = this.add.graphics();
    barBg.fillStyle(0x007788, 1);
    barBg.fillRect(cx - 150, cy - 8, 300, 16);

    const barFill = this.add.graphics();
    const label = this.add.text(cx, cy + 30, 'LOADING...', {
      fontFamily: "'Press Start 2P'",
      fontSize: '10px',
      color: '#00FFFF'
    }).setOrigin(0.5);

    this.load.on('progress', (value) => {
      barFill.clear();
      barFill.fillStyle(0x00FFFF, 1);
      barFill.fillRect(cx - 150, cy - 8, 300 * value, 16);
    });

    // ── Sprite sheets — EXACT frameWidth from spec ─────────────────────────
    // icarus_hover: 2064×512, 4 frames, frameWidth=516
    this.load.spritesheet('icarus_hover', 'sprites/Gemini_Generated_Image_r281tlr281tlr281.png', {
      frameWidth: 516,
      frameHeight: 512
    });

    // icarus_forward: 2544×416, 6 frames, frameWidth=424
    this.load.spritesheet('icarus_forward', 'sprites/Gemini_Generated_Image_7c3oh07c3oh07c3o.png', {
      frameWidth: 424,
      frameHeight: 416
    });

    // icarus_melting: 2544×416, 6 frames, frameWidth=424
    this.load.spritesheet('icarus_melting', 'sprites/Gemini_Generated_Image_ek16zsek16zsek16.png', {
      frameWidth: 424,
      frameHeight: 416
    });

    // sun: 2544×416, 6 frames, frameWidth=424
    this.load.spritesheet('sun', 'sprites/Gemini_Generated_Image_hs0p7ths0p7ths0p.png', {
      frameWidth: 424,
      frameHeight: 416
    });

    // icarus_falling: 2544×416, 6 frames, frameWidth=424
    this.load.spritesheet('icarus_falling', 'sprites/Gemini_Generated_Image_mohjefmohjefmohj.png', {
      frameWidth: 424,
      frameHeight: 416
    });

    // Static backgrounds
    this.load.image('warehouse_bg', 'sprites/Gemini_Generated_Image_ps8c27ps8c27ps8c.png');
    this.load.image('office_bg',    'sprites/Gemini_Generated_Image_fkpicffkpicffkpi.png');

    // Title card
    this.load.image('icarus_title', 'sprites/icarus-title.png');

    // World select logos
    this.load.image('hermes_logo', 'sprites/hermes.png');
    this.load.image('sphinx_logo', 'sprites/esfinge.png');
  }

  create() {
    // ── Register animations (shared, defined once) ────────────────────────
    this.anims.create({
      key: 'hover',
      frames: this.anims.generateFrameNumbers('icarus_hover', { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1
    });

    this.anims.create({
      key: 'forward',
      frames: this.anims.generateFrameNumbers('icarus_forward', { start: 0, end: 5 }),
      frameRate: 12,
      repeat: -1
    });

    this.anims.create({
      key: 'melting',
      frames: this.anims.generateFrameNumbers('icarus_melting', { start: 0, end: 5 }),
      frameRate: 4,
      repeat: 0
    });

    this.anims.create({
      key: 'sun_pulse',
      frames: this.anims.generateFrameNumbers('sun', { start: 0, end: 5 }),
      frameRate: 8,
      repeat: -1
    });

    this.anims.create({
      key: 'falling',
      frames: this.anims.generateFrameNumbers('icarus_falling', { start: 0, end: 5 }),
      frameRate: 8,
      repeat: -1
    });

    // ── Generate star field data (reused across scenes) ───────────────────
    const { width, height } = this.scale;
    const stars = [];
    for (let i = 0; i < 80; i++) {
      stars.push({
        x: Phaser.Math.Between(0, width),
        y: Phaser.Math.Between(0, height),
        size: Math.random() < 0.3 ? 2 : 1,
        alpha: Phaser.Math.FloatBetween(0.4, 1.0)
      });
    }
    this.registry.set('stars', stars);

    this.scene.start('IntroScene');
  }
}
