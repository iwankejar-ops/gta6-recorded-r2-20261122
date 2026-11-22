// audio.js — all sound is synthesized live with WebAudio: engine hum, sirens,
// impacts, UI blips and three original radio stations. No audio files.
// GRAND CITY 6 — original code, written for this entry.

import { clamp } from './util.js';

const STATIONS = [
  {
    name: 'SOLMAR FM', tag: 'Synthwave',
    bpm: 96, root: 45, // A2
    scale: [0, 3, 5, 7, 10, 12, 15],
    bassPat: [0, 0, 7, 0, 5, 0, 3, 0],
    chordPat: [0, -1, 5, -1, 3, -1, 7, -1],
    leadPat: [12, -1, 10, 12, -1, 15, 14, -1],
    wave: 'sawtooth',
  },
  {
    name: 'COSTA ROCK', tag: 'Drive Rock',
    bpm: 128, root: 40, // E2
    scale: [0, 2, 3, 5, 7, 8, 10],
    bassPat: [0, 0, 0, 7, 0, 0, 5, 3],
    chordPat: [0, 0, -1, 5, -1, 0, -1, 3],
    leadPat: [12, 12, -1, 14, -1, 15, -1, 12],
    wave: 'square',
  },
  {
    name: 'MARINA NIGHTS', tag: 'Lo-Fi',
    bpm: 78, root: 48, // C3
    scale: [0, 2, 4, 7, 9, 12, 14],
    bassPat: [0, -1, -1, 5, -1, -1, 3, -1],
    chordPat: [0, -1, 4, -1, 7, -1, 9, -1],
    leadPat: [12, -1, 14, -1, 16, -1, 14, 12],
    wave: 'triangle',
  },
];

function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.radioOn = false;
    this.station = 0;
    this.step = 0;
    this.nextStepTime = 0;
    this.timer = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.windSrc = null;
    this.windGain = null;
  }

  /** Must be called from a user gesture at least once. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.32;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);
    this._startWind();
    this._startEngine();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  // ---- continuous beds -------------------------------------------------

  _startWind() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 420;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    src.connect(filt); filt.connect(this.windGain); this.windGain.connect(this.master);
    src.start();
    this.windSrc = src;
  }

  _startEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 28;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  /** speed 0..1, 0 when on foot. */
  setEngine(speed, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + speed * 0.11 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const f = 50 + speed * 130;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(280 + speed * 900, t, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const ctx = this.ctx;
      this.sirenOsc = ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 780;
      this.sirenLfo = ctx.createOscillator();
      this.sirenLfo.type = 'square';
      this.sirenLfo.frequency.value = 0.55;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 170;
      this.sirenLfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = ctx.createGain();
      this.sirenGain.gain.value = 0.0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenLfo.start();
      this.sirenGain.gain.setTargetAtTime(0.05, ctx.currentTime, 0.4);
    } else if (!on && this.sirenOsc) {
      const osc = this.sirenOsc, lfo = this.sirenLfo, g = this.sirenGain;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      setTimeout(() => { try { osc.stop(); lfo.stop(); } catch (e) {} }, 700);
      this.sirenOsc = null; this.sirenLfo = null; this.sirenGain = null;
    }
  }

  // ---- one-shots -------------------------------------------------------

  _blip(freq, dur, type, vol, when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _noise(dur, vol, filterFreq, type = 'lowpass', when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start(t);
  }

  click() { this._blip(660, 0.07, 'sine', 0.25); }
  pickup() { this._blip(880, 0.1, 'sine', 0.3); this._blip(1318, 0.14, 'sine', 0.25, 0.08); }
  punch() { this._noise(0.12, 0.5, 300); this._blip(90, 0.12, 'sine', 0.5); }
  crash() { this._noise(0.35, 0.6, 500); this._blip(60, 0.3, 'sine', 0.5); }
  horn() { this._blip(370, 0.25, 'square', 0.12); this._blip(466, 0.25, 'square', 0.12); }
  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => this._blip(f, 0.22, 'triangle', 0.3, i * 0.11));
  }
  busted() { [392, 330, 262].forEach((f, i) => this._blip(f, 0.3, 'sawtooth', 0.2, i * 0.18)); }
  radioSwitch() { this._blip(980, 0.06, 'sine', 0.2); }

  // ---- radio -----------------------------------------------------------

  stationName() { return STATIONS[this.station].name; }
  stationTag() { return STATIONS[this.station].tag; }

  toggleRadio() {
    this.ensure();
    this.radioOn = !this.radioOn;
    if (this.radioOn) this._startSequencer();
    else this._stopSequencer();
    return this.radioOn;
  }

  nextStation() {
    this.station = (this.station + 1) % STATIONS.length;
    if (this.radioOn) { this._stopSequencer(); this._startSequencer(); }
    this.radioSwitch();
    return STATIONS[this.station].name;
  }

  _startSequencer() {
    if (!this.ctx || this.timer) return;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this._schedule(), 40);
  }

  _stopSequencer() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  _schedule() {
    if (!this.ctx) return;
    const st = STATIONS[this.station];
    const stepDur = 60 / st.bpm / 2; // 8th notes
    while (this.nextStepTime < this.ctx.currentTime + 0.18) {
      this._playStep(st, this.step, this.nextStepTime, stepDur);
      this.step = (this.step + 1) % 16;
      this.nextStepTime += stepDur;
    }
  }

  _note(freq, t, dur, type, vol, dest) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _hat(t, vol) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.musicGain);
    src.start(t);
  }

  _playStep(st, step, t, stepDur) {
    const s8 = step % 8;
    const bass = st.bassPat[s8];
    if (bass >= 0) {
      this._note(midiToFreq(st.root + bass), t, stepDur * 1.8, 'triangle', 0.5, this.musicGain);
    }
    const chord = st.chordPat[s8];
    if (chord >= 0) {
      const base = st.root + 12 + chord;
      this._note(midiToFreq(base), t, stepDur * 2.2, st.wave, 0.10, this.musicGain);
      this._note(midiToFreq(base + 7), t, stepDur * 2.2, st.wave, 0.08, this.musicGain);
    }
    const lead = st.leadPat[step % 8];
    if (lead >= 0 && step % 2 === 0) {
      this._note(midiToFreq(st.root + 24 + lead), t, stepDur * 0.9, 'square', 0.06, this.musicGain);
    }
    if (step % 2 === 0) this._hat(t, 0.10);
    if (step % 4 === 2) this._hat(t, 0.16);
    // Kick on the beat.
    if (step % 4 === 0) {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + 0.2);
    }
  }

  setRainLevel(v) {
    if (this.windGain) this.windGain.gain.setTargetAtTime(0.05 + clamp(v, 0, 1) * 0.10, this.ctx.currentTime, 0.5);
  }
}
