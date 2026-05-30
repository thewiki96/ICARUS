/**
 * World1Scene.js
 * Prometheus Inc. Fulfillment Center.
 * Conveyor belt. Packages. Sweet-spot loop.
 */
import { Hermes } from '../systems/Hermes.js';
import { Kronos } from '../systems/Kronos.js';
import { Pandora } from '../systems/Pandora.js';
import { LevelManager } from '../systems/LevelManager.js';
import { RetroHUD } from '../ui/RetroHUD.js';
import { RetroNotification } from '../ui/RetroNotification.js';

// Package types
// Package type → integer color (used for box edge tint, slot borders, category text)
const TYPE_COLORS = {
  STANDARD: 0x00FFFF, PRIORITY: 0xFFD700, FRAGILE: 0xFF2200,
  DAMAGED:  0xAA4400, URGENT:   0xFF00FF
};

// Box shape → isometric dimensions { W:front-width, H:front-height, D:side-depth, T:top-height }
// BW = W+D (bounding width), BH = T+H (bounding height)
const SHAPE_DIMS = {
  square: { W: 54, H: 34, D: 10, T: 14 },  // BW 64 × BH 48
  wide:   { W: 86, H: 28, D: 10, T: 12 },  // BW 96 × BH 40
  tall:   { W: 38, H: 50, D: 10, T: 22 },  // BW 48 × BH 72
  small:  { W: 30, H: 20, D: 10, T: 12 },  // BW 40 × BH 32
};

// Slot visual dimensions — matched to each box shape (square / wide / tall only)
const SLOT_DIMS = {
  square: { w: 90,  h: 70 },
  wide:   { w: 120, h: 45 },
  tall:   { w: 60,  h: 85 },
};

// Conveyor speed (px/sec) and max simultaneous packages by day bracket
const CONVEYOR_BRACKETS = [
  { minDay:  0, speed:  40, maxBoxes: 1 },
  { minDay:  5, speed:  55, maxBoxes: 1 },
  { minDay: 10, speed:  70, maxBoxes: 2 },
  { minDay: 15, speed:  90, maxBoxes: 2 },
  { minDay: 20, speed: 115, maxBoxes: 3 },
  { minDay: 25, speed: 145, maxBoxes: 3 },
];

// currentDay values at which the level advances (L1→L2, L2→L3, L3→L4)
// TEMP: all levels 2 days each for testing.
const LEVEL_ADVANCE_DAYS = [2, 4, 6];

// Notification schedule (day → [type, message])
const NOTIF_SCHEDULE = {
  3:  ['INFO',    'Welcome to Prometheus Inc. Your performance is monitored continuously.'],
  7:  ['INFO',    'Prometheus Inc. values efficiency. Exceed your targets.'],
  10: ['SYSTEM',  'Pandora module initialized. Performance data collection active.'],
  15: ['WARNING', 'Your metrics are approaching review threshold.'],
  20: ['INFO',    'Our AI infrastructure continues to improve.'],
  25: ['HR',      'All roles are subject to quarterly efficiency review.'],
};

export class World1Scene extends Phaser.Scene {
  constructor() {
    super({ key: 'World1Scene' });
    this._paused = false;
    this._selectedPackage = null;
    this._packages = [];
    this._slots = [];
    this._discardSlot = null;
    this._pandoraActive       = false;
    this._pandoraTimer        = null;
    this._pandoraArmGfx       = null;
    // Race mechanic (Level 4)
    this._pandoraTargetPkg    = null;
    this._pandoraReticleGfx   = null;
    this._pandoraReticleTween = null;
    this._pandoraRaceTimer    = null;
    this._dayTimer = null;
    this._daySeconds = 0;
    this._auditScheduled = false;
    this._firedNotifs = new Set();
    this._menuKeyHandler = null;
    this._levelAdvanced = false;
    this._lastPlayerDeliveryType = null;
    this._kronosOldestPkg   = null;
    this._kronosTickPlaying = false;
  }

  // Called by Phaser before every create() — guarantees a clean slate on restart
  init() {
    this._paused = false;
    this._selectedPackage = null;
    this._packages = [];
    this._slots = [];
    this._discardSlot = null;
    this._pandoraActive       = false;
    this._pandoraTimer        = null;
    this._pandoraArmGfx       = null;
    // Race mechanic (Level 4)
    this._pandoraTargetPkg    = null;
    this._pandoraReticleGfx   = null;
    this._pandoraReticleTween = null;
    this._pandoraRaceTimer    = null;
    this._dayTimer = null;
    this._daySeconds = 0;
    this._auditScheduled = false;
    if (this._firedNotifs) {
      this._firedNotifs.clear();
    } else {
      this._firedNotifs = new Set();
    }
    // DOM listener is cleaned up in shutdown; reset ref so create() can re-add it
    this._menuKeyHandler = null;
    this._levelAdvanced = false;
    this._lastPlayerDeliveryType = null;
    this._kronosOldestPkg   = null;
    this._kronosTickPlaying = false;
  }

  create() {
    const { width, height } = this.scale;
    this._w = width;
    this._h = height;

    // ── Game state ────────────────────────────────────────────────────────
    const gs = this.registry.get('gameState') || {
      currentDay: 0,
      efficiency: 50,
      currentWorld: 1,
      totalDaysEmployed: 0,
      pandoraStatus: 'OBSERVING'
    };
    this.registry.set('gameState', gs);
    this._gameState = gs;

    // ── Level system ──────────────────────────────────────────────────────
    this.levelManager = new LevelManager();
    this.currentLevelData = this.levelManager.getCurrentLevel();

    // ── Audio ─────────────────────────────────────────────────────────────
    this._audio = this.registry.get('audio');
    if (this._audio) {
      this._audio.stopAll();
      this._audio.setVolume(1.0);
      this._audio.resume();
      this._audio.playWorld1Melody();
    }

    // ── Background ────────────────────────────────────────────────────────
    this._buildBackground();

    // ── Conveyor belt (TileSprite) ────────────────────────────────────────
    this._buildConveyor();

    // ── Package slots ─────────────────────────────────────────────────────
    this._buildSlots();

    // ── HUD systems ───────────────────────────────────────────────────────
    this._hermes = new Hermes(this, this._gameState);
    this._kronos = new Kronos(this);
    this._hud    = new RetroHUD(this);
    this._pandora = new Pandora(this, 'LOGISTICS');
    this._notif   = new RetroNotification();

    this._hud.updateDay(this._gameState.currentDay + 1);
    this._hud.updateArgos(this._gameState.efficiency);
    this._hud.hideKronos();

    // ── Wire up Hermes callbacks ──────────────────────────────────────────
    this._hermes.onEfficiencyChange = (eff) => {
      this._hud.updateArgos(eff);
    };
    this._hermes.onFired = () => {
      this.scene.start('GameOverScene', { type: 'fired', day: this._gameState.totalDaysEmployed });
    };
    this._hermes.onPandora = () => {
      this.scene.start('GameOverScene', { type: 'pandora', day: this._gameState.totalDaysEmployed });
    };
    this._hermes.start();

    // ── Wire up Kronos callbacks ──────────────────────────────────────────
    this._kronos.onTick = (remaining) => {
      this._hud.updateKronos(remaining, remaining <= 5);
      if (remaining <= 5) {
        this._kronosTickPlaying = true;
        if (this._audio) this._audio.playSFX('kronos_tick');
      }
    };
    this._kronos.onWarning = () => {
      if (this._audio) this._audio.playSFX('danger');
    };
    this._kronos.onExpire = () => {
      this._stopKronosTick();
      this._hud.hideKronos();
      this._hermes._adjust(-15);

      // Remove only the oldest (tracked) box
      const oldest = this._kronosOldestPkg;
      this._kronosOldestPkg = null;
      if (oldest?.active) {
        this._packages = this._packages.filter(p => p !== oldest);
        this.tweens.killTweensOf(oldest);
        if (oldest.shadowGfx) oldest.shadowGfx.destroy();
        oldest.destroy();
      }

      // Refill then start Kronos for next oldest if any remain
      this.time.delayedCall(300, () => {
        this._fillConveyor();
        this._startKronosForOldest();
      });
    };

    // ── Day timer — 1 in-game day = 45 real seconds ───────────────────────
    this._dayTimer = this.time.addEvent({
      delay: 1000,
      callback: this._onSecondTick,
      callbackScope: this,
      loop: true
    });

    // ── Schedule first batch of packages ─────────────────────────────────
    this.time.delayedCall(500, this._fillConveyor, [], this);

    // ── Random audit timer ────────────────────────────────────────────────
    this._scheduleNextAudit();

    // (drag events are wired on each box in _wireDragEvents — no scene-level listener needed)

    // ── Menu button ───────────────────────────────────────────────────────
    this._addMenuButton();

    // ── Pandora update ────────────────────────────────────────────────────
    this._pandora.updateForDay(this._gameState.currentDay);

    // ── Level 1 startup notification ──────────────────────────────────────
    if (this.levelManager.currentLevel === 1) {
      this.time.delayedCall(1200, () => {
        this._notif.show('SYSTEM', 'INTAKE PROCESSING protocols active. Match package type to delivery zone.');
        if (this._audio) this._audio.playSFX('notify');
      });
    }
  }

