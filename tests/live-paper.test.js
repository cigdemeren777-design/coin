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
const quote = {bid:106.11, ask:106.12, bidQty:1000, askQty:1000, at};
const signal = P.signalFor(setup, quote, at, at);
assert(signal);
assert.equal(P.signalFor(setup, {...quote,bid:106.1}, at, at), null);
assert.equal(P.signalFor(setup, quote, at, at-300000), null);
assert.equal(P.signalFor(setup, {...quote,at:at-13000}, at, at), null);
assert.equal(P.signalFor(setup, {...quote,at:end+P.hour}, end+P.hour, at), null);
const state = P.initial();
assert(!P.buy(state, signal, quote, at + 15000));
assert(!P.buy(state, {...signal, expires:undefined}, quote, at));
assert(!P.buy(state, signal, {...quote, ask: 107}, at));
assert(P.buy(state, signal, quote, at));
assert.equal(state.cash, 900);
const p = state.positions[0];
assert(Math.abs(p.qty * p.entry * 1.001 - 100) < 1e-10);
assert(!P.buy(state, signal, quote, at));
const hit = {...quote, bid: p.target + 1, ask: p.target + 1.01, at: at + 1000};
assert(P.mark(state, {BTCUSDT: hit}, at + 1000));
assert.equal(state.positions.length, 0);
assert.equal(state.trades[0].reason, 'Hedef');
assert(Math.abs(state.cash - 1000 - state.trades[0].pnl) < 1e-10);
assert.deepEqual(P.restore(JSON.stringify(state)), state);
assert(!P.buy(state, signal, quote, at));
const loss = P.initial();
assert(P.buy(loss, signal, quote, at));
const low = {...quote, bid: loss.positions[0].stop - .25, ask: loss.positions[0].stop, at: at + 2000};
assert(P.mark(loss, {BTCUSDT: low}, at + 2000));
assert.equal(loss.trades[0].reason, 'Stop');
assert(loss.trades[0].pnl < 0);
loss.cash = 899;
assert(P.mark(loss, {}, at + 2000));
assert(loss.locked);
assert(!P.buy(loss, {...signal, symbol:'ETHUSDT'}, quote, at));
assert.throws(() => P.restore('{"version":1,"cash":-2}'));
console.log('PASS: candle timing and gap, slippage and fee, stale prices, entry cap, duplicate prevention, stop, target, equity lock, wallet reload');

const legacy = P.initial();
delete legacy.maxPositions;
delete legacy.orderCash;
assert.deepEqual(P.restore(JSON.stringify(legacy)), P.initial());
const choices = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
let saved;
let current;
let writes = 0;
const preferences = P.monitor({state:P.initial(), persist:state => { saved = JSON.stringify(state); writes++; },
  onUpdate:update => { current = update.state; }});
preferences.setSettings(3, 25.50);
preferences.setSettings(3, 25.50);
assert.equal(writes, 1);
assert.equal(current.maxPositions, 3);
assert.equal(current.orderCash, 25.5);
for (const invalid of [[4, 25.50], [2, 0], [2, .001], [2, Infinity], [2, '25.50']]) {
  assert.throws(() => preferences.setSettings(...invalid));
}
assert.equal(writes, 1);
const positions = P.restore(saved);
choices.forEach((symbol, i) => assert.equal(P.buy(positions, {...signal, symbol}, quote, at), i < 3));
assert.equal(positions.cash, 923.5);
assert(positions.positions.every(position => position.cost === 25.5));
const holding = P.monitor({state:positions, persist:state => { saved = JSON.stringify(state); }, onUpdate() {}});
holding.setSettings(1, 99.75);
const reduced = P.restore(saved);
assert.equal(reduced.maxPositions, 1);
assert.equal(reduced.orderCash, 99.75);
assert.deepEqual(reduced.positions, positions.positions);
assert.equal(reduced.cash, positions.cash);
assert(!P.buy(reduced, {...signal, symbol:choices[3]}, quote, at));
for (const symbol of choices.slice(0, 3)) assert(P.sell(reduced, symbol, quote, at));
assert(P.buy(reduced, {...signal, symbol:choices[3]}, quote, at));
assert.equal(reduced.positions[0].cost, 99.75);
assert(!P.buy(reduced, {...signal, symbol:'BNBUSDT'}, quote, at));
const budget = {...P.initial(), maxPositions:3, orderCash:600};
assert(P.buy(budget, signal, quote, at));
assert(!P.buy(budget, {...signal, symbol:'ETHUSDT'}, quote, at));
assert.equal(budget.cash, 400);
const writeFailure = P.monitor({state:P.initial(), persist() { throw Error('disk full'); }, onUpdate() {}});
assert.throws(() => writeFailure.setSettings(3, 50), /disk full/);

assert(!P.buy(P.initial(), signal, {...quote, askQty:.5}, at));
assert(!P.buy(P.initial(), signal, {...quote, bidQty:.5}, at));
const thin = {...quote, askQty:.5};
const evaluated = P.evaluateMarket(new Map([['BTCUSDT', setup]]), {BTCUSDT:thin}, new Map(), at);
assert.equal(evaluated.stats.liquidity, 1);
assert.equal(evaluated.signals.length, 0);
const small = {...P.initial(), orderCash:25.5};
assert(P.buy(small, signal, thin, at));
const stop = small.positions[0].stop;
assert(P.mark(small, {BTCUSDT:{...quote, bid:stop, ask:stop + .01, bidQty:.01, at:at+1000}}, at+1000));
assert.equal(small.positions[0].exitReason, 'Stop');
assert.equal(small.trades.length, 0);
const recovered = P.restore(JSON.stringify(small));
assert(P.mark(recovered, {BTCUSDT:{...quote, at:at+2000}}, at+2000));
assert.equal(recovered.positions.length, 0);
assert.equal(recovered.trades[0].reason, 'Stop');
assert(Math.abs(recovered.cash - 1000 - recovered.trades[0].pnl) < 1e-10);
console.log('PASS: 1/2/3-position settings, exact per-trade budget, legacy migration, persistent limit reduction, finite book quantity and delayed exits');

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
          .map(symbol => ({symbol,bidPrice:bid,askPrice:'106.12',bidQty:'10',askQty:'10'}))};
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

(async () => {
  let requestCount = 0;
  let receive;
  const engine = P.monitor({
    persist() { assert.fail('Rate-limited source must not write to the wallet.'); },
    now: () => at,
    get: async () => {
      requestCount++;
      return {status:429, ok:false, headers:new Map([['retry-after','95']])};
    },
    onUpdate: update => { if (update.error !== 'Tarama durdu.') receive(update); }
  });
  const runOnce = () => new Promise(resolve => {
    receive = resolve;
    engine.start();
  });
  const first = await runOnce();
  assert.match(first.error, /429/);
  engine.stop();
  const second = await runOnce();
  engine.stop();
  assert.match(second.error, /istek sınırı/);
  assert.equal(requestCount, 1);
  assert.equal(second.signals.length, 0);
  assert.deepEqual(second.quotes, {});
  console.log('PASS: 429 cooldown survives stop and start, failed data cannot create buys');
})().catch(error => { console.error(error); process.exitCode = 1; });
