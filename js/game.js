/* ============================================================
   SUBWAY SUFFER — gameplay, inputs, progression and UI
   ============================================================ */
(function () {
  "use strict";

  const SS = window.SS;
  const U = SS.U;
  const C = SS.CONFIG;
  const Audio = SS.Audio;
  const Render = SS.Render;
  const view = SS.view;
  const TAU = Math.PI * 2;

  const $ = (id) => document.getElementById(id);
  const canvas = $("gameCanvas");

  const els = {
    hud: $("hud"),
    menu: $("menu"),
    playBtn: $("playBtn"),
    againBtn: $("againBtn"),
    menuBtn: $("menuBtn"),
    resumeBtn: $("resumeBtn"),
    restartBtn: $("restartBtn"),
    quitBtn: $("quitBtn"),
    pauseBtn: $("pauseBtn"),
    soundBtn: $("soundBtn"),
    menuSoundBtn: $("menuSoundBtn"),
    boardHud: $("boardHud"),
    boardCount: $("boardCount"),
    scoreValue: $("scoreValue"),
    coinValue: $("coinValue"),
    distanceValue: $("distanceValue"),
    bestHud: $("bestHud"),
    speedValue: $("speedValue"),
    speedBadge: $("speedBadge"),
    powerupStack: $("powerupStack"),
    missionChip: $("missionChip"),
    missionText: $("missionText"),
    missionProgress: $("missionProgress"),
    toastLayer: $("toastLayer"),
    pauseModal: $("pauseModal"),
    gameOverModal: $("gameOverModal"),
    pauseScore: $("pauseScore"),
    pauseDistance: $("pauseDistance"),
    pauseCoins: $("pauseCoins"),
    finalScore: $("finalScore"),
    finalDistance: $("finalDistance"),
    finalCoins: $("finalCoins"),
    finalSpeed: $("finalSpeed"),
    newBest: $("newBest"),
    gameOverKicker: $("gameOverKicker"),
    gameOverTitle: $("gameOverTitle"),
    missionResults: $("missionResults"),
    menuBest: $("menuBest"),
    menuCoins: $("menuCoins"),
    menuRuns: $("menuRuns"),
    countdown: $("countdown"),
    flash: $("flash"),
    runnerPicker: $("runnerPicker"),
    touchControls: $("touchControls")
  };

  let save = SS.loadSave();
  let selectedSkin = save.skin;

  function makePlayer() {
    return {
      x: 0,
      y: 0,
      vy: 0,
      lane: 1,
      onGround: true,
      rolling: false,
      rollTimer: 0,
      jumpBuffer: 0,
      tilt: 0,
      runPhase: 0,
      crashSpin: 0,
      boardTime: 0,
      invuln: 0,
      shadowY: 0,
      supportTrain: null,
      effects: { magnet: 0, multiplier: 0, sneakers: 0 }
    };
  }

  const game = {
    mode: "menu",
    time: 0,
    distance: 0,
    speed: 0,
    topSpeed: 0,
    menuScroll: 0,
    theme: SS.themeFor(0.03),
    player: makePlayer(),
    entities: [],
    particles: [],
    skin: selectedSkin,
    shakeX: 0,
    shakeY: 0,
    speedLines: 0,
    jumpPose: 0.6,
    cameraOffset: 0
  };

  let score = 0;
  let coinsRun = 0;
  let hoverboards = 1;
  let missions = SS.makeMissions();
  let stats = makeStats();
  let nextRowWorldZ = 58;
  let rowCount = 0;
  let nextTrainRow = 4;
  let nextPowerupRow = 3;
  let shake = 0;
  let lastCrashCause = "train";
  let crashTimer = 0;
  let goTimer = 0;
  let powerupEls = {};
  let displayTime = 0;
  let hudCache = {};
  let countdownHideTimer = 0;
  let footDustTimer = 0;
  let hornTimer = 10;
  let lastScoreShown = -1;
  let highScoreAtStart = save.highScore;
  let pointerStart = null;
  let lastParticleCleanup = 0;
  let booted = false;

  function makeStats() {
    return {
      jumps: 0,
      rolls: 0,
      powerups: 0,
      boards: 0,
      boardSaves: 0,
      nearMisses: 0,
      missionsDone: 0,
      coinPitch: 0
    };
  }

  // ------------------------------------------------------------
  // Shorthand / DOM helpers
  // ------------------------------------------------------------
  function setText(el, value) {
    if (!el) return;
    const str = String(value);
    if (el.textContent !== str) el.textContent = str;
  }

  function setHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle("is-hidden", hidden);
  }

  function showToast(message, tone) {
    if (!els.toastLayer) return;
    while (els.toastLayer.children.length >= 3) els.toastLayer.removeChild(els.toastLayer.firstChild);
    const toast = document.createElement("div");
    toast.className = "toast" + (tone ? " " + tone : "");
    toast.textContent = message;
    els.toastLayer.appendChild(toast);
    window.setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2200);
  }

  function flashScreen() {
    if (!els.flash) return;
    els.flash.classList.remove("flash-hit");
    void els.flash.offsetWidth;
    els.flash.classList.add("flash-hit");
  }

  function countdown(text, duration) {
    if (!els.countdown) return;
    els.countdown.innerHTML = "<span>" + text + "</span>";
    els.countdown.classList.remove("is-hidden");
    els.countdown.style.animation = "none";
    void els.countdown.offsetWidth;
    els.countdown.style.animation = "";
    window.clearTimeout(countdownHideTimer);
    countdownHideTimer = window.setTimeout(() => {
      els.countdown.classList.add("is-hidden");
    }, duration || 820);
  }

  function soundOn() {
    return !save.muted;
  }

  function updateSoundUI() {
    const on = soundOn();
    if (els.menuSoundBtn) els.menuSoundBtn.textContent = "SOUND: " + (on ? "ON" : "OFF");
    if (els.soundBtn) {
      els.soundBtn.setAttribute("aria-label", on ? "Mute sound" : "Unmute sound");
      els.soundBtn.title = (on ? "Mute" : "Unmute") + " (M)";
    }
    document.body.classList.toggle("is-muted", !on);
  }

  function toggleMute() {
    save.muted = !save.muted;
    Audio.setMuted(save.muted);
    SS.persistSave(save);
    updateSoundUI();
    if (!save.muted) {
      Audio.unlock();
      Audio.play("ui");
    }
  }

  function updateMenuStats() {
    setText(els.menuBest, U.formatNum(save.highScore));
    setText(els.menuCoins, U.formatNum(save.totalCoins));
    setText(els.menuRuns, U.formatNum(save.runs));
    setText(els.bestHud, "BEST " + U.formatNum(save.highScore));
  }

  function updateMenuPreview() {
    game.skin = selectedSkin;
    if (game.mode === "menu") game.player = makePlayer();
    els.runnerPicker.querySelectorAll(".runner-option").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.skin === selectedSkin);
      const skin = SS.SKINS[btn.dataset.skin];
      if (skin) btn.style.setProperty("--skin", skin.css);
    });
  }

  function selectSkin(key, audible) {
    if (!SS.SKINS[key] || key === selectedSkin) return;
    selectedSkin = key;
    game.skin = key;
    save.skin = key;
    SS.persistSave(save);
    updateMenuPreview();
    if (audible) Audio.play("ui");
  }

  // ------------------------------------------------------------
  // Boot and mode transitions
  // ------------------------------------------------------------
  function boot() {
    Render.init(canvas);
    Audio.setMuted(save.muted);
    updateSoundUI();
    updateMenuStats();

    els.runnerPicker.querySelectorAll(".runner-option").forEach((btn) => {
      const skin = SS.SKINS[btn.dataset.skin];
      if (skin) {
        btn.style.setProperty("--skin", skin.css);
        const portrait = btn.querySelector("canvas");
        if (portrait) Render.drawAvatar(portrait, btn.dataset.skin);
      }
    });
    updateMenuPreview();
    bindEvents();
    setModeUI("menu");
    requestAnimationFrame(loop);
    booted = true;
  }

  function setModeUI(mode) {
    const inGame = mode !== "menu";
    setHidden(els.menu, inGame);
    if (inGame) els.menu.classList.remove("leaving");
    setHidden(els.hud, !inGame);
    setHidden(els.pauseModal, mode !== "paused");
    setHidden(els.gameOverModal, mode !== "gameover");
    if (mode === "menu") {
      els.hud.classList.add("is-hidden");
    }
  }

  function showMenu() {
    game.mode = "menu";
    game.entities = [];
    game.particles = [];
    game.distance = 0;
    game.speed = 0;
    game.topSpeed = 0;
    game.theme = SS.themeFor(0.03);
    game.player = makePlayer();
    game.shakeX = 0;
    game.shakeY = 0;
    game.speedLines = 0;
    shake = 0;
    setHidden(els.countdown, true);
    els.menu.classList.remove("is-hidden", "leaving");
    updateMenuPreview();
    updateMenuStats();
    setModeUI("menu");
    els.menu.scrollTop = 0;
    Audio.stopMusic();
    updateHud(true);
  }

  function startRun() {
    if (game.mode === "playing") return;
    Audio.unlock();
    Audio.startMusic();
    Audio.play("ui");

    score = 0;
    coinsRun = 0;
    hoverboards = 1;
    stats = makeStats();
    missions = SS.makeMissions();
    nextRowWorldZ = 58;
    rowCount = 0;
    nextTrainRow = 4;
    nextPowerupRow = 2 + U.randInt(0, 2);
    game.entities = [];
    game.particles = [];
    game.distance = 0;
    game.speed = C.baseSpeed * 0.58;
    game.topSpeed = 0;
    game.theme = SS.themeFor(0.03);
    game.player = makePlayer();
    game.shakeX = 0;
    game.shakeY = 0;
    game.speedLines = 0;
    game.jumpPose = 0.6;
    shake = 0;
    crashTimer = 0;
    goTimer = 1.05;
    footDustTimer = 0;
    hornTimer = U.rand(12, 22);
    highScoreAtStart = save.highScore;
    lastCrashCause = "train";
    lastScoreShown = -1;
    hudCache = {};
    displayTime = 0;
    save.played = true;
    game.skin = selectedSkin;
    game.mode = "playing";

    setModeUI("playing");
    els.menu.classList.add("is-hidden");
    buildPowerupChips();
    spawnIntroCoins();
    spawnAhead();
    updateHud(true);
    updateMissionHUD(true);
    updateBoardHud();
    updateHighScoreUI();
    countdown("GO!", 820);
    Audio.play("countdown", { last: true });
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function togglePause(force) {
    if (game.mode === "playing") {
      if (force === false) return;
      game.mode = "paused";
      setText(els.pauseScore, U.formatNum(score));
      setText(els.pauseDistance, Math.floor(game.distance) + " m");
      setText(els.pauseCoins, U.formatNum(coinsRun));
      setModeUI("paused");
      Audio.stopMusic();
      Audio.play("ui");
      if (els.resumeBtn) els.resumeBtn.focus();
    } else if (game.mode === "paused") {
      if (force === true) return;
      game.mode = "playing";
      setModeUI("playing");
      Audio.startMusic();
      Audio.play("ui");
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }
  }

  function quitToMenu() {
    hideModalPanels();
    showMenu();
    Audio.play("ui");
  }

  function hideModalPanels() {
    setHidden(els.pauseModal, true);
    setHidden(els.gameOverModal, true);
  }

  function updateHighScoreUI() {
    setText(els.bestHud, "BEST " + U.formatNum(Math.max(save.highScore, Math.floor(score))));
  }

  // ------------------------------------------------------------
  // Input
  // ------------------------------------------------------------
  function bindEvents() {
    els.playBtn.addEventListener("click", startRun);
    els.againBtn.addEventListener("click", () => {
      hideModalPanels();
      startRun();
    });
    els.menuBtn.addEventListener("click", quitToMenu);
    els.resumeBtn.addEventListener("click", () => togglePause(false));
    els.restartBtn.addEventListener("click", () => {
      hideModalPanels();
      startRun();
    });
    els.quitBtn.addEventListener("click", quitToMenu);
    els.pauseBtn.addEventListener("click", () => togglePause());
    els.soundBtn.addEventListener("click", toggleMute);
    els.menuSoundBtn.addEventListener("click", toggleMute);
    els.boardHud.addEventListener("click", deployBoard);

    els.runnerPicker.querySelectorAll(".runner-option").forEach((btn) => {
      btn.addEventListener("click", () => selectSkin(btn.dataset.skin, true));
    });

    document.querySelectorAll("#touchControls button").forEach((btn) => {
      btn.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        Audio.unlock();
        const action = btn.dataset.action;
        if (action === "left") moveLane(-1);
        else if (action === "right") moveLane(1);
        else if (action === "jump") jump();
        else if (action === "roll") roll();
      });
    });

    canvas.addEventListener("pointerdown", (event) => {
      if (game.mode !== "playing") return;
      Audio.unlock();
      pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() };
      canvas.setPointerCapture && canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointerup", (event) => {
      if (!pointerStart || game.mode !== "playing") {
        pointerStart = null;
        return;
      }
      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;
      const minSwipe = Math.max(22, Math.min(window.innerWidth, window.innerHeight) * 0.035);
      pointerStart = null;
      if (Math.abs(dx) < minSwipe && Math.abs(dy) < minSwipe) {
        jump();
      } else if (Math.abs(dx) > Math.abs(dy)) {
        moveLane(dx > 0 ? 1 : -1);
      } else if (dy < 0) {
        jump();
      } else {
        roll();
      }
    });

    canvas.addEventListener("pointercancel", () => {
      pointerStart = null;
    });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", () => {
      if (game.mode === "playing") togglePause(true);
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && game.mode === "playing") togglePause(true);
    });
    window.addEventListener("contextmenu", (event) => {
      if (event.target === canvas) event.preventDefault();
    });
  }

  function onKeyDown(event) {
    const code = event.code;
    const key = event.key;
    if (event.repeat) {
      if (code === "ArrowLeft" || code === "ArrowRight" || code === "ArrowUp" || code === "ArrowDown" || code === "Space") {
        event.preventDefault();
      }
      return;
    }

    if (code === "KeyM") {
      event.preventDefault();
      toggleMute();
      return;
    }

    if (game.mode === "menu") {
      if (code === "Enter" || code === "Space") {
        event.preventDefault();
        startRun();
      } else if (code === "ArrowLeft" || code === "ArrowRight") {
        event.preventDefault();
        const order = Object.keys(SS.SKINS);
        const index = order.indexOf(selectedSkin);
        const next = (index + (code === "ArrowRight" ? 1 : order.length - 1)) % order.length;
        selectSkin(order[next], true);
      }
      return;
    }

    if (game.mode === "gameover") {
      if (code === "Enter" || code === "Space" || code === "KeyR") {
        event.preventDefault();
        hideModalPanels();
        startRun();
      } else if (code === "Escape") {
        event.preventDefault();
        quitToMenu();
      }
      return;
    }

    if (game.mode === "paused") {
      if (code === "Escape" || code === "KeyP" || code === "Enter") {
        event.preventDefault();
        togglePause(false);
      } else if (code === "KeyR") {
        event.preventDefault();
        hideModalPanels();
        startRun();
      } else if (code === "KeyQ") {
        event.preventDefault();
        quitToMenu();
      }
      return;
    }

    if (game.mode !== "playing") return;

    switch (code) {
      case "ArrowLeft":
      case "KeyA":
        event.preventDefault();
        moveLane(-1);
        break;
      case "ArrowRight":
      case "KeyD":
        event.preventDefault();
        moveLane(1);
        break;
      case "ArrowUp":
      case "KeyW":
      case "Space":
        event.preventDefault();
        jump();
        break;
      case "ArrowDown":
      case "KeyS":
        event.preventDefault();
        roll();
        break;
      case "KeyH":
      case "ShiftLeft":
      case "ShiftRight":
        event.preventDefault();
        deployBoard();
        break;
      case "Escape":
      case "KeyP":
        event.preventDefault();
        togglePause();
        break;
      default:
        break;
    }
  }

  function moveLane(dir) {
    if (game.mode !== "playing") return;
    const player = game.player;
    const next = U.clamp(player.lane + dir, 0, 2);
    if (next === player.lane) {
      return;
    }
    player.lane = next;
    player.tilt = dir * 0.7;
    Audio.play("switch", { dir });
    spawnLaneDust(dir);
  }

  function jump() {
    if (game.mode !== "playing") return;
    const player = game.player;
    if (player.onGround) {
      doJump();
    } else {
      player.jumpBuffer = 0.13;
    }
  }

  function doJump() {
    const player = game.player;
    const boost = player.effects.sneakers > 0 ? 1.24 : 1;
    player.vy = C.jumpVelocity * boost;
    player.onGround = false;
    player.rolling = false;
    player.rollTimer = 0;
    stats.jumps++;
    spawnJumpDust();
    Audio.play("jump");
  }

  function roll() {
    if (game.mode !== "playing") return;
    const player = game.player;
    if (player.onGround) {
      player.rolling = true;
      player.rollTimer = C.rollTime;
      player.jumpBuffer = 0;
      stats.rolls++;
      spawnRollDust();
      Audio.play("roll");
    } else {
      player.vy = Math.min(player.vy, -18);
      player.rolling = false;
    }
  }

  function deployBoard() {
    if (game.mode !== "playing") return;
    const player = game.player;
    if (hoverboards <= 0) {
      showToast("NO HOVERBOARDS LEFT", "dark");
      return;
    }
    if (player.boardTime > 0) {
      showToast("HOVERBOARD ALREADY ACTIVE", "dark");
      return;
    }
    hoverboards--;
    player.boardTime = 16;
    player.invuln = Math.max(player.invuln, 0.4);
    stats.boards++;
    Audio.play("board");
    showToast("HOVERBOARD DEPLOYED", "teal");
    spawnBoardBurst();
    updateBoardHud();
    addShake(1.6);
  }

  function addShake(amount) {
    shake = Math.min(26, shake + amount);
  }

  // ------------------------------------------------------------
  // Gameplay orchestration
  // ------------------------------------------------------------
  let lastFrameMs = performance.now();

  function loop(now) {
    const raw = (now - lastFrameMs) / 1000;
    lastFrameMs = now;
    const dt = Math.min(raw > 0 ? raw : 1 / 60, 1 / 20);
    game.time += dt;

    if (game.mode === "menu") {
      updateMenu(dt);
    } else if (game.mode === "playing") {
      updatePlaying(dt);
    } else if (game.mode === "crash") {
      updateCrash(dt);
    } else if (game.mode === "gameover") {
      updateGameOver(dt);
    }
    updateParticles(dt);
    updateShake(dt);

    Render.frame(game);
    requestAnimationFrame(loop);
  }

  function updateMenu(dt) {
    game.menuScroll += dt * 5.5;
    game.theme = SS.themeFor(0.03);
    game.player.runPhase += dt * 2;
    game.player.tilt = Math.sin(game.time * 0.8) * 0.03;
    game.speedLines = 0;
    if (Math.random() < dt * 2.2) {
      const p = Render.project(U.rand(-3, 3), U.rand(0.4, 2), U.rand(10, 100));
      spawnParticle({
        kind: Math.random() > 0.55 ? "smoke" : "spark",
        x: p.x,
        y: p.y,
        vx: U.rand(-5, 5),
        vy: U.rand(-16, -4),
        life: U.rand(1.6, 3.2),
        size: U.rand(1, 3),
        color: "rgba(255,240,200,0.4)",
        alpha: 0.25
      });
    }
  }

  function updateParticles(dt) {
    const ps = game.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps.splice(i, 1);
        continue;
      }
      if (p.vx) p.vx *= Math.pow(p.drag == null ? 0.98 : p.drag, dt * 60);
      if (p.vy && p.gravity) p.vy += p.gravity * dt;
      p.x += (p.vx || 0) * dt;
      p.y += (p.vy || 0) * dt;
      if (p.rot != null) p.rot += (p.vr || 0) * dt;
    }
    if (ps.length > 360) ps.splice(0, ps.length - 360);
  }

  function updateShake(dt) {
    if (shake > 0.05) {
      shake = Math.max(0, shake - dt * (18 + shake * 2.2));
      game.shakeX = (Math.random() * 2 - 1) * shake;
      game.shakeY = (Math.random() * 2 - 1) * shake * 0.7;
    } else {
      shake = 0;
      game.shakeX = 0;
      game.shakeY = 0;
    }
  }

  function spawnParticle(opts) {
    const maxLife = opts.life || 1;
    game.particles.push({
      x: opts.x || 0,
      y: opts.y || 0,
      vx: opts.vx || 0,
      vy: opts.vy || 0,
      gravity: opts.gravity == null ? 0 : opts.gravity,
      drag: opts.drag == null ? 0.985 : opts.drag,
      life: maxLife,
      maxLife,
      size: opts.size || 3,
      color: opts.color || "#ffc62d",
      kind: opts.kind || "spark",
      alpha: opts.alpha == null ? 1 : opts.alpha,
      rot: opts.rot || 0,
      vr: opts.vr || 0,
      label: opts.label || "",
      outline: opts.outline
    });
  }

  function burstAtWorld(x, y, z, options) {
    const p = Render.project(x, y, z);
    const n = (options && options.count) || 8;
    const colors = (options && options.colors) || ["#ffc62d", "#ffe9a1", "#ff9f24"];
    for (let i = 0; i < n; i++) {
      const a = U.rand(0, Math.PI * 2);
      const speed = U.rand(30, 150);
      spawnParticle({
        kind: Math.random() > 0.45 ? "spark" : "star",
        x: p.x + U.rand(-4, 4),
        y: p.y + U.rand(-4, 4),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 30,
        gravity: 220,
        life: U.rand(0.35, 0.8),
        size: U.rand(1.5, 4.2),
        color: colors[(Math.random() * colors.length) | 0],
        alpha: 1,
        rot: U.rand(0, 6),
        vr: U.rand(-8, 8)
      });
    }
  }

  function spawnLaneDust(dir) {
    const p = game.player;
    const foot = Render.project(p.x, p.shadowY, 0);
    for (let i = 0; i < 4; i++) {
      spawnParticle({
        kind: "smoke",
        x: foot.x - dir * 10 + U.rand(-8, 8),
        y: foot.y - U.rand(1, 12),
        vx: -dir * U.rand(10, 40),
        vy: U.rand(-18, 3),
        gravity: 15,
        life: U.rand(0.25, 0.5),
        size: U.rand(2, 5),
        color: "rgba(230,218,195,0.28)",
        alpha: 0.7
      });
    }
  }

  function spawnJumpDust() {
    const p = game.player;
    const foot = Render.project(p.x, 0, 0);
    spawnParticle({ kind: "ring", x: foot.x, y: foot.y, vx: 0, vy: 0, life: 0.4, size: 15, color: "rgba(255,241,205,0.5)" });
    for (let i = 0; i < 7; i++) {
      spawnParticle({
        kind: "smoke",
        x: foot.x + U.rand(-12, 12),
        y: foot.y + U.rand(-3, 2),
        vx: U.rand(-32, 32),
        vy: U.rand(-28, -4),
        gravity: 20,
        life: U.rand(0.25, 0.6),
        size: U.rand(2, 6),
        color: "rgba(231,218,193,0.3)",
        alpha: 0.65
      });
    }
  }

  function spawnRollDust() {
    const p = game.player;
    const foot = Render.project(p.x, 0, 0);
    for (let i = 0; i < 10; i++) {
      spawnParticle({
        kind: "smoke",
        x: foot.x + U.rand(-18, 18),
        y: foot.y + U.rand(-2, 5),
        vx: U.rand(-45, 45),
        vy: U.rand(-25, -3),
        gravity: 30,
        life: U.rand(0.28, 0.6),
        size: U.rand(2, 7),
        color: "rgba(213,198,169,0.28)",
        alpha: 0.7
      });
    }
  }

  function spawnBoardBurst() {
    const p = game.player;
    const foot = Render.project(p.x, 0.08, 0);
    spawnParticle({ kind: "ring", x: foot.x, y: foot.y, life: 0.55, size: 24, color: "#2fe6c2" });
    for (let i = 0; i < 18; i++) {
      const a = U.rand(0, Math.PI * 2);
      spawnParticle({
        kind: Math.random() > 0.5 ? "spark" : "star",
        x: foot.x + U.rand(-8, 8),
        y: foot.y + U.rand(-8, 8),
        vx: Math.cos(a) * U.rand(25, 110),
        vy: Math.sin(a) * U.rand(25, 110) - 15,
        gravity: 180,
        life: U.rand(0.4, 0.9),
        size: U.rand(1.5, 4),
        color: i % 3 === 0 ? "#ff4f8b" : "#2fe6c2",
        rot: U.rand(0, 6),
        vr: U.rand(-5, 5)
      });
    }
  }

  function spawnConfetti() {
    const colors = ["#ffc62d", "#2fe6c2", "#ff4f8b", "#58dcff", "#fff3d2", "#ff7a2f"];
    for (let i = 0; i < 120; i++) {
      spawnParticle({
        kind: "confetti",
        x: U.rand(0, window.innerWidth),
        y: U.rand(-window.innerHeight * 0.3, 0),
        vx: U.rand(-35, 35),
        vy: U.rand(55, 190),
        gravity: 145,
        drag: 0.992,
        life: U.rand(2.7, 5),
        size: U.rand(4, 10),
        color: colors[(Math.random() * colors.length) | 0],
        rot: U.rand(0, TAU),
        vr: U.rand(-7, 7),
        alpha: 0.95
      });
    }
  }

  // ------------------------------------------------------------
  // Main run update
  // ------------------------------------------------------------
  function updatePlaying(dt) {
    const player = game.player;
    goTimer = Math.max(0, goTimer - dt);

    const diff = U.clamp(game.distance / 1700, 0, 1);
    const targetSpeed = Math.min(C.maxSpeed, C.baseSpeed + game.distance * C.speedRamp);
    game.speed = U.approach(game.speed, targetSpeed, dt * (2.6 + diff * 2));
    game.topSpeed = Math.max(game.topSpeed, game.speed);
    const travel = game.speed * dt;
    game.distance += travel;
    game.theme = SS.themeFor(0.018 + (game.distance / 3400) % 1);

    const mult = player.effects.multiplier > 0 ? 2 : 1;
    score += travel * (3.8 + diff * 1.4) * mult;

    // Timers and animated state.
    player.boardTime = Math.max(0, player.boardTime - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);
    player.effects.magnet = Math.max(0, player.effects.magnet - dt);
    player.effects.multiplier = Math.max(0, player.effects.multiplier - dt);
    player.effects.sneakers = Math.max(0, player.effects.sneakers - dt);

    if (player.rolling) {
      player.rollTimer -= dt;
      if (player.rollTimer <= 0) player.rolling = false;
    }

    // Lateral movement follows the selected lane with a springy tilt.
    const targetX = (player.lane - 1) * view.laneW;
    const ease = 1 - Math.exp(-dt * 17);
    player.x += (targetX - player.x) * ease;
    player.tilt = U.clamp((targetX - player.x) / view.laneW, -1, 1) * 0.82;
    player.runPhase += dt * (7.2 + game.speed * 0.22);

    spawnAhead();
    moveEntities(travel, dt);

    const supportInfo = getSupportInfo();
    updateVertical(dt, supportInfo);
    if (game.mode !== "playing") return;

    collideWithTrains();
    if (game.mode !== "playing") return;

    collideWithProps(dt);
    if (game.mode !== "playing") return;

    collectPickups(dt);
    cleanupEntities();
    updateFootsteps(dt);
    checkMissions();

    game.speedLines = U.smoothstep(25, 41, game.speed) * (0.7 + diff * 0.3);
    game.jumpPose = U.clamp(Math.abs(player.vy) / 11, 0.2, 1);
    game.cameraOffset = Math.sin(game.time * 0.37) * 0.012 + (shake > 1 ? U.rand(-0.02, 0.02) : 0);

    hornTimer -= dt;
    if (hornTimer <= 0) {
      Audio.play("horn");
      hornTimer = U.rand(17, 28);
    }

    updateHud();
    updateBoardHud();
    updatePowerupHUD();
    updatePowerupEffects();
  }

  function updateFootsteps(dt) {
    const player = game.player;
    if (!player.onGround || player.rolling) return;
    footDustTimer -= dt;
    if (footDustTimer > 0) return;
    footDustTimer = Math.max(0.075, 0.2 - game.speed * 0.0024);
    const foot = Render.project(player.x, player.shadowY, 0);
    for (let i = 0; i < 2; i++) {
      spawnParticle({
        kind: "smoke",
        x: foot.x + U.rand(-7, 7),
        y: foot.y - U.rand(0, 4),
        vx: U.rand(-15, 15),
        vy: U.rand(-12, -2),
        gravity: 10,
        life: U.rand(0.22, 0.42),
        size: U.rand(1.5, 4),
        color: "rgba(226,213,188,0.17)",
        alpha: 0.5
      });
    }
  }

  function moveEntities(travel, dt) {
    const player = game.player;
    for (const e of game.entities) {
      e.prevZ = e.z;
      e.z -= travel;

      if (e.type === "coin" && !e.collected && player.effects.magnet > 0 && e.z > 0 && e.z < C.magnetRadius) {
        e.magnetized = true;
        const ease = Math.min(1, dt * (5.5 + (C.magnetRadius - e.z) * 0.12));
        e.x += (player.x - e.x) * ease;
        e.z = Math.max(0.2, e.z - dt * 17);
        e.y += (player.y + 0.85 - e.y) * Math.min(1, dt * 5);
        if (Math.random() < dt * 4) {
          const p = Render.project(e.x, e.y, e.z);
          spawnParticle({
            kind: "spark",
            x: p.x + U.rand(-5, 5),
            y: p.y + U.rand(-5, 5),
            vx: U.rand(-20, 20),
            vy: U.rand(-20, 20),
            life: 0.32,
            size: 1.8,
            color: "#ffe49a"
          });
        }
      }
    }
  }

  function getSupportInfo() {
    const player = game.player;
    let support = 0;
    let shadow = 0;
    let train = null;
    for (const e of game.entities) {
      if (e.type !== "train" || e.removed) continue;
      const zNear = e.z - e.len * 0.5;
      const zFar = e.z + e.len * 0.5;
      if (zFar < -0.52 || zNear > 0.52) continue;
      if (Math.abs(player.x - laneX(e.lane)) > view.laneW * 0.45) continue;
      const roof = e.roofHeight || C.trainHeight;
      if (player.y >= roof - 0.32 || (player.supportTrain === e && player.y > 0.3)) {
        if (roof > support) {
          support = roof;
          train = e;
        }
      }
      if (player.y >= roof - 0.75) shadow = Math.max(shadow, roof);
    }
    return { support, shadow, train };
  }

  function updateVertical(dt, info) {
    const player = game.player;
    const wasGrounded = player.onGround;

    if (player.onGround && player.y > info.support + 0.055) {
      player.onGround = false;
      player.vy = Math.min(player.vy, 0);
      player.supportTrain = null;
    }

    if (!player.onGround) {
      player.vy -= C.gravity * dt;
      player.y += player.vy * dt;
      if (player.y <= info.support && player.vy <= 0) {
        player.y = info.support;
        player.vy = 0;
        player.onGround = true;
        player.supportTrain = info.train;
        if (!wasGrounded) onLand();
      } else {
        player.supportTrain = info.train && player.y >= (info.train.roofHeight || C.trainHeight) - 0.05 ? info.train : null;
      }
    } else {
      player.y = info.support;
      player.vy = 0;
      player.supportTrain = info.train;
    }

    if (player.onGround) {
      player.shadowY = info.support;
    } else {
      player.shadowY = info.shadow > 0 && player.y >= info.shadow - 0.35 ? info.shadow : 0;
    }

    if (player.jumpBuffer > 0 && player.onGround) {
      player.jumpBuffer = 0;
      doJump();
    }
  }

  function onLand() {
    const player = game.player;
    const foot = Render.project(player.x, player.shadowY, 0);
    spawnParticle({ kind: "ring", x: foot.x, y: foot.y, life: 0.42, size: 17, color: "rgba(255,240,205,0.45)" });
    for (let i = 0; i < 5; i++) {
      spawnParticle({
        kind: "smoke",
        x: foot.x + U.rand(-12, 12),
        y: foot.y + U.rand(-1, 3),
        vx: U.rand(-28, 28),
        vy: U.rand(-20, -2),
        gravity: 24,
        life: U.rand(0.2, 0.5),
        size: U.rand(2, 6),
        color: "rgba(227,215,193,0.25)",
        alpha: 0.7
      });
    }
    addShake(1.3);
    Audio.play("land");
  }

  function collideWithTrains() {
    const player = game.player;
    for (const e of game.entities) {
      if (e.type !== "train" || e.removed) continue;
      const zNear = e.z - e.len * 0.5;
      const zFar = e.z + e.len * 0.5;
      if (zFar < -0.55 || zNear > 0.55) continue;
      if (Math.abs(player.x - laneX(e.lane)) > view.laneW * 0.46) continue;
      const roof = e.roofHeight || C.trainHeight;
      if (player.y < roof - 0.3) {
        handleHit(e, "train");
        return;
      }
    }
  }

  function nearPlayerZ(e) {
    if (e.z <= 0.92 && e.z >= -0.92) return true;
    if (e.prevZ != null && e.prevZ > 0.92 && e.z < -0.92) return true;
    return false;
  }

  function collideWithProps(dt) {
    const player = game.player;
    for (const e of game.entities) {
      if (e.type !== "barrier" && e.type !== "overhead") continue;
      if (e.removed || e.hit) continue;
      if (!nearPlayerZ(e)) continue;
      if (Math.abs(player.x - laneX(e.lane)) > view.laneW * 0.43) continue;
      if (e.type === "barrier") {
        e.hit = true;
        if (player.y < 0.82) {
          handleHit(e, "barrier");
          return;
        }
      } else {
        const clearance = e.clearance || 1.35;
        const bodyHeight = player.rolling ? 0.88 : 1.78;
        const top = player.y + bodyHeight;
        if (top > clearance + 0.01 && player.y < 2.75) {
          e.hit = true;
          handleHit(e, "overhead");
          return;
        }
      }
    }
  }

  function handleHit(entity, cause) {
    const player = game.player;
    if (player.invuln > 0 || game.mode !== "playing") return;
    if (player.boardTime > 0) {
      boardSave(entity);
      return;
    }
    beginCrash(cause);
  }

  function boardSave(entity) {
    const player = game.player;
    player.boardTime = 0;
    player.invuln = 1.3;
    player.crashSpin = 0;
    stats.boardSaves++;
    entity.removed = true;
    addShake(16);
    flashScreen();
    Audio.play("boardBreak");
    showToast("HOVERBOARD SAVED YOU", "pink");
    const x = entity.lane == null ? player.x : laneX(entity.lane);
    const y = entity.type === "train" ? 1.2 : entity.type === "overhead" ? 1.8 : 0.7;
    burstAtWorld(x, y, 0.2, { count: 26, colors: ["#2fe6c2", "#ff4f8b", "#ffe7a4"] });
    spawnParticle({ kind: "ring", x: Render.project(x, y, 0).x, y: Render.project(x, y, 0).y, life: 0.55, size: 30, color: "#2fe6c2" });
    updatePowerupHUD();
    updateBoardHud();
  }

  function beginCrash(cause) {
    if (game.mode !== "playing") return;
    lastCrashCause = cause;
    game.mode = "crash";
    crashTimer = 0;
    game.speedLines = 0;
    game.player.crashSpin = 0;
    game.player.vy = cause === "overhead" ? 5.2 : 7.2;
    game.player.onGround = false;
    addShake(24);
    flashScreen();
    Audio.play("crash");
    Audio.stopMusic();
    if (cause === "train") Audio.play("horn");
    const p = game.player;
    const burstPoint = Render.project(p.x, Math.max(0.4, p.y) + 0.9, 0);
    spawnParticle({ kind: "ring", x: burstPoint.x, y: burstPoint.y, life: 0.7, size: 42, color: "#fff1c2" });
    burstAtWorld(p.x, Math.max(0.4, p.y) + 0.85, 0, {
      count: 34,
      colors: ["#fff0bc", "#ffc62d", "#ff7a2f", "#ff4f8b"]
    });
    updateHud(true);
  }

  function updateCrash(dt) {
    crashTimer += dt;
    const player = game.player;
    game.speed = Math.max(0, game.speed - dt * 36);
    const travel = game.speed * dt;
    game.distance += travel;
    for (const e of game.entities) {
      e.prevZ = e.z;
      e.z -= travel;
    }
    player.vy -= C.gravity * 0.8 * dt;
    player.y = Math.max(0, player.y + player.vy * dt);
    player.crashSpin += dt * (2.5 + Math.max(0, 1 - crashTimer) * 8);
    player.shadowY = 0;

    if (crashTimer > 0.2 && Math.random() < dt * 18) {
      const p = Render.project(player.x + U.rand(-0.35, 0.35), Math.max(0.1, player.y) + U.rand(0, 1), 0);
      spawnParticle({
        kind: "smoke",
        x: p.x,
        y: p.y,
        vx: U.rand(-30, 30),
        vy: U.rand(-25, -5),
        life: U.rand(0.4, 0.8),
        size: U.rand(3, 8),
        color: "rgba(210,190,160,0.28)",
        alpha: 0.7
      });
    }

    if (crashTimer >= 1.24) endRun();
  }

  function updateGameOver(dt) {
    // The frozen action stays visible beneath the results panel.
    if (game.player) {
      game.player.shadowY = 0;
    }
  }

  function updatePowerupEffects() {
    const player = game.player;
    if (player.boardTime <= 0 && game.mode === "playing" && player._hadBoard) {
      // no-op hook kept deliberately quiet; the board simply powers down
    }
    player._hadBoard = player.boardTime > 0;
  }

  // ------------------------------------------------------------
  // Pickups
  // ------------------------------------------------------------
  function collectPickups(dt) {
    const player = game.player;
    const magnet = player.effects.magnet > 0;
    for (const e of game.entities) {
      if (e.collected || e.removed) continue;
      if (e.type === "coin") {
        const dx = Math.abs(e.x - player.x);
        const dy = Math.abs(e.y - (player.y + 0.84));
        const dz = Math.abs(e.z);
        const canCollect = dz < (magnet ? 1.7 : 1.0) &&
          dx < view.laneW * (magnet ? 1.25 : 0.52) &&
          dy < (magnet ? 1.8 : 1.25);
        if (canCollect) collectCoin(e);
      } else if (e.type === "powerup") {
        const dx = Math.abs(e.x - player.x);
        const dz = Math.abs(e.z);
        const dy = Math.abs(1.2 - (player.y + 0.9));
        if (dz < 1.1 && dx < view.laneW * 0.58 && dy < 1.6) {
          collectPowerup(e);
        }
      }
    }
  }

  function collectCoin(e) {
    const player = game.player;
    e.collected = true;
    coinsRun++;
    const mult = player.effects.multiplier > 0 ? 2 : 1;
    score += 10 * mult;
    Audio.play("coin");
    const p = Render.project(e.x, e.y, e.z);
    for (let i = 0; i < 5; i++) {
      const a = U.rand(0, TAU);
      spawnParticle({
        kind: Math.random() > 0.55 ? "coin" : "star",
        x: p.x + U.rand(-3, 3),
        y: p.y + U.rand(-3, 3),
        vx: Math.cos(a) * U.rand(20, 85),
        vy: Math.sin(a) * U.rand(20, 85) - 18,
        gravity: 130,
        life: U.rand(0.24, 0.5),
        size: U.rand(1.5, 3.2),
        color: i % 2 === 0 ? "#ffd758" : "#fff1b0",
        rot: U.rand(0, 5),
        vr: U.rand(-7, 7)
      });
    }
    if (coinsRun % 12 === 0) {
      spawnParticle({
        kind: "text",
        x: p.x,
        y: p.y - 34,
        vy: -32,
        life: 0.65,
        size: 17,
        color: "#ffd758",
        label: "COIN RUN ×" + (coinsRun / 12 | 0)
      });
    }
    updateHud();
  }

  function collectPowerup(e) {
    const player = game.player;
    const def = SS.POWERUPS[e.power];
    e.collected = true;
    e.removed = true;
    stats.powerups++;
    score += 25 * (player.effects.multiplier > 0 ? 2 : 1);
    Audio.play("powerup");
    const p = Render.project(e.x, 1.2, e.z);
    spawnParticle({ kind: "ring", x: p.x, y: p.y, life: 0.55, size: 26, color: def.color });
    for (let i = 0; i < 14; i++) {
      const a = U.rand(0, TAU);
      spawnParticle({
        kind: Math.random() > 0.5 ? "spark" : "star",
        x: p.x + U.rand(-4, 4),
        y: p.y + U.rand(-4, 4),
        vx: Math.cos(a) * U.rand(35, 120),
        vy: Math.sin(a) * U.rand(35, 120) - 25,
        gravity: 140,
        life: U.rand(0.35, 0.75),
        size: U.rand(1.5, 4),
        color: i % 3 === 0 ? "#ffffff" : def.color,
        rot: U.rand(0, 6),
        vr: U.rand(-6, 6)
      });
    }

    if (e.power === "board") {
      if (player.boardTime > 0) {
        player.boardTime = Math.min(28, player.boardTime + 8);
        showToast("HOVERBOARD +8 SECONDS", "teal");
      } else {
        hoverboards = Math.min(3, hoverboards + 1);
        showToast("HOVERBOARD ADDED TO INVENTORY", "teal");
      }
    } else {
      player.effects[e.power] = Math.min(26, player.effects[e.power] + def.duration);
      showToast(def.name + " ACTIVATED", "teal");
    }
    updateBoardHud();
    updatePowerupHUD();
    updateHud();
  }

  // ------------------------------------------------------------
  // World generation
  // ------------------------------------------------------------
  function spawnAhead() {
    const diff = U.clamp(game.distance / 1700, 0, 1);
    let guard = 0;
    while (nextRowWorldZ < game.distance + C.spawnHorizon && guard < 10) {
      spawnRow(nextRowWorldZ - game.distance);
      nextRowWorldZ += rowGap(diff);
      guard++;
    }
  }

  function rowGap(diff) {
    return U.lerp(40, 29, diff) + U.rand(-2.5, 3);
  }

  function spawnRow(z) {
    const diff = U.clamp(game.distance / 1700, 0, 1);
    rowCount++;
    const freeLane = U.randInt(0, 2);
    const candidates = U.shuffle([0, 1, 2].filter((l) => l !== freeLane));
    let count = 1;
    if (rowCount > 2 && Math.random() < 0.16 + diff * 0.44) count = 2;

    const forceTrain = rowCount >= nextTrainRow;
    const built = [];
    for (let i = 0; i < count; i++) {
      const lane = candidates[i];
      const type = forceTrain && i === 0 ? "train" : chooseObstacleType(diff);
      built.push(spawnObstacle(lane, z, type));
    }

    // Later in the run, park a train on the spare lane too so players thread
    // the gap between two consists. One lane always stays completely clear.
    if (forceTrain && diff > 0.45 && count === 1 && Math.random() < 0.42) {
      built.push(spawnObstacle(candidates[1], z, "train"));
    }

    if (forceTrain) nextTrainRow = rowCount + U.randInt(4, 6);

    // A reliable coin lane rewards reading the row quickly.
    if (Math.random() < 0.9) {
      spawnCoinLine(freeLane, z + U.rand(-1.5, 1.5), U.randInt(4, 7), 2.35, 0.78);
    }

    // Gold arcs over low barriers make the intended move obvious.
    for (const e of built) {
      if (e.type === "barrier" && Math.random() < 0.62) {
        spawnCoinArc(e.lane, e.z, U.randInt(4, 6));
      }
      if (e.type === "train" && Math.random() < 0.55) {
        spawnCoinLine(e.lane, e.z, U.randInt(3, 5), 2.3, C.trainHeight + 0.72);
      }
    }

    if (rowCount >= nextPowerupRow && z > 28) {
      spawnPowerup(freeLane, z + U.rand(5, 13));
      nextPowerupRow = rowCount + U.randInt(4, 7);
    }
  }

  function chooseObstacleType(diff) {
    if (rowCount <= 1) return "barrier";
    if (rowCount === 2) return "overhead";
    const r = Math.random();
    const trainChance = 0.23 + diff * 0.2;
    if (r < trainChance) return "train";
    if (r < trainChance + 0.42) return "barrier";
    return "overhead";
  }

  function spawnObstacle(lane, z, type) {
    let e;
    if (type === "train") {
      const len = U.rand(12, 21);
      e = {
        type: "train",
        lane,
        z,
        len,
        roofHeight: C.trainHeight,
        widthScale: 0.8,
        variant: U.randInt(0, 4),
        lights: true,
        prevZ: z
      };
    } else if (type === "overhead") {
      e = {
        type: "overhead",
        lane,
        z,
        clearance: 1.35,
        prevZ: z
      };
    } else {
      e = {
        type: "barrier",
        lane,
        z,
        height: 0.95,
        prevZ: z
      };
    }
    game.entities.push(e);
    return e;
  }

  function spawnCoinLine(lane, z, count, spacing, y) {
    const start = z - ((count - 1) * spacing) / 2;
    for (let i = 0; i < count; i++) {
      game.entities.push({
        type: "coin",
        lane,
        x: laneX(lane),
        z: start + i * spacing,
        y: y + U.rand(-0.03, 0.03),
        phase: U.rand(0, TAU)
      });
    }
  }

  function spawnCoinArc(lane, z, count) {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const arc = Math.sin(t * Math.PI) * 2.0;
      game.entities.push({
        type: "coin",
        lane,
        x: laneX(lane),
        z: z + (t - 0.5) * 7.2,
        y: 0.78 + arc,
        phase: U.rand(0, TAU)
      });
    }
  }

  function spawnPowerup(lane, z) {
    let power;
    if (Math.random() < 0.18) power = "board";
    else power = U.pick(["magnet", "multiplier", "sneakers", "magnet"]);
    game.entities.push({
      type: "powerup",
      lane,
      power,
      x: laneX(lane),
      z,
      phase: U.rand(0, TAU)
    });
  }

  function spawnIntroCoins() {
    for (let i = 0; i < 7; i++) {
      game.entities.push({
        type: "coin",
        lane: 1,
        x: 0,
        z: 19 + i * 2.4,
        y: 0.8,
        phase: i * 0.4
      });
    }
  }

  function cleanupEntities() {
    const list = game.entities;
    let write = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.collected || e.removed) continue;
      const out = e.type === "train"
        ? e.z + e.len * 0.5 < -11
        : e.z < -12;
      if (out) continue;
      list[write++] = e;
    }
    list.length = write;
  }

  function laneX(lane) {
    return (lane - 1) * view.laneW;
  }

  // ------------------------------------------------------------
  // Missions
  // ------------------------------------------------------------
  function missionValue(metric) {
    switch (metric) {
      case "coins": return coinsRun;
      case "distance": return Math.floor(game.distance);
      case "jumps": return stats.jumps;
      case "rolls": return stats.rolls;
      case "powerups": return stats.powerups;
      case "boards": return stats.boards;
      default: return 0;
    }
  }

  function checkMissions() {
    let newlyDone = null;
    for (const m of missions) {
      const value = missionValue(m.metric);
      m.progress = Math.min(m.target, value);
      if (!m.done && value >= m.target) {
        m.done = true;
        m.progress = m.target;
        stats.missionsDone++;
        score += 500;
        newlyDone = m;
      }
    }
    if (newlyDone) {
      Audio.play("mission");
      showToast("MISSION CLEAR  +500", "teal");
      const p = Render.project(game.player.x, Math.max(1.2, game.player.y + 1.8), 0);
      spawnParticle({
        kind: "text",
        x: p.x,
        y: p.y - 18,
        vy: -28,
        life: 1.0,
        size: 20,
        color: "#2fe6c2",
        label: "MISSION CLEAR"
      });
      addShake(1.2);
      updateMissionHUD(true);
    } else {
      updateMissionHUD();
    }
  }

  function updateMissionHUD(force) {
    const active = missions.find((m) => !m.done);
    let title;
    let progress;
    let done = false;
    if (!active) {
      title = "All missions complete";
      progress = missions.length + " / " + missions.length;
      done = true;
    } else {
      title = active.title;
      progress = Math.min(active.progress | 0, active.target) + " / " + active.target;
    }
    if (force || hudCache.missionTitle !== title) {
      setText(els.missionText, title);
      hudCache.missionTitle = title;
    }
    if (force || hudCache.missionProgress !== progress) {
      setText(els.missionProgress, progress);
      hudCache.missionProgress = progress;
    }
    els.missionChip.classList.toggle("is-done", done);
  }

  // ------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------
  function updateHud(force) {
    if (force) hudCache = {};
    const floored = Math.floor(score);
    if (force || hudCache.score !== floored || lastScoreShown !== floored) {
      setText(els.scoreValue, U.padScore(floored));
      hudCache.score = floored;
      lastScoreShown = floored;
    }
    if (force || hudCache.coins !== coinsRun) {
      setText(els.coinValue, U.formatNum(coinsRun));
      hudCache.coins = coinsRun;
    }
    const dist = Math.floor(game.distance);
    if (force || hudCache.distance !== dist) {
      setText(els.distanceValue, dist + " m");
      hudCache.distance = dist;
    }
    const best = Math.max(save.highScore, floored);
    if (force || hudCache.best !== best) {
      setText(els.bestHud, "BEST " + U.formatNum(best));
      hudCache.best = best;
    }
    const kmh = Math.round(game.speed * 3.6);
    if (force || hudCache.speed !== kmh) {
      setText(els.speedValue, kmh);
      els.speedBadge.classList.toggle("is-fast", game.speed > 27);
      hudCache.speed = kmh;
    }
  }

  function updateBoardHud() {
    if (!els.boardHud) return;
    const player = game.player;
    const active = player.boardTime > 0;
    els.boardHud.classList.toggle("is-active", active);
    if (active) {
      setText(els.boardCount, Math.ceil(player.boardTime) + "s");
    } else {
      setText(els.boardCount, "×" + hoverboards);
    }
    els.boardHud.disabled = active || hoverboards <= 0 || game.mode !== "playing";
    els.boardHud.setAttribute("aria-label", active ? "Hoverboard active, " + Math.ceil(player.boardTime) + " seconds remaining" : "Deploy hoverboard, " + hoverboards + " in inventory");
  }

  function buildPowerupChips() {
    if (powerupEls.magnet) return;
    const order = ["magnet", "multiplier", "sneakers", "board"];
    powerupEls = {};
    for (const key of order) {
      const def = SS.POWERUPS[key];
      const chip = document.createElement("div");
      chip.className = "power-chip is-hidden";
      chip.style.setProperty("--pc-color", def.color);
      const icon = document.createElement("span");
      icon.className = "pc-icon";
      icon.textContent = key === "board" ? "▰" : def.icon;
      const name = document.createElement("span");
      name.className = "pc-name";
      name.textContent = def.short;
      const time = document.createElement("span");
      time.className = "pc-time";
      time.textContent = "";
      const bar = document.createElement("i");
      bar.className = "pc-bar";
      chip.appendChild(icon);
      chip.appendChild(name);
      chip.appendChild(time);
      chip.appendChild(bar);
      els.powerupStack.appendChild(chip);
      powerupEls[key] = { chip, time, bar };
    }
  }

  function updatePowerupHUD() {
    if (!powerupEls.magnet) return;
    const player = game.player;
    const values = {
      magnet: player.effects.magnet,
      multiplier: player.effects.multiplier,
      sneakers: player.effects.sneakers,
      board: player.boardTime
    };
    const maxes = { magnet: 10, multiplier: 12, sneakers: 12, board: 16 };
    for (const key of Object.keys(values)) {
      const entry = powerupEls[key];
      if (!entry) continue;
      const value = values[key];
      const visible = value > 0.02;
      entry.chip.classList.toggle("is-hidden", !visible);
      if (visible) {
        setText(entry.time, Math.ceil(value) + "s");
        entry.bar.style.transform = "scaleX(" + U.clamp(value / maxes[key], 0, 1) + ")";
      }
    }
  }

  // ------------------------------------------------------------
  // Run end + results
  // ------------------------------------------------------------
  function endRun() {
    if (game.mode === "gameover") return;
    game.mode = "gameover";
    const finalScore = Math.floor(score);
    const isNewBest = finalScore > save.highScore;

    save.runs += 1;
    save.totalCoins += coinsRun;
    save.bestDistance = Math.max(save.bestDistance, Math.floor(game.distance));
    if (isNewBest) save.highScore = finalScore;
    SS.persistSave(save);
    updateMenuStats();

    setText(els.finalScore, U.formatNum(finalScore));
    setText(els.finalDistance, Math.floor(game.distance) + " m");
    setText(els.finalCoins, U.formatNum(coinsRun));
    setText(els.finalSpeed, Math.round(game.topSpeed * 3.6));
    const copy = {
      train: { kicker: "TRAIN 1 — YOU 0", title: "FLATTENED" },
      barrier: { kicker: "THE RAILS FIGHT BACK", title: "TRIPPED UP" },
      overhead: { kicker: "MIND YOUR HEAD", title: "TOO TALL" }
    }[lastCrashCause] || { kicker: "THE INSPECTOR WINS", title: "RUN OVER" };
    setText(els.gameOverKicker, copy.kicker);
    setText(els.gameOverTitle, copy.title);
    setHidden(els.newBest, !isNewBest);
    renderMissionResults();

    setModeUI("gameover");
    updateHud(true);
    updatePowerupHUD();
    Audio.stopMusic();
    if (isNewBest) {
      Audio.play("newBest");
      spawnConfetti();
    } else {
      Audio.play("gameover");
    }
    window.setTimeout(() => {
      if (game.mode === "gameover" && els.againBtn) els.againBtn.focus({ preventScroll: true });
    }, 420);
  }

  function renderMissionResults() {
    els.missionResults.innerHTML = "";
    for (const m of missions) {
      const row = document.createElement("div");
      row.className = "mission-result" + (m.done ? " is-done" : "");
      const mark = document.createElement("span");
      mark.className = "mr-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = m.done ? "✓" : "○";
      const title = document.createElement("span");
      title.textContent = m.title;
      const progress = document.createElement("span");
      progress.className = "mr-progress";
      progress.textContent = (m.done ? m.target : Math.min(m.progress | 0, m.target)) + " / " + m.target + m.unit;
      row.appendChild(mark);
      row.appendChild(title);
      row.appendChild(progress);
      els.missionResults.appendChild(row);
    }
  }

  // ------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

