const assert = require('node:assert/strict');
const Paper = require('../live-paper');
const Replay = require('../live-replay');

const from = Date.UTC(2024, 1, 1);
const hour = Paper.hour;
const step = Replay.step;
const hourly = Array.from({length:280}, (_, i) => {
  const p = 100 + i / 100;
  return {t:from + (i - 250) * hour, o:p, h:p+.03, l:p-.01, c:p+.02, v:20};
});
const fine = Array.from({length:30 * hour / step}, (_, i) => ({
  t:from+i*step, o:100, h:100.5, l:99.5, c:100, v:3
}));
const setup = Paper.setupFor('BTCUSDT', hourly.slice(0, 250), from);
assert(setup.risingTrend);
const breakout = setup.level * 1.001;
fine[0] = {...fine[0], h:breakout+.01, c:breakout};
const nextOpen = setup.level * 1.002;
fine[1] = {...fine[1], o:nextOpen, h:nextOpen*1.07, l:nextOpen*.93, c:nextOpen};

const comparison = Replay.compare({BTCUSDT:hourly}, {BTCUSDT:fine});
const base = comparison.development.base;
assert.equal(base.trades, 1);
assert.equal(base.wins, 0);
assert.equal(base.ledger[0].at, fine[1].t + step - 1);
assert.equal(base.ledger[0].reason, 'Stop');
assert(Math.abs(base.ledger[0].entry - nextOpen * (1 + comparison.assumedSpread / 2) * 1.0005) < 1e-10);
assert(Math.abs(base.equity - (1000 + base.ledger[0].pnl)) < 1e-10);
assert.equal(comparison.test.base.trades, 0);
assert.equal(comparison.test.base.winRate, null);
const laterFine = fine.map(bar => bar.t >= comparison.holdout ? {...bar, h:200, c:150} : bar);
const laterHours = hourly.map(bar => bar.t >= comparison.holdout ? {...bar, h:200, c:150} : bar);
assert.deepEqual(Replay.compare({BTCUSDT:laterHours}, {BTCUSDT:laterFine}).development, comparison.development);
assert.throws(() => Replay.compare({BTCUSDT:hourly}, {BTCUSDT:fine.filter((_, i) => i !== 300)}), /eksik/);
assert.throws(() => Replay.compare({BTCUSDT:hourly.slice(1)}, {BTCUSDT:fine}), /geçmişi eksik/);
console.log('PASS: live replay next open, prefix invariance, stop-first, exact ledger and data gaps');
