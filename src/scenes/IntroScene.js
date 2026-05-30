/**
 * IntroScene.js
 * Icarus hovers. Title glows. Then he flies into the sun.
 */
import { ChiptuneEngine } from '../audio/ChiptuneEngine.js';

export class IntroScene extends Phaser.Scene {
  constructor() {
    super({ key: 'IntroScene' });
    this.transitioning = false;
  }

  // Called every time the scene starts (before create) — guarantees a clean slate
  init() {
    this.transitioning = false;
  }

  create() {
    const { width, height } = this.scale;

    // ── ChiptuneEngine (shared via registry) ──────────────────────────────
    if (!this.registry.get('audio')) {
      const audio = new ChiptuneEngine();
      this.registry.set('audio', audio);
    }
    this.audio = this.registry.get('audio');

    // ── Background ────────────────────────────────────────────────────────
    this._buildBackground();

    // ── Icarus hover sprite — centered, slightly above mid ────────────────
    this.icarusSprite = this.add.sprite(width / 2, height * 0.38, 'icarus_hover');
    this.icarusSprite.setScale(1.2);
    this.icarusSprite.play('hover');

    // Gentle float tween
    this.tweens.add({
      targets: this.icarusSprite,
      y: this.icarusSprite.y - 12,
      duration: 2000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });

    // ── Title sprite (lower third, centered horizontally) ────────────────
    // Scale to fit width with some padding; anchor at center
    this.titleImage = this.add.image(width / 2, height * 0.72, 'icarus_title')
      .setOrigin(0.5)
      .setScale(Math.min(1, (width * 0.7) / this.textures.get('icarus_title').getSourceImage().width));

    // ── Press Enter blinking text ─────────────────────────────────────────
    this.pressEnterText = this.add.text(width / 2, height * 0.78, 'PRESS ENTER TO BEGIN', {
      fontFamily: "'Press Start 2P'",
      fontSize: '10px',
      color: '#00FFFF'
    }).setOrigin(0.5);

    // Blink 500ms on / 500ms off
    this.tweens.add({
      targets: this.pressEnterText,
      alpha: 0,
      duration: 500,
      ease: 'Linear',
      yoyo: true,
      repeat: -1
    });

    // ── Music ─────────────────────────────────────────────────────────────
    // Resume context on first user gesture — handled by input below
    this.audio.stopAll();
    this.audio.setVolume(1.0);

    // ── Input — delayed 300ms to skip any stray pointerdown carried over
    //   from the previous scene's click (e.g. "MAIN MENU" button) ──────────
    this.time.delayedCall(300, () => {
      if (this.transitioning) return; // already triggered somehow
      this.input.keyboard.on('keydown-ENTER', () => this._startFlyForward());
      this.input.keyboard.on('keydown-SPACE', () => this._startFlyForward());
      this.input.on('pointerdown', () => this._startFlyForward());
    });

    // Start music on first interaction (or try immediately)
    this._tryStartMusic();
  }

  _tryStartMusic() {
    try {
      this.audio.resume();
      this.audio.playIntroMelody();
    } catch (e) {
      // AudioContext blocked — will start on first user gesture
    }
  }

  _buildBackground() {
    const { width, height } = this.scale;
    const gfx = this.add.graphics();

    // Solid base
    gfx.fillStyle(0x050510, 1);
    gfx.fillRect(0, 0, width, height);

    // Radial vignette — lighter center, dark edges
    // We approximate with concentric circles getting more transparent
    for (let r = Math.max(width, height) * 0.8; r > 0; r -= 30) {
      const alpha = 0.025 * (r / (Math.max(width, height) * 0.8));
      gfx.fillStyle(0x0D0D2B, alpha);
      gfx.fillCircle(width / 2, height / 2, r);
    }

    // Stars
    const stars = this.registry.get('stars') || [];
    const starGfx = this.add.graphics();
    stars.forEach(s => {
      starGfx.fillStyle(0xFFFFFF, s.alpha);
      starGfx.fillRect(s.x, s.y, s.size, s.size);
    });

    // Scanlines
    const scanGfx = this.add.graphics();
    scanGfx.fillStyle(0x000000, 0.08);
    for (let y = 0; y < height; y += 3) {
      scanGfx.fillRect(0, y, width, 1);
    }
  }

  _startFlyForward() {
    if (this.transitioning) return;
    this.transitioning = true;

    try {
      // Resume audio context on gesture
      this.audio.resume();
      if (!this.audio.loopRunning) {
        this.audio.playIntroMelody();
      }

      // 1. Switch animation
      this.icarusSprite.stop();
      this.icarusSprite.play('forward');

      // Kill float tween
      this.tweens.killTweensOf(this.icarusSprite);

      // 2. Scale up + move forward (toward camera) over 600ms
      this.tweens.add({
        targets: this.icarusSprite,
        scaleX: 4.0,
        scaleY: 4.0,
        y: this.icarusSprite.y - 40,
        duration: 600,
        ease: 'Quad.easeIn'
      });

      // 3. Fade out music
      this.audio.fadeOut(600);

      // 4. White flash at 400ms — raw setTimeout fine (DOM only)
      setTimeout(() => {
        const flashOverlay = document.getElementById('flash-overlay');
        if (flashOverlay) {
          flashOverlay.style.transition = 'opacity 0.2s ease-in';
          flashOverlay.style.opacity = '1';
        }
      }, 400);

      // 5. Transition at 750ms — use Phaser delayedCall so it runs inside the
      //    game loop and can't fire on a stale scene reference
      this.time.delayedCall(750, () => {
        this.scene.start('InstructionsScene');
        // Fade flash back out after scene has swapped
        setTimeout(() => {
          const flashOverlay = document.getElementById('flash-overlay');
          if (flashOverlay) {
            flashOverlay.style.transition = 'opacity 0.4s ease-out';
            flashOverlay.style.opacity = '0';
          }
        }, 300);
      });

    } catch (err) {
      // If anything went wrong, unlock input so the player can try again
      console.warn('[IntroScene] _startFlyForward error:', err);
      this.transitioning = false;
    }
  }

  shutdown() {
    this.transitioning = false;
  }
}
