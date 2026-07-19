'use strict';

/** @type {'menu'|'play'|'win'} */
let state = 'menu';

let modeId = 'easy';
/** Next number the player must tap (1..maxN) */
let expected = 1;
/** Max number in current chain */
let maxN = 5;
/** Completed rounds this session (for win screen modes) */
let round = 0;
let roundsTarget = 0;
/** Correct taps this session */
let sessionTaps = 0;
/** Completed chains this session */
let sessionChains = 0;

/** @type {{ n: number, x: number, y: number, r: number, collected: boolean, bounce: number, wiggle: number, shake: number }[]} */
let bubbles = [];
/** Collected numbers in order (body segments behind head) */
let segments = [];

let hintTimer = 0;
let skyPhase = 0;
let bob = 0;
let winFlash = 0;
/** Butterfly celebration timer (seconds remaining); 0 = normal caterpillar */
let butterflyT = 0;
let wrongGlowN = 0; // which number to glow as hint, 0 = none
let celebrateLock = false;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function currentMode() {
  return MODES[modeId] || MODES.easy;
}

function colorOf(n) {
  return NUM_COLORS[n] || NUM_COLORS[1];
}

/**
 * Pure: sequence of integers 1..max inclusive.
 * @param {number} max
 * @returns {number[]}
 */
function makeSequence(max) {
  const m = Math.max(1, Math.min(10, max | 0));
  const out = [];
  for (let i = 1; i <= m; i++) out.push(i);
  return out;
}

/**
 * Pure: next expected after collecting `collected` numbers in order.
 * Returns max+1 when complete (chain done).
 * @param {number[]} collected - sorted ascending 1,2,3...
 * @param {number} max
 */
function nextExpected(collected, max) {
  if (!collected || !collected.length) return 1;
  let expect = 1;
  for (const n of collected) {
    if (n === expect) expect++;
    else break;
  }
  return expect;
}

/**
 * Pure: can this number be tapped given expected value?
 * @param {number} n
 * @param {number} expectedN
 * @param {boolean} alreadyCollected
 */
function canTap(n, expectedN, alreadyCollected) {
  if (alreadyCollected) return false;
  if (n == null || expectedN == null) return false;
  return n === expectedN;
}

/**
 * Pure: is the chain complete?
 * @param {number[]} collected
 * @param {number} max
 */
function isChainComplete(collected, max) {
  if (!collected || collected.length !== max) return false;
  for (let i = 0; i < max; i++) {
    if (collected[i] !== i + 1) return false;
  }
  return true;
}

/**
 * Fisher–Yates with optional rng (for tests).
 * @param {any[]} arr
 * @param {() => number} [rng]
 */
function shuffleWith(arr, rng) {
  const a = arr.slice();
  const r = rng || Math.random;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pure bubble layout in a playfield rectangle, avoiding caterpillar zone.
 * Deterministic if rng provided; otherwise Math.random.
 * @param {number[]} numbers
 * @param {{ w?: number, h?: number, top?: number, bottom?: number, pad?: number, rng?: () => number }} [opts]
 */
function layoutBubbles(numbers, opts = {}) {
  const width = opts.w ?? W;
  const top = opts.top ?? 90;
  const bottom = opts.bottom ?? H - 220;
  const pad = opts.pad ?? 28;
  const rng = opts.rng || Math.random;
  const r = bubbleRadius(numbers.length);
  const placed = [];

  // Grid candidates for even scatter
  const cols = numbers.length <= 5 ? 3 : (numbers.length <= 8 ? 3 : 4);
  const rows = Math.ceil(numbers.length / cols);
  const cellW = (width - pad * 2) / cols;
  const cellH = (bottom - top) / rows;

  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({ row, col });
    }
  }
  // Shuffle cells with same rng
  const shuffledCells = shuffleWith(cells, rng);

  const nums = shuffleWith(numbers, rng);

  for (let i = 0; i < nums.length; i++) {
    const cell = shuffledCells[i % shuffledCells.length];
    const jitterX = (rng() - 0.5) * cellW * 0.35;
    const jitterY = (rng() - 0.5) * cellH * 0.35;
    const x = pad + cell.col * cellW + cellW / 2 + jitterX;
    const y = top + cell.row * cellH + cellH / 2 + jitterY;
    // Clamp inside playfield
    const cx = Math.max(pad + r, Math.min(width - pad - r, x));
    const cy = Math.max(top + r, Math.min(bottom - r, y));
    placed.push({
      n: nums[i],
      x: cx,
      y: cy,
      r,
      collected: false,
      bounce: 0,
      wiggle: rng() * Math.PI * 2,
      shake: 0,
    });
  }

  // Resolve overlaps (simple push)
  for (let pass = 0; pass < 8; pass++) {
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const minD = a.r + b.r + 8;
        if (dist < minD) {
          const push = (minD - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          a.x = Math.max(pad + a.r, Math.min(width - pad - a.r, a.x));
          a.y = Math.max(top + a.r, Math.min(bottom - a.r, a.y));
          b.x = Math.max(pad + b.r, Math.min(width - pad - b.r, b.x));
          b.y = Math.max(top + b.r, Math.min(bottom - b.r, b.y));
        }
      }
    }
  }

  return placed;
}

