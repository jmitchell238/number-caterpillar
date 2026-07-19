'use strict';

// Number Caterpillar — Keep CACHE in sw.js in sync: 'number-caterpillar-' + GAME_VERSION
const GAME_VERSION = '1.0.001';
const GAME_VERSION_LABEL = 'v' + GAME_VERSION;
const GAME_NAME = 'Number Caterpillar';

const W = 390;
const H = 700;
const SAVE_KEY = 'number-caterpillar-save-v1';

/**
 * Modes: chain length (max number) + how many rounds before win screen.
 * Free = endless rounds (rounds: 0).
 */
const MODES = {
  free: { id: 'free', name: 'Free Play', tagline: '1–5 · forever', maxN: 5, rounds: 0 },
  easy: { id: 'easy', name: 'Easy',      tagline: '1–5 · short',   maxN: 5, rounds: 3 },
  more: { id: 'more', name: 'A Little More', tagline: '1–8',       maxN: 8, rounds: 4 },
  pro:  { id: 'pro',  name: 'Challenge', tagline: '1–10',         maxN: 10, rounds: 5 },
};
const MODE_ORDER = ['free', 'easy', 'more', 'pro'];

/** Soft hint after this many idle seconds */
const HINT_AFTER = 5;

const PRAISE = ['Yay!', 'Yes!', 'Nice!', 'Wow!', 'Go!', 'Grow!', 'Good!', 'Super!'];

/** Segment / bubble colors by number 1–10 (1-indexed via array index) */
const NUM_COLORS = [
  null,
  { fill: '#EF5350', stroke: '#C62828' }, // 1 red
  { fill: '#FFA726', stroke: '#EF6C00' }, // 2 orange
  { fill: '#FFEE58', stroke: '#F9A825' }, // 3 yellow
  { fill: '#66BB6A', stroke: '#2E7D32' }, // 4 green
  { fill: '#26C6DA', stroke: '#00838F' }, // 5 cyan
  { fill: '#42A5F5', stroke: '#1565C0' }, // 6 blue
  { fill: '#7E57C2', stroke: '#4527A0' }, // 7 purple
  { fill: '#EC407A', stroke: '#AD1457' }, // 8 pink
  { fill: '#AB47BC', stroke: '#6A1B9A' }, // 9 violet
  { fill: '#8D6E63', stroke: '#4E342E' }, // 10 brown
];

/** Caterpillar layout anchors (canvas space) */
const CATERPILLAR = {
  headX: W / 2,
  headY: H - 168,
  segR: 22,
  segGap: 40,
  headR: 28,
};

/** Number bubble radius by count */
function bubbleRadius(count) {
  if (count >= 9) return 28;
  if (count >= 6) return 32;
  return 36;
}
