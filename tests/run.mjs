#!/usr/bin/env node
/**
 * Number Caterpillar — comprehensive unit + shell tests (no browser / no deps).
 * Run: node tests/run.mjs
 *
 * Loads game modules in a VM sandbox and asserts sequence rules, layout,
 * hit testing, play flow, modes, save, and PWA shell — not just "file exists".
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
    process.stdout.write('.');
    return;
  }
  failed++;
  failures.push(msg);
  console.error('\n  ✗', msg);
}

function assertEq(a, b, msg) {
  assert(Object.is(a, b), `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
}

function assertClose(a, b, eps, msg) {
  assert(Math.abs(a - b) <= eps, `${msg} (got ${a}, expected ~${b} ±${eps})`);
}

function section(name) {
  process.stdout.write('\n• ' + name + ' ');
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

/** Seeded mulberry32 for deterministic layout tests */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadGame(opts = {}) {
  const files = [
    'js/config.js',
    'js/save.js',
    'js/audio.js',
    'js/particles.js',
    'js/game.js',
  ];
  const code = files
    .map(rel => `// ---- ${rel} ----\n` + read(rel))
    .join('\n;\n');

  const exportFooter = `
    globalThis.__TEST__ = {
      GAME_VERSION, GAME_NAME, W, H, MODES, MODE_ORDER, NUM_COLORS, HINT_AFTER,
      CATERPILLAR, SAVE_KEY, PRAISE,
      bubbleRadius, shuffle, shuffleWith, makeSequence, nextExpected, canTap,
      isChainComplete, layoutBubbles, layoutCaterpillar, caterpillarMetrics,
      caterpillarFitsOnScreen, colorOf, currentMode,
      hitBubble, applyTapAt, handleTap, enterPlay, enterMenu, enterWin, layoutRound,
      onChainComplete, updatePlay,
      state: () => state,
      modeId: () => modeId,
      expected: () => expected,
      maxN: () => maxN,
      round: () => round,
      roundsTarget: () => roundsTarget,
      sessionTaps: () => sessionTaps,
      sessionChains: () => sessionChains,
      bubbles: () => bubbles,
      segments: () => segments,
      hintTimer: () => hintTimer,
      wrongGlowN: () => wrongGlowN,
      celebrateLock: () => celebrateLock,
      butterflyT: () => butterflyT,
      setExpected: (n) => { expected = n; },
      setCelebrateLock: (v) => { celebrateLock = !!v; },
      setHintTimer: (t) => { hintTimer = t; },
      setRound: (r) => { round = r; },
      save,
      setMode, setMuted, setReducedMotion,
      recordTap, recordChain,
      loadSave, persistSave, defaultSave,
    };
  `;

  const sandbox = {
    console,
    setTimeout: opts.immediateTimeout
      ? (fn) => { fn(); return 0; }
      : setTimeout,
    clearTimeout,
    Math,
    performance: { now: () => Date.now() },
    localStorage: {
      _data: {},
      getItem(k) { return this._data[k] ?? null; },
      setItem(k, v) { this._data[k] = String(v); },
      removeItem(k) { delete this._data[k]; },
      clear() { this._data = {}; },
    },
    document: {
      getElementById() { return null; },
      querySelectorAll() { return []; },
    },
    window: {},
    globalThis: {},
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
    speechSynthesis: undefined,
    SpeechSynthesisUtterance: undefined,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  vm.runInNewContext(code + '\n' + exportFooter, sandbox, { filename: 'number-caterpillar-test.js' });
  return sandbox.__TEST__;
}

// =====================================================================
// PWA shell files
// =====================================================================
section('PWA shell files');
{
  for (const f of [
    'index.html', 'css/style.css', 'js/config.js', 'js/save.js', 'js/audio.js',
    'js/particles.js', 'js/game.js', 'js/main.js',
    'manifest.webmanifest', 'sw.js', 'README.md',
  ]) {
    assert(exists(f), `exists ${f}`);
  }
  for (const f of [
    'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
    'apple-touch-icon.png', 'art/cover.jpg',
  ]) {
    assert(exists(f), `exists ${f}`);
  }
}

// =====================================================================
// Version / SW cache sync
// =====================================================================
section('version / SW cache sync');
{
  const cfg = read('js/config.js');
  const sw = read('sw.js');
  const m = cfg.match(/GAME_VERSION\s*=\s*['"]([^'"]+)['"]/);
  assert(!!m, 'GAME_VERSION present');
  const ver = m[1];
  assert(/^\d+\.\d+\.\d{3}$/.test(ver), `version format (${ver})`);
  assert(sw.includes(`number-caterpillar-${ver}`), `sw CACHE matches number-caterpillar-${ver}`);
  assert(cfg.includes('SAVE_KEY'), 'SAVE_KEY defined');
  assert(cfg.includes('number-caterpillar-save'), 'SAVE_KEY namespaced');
}

// =====================================================================
// Script order + manifest
// =====================================================================
section('script order + manifest');
{
  const html = read('index.html');
  let last = -1;
  for (const s of ['config.js', 'save.js', 'audio.js', 'particles.js', 'game.js', 'main.js']) {
    const i = html.indexOf(s);
    assert(i > last, `order ${s}`);
    last = i;
  }
  assert(html.includes('manifest.webmanifest'), 'html links manifest');
  assert(html.includes('sw.js') || read('js/main.js').includes('serviceWorker'), 'SW registration path');
  const man = JSON.parse(read('manifest.webmanifest'));
  assert(man.display === 'standalone', 'manifest standalone');
  assert(man.name === 'Number Caterpillar', 'manifest name');
  assert(Array.isArray(man.icons) && man.icons.length >= 2, 'manifest icons');
  assert(man.orientation === 'portrait', 'portrait orientation');
}

// =====================================================================
// Config integrity
// =====================================================================
section('config integrity');
{
  const T = loadGame();
  assertEq(T.W, 390, 'W');
  assertEq(T.H, 700, 'H');
  assert(T.MODE_ORDER.length === 4, '4 modes');
  assert(T.MODE_ORDER.every(id => T.MODES[id]), 'MODE_ORDER keys valid');
  assertEq(T.MODES.free.maxN, 5, 'free maxN');
  assertEq(T.MODES.free.rounds, 0, 'free endless');
  assertEq(T.MODES.easy.maxN, 5, 'easy maxN');
  assertEq(T.MODES.easy.rounds, 3, 'easy rounds');
  assertEq(T.MODES.more.maxN, 8, 'more maxN');
  assertEq(T.MODES.pro.maxN, 10, 'pro maxN');
  // Colors 1–10
  for (let n = 1; n <= 10; n++) {
    assert(!!T.NUM_COLORS[n], `color for ${n}`);
    assert(!!T.NUM_COLORS[n].fill, `fill for ${n}`);
    assert(!!T.NUM_COLORS[n].stroke, `stroke for ${n}`);
  }
  assert(T.NUM_COLORS[0] === null || T.NUM_COLORS[0] == null, 'no color 0');
  assert(T.HINT_AFTER > 0, 'HINT_AFTER positive');
  // Head anchors on the right so body grows left on-screen
  assert(T.CATERPILLAR.headX > T.W * 0.55, 'head starts on the right half');
  assert(T.bubbleRadius(5) > T.bubbleRadius(10), 'larger bubbles when fewer');
}

// =====================================================================
// makeSequence
// =====================================================================
section('makeSequence');
{
  const T = loadGame();
  assertEq(JSON.stringify(T.makeSequence(5)), JSON.stringify([1, 2, 3, 4, 5]), '1..5');
  assertEq(JSON.stringify(T.makeSequence(1)), JSON.stringify([1]), '1..1');
  assertEq(JSON.stringify(T.makeSequence(10)), JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), '1..10');
  // Clamp
  assert(T.makeSequence(0).length === 1, 'clamp min to 1');
  assert(T.makeSequence(99).length === 10, 'clamp max to 10');
  assert(T.makeSequence(3).every((n, i) => n === i + 1), 'strict ascending');
}

