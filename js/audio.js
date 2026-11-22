/* ============================================================
   SUBWAY SUFFER — procedural WebAudio soundtrack, rail ambience & SFX
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
    let ambientBus = null;
    let windSource = null;
    let windFilter = null;
    let windGain = null;
    let muted = false;
    let audioReady = false;
    let noiseBuffer = null;
    let musicTimer = null;
    let musicOn = false;
    let nextNoteTime = 0;
    let step = 0;
    let coinStreak = 0;
    let lastCoinAt = 0;
    let currentSpeedRatio = 0;
    let currentTunnel = 0;

    function init() {
      if (ctx) return true;
      if (typeof navigator !== "undefined" && navigator.userActivation && !navigator.userActivation.hasBeenActive) {
        return false;
      }
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
        musicBus.gain.value = 0.28;
        musicBus.connect(master);

        ambientBus = ctx.createGain();
        ambientBus.gain.value = 0.0001;
        ambientBus.connect(master);

        const length = Math.floor(ctx.sampleRate * 1.4);
        noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < length; i++) {
          const white = Math.random() * 2 - 1;
          last = (last + 0.06 * white) / 1.06;
          data[i] = clamp(white * 0.55 + last * 1.4, -1, 1);
        }

        // Continuous speed-reactive rail/wind ambience loop.
        windSource = ctx.createBufferSource();
        windSource.buffer = noiseBuffer;
        windSource.loop = true;
        windFilter = ctx.createBiquadFilter();
        windFilter.type = "bandpass";
        windFilter.frequency.value = 260;
        windFilter.Q.value = 0.7;
        windGain = ctx.createGain();
        windGain.gain.value = 0.0001;
        windSource.connect(windFilter);
        windFilter.connect(windGain);
        windGain.connect(ambientBus);
        windSource.start();

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

    function updateAmbience(speedRatio, tunnelFactor, rainIntensity, active) {
      currentSpeedRatio = clamp(speedRatio || 0, 0, 1);
      currentTunnel = clamp(tunnelFactor || 0, 0, 1);
      if (!ctx || !audioReady || !windGain || !windFilter || !ambientBus) return;
      const now = ctx.currentTime;
      const targetAmbient = active && !muted ? 1 : 0.0001;
      ambientBus.gain.setTargetAtTime(targetAmbient, now, 0.12);
      const targetVol = active ? (0.025 + currentSpeedRatio * 0.06 + (rainIntensity || 0) * 0.035 + currentTunnel * 0.04) : 0.0001;
      const targetFreq = 190 + currentSpeedRatio * 420 + (rainIntensity || 0) * 320 - currentTunnel * 110;
      windGain.gain.setTargetAtTime(targetVol, now, 0.08);
      windFilter.frequency.setTargetAtTime(Math.max(90, targetFreq), now, 0.08);
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
        pan.pan.value = clamp(opts.pan == null ? 0 : opts.pan, -1, 1);
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
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(Math.max(0.0001, opts.volume == null ? 0.2 : opts.volume), now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (opts.duration || 0.3));
      src.connect(filter);
      filter.connect(gain);
      if (pan) {
        pan.pan.value = clamp(opts.pan == null ? 0 : opts.pan, -1, 1);
        gain.connect(pan);
        pan.connect(opts.bus || sfxBus);
      } else {
        gain.connect(opts.bus || sfxBus);
      }
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
          tone({ freq: 640, freqEnd: 880, type: "triangle", duration: 0.075, volume: 0.075 });
          break;
        case "buy":
          tone({ freq: 587, type: "triangle", duration: 0.14, volume: 0.08, at: now });
          tone({ freq: 880, type: "triangle", duration: 0.18, volume: 0.085, at: now + 0.065 });
          tone({ freq: 1175, type: "sine", duration: 0.24, volume: 0.07, at: now + 0.13 });
          break;
        case "coin": {
          const nowMs = performance.now();
          if (nowMs - lastCoinAt > 900) coinStreak = 0;
          else coinStreak = Math.min(coinStreak + 1, 10);
          lastCoinAt = nowMs;
          const base = 1046 * Math.pow(2, coinStreak / 12);
          tone({ freq: base, freqEnd: base * 1.32, type: "triangle", duration: 0.1, volume: 0.085, pan: data.pan || 0 });
          tone({ freq: base * 1.5, type: "sine", duration: 0.15, volume: 0.04, at: now + 0.032, pan: data.pan || 0 });
          break;
        }
        case "jump":
          tone({ freq: 230, freqEnd: 610, type: "sine", duration: 0.16, volume: 0.08 });
          noise({ frequency: 1300, freqEnd: 3400, duration: 0.1, volume: 0.025 });
          break;
        case "land":
          tone({ freq: 145, freqEnd: 58, type: "sine", duration: 0.12, volume: 0.12 });
          noise({ frequency: 680, freqEnd: 200, duration: 0.08, volume: 0.042 });
          break;
        case "roll":
          noise({ frequency: 1400, freqEnd: 460, duration: 0.22, volume: 0.055 });
          break;
        case "switch":
          tone({ freq: 330, freqEnd: 460, type: "triangle", duration: 0.068, volume: 0.03, pan: (data.dir || 0) * 0.42 });
          break;
        case "whoosh":
          noise({ frequency: 520, freqEnd: 1650, duration: 0.22, volume: 0.075, filter: "bandpass", pan: data.pan || 0 });
          tone({ freq: 520, freqEnd: 780, type: "sine", duration: 0.13, volume: 0.045, pan: data.pan || 0 });
          break;
        case "stumble":
          noise({ frequency: 1900, freqEnd: 320, duration: 0.28, volume: 0.16, filter: "bandpass" });
          tone({ freq: 150, freqEnd: 72, type: "sawtooth", duration: 0.26, volume: 0.1 });
          break;
        case "whistle": {
          // Inspector police/rail whistle trill
          tone({ freq: 2780, freqEnd: 2920, type: "sine", duration: 0.16, volume: 0.055, at: now });
          tone({ freq: 2920, freqEnd: 2660, type: "sine", duration: 0.24, volume: 0.05, at: now + 0.17 });
          tone({ freq: 2820, freqEnd: 2540, type: "triangle", duration: 0.18, volume: 0.035, at: now + 0.08 });
          break;
        }
        case "jetpack":
          noise({ frequency: 420, freqEnd: 1850, duration: 0.55, volume: 0.13, filter: "bandpass" });
          tone({ freq: 140, freqEnd: 680, type: "sawtooth", duration: 0.48, volume: 0.065 });
          tone({ freq: 280, freqEnd: 1120, type: "triangle", duration: 0.42, volume: 0.05, at: now + 0.04 });
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
        case "horn": {
          // Authentic dual-chime subway horn with Doppler pitch drop and lane panning.
          const pan = data.pan || 0;
          const drop = data.doppler ? 0.84 : 0.97;
          tone({ freq: 185, freqEnd: 185 * drop, type: "sawtooth", duration: 0.92, volume: 0.048, attack: 0.1, pan });
          tone({ freq: 233, freqEnd: 233 * drop, type: "sawtooth", duration: 0.92, volume: 0.038, attack: 0.1, pan });
          tone({ freq: 370, freqEnd: 370 * drop, type: "triangle", duration: 0.85, volume: 0.018, attack: 0.12, pan });
          break;
        }
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
      musicBus.gain.linearRampToValueAtTime(0.26, ctx.currentTime + 0.6);
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

    function scheduleMusic() {
      if (!musicOn || !ctx) return;
      const bpm = 112 + currentSpeedRatio * 18;
      while (nextNoteTime < ctx.currentTime + 0.14) {
        scheduleStep(step, nextNoteTime);
        step = (step + 1) % 64;
        nextNoteTime += 60 / bpm / 4;
      }
    }

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
      // Subtle steel rail clack on off-beats when moving fast
      if (currentSpeedRatio > 0.15 && (beat === 1 || beat === 5)) {
        noise({ frequency: 3400, freqEnd: 1600, duration: 0.025, volume: 0.012 + currentSpeedRatio * 0.014, at, filter: "bandpass", bus: musicBus });
      }
      // Snare / clap
      if (beat === 2 || beat === 6) {
        noise({ frequency: 2100, freqEnd: 800, duration: 0.11, volume: 0.052, at, filter: "bandpass", bus: musicBus });
        tone({ freq: 190, freqEnd: 120, type: "triangle", duration: 0.1, volume: 0.03, at, music: true });
      }
      // Hats
      if (s % 2 === 0) {
        noise({ frequency: 7200, duration: 0.03, volume: s % 4 === 0 ? 0.02 : 0.011, at, filter: "highpass", bus: musicBus });
      }
      // Bass
      if (s % 2 === 0) {
        const freq = bassNotes[bar] * (beat === 6 ? 1.5 : 1);
        tone({ freq, freqEnd: freq * 0.995, type: "triangle", duration: 0.19, volume: 0.07, at, music: true });
      }
      // Warm pad swells
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
      updateAmbience,
      startMusic: musicStart,
      stopMusic: musicStop,
      musicStart,
      musicStop,
      get ready() { return audioReady; }
    };
  })();

  SS.Audio = Audio;
})();
