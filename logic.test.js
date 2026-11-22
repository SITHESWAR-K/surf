const test = require('node:test');
const assert = require('node:assert/strict');
const Logic = require('./js/logic.js');

test('computeViewportMetrics returns valid clamped lane width and gauge across desktop and mobile viewports', () => {
  const desktop = Logic.computeViewportMetrics(1440, 900);
  assert.ok(desktop.laneW >= 1.32 && desktop.laneW <= 2.25);
  assert.ok(desktop.gauge >= 0.36 && desktop.gauge <= 0.76);
  assert.ok(desktop.camY > 0);

  const mobile = Logic.computeViewportMetrics(390, 844);
  assert.equal(mobile.laneW, 1.32);
  assert.ok(mobile.gauge >= 0.36 && mobile.gauge <= 0.76);

  const ultrawide = Logic.computeViewportMetrics(3440, 1080);
  assert.equal(ultrawide.laneW, 2.25);
  assert.equal(ultrawide.gauge, 0.76);
});

test('computeRampHeight linearly climbs from 0 at ground edge to targetHeight at train roof', () => {
  const len = 8;
  const h = 2.16;
  // Ramp spans [center - 4, center + 4]; player is at z = 0
  assert.equal(Logic.computeRampHeight(0, 10, len, h), 0); // ahead of player
  assert.equal(Logic.computeRampHeight(0, -10, len, h), 0); // behind player
  // Front ground edge touches player (center = +4, zNear = 0) -> height 0
  assert.equal(Logic.computeRampHeight(0, 4, len, h), 0);
  // Quarter way up (center = +2, zNear = -2) -> 25%
  assert.ok(Math.abs(Logic.computeRampHeight(0, 2, len, h) - h * 0.25) < 1e-6);
  // Midpoint (center = 0) -> 50%
  assert.ok(Math.abs(Logic.computeRampHeight(0, 0, len, h) - h * 0.5) < 1e-6);
  // Top edge meeting train roof (center = -4, zFar = 0) -> 100%
  assert.ok(Math.abs(Logic.computeRampHeight(0, -4, len, h) - h) < 1e-6);
});

test('resolveStumbleOrCrash handles invulnerability, jetpack, hoverboard, first stumble, and inspector bust', () => {
  assert.equal(Logic.resolveStumbleOrCrash(0, false, false, true), 'ignore');
  assert.equal(Logic.resolveStumbleOrCrash(5, false, true, false), 'ignore');
  assert.equal(Logic.resolveStumbleOrCrash(5, true, false, false), 'boardSave');
  assert.equal(Logic.resolveStumbleOrCrash(0, false, false, false), 'stumble');
  assert.equal(Logic.resolveStumbleOrCrash(4.2, false, false, false), 'busted');
});

test('computeNearMissBonus increments combo and caps at 8x', () => {
  assert.deepEqual(Logic.computeNearMissBonus(0), { combo: 1, points: 50 });
  assert.deepEqual(Logic.computeNearMissBonus(3), { combo: 4, points: 200 });
  assert.deepEqual(Logic.computeNearMissBonus(8), { combo: 8, points: 400 });
});

test('Rail Shop upgrades and board stock enforce coin balance, cost scaling, and max caps', () => {
  const save = {
    totalCoins: 500,
    upgrades: { magnet: 0, multiplier: 5, sneakers: 0, jetpack: 0 },
    boardStock: 1
  };

  assert.equal(Logic.getUpgradeCost('magnet', 0), 120);
  assert.equal(Logic.getUpgradeCost('magnet', 5), null);
  assert.equal(Logic.getPowerupDuration('magnet', 0), 10);
  assert.equal(Logic.getPowerupDuration('magnet', 2), 15);

  const buyMagnet = Logic.attemptPurchaseUpgrade(save, 'magnet');
  assert.equal(buyMagnet.ok, true);
  assert.equal(buyMagnet.nextLevel, 1);
  assert.equal(buyMagnet.nextCoins, 380);

  const maxed = Logic.attemptPurchaseUpgrade(save, 'multiplier');
  assert.equal(maxed.ok, false);
  assert.equal(maxed.reason, 'maxed');

  const broke = Logic.attemptPurchaseUpgrade({ totalCoins: 40, upgrades: { jetpack: 0 } }, 'jetpack');
  assert.equal(broke.ok, false);
  assert.equal(broke.reason, 'coins');

  const buyBoard = Logic.attemptBuyBoard(save, 80, 5);
  assert.equal(buyBoard.ok, true);
  assert.equal(buyBoard.nextStock, 2);
  assert.equal(buyBoard.nextCoins, 420);

  const maxedBoard = Logic.attemptBuyBoard({ totalCoins: 999, boardStock: 5 }, 80, 5);
  assert.equal(maxedBoard.ok, false);
  assert.equal(maxedBoard.reason, 'maxed');
});

test('computeTunnelFactor returns 0 outside tunnel, 1 inside tunnel, and smooth transitions at portals', () => {
  const period = 460;
  const length = 88;
  assert.equal(Logic.computeTunnelFactor(100, period, length), 0);
  assert.equal(Logic.computeTunnelFactor(400, period, length), 1);
  const entry = Logic.computeTunnelFactor(345, period, length);
  assert.ok(entry > 0 && entry < 1);
  const exit = Logic.computeTunnelFactor(447, period, length);
  assert.ok(exit > 0 && exit < 1);
});