// =====================================================================
// nextExpected + canTap + isChainComplete (pure rules)
// =====================================================================
section('sequence rules — nextExpected / canTap / isChainComplete');
{
  const T = loadGame();

  assertEq(T.nextExpected([], 5), 1, 'empty → expect 1');
  assertEq(T.nextExpected([1], 5), 2, 'after 1 → 2');
  assertEq(T.nextExpected([1, 2, 3], 5), 4, 'after 1–3 → 4');
  assertEq(T.nextExpected([1, 2, 3, 4, 5], 5), 6, 'complete → max+1');

  assert(T.canTap(1, 1, false) === true, 'tap 1 when expect 1');
  assert(T.canTap(2, 1, false) === false, 'cannot tap 2 early');
  assert(T.canTap(1, 1, true) === false, 'cannot re-tap collected');
  assert(T.canTap(5, 5, false) === true, 'tap 5 when expect 5');
  assert(T.canTap(null, 1, false) === false, 'null n rejected');
  assert(T.canTap(1, null, false) === false, 'null expected rejected');

  assert(T.isChainComplete([1, 2, 3, 4, 5], 5) === true, 'full chain complete');
  assert(T.isChainComplete([1, 2, 3], 5) === false, 'partial incomplete');
  assert(T.isChainComplete([1, 2, 3, 4, 6], 5) === false, 'wrong last');
  assert(T.isChainComplete([], 5) === false, 'empty incomplete');
  assert(T.isChainComplete([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10) === true, '1–10 complete');
  assert(T.isChainComplete([2, 1, 3, 4, 5], 5) === false, 'out-of-order list fails');
}

// =====================================================================
// layoutBubbles
// =====================================================================
section('layoutBubbles');
{
  const T = loadGame();
  const rng = mulberry32(42);
  const seq = T.makeSequence(5);
  const laid = T.layoutBubbles(seq, { rng, top: 90, bottom: 480, pad: 28 });

  assertEq(laid.length, 5, '5 bubbles');
  const nums = laid.map(b => b.n).sort((a, b) => a - b);
  assertEq(JSON.stringify(nums), JSON.stringify([1, 2, 3, 4, 5]), 'all numbers 1–5 present');
  assert(laid.every(b => !b.collected), 'none collected');
  assert(laid.every(b => b.r > 0), 'positive radius');
  assert(laid.every(b => b.x >= 28 && b.x <= T.W - 28), 'x in pad');
  assert(laid.every(b => b.y >= 90 && b.y <= 480), 'y in playfield');

  // Distinct positions
  const keys = new Set(laid.map(b => `${Math.round(b.x)},${Math.round(b.y)}`));
  assert(keys.size === 5, 'distinct positions');

  // Overlap: centers at least ~ sum of radii - small tolerance after resolve
  let minDist = Infinity;
  for (let i = 0; i < laid.length; i++) {
    for (let j = i + 1; j < laid.length; j++) {
      const d = Math.hypot(laid[i].x - laid[j].x, laid[i].y - laid[j].y);
      if (d < minDist) minDist = d;
    }
  }
  assert(minDist > 20, `bubbles not heavily stacked (minDist=${minDist.toFixed(1)})`);

  // Deterministic with same seed
  const laid2 = T.layoutBubbles(seq, { rng: mulberry32(42), top: 90, bottom: 480, pad: 28 });
  assertEq(laid[0].n, laid2[0].n, 'deterministic first n');
  assertClose(laid[0].x, laid2[0].x, 0.01, 'deterministic x');
  assertClose(laid[0].y, laid2[0].y, 0.01, 'deterministic y');

  // 10 numbers
  const big = T.layoutBubbles(T.makeSequence(10), { rng: mulberry32(7) });
  assertEq(big.length, 10, '10 bubbles');
  assert(big.every(b => b.r <= T.bubbleRadius(5)), 'smaller radius for denser board');
}

// =====================================================================
// layoutCaterpillar — stays on screen through Challenge (1–10)
// =====================================================================
section('layoutCaterpillar');
{
  const T = loadGame();
  const empty = T.layoutCaterpillar([], { maxN: 5 });
  assert(!!empty.head, 'has head');
  assertEq(empty.segments.length, 0, 'no segs empty');
  assert(empty.head.x > T.W * 0.55, 'empty head on right');
  assertEq(empty.head.y, T.CATERPILLAR.headY, 'head Y');
  assert(T.caterpillarFitsOnScreen(empty), 'empty fits on screen');

  const grown = T.layoutCaterpillar([1, 2, 3, 4, 5], { maxN: 5 });
  assertEq(grown.segments.length, 5, '5 segments');
  // Segments trail left of head
  for (const s of grown.segments) {
    assert(s.x < grown.head.x, `seg ${s.n} left of head`);
  }
  // Nearest segment closer to head than farthest
  const nearest = grown.segments[0];
  const farthest = grown.segments[grown.segments.length - 1];
  assert(nearest.x > farthest.x, 'segments grow leftward');
  assertEq(nearest.n, 1, 'first collected nearest');
  assertEq(farthest.n, 5, 'last collected farthest');
  assert(T.caterpillarFitsOnScreen(grown), '5-seg body fits on screen');

  // Challenge mode: full 1–10 must stay on canvas
  const full = T.makeSequence(10);
  const challenge = T.layoutCaterpillar(full, { maxN: 10 });
  assertEq(challenge.segments.length, 10, '10 segments');
  assert(T.caterpillarFitsOnScreen(challenge), 'challenge 1–10 fully on screen');
  for (const s of challenge.segments) {
    assert(s.x - s.r >= T.CATERPILLAR.pad - 0.5, `seg ${s.n} left edge on-screen`);
    assert(s.x + s.r <= T.W - T.CATERPILLAR.pad + 0.5, `seg ${s.n} right edge on-screen`);
  }
  // Progressive growth never leaves the screen either
  for (let k = 1; k <= 10; k++) {
    const partial = T.layoutCaterpillar(full.slice(0, k), { maxN: 10 });
    assert(
      T.caterpillarFitsOnScreen(partial),
      `after collecting ${k} number(s) still on-screen`
    );
  }

  // Metrics: gap shrinks for larger chains
  const m5 = T.caterpillarMetrics(5);
  const m10 = T.caterpillarMetrics(10);
  assert(m10.gap <= m5.gap + 0.01, 'tighter gap for 10 than for 5');
  assert(m10.headX > T.W * 0.55, 'metrics head on right');

  // Custom anchors
  const custom = T.layoutCaterpillar([1], { headX: 100, headY: 200, segGap: 50, maxN: 1 });
  assertEq(custom.head.x, 100, 'custom headX');
  assertEq(custom.segments[0].x, 100 - 50, 'custom gap');
}

// =====================================================================
// shuffle
// =====================================================================
section('shuffle / shuffleWith');
{
  const T = loadGame();
  const src = [1, 2, 3, 4, 5];
  const a = T.shuffle(src);
  assertEq(src.length, 5, 'shuffle does not mutate source length');
  assertEq(JSON.stringify(src), JSON.stringify([1, 2, 3, 4, 5]), 'shuffle non-mutating');
  assertEq(a.length, 5, 'shuffled length');
  assert(a.slice().sort((x, y) => x - y).every((n, i) => n === i + 1), 'same elements');

  const fixed = T.shuffleWith([1, 2, 3], () => 0); // always swap with j=0
  assertEq(fixed.length, 3, 'shuffleWith length');
  const same = T.shuffleWith([1, 2, 3], mulberry32(1));
  const same2 = T.shuffleWith([1, 2, 3], mulberry32(1));
  assertEq(JSON.stringify(same), JSON.stringify(same2), 'shuffleWith deterministic');
}

// =====================================================================
// enterPlay + modes
// =====================================================================
section('enterPlay + modes');
{
  const T = loadGame();
  T.enterPlay('easy');
  assertEq(T.state(), 'play', 'state play');
  assertEq(T.modeId(), 'easy', 'mode easy');
  assertEq(T.maxN(), 5, 'maxN 5');
  assertEq(T.expected(), 1, 'start expect 1');
  assertEq(T.roundsTarget(), 3, 'easy 3 rounds');
  assertEq(T.round(), 0, 'round 0');
  assertEq(T.bubbles().length, 5, '5 bubbles');
  assertEq(T.segments().length, 0, 'no segments');
  assert(T.celebrateLock() === false, 'not locked');

  T.enterPlay('free');
  assertEq(T.roundsTarget(), 0, 'free endless');
  assertEq(T.maxN(), 5, 'free maxN');
  assertEq(T.bubbles().length, 5, 'free bubbles');

  T.enterPlay('more');
  assertEq(T.maxN(), 8, 'more maxN');
  assertEq(T.bubbles().length, 8, '8 bubbles');
  assertEq(T.roundsTarget(), 4, 'more rounds');

  T.enterPlay('pro');
  assertEq(T.maxN(), 10, 'pro maxN');
  assertEq(T.bubbles().length, 10, '10 bubbles');
  assertEq(T.roundsTarget(), 5, 'pro rounds');

  T.enterMenu();
  assertEq(T.state(), 'menu', 'menu state');
}

// =====================================================================
// hitBubble
// =====================================================================
section('hitBubble');
{
  const T = loadGame();
  T.enterPlay('easy');
  const b = T.bubbles()[0];
  assert(T.hitBubble(b.x, b.y) === b, 'hit center');
  assert(T.hitBubble(b.x + 2, b.y - 1) === b, 'hit near center');
  assert(T.hitBubble(0, 0) === null, 'miss corner');
  assert(T.hitBubble(T.W, T.H) === null, 'miss far');

  // Collected bubbles not hittable
  b.collected = true;
  assert(T.hitBubble(b.x, b.y) === null, 'collected not hittable');
  b.collected = false;
}

// =====================================================================
// play flow — correct taps in order
// =====================================================================
section('play flow — correct sequence 1→5');
{
  const T = loadGame();
  T.enterPlay('easy');

  for (let n = 1; n <= 5; n++) {
    const bubble = T.bubbles().find(b => b.n === n && !b.collected);
    assert(!!bubble, `find bubble ${n}`);
    assertEq(T.expected(), n, `expect ${n} before tap`);
    const result = T.applyTapAt(bubble.x, bubble.y);
    if (n < 5) {
      assertEq(result, 'correct', `tap ${n} correct`);
      assertEq(T.expected(), n + 1, `expect advances to ${n + 1}`);
      assert(bubble.collected === true, `${n} marked collected`);
      assertEq(T.segments().length, n, `segments length ${n}`);
      assertEq(T.segments()[n - 1], n, `segment value ${n}`);
    } else {
      assertEq(result, 'complete', 'tap 5 completes chain');
      assert(T.isChainComplete(T.segments(), 5), 'chain complete');
      assertEq(T.sessionTaps(), 5, 'session taps 5');
    }
  }
}

// =====================================================================
// play flow — wrong tap
// =====================================================================
section('play flow — wrong tap soft feedback');
{
  const T = loadGame();
  T.enterPlay('easy');
  assertEq(T.expected(), 1, 'start at 1');

  const two = T.bubbles().find(b => b.n === 2);
  assert(!!two, 'bubble 2');
  const result = T.applyTapAt(two.x, two.y);
  assertEq(result, 'wrong', 'tapping 2 first is wrong');
  assert(two.collected === false, '2 not collected');
  assert(two.shake > 0, 'shake feedback');
  assertEq(T.expected(), 1, 'expected stays 1');
  assertEq(T.segments().length, 0, 'no segments');
  assertEq(T.wrongGlowN(), 1, 'glow on expected 1');
  assertEq(T.sessionTaps(), 0, 'no session taps on wrong');

  // Miss
  assertEq(T.applyTapAt(0, 0), 'miss', 'miss empty space');

  // Locked during celebrate
  T.setCelebrateLock(true);
  const one = T.bubbles().find(b => b.n === 1);
  assertEq(T.applyTapAt(one.x, one.y), 'locked', 'locked during celebrate');
  T.setCelebrateLock(false);
}

// =====================================================================
// play flow — cannot skip
// =====================================================================
section('play flow — cannot skip numbers');
{
  const T = loadGame();
  T.enterPlay('easy');

  // Tap 1 ok
  const one = T.bubbles().find(b => b.n === 1);
  assertEq(T.applyTapAt(one.x, one.y), 'correct', 'tap 1');
  // Try 3 while expecting 2
  const three = T.bubbles().find(b => b.n === 3);
  assertEq(T.applyTapAt(three.x, three.y), 'wrong', 'cannot skip to 3');
  assertEq(T.expected(), 2, 'still expect 2');
  // Tap 2
  const two = T.bubbles().find(b => b.n === 2);
  assertEq(T.applyTapAt(two.x, two.y), 'correct', 'tap 2');
  // Re-tap 1 (already collected)
  assertEq(T.applyTapAt(one.x, one.y), 'miss', 'collected not hittable → miss');
}

// =====================================================================
// play flow — pro 1–10 complete
// =====================================================================
section('play flow — full pro chain 1–10');
{
  const T = loadGame();
  T.enterPlay('pro');
  assertEq(T.bubbles().length, 10, '10 bubbles');
  for (let n = 1; n <= 10; n++) {
    const bubble = T.bubbles().find(b => b.n === n && !b.collected);
    const r = T.applyTapAt(bubble.x, bubble.y);
    if (n < 10) assertEq(r, 'correct', `pro tap ${n}`);
    else assertEq(r, 'complete', 'pro complete at 10');
  }
  assert(T.isChainComplete(T.segments(), 10), 'pro chain complete');
  assertEq(T.sessionTaps(), 10, '10 taps');
}

// =====================================================================
// handleTap side effects (sfx path, save counters)
// =====================================================================
section('handleTap + save counters');
{
  const T = loadGame();
  T.enterPlay('easy');
  const beforeTaps = T.save.taps | 0;
  const one = T.bubbles().find(b => b.n === 1);
  const r = T.handleTap(one.x, one.y);
  assertEq(r, 'correct', 'handleTap correct');
  assertEq(T.save.taps, beforeTaps + 1, 'recordTap via handleTap');

  // Wrong does not increment
  const taps2 = T.save.taps | 0;
  const five = T.bubbles().find(b => b.n === 5);
  assertEq(T.handleTap(five.x, five.y), 'wrong', 'handleTap wrong');
  assertEq(T.save.taps, taps2, 'wrong does not recordTap');
}

// =====================================================================
// chain complete → free mode next round
// =====================================================================
section('chain complete free mode (immediate timeout)');
{
  const T = loadGame({ immediateTimeout: true });
  T.enterPlay('free');
  for (let n = 1; n <= 5; n++) {
    const bubble = T.bubbles().find(b => b.n === n && !b.collected);
    T.applyTapAt(bubble.x, bubble.y);
  }
  // Manually fire completion path
  const chainsBefore = T.save.chains | 0;
  T.onChainComplete();
  assertEq(T.sessionChains(), 1, 'session chain +1');
  assertEq(T.save.chains, chainsBefore + 1, 'save chains +1');
  // Free mode: layoutRound resets board
  assertEq(T.expected(), 1, 'reset expect 1');
  assertEq(T.segments().length, 0, 'segments cleared');
  assertEq(T.bubbles().length, 5, 'new bubbles');
  assert(T.celebrateLock() === false, 'lock released after free next round');
  assertEq(T.state(), 'play', 'still play (endless)');
}

// =====================================================================
// chain complete → win after enough rounds
// =====================================================================
section('chain complete easy mode win after rounds');
{
  const T = loadGame({ immediateTimeout: true });
  T.enterPlay('easy');
  assertEq(T.roundsTarget(), 3, '3 rounds target');

  // Complete round 0 and 1 → still play; round 2 completion → win
  for (let r = 0; r < 3; r++) {
    T.setRound(r);
    // Fresh layout each time if needed
    if (T.segments().length || T.bubbles().every(b => b.collected)) {
      T.layoutRound();
    }
    for (let n = 1; n <= 5; n++) {
      const bubble = T.bubbles().find(b => b.n === n && !b.collected);
      T.applyTapAt(bubble.x, bubble.y);
    }
    T.onChainComplete();
  }
  assertEq(T.state(), 'win', 'win after 3 rounds');
}

// =====================================================================
// hint timer
// =====================================================================
section('hint after idle');
{
  const T = loadGame();
  T.enterPlay('easy');
  assertEq(T.wrongGlowN(), 0, 'no glow initially');
  T.setHintTimer(T.HINT_AFTER + 0.1);
  T.updatePlay(0.016);
  assertEq(T.wrongGlowN(), 1, 'glow expected after idle');
}

// =====================================================================
// colorOf
// =====================================================================
section('colorOf');
{
  const T = loadGame();
  for (let n = 1; n <= 10; n++) {
    const c = T.colorOf(n);
    assert(!!c.fill && !!c.stroke, `colorOf(${n})`);
  }
  // Fallback for invalid
  const bad = T.colorOf(99);
  assert(!!bad.fill, 'fallback color');
}

// =====================================================================
// save helpers
// =====================================================================
section('save helpers');
{
  const T = loadGame();
  T.setMode('pro');
  assertEq(T.save.mode, 'pro', 'setMode pro');
  T.setMode('nope');
  assertEq(T.save.mode, 'pro', 'invalid mode ignored');
  T.setMuted(true);
  assert(T.save.muted === true, 'muted');
  T.setMuted(false);
  assert(T.save.muted === false, 'unmuted');
  T.setReducedMotion(true);
  assert(T.save.reducedMotion === true, 'reduced motion');

  const t0 = T.save.taps | 0;
  T.recordTap();
  T.recordTap();
  assertEq(T.save.taps, t0 + 2, 'recordTap x2');
  const c0 = T.save.chains | 0;
  T.recordChain();
  assertEq(T.save.chains, c0 + 1, 'recordChain');

  // Persist / reload via localStorage on fresh load
  T.setMode('more');
  T.persistSave();
  // Re-read save object still has more
  assertEq(T.save.mode, 'more', 'persisted mode');
}

// =====================================================================
// currentMode fallback
// =====================================================================
section('currentMode fallback');
{
  const T = loadGame();
  T.enterPlay('easy');
  // modeId is internal; setMode only accepts valid — enterPlay with bad falls to free/easy via ||
  // currentMode uses MODES[modeId] || MODES.easy
  assert(T.currentMode().id === 'easy', 'current easy');
  T.enterPlay('free');
  assert(T.currentMode().id === 'free', 'current free');
}

// =====================================================================
// Kid design: no fail / no lives in source
// =====================================================================
section('kid-safe design markers');
{
  const game = read('js/game.js');
  const html = read('index.html');
  assert(!/game\s*over/i.test(game), 'no game over string');
  assert(!/\blives\b/i.test(game), 'no lives system');
  assert(html.includes('never a fail') || read('README.md').includes('fail'), 'fail-safe messaging');
  assert(game.includes('wrong') || game.includes('shake'), 'soft wrong feedback present');
  assert(game.includes('butterfly') || game.includes('Butterfly'), 'butterfly celebration');
}

// =====================================================================
// SW assets list completeness
// =====================================================================
section('SW ASSETS list');
{
  const sw = read('sw.js');
  for (const a of [
    'index.html', 'css/style.css', 'js/config.js', 'js/game.js', 'js/main.js',
    'manifest.webmanifest', 'icons/icon-192.png', 'art/cover.jpg',
  ]) {
    assert(sw.includes(a), `SW lists ${a}`);
  }
}

// =====================================================================
// Summary
// =====================================================================
console.log('\n');
if (failed) {
  console.error(`Failed: ${failed}  Passed: ${passed}`);
  for (const f of failures) console.error('  •', f);
  process.exit(1);
}
console.log(`Passed: ${passed}  Failed: 0`);
console.log('All Number Caterpillar tests passed.');
process.exit(0);
