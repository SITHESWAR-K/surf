/* ============================================================
   SUBWAY SUFFER — shared data, palettes, storage, utilities
   ============================================================ */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => (v - a) / (b - a || 1);
  const smoothstep = (a, b, v) => {
    const t = clamp((v - a) / (b - a || 1), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const approach = (v, target, step) => {
    if (v < target) return Math.min(v + step, target);
    return Math.max(v - step, target);
  };
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const chance = (p) => Math.random() < p;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

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

  const hexCache = new Map();
  function hexToRgb(hex) {
    if (hexCache.has(hex)) return hexCache.get(hex);
    let h = String(hex).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    const out = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    hexCache.set(hex, out);
    return out;
  }

  function mixHex(a, b, t) {
    if (t <= 0) return a;
    if (t >= 1) return b;
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    const toHex = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
    return "#" + toHex(lerp(A.r, B.r, t)) + toHex(lerp(A.g, B.g, t)) + toHex(lerp(A.b, B.b, t));
  }

  function rgba(hex, alpha) {
    const c = hexToRgb(hex);
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + alpha + ")";
  }

  function shade(hex, amount) {
    const c = hexToRgb(hex);
    const f = (v) => clamp(Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount)), 0, 255);
    return "rgb(" + f(c.r) + "," + f(c.g) + "," + f(c.b) + ")";
  }

  const formatNum = (n) => Math.floor(n).toLocaleString("en-US");
  const padScore = (n) => String(Math.max(0, Math.floor(n))).padStart(6, "0");

  // ------------------------------------------------------------
  // Mood / time-of-day palettes (natural atmospheric lighting)
  // ------------------------------------------------------------
  const DAY = {
    skyTop: "#1c7dc0", skyMid: "#62b5de", skyLow: "#f0cfa0",
    haze: "#e4c295", sun: "#fff6d6", sunGlow: "#ffda82",
    cloud: "#faf2e4", cloudShade: "#b3cedb",
    farBuild: "#7ea5b8", nearBuild: "#425f6d", window: "#f5dca9",
    ground: "#4d4c4e", ballast: "#6d655b", sleeper: "#524437", rail: "#8a9498", railShine: "#f2f8f5",
    wall: "#a79989", wallDark: "#716558",
    night: 0.0, sunY: 0.16, sunX: 0.76, fog: 0.82,
    shadow: "#15191d", tint: "#ffffff"
  };
  const GOLDEN = {
    skyTop: "#2b6aa8", skyMid: "#dc9a63", skyLow: "#ffc882",
    haze: "#eab077", sun: "#ffefc0", sunGlow: "#ffae4e",
    cloud: "#ffe2c6", cloudShade: "#cda799",
    farBuild: "#997976", nearBuild: "#544750", window: "#ffd896",
    ground: "#4c4345", ballast: "#725e53", sleeper: "#523f33", rail: "#918884", railShine: "#fff4da",
    wall: "#a98c75", wallDark: "#745f50",
    night: 0.12, sunY: 0.30, sunX: 0.81, fog: 0.9,
    shadow: "#20171c", tint: "#ffeed9"
  };
  const SUNSET = {
    skyTop: "#2a336b", skyMid: "#b7586e", skyLow: "#f9a456",
    haze: "#df8c62", sun: "#ffce85", sunGlow: "#ff7633",
    cloud: "#ffc39e", cloudShade: "#9c6378",
    farBuild: "#6e5364", nearBuild: "#363247", window: "#ffcf73",
    ground: "#383037", ballast: "#5c4a45", sleeper: "#443430", rail: "#7e7173", railShine: "#ffe2bc",
    wall: "#8b6c5e", wallDark: "#594542",
    night: 0.36, sunY: 0.42, sunX: 0.83, fog: 0.78,
    shadow: "#1c1219", tint: "#ffd3bb"
  };
  const NIGHT = {
    skyTop: "#050f1f", skyMid: "#0c223a", skyLow: "#264360",
    haze: "#142b40", sun: "#d7e8ff", sunGlow: "#86bcff",
    cloud: "#264157", cloudShade: "#162b3f",
    farBuild: "#132635", nearBuild: "#0a1724", window: "#ffd36d",
    ground: "#14181e", ballast: "#25272b", sleeper: "#2b241f", rail: "#6a7884", railShine: "#dff4ff",
    wall: "#44474a", wallDark: "#292c30",
    night: 0.9, sunY: 0.3, sunX: 0.77, fog: 0.38,
    shadow: "#000000", tint: "#9ac2e6"
  };
  const DAWN = {
    skyTop: "#335488", skyMid: "#948fac", skyLow: "#fcc79f",
    haze: "#ceafa7", sun: "#fff1d2", sunGlow: "#ffbf98",
    cloud: "#eed3ca", cloudShade: "#9491a8",
    farBuild: "#78768f", nearBuild: "#394459", window: "#ffdc9c",
    ground: "#393c44", ballast: "#5f5751", sleeper: "#473a33", rail: "#848c90", railShine: "#f4f1e4",
    wall: "#9b8b80", wallDark: "#635954",
    night: 0.24, sunY: 0.24, sunX: 0.27, fog: 0.7,
    shadow: "#151722", tint: "#fff0e3"
  };

  const THEMES = [
    { at: 0.0, data: DAY },
    { at: 0.34, data: DAY },
    { at: 0.48, data: GOLDEN },
    { at: 0.61, data: SUNSET },
    { at: 0.76, data: NIGHT },
    { at: 0.92, data: DAWN },
    { at: 1.0, data: DAY }
  ];

  const colorKeys = Object.keys(DAY).filter((k) => typeof DAY[k] === "string");
  const numberKeys = ["night", "sunY", "sunX", "fog"];

  function themeFor(cycle) {
    let c = ((cycle % 1) + 1) % 1;
    let a = THEMES[0];
    let b = THEMES[1];
    for (let i = 0; i < THEMES.length - 1; i++) {
      if (c >= THEMES[i].at && c <= THEMES[i + 1].at) {
        a = THEMES[i];
        b = THEMES[i + 1];
        break;
      }
    }
    const raw = invLerp(a.at, b.at, c);
    const t = raw * raw * (3 - 2 * raw);
    const out = {};
    colorKeys.forEach((k) => {
      out[k] = mixHex(a.data[k], b.data[k], t);
    });
    numberKeys.forEach((k) => {
      out[k] = lerp(a.data[k], b.data[k], t);
    });
    return out;
  }

  // ------------------------------------------------------------
  // Runner palettes (3 starter + 1 unlockable pro courier)
  // ------------------------------------------------------------
  const SKINS = {
    dash: {
      name: "DASH",
      trait: "Street rookie",
      cost: 0,
      hoodie: "#ff7a2f", hoodieDark: "#d64b18", hoodieLight: "#ffa363",
      pants: "#203d59", pantsDark: "#142a40", shoe: "#f6ead6", sole: "#ffc62d",
      cap: "#19b9a5", capDark: "#0b7b70", skin: "#8d5a3c", skinDark: "#6e422b",
      hair: "#201711", pack: "#e8b13b", packDark: "#bc8420", accent: "#2fe6c2",
      board: "#2fe6c2", boardAccent: "#ff4f8b", css: "#ff7a2f"
    },
    mika: {
      name: "MIKA",
      trait: "Rail artist",
      cost: 0,
      hoodie: "#19bfae", hoodieDark: "#0b8279", hoodieLight: "#63ead7",
      pants: "#44346b", pantsDark: "#2d2449", shoe: "#fff3da", sole: "#ff4f8b",
      cap: "#ff4f8b", capDark: "#b4265b", skin: "#b97b50", skinDark: "#925c38",
      hair: "#2b1518", pack: "#f3c34f", packDark: "#c39028", accent: "#ff4f8b",
      board: "#ffcf3f", boardAccent: "#ff4f8b", css: "#2fe6c2"
    },
    rook: {
      name: "ROOK",
      trait: "Ex-inspector",
      cost: 0,
      hoodie: "#e7443f", hoodieDark: "#a8212c", hoodieLight: "#ff786a",
      pants: "#1e2734", pantsDark: "#101722", shoe: "#dce2de", sole: "#41d3ff",
      cap: "#161d2a", capDark: "#070c13", skin: "#6d4632", skinDark: "#4e2f20",
      hair: "#131313", pack: "#3a4657", packDark: "#232d3a", accent: "#46d7ff",
      board: "#46d7ff", boardAccent: "#ffc62d", css: "#e7443f"
    },
    vex: {
      name: "VEX",
      trait: "Night courier",
      cost: 350,
      hoodie: "#273342", hoodieDark: "#161e29", hoodieLight: "#4c627a",
      pants: "#181d26", pantsDark: "#0d1117", shoe: "#f2f5f7", sole: "#ff6a2b",
      cap: "#f5b82e", capDark: "#b57d0e", skin: "#c9926b", skinDark: "#9c6d4d",
      hair: "#16141a", pack: "#ff6a2b", packDark: "#c24413", accent: "#ffc62d",
      board: "#ffc62d", boardAccent: "#58dcff", css: "#f5b82e"
    }
  };

  const POWERUPS = {
    magnet: { name: "COIN MAGNET", short: "MAGNET", color: "#58dcff", icon: "M", duration: 10 },
    multiplier: { name: "DOUBLE SCORE", short: "2× SCORE", color: "#ffc62d", icon: "×2", duration: 12 },
    sneakers: { name: "SUPER SNEAKERS", short: "SNEAKERS", color: "#ff7a2f", icon: "⚡", duration: 12 },
    jetpack: { name: "TURBO JETPACK", short: "JETPACK", color: "#ff4f8b", icon: "▲", duration: 7.5 },
    board: { name: "HOVERBOARD", short: "HOVERBOARD", color: "#2fe6c2", icon: "▰", duration: 0 }
  };

  const MISSION_DEFS = [
    { metric: "coins", targets: [40, 55, 75, 95], label: (n) => "Collect " + n + " coins", unit: "" },
    { metric: "distance", targets: [350, 550, 750, 1000], label: (n) => "Run " + n + " metres", unit: " m" },
    { metric: "jumps", targets: [7, 10, 14, 18], label: (n) => "Jump " + n + " times", unit: "" },
    { metric: "powerups", targets: [2, 3, 4], label: (n) => "Grab " + n + " power-ups", unit: "" },
    { metric: "rolls", targets: [4, 6, 9], label: (n) => "Roll " + n + " times", unit: "" },
    { metric: "nearMisses", targets: [3, 5, 7], label: (n) => "Nail " + n + " close calls", unit: "" },
    { metric: "boards", targets: [1, 2], label: (n) => "Deploy " + n + " hoverboard" + (n > 1 ? "s" : ""), unit: "" }
  ];

  function makeMissions() {
    const pool = shuffle(MISSION_DEFS.slice());
    const chosen = [];
    const forcedDistance = MISSION_DEFS.find((m) => m.metric === "distance");
    chosen.push(forcedDistance);
    for (const def of pool) {
      if (chosen.length >= 3) break;
      if (def === forcedDistance) continue;
      chosen.push(def);
    }
    return chosen.map((def, index) => {
      const target = def.targets[(Math.random() * def.targets.length) | 0];
      return {
        id: def.metric,
        metric: def.metric,
        target,
        unit: def.unit,
        title: def.label(target),
        progress: 0,
        done: false,
        index
      };
    });
  }

  const CONFIG = {
    baseSpeed: 16.0,
    maxSpeed: 48,
    speedRamp: 0.016,
    gravity: 31,
    jumpVelocity: 12.6,
    laneSnap: 14.5,
    rollTime: 0.62,
    trainHeight: 2.16,
    jetpackHeight: 4.5,
    magnetRadius: 24,
    spawnHorizon: 178,
    tieGap: 2.55,
    cameraZ: -7,
    countdown: 0.9,
    tunnelPeriod: 460,
    tunnelLength: 88
  };

  function defaultUpgrades() {
    return { magnet: 0, multiplier: 0, sneakers: 0, jetpack: 0 };
  }

  function loadSave() {
    const fallback = {
      highScore: 0,
      totalCoins: 0,
      runs: 0,
      bestDistance: 0,
      skin: "dash",
      unlockedSkins: ["dash", "mika", "rook"],
      upgrades: defaultUpgrades(),
      boardStock: 1,
      weatherMode: "auto",
      muted: false,
      played: false
    };
    try {
      const raw = localStorage.getItem("subwaySuffer.save.v1");
      if (!raw) return fallback;
      const data = JSON.parse(raw);
      const unlocked = Array.isArray(data.unlockedSkins)
        ? Array.from(new Set(["dash", "mika", "rook", ...data.unlockedSkins.filter((k) => SKINS[k])]))
        : ["dash", "mika", "rook"];
      const skin = SKINS[data.skin] && unlocked.includes(data.skin) ? data.skin : "dash";
      const upgrades = Object.assign(defaultUpgrades(), data.upgrades || {});
      for (const k of Object.keys(upgrades)) {
        upgrades[k] = clamp(Math.floor(Number(upgrades[k]) || 0), 0, 5);
      }
      const weatherMode = ["auto", "clear", "rain"].includes(data.weatherMode) ? data.weatherMode : "auto";
      return {
        highScore: Math.max(0, Number(data.highScore) || 0),
        totalCoins: Math.max(0, Number(data.totalCoins) || 0),
        runs: Math.max(0, Number(data.runs) || 0),
        bestDistance: Math.max(0, Number(data.bestDistance) || 0),
        skin,
        unlockedSkins: unlocked,
        upgrades,
        boardStock: clamp(Math.floor(Number(data.boardStock) || 1), 1, 5),
        weatherMode,
        muted: !!data.muted,
        played: !!data.played
      };
    } catch (err) {
      return fallback;
    }
  }

  function persistSave(data) {
    try {
      localStorage.setItem("subwaySuffer.save.v1", JSON.stringify(data));
    } catch (err) {
      /* local file may block storage — game still works */
    }
  }

  const view = {
    w: window.innerWidth,
    h: window.innerHeight,
    dpr: 1,
    horizon: 240,
    focal: 800,
    camY: 3.4,
    camZ: CONFIG.cameraZ,
    laneW: 1.75,
    camX: 0,
    camRoll: 0,
    shakeX: 0,
    shakeY: 0
  };

  SS.TAU = TAU;
  SS.U = {
    clamp, lerp, invLerp, smoothstep, approach, rand, randInt, pick, chance,
    shuffle, mulberry32, mixHex, rgba, shade, formatNum, padScore, easeOutCubic
  };
  SS.CONFIG = CONFIG;
  SS.SKINS = SKINS;
  SS.POWERUPS = POWERUPS;
  SS.MISSION_DEFS = MISSION_DEFS;
  SS.makeMissions = makeMissions;
  SS.themeFor = themeFor;
  SS.loadSave = loadSave;
  SS.persistSave = persistSave;
  SS.view = view;
})();