/**
 * Pure caterpillar segment positions: head fixed, body grows left-right arc upward.
 * Segment 0 = first collected (closest to head), last = farthest.
 * @param {number[]} collectedNums - in order collected (1,2,3...)
 * @param {{ headX?: number, headY?: number, segGap?: number }} [opts]
 */
function layoutCaterpillar(collectedNums, opts = {}) {
  const headX = opts.headX ?? CATERPILLAR.headX;
  const headY = opts.headY ?? CATERPILLAR.headY;
  const gap = opts.segGap ?? CATERPILLAR.segGap;
  const segs = [];
  // Body trails leftward then curves — kid-friendly horizontal crawl
  for (let i = 0; i < collectedNums.length; i++) {
    // i=0 is nearest head (just behind), grows to the left
    const t = i + 1;
    const x = headX - t * gap;
    const y = headY + Math.sin(t * 0.55) * 10;
    segs.push({
      n: collectedNums[i],
      x,
      y,
      r: CATERPILLAR.segR,
    });
  }
  return {
    head: { x: headX, y: headY, r: CATERPILLAR.headR },
    segments: segs,
  };
}

function enterMenu() {
  state = 'menu';
  celebrateLock = false;
  clearParticles();
}

function layoutRound() {
  const m = currentMode();
  maxN = m.maxN;
  expected = 1;
  segments = [];
  bubbles = layoutBubbles(makeSequence(maxN));
  hintTimer = 0;
  wrongGlowN = 0;
  butterflyT = 0;
  celebrateLock = false;
}

function enterPlay(forceMode) {
  state = 'play';
  modeId = forceMode || save.mode || 'easy';
  const m = currentMode();
  roundsTarget = m.rounds | 0;
  round = 0;
  sessionTaps = 0;
  sessionChains = 0;
  winFlash = 0;
  clearParticles();
  layoutRound();
}

function enterWin() {
  state = 'win';
  winFlash = 1.5;
  sfxWin();
  spawnBurst(W / 2, H * 0.35, '#FFD56A', 28);
  spawnBurst(W / 2, H * 0.35, '#66BB6A', 18);
  spawnPraise(W / 2, H * 0.25, 'Butterfly!');
  recordChain();
}

/**
 * Hit-test bubbles (front-most = last in array that contains point).
 * @returns {object|null}
 */
function hitBubble(x, y) {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    if (b.collected) continue;
    const dx = x - b.x;
    const dy = y - b.y;
    if (dx * dx + dy * dy <= (b.r * 1.15) ** 2) return b;
  }
  return null;
}

/**
 * Apply a tap result without side-effecting audio (for tests use handleTap).
 * Mutates bubbles/segments/expected.
 * @returns {'correct'|'wrong'|'miss'|'locked'|'complete'}
 */
function applyTapAt(x, y) {
  if (state !== 'play' || celebrateLock) return 'locked';
  const b = hitBubble(x, y);
  if (!b) return 'miss';

  if (!canTap(b.n, expected, b.collected)) {
    b.shake = 0.35;
    b.bounce = 0.25;
    wrongGlowN = expected;
    hintTimer = 0;
    return 'wrong';
  }

  // Correct
  b.collected = true;
  b.bounce = 0.4;
  segments.push(b.n);
  expected = nextExpected(segments, maxN);
  sessionTaps++;
  hintTimer = 0;
  wrongGlowN = 0;

  if (isChainComplete(segments, maxN)) {
    return 'complete';
  }
  return 'correct';
}

function handleTap(x, y) {
  const result = applyTapAt(x, y);
  if (result === 'locked' || result === 'miss') return result;

  if (result === 'wrong') {
    sfxWrong();
    const correct = bubbles.find(p => p.n === expected && !p.collected);
    if (correct) {
      spawnPraise(correct.x, correct.y - 40, 'Try ' + expected + '!');
    }
    return result;
  }

  // correct or complete
  sfxCorrect(segments[segments.length - 1]);
  sfxGrow();
  speakNumber(segments[segments.length - 1]);
  recordTap();
  const last = bubbles.find(p => p.n === segments[segments.length - 1]);
  const col = colorOf(segments[segments.length - 1]);
  if (last) {
    spawnBurst(last.x, last.y, col.fill, 12);
    spawnPraise(last.x, last.y - 36);
  }

  if (result === 'complete') {
    onChainComplete();
  }
  return result;
}

