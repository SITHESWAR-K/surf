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
  // Mood / time-of-day palettes
  // ------------------------------------------------------------
  const DAY = {
    skyTop: "#1d86c9", skyMid: "#65bce5", skyLow: "#f6d3a0",
    haze: "#efc898", sun: "#fff5cf", sunGlow: "#ffdd85",
    cloud: "#fdf5e4", cloudShade: "#b9d8e5",
    farBuild: "#8db7c9", nearBuild: "#486c7a", window: "#f7ddaa",
    ground: "#545354", ballast: "#746b60", sleeper: "#594b3d", rail: "#8d9698", railShine: "#eef6f0",
    wall: "#b2a290", wallDark: "#7c6f61",
    night: 0.0, sunY: 0.16, sunX: 0.76, fog: 0.82,
    shadow: "#1a1c1e", tint: "#ffffff"
  };
  const GOLDEN = {
    skyTop: "#2e72b7", skyMid: "#e4a46a", skyLow: "#ffd08a",
    haze: "#f1b87d", sun: "#fff0c2", sunGlow: "#ffb455",
    cloud: "#ffe7cf", cloudShade: "#d8b1a1",
    farBuild: "#a4837f", nearBuild: "#5f5159", window: "#ffdda0",
    ground: "#554a4b", ballast: "#7b665a", sleeper: "#5a4639", rail: "#968d89", railShine: "#fff6df",
    wall: "#b3957d", wallDark: "#7e6857",
    night: 0.12, sunY: 0.30, sunX: 0.81, fog: 0.9,
    shadow: "#251b20", tint: "#fff1df"
  };
  const SUNSET = {
    skyTop: "#313a79", skyMid: "#c15f75", skyLow: "#ffad5e",
    haze: "#e99568", sun: "#ffd28a", sunGlow: "#ff7b37",
    cloud: "#ffc9a5", cloudShade: "#a66b80",
    farBuild: "#785a6c", nearBuild: "#3d394f", window: "#ffd37d",
    ground: "#3f363d", ballast: "#65524c", sleeper: "#4b3a35", rail: "#857778", railShine: "#ffe7c4",
    wall: "#957465", wallDark: "#624d49",
    night: 0.36, sunY: 0.42, sunX: 0.83, fog: 0.78,
    shadow: "#21161e", tint: "#ffd8c2"
  };
  const NIGHT = {
    skyTop: "#061326", skyMid: "#0e2844", skyLow: "#315272",
    haze: "#18334a", sun: "#d7e8ff", sunGlow: "#86bcff",
    cloud: "#2d4b63", cloudShade: "#1a3248",
    farBuild: "#172d3e", nearBuild: "#0c1c2b", window: "#ffd36d",
    ground: "#161a20", ballast: "#2b2b2b", sleeper: "#302821", rail: "#6f7c86", railShine: "#e0f6ff",
    wall: "#4b4b4b", wallDark: "#2e3032",
    night: 0.9, sunY: 0.3, sunX: 0.77, fog: 0.38,
    shadow: "#000000", tint: "#9fc6e8"
  };
  const DAWN = {
    skyTop: "#385b91", skyMid: "#9c96b4", skyLow: "#ffcda5",
    haze: "#d5b6ae", sun: "#fff3d6", sunGlow: "#ffc4a0",
    cloud: "#f3d9d0", cloudShade: "#9c99b0",
    farBuild: "#817f97", nearBuild: "#3f4b61", window: "#ffe0a2",
    ground: "#3e4048", ballast: "#665d57", sleeper: "#4e4038", rail: "#889093", railShine: "#f7f4e8",
    wall: "#a49388", wallDark: "#6b605b",
    night: 0.24, sunY: 0.24, sunX: 0.27, fog: 0.7,
    shadow: "#181925", tint: "#fff3e8"
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
  // Runner palettes
  // ------------------------------------------------------------
  const SKINS = {
    dash: {
      name: "DASH",
      hoodie: "#ff7a2f", hoodieDark: "#d64b18", hoodieLight: "#ffa363",
      pants: "#203d59", pantsDark: "#142a40", shoe: "#f6ead6", sole: "#ffc62d",
      cap: "#19b9a5", capDark: "#0b7b70", skin: "#8d5a3c", skinDark: "#6e422b",
      hair: "#201711", pack: "#e8b13b", packDark: "#bc8420", accent: "#2fe6c2",
      board: "#2fe6c2", boardAccent: "#ff4f8b", css: "#ff7a2f"
    },
    mika: {
      name: "MIKA",
      hoodie: "#19bfae", hoodieDark: "#0b8279", hoodieLight: "#63ead7",
      pants: "#44346b", pantsDark: "#2d2449", shoe: "#fff3da", sole: "#ff4f8b",
      cap: "#ff4f8b", capDark: "#b4265b", skin: "#b97b50", skinDark: "#925c38",
      hair: "#2b1518", pack: "#f3c34f", packDark: "#c39028", accent: "#ff4f8b",
      board: "#ffcf3f", boardAccent: "#ff4f8b", css: "#2fe6c2"
    },
    rook: {
      name: "ROOK",
      hoodie: "#e7443f", hoodieDark: "#a8212c", hoodieLight: "#ff786a",
      pants: "#1e2734", pantsDark: "#101722", shoe: "#dce2de", sole: "#41d3ff",
      cap: "#161d2a", capDark: "#070c13", skin: "#6d4632", skinDark: "#4e2f20",
      hair: "#131313", pack: "#3a4657", packDark: "#232d3a", accent: "#46d7ff",
      board: "#46d7ff", boardAccent: "#ffc62d", css: "#e7443f"
    }
  };

  const POWERUPS = {
    magnet: { name: "COIN MAGNET", short: "MAGNET", color: "#58dcff", icon: "M", duration: 10 },
    multiplier: { name: "DOUBLE SCORE", short: "2× SCORE", color: "#ffc62d", icon: "×2", duration: 12 },
    sneakers: { name: "SUPER SNEAKERS", short: "SNEAKERS", color: "#ff7a2f", icon: "⚡", duration: 12 },
    board: { name: "HOVERBOARD", short: "HOVERBOARD", color: "#2fe6c2", icon: "▰", duration: 0 }
  };

  const MISSION_DEFS = [
    { metric: "coins", targets: [35, 50, 65, 85], label: (n) => "Collect " + n + " coins", unit: "" },
    { metric: "distance", targets: [350, 500, 700, 900], label: (n) => "Run " + n + " metres", unit: " m" },
    { metric: "jumps", targets: [7, 10, 14, 18], label: (n) => "Jump " + n + " times", unit: "" },
    { metric: "powerups", targets: [2, 3, 4], label: (n) => "Grab " + n + " power-ups", unit: "" },
    { metric: "rolls", targets: [4, 6, 9], label: (n) => "Roll " + n + " times", unit: "" },
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
    baseSpeed: 15.5,
    maxSpeed: 45,
    speedRamp: 0.0155,
    gravity: 30,
    jumpVelocity: 12.4,
    laneSnap: 13.5,
    rollTime: 0.62,
    trainHeight: 2.16,
    magnetRadius: 22,
    spawnHorizon: 172,
    tieGap: 2.55,
    cameraZ: -7,
    countdown: 0.9
  };

  function loadSave() {
    const fallback = {
      highScore: 0, totalCoins: 0, runs: 0, bestDistance: 0,
      skin: "dash", muted: false, played: false
    };
    try {
      const raw = localStorage.getItem("subwaySuffer.save.v1");
      if (!raw) return fallback;
      const data = JSON.parse(raw);
      return {
        highScore: Math.max(0, Number(data.highScore) || 0),
        totalCoins: Math.max(0, Number(data.totalCoins) || 0),
        runs: Math.max(0, Number(data.runs) || 0),
        bestDistance: Math.max(0, Number(data.bestDistance) || 0),
        skin: SKINS[data.skin] ? data.skin : "dash",
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
    laneW: 1.5,
    camX: 0,
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