  // ── Background construction ───────────────────────────────────────────────

  _buildBackground() {
    const { _w: w, _h: h } = this;
    const gfx = this.add.graphics();

    // Dark base
    gfx.fillStyle(0x050510, 1);
    gfx.fillRect(0, 0, w, h);

    // Warehouse background image — fill width, anchor to bottom
    const warehouseBg = this.add.image(w / 2, h, 'warehouse_bg');
    warehouseBg.setOrigin(0.5, 1);
    const scaleX = w / warehouseBg.width;
    const scaleY = h / warehouseBg.height;
    warehouseBg.setScale(Math.max(scaleX, scaleY));
    warehouseBg.setAlpha(0.7);
    this._warehouseBg = warehouseBg;

    // Dark overlay for depth
    const overlay = this.add.graphics();
    overlay.fillStyle(0x050510, 0.45);
    overlay.fillRect(0, 0, w, h);

    // Stars
    const stars = this.registry.get('stars') || [];
    const starGfx = this.add.graphics();
    stars.forEach(s => {
      starGfx.fillStyle(0xFFFFFF, s.alpha * 0.3);
      starGfx.fillRect(s.x, s.y, s.size, s.size);
    });

    // Scanlines
    const scanGfx = this.add.graphics();
    scanGfx.fillStyle(0x000000, 0.06);
    for (let y = 0; y < h; y += 3) {
      scanGfx.fillRect(0, y, w, 1);
    }
  }

  _buildConveyor() {
    const { _w: w, _h: h } = this;
    const conveyorY = h * 0.72;
    const conveyorH = 20;

    // Draw conveyor as graphics TileSprite placeholder
    this._conveyorGfx = this.add.graphics();
    this._conveyorGfx.fillStyle(0x1A0A00, 1);
    this._conveyorGfx.fillRect(0, conveyorY, w, conveyorH);
    this._conveyorGfx.lineStyle(2, 0x4A3000, 1);
    this._conveyorGfx.strokeRect(0, conveyorY, w, conveyorH);

    // Animate conveyor by updating belt segments each frame
    this._conveyorOffset = 0;
    this._conveyorY = conveyorY;
    this._conveyorH = conveyorH;

    // Belt segments
    this._beltGfx = this.add.graphics();
    this._drawBelt();
  }

  _drawBelt() {
    const g = this._beltGfx;
    const { _w: w } = this;
    g.clear();
    const segW = 30;
    const segH = this._conveyorH;
    const y = this._conveyorY;
    const offset = this._conveyorOffset % segW;

    for (let x = -segW + offset; x < w + segW; x += segW) {
      g.fillStyle(0x3A2000, 1);
      g.fillRect(x, y + 2, segW - 4, segH - 4);
      g.lineStyle(1, 0x6A4000, 1);
      g.strokeRect(x, y + 2, segW - 4, segH - 4);
    }
  }

  // ── Isometric box drawing ─────────────────────────────────────────────────

  /**
   * Draws a three-face isometric wooden crate onto Graphics g.
   * (x, y) is the top-left of the FRONT face (junction between top and front).
   */
  // colorOverride: if provided, replaces the type color on stripe and edge tint (Stroop boxes)
  _drawIsometricBox(g, x, y, type, dims = null, colorOverride = null) {
    const { W: w = 54, H: h = 34, D: d = 10, T: t = 14 } = dims || {};
    const boxColor = colorOverride !== null ? colorOverride : (TYPE_COLORS[type] || 0x00FFFF);

    // Top face — lightest (light source from above-left)
    g.fillStyle(0xC8A45A);
    g.fillPoints([
      { x: x,         y: y     },
      { x: x + w,     y: y     },
      { x: x + w,     y: y - t },
      { x: x,         y: y - t }
    ], true);

    // Front face — mid tone
    g.fillStyle(0x8B6914);
    g.fillRect(x, y, w, h);

    // Type color stripe — uses display color for Stroop boxes
    g.fillStyle(boxColor, 0.72);
    g.fillRect(x, y, w, 6);

    // Side face — darkest (shadow)
    g.fillStyle(0x5C4200);
    g.fillPoints([
      { x: x + w,         y: y - t         },
      { x: x + w + d,     y: y - t + 5     },
      { x: x + w + d,     y: y + h - 5     },
      { x: x + w,         y: y + h         }
    ], true);

    // Plank detail lines — proportional to face dimensions
    g.lineStyle(1, 0x3D2200, 0.6);
    g.lineBetween(x,                    y + Math.floor(h / 3),   x + w, y + Math.floor(h / 3));
    g.lineBetween(x,                    y + Math.floor(2 * h / 3), x + w, y + Math.floor(2 * h / 3));
    g.lineBetween(x + Math.floor(w / 3), y, x + Math.floor(w / 3), y + h);
    g.lineBetween(x + Math.floor(2 * w / 3), y, x + Math.floor(2 * w / 3), y + h);

    // Edge tint — uses display color for Stroop boxes
    g.lineStyle(1, boxColor, 0.55);
    g.strokeRect(x, y, w, h);
  }

  // ── Slots ─────────────────────────────────────────────────────────────────

  _buildSlots() {
    this._slots = [];
    this._slotGraphics = [];
    const { _w: w, _h: h } = this;

    if (this.currentLevelData.slotsPerCategory === 1) {
      this._buildSingleCategorySlots(w, h);
    } else {
      this._buildGridSlots(w, h);
    }

    // Solid black overlay drawn over non-accepting slots during drag (depth 11)
    this._slotOverlayGfx = this.add.graphics().setDepth(11);

    // Shared hover ring drawn above everything during drag (depth 15)
    this._hoverGfx = this.add.graphics().setDepth(15);
  }

  /** Level 1: one 120×80 slot per category tag, single centered row. */
  _buildSingleCategorySlots(w, h) {
    const tags    = this.currentLevelData.availableTags;
    const slotW   = 120, slotH = 80, paddingX = 16;
    const totalW  = tags.length * slotW + (tags.length - 1) * paddingX;
    const startX  = (w - totalW) / 2;
    const startY  = h * 0.42;

    tags.forEach((tag, i) => {
      const typeColor = TYPE_COLORS[tag] || 0x007788;
      const colorHex  = '#' + typeColor.toString(16).padStart(6, '0');
      const x = startX + i * (slotW + paddingX);
      const y = startY;

      const gfx = this.add.graphics();
      this._drawSlot(gfx, x, y, slotW, slotH, 'normal', typeColor);

      // Category label — vertically centered (no grid ID needed)
      const typeText = this.add.text(x + slotW / 2, y + slotH / 2 - 8, `[${tag}]`, {
        fontFamily: "'Press Start 2P'",
        fontSize:   '7px',
        color:      colorHex
      }).setOrigin(0.5);

      // ▼ arrow — hidden at rest, pulsed during drag
      const arrowBaseY = y + slotH - 12;
      const arrowText  = this.add.text(x + slotW / 2, arrowBaseY, '▼', {
        fontFamily: "'Press Start 2P'",
        fontSize:   '8px',
        color:      colorHex
      }).setOrigin(0.5).setVisible(false).setDepth(13);

      this._slots.push({
        x, y, w: slotW, h: slotH,
        label: tag,     // label IS the category name in Level 1
        pkgType: tag,
        typeColor,
        gfx, typeText, labelText: null, arrowText, arrowBaseY,
        available: true
      });
    });
  }

