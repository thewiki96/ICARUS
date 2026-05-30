/**
 * main.js
 * Entry point — Phaser 3 game config + global GameState.
 */
import { BootScene }          from './scenes/BootScene.js';
import { IntroScene }         from './scenes/IntroScene.js';
import { InstructionsScene }  from './scenes/InstructionsScene.js';
import { WorldSelectScene }   from './scenes/WorldSelectScene.js';
import { World1Scene }        from './scenes/World1Scene.js';
import { World2Scene }        from './scenes/World2Scene.js';
import { GameOverScene }      from './scenes/GameOverScene.js';

// ── Global Game State (shared via Phaser registry) ────────────────────────────
// Initialized fresh on each run; reset on GameOverScene restart.
const initialGameState = () => ({
  currentDay:        0,
  efficiency:        50,   // starts at midpoint of the sweet spot
  currentWorld:      1,
  totalDaysEmployed: 0,
  pandoraStatus:     'OBSERVING'
});

// ── Phaser Config ─────────────────────────────────────────────────────────────
const config = {
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  backgroundColor: '#050510',
  parent: 'game-container',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [
    BootScene,
    IntroScene,
    InstructionsScene,
    WorldSelectScene,
    World1Scene,
    World2Scene,
    GameOverScene
  ]
};

const game = new Phaser.Game(config);

// Push initial state into registry after game is ready
game.events.once('ready', () => {
  game.registry.set('gameState', initialGameState());
});

// Reset state whenever IntroScene starts (fresh game)
game.events.on('step', () => {
  // Listen for scene transitions to reset game state on restart
});

// Expose for debugging (non-production builds)
window.__ICARUS__ = { game, initialGameState };