function onChainComplete() {
  if (celebrateLock) return;
  celebrateLock = true;
  sessionChains++;
  recordChain();
  sfxButterfly();
  butterflyT = save.reducedMotion ? 0.9 : 1.6;
  spawnBurst(CATERPILLAR.headX, CATERPILLAR.headY - 40, '#FFEE58', 24);
  spawnBurst(CATERPILLAR.headX, CATERPILLAR.headY - 60, '#EC407A', 16);
  spawnPraise(W / 2, 140, 'Butterfly!');

  const m = currentMode();
  const delay = save.reducedMotion ? 700 : 1400;
  setTimeout(() => {
    if (state !== 'play') return;
    butterflyT = 0;
    if (!m.rounds) {
      // free: next endless round
      spawnPraise(W / 2, 160, 'Again!');
      layoutRound();
      return;
    }
    round++;
    if (round >= roundsTarget) {
      enterWin();
    } else {
      spawnPraise(W / 2, 120, 'Round ' + (round + 1) + '!');
      layoutRound();
    }
  }, delay);
}

function updatePlay(dt) {
  skyPhase += dt;
  bob += dt * 3;
  if (!celebrateLock) hintTimer += dt;
  if (butterflyT > 0) butterflyT = Math.max(0, butterflyT - dt);

  for (const b of bubbles) {
    if (b.bounce > 0) b.bounce = Math.max(0, b.bounce - dt);
    if (b.shake > 0) b.shake = Math.max(0, b.shake - dt);
    b.wiggle += dt * 2;
  }

  // Auto-hint glow
  if (hintTimer > HINT_AFTER && !celebrateLock && expected <= maxN) {
    wrongGlowN = expected;
  }

  updateParticles(dt);
}

function updateWin(dt) {
  winFlash = Math.max(0, winFlash - dt);
  skyPhase += dt;
  bob += dt * 2;
  updateParticles(dt);
}

// ---- Drawing ----

