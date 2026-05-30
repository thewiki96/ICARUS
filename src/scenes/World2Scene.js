/**
 * World2Scene.js
 * Prometheus Inc. Engineering.
 * Ticket queue + logic block puzzle. Same sweet-spot, tighter.
 */
import { Hermes } from '../systems/Hermes.js';
import { Kronos } from '../systems/Kronos.js';
import { Pandora } from '../systems/Pandora.js';
import { RetroHUD } from '../ui/RetroHUD.js';
import { RetroNotification } from '../ui/RetroNotification.js';

const TICKET_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'];
const NODE_TYPES = ['INPUT', 'PROCESS', 'OUTPUT', 'CONDITION'];

const NOTIF_SCHEDULE = {
  33: ['INFO',    'Welcome to Engineering. Your performance metrics carry over.'],
  37: ['SYSTEM',  'Pandora Engineering Module: active. Observing workflow patterns.'],
  40: ['WARNING', 'Automation readiness index: elevated. Maintain standard output.'],
  45: ['INFO',    'Prometheus Inc. quarterly review commences next cycle.'],
  50: ['HR',      'All engineering roles are subject to the standard efficiency protocol.'],
};

export class World2Scene extends Phaser.Scene {
  constructor() {
    super({ key: 'World2Scene' });
    this._paused = false;
    this._nodes = [];
    this._connections = [];
    this._selectedNode = null;
    this._activeTicket = null;
    this._dayTimer = null;
    this._daySeconds = 0;
    this._firedNotifs = new Set();
    this._menuKeyHandler = null;
  }

  // Called by Phaser before every create() — guarantees a clean slate on restart
  init() {
    this._paused = false;
    this._nodes = [];
    this._connections = [];
    this._selectedNode = null;
    this._activeTicket = null;
    this._dayTimer = null;
    this._daySeconds = 0;
    if (this._firedNotifs) {
      this._firedNotifs.clear();
    } else {
      this._firedNotifs = new Set();
    }
    this._menuKeyHandler = null;
  }

  create() {
    const { width, height } = this.scale;
    this._w = width;
    this._h = height;

    // ── Game state (carry over from World 1) ──────────────────────────────
    this._gameState = this.registry.get('gameState') || {
      currentDay: 30,
      efficiency: 50,
      currentWorld: 2,
      totalDaysEmployed: 30
    };
    this._gameState.currentWorld = 2;

    // ── Audio ─────────────────────────────────────────────────────────────
    this._audio = this.registry.get('audio');
    if (this._audio) {
      this._audio.stopAll();
      this._audio.setVolume(1.0);
      this._audio.resume();
      this._audio.playWorld2Melody();
    }

    // ── Background ────────────────────────────────────────────────────────
    this._buildBackground();

    // ── UI panels ─────────────────────────────────────────────────────────
    this._buildTicketQueue();
    this._buildLogicArea();

    // ── HUD ───────────────────────────────────────────────────────────────
    this._hermes  = new Hermes(this, this._gameState);
    this._kronos  = new Kronos(this);
    this._hud     = new RetroHUD(this);
    this._pandora = new Pandora(this, 'ENGINEERING');
    this._notif   = new RetroNotification();

    this._hud.updateDay(this._gameState.currentDay + 1);
    this._hud.updateArgos(this._gameState.efficiency);
    this._hud.hideKronos();

    // ── Wire Hermes ───────────────────────────────────────────────────────
    this._hermes.onEfficiencyChange = (eff) => this._hud.updateArgos(eff);
    this._hermes.onFired    = () => this.scene.start('GameOverScene', { type: 'fired',   day: this._gameState.totalDaysEmployed });
    this._hermes.onPandora  = () => this.scene.start('GameOverScene', { type: 'pandora', day: this._gameState.totalDaysEmployed });
    this._hermes.start();

    // ── Wire Kronos ───────────────────────────────────────────────────────
    this._kronos.onTick = (rem) => {
      this._hud.updateKronos(rem, rem <= 5);
      if (rem <= 5 && this._audio) this._audio.playSFX('kronos_warn');
    };
    this._kronos.onWarning = () => { if (this._audio) this._audio.playSFX('danger'); };
    this._kronos.onExpire = () => {
      this._hud.hideKronos();
      this._hermes.onTaskFailed();   // −15%
      this._activeTicket = null;
      // Show "TIMEOUT" banner first, then clear and advance
      this._flashFeedback('TIMEOUT — TASK FAILED', '#FF2200', null, true);
      this.time.delayedCall(700, () => {
        this._clearLogicArea();
        this.time.delayedCall(300, () => this._startNextTicket());
      });
    };

    // ── Day timer ─────────────────────────────────────────────────────────
    this._dayTimer = this.time.addEvent({
      delay: 1000,
      callback: this._onSecondTick,
      callbackScope: this,
      loop: true
    });

    // ── Input — 200 ms delay absorbs any stray click carried from the
    //   previous scene's button press (e.g. [ START ] in InstructionsScene)
    this.time.delayedCall(200, () => {
      this.input.on('pointerdown', this._onPointerDown, this);
    });

    // ── Menu button ───────────────────────────────────────────────────────
    this._addMenuButton();

    // ── First ticket ──────────────────────────────────────────────────────
    this.time.delayedCall(600, () => this._startNextTicket());
    this._pandora.updateForDay(this._gameState.currentDay);
  }

