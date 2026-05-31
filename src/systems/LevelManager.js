export class LevelManager {
  constructor() {
    this.currentLevel = 1;

    this.levels = {
      1: {
        id: 1,
        name: 'INTAKE PROCESSING',
        startDay: 0,                // currentDay when this level begins
        shapes: ['square'],
        conflictMode: false,
        pandoraActive: false,
        conveyorSpeed: 40,
        maxBoxes: 1,
        slotsPerCategory: 1,        // one slot per category, no ID needed
        availableTags: ['STANDARD', 'PRIORITY', 'FRAGILE'],
        showSlotId: false,
        weightSystem: false,
        somaSystem:   false
      },
      2: {
        id: 2,
        name: 'MIXED FULFILLMENT',
        startDay: 2,                // TEMP: 2-day testing schedule
        shapes: ['square', 'wide', 'tall', 'small'],
        conflictMode: false,
        pandoraActive: false,
        conveyorSpeed: 60,
        maxBoxes: 2,
        slotsPerCategory: 2,
        availableTags: ['STANDARD', 'PRIORITY', 'FRAGILE'],
        showSlotId: true,
        weightSystem: true,
        somaSystem:   false
      },
      3: {
        id: 3,
        name: 'HIGH VOLUME',
        startDay: 4,                // TEMP: 2-day testing schedule
        shapes: ['square', 'wide', 'tall', 'small'],
        conflictMode: true,         // Stroop effect — color and text conflict
        pandoraActive: false,
        conveyorSpeed: 80,
        maxBoxes: 2,
        slotsPerCategory: 2,
        availableTags: ['STANDARD', 'PRIORITY', 'FRAGILE', 'URGENT'],
        showSlotId: true,
        weightSystem: true,
        somaSystem:   true
      },
      4: {
        id: 4,
        name: 'AUTOMATED INTEGRATION',
        startDay: 6,                // TEMP: 2-day testing schedule
        shapes: ['square', 'wide', 'tall', 'small'],
        conflictMode: true,
        pandoraActive: true,        // Pandora robotic arm active
        conveyorSpeed: 100,
        maxBoxes: 3,
        slotsPerCategory: 2,
        availableTags: ['STANDARD', 'PRIORITY', 'FRAGILE', 'URGENT'],
        showSlotId: true,
        weightSystem: true,
        somaSystem:   true
      }
    };
  }

  getLevel(id) { return this.levels[id]; }
  getCurrentLevel() { return this.levels[this.currentLevel]; }

  // Call this every 10 in-game days
  advance() {
    if (this.currentLevel < 4) {
      this.currentLevel++;
      return this.levels[this.currentLevel];
    }
    return null;
  }
}