function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawBg(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#81D4FA');
  g.addColorStop(0.45, '#C8E6C9');
  g.addColorStop(1, '#81C784');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Soft clouds
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const [cx, cy, s] of [[50, 60, 1], [180, 40, 0.85], [310, 70, 1.05]]) {
    const ox = Math.sin(skyPhase * 0.35 + cx) * 5;
    ctx.beginPath();
    ctx.arc(cx + ox, cy, 16 * s, 0, Math.PI * 2);
    ctx.arc(cx + 20 * s + ox, cy + 3, 13 * s, 0, Math.PI * 2);
    ctx.arc(cx - 16 * s + ox, cy + 5, 11 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ground strip
  ctx.fillStyle = '#66BB6A';
  ctx.fillRect(0, H - 120, W, 120);
  ctx.fillStyle = '#558B2F';
  for (let x = 0; x < W; x += 18) {
    ctx.fillRect(x, H - 120, 10, 6);
  }
}

function drawBubble(ctx, b, opts = {}) {
  if (b.collected && !opts.force) return;
  const col = colorOf(b.n);
  const shakeX = b.shake > 0 ? Math.sin(b.shake * 40) * 5 : 0;
  const bounce = b.bounce > 0 ? Math.sin((1 - b.bounce / 0.4) * Math.PI) * 0.12 : 0;
  const floatY = Math.sin(b.wiggle) * 2.5;
  const x = b.x + shakeX;
  const y = b.y + floatY;
  const scale = (opts.scale || 1) * (1 + bounce);
  const r = b.r * scale;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + r * 0.85, r * 0.7, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Glow for expected / hint
  if (wrongGlowN === b.n || opts.glow) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(skyPhase * 5);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, r + 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Body
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = col.fill;
  ctx.fill();
  ctx.strokeStyle = col.stroke;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Shine
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(x - r * 0.28, y - r * 0.3, r * 0.28, r * 0.18, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Number
  ctx.font = 'bold ' + Math.round(r * 0.95) + 'px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.strokeText(String(b.n), x, y + 1);
  ctx.fillStyle = '#fff';
  ctx.fillText(String(b.n), x, y + 1);
}

function drawCaterpillar(ctx) {
  const laid = layoutCaterpillar(segments);
  const headBob = Math.sin(bob) * 3;

  if (butterflyT > 0) {
    drawButterfly(ctx, laid.head.x, laid.head.y - 50 - (1.6 - butterflyT) * 40, butterflyT);
    return;
  }

  // Segments (far to near so head is on top of joints)
  for (let i = laid.segments.length - 1; i >= 0; i--) {
    const s = laid.segments[i];
    const col = colorOf(s.n);
    const y = s.y + Math.sin(bob + i * 0.6) * 2;
    ctx.beginPath();
    ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = col.fill;
    ctx.fill();
    ctx.strokeStyle = col.stroke;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Tiny number badge
    ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(s.n), s.x, y);
  }

  // Head
  const hx = laid.head.x;
  const hy = laid.head.y + headBob;
  const hr = laid.head.r;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.fillStyle = '#7CB342';
  ctx.fill();
  ctx.strokeStyle = '#33691E';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(hx - 9, hy - 4, 7, 0, Math.PI * 2);
  ctx.arc(hx + 9, hy - 4, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1B1B1B';
  ctx.beginPath();
  ctx.arc(hx - 7, hy - 3, 3.2, 0, Math.PI * 2);
  ctx.arc(hx + 11, hy - 3, 3.2, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = '#33691E';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hx, hy + 6, 10, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  // Antennae
  ctx.strokeStyle = '#558B2F';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(hx - 8, hy - hr + 4);
  ctx.quadraticCurveTo(hx - 18, hy - hr - 16, hx - 12, hy - hr - 22);
  ctx.moveTo(hx + 8, hy - hr + 4);
  ctx.quadraticCurveTo(hx + 18, hy - hr - 16, hx + 12, hy - hr - 22);
  ctx.stroke();
  ctx.fillStyle = '#EF5350';
  ctx.beginPath();
  ctx.arc(hx - 12, hy - hr - 22, 4, 0, Math.PI * 2);
  ctx.arc(hx + 12, hy - hr - 22, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawButterfly(ctx, x, y, t) {
  const flap = Math.sin(t * 14) * 0.35;
  ctx.save();
  ctx.translate(x, y);

  // Wings
  ctx.fillStyle = '#EC407A';
  ctx.beginPath();
  ctx.ellipse(-18, -4, 22, 16 + flap * 8, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#AB47BC';
  ctx.beginPath();
  ctx.ellipse(18, -4, 22, 16 + flap * 8, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFEE58';
  ctx.beginPath();
  ctx.ellipse(-14, 10, 14, 10 + flap * 4, -0.2, 0, Math.PI * 2);
  ctx.ellipse(14, 10, 14, 10 + flap * 4, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = '#5D4037';
  roundRect(ctx, -5, -18, 10, 36, 5);
  ctx.fill();

  // Antennae
  ctx.strokeStyle = '#5D4037';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.quadraticCurveTo(-10, -30, -14, -34);
  ctx.moveTo(0, -16);
  ctx.quadraticCurveTo(10, -30, 14, -34);
  ctx.stroke();

  ctx.restore();
}

function drawHud(ctx) {
  const m = currentMode();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  roundRect(ctx, 14, 12, W - 28, 58, 14);
  ctx.fill();

  ctx.font = 'bold 17px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(m.name, W / 2, 32);

  ctx.font = '13px "Segoe UI", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  let line = 'Next: ' + expected;
  if (m.rounds) {
    line += ' · Round ' + (round + 1) + '/' + roundsTarget;
  } else {
    line += ' · Chains ' + sessionChains;
  }
  ctx.fillText(line, W / 2, 52);
}

function drawPlay(ctx) {
  drawBg(ctx);

  // Prompt chip
  if (!celebrateLock) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(ctx, W / 2 - 70, 78, 140, 32, 16);
    ctx.fill();
    ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = colorOf(expected).stroke;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Tap ' + expected + '!', W / 2, 94);
  }

  for (const b of bubbles) drawBubble(ctx, b);
  drawCaterpillar(ctx);
  drawParticles(ctx);
  drawHud(ctx);

  if (!celebrateLock) {
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'center';
    ctx.fillText('Tap numbers in order 1 → ' + maxN, W / 2, H - 28);
  }
}

function drawWinScene(ctx) {
  drawBg(ctx);
  drawButterfly(ctx, W / 2, H * 0.38, 1.2 + skyPhase);
  // Little friend caterpillars
  if (segments.length === 0) segments = makeSequence(5);
  drawCaterpillar(ctx);
  drawParticles(ctx);
  if (winFlash > 0) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.14 * Math.min(1, winFlash)) + ')';
    ctx.fillRect(0, 0, W, H);
  }
}

function drawMenuBackdrop(ctx) {
  drawBg(ctx);
  // Demo: partial caterpillar + a few bubbles
  const demoSegs = [1, 2, 3];
  const prev = segments;
  segments = demoSegs;
  drawCaterpillar(ctx);
  segments = prev;
  const demo = layoutBubbles([4, 5], { top: 120, bottom: 320, rng: () => 0.4 });
  for (const b of demo) drawBubble(ctx, b);
  ctx.fillStyle = 'rgba(20, 50, 30, 0.4)';
  ctx.fillRect(0, 0, W, H);
}
