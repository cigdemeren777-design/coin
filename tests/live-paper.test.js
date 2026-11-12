const assert = require('node:assert/strict');
const P = require('../live-paper');
const now = 1800000000000;
const end = Math.floor(now / P.hour) * P.hour;
const bars = Array.from({length: 300}, (_, i) => {
  const p = 90 + i * .05;
  return {t: end - (300 - i) * P.hour, o: p, h: p + .3, l: p - .3, c: p + .1, v: 100};
});
bars.at(-1).c = 106;
bars.at(-1).h = 106.1;
const signal = P.candidate('BTCUSDT', bars, end + 2000);
assert(signal);
assert.equal(P.candidate('BTCUSDT', bars, end - 1), null);
assert.equal(P.candidate('BTCUSDT', bars, end + 300000), null);
assert.equal(P.candidate('BTCUSDT', bars.filter((_, i) => i !== 200), end + 1), null);
const state = P.initial();
const quote = {bid: 105.99, ask: 106, at: end + 2000};
assert(!P.buy(state, signal, quote, end + 15000));
assert(!P.buy(state, signal, {...quote, ask: 107}, end + 2000));
assert(P.buy(state, signal, quote, end + 2000));
assert.equal(state.cash, 900);
const p = state.positions[0];
assert(Math.abs(p.qty * p.entry * 1.001 - 100) < 1e-10);
assert(!P.buy(state, signal, quote, end + 2000));
const hit = {bid: p.target + 1, ask: p.target + 1.01, at: end + 3000};
assert(P.mark(state, {BTCUSDT: hit}, end + 3000));
assert.equal(state.positions.length, 0);
assert.equal(state.trades[0].reason, 'Hedef');
assert(Math.abs(state.cash - 1000 - state.trades[0].pnl) < 1e-10);
assert.deepEqual(P.restore(JSON.stringify(state)), state);
assert(!P.buy(state, signal, quote, end + 2000));
const loss = P.initial();
assert(P.buy(loss, signal, quote, end + 2000));
const low = {bid: loss.positions[0].stop - .25, ask: loss.positions[0].stop, at: end + 4000};
assert(P.mark(loss, {BTCUSDT: low}, end + 4000));
assert.equal(loss.trades[0].reason, 'Stop');
assert(loss.trades[0].pnl < 0);
loss.cash = 899;
assert(P.mark(loss, {}, end + 4000));
assert(loss.locked);
assert(!P.buy(loss, {...signal, symbol:'ETHUSDT'}, quote, end + 2000));
assert.throws(() => P.restore('{"version":1,"cash":-2}'));
console.log('PASS: candle timing and gap, slippage and fee, stale prices, entry cap, duplicate prevention, stop, target, equity lock, wallet reload');

const demoUniverse = {symbols: [
  {symbol:'BTCUSDT', status:'TRADING', quoteAsset:'USDT', isSpotTradingAllowed:true},
  {symbol:'SOLUSDT', status:'TRADING', quoteAsset:'USDT', isSpotTradingAllowed:true},
  {symbol:'TESTUSDT', status:'HALT', quoteAsset:'USDT', isSpotTradingAllowed:true},
  {symbol:'ETHEUR', status:'TRADING', quoteAsset:'EUR', isSpotTradingAllowed:true},
  {symbol:'BADUSDT', status:'TRADING', quoteAsset:'USDT', isSpotTradingAllowed:false}
]};
assert.deepEqual(P.parseUniverse(demoUniverse), ['BTCUSDT','SOLUSDT']);
assert(P.candidate('SOLUSDT', bars, end+2000));
assert(!P.candidate('SOLEUR', bars, end+2000));
assert.deepEqual(P.restore(JSON.stringify({...state, positions:[{...p, symbol:'SOLUSDT'}]})).positions[0].symbol, 'SOLUSDT');
const next = {...bars.at(-1), t: end};
assert.equal(P.mergeBars(bars, [next], end + P.hour).at(-1).t, end);
assert.equal(P.mergeBars(bars, [], end + P.hour), null);

(async () => {
  let settle;
  const complete = new Promise(resolve => { settle = resolve; });
  const expiry = setTimeout(() => settle(null), 8000);
  const requested = [];
  const rawBars = bars.slice(-250).map(b => [b.t, b.o, b.h, b.l, b.c, b.v, b.t + P.hour - 1]);
  const engine = P.monitor({
    persist() {},
    now: () => end + 7000,
    get: async input => {
      const url = new URL(input);
      if (url.pathname.endsWith('/exchangeInfo')) return {ok:true, json:async () => demoUniverse};
      if (url.pathname.endsWith('/bookTicker')) return {ok:true, json:async () =>
        JSON.parse(url.searchParams.get('symbols')).map(symbol => ({symbol,bidPrice:'105.99',askPrice:'106'}))};
      requested.push(url.searchParams.get('symbol'));
      return {ok:true,json:async () => rawBars};
    },
    onUpdate: update => { if (update.market.checked === 2) settle(update); }
  });
  engine.start();
  const update = await complete;
  clearTimeout(expiry);
  engine.stop();
  assert(update && !update.error);
  assert.deepEqual(requested, ['BTCUSDT','SOLUSDT']);
  assert(update.signals.some(x => x.symbol === 'SOLUSDT'));
  assert(update.quotes.SOLUSDT);
  console.log('PASS: universe discovery, cross-market filtering, history cache, SOL scan and quote');
})().catch(error => { console.error(error); process.exitCode = 1; });
