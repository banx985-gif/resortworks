// Sound effects and music (bible §35; Robot Workshop Milestone 25). Every sound is made in code from a recipe in game
// data (core/SoundSynth.js) until a real file exists: a file listed in the audio manifest (assets/audio/<id>.mp3 or
// .ogg, found at publish time) replaces its code-made sound with no code change.
//
//   new AudioManager({ bus, sounds, music, basePath, fileList, createContext, sampleRate, caps })
//   sounds: { id: { recipe, group: 'ui'|'workshop'|'progression'|'competition'|'economy', loop?, vary?, volume? } }
//   music:  { id: recipe (SoundSynth music recipe) }
//   play(id) → true if it sounded (or would have, before the first tap)      startLoop(id, key) / stopLoop(key)
//   playMusic(id) (crossfades from the current track)  stopMusic()
//   setVolumes({ sfx, music }) 0–1 · setMuted(bool) · unlock() (call from the first tap; installUnlock() does it)
//
// Caps (§35.3), all here: at most 10 sound voices at once (a new important sound takes the oldest ui / workshop
// voice's place; otherwise the new one is dropped), at most 3 tool loops, at most 2 UI sounds within 100 ms, and the
// same sound never restarted within minGapMs. Repeated workshop / UI sounds vary ±4% in pitch and ±5% in volume.
// Phones only allow sound after the first tap: until then plays are counted and logged but silent, with no errors.
// Emits 'audio:play' ({ name, silent, dropped }).
//
// In the background (Fixes queue, 30 Sept 2026) — every game gets this through installUnlock(): while the page is
// hidden or the phone app is away (home button, app switcher, screen lock, a call over the game), the sound engine is
// suspended, so music and tool loops stop exactly where they are and carry on from there when the game is back.
// Sound effects asked for meanwhile are counted but silent (otherwise they would all go off at once on return).
// Nothing is switched on that the player had off: muted stays muted, and no engine is made before the first tap.
// If the phone will not restart sound on its own, the next tap does it.
//   installUnlock(target, { bridge }) → also installBackground({ win, doc, bridge }) (bridge: a core/NativeBridge; made if missing) · setAway(reason, bool) · away → true while away
import { renderSound, renderMusic } from './SoundSynth.js';
import { NativeBridge } from './NativeBridge.js';

const IMPORTANT = new Set(['progression', 'competition', 'economy']);

export class AudioManager {
  constructor({ bus = null, sounds = {}, music = {}, basePath = '', fileList = null, createContext = null, sampleRate = 22050, caps = {}, volume = 1, musicVolume = 0.6, muted = false, random = Math.random, now = () => globalThis.performance?.now() ?? Date.now() } = {}) {
    this.bus = bus;
    this.sounds = sounds;
    this.music = music;
    this.basePath = basePath;
    this.fileList = fileList; // () => Promise<[ 'id.mp3', … ]>  (the audio manifest)
    this.createContext = createContext ?? (() => new (globalThis.AudioContext || globalThis.webkitAudioContext)());
    this.sampleRate = sampleRate;
    this.caps = { maxVoices: 10, maxLoops: 3, uiPerWindow: 2, uiWindowMs: 100, minGapMs: 60, pitchVary: 0.04, volumeVary: 0.05, crossfadeSec: 1.5, ...caps };
    this.volume = volume; // sound effects 0–1
    this.musicVolume = musicVolume;
    this.muted = muted;
    this.random = random;
    this.now = now;
    this.ctx = null;
    this.buffers = new Map(); // id → AudioBuffer (code-made or from a file)
    this.fromFile = new Set(); // ids whose sound came from a real file
    this.voices = []; // { src, gain, id, group, at }
    this.loops = new Map(); // key → { src, gain, id }
    this.track = null; // { id, src, gain }
    this.counts = {};
    this.log = [];
    this.peakVoices = 0;
    this.dropped = 0;
    this._last = {};
    this._ui = [];
    this.wantedMusic = null;
    this._away = new Set(); // why the game is out of sight: 'page' (hidden tab / WebView), 'app' (Android app paused)
    this.awayCounts = { suspend: 0, resume: 0, tapResume: 0 }; // for checks
  }