  // ── Background ────────────────────────────────────────────────────────────

  _buildBackground() {
    const { _w: w, _h: h } = this;
    const gfx = this.add.graphics();

    gfx.fillStyle(0x050510, 1);
    gfx.fillRect(0, 0, w, h);

    const officeBg = this.add.image(w / 2, h, 'office_bg');
    officeBg.setOrigin(0.5, 1);
    const scale = Math.max(w / officeBg.width, h / officeBg.height);
    officeBg.setScale(scale);
    officeBg.setAlpha(0.65);
    this._officeBg = officeBg;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x050510, 0.50);
    overlay.fillRect(0, 0, w, h);

    const scanGfx = this.add.graphics();
    scanGfx.fillStyle(0x000000, 0.06);
    for (let y = 0; y < h; y += 3) scanGfx.fillRect(0, y, w, 1);
  }

  // ── Ticket queue (left sidebar) ────────────────────────────────────────────

  _buildTicketQueue() {
    const { _w: w, _h: h } = this;
    const sideW = 160;
    const sideX = 10;
    const sideY = 50;
    const sideH = h - 110;

    // Panel background
    const bg = this.add.graphics();
    bg.fillStyle(0x000014, 0.88);
    bg.fillRect(sideX, sideY, sideW, sideH);
    bg.lineStyle(2, 0x007788, 1);
    bg.strokeRect(sideX, sideY, sideW, sideH);

    this.add.text(sideX + sideW / 2, sideY + 8, 'TICKET QUEUE', {
      fontFamily: "'Press Start 2P'",
      fontSize: '7px',
      color: '#007788'
    }).setOrigin(0.5, 0);

    // Generate 5 queued tickets
    this._ticketQueue = [];
    this._ticketCards = [];
    for (let i = 0; i < 5; i++) {
      const prio = TICKET_PRIORITIES[Math.floor(Math.random() * 3)];
      const id   = `TKT-${Phaser.Math.Between(1000, 9999)}`;
      this._ticketQueue.push({ priority: prio, id });
    }

    this._renderTicketQueue(sideX, sideY, sideW);
  }

  _renderTicketQueue(sideX, sideY, sideW) {
    this._ticketCards.forEach(c => c.destroy());
    this._ticketCards = [];

    this._ticketQueue.slice(0, 4).forEach((ticket, i) => {
      const cardY = sideY + 30 + i * 62;
      const cardH = 54;
      const colors = { HIGH: '#FFD700', MEDIUM: '#00FFFF', LOW: '#007788' };
      const borderColor = colors[ticket.priority];
      const bcInt = parseInt(borderColor.replace('#', ''), 16);

      const gfx = this.add.graphics();
      gfx.fillStyle(0x00000A, 0.9);
      gfx.fillRect(sideX + 6, cardY, sideW - 12, cardH);
      gfx.lineStyle(2, bcInt, 1);
      gfx.strokeRect(sideX + 6, cardY, sideW - 12, cardH);

      const pTag = this.add.text(sideX + sideW / 2, cardY + 8, `[${ticket.priority}]`, {
        fontFamily: "'Press Start 2P'",
        fontSize: '7px',
        color: borderColor
      }).setOrigin(0.5, 0);

      const idTag = this.add.text(sideX + sideW / 2, cardY + 26, ticket.id, {
        fontFamily: "'Press Start 2P'",
        fontSize: '6px',
        color: '#007788'
      }).setOrigin(0.5, 0);

      const active = i === 0 && this._activeTicket === null;
      if (active) {
        const alabel = this.add.text(sideX + sideW / 2, cardY + 40, '► ACTIVE', {
          fontFamily: "'Press Start 2P'",
          fontSize: '6px',
          color: '#00FFFF'
        }).setOrigin(0.5, 0);
        this._ticketCards.push(alabel);
      }

      this._ticketCards.push(gfx, pTag, idTag);
    });
  }

  // ── Logic block area ────────────────────────────────────────────────────────

  _buildLogicArea() {
    const { _w: w, _h: h } = this;
    const areaX = 185;
    const areaW = w - areaX - 10;
    const areaY = 50;
    const areaH = h - 110;

    const bg = this.add.graphics();
    bg.fillStyle(0x00000A, 0.85);
    bg.fillRect(areaX, areaY, areaW, areaH);
    bg.lineStyle(2, 0x007788, 1);
    bg.strokeRect(areaX, areaY, areaW, areaH);

    this.add.text(areaX + areaW / 2, areaY + 8, 'LOGIC EDITOR', {
      fontFamily: "'Press Start 2P'",
      fontSize: '7px',
      color: '#007788'
    }).setOrigin(0.5, 0);

    this._logicAreaX = areaX;
    this._logicAreaY = areaY;
    this._logicAreaW = areaW;
    this._logicAreaH = areaH;

    this._nodeGfx = this.add.graphics();
    this._connGfx = this.add.graphics();
    this._nodeLabels = [];
    this._submitBtn = null;
  }

  _startNextTicket() {
    if (this._paused) return;

    if (this._ticketQueue.length === 0) {
      // Refill
      for (let i = 0; i < 5; i++) {
        const prio = TICKET_PRIORITIES[Math.floor(Math.random() * 3)];
        this._ticketQueue.push({ priority: prio, id: `TKT-${Phaser.Math.Between(1000, 9999)}` });
      }
    }

    this._activeTicket = this._ticketQueue.shift();
    this._renderTicketQueue(10, 50, 160);
    this._spawnLogicNodes();

    const prioTimes = { HIGH: 25, MEDIUM: 35, LOW: 45 };
    const timeLimit = prioTimes[this._activeTicket.priority];
    this._kronos.start(timeLimit);
    this._hud.updateKronos(timeLimit, false);
  }

  _spawnLogicNodes() {
    this._clearLogicArea();

    const ax = this._logicAreaX;
    const ay = this._logicAreaY;
    const aw = this._logicAreaW;
    const ah = this._logicAreaH;

    const nodeW = 80;
    const nodeH = 36;

    // Place nodes in a grid within the area
    const positions = [
      { x: ax + aw * 0.15, y: ay + ah * 0.25 },
      { x: ax + aw * 0.50, y: ay + ah * 0.20 },
      { x: ax + aw * 0.50, y: ay + ah * 0.60 },
      { x: ax + aw * 0.82, y: ay + ah * 0.42 },
    ];

    this._nodes = NODE_TYPES.map((type, i) => ({
      type,
      x: positions[i].x,
      y: positions[i].y,
      w: nodeW,
      h: nodeH,
      connected: false
    }));

    this._connections = [];
    this._selectedNode = null;

    this._drawNodes();
    this._drawConnections();

    // Submit button
    if (this._submitBtn) this._submitBtn.destroy();
    this._submitBtn = this.add.text(
      ax + aw / 2,
      ay + ah - 20,
      '[ SUBMIT SOLUTION ]',
      { fontFamily: "'Press Start 2P'", fontSize: '8px', color: '#00FFFF' }
    ).setOrigin(0.5, 1).setInteractive({ useHandCursor: true });

    this._submitBtn.on('pointerdown', () => this._submitSolution());
  }

  _drawNodes() {
    const g = this._nodeGfx;
    g.clear();
    this._nodeLabels.forEach(l => l.destroy());
    this._nodeLabels = [];

    this._nodes.forEach((node, i) => {
      const isSelected = this._selectedNode === i;
      const isConnected = node.connected;

      g.fillStyle(isSelected ? 0x0A0A00 : (isConnected ? 0x001A00 : 0x00000F), 0.95);
      g.fillRect(node.x - node.w / 2, node.y - node.h / 2, node.w, node.h);

      const borderHex = isSelected ? 0xFFD700 : (isConnected ? 0x00FF66 : 0x007788);
      g.lineStyle(2, borderHex, 1);
      g.strokeRect(node.x - node.w / 2, node.y - node.h / 2, node.w, node.h);

      const label = this.add.text(node.x, node.y, node.type, {
        fontFamily: "'Press Start 2P'",
        fontSize: '7px',
        color: isSelected ? '#FFD700' : (isConnected ? '#00FF66' : '#00FFFF')
      }).setOrigin(0.5);
      this._nodeLabels.push(label);
    });
  }

  _drawConnections() {
    const g = this._connGfx;
    g.clear();
    g.lineStyle(2, 0x00FFFF, 0.7);

    this._connections.forEach(conn => {
      const a = this._nodes[conn.from];
      const b = this._nodes[conn.to];
      g.beginPath();
      g.moveTo(a.x, a.y);
      // Simple bezier for visual interest
      const midX = (a.x + b.x) / 2;
      g.lineTo(midX, a.y);
      g.lineTo(midX, b.y);
      g.lineTo(b.x, b.y);
      g.strokePath();

      // Arrow head
      g.fillStyle(0x00FFFF, 0.8);
      g.fillTriangle(
        b.x, b.y,
        b.x - 8, b.y - 5,
        b.x - 8, b.y + 5
      );
    });
  }

  _clearLogicArea() {
    this._nodeGfx.clear();
    this._connGfx.clear();
    this._nodeLabels.forEach(l => l.destroy());
    this._nodeLabels = [];
    this._nodes = [];
    this._connections = [];
    this._selectedNode = null;
    if (this._submitBtn) {
      this._submitBtn.destroy();
      this._submitBtn = null;
    }
  }

  _onPointerDown(pointer) {
    if (this._paused) return;

    const px = pointer.x;
    const py = pointer.y;

    // Check node hits
    for (let i = 0; i < this._nodes.length; i++) {
      const n = this._nodes[i];
      if (px >= n.x - n.w / 2 && px <= n.x + n.w / 2 &&
          py >= n.y - n.h / 2 && py <= n.y + n.h / 2) {

        if (this._selectedNode === null) {
          this._selectedNode = i;
        } else if (this._selectedNode !== i) {
          // Create connection if not already exists
          const exists = this._connections.some(
            c => (c.from === this._selectedNode && c.to === i) ||
                 (c.from === i && c.to === this._selectedNode)
          );
          if (!exists) {
            this._connections.push({ from: this._selectedNode, to: i });
            this._nodes[this._selectedNode].connected = true;
            this._nodes[i].connected = true;
            if (this._audio) this._audio.playSFX('correct');
          }
          this._selectedNode = null;
        } else {
          this._selectedNode = null;
        }

        this._drawNodes();
        this._drawConnections();
        return;
      }
    }

    // Click on empty area deselects
    this._selectedNode = null;
    this._drawNodes();
  }

  _submitSolution() {
    if (this._paused) return;
    if (!this._activeTicket) return;

    const result = this._validateSolution();
    this._kronos.stop();
    this._hud.hideKronos();

    // ── Apply efficiency change + visual feedback ─────────────────────────
    switch (result.grade) {
      case 'incomplete':
        this._hermes.onTaskIncomplete();   // −10%
        this._flashFeedback('INCOMPLETE CIRCUIT', '#FFD700', result.disconnected, true);
        if (this._audio) this._audio.playSFX('danger');
        break;

      case 'wrong':
        this._hermes.onTaskWrong();        // −15%
        this._flashFeedback('WRONG SOLUTION', '#FF2200', null, true);
        if (this._audio) this._audio.playSFX('danger');
        break;

      case 'elegant':
        this._hermes.onTaskFast();         // +8% — elegant = minimum connections
        this._flashFeedback('ELEGANT SOLUTION', '#00FF66', null, false);
        if (this._audio) this._audio.playSFX('correct');
        break;

      case 'acceptable':
        this._hermes.onTaskAcceptable();   // +3%
        this._flashFeedback('SOLUTION ACCEPTED', '#00FFFF', null, false);
        if (this._audio) this._audio.playSFX('correct');
        break;

      case 'messy':
        this._hermes.onTaskMessy();        // −2%
        this._flashFeedback('OVER-ENGINEERED', '#FF7700', null, false);
        if (this._audio) this._audio.playSFX('correct');
        break;
    }

    this._activeTicket = null;

    // Longer pause on errors so the player can read the feedback
    const feedbackMs = (result.grade === 'wrong' || result.grade === 'incomplete') ? 900 : 500;
    this.time.delayedCall(feedbackMs, () => {
      this._clearLogicArea();
      this.time.delayedCall(300, () => this._startNextTicket());
    });
  }

  /**
   * Grades the current connection graph.
   *
   * Rules (4 nodes: INPUT=0  PROCESS=1  OUTPUT=2  CONDITION=3):
   *   incomplete — any node has zero connections
   *   wrong      — all nodes touched, but no path exists from INPUT(0) → OUTPUT(2)
   *   elegant    — valid path, ≤ 3 connections  (+8%)
   *   acceptable — valid path,  = 4 connections (+3%)
   *   messy      — valid path, ≥ 5 connections  (−2%)
   *
   * Returns { grade: string, disconnected: bool[] }
   */
  _validateSolution() {
    const n   = this._nodes.length;   // always 4
    const con = this._connections;

    // ── Which nodes appear in at least one connection? ────────────────────
    const touched = new Array(n).fill(false);
    con.forEach(c => { touched[c.from] = true; touched[c.to] = true; });
    const disconnected = touched.map(t => !t);

    // ── INCOMPLETE: any node is completely isolated ───────────────────────
    if (disconnected.some(d => d)) {
      return { grade: 'incomplete', disconnected };
    }

    // ── Build adjacency list (undirected) ─────────────────────────────────
    const adj = Array.from({ length: n }, () => []);
    con.forEach(c => { adj[c.from].push(c.to); adj[c.to].push(c.from); });

    // ── BFS from INPUT(0) — check whether OUTPUT(2) is reachable ─────────
    const visited = new Set([0]);
    const queue   = [0];
    while (queue.length > 0) {
      const cur = queue.shift();
      for (const nb of adj[cur]) {
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
      }
    }

    // ── WRONG: OUTPUT not reachable from INPUT ────────────────────────────
    if (!visited.has(2)) {
      return { grade: 'wrong', disconnected: [] };
    }

    // ── CORRECT: grade by connection count ───────────────────────────────
    const count = con.length;
    if (count <= 3)  return { grade: 'elegant',    disconnected: [] };
    if (count === 4) return { grade: 'acceptable', disconnected: [] };
    return           { grade: 'messy',      disconnected: [] };
  }

  /**
   * Overlays the logic area with a coloured tint + feedback message.
   * @param {string}   message          — text to display
   * @param {string}   colorHex         — e.g. '#FF2200'
   * @param {bool[]}   disconnectedNodes — highlight isolated nodes in red (or null)
   * @param {boolean}  isError          — controls overlay duration (longer for errors)
   */
  _flashFeedback(message, colorHex, disconnectedNodes, isError) {
    const ax       = this._logicAreaX;
    const ay       = this._logicAreaY;
    const aw       = this._logicAreaW;
    const ah       = this._logicAreaH;
    const colorInt = parseInt(colorHex.replace('#', ''), 16);
    const dur      = isError ? 650 : 420;

    // Tinted area overlay
    const overlay = this.add.graphics().setDepth(55);
    overlay.fillStyle(colorInt, 0.18);
    overlay.fillRect(ax, ay, aw, ah);
    overlay.lineStyle(2, colorInt, 0.70);
    overlay.strokeRect(ax, ay, aw, ah);

    // Red pulse outline on each isolated node (incomplete case)
    if (disconnectedNodes) {
      this._nodes.forEach((node, i) => {
        if (disconnectedNodes[i]) {
          overlay.lineStyle(3, 0xFF2200, 1);
          overlay.strokeRect(
            node.x - node.w / 2 - 3,
            node.y - node.h / 2 - 3,
            node.w + 6,
            node.h + 6
          );
        }
      });
    }

    const txt = this.add.text(ax + aw / 2, ay + ah / 2, message, {
      fontFamily: "'Press Start 2P'",
      fontSize:   '12px',
      color:      colorHex
    }).setOrigin(0.5).setDepth(56);

    // Auto-remove after feedback duration (guard against post-transition destroy)
    this.time.delayedCall(dur, () => {
      if (overlay.scene) overlay.destroy();
      if (txt.scene)     txt.destroy();
    });
  }

  // ── Day tick ──────────────────────────────────────────────────────────────

  _onSecondTick() {
    if (this._paused) return;
    this._daySeconds++;

    if (this._daySeconds >= 30) {
      this._daySeconds = 0;
      this._advanceDay();
    }
  }

  _advanceDay() {
    this._gameState.currentDay++;
    this._gameState.totalDaysEmployed++;
    this._hud.updateDay(this._gameState.currentDay + 1);
    if (this._audio) this._audio.playSFX('dayup');

    this._pandora.updateForDay(this._gameState.currentDay);

    if (this._gameState.currentDay % 5 === 0) {
      this._hermes.narrowSweetSpot();
    }

    const notif = NOTIF_SCHEDULE[this._gameState.currentDay];
    if (notif && !this._firedNotifs.has(this._gameState.currentDay)) {
      this._firedNotifs.add(this._gameState.currentDay);
      this._notif.show(notif[0], notif[1]);
      if (this._audio) this._audio.playSFX('notify');
    }
  }

  // ── Menu button ───────────────────────────────────────────────────────────

  _addMenuButton() {
    const { _w: w } = this;
    const btnW = 90;
    const btnX = w / 2 - btnW / 2;

    const bg = this.add.graphics().setDepth(100);
    bg.fillStyle(0x000014, 0.88);
    bg.fillRect(btnX, 4, btnW, 28);
    bg.lineStyle(2, 0x007788, 1);
    bg.strokeRect(btnX, 4, btnW, 28);

    const btn = this.add.text(w / 2, 18, '[ MENU ]', {
      fontFamily: "'Press Start 2P'",
      fontSize: '8px',
      color: '#007788'
    }).setOrigin(0.5).setDepth(101).setInteractive({ useHandCursor: true });

    btn.on('pointerover',  () => btn.setColor('#00FFFF'));
    btn.on('pointerout',   () => btn.setColor('#007788'));
    btn.on('pointerdown',  () => this._goToMenu());

    this._menuKeyHandler = (e) => { if (e.keyCode === 27) this._goToMenu(); };
    window.addEventListener('keydown', this._menuKeyHandler);
  }

  _goToMenu() {
    if (this._paused) return;
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

  update() {
    if (!this._paused && this._officeBg) {
      this._officeBg.x = this._w / 2 + (this.cameras.main.scrollX * 0.3);
    }
  }

  shutdown() {
    this._hermes.stop();
    this._kronos.stop();
    if (this._dayTimer) this._dayTimer.remove(false);
    this._notif.clearAll();
    this._clearLogicArea();
    if (this._menuKeyHandler) {
      window.removeEventListener('keydown', this._menuKeyHandler);
      this._menuKeyHandler = null;
    }
    this._paused = false;
    this._firedNotifs.clear();
  }
}
