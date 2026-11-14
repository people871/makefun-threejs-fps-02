// audio.js — all sound for the tactical FPS, synthesized with WebAudio only.
// No audio files, no network. Lazily created on first user gesture via ensure().
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // One 1-second white-noise buffer, reused by every noise-based sound.
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function live() { return ctx && ctx.state === 'running' && !muted; }

  // Short oscillator tone with a fast exponential decay envelope.
  function blip(freq, dur, type, gain, slideTo) {
    if (!live()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Filtered noise burst with decay envelope.
  function noiseBurst(dur, filterFreq, gain, type, sweepTo) {
    if (!live()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = type || 'lowpass';
    filt.frequency.setValueAtTime(filterFreq, t);
    if (sweepTo) filt.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // Schedule a blip at an offset from now.
  function blipAt(freq, dur, type, gain, delay) {
    if (!live()) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  let stepAlt = false;

  const api = {
    ensure,

    setMuted(m) { muted = !!m; if (master) master.gain.value = muted ? 0 : 0.5; },
    isMuted() { return muted; },

    shot(kind) {
      if (!live()) return;
      const det = 1 + (Math.random() - 0.5) * 0.06; // tiny random detune, audio only
      if (kind === 'rifle') {
        noiseBurst(0.12, 1800 * det, 0.9);
        blip(120 * det, 0.12, 'sine', 0.7, 55);
      } else if (kind === 'smg') {
        noiseBurst(0.07, 2600 * det, 0.7);
        blip(150 * det, 0.07, 'sine', 0.5, 70);
      } else if (kind === 'sniper') {
        noiseBurst(0.22, 1400 * det, 1.0);
        blip(90 * det, 0.25, 'sine', 1.0, 35);
        noiseBurst(0.05, 4000 * det, 0.5, 'highpass');
      } else { // sidearm
        noiseBurst(0.09, 2200 * det, 0.75);
        blip(140 * det, 0.09, 'sine', 0.55, 60);
      }
    },

    dryFire() { blip(2000, 0.03, 'square', 0.12); },

    reload() {
      blip(900, 0.04, 'square', 0.18);
      blipAt(650, 0.05, 'square', 0.22, 0.25);
    },

    hit(kill) {
      blip(1200, 0.06, 'sine', 0.4);
      if (kill) blipAt(1800, 0.09, 'sine', 0.4, 0.07);
    },

    hurt() { blip(90, 0.18, 'sine', 0.8, 45); },

    step() {
      stepAlt = !stepAlt;
      noiseBurst(0.05, stepAlt ? 500 : 420, 0.05);
    },

    plantBeep(final) {
      blip(880, 0.07, 'square', 0.25);
      if (final) { blipAt(880, 0.07, 'square', 0.25, 0.09); blipAt(880, 0.07, 'square', 0.25, 0.18); }
    },

    defuseBeep() { blip(660, 0.07, 'square', 0.25); },

    explosion() {
      noiseBurst(0.8, 800, 1.0, 'lowpass', 100);
      blip(45, 0.8, 'sine', 1.0, 28);
    },

    roundWin() {
      blip(523, 0.16, 'triangle', 0.4);
      blipAt(659, 0.16, 'triangle', 0.4, 0.14);
      blipAt(784, 0.28, 'triangle', 0.4, 0.28);
    },

    roundLose() {
      blip(392, 0.22, 'triangle', 0.4);
      blipAt(311, 0.34, 'triangle', 0.4, 0.2);
    },

    buy() {
      blip(1400, 0.04, 'square', 0.2);
      blipAt(1100, 0.04, 'square', 0.2, 0.07);
      blipAt(1320, 0.12, 'sine', 0.35, 0.14);
    },

    click() { blip(1000, 0.03, 'square', 0.15); },
  };

  return api;
}