  /** Level 2+: category × shape grid. */
  _buildGridSlots(w, h) {
    const BASE_SHAPES = ['square', 'wide', 'tall'];

    // Core delivery categories — DAMAGED goes to DISCARD, all others get columns
    const categories = this.currentLevelData.availableTags.filter(
      t => t !== 'DAMAGED'
    );

    const cols = categories.length;
    const rows = BASE_SHAPES.length;  // always 3

    // ── Slot descriptor list (row-major: index i → col=i%cols, row=i/cols) ──
    let slotList;

    if (this.levelManager.currentLevel >= 3) {
      // Level 3+: all category×shape combinations, fully shuffled — no grouping
      slotList = [];
      categories.forEach(cat => {
        BASE_SHAPES.forEach(shape => slotList.push({ pkgType: cat, shape }));
      });
      Phaser.Utils.Array.Shuffle(slotList);
    } else {
      // Level 2: columns grouped by category, shapes shuffled independently per column
      const columnShapes = categories.map(() =>
        Phaser.Utils.Array.Shuffle([...BASE_SHAPES])
      );
      slotList = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          slotList.push({ pkgType: categories[col], shape: columnShapes[col][row] });
        }
      }
    }

    // ── Layout constants ──────────────────────────────────────────────────────
    const cellW      = 134;
    const gapX       = 14;
    const startX     = (w - (cols * cellW + (cols - 1) * gapX)) / 2;
    const rowCenters = [
      Math.round(h * 0.20),
      Math.round(h * 0.36),
      Math.round(h * 0.52),
    ];

    // ── Place each slot by flat index → (col, row) ───────────────────────────
    slotList.forEach(({ pkgType, shape }, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      const typeColor = TYPE_COLORS[pkgType] || 0x007788;
      const colorHex  = '#' + typeColor.toString(16).padStart(6, '0');
      const dims  = SLOT_DIMS[shape] || SLOT_DIMS.square;
      const slotW = dims.w;
      const slotH = dims.h;
      const cellX = startX + col * (cellW + gapX);
      const x     = cellX + Math.floor((cellW - slotW) / 2);
      const y     = rowCenters[row] - Math.floor(slotH / 2);

      const gfx = this.add.graphics();
      this._drawSlot(gfx, x, y, slotW, slotH, 'normal', typeColor);

      const silhouetteGfx = this.add.graphics();
      this._drawShapeSilhouette(silhouetteGfx, x, y, slotW, slotH, shape);

      const typeText = this.add.text(x + slotW / 2, y + 8, `[${pkgType}]`, {
        fontFamily: "'Press Start 2P'",
        fontSize:   '6px',
        color:      colorHex
      }).setOrigin(0.5, 0);

      const arrowBaseY = y + slotH - 8;
      const arrowText  = this.add.text(x + slotW / 2, arrowBaseY, '▼', {
        fontFamily: "'Press Start 2P'",
        fontSize:   '8px',
        color:      colorHex
      }).setOrigin(0.5).setVisible(false).setDepth(13);

      this._slots.push({
        x, y, w: slotW, h: slotH,
        label:    `${pkgType}-${shape}`,
        pkgType,
        shape,
        typeColor,
        gfx, silhouetteGfx, typeText, labelText: null, arrowText, arrowBaseY,
        available: true
      });
    });
  }

  /** Draw a proportional 20%-opacity white outline of shape inside the slot bounds. */
  _drawShapeSilhouette(gfx, x, y, slotW, slotH, shape) {
    const dims = SHAPE_DIMS[shape];
    if (!dims) return;
    const bw    = dims.W + dims.D;
    const bh    = dims.T + dims.H;
    const maxW  = slotW - 16;
    const maxH  = slotH - 16;
    const scale = Math.min(maxW / bw, maxH / bh);
    const sw = Math.floor(bw * scale);
    const sh = Math.floor(bh * scale);
    const sx = Math.floor(x + (slotW - sw) / 2);
    const sy = Math.floor(y + (slotH - sh) / 2);
    gfx.lineStyle(1, 0xFFFFFF, 0.20);
    gfx.strokeRect(sx, sy, sw, sh);
  }

  /**
   * @param {Phaser.GameObjects.Graphics} gfx
   * @param {string} state  'normal'|'active'|'dim'|'selected'|'correct'|'wrong'
   * @param {number} typeColor  hex int — the slot's accepted-type color (used for 'normal'/'active')
   */
  _drawSlot(gfx, x, y, w, h, state, typeColor = 0x007788) {
    gfx.clear();
    let borderColor, bgColor, borderAlpha = 1;
    switch (state) {
      case 'active':   // drag in progress — slot accepts this box type
        borderColor = typeColor;  bgColor = 0x00000F; borderAlpha = 1.0; break;
      case 'dim':      // drag in progress — slot does NOT accept this box type
        borderColor = typeColor;  bgColor = 0x00000F; borderAlpha = 0.15; break;
      case 'selected': borderColor = 0xFFD700; bgColor = 0x0A0A00; break;
      case 'correct':  borderColor = 0x00FF66; bgColor = 0x001A00; break;
      case 'wrong':    borderColor = 0xFF2200; bgColor = 0x1A0000; break;
      case 'orange':   borderColor = 0xFF8800; bgColor = 0x1A0500; break;
      default:         // 'normal' — type color at half alpha
        borderColor = typeColor;  bgColor = 0x00000F; borderAlpha = 0.5;
    }
    gfx.fillStyle(bgColor, 0.85);
    gfx.fillRect(x, y, w, h);
    gfx.lineStyle(2, borderColor, borderAlpha);
    gfx.strokeRect(x, y, w, h);
  }

  /** Restore a slot to its default appearance. Works for both regular and DISCARD slots. */
  _redrawSlotNormal(slot) {
    if (!slot?.gfx?.active) return;
    this.tweens.killTweensOf(slot.gfx);
    slot.gfx.setAlpha(1);
    this._drawSlot(slot.gfx, slot.x, slot.y, slot.w, slot.h, 'normal', slot.typeColor);
    if (slot.typeText)  slot.typeText.setAlpha(1);
    if (slot.labelText) slot.labelText.setAlpha(1);
    // Ensure arrow is hidden if called outside _restoreSlots
    if (slot.arrowText && slot.arrowText.visible) {
      this.tweens.killTweensOf(slot.arrowText);
      slot.arrowText.setVisible(false);
      slot.arrowText.setY(slot.arrowBaseY);
    }
  }

  // ── Conveyor speed helpers ────────────────────────────────────────────────

  _getConveyorSpeed() { return this.currentLevelData.conveyorSpeed; }
  _getMaxBoxes()      { return this.currentLevelData.maxBoxes; }

  // ── Kronos helpers ────────────────────────────────────────────────────────

  _getKronosTime() {
    const times = [20, 15, 10, 8];
    return times[Math.min(this.levelManager.currentLevel - 1, 3)];
  }

  _startKronosForOldest() {
    if (this._paused || this._packages.length === 0) {
      this._kronosOldestPkg = null;
      this._hud.hideKronos();
      return;
    }
    this._stopKronosTick();
    this._kronosOldestPkg = this._packages[0];
    const t = this._getKronosTime();
    this._kronos.start(t);
    this._hud.updateKronos(t, false);
  }

  _stopKronosTick() {
    this._kronosTickPlaying = false;
  }

  // ── Package spawning ──────────────────────────────────────────────────────

  /**
   * Spawns one package off the left edge; staggered behind any existing boxes.
   * Does NOT start Kronos if a batch is already in progress.
   */
  _spawnPackage() {
    if (this._paused) return;
    if (this._packages.length >= this._getMaxBoxes()) return;

    // Use max possible BW (wide shape = 96) for safe left-edge stagger
    const GAP    = 30;
    const startX = -96 - this._packages.length * (96 + GAP);

    const type = this._randomPackageType();

    // Derive box shape from a matching slot (Level 2+); square in Level 1
    let boxShape = 'square';
    const accepting = this._slots.filter(s => s.pkgType === type && s.shape);
    if (accepting.length > 0) {
      boxShape = accepting[Phaser.Math.Between(0, accepting.length - 1)].shape;
    }

    // DAMAGED is a visual state, not a type — 25% chance in Level 4+
    const isDamaged = this.levelManager.currentLevel >= 4 && Math.random() < 0.25;

    const pkg = this._buildPackageGfx(type, startX, boxShape, isDamaged);
    pkg.pkgType    = type;
    pkg.shape      = boxShape;
    pkg.isDamaged  = isDamaged;
    pkg.isDragging = false;

    this._packages.push(pkg);

    // Start Kronos for this box only if nothing is already running
    if (!this._kronos.isRunning()) this._startKronosForOldest();
  }

  /** Fill the conveyor up to maxBoxes. */
  _fillConveyor() {
    if (this._paused) return;
    const max = this._getMaxBoxes();
    while (this._packages.length < max) {
      this._spawnPackage();
    }
  }

  _randomPackageType() {
    const tags = this.currentLevelData.availableTags;
    return tags[Math.floor(Math.random() * tags.length)];
  }

  _buildPackageGfx(type, startX = -64, shape = 'square', isDamaged = false) {
    // ── Dimensions from shape definition ─────────────────────────────────────
    const { W, H, D, T } = SHAPE_DIMS[shape] || SHAPE_DIMS.square;
    const BW = W + D;   // total bounding width
    const BH = T + H;   // total bounding height

    // ── Bake box + labels into a RenderTexture ────────────────────────────
    const rt = this.add.renderTexture(0, 0, BW, BH);

    const gfx     = this.add.graphics();
    const orderId = `#${Phaser.Math.Between(10000, 99999)}`;

    // 3-char abbreviation — fits clearly on a 54px front face at 6px font
    const typeAbbr = {
      STANDARD: 'STD', PRIORITY: 'PRI', FRAGILE: 'FRG',
      DAMAGED:  'DMG', URGENT:   'URG'
    };
    const typeColorHex = {
      STANDARD: '#00FFFF', PRIORITY: '#FFD700', FRAGILE: '#FF2200',
      DAMAGED:  '#AA4400', URGENT:   '#FF00FF'
    };

    // Order ID — white, below the color stripe (stripe occupies T to T+6)
    const idText = this.add.text(0, 0, orderId, {
      fontFamily: "'Press Start 2P'", fontSize: '6px', color: '#FFFFFF'
    });

    // ── Stroop conflict mode (Level 3+, 50% chance) ───────────────────────
    // Stroop boxes: entire visual (stripe, border, text color) uses a DIFFERENT
    // category's color. Only the text abbreviation reveals the true category.
    // Delivery matching is always on true type — visuals never affect logic.
    let boxColorOverride = null;
    let tagColor         = typeColorHex[type] || '#00FFFF';

    if (this.currentLevelData.conflictMode && Math.random() < 0.5) {
      const others = this.currentLevelData.availableTags.filter(
        t => t !== type && t !== 'DAMAGED'
      );
      if (others.length > 0) {
        const displayType = others[Math.floor(Math.random() * others.length)];
        boxColorOverride  = TYPE_COLORS[displayType] || null;
        tagColor          = typeColorHex[displayType] || tagColor;
      }
    }

    // Box visual — passes display color override for Stroop boxes
    this._drawIsometricBox(gfx, 0, T, type, SHAPE_DIMS[shape], boxColorOverride);

    // Tag text — ALWAYS shows true category abbreviation; color follows display
    const tagText = this.add.text(0, 0, typeAbbr[type] || type, {
      fontFamily: "'Press Start 2P'", fontSize: '6px', color: tagColor
    });

    rt.beginDraw();
    rt.batchDraw(gfx,     0,                                0);
    rt.batchDraw(idText,  Math.floor((BW - idText.width)  / 2), T + 9);
    rt.batchDraw(tagText, Math.floor((BW - tagText.width) / 2), T + 22);
    rt.endDraw();

    // Clean up temp objects
    gfx.destroy();
    idText.destroy();
    tagText.destroy();

    // ── Damage effects — baked on top as a second render pass ─────────────
    if (isDamaged) {
      const dmg = this.add.graphics();

      // Dark overlay at 30% alpha (desaturates)
      dmg.fillStyle(0x000000, 0.30);
      dmg.fillRect(0, T, W, H);

      // 3 jagged cracks across front face
      dmg.lineStyle(1, 0x2A1500, 1);
      dmg.lineBetween(W * 0.15, T + 2,  W * 0.40, T + H - 3);   // crack 1
      dmg.lineBetween(W * 0.55, T + 1,  W * 0.35, T + H - 4);   // crack 2
      dmg.lineBetween(W * 0.65, T + 4,  W * 0.55, T + 10);      // crack 3a
      dmg.lineBetween(W * 0.55, T + 10, W * 0.72, T + 18);      // crack 3b

      // Broken corner — dark triangle masking top-right of front face
      dmg.fillStyle(0x1A0800, 1);
      dmg.fillTriangle(W, T, W - 12, T, W, T + 10);

      rt.beginDraw();
      rt.batchDraw(dmg, 0, 0);
      rt.endDraw();
      dmg.destroy();

      rt.setAngle(8);
    }

    // ── Position: enter from left edge, sit on conveyor surface ─────────
    const startY = this._conveyorY - BH + 4;

    rt.setPosition(startX, startY)
      .setOrigin(0, 0)
      .setDepth(2);

    // ── Drop shadow — drawn in local coords so shadow.x can track pkg.x ──
    // (separate scene object so it stays at conveyor Y while box lifts)
    const shadowBaseY = startY + BH + 3;
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.4);
    shadow.fillEllipse(BW / 2, 0, BW * 0.8, 9);   // relative: center at BW/2
    shadow.setPosition(startX, shadowBaseY);
    shadow.setDepth(1);
    rt.shadowGfx   = shadow;
    rt.shadowBaseY = shadowBaseY;

    // ── Metadata ──────────────────────────────────────────────────────────
    rt.pkgType = type;
    rt.hitW    = BW;
    rt.hitH       = BH;
    rt.homeX      = startX;
    rt.homeY      = startY;
    rt.isDragging = false;

    // ── Interactive + drag ────────────────────────────────────────────────
    rt.setInteractive({ draggable: true, useHandCursor: true });
    this._wireDragEvents(rt);

    return rt;
  }

  _wireDragEvents(pkg) {
    pkg.on('dragstart', () => {
      if (this._paused) return;
      // Direct competition: if player grabs Pandora's targeted package, player wins the race
      if (this._pandoraTargetPkg === pkg) this._cancelPandoraRace();
      pkg.isDragging  = true;
      pkg._hoveredSlot = null;
      this.tweens.killTweensOf(pkg);
      // Snapshot home position at drag start (current scrolled position)
      pkg.homeX = pkg.x;
      pkg.homeY = pkg.y;
      pkg.setDepth(10);
      // Lift box 8 px
      this.tweens.add({
        targets: pkg, y: pkg.homeY - 8,
        duration: 80, ease: 'Quad.easeOut'
      });
      if (pkg.shadowGfx) pkg.shadowGfx.setAlpha(0.5);
      // Highlight valid slots; dim invalid ones
      this._highlightSlotsForPkg(pkg);
    });

    pkg.on('drag', (pointer, dragX, dragY) => {
      if (this._paused) return;
      pkg.x = dragX;
      pkg.y = dragY;
      // Shadow fades and scales as box rises above home Y
      if (pkg.shadowGfx) {
        const dy = Math.max(0, pkg.homeY - dragY);
        pkg.shadowGfx.setAlpha(Math.max(0.08, 0.4 - dy * 0.004));
        pkg.shadowGfx.setScale(1 + dy * 0.005, 1);
      }
      // Update hover-ring overlay
      this._updateSlotHover(pkg, pointer);
    });

    pkg.on('dragend', (pointer) => {
      pkg.isDragging = false;
      // Restore all slot visuals before resolving the drop
      this._restoreSlots();
      pkg._hoveredSlot = null;

      if (this._paused) { this._returnPkgToConveyor(pkg); return; }
      // Test drop position against slot bounds
      let hit = null;
      for (const slot of this._slots) {
        if (pointer.x >= slot.x && pointer.x <= slot.x + slot.w &&
            pointer.y >= slot.y && pointer.y <= slot.y + slot.h) {
          hit = slot;
          break;
        }
      }
      if (hit) {
        this._deliverToSlot(pkg, hit);
      } else {
        this._returnPkgToConveyor(pkg);
      }
    });
  }

  // ── Drag feedback helpers ─────────────────────────────────────────────────

  /**
   * Called on dragstart.
   * Level 1 only: bright 'active' border + pulsing alpha + ▼ arrow on matching slots,
   * black overlay on non-matching slots.
   * Level 2+: no drag feedback — slots stay at idle appearance; result flash on drop only.
   */
  _highlightSlotsForPkg(pkg) {
    if (this.levelManager.currentLevel >= 2) return;

    const matchType = pkg.pkgType;

    // Draw black overlay over every non-accepting slot in one pass
    if (this._slotOverlayGfx) this._slotOverlayGfx.clear();
    for (const slot of this._slots) {
      const accepts = (slot.label === 'DISCARD')
        ? !!pkg.isDamaged
        : (slot.pkgType === matchType);
      slot._accepting = accepts;

      if (!accepts) {
        if (this._slotOverlayGfx) {
          this._slotOverlayGfx.fillStyle(0x000000, 0.55);
          this._slotOverlayGfx.fillRect(slot.x, slot.y, slot.w, slot.h);
        }
      }
    }

    // For each accepting slot: brighten border + pulse + show ▼ arrow
    for (const slot of this._slots) {
      if (!slot._accepting) continue;

      this._drawSlot(slot.gfx, slot.x, slot.y, slot.w, slot.h, 'active', slot.typeColor);

      // Border pulse: alpha 1.0 ↔ 0.6, 400 ms
      this.tweens.add({
        targets:  slot.gfx,
        alpha:    0.6,
        duration: 400,
        ease:     'Sine.easeInOut',
        yoyo:     true,
        repeat:   -1
      });

      // ▼ arrow: reset position, show, and pulse downward
      if (slot.arrowText) {
        slot.arrowText.setY(slot.arrowBaseY).setVisible(true).setAlpha(1);
        this.tweens.add({
          targets:  slot.arrowText,
          y:        slot.arrowBaseY + 5,
          duration: 400,
          ease:     'Sine.easeInOut',
          yoyo:     true,
          repeat:   -1
        });
      }
    }
  }

  /**
   * Called every drag frame.
   * Draws a white hover ring around whichever valid slot the pointer is over.
   */
  _updateSlotHover(pkg, pointer) {
    let newHover = null;
    for (const slot of this._slots) {
      if (pointer.x >= slot.x && pointer.x <= slot.x + slot.w &&
          pointer.y >= slot.y && pointer.y <= slot.y + slot.h) {
        newHover = slot;
        break;
      }
    }

    if (newHover === pkg._hoveredSlot) return;   // no change
    pkg._hoveredSlot = newHover;

    this._hoverGfx.clear();
    if (newHover?._accepting) {
      // Valid hover: bright white outer ring
      this._hoverGfx.lineStyle(2, 0xFFFFFF, 0.9);
      this._hoverGfx.strokeRect(
        newHover.x - 3, newHover.y - 3,
        newHover.w + 6, newHover.h + 6
      );
    }
  }

  /**
   * Called on dragend.
   * Kills all drag-state tweens, clears overlays, hides arrows, redraws slots at idle.
   */
  _restoreSlots() {
    if (this._hoverGfx)        this._hoverGfx.clear();
    if (this._slotOverlayGfx)  this._slotOverlayGfx.clear();
    for (const slot of this._slots) {
      // Kill both gfx and arrow tweens
      this.tweens.killTweensOf(slot.gfx);
      if (slot.arrowText) {
        this.tweens.killTweensOf(slot.arrowText);
        slot.arrowText.setVisible(false);
        slot.arrowText.setY(slot.arrowBaseY);
      }
      this._redrawSlotNormal(slot);
      slot._accepting = undefined;
    }
  }

  _returnPkgToConveyor(pkg) {
    this.tweens.killTweensOf(pkg);
    this.tweens.add({
      targets: pkg,
      x: pkg.homeX,
      y: pkg.homeY,
      duration: 250,
      ease: 'Quad.easeOut'
    });
    pkg.setDepth(2);
    if (pkg.shadowGfx) {
      pkg.shadowGfx.setAlpha(0.4);
      pkg.shadowGfx.setScale(1, 1);
    }
  }

  // ── Conveyor timeout (right-edge escape) ─────────────────────────────────

  _packageLost(pkg) {
    // Level 4: any missed box is immediate termination
    if (this.levelManager.currentLevel >= 4) {
      this.scene.start('GameOverScene', { type: 'fired', day: this._gameState.totalDaysEmployed });
      return;
    }

    const wasTracked = pkg === this._kronosOldestPkg;
    if (wasTracked) this._kronosOldestPkg = null;

    // Remove from tracking immediately so update() doesn't re-trigger
    this._packages = this._packages.filter(p => p !== pkg);
    this._kronos.stop();
    this._stopKronosTick();
    this._hud.hideKronos();
    this._hermes.onConveyorTimeout();   // −10 %

    this.tweens.killTweensOf(pkg);
    this.tweens.add({
      targets: pkg,
      alpha: 0,
      duration: 300,
      ease: 'Linear',
      onComplete: () => {
        if (pkg.shadowGfx) pkg.shadowGfx.destroy();
        if (pkg.active) pkg.destroy();
        if (wasTracked) this._startKronosForOldest();
        this.time.delayedCall(300, this._fillConveyor, [], this);
      }
    });
    if (pkg.shadowGfx) {
      this.tweens.add({ targets: pkg.shadowGfx, alpha: 0, duration: 200 });
    }
  }

  // ── Input (handled by drag events on each box — see _wireDragEvents) ────────

  _clearSelectedPackage() {
    // Called by Kronos expire — destroy all active boxes and reset slots
    for (const pkg of this._packages) {
      this.tweens.killTweensOf(pkg);
      if (pkg.shadowGfx) pkg.shadowGfx.destroy();
      if (pkg.active) pkg.destroy();
    }
    this._packages = [];
    this._selectedPackage = null;
    this._restoreSlots();
  }

  _deliverToSlot(pkg, slot) {
    const speed      = this._kronos.getSpeed();
    const isDiscard  = slot.label === 'DISCARD';
    const isDamaged  = !!pkg.isDamaged;
    const multiSlot  = this.currentLevelData.slotsPerCategory > 1;

    // ── Determine outcome ─────────────────────────────────────────────────
    let outcome;
    if (isDiscard) {
      outcome = isDamaged ? 'correct' : 'wrongDiscard';
    } else if (isDamaged) {
      outcome = 'wrongDamaged';
    } else {
      const catOk   = pkg.pkgType === slot.pkgType;
      const shapeOk = !multiSlot || pkg.shape === slot.shape;
      if (catOk && shapeOk)        outcome = 'correct';
      else if (catOk && !shapeOk)  outcome = 'wrongShape';
      else                         outcome = 'wrong';
    }

    if (outcome === 'correct') {
      // ── Correct delivery ────────────────────────────────────────────────
      const wasTracked = pkg === this._kronosOldestPkg;
      if (wasTracked) this._kronosOldestPkg = null;
      this._kronos.stop();
      this._stopKronosTick();
      this._hud.hideKronos();

      this._drawSlot(slot.gfx, slot.x, slot.y, slot.w, slot.h, 'correct');
      this.time.delayedCall(400, () => this._redrawSlotNormal(slot));
      if (this._audio) this._audio.playSFX('correct');

      if (isDiscard) {
        this._hermes._adjust(+4);             // DISCARD bonus
      } else if (pkg.pkgType === 'PRIORITY' && speed === 'fast') {
        this._hermes.onPriorityFast();
      } else if (speed === 'fast') {
        this._hermes.onTaskFast();
      } else {
        this._hermes.onTaskSlow();
      }

      const tx = slot.x + slot.w / 2 - pkg.hitW / 2;
      const ty = slot.y + slot.h / 2 - pkg.hitH / 2;
      pkg.setDepth(5);
      this.tweens.killTweensOf(pkg);
      this.tweens.add({
        targets: pkg, x: tx, y: ty + 4,
        duration: 100, ease: 'Quad.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: pkg, y: ty,
            duration: 100, ease: 'Bounce.easeOut',
            onComplete: () => {
              if (pkg.shadowGfx) pkg.shadowGfx.destroy();
              this._packages = this._packages.filter(p => p !== pkg);
              pkg.destroy();
              this._selectedPackage = null;
              if (wasTracked) this._startKronosForOldest();
              this.time.delayedCall(600, this._fillConveyor, [], this);
            }
          });
        }
      });

    } else {
      // ── All wrong cases — determine penalty and flash color ───────────────
      let flashState, penalty;

      if (outcome === 'wrongDamaged') {
        flashState = 'wrong'; penalty = () => this._hermes._adjust(-12);
      } else if (outcome === 'wrongDiscard') {
        flashState = 'orange'; penalty = () => this._hermes._adjust(-8);
      } else if (outcome === 'wrongShape') {
        flashState = 'orange'; penalty = () => this._hermes._adjust(-6);
      } else {
        flashState = 'wrong';
        penalty = () => pkg.pkgType === 'FRAGILE'
          ? this._hermes.onFragileWrong()
          : this._hermes.onTaskWrongSlot();
      }

      this._drawSlot(slot.gfx, slot.x, slot.y, slot.w, slot.h, flashState);
      this.time.delayedCall(400, () => this._redrawSlotNormal(slot));
      if (this._audio) this._audio.playSFX('wrong');
      penalty();

      this.tweens.killTweensOf(pkg);
      this.tweens.add({
        targets: pkg, x: pkg.x + 6,
        duration: 50, ease: 'Linear',
        yoyo: true, repeat: 5,
        onComplete: () => this._returnPkgToConveyor(pkg)
      });
    }
  }

  // ── Day progression ───────────────────────────────────────────────────────

  _onSecondTick() {
    if (this._paused) return;
    this._daySeconds++;

    if (this._daySeconds >= 45) {
      this._daySeconds = 0;
      this._advanceDay();
    }
  }

  _advanceDay() {
    this._gameState.currentDay++;
    this._gameState.totalDaysEmployed++;

    this._hud.updateDay(this._gameState.currentDay + 1);
    if (this._audio) this._audio.playSFX('dayup');

    // Pandora status update
    const status = this._pandora.updateForDay(this._gameState.currentDay);
    this._gameState.pandoraStatus = status;

    // Narrow sweet spot every 5 days
    if (this._gameState.currentDay % 5 === 0) {
      this._hermes.narrowSweetSpot();
    }

    // Notification schedule
    const notif = NOTIF_SCHEDULE[this._gameState.currentDay];
    if (notif && !this._firedNotifs.has(this._gameState.currentDay)) {
      this._firedNotifs.add(this._gameState.currentDay);
      this._notif.show(notif[0], notif[1]);
      if (this._audio) this._audio.playSFX('notify');
    }

    // Progress to World 2 after all 4 levels (4 × 5 = 20 in-game days)
    if (this._gameState.currentDay >= 20) {
      this._progressToWorld2();
    }
  }

  _onLevelAdvance(levelData) {
    if (levelData.id === 2) {
      this._notif.show('WARNING', 'PROMETHEUS INC. Slot-specific delivery now required. Check package routing code.');
    } else if (levelData.id === 3) {
      // Stroop warning — show once, auto-dismiss after 5 s, never repeats
      // (level advance fires exactly once per boundary — the flag in update() guarantees it)
      this._notif.show('WARNING', 'PROMETHEUS INC. Updated labeling system active. Refer to package color coding only.');
      this.time.delayedCall(5000, () => { if (this._notif) this._notif.clearAll(); });
    } else if (levelData.id === 4) {
      this._notif.show('SYSTEM', 'PROMETHEUS INC. AUTOMATED INTEGRATION protocols active. Pandora assistance module enabled.');
      // Start the arm interference loop — no announcement, player discovers it
      this._pandora.startArmInterference(
        this,
        () => this._triggerPandoraArm(),
        () => Math.max(0, this._gameState.currentDay - 6)
      );
    } else {
      this._notif.show('SYSTEM', `PROMETHEUS INC. — ${levelData.name} protocols now active.`);
    }
    if (this._audio) this._audio.playSFX('notify');
    // Rebuild slots for the new level layout
    this._rebuildSlots();
    // Level 4: DISCARD slot appears immediately with the level (not day-gated)
    if (levelData.id === 4) {
      this._buildDiscardSlot();
    }
  }

  /** Tear down existing slot objects and rebuild for the current level data. */
  _rebuildSlots() {
    for (const slot of this._slots) {
      if (slot.gfx?.active)            slot.gfx.destroy();
      if (slot.silhouetteGfx?.active)  slot.silhouetteGfx.destroy();
      if (slot.typeText?.active)       slot.typeText.destroy();
      if (slot.labelText?.active)      slot.labelText.destroy();
      if (slot.arrowText?.active)      slot.arrowText.destroy();
    }
    if (this._slotOverlayGfx?.active) { this._slotOverlayGfx.destroy(); this._slotOverlayGfx = null; }
    if (this._hoverGfx?.active)       { this._hoverGfx.destroy();       this._hoverGfx = null; }
    this._slots = [];
    this._discardSlot = null;   // DISCARD is re-added by _onLevelAdvance for Level 4
    this._buildSlots();
  }

  // ── Special slot management ───────────────────────────────────────────────

  /**
   * Builds and fades in the DISCARD slot (Day 15+).
   * Positioned just above the conveyor belt, centered.
   */
  _buildDiscardSlot() {
    const { _w: w, _h: h } = this;
    const slotW = 110, slotH = 50;
    // Bottom-right of the slot zone, aligned with third row
    const x = w - slotW - 20;
    const y = Math.round(h * 0.52) - Math.floor(slotH / 2);

    const typeColor = TYPE_COLORS.DAMAGED;  // 0xAA4400

    const gfx = this.add.graphics();
    this._drawSlot(gfx, x, y, slotW, slotH, 'normal', typeColor);
    gfx.setAlpha(0);

    // Single centred text (acts as both typeText and the slot identifier)
    const typeText = this.add.text(x + slotW / 2, y + slotH / 2, '[ DISCARD ]', {
      fontFamily: "'Press Start 2P'",
      fontSize:   '8px',
      color:      '#AA4400'
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: [gfx, typeText], alpha: 1, duration: 600, ease: 'Sine.easeIn' });

    const arrowBaseY = y + slotH - 8;
    const arrowText  = this.add.text(x + slotW / 2, arrowBaseY, '▼', {
      fontFamily: "'Press Start 2P'",
      fontSize:   '8px',
      color:      '#AA4400'
    }).setOrigin(0.5).setVisible(false).setDepth(13);

    const slot = {
      x, y, w: slotW, h: slotH,
      label: 'DISCARD', pkgType: 'DAMAGED', typeColor,
      gfx, typeText, labelText: null, arrowText, arrowBaseY,
      available: true
    };
    this._slots.push(slot);
    this._discardSlot = slot;

    this._notif.show('WARNING', 'DAMAGED items must be routed to DISCARD. Misrouting is penalized.');
    if (this._audio) this._audio.playSFX('notify');
  }

  /**
   * Fisher-Yates shuffle of the 8 regular slot labels in place.
   * Updates both the slot.label and the visible text object.
   * Called every 3 days from Day 15.
   */
  // ── Pandora arm interference ──────────────────────────────────────────────

  _getPandoraDelay() {
    const day = this._gameState.currentDay;
    // Day 25+: more frequent (6–8 s); Day 20–24: slower (10–12 s)
    return day >= 25
      ? Phaser.Math.Between(6000, 8000)
      : Phaser.Math.Between(10000, 12000);
  }

  _schedulePandoraInterference() {
    if (this._paused || this._gameState.currentDay < 20) return;
    if (this._pandoraTimer) this._pandoraTimer.remove(false);
    this._pandoraTimer = this.time.delayedCall(
      this._getPandoraDelay(),
      this._triggerPandoraArm,
      [],
      this
    );
  }

  /**
   * Direct-competition entry point.
   * Picks the leftmost package, shows a 0.8 s targeting reticle.
   * Player can steal the package by dragging it; if not, Pandora wins.
   */
  _triggerPandoraArm() {
    // Skip if busy or no target; reschedule via appropriate path
    if (this._paused || this._pandoraActive || this._packages.length === 0) {
      if (this.currentLevelData.pandoraActive) {
        this._pandora.rescheduleArm();
      } else {
        this._schedulePandoraInterference();
      }
      return;
    }

    // Direct competition: target the leftmost (most-advanced) package on the belt
    const pkg = this._packages.reduce((a, b) => a.x < b.x ? a : b);
    this._pandoraTargetPkg = pkg;

    // Create pulsing reticle (update loop redraws position every frame)
    this._pandoraReticleGfx = this.add.graphics().setDepth(25);
    this._drawPandoraReticle(this._pandoraReticleGfx, pkg);
    this._pandoraReticleTween = this.tweens.add({
      targets:  this._pandoraReticleGfx,
      alpha:    0.25,
      duration: 200,
      ease:     'Sine.easeInOut',
      yoyo:     true,
      repeat:   -1
    });

    // 0.8 s window — player can grab first; if not, arm launches
    this._pandoraRaceTimer = this.time.delayedCall(800, () => {
      this._pandoraRaceTimer = null;
      // Verify the package is still on the belt (not delivered/lost while we waited)
      if (!this._packages.includes(pkg) || !pkg.active) {
        this._clearPandoraReticle();
        this._pandoraTargetPkg = null;
        if (this.currentLevelData.pandoraActive) {
          this._pandora.rescheduleArm();
        } else {
          this._schedulePandoraInterference();
        }
        return;
      }
      // Pandora wins the race — clear reticle and launch arm
      this._clearPandoraReticle();
      this._pandoraTargetPkg = null;
      this._launchPandoraArm(pkg);
    });
  }

  /**
   * Called when the player grabs the targeted package before Pandora arrives.
   * Cancels the race and reschedules Pandora's next attempt.
   */
  _cancelPandoraRace() {
    if (this._pandoraRaceTimer) {
      this._pandoraRaceTimer.remove(false);
      this._pandoraRaceTimer = null;
    }
    this._clearPandoraReticle();
    this._pandoraTargetPkg = null;
    // Pandora will try again after a normal delay
    if (this.currentLevelData?.pandoraActive) {
      this._pandora.rescheduleArm();
    } else {
      this._schedulePandoraInterference();
    }
  }

  /** Draw (or redraw) the #CC00FF targeting reticle around a package. */
  _drawPandoraReticle(gfx, pkg) {
    gfx.clear();
    gfx.lineStyle(2, 0xCC00FF, 1);
    gfx.strokeRect(pkg.x - 4, pkg.y - 4, pkg.hitW + 8, pkg.hitH + 8);
    // Corner accents
    const cL = pkg.x - 4, cT = pkg.y - 4, cW = pkg.hitW + 8, cH = pkg.hitH + 8;
    const cs = 8;
    gfx.lineStyle(2, 0xFF44FF, 1);
    gfx.lineBetween(cL, cT, cL + cs, cT);
    gfx.lineBetween(cL, cT, cL, cT + cs);
    gfx.lineBetween(cL + cW, cT, cL + cW - cs, cT);
    gfx.lineBetween(cL + cW, cT, cL + cW, cT + cs);
    gfx.lineBetween(cL, cT + cH, cL + cs, cT + cH);
    gfx.lineBetween(cL, cT + cH, cL, cT + cH - cs);
    gfx.lineBetween(cL + cW, cT + cH, cL + cW - cs, cT + cH);
    gfx.lineBetween(cL + cW, cT + cH, cL + cW, cT + cH - cs);
  }

  /** Destroy the reticle graphics and stop its pulse tween. */
  _clearPandoraReticle() {
    if (this._pandoraReticleTween) {
      this._pandoraReticleTween.stop();
      this._pandoraReticleTween = null;
    }
    if (this._pandoraReticleGfx) {
      this._pandoraReticleGfx.destroy();
      this._pandoraReticleGfx = null;
    }
  }

  /**
   * Pandora won the race — slides arm in from right, grabs package, auto-delivers.
   * No efficiency change when player wins; +6% here when Pandora wins (in _pandoraGrab).
   */
  _launchPandoraArm(pkg) {
    this._pandoraActive = true;

    // Remove from tracking so it stops scrolling and can't be player-dragged
    this._packages = this._packages.filter(p => p !== pkg);
    pkg.disableInteractive();

    // Stop timer — Pandora is handling this batch
    this._kronos.stop();
    this._hud.hideKronos();

    // Find the target delivery slot
    const targetSlot = this._slots.find(s =>
      s.label === 'DISCARD'
        ? !!pkg.isDamaged
        : !pkg.isDamaged && s.pkgType === pkg.pkgType && s.shape === pkg.shape
    ) || null;

    // ── Build arm graphic (#CC00FF per Level 4 spec) ──────────────────────
    const armH    = 14;
    const clawW   = 16;
    const armY    = this._conveyorY - pkg.hitH - 16;
    const arm     = this.add.graphics().setDepth(20);
    this._pandoraArmGfx = arm;

    // Redraw: arm spans from tipX to right screen edge; claw at left end
    const redraw = (tipX) => {
      arm.clear();
      const right = this._w;
      if (tipX >= right) return;
      arm.fillStyle(0xCC00FF, 0.88);
      arm.fillRect(tipX, armY, right - tipX, armH);
      arm.fillStyle(0xFF44FF, 1);
      arm.fillRect(tipX - clawW, armY - 3, clawW, armH + 6);
      arm.lineStyle(1, 0xFFAAFF, 0.45);
      arm.lineBetween(tipX, armY, right, armY);
    };

    redraw(this._w);  // initial state: invisible (tip == right edge)

    // Step 1 — extend arm tip from right edge to box centre
    const grabX = pkg.x + pkg.hitW / 2;
    const proxy = { tipX: this._w };

    this.tweens.add({
      targets: proxy, tipX: grabX,
      duration: 420, ease: 'Quad.easeOut',
      onUpdate: () => redraw(proxy.tipX),
      onComplete: () => {
        // Purple flash on grabbed box (0.3 s) before delivery
        pkg.setTint(0xCC00FF);
        this.time.delayedCall(300, () => this._pandoraGrab(arm, pkg, targetSlot, proxy, redraw));
      }
    });
  }

  _pandoraGrab(arm, pkg, targetSlot, proxy, redraw) {
    // Fade out grabbed package + shadow
    this.tweens.add({ targets: pkg, alpha: 0, duration: 140 });
    if (pkg.shadowGfx) this.tweens.add({ targets: pkg.shadowGfx, alpha: 0, duration: 140 });

    // Step 2 — slide arm tip to the target slot (brief pause first)
    this.time.delayedCall(200, () => {
      const deliverX = targetSlot
        ? targetSlot.x + targetSlot.w / 2
        : this._w / 2;

      this.tweens.add({
        targets: proxy, tipX: deliverX,
        duration: 340, ease: 'Quad.easeOut',
        onUpdate: () => redraw(proxy.tipX),
        onComplete: () => {
          // Step 3 — deliver
          if (targetSlot) {
            this._drawSlot(targetSlot.gfx, targetSlot.x, targetSlot.y, targetSlot.w, targetSlot.h, 'correct');
            this.time.delayedCall(450, () => this._redrawSlotNormal(targetSlot));
          }
          if (this._audio) this._audio.playSFX('correct');

          this._hermes.onPandoraIntervene();  // +6 %

          if (pkg.active) pkg.destroy();
          if (pkg.shadowGfx?.active) pkg.shadowGfx.destroy();

          // Step 4 — retract arm back off right edge
          this.tweens.add({
            targets: proxy, tipX: this._w + 20,
            duration: 300, ease: 'Quad.easeIn',
            onUpdate: () => redraw(proxy.tipX),
            onComplete: () => {
              arm.destroy();
              this._pandoraArmGfx = null;
              this._pandoraActive  = false;
              // Refill conveyor then reschedule next interference
              this.time.delayedCall(400, this._fillConveyor, [], this);
              if (this.currentLevelData.pandoraActive) {
                this._pandora.rescheduleArm();
              } else {
                this._schedulePandoraInterference();
              }
            }
          });
        }
      });
    });
  }

  _progressToWorld2() {
    if (this._paused) return;
    this._paused = true;
    this._hermes.stop();
    this._kronos.stop();
    if (this._dayTimer) this._dayTimer.remove(false);

    // HR notification
    this._showModal([
      'PROMETHEUS INC. — HR',
      '',
      'Congratulations.',
      'You have been selected for',
      'internal transfer.',
      '',
      'Report to Engineering.',
    ], '#00FFFF', () => {
      if (this._audio) this._audio.playSFX('transition');
      // Flash and transition
      const flash = document.getElementById('flash-overlay');
      flash.style.transition = 'opacity 0.3s ease-in';
      flash.style.opacity = '1';
      setTimeout(() => {
        this.scene.start('World2Scene');
        setTimeout(() => {
          flash.style.transition = 'opacity 0.4s ease-out';
          flash.style.opacity = '0';
        }, 200);
      }, 400);
    });
  }

  // ── Audit system ──────────────────────────────────────────────────────────

  _scheduleNextAudit() {
    const days = Phaser.Math.Between(7, 10);
    const ms = days * 45 * 1000;

    this.time.delayedCall(ms, this._triggerAudit, [], this);
  }

  _triggerAudit() {
    if (this._paused) return;

    this._paused = true;
    this._kronos.pause();
    if (this._audio) this._audio.playSFX('audit');

    this._showModal([
      'PROMETHEUS INC.',
      'PERFORMANCE AUDIT',
      'IN PROGRESS',
      '',
      'Please stand by.',
    ], '#00FFFF', () => {
      this._paused = false;
      this._kronos.resume();
      this._scheduleNextAudit();
      // Re-seed the conveyor — timers that fired during the pause were swallowed
      this._fillConveyor();
    }, 3000);
  }

  // ── Modal display ─────────────────────────────────────────────────────────

  _showModal(lines, borderColor, onClose, autoCloseMs = null) {
    const { _w: w, _h: h } = this;
    const panelW = 340;
    const panelH = lines.length * 22 + 40;
    const panelX = w / 2 - panelW / 2;
    const panelY = h / 2 - panelH / 2;

    const gfx = this.add.graphics().setDepth(200);
    // Dim overlay
    gfx.fillStyle(0x000000, 0.75);
    gfx.fillRect(0, 0, w, h);
    // Panel
    gfx.fillStyle(0x000014, 0.95);
    gfx.fillRect(panelX, panelY, panelW, panelH);
    const bcInt = parseInt(borderColor.replace('#', ''), 16);
    gfx.lineStyle(3, bcInt, 1);
    gfx.strokeRect(panelX, panelY, panelW, panelH);
    gfx.lineStyle(1, bcInt, 0.3);
    gfx.strokeRect(panelX + 3, panelY + 3, panelW - 6, panelH - 6);

    const texts = lines.map((line, i) =>
      this.add.text(panelX + panelW / 2, panelY + 20 + i * 22, line, {
        fontFamily: "'Press Start 2P'",
        fontSize: '9px',
        color: borderColor,
        align: 'center'
      }).setOrigin(0.5, 0).setDepth(201)
    );

    const close = () => {
      gfx.destroy();
      texts.forEach(t => t.destroy());
      if (onClose) onClose();
    };

    if (autoCloseMs !== null) {
      this.time.delayedCall(autoCloseMs, close);
    } else {
      // Close on any click after 500ms
      this.time.delayedCall(500, () => {
        this.input.once('pointerdown', close);
        this.input.keyboard.once('keydown', close);
      });
    }
  }

  // ── Menu button ───────────────────────────────────────────────────────────

  _addMenuButton() {
    const { _w: w } = this;
    const btnW = 90;
    const btnX = w / 2 - btnW / 2;

    // Panel background — same style as other HUD panels
    const bg = this.add.graphics().setDepth(100);
    bg.fillStyle(0x000014, 0.88);
    bg.fillRect(btnX, 4, btnW, 28);
    bg.lineStyle(2, 0x007788, 1);
    bg.strokeRect(btnX, 4, btnW, 28);

    // Text button
    const btn = this.add.text(w / 2, 18, '[ MENU ]', {
      fontFamily: "'Press Start 2P'",
      fontSize: '8px',
      color: '#007788'
    }).setOrigin(0.5).setDepth(101).setInteractive({ useHandCursor: true });

    btn.on('pointerover',  () => btn.setColor('#00FFFF'));
    btn.on('pointerout',   () => btn.setColor('#007788'));
    btn.on('pointerdown',  () => this._goToMenu());

    // ESC key via DOM (version-proof)
    this._menuKeyHandler = (e) => { if (e.keyCode === 27) this._goToMenu(); };
    window.addEventListener('keydown', this._menuKeyHandler);
  }

  _goToMenu() {
    if (this._paused) return;   // block during audits / modal / transition
    this._paused = true;

    this._hermes.stop();
    this._kronos.stop();
    if (this._dayTimer) this._dayTimer.remove(false);
    if (this._audio) { this._audio.stopAll(); this._audio.setVolume(1.0); }
    this._notif.clearAll();
    this.registry.set('gameState', null);

    const flash = document.getElementById('flash-overlay');
    flash.style.transition = 'opacity 0.3s ease-in';
    flash.style.opacity = '1';

    this.time.delayedCall(350, () => {
      this.scene.start('IntroScene');
      setTimeout(() => {
        flash.style.transition = 'opacity 0.4s ease-out';
        flash.style.opacity = '0';
      }, 200);
    });
  }

  // ── Scene lifecycle ───────────────────────────────────────────────────────

  update() {
    if (!this._paused) {
      // ── Level advance — fires once per 10-day boundary ────────────────────
      const cDay = this._gameState.currentDay;
      if (LEVEL_ADVANCE_DAYS.includes(cDay) && !this._levelAdvanced) {
        this._levelAdvanced = true;
        const next = this.levelManager.advance();
        if (next) {
          this.currentLevelData = next;
          this._onLevelAdvance(next);
        }
      }
      if (!LEVEL_ADVANCE_DAYS.includes(cDay)) this._levelAdvanced = false;

      // Track reticle position — package moves on conveyor during 0.8 s window
      if (this._pandoraReticleGfx && this._pandoraTargetPkg?.active) {
        this._drawPandoraReticle(this._pandoraReticleGfx, this._pandoraTargetPkg);
      }

      const dt    = this.game.loop.delta / 1000;   // seconds since last frame
      const speed = this._getConveyorSpeed();       // px/sec for current level

      // Scroll conveyor belt — visual speed matches package speed
      this._conveyorOffset += speed * dt;
      this._drawBelt();

      // Parallax: warehouse_bg slower than camera
      if (this._warehouseBg) {
        this._warehouseBg.x = this._w / 2 + (this.cameras.main.scrollX * 0.3);
      }

      // Move packages and check for right-edge escape
      for (const pkg of [...this._packages]) {
        if (!pkg.isDragging) {
          pkg.x += speed * dt;
          // Shadow tracks box horizontally at fixed conveyor Y
          if (pkg.shadowGfx) pkg.shadowGfx.x = pkg.x;
        }
        if (pkg.x > this._w + 20) {
          this._packageLost(pkg);
        }
      }
    }
  }

  shutdown() {
    this._hermes.stop();
    this._kronos.stop();
    if (this._dayTimer)    this._dayTimer.remove(false);
    if (this._pandoraTimer) { this._pandoraTimer.remove(false); this._pandoraTimer = null; }
    if (this._pandoraArmGfx) { this._pandoraArmGfx.destroy(); this._pandoraArmGfx = null; }
    if (this._pandoraRaceTimer) { this._pandoraRaceTimer.remove(false); this._pandoraRaceTimer = null; }
    this._clearPandoraReticle();
    this._pandoraTargetPkg = null;
    if (this._pandora) this._pandora.stopArmInterference();
    this._notif.clearAll();
    if (this._menuKeyHandler) {
      window.removeEventListener('keydown', this._menuKeyHandler);
      this._menuKeyHandler = null;
    }
    // Destroy orphaned shadow objects (separate scene objects, not in containers)
    for (const pkg of this._packages) {
      if (pkg.shadowGfx) pkg.shadowGfx.destroy();
    }
    this._paused         = false;
    this._pandoraActive  = false;
    this._selectedPackage = null;
    this._packages = [];
    this._firedNotifs.clear();
  }
}
