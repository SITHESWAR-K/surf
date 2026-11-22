/* ============================================================
   SUBWAY SUFFER — canvas renderer (environment)
   ============================================================ */
(function () {
  "use strict";

  const SS = window.SS;
  const U = SS.U;
  const view = SS.view;
  const TAU = Math.PI * 2;

  let canvas = null;
  let ctx = null;
  let W = 0;
  let H = 0;
  let DPR = 1;
  let scene = null;
  let lastFramePalette = null;

  const clamp = U.clamp;
  const lerp = U.lerp;

  // ------------------------------------------------------------
  // Projection helpers
  // ------------------------------------------------------------
  function project(x, y, z) {
    const depth = z - view.camZ;
    const safe = Math.max(0.35, depth);
    const scale = view.focal / safe;
    return {
      x: view.w * 0.5 + (x - view.camX) * scale + view.shakeX,
      y: view.horizon + (view.camY - y) * scale + view.shakeY,
      s: scale,
      z
    };
  }

  function pathPoly(points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
  }

  function fillPoly(points, fill, stroke, lineWidth) {
    pathPoly(points);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 1;
      ctx.stroke();
    }
  }

  function quad(a, b, c, d, fill, stroke, lw) {
    fillPoly([a, b, c, d], fill, stroke, lw);
  }

  function line(x1, y1, x2, y2, color, width) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.stroke();
  }

  function roundRectPath(x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) * 0.5, Math.abs(h) * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function ell(x, y, rx, ry, fill) {
    if (rx <= 0 || ry <= 0) return;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function fogColor(color, z, amountScale) {
    const fog = U.smoothstep(62, 176, z) * (amountScale == null ? 0.68 : amountScale);
    return U.mixHex(color, lastFramePalette ? lastFramePalette.haze : "#efc898", fog);
  }

  function laneX(lane) {
    return (lane - 1) * view.laneW;
  }

  // ------------------------------------------------------------
  // Setup / scene generation
  // ------------------------------------------------------------
  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d", { alpha: false });
    resize();
    window.addEventListener("resize", () => resize());
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => resize());
    }
  }

  function resize() {
    if (!canvas) return;
    W = Math.max(320, window.innerWidth);
    H = Math.max(280, window.innerHeight);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    if (ctx) ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const metrics = SS.Logic
      ? SS.Logic.computeViewportMetrics(W, H)
      : {
          horizon: H * 0.295,
          focal: Math.min(H * 1.08, W * 1.7),
          camY: ((H * 0.81 - H * 0.295) * 7) / Math.min(H * 1.08, W * 1.7),
          laneW: clamp((W / H) * 1.28, 1.32, 2.25)
        };
    view.w = W;
    view.h = H;
    view.dpr = DPR;
    view.horizon = metrics.horizon;
    view.focal = metrics.focal;
    view.baseCamY = metrics.camY;
    view.camY = metrics.camY;
    view.laneW = metrics.laneW;
    view.camZ = SS.CONFIG.cameraZ;

    buildScene();
  }

  function buildScene() {
    const seed = (Math.floor(W * 0.71) + Math.floor(H * 1.37) + 303) >>> 0;
    const rng = U.mulberry32(seed);
    const span = W * 1.65;

    const makeLayer = (count, minW, maxW, minH, maxH, base) => {
      const list = [];
      for (let i = 0; i < count; i++) {
        const bw = U.lerp(minW, maxW, rng()) * W;
        const bh = U.lerp(minH, maxH, rng()) * H;
        const b = {
          x: rng() * span,
          w: bw,
          h: bh,
          base,
          style: (rng() * 4) | 0,
          tone: rng(),
          windows: [],
          antenna: rng() > 0.72,
          tank: rng() > 0.86
        };
        const cols = Math.max(2, Math.floor(bw / 16));
        const rows = Math.max(2, Math.floor(bh / 24));
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            if (rng() > 0.58) b.windows.push({ x, y, bright: rng() > 0.74 });
          }
        }
        b.cols = cols;
        b.rows = rows;
        list.push(b);
      }
      return list;
    };

    const layers = [
      {
        span,
        scroll: 0.12,
        list: makeLayer(28, 0.022, 0.065, 0.06, 0.19, 16),
        kind: "far"
      },
      {
        span,
        scroll: 0.25,
        list: makeLayer(22, 0.032, 0.092, 0.08, 0.24, 28),
        kind: "near"
      }
    ];

    const clouds = [];
    for (let i = 0; i < 8; i++) {
      clouds.push({
        x: rng() * 1.5,
        y: 0.045 + rng() * 0.20,
        scale: 0.55 + rng() * 1.15,
        speed: 0.12 + rng() * 0.35,
        shade: rng()
      });
    }

    const stars = [];
    for (let i = 0; i < 90; i++) {
      stars.push({
        x: rng(),
        y: rng() * 0.26,
        size: 0.5 + rng() * 1.4,
        phase: rng() * TAU
      });
    }

    const stones = [];
    for (let i = 0; i < 170; i++) {
      stones.push({
        x: (rng() * 2 - 1) * 3.15,
        z: rng() * 180,
        r: 0.014 + rng() * 0.036,
        tone: rng()
      });
    }

    const signals = [];
    for (let i = 0; i < 9; i++) {
      signals.push({ z: i * 21 + 9, side: i % 2 === 0 ? -1 : 1 });
    }

    const raindrops = [];
    for (let i = 0; i < 110; i++) {
      raindrops.push({
        x: rng(),
        y: rng(),
        len: 12 + rng() * 22,
        speed: 1.15 + rng() * 0.9,
        alpha: 0.16 + rng() * 0.28
      });
    }

    scene = { layers, clouds, stars, stones, signals, raindrops, span };
  }

  // ------------------------------------------------------------
  // Sky, sun, clouds and skyline
  // ------------------------------------------------------------
  function drawSky(g, theme, now) {
    const horizon = view.horizon;
    const grad = ctx.createLinearGradient(0, 0, 0, horizon + H * 0.12);
    grad.addColorStop(0, theme.skyTop);
    grad.addColorStop(0.58, theme.skyMid);
    grad.addColorStop(1, theme.skyLow);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, horizon + H * 0.12);

    // Stars appear as the palette rolls into night.
    const starAlpha = U.smoothstep(0.35, 0.86, theme.night);
    if (starAlpha > 0.01) {
      ctx.save();
      for (const s of scene.stars) {
        const twinkle = 0.5 + 0.5 * Math.sin(now * 1.7 + s.phase);
        ctx.globalAlpha = starAlpha * (0.28 + twinkle * 0.72);
        ctx.fillStyle = "#e8f4ff";
        const sx = s.x * W - view.camX * 2.2;
        const sy = s.y * H;
        ctx.fillRect(sx, sy, s.size, s.size);
      }
      ctx.restore();
    }

    // Sun / moon with a broad atmospheric bloom.
    const sunX = W * theme.sunX - view.camX * 6;
    const sunY = horizon - H * 0.205;
    const glowR = Math.max(W, H) * 0.34;
    const glow = ctx.createRadialGradient(sunX, sunY, 3, sunX, sunY, glowR);
    glow.addColorStop(0, U.rgba(theme.sunGlow, 0.5));
    glow.addColorStop(0.16, U.rgba(theme.sunGlow, 0.22));
    glow.addColorStop(0.5, U.rgba(theme.sunGlow, 0.06));
    glow.addColorStop(1, U.rgba(theme.sunGlow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - glowR, sunY - glowR, glowR * 2, glowR * 2);
    const sunR = Math.max(19, H * 0.038);
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, TAU);
    ctx.fillStyle = theme.sun;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sunX - sunR * 0.17, sunY - sunR * 0.17, sunR * 0.74, 0, TAU);
    ctx.fillStyle = U.rgba("#ffffff", 0.15);
    ctx.fill();

    // Layered clouds.
    ctx.save();
    const cloudAlpha = 0.5 + (1 - theme.night) * 0.3;
    for (const c of scene.clouds) {
      const span = W * 1.5;
      let cx = c.x * span + now * 3.5 * c.speed - (g.mode === "menu" ? g.menuScroll : g.distance) * 0.35 - view.camX * 7;
      cx = ((cx % span) + span) % span - W * 0.18;
      const cy = c.y * H;
      const s = c.scale * (W / 1200) * 80;
      ctx.globalAlpha = cloudAlpha * (0.36 + c.scale * 0.18);
      ctx.fillStyle = theme.cloud;
      ell(cx, cy, s * 1.8, s * 0.58, theme.cloud);
      ell(cx - s * 0.7, cy + s * 0.05, s * 0.95, s * 0.44, theme.cloud);
      ell(cx + s * 0.95, cy + s * 0.1, s * 1.05, s * 0.42, theme.cloud);
      ctx.globalAlpha = cloudAlpha * 0.22;
      ell(cx + s * 0.12, cy + s * 0.28, s * 1.45, s * 0.24, theme.cloudShade);
    }
    ctx.restore();
  }

  function drawSkyline(g, theme, now) {
    const horizon = view.horizon;
    const scrollBase = (g.mode === "menu" ? g.menuScroll : g.distance);

    // Soft city haze band.
    const haze = ctx.createLinearGradient(0, horizon - H * 0.04, 0, horizon + H * 0.08);
    haze.addColorStop(0, U.rgba(theme.haze, 0));
    haze.addColorStop(0.45, U.rgba(theme.haze, 0.32 + theme.night * 0.12));
    haze.addColorStop(1, U.rgba(theme.haze, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - H * 0.05, W, H * 0.15);

    for (let layerIndex = 0; layerIndex < scene.layers.length; layerIndex++) {
      const layer = scene.layers[layerIndex];
      const far = layer.kind === "far";
      const color = far ? theme.farBuild : theme.nearBuild;
      const alpha = far ? 0.42 : 0.68;
      const baseY = horizon + (far ? 8 : 24);
      const span = layer.span;
      const offset = ((scrollBase * layer.scroll + view.camX * 9 * layer.scroll) % span + span) % span;

      ctx.save();
      ctx.globalAlpha = alpha;
      for (const b of layer.list) {
        for (let copy = 0; copy < 2; copy++) {
          const x = b.x - offset + copy * span;
          if (x + b.w < -20 || x > W + 20) continue;
          const w = b.w;
          const h = b.h;
          const y = baseY - h;
          let fill = U.mixHex(color, b.tone > 0.5 ? theme.haze : "#000000", far ? 0.12 + b.tone * 0.1 : 0.03 + b.tone * 0.12);
          ctx.fillStyle = fill;
          ctx.fillRect(x, y, w, h + 6);

          // Rooftop silhouette details.
          if (b.style === 1) {
            ctx.fillRect(x + w * 0.2, y - h * 0.12, Math.max(2, w * 0.06), h * 0.12);
            ctx.fillRect(x + w * 0.18, y - h * 0.15, w * 0.1, Math.max(2, h * 0.04));
          } else if (b.style === 2) {
            ctx.fillRect(x + w * 0.15, y - Math.max(2, h * 0.035), w * 0.12, Math.max(2, h * 0.035));
            ctx.fillRect(x + w * 0.7, y - Math.max(2, h * 0.025), w * 0.16, Math.max(2, h * 0.025));
          } else if (b.style === 3) {
            ctx.fillRect(x + w * 0.4, y - h * 0.04, w * 0.2, h * 0.04);
            ctx.fillRect(x + w * 0.48, y - h * 0.07, w * 0.05, h * 0.035);
          }
          if (b.antenna) {
            const ax = x + w * (0.22 + b.tone * 0.5);
            line(ax, y, ax, y - h * 0.09, U.rgba(theme.nearBuild, 0.8), 1);
            line(ax - w * 0.025, y - h * 0.055, ax + w * 0.025, y - h * 0.055, U.rgba(theme.nearBuild, 0.8), 1);
          }
          if (b.tank && !far) {
            const tx = x + w * 0.64;
            const ty = y - h * 0.085;
            ctx.fillStyle = U.rgba(theme.nearBuild, 0.96);
            ctx.fillRect(tx, ty + h * 0.025, w * 0.15, h * 0.055);
            ctx.beginPath();
            ctx.moveTo(tx + w * 0.15, ty + h * 0.025);
            ctx.lineTo(tx + w * 0.08, ty);
            ctx.lineTo(tx - w * 0.004, ty + h * 0.025);
            ctx.closePath();
            ctx.fill();
          }

          // A few warm windows; strongest at night.
          if (!far && b.windows.length) {
            const winAlpha = 0.08 + theme.night * 0.55;
            const cellW = w / b.cols;
            const cellH = h / b.rows;
            for (const win of b.windows) {
              if (!win.bright && theme.night < 0.4) continue;
              ctx.globalAlpha = alpha * winAlpha * (win.bright ? 1 : 0.5);
              ctx.fillStyle = win.bright ? theme.window : U.mixHex(theme.window, theme.nearBuild, 0.55);
              ctx.fillRect(x + win.x * cellW + cellW * 0.27, y + win.y * cellH + cellH * 0.28, Math.max(1.2, cellW * 0.32), Math.max(1.2, cellH * 0.3));
            }
            ctx.globalAlpha = alpha;
          }

          if (!far) {
            // Building base shadow line.
            ctx.fillStyle = U.rgba("#000000", 0.16);
            ctx.fillRect(x, baseY - 3, w, 5);
          }
        }
      }
      ctx.restore();
    }

    // Tiny birds on bright days.
    const birdAlpha = U.clamp(1 - theme.night * 1.35, 0, 0.8) * 0.45;
    if (birdAlpha > 0.02) {
      ctx.save();
      ctx.strokeStyle = U.rgba("#1b3547", birdAlpha);
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 5; i++) {
        const bx = W * 0.57 + i * 31 + Math.sin(now * 0.23 + i) * 8 - view.camX * 4;
        const by = H * 0.12 + (i % 2) * 23 + Math.sin(now * 0.6 + i) * 2;
        const flap = Math.sin(now * 3 + i * 1.7) * 3;
        ctx.beginPath();
        ctx.moveTo(bx - 6, by + flap * 0.2);
        ctx.quadraticCurveTo(bx - 2, by - 3 - flap, bx, by);
        ctx.quadraticCurveTo(bx + 2, by - 3 - flap, bx + 6, by + flap * 0.2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Soft sunlit horizon.
    const rim = ctx.createLinearGradient(0, horizon - 3, 0, horizon + 22);
    rim.addColorStop(0, U.rgba(theme.sunGlow, 0.16 + theme.night * 0.04));
    rim.addColorStop(1, U.rgba(theme.haze, 0));
    ctx.fillStyle = rim;
    ctx.fillRect(0, horizon - 3, W, 26);
  }

  // ------------------------------------------------------------
  // Ground and rail bed
  // ------------------------------------------------------------
  function drawGround(g, theme) {
    const horizon = view.horizon;
    const grad = ctx.createLinearGradient(0, horizon, 0, H);
    grad.addColorStop(0, U.mixHex(theme.ground, theme.haze, 0.38));
    grad.addColorStop(0.38, theme.ground);
    grad.addColorStop(1, U.shade(theme.ground, -0.24));
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizon, W, H - horizon + 2);

    // Broad ballast shoulder.
    const bedHalf = view.laneW * 1.78 + 0.55;
    const nearL = project(-bedHalf, 0, -4);
    const nearR = project(bedHalf, 0, -4);
    const farL = project(-bedHalf, 0, 162);
    const farR = project(bedHalf, 0, 162);
    fillPoly([nearL, nearR, farR, farL], U.mixHex(theme.ballast, theme.ground, 0.35));

    // Concrete shoulders either side of the tracks.
    const shoulderL1 = project(-bedHalf - 0.8, 0, -4);
    const shoulderL2 = project(-bedHalf - 0.8, 0, 162);
    const shoulderR1 = project(bedHalf + 0.8, 0, -4);
    const shoulderR2 = project(bedHalf + 0.8, 0, 162);
    quad(nearL, shoulderL1, shoulderL2, farL, U.mixHex(theme.wallDark, theme.ground, 0.35));
    quad(nearR, shoulderR1, shoulderR2, farR, U.mixHex(theme.wallDark, theme.ground, 0.4));

    // Faint lane-colored service strips + wet rain sheen.
    const rain = g.rain || 0;
    for (let i = 0; i < 3; i++) {
      const lx = laneX(i);
      const half = view.laneW * 0.6;
      const a = project(lx - half, 0.005, -2);
      const b = project(lx + half, 0.005, -2);
      const c = project(lx + half, 0.005, 165);
      const d = project(lx - half, 0.005, 165);
      quad(a, b, c, d, U.rgba(U.shade(theme.ballast, rain > 0.1 ? -0.22 : -0.1), 0.34 + rain * 0.18));
    }

    if (rain > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const sheen = ctx.createLinearGradient(0, horizon, 0, H);
      sheen.addColorStop(0, U.rgba(theme.skyLow, 0.02));
      sheen.addColorStop(0.55, U.rgba(theme.skyMid, 0.09 * rain));
      sheen.addColorStop(1, U.rgba("#d8eeff", 0.12 * rain));
      ctx.fillStyle = sheen;
      ctx.fillRect(0, horizon, W, H - horizon);
      ctx.restore();
    }
  }

  function drawBallast(theme, scroll) {
    if (!scene.stones) return;
    ctx.save();
    for (const stone of scene.stones) {
      let z = stone.z - (scroll % 180);
      if (z < -3) z += 180;
      if (z > 166) continue;
      const p = project(stone.x * (view.laneW / 1.6), 0.012, z);
      if (p.y < view.horizon + 1) continue;
      const size = clamp(p.s * stone.r, 0.4, 2.1);
      const tone = stone.tone > 0.66 ? U.shade(theme.ballast, 0.18) : stone.tone > 0.33 ? U.shade(theme.ballast, -0.18) : theme.ballast;
      ctx.globalAlpha = clamp(0.18 + p.s * 0.02, 0.15, 0.52);
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, size, size * 0.5, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTracks(g, theme) {
    const scroll = g.mode === "menu" ? g.menuScroll : g.distance;
    drawBallast(theme, scroll);

    const tieGap = SS.CONFIG.tieGap;
    const offset = scroll % tieGap;
    const maxIndex = Math.ceil(162 / tieGap) + 1;
    const tieDepth = 0.34;
    const tHalf = view.laneW * 0.43;
    const stagger = [0.1, -0.05, 0.14];

    for (let i = maxIndex; i >= -2; i--) {
      const z = i * tieGap - offset;
      if (z < -4 || z > 165) continue;
      const fade = clamp(1 - (z - 125) / 45, 0, 1);
      if (fade <= 0) continue;
      for (let lane = 0; lane < 3; lane++) {
        const lx = laneX(lane);
        const zz = z + stagger[lane];
        const a = project(lx - tHalf, 0.018, zz);
        const b = project(lx + tHalf, 0.018, zz);
        const c = project(lx + tHalf, 0.018, zz + tieDepth);
        const d = project(lx - tHalf, 0.018, zz + tieDepth);
        const shadeAmount = i % 5 === 0 ? 0.09 : i % 3 === 0 ? -0.08 : 0;
        const col = U.shade(theme.sleeper, shadeAmount);
        ctx.globalAlpha = fade;
        quad(a, b, c, d, U.mixHex(col, theme.haze, 0.06), U.rgba(theme.shadow, 0.22), 0.6);
        // Metal tie plates.
        if (pixelsPerMeter(zz) > 22) {
          const gauge = railGauge();
          for (const side of [-1, 1]) {
            const rx = lx + side * gauge;
            const p1 = project(rx - 0.055, 0.032, zz + tieDepth * 0.26);
            const p2 = project(rx + 0.055, 0.032, zz + tieDepth * 0.26);
            const p3 = project(rx + 0.055, 0.032, zz + tieDepth * 0.74);
            const p4 = project(rx - 0.055, 0.032, zz + tieDepth * 0.74);
            quad(p1, p2, p3, p4, U.mixHex(theme.rail, theme.sleeper, 0.3));
          }
        }
      }
    }
    ctx.globalAlpha = 1;

    // Rail lines, built as long perspective quads.
    const gauge = railGauge();
    for (let lane = 0; lane < 3; lane++) {
      const lx = laneX(lane);
      for (const side of [-1, 1]) {
        const rx = lx + side * gauge;
        drawRail(rx, -4, 165, theme);
      }
      // Dark cable channel down the middle.
      const a = project(lx - 0.12, 0.006, -4);
      const b = project(lx + 0.12, 0.006, -4);
      const c = project(lx + 0.012, 0.006, 165);
      const d = project(lx - 0.012, 0.006, 165);
      quad(a, b, c, d, U.rgba("#0b0d0e", 0.22));
    }

    // Rail glints close to the camera.
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let lane = 0; lane < 3; lane++) {
      const lx = laneX(lane);
      for (const side of [-1, 1]) {
        const rx = lx + side * gauge;
        const p = project(rx, 0.1, 10);
        const gAlpha = 0.1 + Math.sin(g.time * 2.1 + lane + side) * 0.045;
        ctx.globalAlpha = gAlpha;
        ell(p.x, p.y, Math.max(1, p.s * 0.2), Math.max(0.7, p.s * 0.025), theme.railShine);
      }
    }
    ctx.restore();
  }

  function railGauge() {
    return clamp(view.laneW * 0.34, 0.36, 0.76);
  }

  function pixelsPerMeter(z) {
    return view.focal / Math.max(0.4, z - view.camZ);
  }

  function drawRail(x, zNear, zFar, theme) {
    const railW = 0.065;
    const nL = project(x - railW, 0.095, zNear);
    const nR = project(x + railW, 0.095, zNear);
    const fR = project(x + railW * 0.7, 0.095, zFar);
    const fL = project(x - railW * 0.7, 0.095, zFar);
    quad(nL, nR, fR, fL, U.mixHex(theme.rail, theme.haze, 0.02));

    // Side faces for weight and perspective.
    const nL2 = project(x - railW, 0.075, zNear);
    const nR2 = project(x + railW, 0.075, zNear);
    const fR2 = project(x + railW * 0.7, 0.075, zFar);
    const fL2 = project(x - railW * 0.7, 0.075, zFar);
    quad(nL2, nR2, fR2, fL2, U.mixHex(theme.rail, "#101416", 0.4));

    // Polished running edge.
    line(project(x - railW * 0.36, 0.1, zNear).x, project(x - railW * 0.36, 0.1, zNear).y,
      project(x - railW * 0.2, 0.1, zFar).x, project(x - railW * 0.2, 0.1, zFar).y,
      U.rgba(theme.railShine, 0.55), 0.9);
  }

  // ------------------------------------------------------------
  // World objects: trains, barriers, overheads, coins, power-ups
  // ------------------------------------------------------------
  const TRAIN_STYLES = [
    { body: "#f0b32a", dark: "#b46f12", light: "#ffd266", roof: "#f9d77d", stripe: "#23363f", window: "#17303d", accent: "#e95434" },
    { body: "#dae3e5", dark: "#8a9ba0", light: "#f5fbfb", roof: "#eef4f3", stripe: "#cf4c3f", window: "#1c3442", accent: "#2878a1" },
    { body: "#3f9f8d", dark: "#216b60", light: "#78d0bc", roof: "#c5e9df", stripe: "#f1c94c", window: "#14313a", accent: "#e9f0e7" },
    { body: "#c94b3e", dark: "#8a2c2a", light: "#ee7b69", roof: "#e6d0c0", stripe: "#1c2d39", window: "#173044", accent: "#ffc62d" },
    { body: "#4273a2", dark: "#284967", light: "#76a4ca", roof: "#bfd4e0", stripe: "#e6b83b", window: "#132b3a", accent: "#f1f4e9" }
  ];

  function drawEntity(e, theme, g) {
    if (!e || e.z < -26 || e.z > 186) return;
    if (e.type === "train") drawTrain(e, theme, g);
    else if (e.type === "ramp") drawRamp(e, theme, g);
    else if (e.type === "barrier") drawBarrier(e, theme, g);
    else if (e.type === "overhead") drawOverhead(e, theme, g);
    else if (e.type === "coin") drawCoin(e, theme, g);
    else if (e.type === "powerup") drawPowerup(e, theme, g);
  }

  function drawWorld(g, theme) {
    if (g.mode === "menu") {
      drawMenuScenery(g, theme);
      return;
    }
    const list = g.entities || [];
    const sorted = list.slice().sort((a, b) => {
      const da = a.type === "train" ? a.z - (a.len || 16) * 0.5 : a.type === "ramp" ? a.z - (a.len || 7) * 0.45 : a.z;
      const db = b.type === "train" ? b.z - (b.len || 16) * 0.5 : b.type === "ramp" ? b.z - (b.len || 7) * 0.45 : b.z;
      return db - da;
    });
    for (const e of sorted) drawEntity(e, theme, g);
  }

  function drawMenuScenery(g, theme) {
    // A quiet scene behind the start screen. Deliberately parked and low-contrast.
    drawTrain(
      { type: "train", lane: 0, z: 66, len: 22, variant: 2, widthScale: 0.8, lights: false, menu: true },
      theme, g
    );
    drawTrain(
      { type: "train", lane: 2, z: 110, len: 17, variant: 1, widthScale: 0.8, lights: false, menu: true },
      theme, g
    );
    for (let i = 0; i < 7; i++) {
      drawCoin(
        { type: "coin", x: 0, z: 24 + i * 2.2, y: 0.75 + Math.sin((i / 6) * Math.PI) * 1.4, phase: i * 0.6, menu: true },
        theme, g
      );
    }
    drawBarrier({ type: "barrier", lane: 1, z: 49, menu: true }, theme, g);
  }

  function pSide(x, y, z1, z2) {
    return [project(x, y, z1), project(x, y, z2)];
  }

  function trainWindowGlow(theme) {
    return U.mixHex("#132b38", theme.window, 0.16 + theme.night * 0.58);
  }

  function drawTrain(e, theme, g) {
    const x = laneX(e.lane);
    const hw = view.laneW * (e.widthScale || 0.8) * 0.5;
    const h = e.roofHeight || SS.CONFIG.trainHeight;
    const len = e.len || 16;
    const zN = e.z - len * 0.5;
    const zF = e.z + len * 0.5;
    if (zF < -5 || zN > 172) return;
    const style = TRAIN_STYLES[(e.variant == null ? 0 : e.variant) % TRAIN_STYLES.length];
    const isMenu = !!e.menu;

    const nl = project(x - hw, 0.16, zN);
    const nr = project(x + hw, 0.16, zN);
    const fl = project(x - hw, 0.16, zF);
    const fr = project(x + hw, 0.16, zF);
    const nlt = project(x - hw, h, zN);
    const nrt = project(x + hw, h, zN);
    const flt = project(x - hw, h, zF);
    const frt = project(x + hw, h, zF);

    // Contact shadow and ballast shade.
    ctx.save();
    ctx.globalAlpha = isMenu ? 0.22 : 0.33;
    const sh1 = project(x - hw * 1.28, 0.012, zN);
    const sh2 = project(x + hw * 1.28, 0.012, zN);
    const sh3 = project(x + hw * 1.28, 0.012, zF);
    const sh4 = project(x - hw * 1.28, 0.012, zF);
    fillPoly([sh1, sh2, sh3, sh4], U.rgba("#080b0d", 0.8));
    ctx.restore();

    // Rear underside, visible between the rails.
    quad(
      project(x - hw * 0.9, 0.18, zN + 0.3),
      project(x + hw * 0.9, 0.18, zN + 0.3),
      project(x + hw * 0.9, 0.62, zN + 0.3),
      project(x - hw * 0.9, 0.62, zN + 0.3),
      "#172026", U.rgba("#000000", 0.35), 0.8
    );

    const cameraInside = view.camX > x - hw && view.camX < x + hw;
    const sideX = view.camX <= x ? x - hw : x + hw;
    const sideDir = view.camX <= x ? -1 : 1;

    // Side body (viewed face only).
    if (!cameraInside || Math.abs(view.camX - x) > hw * 0.16) {
      const sn = project(sideX, 0.2, zN);
      const sf = project(sideX, 0.2, zF);
      const snt = project(sideX, h, zN);
      const sft = project(sideX, h, zF);
      quad(sn, sf, sft, snt, isMenu ? U.mixHex(style.dark, theme.haze, 0.2) : style.body);

      // Undercarriage band.
      const u1 = project(sideX, 0.2, zN);
      const u2 = project(sideX, 0.2, zF);
      const u3 = project(sideX, 0.48, zF);
      const u4 = project(sideX, 0.48, zN);
      quad(u1, u2, u3, u4, U.mixHex(style.dark, "#101314", 0.48));

      // Paint stripe and lower skirt.
      const band1a = project(sideX, 0.84, zN);
      const band1b = project(sideX, 0.84, zF);
      const band2a = project(sideX, 1.03, zN);
      const band2b = project(sideX, 1.03, zF);
      quad(band1a, band1b, band2b, band2a, style.stripe);

      // Windows and doors, clipped to the side face.
      ctx.save();
      pathPoly([sn, sf, sft, snt]);
      ctx.clip();

      const step = 1.72;
      const gap = 0.38;
      for (let wz = zN + 1.3; wz < zF - 1.1; wz += step) {
        const zEnd = Math.min(zF - 0.8, wz + step - gap);
        if (zEnd <= wz) break;
        const y0 = 1.35;
        const y1 = 1.94;
        const a = project(sideX, y0, wz);
        const b = project(sideX, y0, zEnd);
        const c = project(sideX, y1, zEnd);
        const d = project(sideX, y1, wz);
        quad(a, b, c, d, trainWindowGlow(theme), "rgba(10,25,32,0.36)", Math.max(0.5, a.s * 0.003));
        const shine = project(sideX, y1 - 0.08, wz + (zEnd - wz) * 0.12);
        const shine2 = project(sideX, y1 - 0.24, zEnd - (zEnd - wz) * 0.2);
        line(shine.x, shine.y, shine2.x, shine2.y, "rgba(215,247,255,0.25)", Math.max(0.5, a.s * 0.004));
      }

      // Door seams.
      for (let dz = zN + 3.8; dz < zF - 2; dz += 7.4) {
        const d1 = project(sideX, 0.3, dz);
        const d2 = project(sideX, 0.3, dz + 1.65);
        const d3 = project(sideX, 2.02, dz + 1.65);
        const d4 = project(sideX, 2.02, dz);
        quad(d1, d2, d3, d4, U.rgba(style.dark, 0.25), U.rgba("#0b1317", 0.28), Math.max(0.4, d1.s * 0.002));
        line(project(sideX, 0.32, dz + 0.82).x, project(sideX, 0.32, dz + 0.82).y, project(sideX, 2.0, dz + 0.82).x, project(sideX, 2.0, dz + 0.82).y, U.rgba("#0b1317", 0.3), Math.max(0.4, d1.s * 0.002));
      }

      // Graffiti scrawl, only when near enough to read.
      const nearScreen = project(sideX, 1.2, (zN + zF) * 0.5);
      if (!isMenu && nearScreen.s > 42 && e.z < 70) {
        const colors = ["#2fe6c2", "#ffc62d", "#ff4f8b", "#58dcff"];
        const c1 = colors[(e.variant + 1) % colors.length];
        const c2 = colors[(e.variant + 3) % colors.length];
        const left = project(sideX, 1.2, zN + len * 0.22);
        const right = project(sideX, 1.2, zN + len * 0.72);
        const midX = (left.x + right.x) * 0.5;
        const midY = (left.y + right.y) * 0.5;
        const span = Math.abs(right.x - left.x);
        const size = clamp(span * 0.14, 8, 42);
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.translate(midX, midY);
        ctx.rotate(-0.1 * sideDir);
        ctx.font = "900 " + size + "px 'Arial Black', Impact, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(7,16,20,0.7)";
        ctx.lineWidth = size * 0.16;
        const tag = e.variant % 2 === 0 ? "RUSH" : "9";
        ctx.strokeText(tag, 0, 0);
        ctx.fillStyle = c1;
        ctx.fillText(tag, 0, 0);
        ctx.strokeStyle = c2;
        ctx.lineWidth = size * 0.08;
        ctx.beginPath();
        ctx.moveTo(-span * 0.18, size * 0.58);
        ctx.quadraticCurveTo(-span * 0.02, size * 0.2, span * 0.2, size * 0.52);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      // Rivets are tiny but sell the scale.
      if (nearScreen.s > 80) {
        for (let rz = zN + 1; rz < zF - 1; rz += 2.7) {
          const p = project(sideX, 0.74, rz);
          ctx.globalAlpha = 0.18;
          ell(p.x, p.y, Math.max(0.5, p.s * 0.008), Math.max(0.5, p.s * 0.008), "#e8f2f0");
          ctx.globalAlpha = 1;
        }
      }
    }

    // Roof.
    if (!isMenu) {
      const roofBase = U.mixHex(style.roof, "#59605c", 0.33);
      quad(nlt, nrt, frt, flt, roofBase, U.rgba("#5d5a50", 0.28), Math.max(0.4, nlt.s * 0.002));

      // Walkway and roof ribs keep the runnable surface readable.
      const walkNL = project(x - hw * 0.24, h + 0.012, zN + 0.4);
      const walkNR = project(x + hw * 0.24, h + 0.012, zN + 0.4);
      const walkFL = project(x - hw * 0.24, h + 0.012, zF - 0.4);
      const walkFR = project(x + hw * 0.24, h + 0.012, zF - 0.4);
      quad(walkNL, walkNR, walkFR, walkFL, "rgba(55,62,59,0.13)");
      for (let rz = zN + 1.8; rz < zF - 0.8; rz += 2.55) {
        const ra = project(x - hw * 0.92, h + 0.018, rz);
        const rb = project(x + hw * 0.92, h + 0.018, rz);
        line(ra.x, ra.y, rb.x, rb.y, "rgba(46,53,51,0.22)", Math.max(0.5, ra.s * 0.0035));
      }

      // Warm edge strips sell the roof boundary.
      for (const side of [-1, 1]) {
        const a = project(x + side * hw * 0.9, h + 0.03, zN + 0.3);
        const b = project(x + side * hw * 0.9, h + 0.03, zF - 0.3);
        line(a.x, a.y, b.x, b.y, "rgba(255,198,45,0.26)", Math.max(0.6, a.s * 0.005));
      }

      const roofEdge = project(x, h + 0.03, zN);
      const roofEdge2 = project(x, h + 0.03, zF);
      line(roofEdge.x, roofEdge.y, roofEdge2.x, roofEdge2.y, U.rgba("#fdf8e8", 0.2), Math.max(0.5, roofEdge.s * 0.004));

      // Rooftop air-conditioning boxes.
      if (!isMenu && e.z < 100 && nlt.s * len > 110) {
        for (let i = 0; i < 3; i++) {
          const cz = zN + len * (0.23 + i * 0.26);
          const cw = hw * 0.46;
          const boxNearL = project(x - cw, h, cz - 0.5);
          const boxNearR = project(x + cw, h, cz - 0.5);
          const topNearL = project(x - cw, h + 0.19, cz - 0.5);
          const topNearR = project(x + cw, h + 0.19, cz - 0.5);
          const boxFarR = project(x + cw, h, cz + 0.7);
          const topFarR = project(x + cw, h + 0.19, cz + 0.7);
          const topFarL = project(x - cw, h + 0.19, cz + 0.7);
          // Near face, visible flank, then the top lid.
          quad(boxNearL, boxNearR, topNearR, topNearL, U.mixHex(roofBase, "#303633", 0.5), "rgba(34,42,43,0.3)", Math.max(0.4, topNearL.s * 0.003));
          fillPoly([boxNearR, boxFarR, topFarR, topNearR], U.mixHex(roofBase, "#303633", 0.38));
          fillPoly([topNearL, topNearR, topFarR, topFarL], U.mixHex(roofBase, "#9aa19b", 0.32));
          line(boxNearL.x, boxNearL.y, topNearL.x, topNearL.y, U.rgba("#222a2b", 0.4), Math.max(0.4, topNearL.s * 0.003));
          line(topNearL.x, topNearL.y, topFarL.x, topFarL.y, U.rgba("#222a2b", 0.25), Math.max(0.4, topNearL.s * 0.003));
        }
      }
    }

    // Near face — rear/front cab.
    const faceW = hw * 0.94;
    const fnl = project(x - faceW, 0.2, zN);
    const fnr = project(x + faceW, 0.2, zN);
    const fntl = project(x - faceW, h - 0.04, zN);
    const fntr = project(x + faceW, h - 0.04, zN);
    quad(fnl, fnr, fntr, fntl, isMenu ? U.mixHex(style.dark, theme.haze, 0.24) : style.body, U.rgba("#0a1013", 0.34), Math.max(0.5, fnl.s * 0.002));

    // Yellow warning bumper.
    const b0 = project(x - faceW, 0.28, zN - 0.01);
    const b1 = project(x + faceW, 0.28, zN - 0.01);
    const b2 = project(x + faceW, 0.56, zN - 0.01);
    const b3 = project(x - faceW, 0.56, zN - 0.01);
    quad(b0, b1, b2, b3, "#e8ae22", "rgba(27,27,22,0.45)", Math.max(0.4, b0.s * 0.002));
    ctx.save();
    pathPoly([b0, b1, b2, b3]);
    ctx.clip();
    const stripeGap = Math.max(4, b0.s * 0.14);
    for (let sx = Math.min(b0.x, b1.x) - stripeGap; sx < Math.max(b0.x, b1.x) + stripeGap; sx += stripeGap * 1.6) {
      ctx.strokeStyle = "rgba(28,29,26,0.68)";
      ctx.lineWidth = Math.max(1, b0.s * 0.035);
      ctx.beginPath();
      ctx.moveTo(sx, b0.y + (b3.y - b0.y));
      ctx.lineTo(sx + stripeGap, b0.y);
      ctx.stroke();
    }
    ctx.restore();

    // Front/rear windshield.
    const wsL = project(x - faceW * 0.76, 1.4, zN - 0.02);
    const wsR = project(x + faceW * 0.76, 1.4, zN - 0.02);
    const wsT = project(x + faceW * 0.76, 1.93, zN - 0.02);
    const wsTL = project(x - faceW * 0.76, 1.93, zN - 0.02);
    quad(wsL, wsR, wsT, wsTL, U.mixHex("#0b1f2a", theme.window, 0.22 + theme.night * 0.25), "rgba(5,14,18,0.6)", Math.max(0.4, wsL.s * 0.002));
    line(wsL.x + 2, wsL.y - 2, wsT.x - 2, wsT.y + 2, "rgba(220,247,255,0.24)", Math.max(0.5, wsL.s * 0.004));

    // Route number badge (moving express trains show illuminated EXP sign).
    const routeY = 2.01;
    const route = project(x - faceW * 0.34, routeY, zN - 0.02);
    const route2 = project(x + faceW * 0.34, routeY, zN - 0.02);
    const rw = Math.abs(route2.x - route.x);
    ctx.fillStyle = "rgba(7,18,23,0.82)";
    ctx.fillRect(Math.min(route.x, route2.x), route.y - Math.max(3, rw * 0.38), rw, Math.max(5, rw * 0.58));
    if (rw > 22) {
      ctx.fillStyle = e.moving ? "rgba(255,115,90,0.95)" : "rgba(255,220,125,0.78)";
      ctx.font = "900 " + Math.max(6, rw * 0.33) + "px 'Arial Black', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(e.moving ? "EXP" : (e.variant % 2 === 0 ? "M9" : "N"), (route.x + route2.x) * 0.5, route.y + Math.max(1, rw * 0.002));
    }

    // Roof pantograph for moving express trains reaching up to the catenary line.
    if (!isMenu && e.moving && zN < 115 && zN > -4) {
      const pz = zN + Math.min(3.5, len * 0.22);
      const pBase = project(x, h + 0.04, pz);
      const pMid = project(x + 0.16, h + 1.05, pz + 0.45);
      const pTopL = project(x - 0.42, 4.92, pz);
      const pTopR = project(x + 0.42, 4.92, pz);
      const pTopM = project(x, 4.92, pz);
      const lw = Math.max(1, pBase.s * 0.015);
      line(pBase.x, pBase.y, pMid.x, pMid.y, "#2a343b", lw);
      line(pMid.x, pMid.y, pTopM.x, pTopM.y, "#46555e", lw);
      line(pTopL.x, pTopL.y, pTopR.x, pTopR.y, "#d6e6ee", Math.max(1.2, lw * 1.1));
      if (Math.sin(g.time * 28 + e.z) > 0.86) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ell(pTopM.x, pTopM.y, Math.max(4, pTopM.s * 0.18), Math.max(4, pTopM.s * 0.18), "rgba(130,225,255,0.75)");
        ctx.restore();
      }
    }

    // Headlights + realistic volumetric rail beam for oncoming express trains & night runs.
    if (!isMenu) {
      const lightY = 0.72;
      const beamStrength = e.moving ? 0.42 + theme.night * 0.35 + (g.tunnel || 0) * 0.3 : theme.night * 0.32 + (g.tunnel || 0) * 0.35;
      if (beamStrength > 0.15 && zN > 1 && zN < 110) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const bFarZ = Math.max(-2, zN - (e.moving ? 16 : 9));
        const coneL = project(x - faceW * 1.45, 0.04, bFarZ);
        const coneR = project(x + faceW * 1.45, 0.04, bFarZ);
        const srcL = project(x - faceW * 0.62, lightY, zN - 0.06);
        const srcR = project(x + faceW * 0.62, lightY, zN - 0.06);
        const beamGrad = ctx.createLinearGradient(0, srcL.y, 0, coneL.y);
        beamGrad.addColorStop(0, "rgba(255,244,195," + clamp(beamStrength * 0.55, 0, 0.55) + ")");
        beamGrad.addColorStop(1, "rgba(255,244,195,0)");
        fillPoly([srcL, srcR, coneR, coneL], beamGrad);
        ctx.restore();
      }

      for (const side of [-1, 1]) {
        const lp = project(x + side * faceW * 0.56, lightY, zN - 0.06);
        if (lp.s > 8) {
          const isFlashingDitch = e.moving && ((Math.floor(g.time * 6) + (side > 0 ? 1 : 0)) % 2 === 0);
          ctx.globalAlpha = e.moving ? 0.92 : 0.55;
          ell(lp.x, lp.y, Math.max(1.8, lp.s * (e.moving ? 0.06 : 0.045)), Math.max(1.2, lp.s * 0.036), isFlashingDitch ? "#ffffff" : "#fff6c2");
          ctx.globalAlpha = 1;
          if ((e.moving || theme.night > 0.2 || (g.tunnel || 0) > 0.2) && e.z < 90) {
            const r = Math.max(5, lp.s * (e.moving ? 0.36 : 0.26));
            const gl = ctx.createRadialGradient(lp.x, lp.y, 1, lp.x, lp.y, r);
            gl.addColorStop(0, e.moving ? "rgba(255,246,200,0.52)" : "rgba(255,244,190,0.28)");
            gl.addColorStop(1, "rgba(255,244,190,0)");
            ctx.fillStyle = gl;
            ctx.fillRect(lp.x - r, lp.y - r, r * 2, r * 2);
          }
        }
      }
    }

    // Atmospheric distance fog tint for realistic depth perception.
    const distFog = U.smoothstep(74, 174, zN) * (0.45 + (1 - theme.night) * 0.15);
    if (distFog > 0.03) {
      ctx.save();
      ctx.globalAlpha = distFog;
      quad(fnl, fnr, fntr, fntl, theme.haze);
      ctx.restore();
    }

    // A little front grime and coupling hardware when close.
    if (fnl.s > 30) {
      const coupler = project(x, 0.24, zN - 0.05);
      ell(coupler.x, coupler.y, Math.max(2, coupler.s * 0.09), Math.max(1.4, coupler.s * 0.055), "#1b2226");
      ctx.globalAlpha = 0.2;
      for (let i = 0; i < 3; i++) {
        const gp = project(x - faceW + faceW * (0.2 + i * 0.3), 0.82 + i * 0.06, zN - 0.03);
        line(gp.x, gp.y, gp.x + faceW * 0.15, gp.y + 8, "rgba(20,29,31,0.5)", Math.max(0.5, fnl.s * 0.006));
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawRamp(e, theme, g) {
    const x = laneX(e.lane);
    const len = e.len || 7.2;
    const h = e.targetHeight || SS.CONFIG.trainHeight;
    const hw = view.laneW * 0.38;
    const zN = e.z - len * 0.5;
    const zF = e.z + len * 0.5;
    if (zF < -4 || zN > 165) return;

    const nl = project(x - hw, 0.03, zN);
    const nr = project(x + hw, 0.03, zN);
    const fl = project(x - hw, h, zF);
    const fr = project(x + hw, h, zF);
    const fbl = project(x - hw, 0.03, zF);
    const fbr = project(x + hw, 0.03, zF);

    // Side structural wedge.
    const sideX = view.camX <= x ? x - hw : x + hw;
    const sN = project(sideX, 0.03, zN);
    const sFTop = project(sideX, h, zF);
    const sFBot = project(sideX, 0.03, zF);
    fillPoly([sN, sFTop, sFBot], U.mixHex("#363d42", theme.wallDark, 0.35), "rgba(10,16,20,0.55)", 1);

    // Grounded shadow under ramp.
    ctx.save();
    ctx.globalAlpha = 0.28;
    fillPoly([nl, nr, fbr, fbl], theme.shadow);
    ctx.restore();

    // Steel tread slope surface.
    quad(nl, nr, fr, fl, "#5a6369", "rgba(15,22,26,0.65)", Math.max(0.8, nl.s * 0.004));

    // Yellow safety side rails and ascending chevron arrows.
    for (const side of [-1, 1]) {
      const r0 = project(x + side * hw * 0.94, 0.08, zN);
      const r1 = project(x + side * hw * 0.94, h + 0.06, zF);
      line(r0.x, r0.y, r1.x, r1.y, "#f4b928", Math.max(1.5, r0.s * 0.025));
    }

    for (let i = 1; i <= 4; i++) {
      const t = i / 5;
      const cz = lerp(zN, zF, t);
      const cy = lerp(0.06, h + 0.02, t);
      const left = project(x - hw * 0.45, cy - 0.08, cz - 0.35);
      const tip = project(x, cy + 0.08, cz + 0.35);
      const right = project(x + hw * 0.45, cy - 0.08, cz - 0.35);
      ctx.strokeStyle = "rgba(255,214,72,0.85)";
      ctx.lineWidth = Math.max(1.2, tip.s * 0.025);
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();
    }
  }

  function drawBarrier(e, theme, g) {
    const x = laneX(e.lane);
    const z = e.z;
    if (z < -3 || z > 155) return;
    const half = view.laneW * 0.34;
    const h = 0.95;
    const near = z - 0.16;
    const baseL = project(x - half, 0.02, near);
    const baseR = project(x + half, 0.02, near);
    const topL = project(x - half, h, near);
    const topR = project(x + half, h, near);
    const backTop = project(x + half, 0.1, z + 0.34);

    // Legs and shadow.
    ctx.save();
    ctx.globalAlpha = 0.28;
    const sh = project(x, 0.01, near);
    ell(sh.x, sh.y, Math.max(3, sh.s * 0.47), Math.max(1, sh.s * 0.1), theme.shadow);
    ctx.restore();
    for (const side of [-1, 1]) {
      const leg = project(x + side * half * 0.78, 0.02, z);
      const legTop = project(x + side * half * 0.78, h * 0.75, z);
      line(leg.x, leg.y, legTop.x, legTop.y, "#2d3133", Math.max(1.2, leg.s * 0.035));
      const foot = project(x + side * half * 0.78, 0.02, z + 0.26);
      line(leg.x, leg.y, foot.x, foot.y, "#20272a", Math.max(1, leg.s * 0.026));
    }

    const panelTop = h - 0.03;
    const panelBottom = 0.43;
    const a = project(x - half, panelBottom, near - 0.02);
    const b = project(x + half, panelBottom, near - 0.02);
    const c = project(x + half, panelTop, near - 0.02);
    const d = project(x - half, panelTop, near - 0.02);
    quad(a, b, c, d, "#e7d8b4", "rgba(13,20,23,0.55)", Math.max(0.5, a.s * 0.0035));

    // Diagonal hazard stripes inside the board.
    ctx.save();
    pathPoly([a, b, c, d]);
    ctx.clip();
    const stripe = Math.max(5, a.s * 0.2);
    for (let sx = Math.min(a.x, b.x) - stripe * 2; sx < Math.max(a.x, b.x) + stripe; sx += stripe * 1.9) {
      ctx.fillStyle = "rgba(211,62,43,0.9)";
      ctx.beginPath();
      ctx.moveTo(sx, a.y);
      ctx.lineTo(sx + stripe, a.y);
      ctx.lineTo(sx + stripe * 2.1, d.y);
      ctx.lineTo(sx + stripe * 1.1, d.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Outline, bolts and warning lamp.
    fillPoly([a, b, c, d], null, "rgba(18,25,27,0.65)", Math.max(0.8, a.s * 0.005));
    const boltN = 4;
    for (let i = 0; i < boltN; i++) {
      const bp = project(x - half + (half * 2 * (i + 0.5)) / boltN, 0.5, near - 0.04);
      ell(bp.x, bp.y, Math.max(0.6, bp.s * 0.009), Math.max(0.6, bp.s * 0.009), "rgba(35,40,40,0.7)");
    }
    if (a.s > 30) {
      const lamp = project(x - half * 0.84, h + 0.09, near);
      const blink = 0.55 + Math.sin(g.time * 7 + z * 0.4) * 0.35;
      ctx.globalAlpha = blink;
      ell(lamp.x, lamp.y, Math.max(2, lamp.s * 0.065), Math.max(2, lamp.s * 0.065), "#ff8c3b");
      ctx.globalAlpha = 0.18;
      ell(lamp.x, lamp.y, Math.max(4, lamp.s * 0.21), Math.max(4, lamp.s * 0.21), "#ff8c3b");
      ctx.globalAlpha = 1;
    }

    // "STOP" lettering on the board when close.
    const textSize = clamp(a.s * 0.16, 6, 28);
    if (a.s > 38) {
      ctx.save();
      ctx.font = "900 " + textSize + "px 'Arial Black', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(18,24,25,0.82)";
      ctx.fillText("STOP", (a.x + b.x) * 0.5, (a.y + d.y) * 0.5 + textSize * 0.05);
      ctx.restore();
    }
    // Small reflective feet.
    const footL = project(x - half * 0.9, 0.03, z + 0.05);
    const footR = project(x + half * 0.9, 0.03, z + 0.05);
    ell(footL.x, footL.y, Math.max(1, footL.s * 0.035), Math.max(0.6, footL.s * 0.012), "#424b4b");
    ell(footR.x, footR.y, Math.max(1, footR.s * 0.035), Math.max(0.6, footR.s * 0.012), "#424b4b");
  }

  function drawOverhead(e, theme, g) {
    const x = laneX(e.lane);
    const z = e.z;
    if (z < -4 || z > 140) return;
    const half = view.laneW * 0.42;
    const clearance = 1.35;
    const top = 3.05;
    const postW = Math.max(1, project(x, 0, z).s * 0.04);

    // Side uprights.
    for (const side of [-1, 1]) {
      const base = project(x + side * half, 0, z);
      const topP = project(x + side * half, top, z);
      line(base.x, base.y, topP.x, topP.y, "#333a3c", postW);
      line(base.x - postW * 0.2, base.y, topP.x - postW * 0.2, topP.y, "rgba(255,255,255,0.1)", Math.max(0.5, postW * 0.2));
      const foot = project(x + side * half, 0.015, z + 0.4);
      line(base.x, base.y, foot.x, foot.y, "#272d2f", Math.max(1, postW * 0.8));
    }

    // Top beam and hanging board.
    const beamL = project(x - half, top, z);
    const beamR = project(x + half, top, z);
    line(beamL.x, beamL.y, beamR.x, beamR.y, "#333a3c", Math.max(1.3, postW));
    line(beamL.x, beamL.y - 2, beamR.x, beamR.y - 2, "rgba(255,255,255,0.11)", Math.max(0.5, postW * 0.22));

    const boardL = project(x - half * 0.93, clearance, z - 0.02);
    const boardR = project(x + half * 0.93, clearance, z - 0.02);
    const boardT = project(x + half * 0.93, 2.43, z - 0.02);
    const boardTL = project(x - half * 0.93, 2.43, z - 0.02);
    quad(boardL, boardR, boardT, boardTL, "#262b2a", "rgba(8,12,13,0.65)", Math.max(0.6, boardL.s * 0.004));

    // Hazard chevrons.
    ctx.save();
    pathPoly([boardL, boardR, boardT, boardTL]);
    ctx.clip();
    const stripeW = Math.max(4, boardL.s * 0.15);
    for (let sx = Math.min(boardL.x, boardR.x) - stripeW * 2; sx < Math.max(boardL.x, boardR.x) + stripeW; sx += stripeW * 1.9) {
      ctx.fillStyle = "rgba(255,198,45,0.84)";
      ctx.beginPath();
      ctx.moveTo(sx, boardL.y);
      ctx.lineTo(sx + stripeW, boardL.y);
      ctx.lineTo(sx + stripeW * 2.2, boardTL.y);
      ctx.lineTo(sx + stripeW * 1.2, boardTL.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "rgba(20,24,23,0.78)";
    if (boardL.s > 30) {
      const fs = clamp(boardL.s * 0.14, 7, 28);
      ctx.font = "900 " + fs + "px 'Arial Black', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("ROLL", (boardL.x + boardR.x) * 0.5, (boardL.y + boardTL.y) * 0.5);
    }
    ctx.restore();

    // Support cables and blinking lamps.
    for (const side of [-1, 1]) {
      const lamp = project(x + side * half * 0.82, 2.52, z - 0.04);
      if (boardL.s > 22) {
        const blink = 0.6 + Math.sin(g.time * 6 + x) * 0.35;
        ctx.globalAlpha = blink;
        ell(lamp.x, lamp.y, Math.max(1.8, lamp.s * 0.055), Math.max(1.8, lamp.s * 0.055), "#ffab38");
        ctx.globalAlpha = 0.13;
        ell(lamp.x, lamp.y, Math.max(4, lamp.s * 0.2), Math.max(4, lamp.s * 0.2), "#ffab38");
        ctx.globalAlpha = 1;
      }
    }
    const tapeAlpha = 0.35 + Math.sin(g.time * 5 + z) * 0.12;
    ctx.globalAlpha = tapeAlpha;
    for (let i = 0; i < 5; i++) {
      const tx = project(x - half + (half * 2 * (i + 0.5)) / 5, clearance + 0.04, z - 0.02);
      line(tx.x, tx.y, tx.x + Math.sin(g.time * 3 + i) * 2, tx.y + 9, "rgba(255,198,45,0.8)", Math.max(1, tx.s * 0.012));
    }
    ctx.globalAlpha = 1;
  }

  function drawCoin(e, theme, g) {
    if (!e || e.z < -2 || e.z > 170) return;
    const x = e.x == null ? laneX(e.lane) : e.x;
    const z = e.z;
    const p = project(x, e.y, z);
    if (p.s < 2) return;
    const r = clamp(p.s * 0.145, 2, 26) * (e.size || 1);
    const spin = Math.abs(Math.cos(g.time * 4.6 + (e.phase || 0)));
    const w = Math.max(r * 0.16, r * (0.26 + spin * 0.74));
    ctx.save();
    if (e.magnetized) {
      ctx.globalAlpha = 0.75;
      ctx.globalCompositeOperation = "screen";
      ell(p.x, p.y, w * 1.8, r * 1.8, "rgba(255,215,82,0.12)");
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    ctx.translate(p.x, p.y);
    ctx.beginPath();
    ctx.ellipse(0, 0, w, r, 0, 0, TAU);
    ctx.fillStyle = "#c58009";
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-w * 0.06, -r * 0.06, w * 0.82, r * 0.82, 0, 0, TAU);
    ctx.fillStyle = "#ffcc33";
    ctx.fill();
    if (w > 3) {
      ctx.beginPath();
      ctx.ellipse(-w * 0.16, -r * 0.18, w * 0.42, r * 0.38, -0.2, 0, TAU);
      ctx.fillStyle = "rgba(255,248,185,0.75)";
      ctx.fill();
      ctx.strokeStyle = "rgba(133,75,6,0.55)";
      ctx.lineWidth = Math.max(0.5, r * 0.11);
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.66, r * 0.66, 0, 0, TAU);
      ctx.stroke();
      if (w > 7) {
        ctx.fillStyle = "rgba(112,60,2,0.52)";
        ctx.font = "900 " + Math.max(4, r * 0.88) + "px 'Arial Black', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("S", 0, r * 0.02);
      }
    }
    ctx.restore();
    // Soft ground shadow.
    if (e.z < 45) {
      const sh = project(x, 0.012, z);
      ctx.globalAlpha = 0.13;
      ell(sh.x, sh.y, Math.max(1, sh.s * 0.1), Math.max(0.5, sh.s * 0.025), "#2b1f09");
      ctx.globalAlpha = 1;
    }
  }

  function drawPowerup(e, theme, g) {
    if (!e || e.z < -2 || e.z > 150) return;
    const def = SS.POWERUPS[e.power] || SS.POWERUPS.magnet;
    const x = e.x == null ? laneX(e.lane) : e.x;
    const bob = Math.sin(g.time * 2.8 + (e.phase || 0)) * 0.14;
    const y = 1.2 + bob;
    const p = project(x, y, e.z);
    if (p.s < 3) return;
    const r = clamp(p.s * 0.43, 9, 38);
    const glowAlpha = 0.22 + Math.sin(g.time * 3.4 + (e.phase || 0)) * 0.06;

    // Ground light pool and shadow.
    const gp = project(x, 0.01, e.z);
    ctx.globalAlpha = 0.17;
    ell(gp.x, gp.y, r * 1.1, r * 0.24, def.color);
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(p.x, p.y);
    const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 2.2);
    glow.addColorStop(0, U.rgba(def.color, glowAlpha + 0.16));
    glow.addColorStop(0.5, U.rgba(def.color, glowAlpha));
    glow.addColorStop(1, U.rgba(def.color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(-r * 2.2, -r * 2.2, r * 4.4, r * 4.4);
    ctx.rotate(g.time * 0.9);
    ctx.strokeStyle = U.rgba(def.color, 0.48);
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.setLineDash([r * 0.38, r * 0.28]);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.22, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.rotate(-g.time * 0.9);

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * TAU;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = U.rgba(def.color, 0.22);
    ctx.fill();
    ctx.strokeStyle = def.color;
    ctx.lineWidth = Math.max(1.2, r * 0.07);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.7, 0, TAU);
    ctx.fillStyle = "rgba(5,20,29,0.54)";
    ctx.fill();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = def.color;
    if (e.power === "multiplier") {
      ctx.font = "900 " + r * 0.74 + "px 'Arial Black', sans-serif";
      ctx.fillText("×2", 0, r * 0.02);
    } else if (e.power === "magnet") {
      ctx.lineWidth = Math.max(2, r * 0.16);
      ctx.strokeStyle = def.color;
      ctx.beginPath();
      ctx.arc(0, -r * 0.06, r * 0.32, 0, Math.PI, false);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.32, -r * 0.06);
      ctx.lineTo(-r * 0.32, r * 0.34);
      ctx.moveTo(r * 0.32, -r * 0.06);
      ctx.lineTo(r * 0.32, r * 0.34);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillRect(-r * 0.4, r * 0.28, r * 0.16, r * 0.2);
      ctx.fillRect(r * 0.24, r * 0.28, r * 0.16, r * 0.2);
    } else if (e.power === "sneakers") {
      ctx.font = "900 " + r * 1.02 + "px 'Arial Black', sans-serif";
      ctx.fillText("⚡", 0, r * 0.04);
    } else if (e.power === "jetpack") {
      // Twin thruster rocket silhouette
      ctx.fillStyle = def.color;
      roundRectPath(-r * 0.34, -r * 0.32, r * 0.26, r * 0.56, r * 0.1);
      ctx.fill();
      roundRectPath(r * 0.08, -r * 0.32, r * 0.26, r * 0.56, r * 0.1);
      ctx.fill();
      ctx.fillStyle = "#ffe588";
      ctx.beginPath();
      ctx.moveTo(-r * 0.28, r * 0.24);
      ctx.lineTo(-r * 0.21, r * 0.48);
      ctx.lineTo(-r * 0.14, r * 0.24);
      ctx.moveTo(r * 0.14, r * 0.24);
      ctx.lineTo(r * 0.21, r * 0.48);
      ctx.lineTo(r * 0.28, r * 0.24);
      ctx.fill();
    } else {
      ctx.save();
      ctx.rotate(-0.16);
      ctx.fillStyle = def.color;
      roundRectPath(-r * 0.42, -r * 0.1, r * 0.84, r * 0.22, r * 0.1);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.fillRect(-r * 0.26, r * 0.08, r * 0.52, r * 0.08);
      ctx.restore();
    }
    // Sparkles.
    for (let i = 0; i < 3; i++) {
      const a = g.time * 2 + i * 2.1 + (e.phase || 0);
      const sx = Math.cos(a) * r * 1.4;
      const sy = Math.sin(a * 1.4) * r;
      ctx.globalAlpha = 0.4 + Math.sin(a * 3) * 0.25;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(sx, sy, Math.max(1, r * 0.06), Math.max(1, r * 0.06));
    }
    ctx.restore();
  }


  function frame(g) {
    if (!ctx) return;
    const theme = g.theme || SS.themeFor(0);
    lastFramePalette = theme;
    const movementReference = g.mode === "menu" ? g.menuScroll : g.distance;
    const camFollow = g.player ? g.player.x * 0.16 : 0;
    const baseCamY = view.baseCamY || view.camY;
    const targetCamY = baseCamY + (g.player ? g.player.y * 0.56 : 0);
    view.camY = lerp(view.camY, targetCamY, 0.16);
    view.camX = camFollow + (g.cameraOffset || 0);
    view.camRoll = lerp(view.camRoll || 0, g.player ? -(g.player.tilt || 0) * 0.018 : 0, 0.18);
    view.shakeX = g.shakeX || 0;
    view.shakeY = g.shakeY || 0;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.save();
    if (Math.abs(view.camRoll) > 0.0004) {
      ctx.translate(W * 0.5, H * 0.5);
      ctx.rotate(view.camRoll);
      ctx.translate(-W * 0.5, -H * 0.5);
    }

    drawSky(g, theme, g.time);
    drawSkyline(g, theme, g.time);
    drawGround(g, theme);
    drawTracks(g, theme);
    drawTrackside(g, theme, movementReference);
    drawCatenary(theme);
    drawTunnel(g, theme);
    drawWorld(g, theme);
    drawAtmosphere(g, theme);
    drawPlayer(g, theme);
    drawInspector(g, theme);
    drawRain(g, theme);
    drawParticles(g);
    drawForeground(g, theme);

    ctx.restore();
  }

  function drawCatenary(theme) {
    // Authentic electrified overhead contact and messenger wires down each track.
    ctx.save();
    const wireCol = U.rgba(theme.night > 0.45 ? "#95b2c4" : "#18242b", 0.34);
    for (let lane = 0; lane < 3; lane++) {
      const lx = laneX(lane);
      const n0 = project(lx, 4.92, -3);
      const f0 = project(lx, 4.92, 150);
      line(n0.x, n0.y, f0.x, f0.y, wireCol, 1.1);
      const n1 = project(lx, 5.42, -3);
      const f1 = project(lx, 5.42, 150);
      line(n1.x, n1.y, f1.x, f1.y, U.rgba(theme.night > 0.45 ? "#7a98ab" : "#1d2a33", 0.2), 0.75);
    }
    ctx.restore();
  }

  function drawTunnel(g, theme) {
    const tunnel = g.tunnel || 0;
    if (tunnel <= 0.02 || g.mode === "menu") return;
    const wallX = view.laneW * 2.02 + 1.05;
    const ceilY = 6.35;
    const scroll = g.distance || 0;
    const archGap = 16;
    const offset = scroll % archGap;

    ctx.save();
    // Overhead concrete tunnel slab darkening the sky when inside the tunnel.
    const topFar = project(-wallX, ceilY, 130);
    const ceilingH = Math.max(0, topFar.y + H * 0.08);
    ctx.fillStyle = "rgba(8, 14, 20, " + (tunnel * 0.88) + ")";
    ctx.fillRect(0, 0, W, ceilingH);

    // Concrete rib arches & glowing sodium strip lights.
    for (let i = 7; i >= 0; i--) {
      const z = i * archGap - offset + 2;
      if (z < -2 || z > 120) continue;
      const lBase = project(-wallX, 0, z);
      const rBase = project(wallX, 0, z);
      const lTop = project(-wallX, ceilY, z);
      const rTop = project(wallX, ceilY, z);
      const ribW = Math.max(2, lBase.s * 0.14);
      ctx.globalAlpha = tunnel * clamp(1 - z / 120, 0.15, 0.95);
      line(lBase.x, lBase.y, lTop.x, lTop.y, "#141d24", ribW);
      line(rBase.x, rBase.y, rTop.x, rTop.y, "#141d24", ribW);
      line(lTop.x, lTop.y, rTop.x, rTop.y, "#10181f", ribW * 1.15);

      // Warm overhead sodium vapor tube light
      const lightL = project(-view.laneW * 0.7, ceilY - 0.16, z);
      const lightR = project(view.laneW * 0.7, ceilY - 0.16, z);
      line(lightL.x, lightL.y, lightR.x, lightR.y, "#ffdf9c", Math.max(1.5, lBase.s * 0.032));
      const midX = (lightL.x + lightR.x) * 0.5;
      const midY = (lightL.y + lightR.y) * 0.5;
      const glowR = Math.max(10, lBase.s * 0.55);
      const gl = ctx.createRadialGradient(midX, midY, 2, midX, midY, glowR);
      gl.addColorStop(0, "rgba(255,214,132," + (0.28 * tunnel) + ")");
      gl.addColorStop(1, "rgba(255,214,132,0)");
      ctx.fillStyle = gl;
      ctx.fillRect(midX - glowR, midY - glowR, glowR * 2, glowR * 2);
    }

    // Subtle interior mood darkening.
    ctx.globalAlpha = tunnel * 0.24;
    ctx.fillStyle = "#040b12";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawRain(g, theme) {
    const rain = g.rain || 0;
    if (rain <= 0.02 || !scene.raindrops) return;
    const tunnelDamp = 1 - (g.tunnel || 0) * 0.85;
    const effective = rain * tunnelDamp;
    if (effective <= 0.02) return;
    ctx.save();
    ctx.strokeStyle = theme.night > 0.4 ? "rgba(180,220,255,0.34)" : "rgba(230,244,255,0.32)";
    ctx.lineWidth = 1.1;
    const wind = -3.8 - (g.speed || 0) * 0.08;
    for (const d of scene.raindrops) {
      const y = ((d.y + g.time * d.speed) % 1) * H;
      const x = ((d.x + g.time * 0.06) % 1) * W;
      ctx.globalAlpha = d.alpha * effective;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + wind, y + d.len);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------
  // Trackside architecture, gantries, wires and small props
  // ------------------------------------------------------------
  function drawTrackside(g, theme, movementReference) {
    const scroll = movementReference || 0;
    drawWalls(g, theme, scroll);
    drawUtilityPoles(theme, scroll);
    drawGantries(theme, scroll, g);
    drawSignals(theme, scroll, g);
    drawTracksideProps(theme, scroll);
  }

  function drawWalls(g, theme, scroll) {
    const wallX = view.laneW * 2.02 + 1.05;
    const wallH = 2.35;
    const panelLen = 9;
    const offset = scroll % panelLen;
    const panelGap = 0.52;

    for (let i = 13; i >= -1; i--) {
      const z0 = i * panelLen - offset;
      const z1 = z0 + panelLen - panelGap;
      if (z1 < -5 || z0 > 158) continue;
      const localZ = Math.max(-4, z0);
      const farZ = Math.min(158, z1);

      for (const side of [-1, 1]) {
        const x = side * wallX;
        const a = project(x, 0, localZ);
        const b = project(x, 0, farZ);
        const c = project(x, wallH, farZ);
        const d = project(x, wallH, localZ);
        if (c.y < -H || d.y > H * 1.2) continue;

        const depthT = clamp((z0 + z1) * 0.5 / 150, 0, 1);
        const baseTone = U.mixHex(theme.wall, theme.wallDark, 0.12 + (i % 3) * 0.08 + depthT * 0.35);
        quad(a, b, c, d, baseTone);

        // Top lip and shadowed footing.
        const lipTop = project(x, wallH + 0.12, farZ);
        const lipTopNear = project(x, wallH + 0.12, localZ);
        fillPoly([d, c, lipTop, lipTopNear], U.mixHex(theme.wall, theme.wallDark, 0.42));
        const footFar = project(x, 0.34, farZ);
        const footNear = project(x, 0.34, localZ);
        fillPoly([a, b, footFar, footNear], U.rgba(theme.shadow, 0.25));

        // Concrete seams, vents and drain stains.
        const midZ = (localZ + farZ) * 0.5;
        const seam = project(x, wallH * 0.87, midZ);
        const seamBase = project(x, wallH * 0.76, midZ);
        line(seam.x, seam.y, seamBase.x, seamBase.y, U.rgba(theme.wallDark, 0.25), Math.max(0.5, seam.s * 0.006));
        if (i % 4 === 0 && localZ > -2) {
          const stain = project(x, wallH, localZ + 1.2);
          const stain2 = project(x, wallH * 0.35, localZ + 1.2);
          ctx.globalAlpha = 0.13;
          line(stain.x, stain.y, stain2.x, stain2.y + stain2.s * 0.02, U.shade(theme.wallDark, -0.35), Math.max(1, stain.s * 0.07));
          ctx.globalAlpha = 1;
        }

        // A low painted safety stripe.
        const stripeA = project(x, 0.64, localZ);
        const stripeB = project(x, 0.64, farZ);
        const stripeC = project(x, 0.72, farZ);
        const stripeD = project(x, 0.72, localZ);
        quad(stripeA, stripeB, stripeC, stripeD, U.rgba("#ffc62d", 0.2 + theme.night * 0.08));

        // Close panels get graffiti and torn posters.
        if (localZ < 44) {
          drawGraffiti(x, localZ, farZ, wallH, i, side, theme, g);
        }

        // Chain-link fence on top, only detailed when nearby.
        if (localZ < 72) {
          drawFenceTop(x, localZ, farZ, wallH, theme, i);
        }
      }
    }
  }

  function drawGraffiti(x, z0, z1, wallH, index, side, theme, g) {
    const a = project(x, 0.48, z0);
    const b = project(x, 0.48, z1);
    const c = project(x, wallH - 0.1, z1);
    const d = project(x, wallH - 0.1, z0);
    if (a.y < view.horizon || b.y < view.horizon) return;
    const width = Math.abs(b.x - a.x);
    const height = Math.abs(a.y - d.y);
    if (width < 18 || height < 20) return;
    const rng = U.mulberry32(((index + 3) * 9967 + (side > 0 ? 537 : 911)) >>> 0);
    const palette = ["#2fe6c2", "#ffc62d", "#ff4f8b", "#58dcff", "#ff7a2f"];
    const colorA = palette[(rng() * palette.length) | 0];
    const colorB = palette[(rng() * palette.length) | 0];

    ctx.save();
    pathPoly([a, b, c, d]);
    ctx.clip();
    const cx = (a.x + b.x) * 0.5;
    const cy = (a.y + d.y) * 0.5;
    const scale = clamp(height * 0.52, 13, 66);
    const angle = (rng() - 0.5) * 0.22;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.5 + theme.night * 0.2;

    // Wildstyle underlay.
    ctx.strokeStyle = colorB;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(2, scale * 0.11);
    ctx.beginPath();
    ctx.moveTo(-scale * 1.2, scale * 0.28);
    ctx.bezierCurveTo(-scale * 0.5, -scale * 0.6, scale * 0.15, scale * 0.8, scale * 1.3, -scale * 0.12);
    ctx.stroke();
    ctx.strokeStyle = colorA;
    ctx.lineWidth = Math.max(1, scale * 0.055);
    ctx.beginPath();
    ctx.moveTo(-scale * 1.4, -scale * 0.15);
    ctx.bezierCurveTo(-scale * 0.2, scale * 0.45, scale * 0.65, -scale * 0.6, scale * 1.25, scale * 0.24);
    ctx.stroke();

    // Tag lettering.
    const words = ["RUSH", "LINE 9", "NO RULES", "SK8", "SS", "DOWNTOWN"];
    const word = words[(rng() * words.length) | 0];
    ctx.font = "900 " + scale + "px 'Arial Black', Impact, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(6,18,24,0.75)";
    ctx.lineWidth = scale * 0.15;
    ctx.strokeText(word, 0, 0);
    ctx.fillStyle = colorA;
    ctx.fillText(word, 0, 0);
    ctx.fillStyle = U.rgba("#ffffff", 0.16);
    ctx.font = "900 " + scale * 0.35 + "px 'Arial Black', Impact, sans-serif";
    ctx.fillText("✦ " + (index % 3 === 0 ? "CREW" : "2026"), 0, scale * 0.58);

    if (rng() > 0.34) {
      const px = (rng() * 2 - 1) * scale;
      const py = (rng() * 1.2 - 0.6) * scale - scale * 0.35;
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = "#ffe8b5";
      ctx.fillRect(px - scale * 0.28, py, scale * 0.56, scale * 0.9);
      ctx.fillStyle = "rgba(40,50,58,0.55)";
      for (let l = 0; l < 5; l++) {
        ctx.fillRect(px - scale * 0.19, py + scale * (0.18 + l * 0.1), scale * (0.26 + rng() * 0.12), Math.max(1, scale * 0.03));
      }
    }
    ctx.restore();
  }

  function drawFenceTop(x, z0, z1, wallH, theme, index) {
    const top = project(x, wallH + 0.95, z0);
    const bottom = project(x, wallH + 0.08, z0);
    if (top.y < view.horizon - H * 0.1) return;
    const postW = Math.max(0.6, top.s * 0.012);
    const poles = 2;
    for (let p = 0; p <= poles; p++) {
      const z = lerp(z0, z1, p / poles);
      const pt = project(x, wallH + 0.98, z);
      const pb = project(x, wallH, z);
      line(pt.x, pt.y, pb.x, pb.y, U.rgba(theme.wallDark, 0.7), postW);
    }
    const steps = 5;
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = U.mixHex(theme.wallDark, "#d9e3e6", 0.5);
    ctx.lineWidth = Math.max(0.5, (top.s || 10) * 0.0035);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const p1 = project(x, wallH + 0.08 + 0.86 * t, z0);
      const p2 = project(x, wallH + 0.08 + 0.86 * t, z1);
      line(p1.x, p1.y, p2.x, p2.y, ctx.strokeStyle, ctx.lineWidth);
    }
    for (let s = 0; s <= 8; s++) {
      const t = s / 8;
      const z = lerp(z0, z1, t);
      const pt = project(x, wallH + 0.95, z);
      const pb = project(x, wallH + 0.08, z);
      line(pt.x, pt.y, pb.x, pb.y, ctx.strokeStyle, ctx.lineWidth * 0.8);
    }
    ctx.restore();
  }

  function drawUtilityPoles(theme, scroll) {
    const wallX = view.laneW * 2.02 + 1.05;
    const poleGap = 24;
    const offset = scroll % poleGap;
    const maxI = Math.ceil(150 / poleGap);
    const groups = [
      { side: -1, phase: 0, x: -wallX - 0.55 },
      { side: 1, phase: poleGap * 0.5, x: wallX + 0.55 }
    ];

    for (const group of groups) {
      let prev = null;
      for (let i = maxI; i >= 0; i--) {
        const z = i * poleGap - offset + group.phase;
        if (z > 155 || z < -2) {
          prev = null;
          continue;
        }
        const x = group.x;
        const base = project(x, 0, z);
        const top = project(x, 6.05, z);
        if (base.y > H * 1.25) {
          prev = null;
          continue;
        }
        if (prev) {
          for (let w = 0; w < 3; w++) {
            const yOff = w * 0.32;
            const a0 = project(x, 5.55 + yOff, z);
            const a1 = project(x, 5.55 + yOff, prev.z);
            ctx.beginPath();
            ctx.moveTo(a0.x, a0.y);
            const midX = (a0.x + a1.x) * 0.5;
            const midY = Math.max(a0.y, a1.y) + Math.abs(a0.y - a1.y) * 0.18 + 4;
            ctx.quadraticCurveTo(midX, midY, a1.x, a1.y);
            ctx.strokeStyle = U.rgba("#111b21", 0.27);
            ctx.lineWidth = Math.max(0.5, (a0.s + a1.s) * 0.004);
            ctx.stroke();
          }
        }
        const width = Math.max(1.2, base.s * 0.03);
        line(base.x, base.y, top.x, top.y, U.mixHex(theme.wallDark, "#1a252b", 0.42), width);
        line(base.x + width * 0.3, base.y, top.x + width * 0.2, top.y, U.rgba("#ffffff", 0.08), Math.max(0.5, width * 0.3));
        const arm = project(x, 5.75, z);
        const armHalf = clamp(view.laneW * 0.22, 0.32, 0.75);
        const left = project(x - armHalf, 5.75, z);
        const right = project(x + armHalf, 5.75, z);
        line(left.x, left.y, right.x, right.y, U.mixHex(theme.wallDark, "#1a252b", 0.35), Math.max(1, width * 0.8));
        for (const px of [left, right]) {
          line(px.x, px.y, px.x, px.y + Math.max(1, width * 0.9), U.rgba("#d3eef4", 0.25), Math.max(0.5, width * 0.35));
        }
        if (z < 55) {
          const lamp = project(x, 5.2, z);
          ctx.globalAlpha = 0.14 + theme.night * 0.25;
          ell(lamp.x, lamp.y, Math.max(2, lamp.s * 0.055), Math.max(1, lamp.s * 0.02), theme.window);
          ctx.globalAlpha = 1;
        }
        prev = { z, x };
      }
    }
  }

  function drawGantries(theme, scroll, g) {
    const gap = 48;
    const offset = scroll % gap;
    const maxI = Math.ceil(150 / gap);
    const gantryX = view.laneW * 1.92;
    const topY = 5.9;

    for (let i = maxI; i >= 0; i--) {
      const z = i * gap - offset + 22;
      if (z > 148 || z < -4) continue;
      const leftBase = project(-gantryX, 0, z);
      const rightBase = project(gantryX, 0, z);
      const leftTop = project(-gantryX, topY, z);
      const rightTop = project(gantryX, topY, z);
      if (leftBase.y > H * 1.3) continue;
      const thick = Math.max(1.4, leftBase.s * 0.055);
      line(leftBase.x, leftBase.y, leftTop.x, leftTop.y, U.mixHex(theme.wallDark, "#0d1e27", 0.55), thick);
      line(rightBase.x, rightBase.y, rightTop.x, rightTop.y, U.mixHex(theme.wallDark, "#0d1e27", 0.55), thick);
      line(leftTop.x, leftTop.y, rightTop.x, rightTop.y, U.mixHex(theme.wallDark, "#18323c", 0.45), thick * 0.9);
      line(leftTop.x, leftTop.y, rightTop.x, rightTop.y, U.rgba("#ffffff", 0.09), Math.max(0.7, thick * 0.22));

      // Cross braces.
      if (leftBase.s > 18) {
        const brace = project(0, topY + 0.42, z);
        line(leftTop.x, leftTop.y, brace.x, brace.y, U.rgba(theme.wallDark, 0.36), Math.max(0.8, thick * 0.3));
        line(rightTop.x, rightTop.y, brace.x, brace.y, U.rgba(theme.wallDark, 0.36), Math.max(0.8, thick * 0.3));
      }

      // Hanging station sign in the middle.
      const signW = Math.min(view.laneW * 2.35, 2.8);
      const signTop = topY - 0.7;
      const signBottom = topY - 2.5;
      const s1 = project(-signW * 0.5, signTop, z + 0.18);
      const s2 = project(signW * 0.5, signTop, z + 0.18);
      const s3 = project(signW * 0.5, signBottom, z + 0.18);
      const s4 = project(-signW * 0.5, signBottom, z + 0.18);
      const signHeight = Math.abs(s4.y - s1.y);
      if (s1.x > -200 && s2.x < W + 200) {
        fillPoly([s1, s2, s3, s4], U.mixHex("#0e2b37", "#06151e", 0.35), U.rgba("#9bdfea", 0.24), 1);
        const innerA = project(-signW * 0.44, signTop - 0.16, z + 0.1);
        const innerB = project(signW * 0.44, signTop - 0.16, z + 0.1);
        const innerC = project(signW * 0.44, signBottom + 0.16, z + 0.1);
        const innerD = project(-signW * 0.44, signBottom + 0.16, z + 0.1);
        fillPoly([innerA, innerB, innerC, innerD], U.rgba("#07171f", 0.45));
        if (signHeight > 18) {
          const cx = (s1.x + s2.x) * 0.5;
          const cy = (s1.y + s3.y) * 0.5;
          const fs = clamp(signHeight * 0.25, 7, 20);
          const sideName = i % 3 === 0 ? "SOUTHBOUND" : i % 3 === 1 ? "DOWNTOWN" : "LINE 9";
          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = "900 " + fs + "px 'Arial Narrow', 'Arial Black', sans-serif";
          ctx.fillStyle = "rgba(215,247,252," + (0.48 + theme.night * 0.24) + ")";
          ctx.fillText(sideName, cx, cy - fs * 0.22);
          ctx.font = "700 " + (fs * 0.55) + "px 'Trebuchet MS', sans-serif";
          ctx.fillStyle = "rgba(86,219,255,0.45)";
          ctx.fillText("PLATFORM  2  →", cx, cy + fs * 0.7);
          ctx.restore();
        }
      }

      // Small industrial tangle above the beam.
      if (leftBase.s > 7) {
        const hx = project(0, topY + 0.14, z);
        const hw = Math.max(1, leftBase.s * 0.014);
        for (let k = -2; k <= 2; k++) {
          const x0 = hx.x + k * hw * 2;
          line(x0, hx.y, x0 + hw * 1.4, hx.y - hw * 7, U.rgba("#1a2b30", 0.35), Math.max(0.6, hw * 0.5));
        }
      }
    }
  }

  function drawSignals(theme, scroll, g) {
    if (!scene.signals) return;
    const span = 9 * 21;
    for (const sig of scene.signals) {
      let z = sig.z - (scroll % span);
      if (z < -2) z += span;
      if (z > 72) continue;
      const x = sig.side * (view.laneW * 1.85 + 0.45);
      const base = project(x, 0, z);
      const top = project(x, 2.25, z);
      if (base.y > H * 1.2) continue;
      const w = Math.max(1.3, base.s * 0.033);
      line(base.x, base.y, top.x, top.y, U.mixHex("#2b3232", "#0b1214", 0.25), w);
      const box = project(x, 1.88, z);
      const bw = Math.max(2.5, w * 2.8);
      const bh = Math.max(4, w * 4.8);
      ctx.fillStyle = "#10171a";
      roundRectPath(box.x - bw * 0.5, box.y - bh * 0.5, bw, bh, Math.max(1, bw * 0.18));
      ctx.fill();
      const isGo = Math.sin(g.time * 1.8 + sig.z) > -0.25;
      const lightColor = isGo ? "#49ffad" : "#ff4459";
      ctx.globalAlpha = 0.75 + Math.sin(g.time * 5 + sig.z) * 0.17;
      ell(box.x, box.y - bh * 0.18, bw * 0.22, bw * 0.22, lightColor);
      ctx.globalAlpha = 0.14;
      ell(box.x, box.y - bh * 0.18, bw * 0.95, bw * 0.9, lightColor);
      ctx.globalAlpha = 1;
      if (z < 40) {
        const tag = project(x + sig.side * 0.05, 1.5, z);
        ctx.font = "900 " + Math.max(5, bw * 0.9) + "px 'Trebuchet MS'";
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.textAlign = "center";
        ctx.fillText("9", tag.x, tag.y);
      }
    }
  }

  function drawTracksideProps(theme, scroll) {
    // Deterministic clutter along the service shoulders: cones, drums, crates.
    const gap = 18;
    const offset = scroll % gap;
    for (let i = 10; i >= 0; i--) {
      const z = i * gap - offset + 5;
      if (z < -1 || z > 100) continue;
      const rng = U.mulberry32((i * 4523 + Math.floor(scroll / gap) * 177) >>> 0);
      const side = rng() > 0.5 ? 1 : -1;
      const x = side * (view.laneW * 1.72 + 0.55 + rng() * 0.55);
      const base = project(x, 0, z);
      if (base.y > H * 1.25) continue;
      const type = (rng() * 3) | 0;
      if (type === 0) {
        const h = Math.max(3, base.s * 0.24);
        const w = h * 0.46;
        ctx.fillStyle = "#e26b2f";
        ctx.beginPath();
        ctx.moveTo(base.x - w * 0.4, base.y - h);
        ctx.lineTo(base.x + w * 0.4, base.y - h);
        ctx.lineTo(base.x + w, base.y);
        ctx.lineTo(base.x - w, base.y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,245,215,0.75)";
        ctx.fillRect(base.x - w * 0.5, base.y - h * 0.58, w, h * 0.14);
      } else if (type === 1) {
        const w = Math.max(3, base.s * 0.18);
        const h = w * 1.15;
        ctx.fillStyle = U.mixHex(theme.wallDark, "#275364", 0.34);
        roundRectPath(base.x - w * 0.5, base.y - h, w, h, w * 0.16);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = Math.max(0.5, w * 0.08);
        ctx.stroke();
      } else {
        const w = Math.max(3, base.s * 0.16);
        ctx.fillStyle = U.mixHex(theme.sleeper, theme.wallDark, 0.5);
        ctx.fillRect(base.x - w * 0.6, base.y - w, w * 1.2, w);
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = Math.max(0.4, w * 0.06);
        ctx.strokeRect(base.x - w * 0.6, base.y - w, w * 1.2, w);
      }
    }
  }

  // ------------------------------------------------------------
  // Haze, sunbeams and finishing grade
  // ------------------------------------------------------------
  function drawAtmosphere(g, theme) {
    const horizon = view.horizon;
    // Smooth feathered horizon haze (0 -> peak at horizon -> 0) with no hard band edge.
    const fogTop = horizon - H * 0.14;
    const fogBot = horizon + H * 0.28;
    const fog = ctx.createLinearGradient(0, fogTop, 0, fogBot);
    fog.addColorStop(0, U.rgba(theme.haze, 0));
    fog.addColorStop(0.32, U.rgba(theme.haze, 0.36));
    fog.addColorStop(0.52, U.rgba(theme.haze, 0.22));
    fog.addColorStop(0.78, U.rgba(theme.haze, 0.05));
    fog.addColorStop(1, U.rgba(theme.haze, 0));
    ctx.fillStyle = fog;
    ctx.fillRect(0, fogTop, W, fogBot - fogTop);

    if (theme.night < 0.55) {
      const sunX = W * theme.sunX - view.camX * 6;
      const sunY = horizon - H * 0.18;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const glowR = Math.max(W, H) * 0.42;
      const halo = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, glowR);
      halo.addColorStop(0, U.rgba(theme.sunGlow, 0.16));
      halo.addColorStop(0.35, U.rgba(theme.sunGlow, 0.06));
      halo.addColorStop(1, U.rgba(theme.sunGlow, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, horizon + H * 0.3);
      ctx.restore();
    }

    // Subtle atmospheric color wash across the tracks.
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    const wash = ctx.createLinearGradient(0, horizon, 0, H);
    wash.addColorStop(0, U.rgba(theme.tint, 0.05));
    wash.addColorStop(1, U.rgba(theme.tint, 0));
    ctx.fillStyle = wash;
    ctx.fillRect(0, horizon, W, H - horizon);
    ctx.restore();
  }

  function drawForeground(g) {
    if (g.mode === "menu") {
      const shade = ctx.createLinearGradient(0, 0, W, 0);
      shade.addColorStop(0, "rgba(2,10,16,0.42)");
      shade.addColorStop(0.55, "rgba(2,10,16,0.02)");
      shade.addColorStop(1, "rgba(2,10,16,0.22)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, W, H);
    }
    if (g.speedLines > 0.02) {
      ctx.save();
      ctx.globalAlpha = clamp(g.speedLines, 0, 1) * 0.22;
      ctx.strokeStyle = "#eef8ff";
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 14; i++) {
        const t = (g.time * (1.4 + (i % 3) * 0.3) + i * 0.37) % 1;
        const side = i % 2 === 0 ? -1 : 1;
        const x = W * 0.5 + side * (W * 0.31 + Math.sin(i * 12.1) * W * 0.12);
        const y = H * (0.22 + t * 0.72);
        line(x, y, x + side * (7 + t * 25), y + 26 + t * 46, "rgba(238,248,255,0.7)", 1);
      }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------
  // Player character
  // ------------------------------------------------------------
  function capsule(x1, y1, x2, y2, width, fill, outline, outlineW) {
    ctx.lineCap = "round";
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = width + (outlineW || 0.035) * 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.strokeStyle = fill;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawPlayer(g, theme) {
    const p = g.player;
    if (!p) return;
    const skin = SS.SKINS[g.skin] || SS.SKINS.dash;
    const isMenu = g.mode === "menu";
    const isBoard = isMenu || p.boardTime > 0;
    const foot = project(p.x, p.y, 0);
    const s = foot.s;
    if (s <= 0) return;

    const supportY = p.shadowY == null ? 0 : p.shadowY;
    const shadow = project(p.x, supportY + 0.012, 0);
    const speedFactor = clamp((g.speed - SS.CONFIG.baseSpeed) / 22, 0, 1);

    // Ground silhouette.
    ctx.save();
    ctx.globalAlpha = isBoard ? 0.2 : supportY > 0 ? 0.36 : 0.27;
    const shadowRx = s * (0.31 + speedFactor * 0.04);
    ctx.translate(shadow.x, shadow.y);
    ctx.rotate(p.tilt * 0.4 || 0);
    ell(0, 0, shadowRx, Math.max(1.6, s * 0.062), theme.shadow);
    ctx.restore();

    const menuBob = isMenu ? Math.sin(g.time * 1.65) * 0.035 : 0;
    const boardBob = isBoard ? Math.sin(g.time * 3.1) * 0.018 : 0;
    const runBob = !p.onGround || p.rolling || isBoard ? 0 : Math.abs(Math.sin(p.runPhase)) * 0.038;
    const alpha = p.invuln > 0 && Math.floor(g.time * 18) % 2 === 0 ? 0.42 : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(foot.x, foot.y - (menuBob + boardBob) * s);
    ctx.rotate((p.tilt || 0) * 0.16 + (p.crashSpin || 0));
    ctx.scale(s, s);

    if (isBoard) drawHoverboard(p, skin, g, theme);

    // The runner is drawn in metres, facing away from the camera.
    const phase = isMenu ? g.time * 2.25 : p.runPhase;
    const jetpacking = !isMenu && p.effects && p.effects.jetpack > 0;
    const jumping = !p.onGround && !isBoard && !p.rolling && !jetpacking;
    const pose = jetpacking ? "jetpack" : p.rolling ? "roll" : isBoard ? "board" : jumping ? "jump" : "run";
    const lean = pose === "run" ? 0.055 : pose === "jump" ? 0.03 : 0.02;

    ctx.translate(0, -runBob - (isBoard ? 0.1 : 0));
    if (pose === "roll") {
      ctx.translate(0, -0.26);
      ctx.rotate(-0.25);
      ctx.scale(1.03, 0.66);
    }

    if (pose === "jetpack") {
      drawJetpackPose(skin, phase, g);
    } else if (pose === "board") {
      drawBoardPose(skin, phase, g);
    } else if (pose === "jump") {
      drawJumpPose(skin, phase, g);
    } else if (pose === "roll") {
      drawRollPose(skin, phase, g);
    } else {
      drawRunPose(skin, phase, g, lean);
    }

    // Power-up flourishes.
    if (!isMenu) {
      if (p.effects && p.effects.sneakers > 0) {
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.32 + Math.sin(g.time * 9) * 0.14;
        ell(-0.13, -0.04, 0.2, 0.07, "#ff8833");
        ell(0.13, -0.04, 0.2, 0.07, "#ff8833");
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      if (p.effects && p.effects.magnet > 0) {
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = "#58dcff";
        ctx.lineWidth = 0.018;
        ctx.beginPath();
        ctx.arc(0, -0.9, 0.9 + Math.sin(g.time * 3) * 0.03, 0.2, Math.PI * 1.4);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  function drawHoverboard(p, skin, g, theme) {
    const isMenu = g.mode === "menu";
    const bob = isMenu ? Math.sin(g.time * 1.65 + 0.7) * 0.025 : 0;
    const glow = 0.28 + Math.sin(g.time * 3.4) * 0.07;
    ctx.save();
    ctx.translate(0, 0.07 + bob);
    ctx.rotate(-0.055);

    // Thruster pools.
    ctx.globalCompositeOperation = "screen";
    for (const sx of [-0.35, 0.35]) {
      const grd = ctx.createRadialGradient(sx, 0.1, 0.01, sx, 0.1, 0.36);
      grd.addColorStop(0, U.rgba(skin.board, glow + 0.12));
      grd.addColorStop(1, U.rgba(skin.board, 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(sx, 0.12, 0.37, 0.2, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    // Deck underside.
    ctx.save();
    ctx.rotate(0);
    ctx.strokeStyle = "rgba(5,14,18,0.8)";
    ctx.lineWidth = 0.11;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-0.48, 0);
    ctx.quadraticCurveTo(-0.38, 0.1, 0, 0.1);
    ctx.quadraticCurveTo(0.38, 0.1, 0.48, 0);
    ctx.stroke();
    ctx.strokeStyle = skin.board;
    ctx.lineWidth = 0.085;
    ctx.beginPath();
    ctx.moveTo(-0.47, -0.015);
    ctx.quadraticCurveTo(-0.34, 0.065, 0, 0.065);
    ctx.quadraticCurveTo(0.34, 0.065, 0.47, -0.015);
    ctx.stroke();
    ctx.strokeStyle = U.rgba("#ffffff", 0.54);
    ctx.lineWidth = 0.018;
    ctx.beginPath();
    ctx.moveTo(-0.31, -0.045);
    ctx.quadraticCurveTo(-0.16, 0.012, 0.13, -0.012);
    ctx.stroke();
    ctx.fillStyle = skin.boardAccent;
    ctx.beginPath();
    ctx.ellipse(0.17, 0.025, 0.08, 0.018, -0.08, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Little hover particles.
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 3; i++) {
      const t = (g.time * 1.9 + i * 0.33) % 1;
      ctx.globalAlpha = (1 - t) * 0.32;
      ell((i - 1) * 0.22 + Math.sin(g.time * 5 + i) * 0.04, 0.15 + t * 0.18, 0.035, 0.09, skin.board);
    }
    ctx.restore();
  }

  function playerOutline() {
    return "rgba(7,17,23,0.9)";
  }

  function drawLeg(skin, hipX, hipY, footX, footY, kneeX, kneeY, outline, alphaShoe) {
    capsule(hipX, hipY, kneeX, kneeY, 0.13, skin.pants, outline, 0.028);
    capsule(kneeX, kneeY, footX, footY, 0.105, skin.pantsDark, outline, 0.025);
    // Cuff.
    capsule(footX, footY, footX + 0.005, footY - 0.025, 0.115, U.mixHex(skin.pantsDark, "#000000", 0.16), null);
    // Sneaker.
    ctx.save();
    ctx.translate(footX, footY + 0.04);
    ctx.rotate(footX > 0 ? 0.12 : -0.12);
    ctx.fillStyle = skin.shoe;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.025;
    roundRectPath(-0.1, -0.045, 0.2, 0.11, 0.055);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = skin.sole;
    roundRectPath(-0.105, 0.04, 0.21, 0.035, 0.02);
    ctx.fill();
    ctx.fillStyle = skin.accent;
    ctx.fillRect(-0.06, -0.005, 0.1, 0.018);
    ctx.restore();
  }

  function drawShoe(skin, x, y, angle, glow, outline, scale) {
    const sc = scale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle || 0);
    ctx.scale(sc, sc);
    ctx.fillStyle = skin.shoe;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.025;
    roundRectPath(-0.11, -0.05, 0.22, 0.115, 0.058);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = skin.sole;
    roundRectPath(-0.115, 0.045, 0.23, 0.036, 0.018);
    ctx.fill();
    ctx.fillStyle = skin.accent;
    ctx.fillRect(-0.07, -0.002, 0.1, 0.018);
    if (glow) {
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.4;
      ell(0, 0.02, 0.18, 0.08, "#ff8833");
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
  }

  function drawTorsoAndHead(skin, phase, lean, armPose, outline, g) {
    const sway = Math.sin(phase) * 0.018;
    ctx.save();
    ctx.rotate((lean || 0));

    // Hoodie body.
    ctx.beginPath();
    ctx.moveTo(-0.23, -1.23);
    ctx.quadraticCurveTo(-0.31, -1.0, -0.2, -0.62);
    ctx.quadraticCurveTo(0, -0.57, 0.2, -0.62);
    ctx.quadraticCurveTo(0.31, -1.0, 0.23, -1.23);
    ctx.quadraticCurveTo(0, -1.31, -0.23, -1.23);
    ctx.closePath();
    ctx.fillStyle = skin.hoodie;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.032;
    ctx.stroke();

    // Side shading.
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = skin.hoodieDark;
    ctx.beginPath();
    ctx.moveTo(0.09, -1.25);
    ctx.quadraticCurveTo(0.3, -1.0, 0.19, -0.63);
    ctx.quadraticCurveTo(0.26, -0.67, 0.22, -0.91);
    ctx.quadraticCurveTo(0.27, -1.1, 0.17, -1.24);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Bottom ribbing and drawstrings.
    ctx.strokeStyle = skin.hoodieDark;
    ctx.lineWidth = 0.085;
    ctx.beginPath();
    ctx.moveTo(-0.18, -0.63);
    ctx.quadraticCurveTo(0, -0.58, 0.18, -0.63);
    ctx.stroke();
    ctx.strokeStyle = skin.hoodieLight;
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.moveTo(-0.1, -1.19);
    ctx.lineTo(-0.12, -0.98);
    ctx.moveTo(0.09, -1.19);
    ctx.lineTo(0.12, -0.99);
    ctx.stroke();

    // Arms.
    const a = armPose || { left: [0.01, 0.08], right: [-0.01, 0.08] };
    for (const side of [-1, 1]) {
      const sx = side * 0.23;
      const sy = -1.18;
      const swing = side < 0 ? a.left : a.right;
      const elbowX = sx + side * (0.08 + Math.abs(swing[0]) * 0.18) + swing[0] * 0.08;
      const elbowY = sy + 0.24 + Math.abs(swing[0]) * 0.02;
      const handX = elbowX + side * 0.03 + swing[1] * 0.12;
      const handY = elbowY + 0.24 + swing[1] * 0.12;
      capsule(sx, sy, elbowX, elbowY, 0.135, skin.hoodie, outline, 0.026);
      capsule(elbowX, elbowY, handX, handY, 0.105, skin.hoodieDark, null);
      ctx.beginPath();
      ctx.arc(handX, handY, 0.058, 0, TAU);
      ctx.fillStyle = skin.skin;
      ctx.strokeStyle = outline;
      ctx.lineWidth = 0.02;
      ctx.fill();
      ctx.stroke();
    }

    // Backpack.
    ctx.save();
    ctx.translate(0, -1.02);
    ctx.rotate(sway * 0.4);
    ctx.fillStyle = skin.pack;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.032;
    roundRectPath(-0.17, -0.24, 0.34, 0.46, 0.11);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = skin.packDark;
    roundRectPath(-0.13, -0.16, 0.26, 0.14, 0.055);
    ctx.fill();
    ctx.strokeStyle = U.rgba("#ffffff", 0.18);
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.moveTo(-0.11, -0.01);
    ctx.lineTo(0.11, -0.01);
    ctx.moveTo(0, 0.06);
    ctx.lineTo(0, 0.19);
    ctx.stroke();
    // Zipper pull.
    ctx.fillStyle = skin.accent;
    ctx.beginPath();
    ctx.arc(0.038, 0.09, 0.026, 0, TAU);
    ctx.fill();
    // Straps.
    ctx.strokeStyle = skin.packDark;
    ctx.lineWidth = 0.045;
    ctx.beginPath();
    ctx.moveTo(-0.13, -0.2);
    ctx.quadraticCurveTo(-0.24, -0.08, -0.2, 0.17);
    ctx.moveTo(0.13, -0.2);
    ctx.quadraticCurveTo(0.24, -0.08, 0.2, 0.17);
    ctx.stroke();
    // Emblem.
    ctx.fillStyle = skin.accent;
    ctx.save();
    ctx.translate(0, 0.12);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-0.045, -0.045, 0.09, 0.09);
    ctx.restore();
    ctx.restore();

    // Neck.
    ctx.fillStyle = skin.skinDark;
    roundRectPath(-0.065, -1.34, 0.13, 0.13, 0.05);
    ctx.fill();

    // Head and hair.
    ctx.fillStyle = skin.skin;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.028;
    ctx.beginPath();
    ctx.ellipse(0, -1.49, 0.175, 0.195, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // Ears.
    ctx.beginPath();
    ctx.ellipse(-0.174, -1.48, 0.04, 0.065, 0.2, 0, TAU);
    ctx.ellipse(0.174, -1.48, 0.04, 0.065, -0.2, 0, TAU);
    ctx.fillStyle = skin.skinDark;
    ctx.fill();
    // Hair at the nape.
    ctx.fillStyle = skin.hair;
    ctx.beginPath();
    ctx.ellipse(0, -1.41, 0.16, 0.12, 0, 0.1, Math.PI - 0.1);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-0.15, -1.5, 0.055, 0.1, 0.1, 0, TAU);
    ctx.fill();
    // Beanie / cap.
    ctx.fillStyle = skin.cap;
    ctx.beginPath();
    ctx.moveTo(-0.19, -1.54);
    ctx.quadraticCurveTo(-0.22, -1.76, 0, -1.77);
    ctx.quadraticCurveTo(0.22, -1.76, 0.19, -1.54);
    ctx.quadraticCurveTo(0.09, -1.6, 0, -1.6);
    ctx.quadraticCurveTo(-0.09, -1.6, -0.19, -1.54);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.025;
    ctx.stroke();
    ctx.fillStyle = skin.capDark;
    roundRectPath(-0.185, -1.59, 0.37, 0.06, 0.03);
    ctx.fill();
    // Cap fold / adjuster.
    ctx.strokeStyle = U.rgba("#ffffff", 0.22);
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.moveTo(-0.045, -1.76);
    ctx.quadraticCurveTo(0, -1.68, 0.045, -1.76);
    ctx.stroke();
    ctx.fillStyle = skin.capDark;
    ctx.beginPath();
    ctx.arc(0, -1.6, 0.032, 0, TAU);
    ctx.fill();

    // Hood collar.
    ctx.fillStyle = skin.hoodieDark;
    ctx.beginPath();
    ctx.ellipse(0, -1.3, 0.17, 0.065, 0, 0, Math.PI);
    ctx.fill();
    ctx.restore();
  }

  function drawRunPose(skin, phase, g, lean) {
    const outline = playerOutline();
    const left = Math.sin(phase);
    const right = Math.sin(phase + Math.PI);
    const liftL = Math.max(0, left);
    const liftR = Math.max(0, right);

    // Legs first, behind the torso.
    drawLeg(skin, -0.115, -0.64, -0.15 + left * 0.12, -0.02 - liftL * 0.2, -0.08 + left * 0.07, -0.33 - liftL * 0.12, outline);
    drawLeg(skin, 0.115, -0.64, 0.15 + right * 0.12, -0.02 - liftR * 0.2, 0.08 + right * 0.07, -0.33 - liftR * 0.12, outline);

    drawTorsoAndHead(skin, phase, lean, {
      left: [left * 0.6, -0.32 + liftR * 0.1],
      right: [right * 0.6, -0.32 + liftL * 0.1]
    }, outline, g);
  }

  function drawJumpPose(skin, phase, g) {
    const outline = playerOutline();
    const tuck = clamp((g.jumpPose || 0.6), 0.2, 1);
    // Knees up, feet trailing.
    drawLeg(skin, -0.11, -0.64, -0.2, -0.24 - tuck * 0.08, -0.2, -0.43 - tuck * 0.05, outline);
    drawLeg(skin, 0.11, -0.64, 0.2, -0.24 - tuck * 0.08, 0.2, -0.43 - tuck * 0.05, outline);

    drawTorsoAndHead(skin, phase, -0.05, {
      left: [0.34, -0.82],
      right: [-0.34, -0.82]
    }, outline, g);
  }

  function drawRollPose(skin, phase, g) {
    const outline = playerOutline();
    // A compact, sliding silhouette.
    drawLeg(skin, -0.15, -0.64, -0.38, -0.03, -0.32, -0.3, outline);
    drawLeg(skin, 0.13, -0.64, 0.1, -0.08, 0.02, -0.34, outline);
    drawTorsoAndHead(skin, phase, -0.22, {
      left: [-0.4, -0.12],
      right: [0.4, -0.12]
    }, outline, g);
    // Motion streak.
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "#fff4da";
    ctx.lineWidth = 0.02;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-0.36 - i * 0.08, -0.08 - i * 0.11);
      ctx.lineTo(-0.55 - i * 0.1, -0.08 - i * 0.11);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawBoardPose(skin, phase, g) {
    const outline = playerOutline();
    const idle = g.mode === "menu";
    const lean = idle ? 0 : Math.sin(phase * 0.5) * 0.012;
    // Surf stance, knees soft.
    drawLeg(skin, -0.13, -0.65, -0.22, -0.1, -0.2, -0.39, outline);
    drawLeg(skin, 0.14, -0.65, 0.2, -0.1, 0.205, -0.4, outline);
    drawTorsoAndHead(skin, phase * 0.35, lean, {
      left: [0.22, -0.52 + Math.sin(phase * 0.8) * 0.05],
      right: [-0.2, -0.52 - Math.sin(phase * 0.8) * 0.05]
    }, outline, g);
  }

  function drawJetpackPose(skin, phase, g) {
    const outline = playerOutline();
    const sway = Math.sin(g.time * 7) * 0.04;
    // Swept-back flight legs.
    drawLeg(skin, -0.11, -0.62, -0.16, -0.12 + sway, -0.14, -0.38, outline);
    drawLeg(skin, 0.11, -0.62, 0.16, -0.06 - sway, 0.14, -0.34, outline);
    drawTorsoAndHead(skin, phase * 0.3, 0.02, {
      left: [0.32, -0.7],
      right: [-0.32, -0.7]
    }, outline, g);

    // Twin metallic jetpack canisters & roaring exhaust flames.
    ctx.save();
    ctx.translate(0, -1.04);
    for (const side of [-1, 1]) {
      const cx = side * 0.13;
      ctx.fillStyle = "#c8d6de";
      ctx.strokeStyle = outline;
      ctx.lineWidth = 0.024;
      roundRectPath(cx - 0.075, -0.22, 0.15, 0.44, 0.06);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#ff4f8b";
      ctx.fillRect(cx - 0.065, -0.06, 0.13, 0.09);

      // Flame cone
      const flicker = 0.36 + Math.sin(g.time * 42 + side) * 0.1;
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "rgba(255,140,40,0.85)";
      ctx.beginPath();
      ctx.moveTo(cx - 0.06, 0.22);
      ctx.lineTo(cx, 0.22 + flicker);
      ctx.lineTo(cx + 0.06, 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,248,200,0.95)";
      ctx.beginPath();
      ctx.moveTo(cx - 0.032, 0.22);
      ctx.lineTo(cx, 0.22 + flicker * 0.58);
      ctx.lineTo(cx + 0.032, 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
  }

  function drawInspector(g, theme) {
    if (g.mode === "menu") return;
    const dist = g.inspectorDist == null ? 10 : g.inspectorDist;
    if (dist > 5.8) return;

    const p = g.player;
    const z = -clamp(dist, 2.0, 5.6);
    if (z <= view.camZ + 0.75) return;
    const baseIx = lerp(p.x, g.inspectorX == null ? p.x : g.inspectorX, 0.55);
    // Offset Inspector behind-left and K9 guard dog behind-right so the runner stays 100% readable.
    const inspectorX = baseIx - 0.56;
    const foot = project(inspectorX, 0, z);
    const s = foot.s;
    if (s <= 0) return;

    const phase = g.time * 13.5;
    const bob = Math.abs(Math.sin(phase)) * 0.035;
    const outline = playerOutline();

    // Ground shadow
    ctx.save();
    ctx.globalAlpha = 0.28;
    ell(foot.x, foot.y, s * 0.3, Math.max(2, s * 0.06), theme.shadow);
    ctx.restore();

    ctx.save();
    ctx.translate(foot.x, foot.y - bob * s);
    ctx.scale(s * 0.88, s * 0.88);

    const left = Math.sin(phase);
    const right = Math.sin(phase + Math.PI);
    const liftL = Math.max(0, left);
    const liftR = Math.max(0, right);

    // Transit Inspector trousers & boots
    capsule(-0.12, -0.62, -0.15 + left * 0.12, -0.02 - liftL * 0.18, 0.145, "#1d293b", outline, 0.026);
    capsule(0.12, -0.62, 0.15 + right * 0.12, -0.02 - liftR * 0.18, 0.145, "#152030", outline, 0.026);

    // Uniform jacket with high-vis reflective yellow transit vest
    ctx.fillStyle = "#1c2d42";
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.032;
    roundRectPath(-0.26, -1.26, 0.52, 0.68, 0.16);
    ctx.fill();
    ctx.stroke();

    // High-vis stripes
    ctx.fillStyle = "#f2c629";
    ctx.fillRect(-0.23, -1.04, 0.46, 0.07);
    ctx.fillRect(-0.23, -0.86, 0.46, 0.07);

    // Swinging arms + subtle flashlight beam
    capsule(-0.26, -1.16, -0.34, -0.82 + left * 0.14, 0.125, "#1c2d42", outline, 0.024);
    capsule(0.26, -1.16, 0.36, -0.84 + right * 0.12, 0.125, "#1c2d42", outline, 0.024);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const cone = ctx.createRadialGradient(0.36, -0.88, 0.03, 0.36, -1.12, 0.68);
    cone.addColorStop(0, "rgba(255,244,185,0.28)");
    cone.addColorStop(0.5, "rgba(255,244,185,0.08)");
    cone.addColorStop(1, "rgba(255,244,185,0)");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.arc(0.36, -1.0, 0.68, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Inspector head + peaked transit cap
    ctx.fillStyle = "#c89674";
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.028;
    ctx.beginPath();
    ctx.ellipse(0, -1.48, 0.18, 0.19, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#152336";
    ctx.beginPath();
    ctx.moveTo(-0.22, -1.56);
    ctx.quadraticCurveTo(-0.24, -1.78, 0, -1.8);
    ctx.quadraticCurveTo(0.24, -1.78, 0.22, -1.56);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffc62d";
    ctx.beginPath();
    ctx.arc(0, -1.67, 0.045, 0, TAU);
    ctx.fill();
    ctx.restore();

    // K9 Guard Dog sprinting behind-right of the runner
    const dogFoot = project(baseIx + 0.56, 0, z + 0.38);
    const ds = dogFoot.s;
    if (ds > 0) {
      const dogBob = Math.abs(Math.sin(phase * 1.25)) * 0.045;
      ctx.save();
      ctx.translate(dogFoot.x, dogFoot.y - dogBob * ds);
      ctx.scale(ds * 0.9, ds * 0.9);
      ctx.fillStyle = "#5c3f29";
      ctx.strokeStyle = outline;
      ctx.lineWidth = 0.025;
      roundRectPath(-0.14, -0.46, 0.28, 0.32, 0.12);
      ctx.fill();
      ctx.stroke();
      // Ears
      ctx.beginPath();
      ctx.moveTo(-0.1, -0.44);
      ctx.lineTo(-0.14, -0.62);
      ctx.lineTo(-0.02, -0.46);
      ctx.moveTo(0.1, -0.44);
      ctx.lineTo(0.14, -0.62);
      ctx.lineTo(0.02, -0.46);
      ctx.fillStyle = "#3c2718";
      ctx.fill();
      // Legs
      capsule(-0.09, -0.2, -0.11, -0.02 - liftR * 0.12, 0.065, "#462f1e", outline, 0.015);
      capsule(0.09, -0.2, 0.11, -0.02 - liftL * 0.12, 0.065, "#462f1e", outline, 0.015);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------
  // Screen-space particles
  // ------------------------------------------------------------
  function starPath(x, y, outer, inner, points, rotation) {
    ctx.beginPath();
    const n = points || 4;
    for (let i = 0; i < n * 2; i++) {
      const a = (rotation || 0) + (i / (n * 2)) * TAU;
      const r = i % 2 === 0 ? outer : inner;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  function drawParticles(g) {
    const particles = g.particles || [];
    for (const p of particles) {
      const life = clamp(p.life / (p.maxLife || 1), 0, 1);
      if (life <= 0) continue;
      const alpha = (p.alpha == null ? 1 : p.alpha) * life;
      ctx.globalAlpha = alpha;
      if (p.kind === "text") {
        const fs = p.size || 20;
        ctx.font = "900 " + fs + "px 'Arial Black', 'Trebuchet MS', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.strokeStyle = p.outline || "rgba(6,16,22,0.8)";
        ctx.lineWidth = Math.max(3, fs * 0.18);
        ctx.strokeText(p.label || "", p.x, p.y);
        ctx.fillStyle = p.color || "#ffc62d";
        ctx.fillText(p.label || "", p.x, p.y);
      } else if (p.kind === "ring") {
        const t = 1 - life;
        ctx.strokeStyle = p.color || "#ffc62d";
        ctx.lineWidth = Math.max(1, (p.size || 10) * 0.08 * life);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, (p.size || 10) * (0.4 + t * 1.8), (p.size || 10) * (0.4 + t * 1.8) * 0.3, 0, 0, TAU);
        ctx.stroke();
      } else if (p.kind === "confetti") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillStyle = p.color || "#ffc62d";
        ctx.fillRect(-(p.size || 4) * 0.5, -(p.size || 4) * 0.28, p.size || 4, (p.size || 4) * 0.56);
        ctx.restore();
      } else if (p.kind === "spark") {
        ctx.strokeStyle = p.color || "#ffc62d";
        ctx.lineWidth = Math.max(0.7, (p.size || 3) * 0.45 * life);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (p.vx || 0) * 0.02, p.y - (p.vy || 0) * 0.02);
        ctx.stroke();
      } else if (p.kind === "star") {
        ctx.fillStyle = p.color || "#ffc62d";
        starPath(p.x, p.y, (p.size || 4) * (0.4 + life * 0.75), (p.size || 4) * 0.26, 4, p.rot || 0);
        ctx.fill();
      } else if (p.kind === "smoke") {
        const rad = (p.size || 6) * (1.1 + (1 - life) * 1.5);
        ctx.fillStyle = p.color || "rgba(215,205,190,0.3)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, rad, 0, TAU);
        ctx.fill();
      } else if (p.kind === "coin") {
        ctx.fillStyle = p.color || "#ffc62d";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, (p.size || 4) * 0.6, (p.size || 4), 0, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color || "#ffc62d";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, (p.size || 3) * (0.5 + life * 0.5)), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------
  // Menu runner portraits
  // ------------------------------------------------------------
  function drawAvatar(targetCanvas, skinKey) {
    const skin = SS.SKINS[skinKey] || SS.SKINS.dash;
    const c = targetCanvas.getContext("2d");
    const size = targetCanvas.width;
    const scale = size / 132;
    c.setTransform(scale, 0, 0, scale, 0, 0);
    c.clearRect(0, 0, 132, 132);

    // Backdrop halo.
    const halo = c.createRadialGradient(66, 60, 10, 66, 65, 66);
    halo.addColorStop(0, U.rgba(skin.css, 0.36));
    halo.addColorStop(0.55, U.rgba(skin.css, 0.1));
    halo.addColorStop(1, U.rgba(skin.css, 0));
    c.fillStyle = halo;
    c.fillRect(0, 0, 132, 132);
    c.strokeStyle = U.rgba(skin.css, 0.28);
    c.lineWidth = 1;
    c.beginPath();
    c.arc(66, 66, 50, 0, TAU);
    c.stroke();

    // Shoulders / hoodie.
    c.fillStyle = skin.hoodieDark;
    c.beginPath();
    c.moveTo(23, 124);
    c.quadraticCurveTo(22, 91, 48, 84);
    c.quadraticCurveTo(66, 78, 84, 84);
    c.quadraticCurveTo(110, 91, 109, 124);
    c.closePath();
    c.fill();
    c.fillStyle = skin.hoodie;
    c.beginPath();
    c.moveTo(30, 122);
    c.quadraticCurveTo(32, 97, 52, 89);
    c.quadraticCurveTo(66, 85, 80, 89);
    c.quadraticCurveTo(100, 97, 102, 122);
    c.closePath();
    c.fill();
    // Hood rim.
    c.strokeStyle = skin.hoodieLight;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(44, 92);
    c.quadraticCurveTo(66, 80, 88, 92);
    c.stroke();
    // Backpack straps.
    c.strokeStyle = skin.packDark;
    c.lineWidth = 5;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(48, 99);
    c.quadraticCurveTo(41, 112, 44, 132);
    c.moveTo(84, 99);
    c.quadraticCurveTo(91, 112, 88, 132);
    c.stroke();

    // Neck.
    c.fillStyle = skin.skinDark;
    c.fillRect(58, 76, 16, 14);

    // Head.
    c.fillStyle = skin.skin;
    c.strokeStyle = "rgba(7,17,23,0.82)";
    c.lineWidth = 2.2;
    c.beginPath();
    c.ellipse(66, 53, 26, 29, 0, 0, TAU);
    c.fill();
    c.stroke();
    // Ears.
    c.fillStyle = skin.skinDark;
    c.beginPath();
    c.ellipse(39.5, 56, 5, 8, 0.15, 0, TAU);
    c.ellipse(92.5, 56, 5, 8, -0.15, 0, TAU);
    c.fill();

    // Hair silhouette.
    c.fillStyle = skin.hair;
    c.beginPath();
    c.ellipse(66, 31, 27, 17, 0, Math.PI, TAU);
    c.fill();
    c.beginPath();
    c.ellipse(42, 42, 6, 16, 0.35, 0, TAU);
    c.ellipse(90, 42, 6, 16, -0.35, 0, TAU);
    c.fill();

    // Face.
    c.fillStyle = "rgba(23,20,18,0.86)";
    c.beginPath();
    c.ellipse(56, 58, 2.7, 3.5, 0, 0, TAU);
    c.ellipse(76, 58, 2.7, 3.5, 0, 0, TAU);
    c.fill();
    c.strokeStyle = "rgba(45,29,22,0.5)";
    c.lineWidth = 1.7;
    c.beginPath();
    c.moveTo(66, 58);
    c.quadraticCurveTo(69, 64, 66, 65);
    c.stroke();
    c.strokeStyle = "rgba(24,18,16,0.72)";
    c.beginPath();
    c.moveTo(55, 70);
    c.quadraticCurveTo(66, 77, 77, 70);
    c.stroke();
    // Cheek highlight.
    c.fillStyle = "rgba(255,255,255,0.1)";
    c.beginPath();
    c.ellipse(53, 65, 8, 5, -0.2, 0, TAU);
    c.fill();

    // Cap / beanie.
    c.fillStyle = skin.cap;
    c.strokeStyle = "rgba(7,17,23,0.82)";
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(38, 42);
    c.quadraticCurveTo(38, 17, 66, 16);
    c.quadraticCurveTo(94, 17, 94, 42);
    c.quadraticCurveTo(80, 36, 66, 36);
    c.quadraticCurveTo(52, 36, 38, 42);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = skin.capDark;
    c.beginPath();
    c.ellipse(66, 40, 27, 6, 0, 0, TAU);
    c.fill();
    c.fillStyle = skin.capDark;
    c.beginPath();
    c.arc(66, 17, 4, 0, TAU);
    c.fill();
    // Cap seam.
    c.strokeStyle = "rgba(255,255,255,0.22)";
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(66, 17);
    c.lineTo(66, 37);
    c.stroke();

    // Original runner badge.
    c.fillStyle = skin.accent;
    c.beginPath();
    c.arc(84, 108, 6, 0, TAU);
    c.fill();
    c.fillStyle = "rgba(7,17,23,0.82)";
    c.font = "900 7px 'Arial Black', sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("S", 84, 108.5);
  }

  SS.Render = {
    init,
    resize,
    frame,
    project,
    laneX,
    drawAvatar,
    drawPlayer,
    get ctx() { return ctx; },
    get width() { return W; },
    get height() { return H; }
  };
})();
