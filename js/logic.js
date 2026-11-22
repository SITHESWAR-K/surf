/* ============================================================
   SUBWAY SUFFER — pure gameplay rules, physics & upgrade math
   Shared between browser runtime and Node.js unit tests.
   ============================================================ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    const SS = (root.SS = root.SS || {});
    SS.Logic = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function computeViewportMetrics(width, height) {
    const W = Math.max(320, width || 1280);
    const H = Math.max(280, height || 720);
    const horizon = H * 0.295;
    const focal = Math.min(H * 1.08, W * 1.7);
    const footY = H * 0.81;
    const camY = ((footY - horizon) * 7) / focal;
    const laneW = clamp((W / H) * 1.28, 1.32, 2.25);
    const gauge = clamp(laneW * 0.34, 0.36, 0.76);
    return { W, H, horizon, focal, camY, laneW, gauge };
  }

  function computeRampHeight(z, rampCenterZ, rampLen, targetHeight) {
    const zNear = rampCenterZ - rampLen * 0.5;
    const zFar = rampCenterZ + rampLen * 0.5;
    if (z < zNear || z > zFar) return 0;
    // Ramp climbs from zNear (ground = 0) up to zFar (train roof = targetHeight).
    const t = clamp((z - zNear) / (rampLen || 1), 0, 1);
    return targetHeight * t;
  }

  function resolveStumbleOrCrash(inspectorAlertTimer, hasBoard, isInvuln, isJetpack) {
    if (isJetpack || isInvuln) return "ignore";
    if (hasBoard) return "boardSave";
    if (inspectorAlertTimer > 0) return "busted";
    return "stumble";
  }

  function computeNearMissBonus(combo) {
    const nextCombo = clamp((combo || 0) + 1, 1, 8);
    const points = 50 * nextCombo;
    return { combo: nextCombo, points };
  }

  const UPGRADE_DEFS = {
    magnet: { name: "Coin Magnet", baseDuration: 10, perLevel: 2.5, maxLevel: 5, baseCost: 120 },
    multiplier: { name: "2x Multiplier", baseDuration: 12, perLevel: 2.5, maxLevel: 5, baseCost: 150 },
    sneakers: { name: "Super Sneakers", baseDuration: 12, perLevel: 2.5, maxLevel: 5, baseCost: 120 },
    jetpack: { name: "Turbo Jetpack", baseDuration: 7.5, perLevel: 1.5, maxLevel: 5, baseCost: 220 }
  };

  function getUpgradeCost(key, currentLevel) {
    const def = UPGRADE_DEFS[key];
    if (!def) return Infinity;
    const lvl = clamp(Math.floor(currentLevel || 0), 0, def.maxLevel);
    if (lvl >= def.maxLevel) return null;
    return Math.round(def.baseCost * Math.pow(1.65, lvl) / 10) * 10;
  }

  function getPowerupDuration(key, level) {
    const def = UPGRADE_DEFS[key];
    if (!def) return 10;
    const lvl = clamp(Math.floor(level || 0), 0, def.maxLevel);
    return def.baseDuration + lvl * def.perLevel;
  }

  function attemptPurchaseUpgrade(save, key) {
    const def = UPGRADE_DEFS[key];
    if (!def || !save) return { ok: false, reason: "invalid" };
    const upgrades = save.upgrades || {};
    const lvl = clamp(Math.floor(upgrades[key] || 0), 0, def.maxLevel);
    const cost = getUpgradeCost(key, lvl);
    if (cost === null) return { ok: false, reason: "maxed" };
    if ((save.totalCoins || 0) < cost) return { ok: false, reason: "coins", cost };
    return {
      ok: true,
      cost,
      nextLevel: lvl + 1,
      nextCoins: save.totalCoins - cost
    };
  }

  function attemptBuyBoard(save, price, maxStock) {
    const boardPrice = price == null ? 80 : price;
    const cap = maxStock == null ? 5 : maxStock;
    const stock = clamp(Math.floor((save && save.boardStock) || 1), 1, cap);
    if (stock >= cap) return { ok: false, reason: "maxed" };
    if ((save.totalCoins || 0) < boardPrice) return { ok: false, reason: "coins", cost: boardPrice };
    return {
      ok: true,
      cost: boardPrice,
      nextStock: stock + 1,
      nextCoins: save.totalCoins - boardPrice
    };
  }

  function computeTunnelFactor(distance, period, length) {
    const p = period || 460;
    const len = length || 88;
    const phase = ((distance % p) + p) % p;
    const start = p - len - 20;
    const end = p - 20;
    if (phase < start - 14 || phase > end + 14) return 0;
    if (phase >= start && phase <= end) return 1;
    if (phase < start) return clamp((phase - (start - 14)) / 14, 0, 1);
    return clamp((end + 14 - phase) / 14, 0, 1);
  }

  return {
    clamp,
    lerp,
    computeViewportMetrics,
    computeRampHeight,
    resolveStumbleOrCrash,
    computeNearMissBonus,
    UPGRADE_DEFS,
    getUpgradeCost,
    getPowerupDuration,
    attemptPurchaseUpgrade,
    attemptBuyBoard,
    computeTunnelFactor
  };
});