  // --- start-up ------------------------------------------------------------------------------------------------------
  installUnlock(target = globalThis.window, { bridge = null } = {}) {
    if (!target?.addEventListener) return;
    const go = () => {
      this.unlock();
      for (const e of ['pointerdown', 'touchend', 'keydown']) target.removeEventListener(e, go, true);
    };
    for (const e of ['pointerdown', 'touchend', 'keydown']) target.addEventListener(e, go, true);
    this.installBackground({ win: target, bridge });
  }

  // --- in the background -------------------------------------------------------------------------------------------
  installBackground({ win = globalThis.window, doc = win?.document, bridge = null } = {}) {
    if (this._bgInstalled || !win?.addEventListener) return;
    this._bgInstalled = true;
    const page = () => this.setAway('page', !!doc?.hidden || doc?.visibilityState === 'hidden');
    doc?.addEventListener?.('visibilitychange', page);
    win.addEventListener('pagehide', () => this.setAway('page', true));
    win.addEventListener('pageshow', page);
    // Capacitor's own pause / resume page events, and its App plugin's state (the Android app left / came back).
    doc?.addEventListener?.('pause', () => this.setAway('app', true));
    doc?.addEventListener?.('resume', () => this.setAway('app', false));
    bridge ??= win.Capacitor ? new NativeBridge({ win }) : null;
    if (bridge?.isNative) bridge.onAppState?.((active) => this.setAway('app', !active));
    // A tap means the game is in front: clear anything left over, and restart sound if the phone held it back.
    const tap = () => {
      if (this._away.size) this._away.clear();
      if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
        this.awayCounts.tapResume++;
        this._wake();
      }
    };
    for (const e of ['pointerdown', 'touchend', 'keydown']) win.addEventListener(e, tap, true);
  }

  get away() {
    return this._away.size > 0;
  }

  setAway(reason, on) {
    const was = this.away;
    if (on) this._away.add(reason);
    else this._away.delete(reason);
    if (this.away === was) return;
    if (this.away) this._sleep();
    else this._wake();
  }

  _sleep() {
    if (!this.ctx) return;
    this.awayCounts.suspend++;
    try {
      this.ctx.suspend?.()?.catch?.(() => {});
    } catch {}
  }

  _wake() {
    // Always ask (even if it still reads 'running'): a quick hide + show can land before the suspend has finished, and
    // the engine carries out suspend / resume in the order asked.
    if (!this.ctx || this.away || this.ctx.state === 'closed') return;
    this.awayCounts.resume++;
    try {
      this.ctx.resume?.()?.catch?.(() => {}); // refused (phone wants a tap first): the next tap tries again
    } catch {}
  }

  unlock() {
    try {
      if (!this.ctx) {
        this.ctx = this.createContext();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.sfxBus = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus.connect(this.master);
        this.musicBus.connect(this.master);
        this._applyVolumes();
        this._loadFiles();
        this.warmUp();
      }
      if (this.ctx.state === 'suspended' && !this.away) this.ctx.resume?.().catch?.(() => {});
      if (this.wantedMusic && !this.track) this.playMusic(this.wantedMusic, { force: true });
    } catch (err) {
      this.ctx = null; // no sound on this device: the game carries on silently
    }
    return !!this.ctx;
  }

  // Make the code-made sounds and tracks ahead of time, one every few frames, so the first play of a track never
  // stalls a frame (each track takes a moment to build).
  warmUp({ gapMs = 60 } = {}) {
    if (!this.ctx || this._warming) return;
    const todo = [...Object.keys(this.music).map((id) => [id, true]), ...Object.keys(this.sounds).map((id) => [id, false])];
    this._warming = true;
    const step = () => {
      const next = todo.shift();
      if (!next) return (this._warming = false);
      try {
        if (!this.buffers.has(next[0])) this._buffer(next[0], { music: next[1] });
      } catch {}
      setTimeout(step, gapMs);
    };
    setTimeout(step, gapMs);
  }

  get unlocked() {
    return !!this.ctx;
  }

  // Real files replace code-made sounds (the manifest lists what is in assets/audio/).
  async _loadFiles() {
    let list = [];
    try {
      list = (await this.fileList?.()) ?? [];
    } catch {
      list = [];
    }
    for (const file of list) {
      const id = file.replace(/\.(mp3|ogg|wav|m4a)$/i, '');
      if (!this.sounds[id] && !this.music[id]) continue;
      try {
        const res = await fetch(this.basePath + file);
        if (!res.ok) continue;
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(id, buf);
        this.fromFile.add(id);
        if (this.track?.id === id) this.playMusic(id, { force: true });
      } catch {
        /* a broken file: the code-made sound stays */
      }
    }
  }

  _buffer(id, { music = false } = {}) {
    let b = this.buffers.get(id);
    if (b) return b;
    const data = music ? renderMusic(this.music[id], this.sampleRate) : renderSound(this.sounds[id].recipe, this.sampleRate);
    b = this.ctx.createBuffer(1, data.length, this.sampleRate);
    if (b.copyToChannel) b.copyToChannel(data, 0);
    else b.getChannelData(0).set(data);
    this.buffers.set(id, b);
    return b;
  }

  // --- volumes -------------------------------------------------------------------------------------------------------
  setVolumes({ sfx = this.volume, music = this.musicVolume } = {}) {
    this.volume = sfx;
    this.musicVolume = music;
    this._applyVolumes();
  }

  setMuted(m) {
    this.muted = !!m;
    this._applyVolumes();
  }

  _applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setValueAtTime(this.muted ? 0 : this.volume, t);
    this.musicBus.gain.setValueAtTime(this.muted ? 0 : this.musicVolume, t);
  }

  // --- effects ---------------------------------------------------------------------------------------------------------
  play(name) {
    const def = this.sounds[name];
    if (!def) {
      console.warn(`[AudioManager] unknown sound "${name}"`);
      return false;
    }
    const now = this.now();
    if (now - (this._last[name] ?? -Infinity) < this.caps.minGapMs) return false;
    if (def.group === 'ui') {
      this._ui = this._ui.filter((t) => now - t < this.caps.uiWindowMs);
      if (this._ui.length >= this.caps.uiPerWindow) return this._drop(name);
      this._ui.push(now);
    }
    this._last[name] = now;
    this.counts[name] = (this.counts[name] ?? 0) + 1;
    const silent = !this.ctx || this.muted || !this.volume || this.away;
    this._log(name, silent);
    if (silent) return true;
    this._reap();
    if (this.voices.length >= this.caps.maxVoices) {
      const victim = IMPORTANT.has(def.group) ? this.voices.find((v) => !IMPORTANT.has(v.group)) : null;
      if (!victim) return this._drop(name);
      this._stopVoice(victim);
    }
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this._buffer(name);
      const gain = this.ctx.createGain();
      const vary = def.vary ?? (def.group === 'ui' || def.group === 'workshop');
      const r = () => this.random() * 2 - 1;
      src.playbackRate.value = vary ? 1 + r() * this.caps.pitchVary : 1;
      gain.gain.value = (def.volume ?? 1) * (vary ? 1 + r() * this.caps.volumeVary : 1);
      src.connect(gain);
      gain.connect(this.sfxBus);
      const v = { src, gain, id: name, group: def.group, at: now, endsAt: now + (src.buffer.duration / src.playbackRate.value) * 1000 + 30 };
      src.onended = () => (this.voices = this.voices.filter((x) => x !== v));
      src.start();
      this.voices.push(v);
      this.peakVoices = Math.max(this.peakVoices, this.voices.length);
    } catch {
      /* the device refused: stay quiet */
    }
    return true;
  }

  _drop(name) {
    this.dropped++;
    this.bus?.emit('audio:play', { name, silent: true, dropped: true });
    return false;
  }

  _log(name, silent) {
    this.log.push({ name, at: this.now(), silent });
    if (this.log.length > 30) this.log.shift();
    this.bus?.emit('audio:play', { name, silent });
  }

  // Voices whose sound has had time to finish are let go (even if the device never said "ended").
  _reap() {
    const now = this.now();
    this.voices = this.voices.filter((v) => now < v.endsAt);
  }

  _stopVoice(v) {
    try {
      v.src.stop();
    } catch {}
    v.ended = true;
    this.voices = this.voices.filter((x) => x !== v);
  }

  // --- tool loops (welding, test motor, keyboard, charging hum) ---------------------------------------------------------
  startLoop(id, key = id) {
    if (this.loops.has(key)) return true;
    if (this.loops.size >= this.caps.maxLoops) return this._drop(id);
    const def = this.sounds[id];
    if (!def) return false;
    this.counts[id] = (this.counts[id] ?? 0) + 1;
    this._log(id, !this.ctx || this.muted);
    if (!this.ctx) {
      this.loops.set(key, { id, src: null, gain: null });
      return true;
    }
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this._buffer(id);
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime?.(def.volume ?? 0.5, this.ctx.currentTime + 0.25);
      src.connect(gain);
      gain.connect(this.sfxBus);
      src.start();
      this.loops.set(key, { id, src, gain });
    } catch {
      return false;
    }
    return true;
  }

  stopLoop(key) {
    const l = this.loops.get(key);
    if (!l) return false;
    this.loops.delete(key);
    if (l.src && this.ctx) {
      const t = this.ctx.currentTime;
      try {
        l.gain.gain.setValueAtTime(l.gain.gain.value, t);
        l.gain.gain.linearRampToValueAtTime(0, t + 0.2);
        l.src.stop(t + 0.25);
      } catch {}
    }
    return true;
  }

  stopAllLoops() {
    for (const k of [...this.loops.keys()]) this.stopLoop(k);
  }

  // --- music ------------------------------------------------------------------------------------------------------------
  playMusic(id, { force = false } = {}) {
    if (!this.music[id]) return false;
    if (!force && (this.track?.id === id || (!this.ctx && this.wantedMusic === id))) return true;
    this.wantedMusic = id;
    this.counts[id] = (this.counts[id] ?? 0) + 1;
    this._log(id, !this.ctx);
    if (!this.ctx) return true; // starts with the first tap
    const t = this.ctx.currentTime;
    const x = this.caps.crossfadeSec;
    const old = this.track;
    if (old?.src) {
      try {
        old.gain.gain.setValueAtTime(old.gain.gain.value, t);
        old.gain.gain.linearRampToValueAtTime(0, t + x);
        old.src.stop(t + x + 0.05);
      } catch {}
    }
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this._buffer(id, { music: !this.fromFile.has(id) });
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(1, t + x);
      src.connect(gain);
      gain.connect(this.musicBus);
      src.start();
      this.track = { id, src, gain };
    } catch {
      this.track = null;
    }
    return true;
  }

  stopMusic() {
    this.wantedMusic = null;
    const old = this.track;
    this.track = null;
    if (old?.src && this.ctx) {
      const t = this.ctx.currentTime;
      try {
        old.gain.gain.setValueAtTime(old.gain.gain.value, t);
        old.gain.gain.linearRampToValueAtTime(0, t + this.caps.crossfadeSec);
        old.src.stop(t + this.caps.crossfadeSec + 0.05);
      } catch {}
    }
  }

  get currentMusic() {
    return this.wantedMusic;
  }
}
