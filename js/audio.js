'use strict';
// ---------- Sonido: efectos y música sintetizados con Web Audio (composiciones originales) ----------
const Sound = (() => {
  const PREF_KEY = 'hojaCarmesi.audio';
  let prefs = { muted: false, vol: 0.8 };
  try { const d = JSON.parse(localStorage.getItem(PREF_KEY)); if (d) prefs = Object.assign(prefs, d); } catch (e) {}
  let ac = null, master = null, musicBus = null, sfxBus = null, noiseBuf = null, pulse = null;
  let cur = null, fading = [], wanted = null, duck = 1;
  const lastPlay = {};

  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {} }
  function init() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ac = new AC(); } catch (e) { ac = null; return false; }
    master = ac.createGain(); master.gain.value = prefs.muted ? 0 : prefs.vol; master.connect(ac.destination);
    musicBus = ac.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.75; sfxBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // onda de pulso 25 % (timbre chiptune)
    const n = 24, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    pulse = ac.createPeriodicWave(re, im);
    return true;
  }
  // Desbloqueo en el primer gesto (iOS Safari exige crear/reanudar el contexto dentro del gesto)
  function unlock() {
    if (!init()) return;
    if (ac.state === 'suspended' && !document.hidden) ac.resume().catch(() => {});
    if (!unlock.done) {
      unlock.done = true;
      const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0);
      if (wanted) { const w = wanted; wanted = null; music(w); }
    }
  }
  ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown'].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend().catch(() => {}); else if (unlock.done) ac.resume().catch(() => {});
  });

  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function tone(type, f0, f1, dur, vol, t, dest, att) {
    const o = ac.createOscillator();
    if (type === 'pulse') o.setPeriodicWave(pulse); else o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (att || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxBus); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, t, ftype, f0, f1, dest, q) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = ftype || 'lowpass'; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }

  // ---------- Efectos ----------
  const SFX = {
    slash1: t => { noise(0.09, 0.32, t, 'bandpass', 2600, 5200, 0, 1.2); tone('triangle', 900, 1500, 0.06, 0.05, t); },
    slash2: t => { noise(0.09, 0.32, t, 'bandpass', 3200, 1800, 0, 1.2); tone('triangle', 1100, 700, 0.06, 0.05, t); },
    slash3: t => { noise(0.16, 0.4, t, 'bandpass', 1500, 6000, 0, 0.9); tone('pulse', 300, 900, 0.12, 0.06, t); },
    slashAir: t => { noise(0.1, 0.3, t, 'bandpass', 2000, 4200, 0, 1.5); },
    slashDown: t => { noise(0.1, 0.3, t, 'bandpass', 4200, 1600, 0, 1.5); },
    dash: t => { noise(0.18, 0.25, t, 'highpass', 900, 3500); tone('sine', 220, 520, 0.12, 0.05, t); },
    jump: t => { tone('pulse', 330, 660, 0.09, 0.07, t); },
    djump: t => { tone('pulse', 520, 1040, 0.08, 0.07, t); tone('sine', 1040, 1560, 0.16, 0.06, t + 0.05); noise(0.12, 0.12, t, 'highpass', 4000, 8000); },
    wjump: t => { tone('pulse', 280, 700, 0.1, 0.07, t); noise(0.05, 0.15, t, 'bandpass', 1200, 900); },
    land: t => { noise(0.07, 0.25, t, 'lowpass', 700, 200); tone('sine', 120, 60, 0.07, 0.12, t); },
    hit: t => { noise(0.08, 0.35, t, 'bandpass', 1600, 700, 0, 2); tone('square', 220, 110, 0.07, 0.08, t); },
    block: t => { tone('square', 1400, 1300, 0.08, 0.06, t); tone('triangle', 2100, 2000, 0.12, 0.06, t); },
    kill: t => { noise(0.3, 0.35, t, 'lowpass', 3000, 200); tone('square', 440, 60, 0.25, 0.07, t); },
    hurt: t => { tone('square', 320, 90, 0.28, 0.12, t); noise(0.2, 0.3, t, 'lowpass', 2500, 300); },
    heal: t => { [0, 4, 7, 12].forEach((n, i) => tone('sine', hz(72 + n), 0, 0.22, 0.07, t + i * 0.06)); },
    bench: t => { [0, 7, 12, 16].forEach((n, i) => tone('triangle', hz(60 + n), 0, 0.5, 0.07, t + i * 0.09)); },
    pogo: t => { tone('pulse', 440, 880, 0.08, 0.07, t); noise(0.06, 0.2, t, 'bandpass', 3000, 2000); },
    pickup: t => { [0, 4, 7, 12, 16, 19].forEach((n, i) => tone('pulse', hz(76 + n), 0, 0.16, 0.05, t + i * 0.055)); },
    doorLock: t => { tone('square', 110, 70, 0.35, 0.12, t); noise(0.3, 0.35, t, 'lowpass', 900, 150); },
    doorOpen: t => { tone('triangle', 180, 360, 0.4, 0.1, t); noise(0.35, 0.2, t, 'lowpass', 400, 1600); },
    tel: t => { tone('pulse', 740, 740, 0.07, 0.05, t); tone('pulse', 988, 988, 0.09, 0.05, t + 0.08); },
    roar: t => { noise(0.9, 0.35, t, 'lowpass', 400, 1800); tone('sawtooth', 90, 60, 0.9, 0.08, t, 0, 0.1); },
    shoot: t => { tone('square', 900, 300, 0.12, 0.05, t); },
    zap: t => { tone('sawtooth', 1800, 400, 0.3, 0.05, t); noise(0.3, 0.15, t, 'highpass', 5000, 2000); },
    boom: t => { tone('sine', 110, 40, 0.3, 0.25, t); noise(0.3, 0.3, t, 'lowpass', 1200, 100); },
    shatter: t => { for (let i = 0; i < 4; i++) tone('triangle', 2000 + Math.random() * 2000, 0, 0.12, 0.03, t + i * 0.03); noise(0.2, 0.15, t, 'highpass', 6000, 3000); },
    beam: t => { tone('sine', 660, 1320, 0.2, 0.035, t); },
    switch: t => { tone('triangle', 1318, 0, 0.15, 0.07, t); tone('triangle', 1760, 0, 0.2, 0.06, t + 0.07); },
    crumble: t => { noise(0.4, 0.35, t, 'lowpass', 1400, 120); },
    bossDie: t => { noise(1.4, 0.4, t, 'lowpass', 3000, 80); tone('square', 300, 40, 1.2, 0.08, t); [0, 7, 12].forEach((n, i) => tone('triangle', hz(60 + n), 0, 0.8, 0.06, t + 0.6 + i * 0.12)); },
    select: t => { tone('pulse', 880, 0, 0.06, 0.06, t); tone('pulse', 1320, 0, 0.08, 0.06, t + 0.05); },
    move: t => { tone('pulse', 660, 0, 0.04, 0.045, t); },
  };
  function sfx(name) {
    if (!ac || ac.state !== 'running' || prefs.muted) return;
    const now = ac.currentTime;
    if (lastPlay[name] && now - lastPlay[name] < 0.045) return;
    lastPlay[name] = now;
    const f = SFX[name]; if (f) try { f(now + 0.005); } catch (e) {}
  }

  // ---------- Música (secuenciador por pasos de semicorchea) ----------
  const Q = { m: [0, 3, 7, 12], M: [0, 4, 7, 12], s: [0, 5, 7, 12] };
  const parse = s => s.replace(/\|/g, ' ').trim().split(/\s+/).map(t => t === '.' ? null : t === '_' ? '_' : +t);
  const TRACKS = {
    title: { bpm: 70, root: 50, chords: ['0m', '-4M', '3M', '-2M'], bass: 'x.......f.......', arpRate: 2, arpWave: 'triangle', arpOct: 24, arpVol: 0.03,
      lead: '12 _ _ 10 12 _ 15 _ | 10 _ _ 8 7 _ _ _ | 12 _ _ 10 12 _ 17 _ | 15 _ 14 _ 12 _ _ _', leadOct: 12, leadWave: 'triangle', leadVol: 0.07, drums: { h: '........x.......' } },
    cave: { bpm: 80, root: 45, chords: ['0m', '-4M', '-2M', '-5m'], bass: 'x.....x.....f...', arpRate: 2, arpWave: 'square', arpOct: 12, arpVol: 0.018,
      lead: '0 _ 3 _ 7 _ 5 3 | 8 _ 7 _ 3 _ _ _ | 7 _ 5 _ 3 _ 2 _ | 3 _ _ 2 -2 _ _ _', leadOct: 24, leadWave: 'pulse', leadVol: 0.045,
      drums: { k: 'x.......x.......', s: '........x.......', h: '....x.......x...' } },
    dawn: { bpm: 112, root: 43, chords: ['0M', '7M', '9m', '5M'], bass: 'x...o...x.f.o...', arpRate: 1, arpWave: 'square', arpOct: 24, arpVol: 0.016,
      lead: '7 _ 9 11 12 _ 11 9 | 7 _ 4 _ 2 _ 4 _ | 7 _ 9 11 12 _ 14 _ | 16 _ 14 12 11 _ 7 _', leadOct: 24, leadWave: 'pulse', leadVol: 0.05,
      drums: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' } },
    crystal: { bpm: 96, root: 40, chords: ['0M', '5M', '9m', '7M'], bass: 'x.....o...x.....', arpRate: 1, arpWave: 'sine', arpOct: 36, arpVol: 0.03,
      lead: '16 _ 11 _ 12 _ 16 _ | 17 _ _ 16 12 _ 9 _ | 16 _ 11 _ 12 _ 19 _ | 18 _ 16 _ 11 _ _ _', leadOct: 24, leadWave: 'triangle', leadVol: 0.07,
      drums: { k: 'x.........x.....', h: '..x...x...x...x.' } },
    boss1: { bpm: 140, root: 36, chords: ['0m', '-4M', '-2M', '-5M'], bass: 'x.x.o.x.x.x.o.x.', arpRate: 2, arpWave: 'square', arpOct: 24, arpVol: 0.014,
      lead: '0 0 3 0 5 0 7 5 | 8 _ 7 _ 5 _ 3 _ | 0 0 3 0 5 0 10 8 | 7 _ _ 11 12 _ _ _', leadOct: 24, leadWave: 'pulse', leadVol: 0.05,
      drums: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.' } },
    boss3: { bpm: 152, root: 40, chords: ['0m', '-4M', '-2M', '-5M'], bass: 'x.xox.x.x.xox.x.', arpRate: 1, arpWave: 'sine', arpOct: 36, arpVol: 0.02,
      lead: '12 _ 15 _ 19 _ 15 _ | 16 _ 15 _ 12 _ 11 _ | 12 _ 15 _ 19 _ 22 _ | 23 _ 19 _ 15 _ 11 _', leadOct: 12, leadWave: 'square', leadVol: 0.04,
      drums: { k: 'x..x..x.x..x..x.', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' } },
    clear: { bpm: 120, root: 48, chords: ['0M', '0M'], bass: 'x.......x.......', once: 32,
      lead: '0 4 7 12 _ _ 11 12 | 16 _ _ _ _ _ _ _', leadOct: 12, leadWave: 'pulse', leadVol: 0.06 },
    victory: { bpm: 110, root: 48, chords: ['0M', '5M', '7M', '0M'], bass: 'x...x...x...x...', once: 64, arpRate: 1, arpWave: 'square', arpOct: 24, arpVol: 0.015,
      lead: '7 _ 7 7 12 _ _ _ | 9 _ 11 _ 12 _ 16 _ | 19 _ _ _ 16 _ 12 _ | 24 _ _ _ _ _ _ _', leadOct: 12, leadWave: 'pulse', leadVol: 0.06,
      drums: { k: 'x.......x.......', s: '....x.......x...' } },
  };
  // variante del jefe 2: misma pieza del jefe 1, más aguda y rápida con otro timbre
  TRACKS.boss2 = Object.assign({}, TRACKS.boss1, { bpm: 148, root: 38, leadWave: 'square', arpWave: 'triangle', arpRate: 1 });
  for (const k in TRACKS) TRACKS[k].mel = parse(TRACKS[k].lead);

  function scheduleStep(inst, step, t) {
    const d = inst.def, dest = inst.gain, s16 = step % 16, sec = 60 / d.bpm / 4;
    const ch = d.chords[Math.floor(step / 16) % d.chords.length];
    const off = parseInt(ch, 10), q = Q[ch.slice(-1)] || Q.m;
    const b = d.bass && d.bass[s16];
    if (b && b !== '.') {
      const n = d.root + off + (b === 'o' ? 12 : b === 'f' ? 7 : 0);
      tone('triangle', hz(n), 0, sec * 1.8, 0.16, t, dest);
    }
    if (d.arpRate && step % d.arpRate === 0) {
      const n = d.root + off + d.arpOct + q[(step / d.arpRate) % 4];
      tone(d.arpWave, hz(n), 0, sec * 1.2, d.arpVol, t, dest);
    }
    if (step % 2 === 0) {
      const i = (step / 2) % d.mel.length, nt = d.mel[i];
      if (nt !== null && nt !== '_') {
        let len = 1; while (d.mel[(i + len) % d.mel.length] === '_' && len < 8) len++;
        tone(d.leadWave, hz(d.root + d.leadOct + nt), 0, sec * 2 * len * 0.92, d.leadVol, t, dest, 0.01);
      }
    }
    const dr = d.drums;
    if (dr) {
      if (dr.k && dr.k[s16] === 'x') tone('sine', 150, 42, 0.13, 0.35, t, dest);
      if (dr.s && dr.s[s16] === 'x') { noise(0.11, 0.14, t, 'bandpass', 1800, 1200, dest, 0.8); }
      if (dr.h && dr.h[s16] === 'x') noise(0.03, 0.05, t, 'highpass', 7000, 7000, dest);
    }
  }
  function music(name) {
    if (!ac || !unlock.done) { wanted = name; return; }
    if ((cur ? cur.name : null) === (name || null)) return;
    const now = ac.currentTime;
    if (cur) { cur.gain.gain.cancelScheduledValues(now); cur.gain.gain.setValueAtTime(cur.gain.gain.value, now); cur.gain.gain.linearRampToValueAtTime(0.0001, now + 0.9); cur.end = now + 1.0; fading.push(cur); }
    cur = null;
    if (!name || !TRACKS[name]) return;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(1, now + 0.8); g.connect(musicBus);
    cur = { name, def: TRACKS[name], gain: g, step: 0, next: now + 0.08 };
  }
  function update() {
    if (!ac || ac.state !== 'running') return;
    const now = ac.currentTime, ahead = now + 0.14;
    musicBus.gain.setTargetAtTime(0.5 * duck, now, 0.1);
    for (const inst of cur ? [cur, ...fading] : fading) {
      if (inst.next < now - 0.2) inst.next = now + 0.03;     // tras una pausa larga
      const sec = 60 / inst.def.bpm / 4;
      while (inst.next < ahead && !(inst.def.once && inst.step >= inst.def.once) && !(inst.end && inst.next > inst.end)) {
        scheduleStep(inst, inst.step, inst.next); inst.step++; inst.next += sec;
      }
    }
    fading = fading.filter(f => { if (now > f.end) { try { f.gain.disconnect(); } catch (e) {} return false; } return true; });
  }
  function setMuted(m) {
    prefs.muted = !!m; savePrefs();
    if (master) { const now = ac.currentTime; master.gain.cancelScheduledValues(now); master.gain.setTargetAtTime(prefs.muted ? 0 : prefs.vol, now, 0.03); }
    document.body && document.body.classList.toggle('muted', prefs.muted);
  }
  function toggle() { setMuted(!prefs.muted); if (!prefs.muted) sfx('select'); return prefs.muted; }
  window.addEventListener('keydown', e => { if (e.code === 'KeyM' && !e.repeat) { unlock(); toggle(); if (typeof Game !== 'undefined') Game.toast(prefs.muted ? 'Sonido desactivado' : 'Sonido activado', 1.5); } });
  if (document.body) document.body.classList.toggle('muted', prefs.muted);
  return {
    sfx, music, update, toggle, setMuted, unlock,
    set duck(v) { duck = v; },
    get muted() { return prefs.muted; },
    get ctx() { return ac; },
    get track() { return cur ? cur.name : null; },
    get unlocked() { return !!unlock.done; },
    TRACKS,
  };
})();
function sfx(name) { Sound.sfx(name); }
