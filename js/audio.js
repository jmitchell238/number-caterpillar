'use strict';

let audioCtx = null;

function ensureAudio() {
  if (save.muted) return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone({ freq = 440, dur = 0.12, type = 'sine', gain = 0.05, slide = 0, delay = 0 } = {}) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function sfxClick() { tone({ freq: 520, dur: 0.05, type: 'square', gain: 0.02 }); }
function sfxTap() {
  tone({ freq: 480, dur: 0.07, type: 'sine', gain: 0.035, slide: 80 });
}
function sfxCorrect(n) {
  // Pitch climbs with number
  const base = 340 + Math.min(10, n | 0) * 36;
  tone({ freq: base, dur: 0.1, type: 'sine', gain: 0.04, slide: 50 });
  tone({ freq: base * 1.25, dur: 0.12, type: 'triangle', gain: 0.035, delay: 0.06 });
}
function sfxWrong() {
  tone({ freq: 220, dur: 0.1, type: 'sine', gain: 0.025, slide: -50 });
}
function sfxGrow() {
  tone({ freq: 300, dur: 0.08, type: 'triangle', gain: 0.03, slide: 100 });
}
function sfxButterfly() {
  tone({ freq: 523, dur: 0.1, type: 'sine', gain: 0.04 });
  tone({ freq: 659, dur: 0.1, type: 'sine', gain: 0.04, delay: 0.09 });
  tone({ freq: 784, dur: 0.14, type: 'triangle', gain: 0.045, delay: 0.18 });
  tone({ freq: 1046, dur: 0.18, type: 'sine', gain: 0.035, delay: 0.3, slide: 40 });
}
function sfxWin() {
  sfxButterfly();
  tone({ freq: 880, dur: 0.2, type: 'triangle', gain: 0.04, delay: 0.45 });
}

/** Optional spoken number via SpeechSynthesis (no-op if unavailable / muted). */
function speakNumber(n) {
  if (save.muted) return;
  try {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(n));
    u.rate = 1.05;
    u.pitch = 1.15;
    u.volume = 0.85;
    speechSynthesis.speak(u);
  } catch { /* */ }
}
