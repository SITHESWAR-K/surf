/* ============================================================
   SUBWAY SUFFER — procedural WebAudio soundtrack + SFX
   ============================================================ */
(function () {
  "use strict";

  const SS = window.SS;
  const clamp = SS.U.clamp;

  const Audio = (function () {
    let ctx = null;
    let master = null;
    let sfxBus = null;
    let musicBus = null;
    let muted = false;
    let audioReady = false;
    let noiseBuffer = null;
    let musicTimer = null;
    let musicOn = false;
    let nextNoteTime = 0;
    let step = 0;
    let coinStreak = 0;
    let lastCoinAt = 0;

    function init() {
      if (ctx) return true;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      try {
        ctx = new Ctx();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.82;
        master.connect(ctx.destination);
        sfxBus = ctx.createGain();
        sfxBus.gain.value = 0.85;
        sfxBus.connect(master);
        musicBus = ctx.createGain();
        musicBus.gain.value = 0.3;
        musicBus.connect(master);

        const length = Math.floor(ctx.sampleRate * 0.7);
        noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
        audioReady = true;
        return true;
      } catch (err) {
        return false;
      }
    }

    function unlock() {
      if (!init()) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    }

    function setMuted(value) {
      muted = !!value;
      if (master && ctx) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(muted ? 0 : 0.82, ctx.currentTime, 0.03);
      }
    }

    function isMuted() {
      return muted;
    }

    function tone(opts) {
      if (!ctx || !audioReady) return;
      const now = opts.at || ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      let destination = sfxBus;
      if (opts.music) destination = musicBus;
      if (opts.bus) destination = opts.bus;
      osc.type = opts.type || "sine";
      osc.frequency.setValueAtTime(Math.max(20, opts.freq || 440), now);
      if (opts.freqEnd) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.freqEnd), now + (opts.duration || 0.2));
      }
      const vol = Math.max(0.0001, opts.volume == null ? 0.15 : opts.volume);
      const attack = opts.attack == null ? 0.006 : opts.attack;
      const duration = opts.duration || 0.2;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(vol, now + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      if (pan) {
        pan.pan.value = opts.pan == null ? 0 : opts.pan;
        gain.connect(pan);
        pan.connect(destination);
      } else {
        gain.connect(destination);
      }
      osc.start(now);
      osc.stop(now + duration + 0.03);
    }

    function noise(opts) {
      if (!ctx || !audioReady || !noiseBuffer) return;
      const now = opts.at || ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = opts.filter || "highpass";
      filter.frequency.setValueAtTime(opts.frequency || 800, now);
      if (opts.freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(40, opts.freqEnd), now + (opts.duration || 0.3));
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(Math.max(0.0001, opts.volume == null ? 0.2 : opts.volume), now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (opts.duration || 0.3));
      src.connect(filter);
      filter.connect(gain);
      gain.connect(opts.bus || sfxBus);
      src.start(now);
      src.stop(now + (opts.duration || 0.3) + 0.03);
    }

    function play(name, data) {
      if (!init()) return;
      if (muted) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      data = data || {};
      const now = ctx.currentTime;

      switch (name) {
        case "ui":
          tone({ freq: 660, freqEnd: 880, type: "triangle", duration: 0.08, volume: 0.08 });
          break;
        case "coin": {
          const nowMs = performance.now();
          if (nowMs - lastCoinAt > 900) coinStreak = 0;
          else coinStreak = Math.min(coinStreak + 1, 9);
          lastCoinAt = nowMs;
          const base = 1046 * Math.pow(2, coinStreak / 12);
          tone({ freq: base, freqEnd: base * 1.34, type: "triangle", duration: 0.11, volume: 0.09 });
          tone({ freq: base * 1.5, type: "sine", duration: 0.16, volume: 0.045, at: now + 0.035 });
          break;
        }
        case "jump":
          tone({ freq: 240, freqEnd: 620, type: "sine", duration: 0.16, volume: 0.08 });
          noise({ frequency: 1300, freqEnd: 3400, duration: 0.11, volume: 0.025 });
          break;
        case "land":
          tone({ freq: 150, freqEnd: 65, type: "sine", duration: 0.12, volume: 0.12 });
          noise({ frequency: 700, freqEnd: 220, duration: 0.08, volume: 0.04 });
          break;
        case "roll":
          noise({ frequency: 1400, freqEnd: 500, duration: 0.22, volume: 0.055 });
          break;
        case "switch":
          tone({ freq: 330, freqEnd: 460, type: "triangle", duration: 0.07, volume: 0.028, pan: (data.dir || 0) * 0.35 });
          break;
        case "powerup": {
          const notes = [523, 659, 784, 1046];
          notes.forEach((f, i) => tone({ freq: f, type: "triangle", duration: 0.22, volume: 0.075, at: now + i * 0.065 }));
          noise({ frequency: 2600, freqEnd: 5200, duration: 0.25, volume: 0.018 });
          break;
        }
        case "mission": {
          const notes = [659, 880, 1175, 1568];
          notes.forEach((f, i) => tone({ freq: f, type: "square", duration: 0.16, volume: 0.035, at: now + i * 0.08 }));
          break;
        }
        case "board":
          tone({ freq: 110, freqEnd: 440, type: "sawtooth", duration: 0.38, volume: 0.055 });
          tone({ freq: 550, freqEnd: 1100, type: "sine", duration: 0.32, volume: 0.055 });
          noise({ frequency: 900, freqEnd: 2600, duration: 0.35, volume: 0.03, filter: "bandpass" });
          break;
        case "boardBreak":
          noise({ frequency: 2400, freqEnd: 120, duration: 0.65, volume: 0.22 });
          tone({ freq: 330, freqEnd: 42, type: "sawtooth", duration: 0.55, volume: 0.11 });
          break;
        case "crash":
          tone({ freq: 95, freqEnd: 30, type: "sawtooth", duration: 0.8, volume: 0.2 });
          tone({ freq: 170, freqEnd: 55, type: "square", duration: 0.5, volume: 0.1 });
          noise({ frequency: 1700, freqEnd: 120, duration: 0.9, volume: 0.3, filter: "lowpass" });
          noise({ frequency: 4400, freqEnd: 800, duration: 0.4, volume: 0.14 });
          break;
        case "horn":
          tone({ freq: 196, type: "sawtooth", duration: 0.9, volume: 0.045, attack: 0.12 });
          tone({ freq: 247, type: "sawtooth", duration: 0.9, volume: 0.035, attack: 0.12 });
          break;
        case "gameover": {
          const notes = [392, 330, 262, 196];
          notes.forEach((f, i) => tone({ freq: f, type: "triangle", duration: 0.38, volume: 0.08, at: now + i * 0.15 }));
          break;
        }
        case "newBest": {
          const notes = [523, 659, 784, 1046, 1318];
          notes.forEach((f, i) => tone({ freq: f, type: "triangle", duration: 0.38, volume: 0.075, at: now + i * 0.1 }));
          break;
        }
        case "countdown":
          tone({ freq: data.last ? 880 : 440, type: "square", duration: data.last ? 0.3 : 0.11, volume: 0.055 });
          if (data.last) tone({ freq: 1320, type: "triangle", duration: 0.3, volume: 0.04, at: now + 0.02 });
          break;
        default:
          break;
      }
    }

    function musicStart() {
      if (!init()) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      if (musicOn) return;
      musicOn = true;
      nextNoteTime = ctx.currentTime + 0.08;
      step = 0;
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
      musicBus.gain.linearRampToValueAtTime(0.27, ctx.currentTime + 0.6);
      musicTimer = setInterval(scheduleMusic, 27);
    }

    function musicStop(fade) {
      if (!musicOn) return;
      musicOn = false;
      if (musicTimer) clearInterval(musicTimer);
      musicTimer = null;
      if (ctx && musicBus) {
        const t = ctx.currentTime;
        musicBus.gain.cancelScheduledValues(t);
        musicBus.gain.setTargetAtTime(0.0001, t, fade == null ? 0.12 : fade);
      }
    }

    let noiseHatBuffer = null;
    function scheduleMusic() {
      if (!musicOn || !ctx) return;
      while (nextNoteTime < ctx.currentTime + 0.14) {
        scheduleStep(step, nextNoteTime);
        step = (step + 1) % 64;
        nextNoteTime += 60 / 112 / 4;
      }
    }

    // A-minor drive, four two-bar chords.
    const bassNotes = [110.0, 98.0, 130.81, 87.31];
    const chordNotes = [
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [261.63, 329.63, 392.0],
      [196.0, 246.94, 293.66]
    ];
    const arpScale = [440, 523.25, 659.25, 783.99, 659.25, 523.25];

    function scheduleStep(s, at) {
      const bar = Math.floor(s / 8) % 4;
      const beat = s % 8;
      if (muted) return;

      // Kick
      if (beat === 0 || beat === 4 || (bar % 2 === 1 && beat === 6)) {
        tone({ freq: 120, freqEnd: 44, type: "sine", duration: 0.2, volume: 0.18, at, music: true });
      }
      // Snare / clap
      if (beat === 2 || beat === 6) {
        noise({ frequency: 2100, freqEnd: 800, duration: 0.11, volume: 0.055, at, filter: "bandpass" });
        tone({ freq: 190, freqEnd: 120, type: "triangle", duration: 0.1, volume: 0.03, at, music: true });
      }
      // Hats
      if (s % 2 === 0) {
        noise({ frequency: 7200, duration: 0.03, volume: s % 4 === 0 ? 0.022 : 0.012, at, filter: "highpass", bus: musicBus });
      }
      // Bass
      if (s % 2 === 0) {
        const freq = bassNotes[bar] * (beat === 6 ? 1.5 : 1);
        tone({ freq, freqEnd: freq * 0.995, type: "triangle", duration: 0.19, volume: 0.07, at, music: true });
      }
      // Warm pad swells at the top of each two bars
      if (beat === 0 && s % 16 === 0) {
        chordNotes[bar].forEach((f, i) => {
          tone({ freq: f, type: "sine", duration: 1.45, volume: 0.018, attack: 0.3, at: at + i * 0.01, music: true });
          tone({ freq: f / 2, type: "triangle", duration: 1.2, volume: 0.012, attack: 0.25, at, music: true });
        });
      }
      // Sparse arp
      if (beat === 3 || beat === 5 || beat === 7) {
        const f = arpScale[(s + bar) % arpScale.length] * (bar === 3 ? 0.75 : 1);
        tone({ freq: f, type: "triangle", duration: 0.16, volume: 0.018, at, music: true });
      }
    }

    return {
      init,
      unlock,
      play,
      setMuted,
      isMuted,
      startMusic: musicStart,
      stopMusic: musicStop,
      musicStart,
      musicStop,
      get ready() { return audioReady; }
    };
  })();

  SS.Audio = Audio;
})();
