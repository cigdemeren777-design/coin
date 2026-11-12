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
const at = end + 20 * 60000;
const setup = P.setupFor('BTCUSDT', bars, at);
assert(setup && setup.level === 106.1);
assert.equal(P.setupFor('BTCUSDT', bars, end - 1), null);
assert.equal(P.setupFor('BTCUSDT', bars.filter((_, i) => i !== 200), at), null);
const quote = {bid:106.11, ask:106.12, at};
const signal = P.signalFor(setup, quote, at, at);
assert(signal);
assert.equal(P.signalFor(setup, {...quote,bid:106.1}, at, at), null);
assert.equal(P.signalFor(setup, quote, at, at-300000), null);
assert.equal(P.signalFor(setup, {...quote,at:at-13000}, at, at), null);
assert.equal(P.signalFor(setup, {...quote,at:end+P.hour}, end+P.hour, at), null);
const state = P.initial();
assert(!P.buy(state, signal, quote, at + 15000));
assert(!P.buy(state, signal, {...quote, ask: 107}, at));
assert(P.buy(state, signal, quote, at));
assert.equal(state.cash, 900);
const p = state.positions[0];
assert(Math.abs(p.qty * p.entry * 1.001 - 100) < 1e-10);
assert(!P.buy(state, signal, quote, at));
const hit = {bid: p.target + 1, ask: p.target + 1.01, at: at + 1000};
assert(P.mark(state, {BTCUSDT: hit}, at + 1000));
assert.equal(state.positions.length, 0);
assert.equal(state.trades[0].reason, 'Hedef');
assert(Math.abs(state.cash - 1000 - state.trades[0].pnl) < 1e-10);
assert.deepEqual(P.restore(JSON.stringify(state)), state);
assert(!P.buy(state, signal, quote, at));
const loss = P.initial();
assert(P.buy(loss, signal, quote, at));
const low = {bid: loss.positions[0].stop - .25, ask: loss.positions[0].stop, at: at + 2000};
assert(P.mark(loss, {BTCUSDT: low}, at + 2000));
assert.equal(loss.trades[0].reason, 'Stop');
assert(loss.trades[0].pnl < 0);
loss.cash = 899;
assert(P.mark(loss, {}, at + 2000));
assert(loss.locked);
assert(!P.buy(loss, {...signal, symbol:'ETHUSDT'}, quote, at));
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
assert(P.setupFor('SOLUSDT', bars, at));
assert(!P.setupFor('SOLEUR', bars, at));
assert.deepEqual(P.restore(JSON.stringify({...state, positions:[{...p, symbol:'SOLUSDT'}]})).positions[0].symbol, 'SOLUSDT');
const next = {...bars.at(-1), t: end};
assert.equal(P.mergeBars(bars, [next], end + P.hour).at(-1).t, end);
assert.equal(P.mergeBars(bars, [], end + P.hour), null);

(async () => {
  let settle;
  const complete = new Promise(resolve => { settle = resolve; });
  const expiry = setTimeout(() => settle(null), 18000);
  const requested = [];
  let quoteCycles = 0;
  let appeared = false;
  const rawBars = bars.slice(-250).map(b => [b.t, b.o, b.h, b.l, b.c, b.v, b.t + P.hour - 1]);
  const engine = P.monitor({
    persist() {},
    now: () => at,
    get: async input => {
      const url = new URL(input);
      if (url.pathname.endsWith('/exchangeInfo')) return {ok:true, json:async () => demoUniverse};
      if (url.pathname.endsWith('/bookTicker')) {
        quoteCycles++;
        const bid = quoteCycles === 2 ? '106.11' : '106.09';
        return {ok:true, json:async () => ['BTCUSDT','SOLUSDT','ETHEUR']
          .map(symbol => ({symbol,bidPrice:bid,askPrice:'106.12'}))};
      }
      requested.push(url.searchParams.get('symbol'));
      return {ok:true,json:async () => rawBars};
    },
    onUpdate: update => {
      if (update.signals.some(signal => signal.symbol === 'SOLUSDT')) appeared = true;
      if (quoteCycles >= 3 && update.market.checked === 2 && !update.error) settle(update);
    }
  });
  engine.start();
  const update = await complete;
  clearTimeout(expiry);
  engine.stop();
  assert(update && !update.error);
  assert.deepEqual(requested, ['BTCUSDT','SOLUSDT']);
  assert(appeared, 'SOL should trigger 20 minutes after candle close');
  assert.equal(update.signals.length, 0);
  assert(!update.quotes.ETHEUR);
  assert(update.quotes.SOLUSDT);
  console.log('PASS: universe discovery, cross-market filtering, history cache, intrahour SOL signal and invalidation');
})().catch(error => { console.error(error); process.exitCode = 1; });
