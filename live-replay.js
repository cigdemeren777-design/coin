'use strict';
// Approximate the intrahour scanner with closed 5-minute bars and a synthetic book.
const LiveReplay = (() => {
  const paper = typeof LivePaper === 'undefined' ? require('./live-paper') : LivePaper;
  const research = typeof Research === 'undefined' ? require('./research') : Research;
  const step = 5 * 60000;
  const warmup = 250;
  const assumedSpread = .001;

  function quote(mid, at) {
    return {bid:mid * (1 - assumedSpread / 2), ask:mid * (1 + assumedSpread / 2),
      bidQty:Number.MAX_VALUE, askQty:Number.MAX_VALUE, at};
  }

  function replay(hourly, fine, symbols, from, until, risingTrend) {
    const state = paper.initial();
    const setups = new Map(), firstEligible = new Map();
    const first = (from - fine[symbols[0]][0].t) / step;
    const end = (until - fine[symbols[0]][0].t) / step;
    let setupHour = null, pending = [], maxDrawdown = 0, equity = state.cash;

    function observe(prices, at) {
      paper.mark(state, prices, at);
      equity = paper.value(state, prices, at);
      maxDrawdown = Math.max(maxDrawdown, 1 - equity / state.peak);
    }

    for (let i = first; i < end; i++) {
      const at = fine[symbols[0]][i].t;
      const open = Object.fromEntries(symbols.map(symbol => [symbol, quote(fine[symbol][i].o, at)]));
      observe(open, at);
      for (const signal of pending) paper.buy(state, signal, open[signal.symbol], at);

      const hour = Math.floor(at / paper.hour) * paper.hour;
      if (hour !== setupHour) {
        setupHour = hour;
        setups.clear();
        firstEligible.clear();
        for (const symbol of symbols) {
          const bars = hourly[symbol];
          const boundary = (hour - bars[0].t) / paper.hour;
          const setup = paper.setupFor(symbol, bars.slice(boundary - warmup, boundary), at);
          if (setup && (!risingTrend || setup.risingTrend)) setups.set(symbol, setup);
        }
      }

      const closeAt = at + step - 1;
      for (const position of [...state.positions]) {
        const bar = fine[position.symbol][i];
        const stopHit = quote(bar.l, closeAt).bid <= position.stop;
        const targetHit = quote(bar.h, closeAt).bid >= position.target;
        if (stopHit || targetHit) {
          const bid = stopHit ? position.stop : position.target;
          paper.sell(state, position.symbol, {bid, ask:bid, bidQty:Number.MAX_VALUE, at:closeAt},
            closeAt, stopHit ? 'Stop' : 'Hedef');
        }
      }
      const close = Object.fromEntries(symbols.map(symbol => [symbol, quote(fine[symbol][i].c, closeAt)]));
      observe(close, closeAt);
      pending = paper.evaluateMarket(setups, close, firstEligible, closeAt, state.orderCash).signals;
    }

    const trades = state.trades.length;
    const wins = state.trades.filter(trade => trade.pnl > 0).length;
    const realized = state.trades.reduce((total, trade) => total + trade.pnl, 0);
    return {from, until, trades, wins, winRate:trades ? 100 * wins / trades : null,
      expectancy:trades ? realized / trades : null, maxDrawdownPct:100 * maxDrawdown,
      returnPct:100 * (equity / paper.initial().cash - 1), openPositions:state.positions.length,
      ledger:state.trades, equity, cash:state.cash};
  }

  function compare(hourly, fine) {
    const symbols = research.validate(hourly, paper.hour);
    if (research.validate(fine, step).join(',') !== symbols.join(',')) throw Error('Mum pariteleri eşleşmiyor.');
    const start = fine[symbols[0]][0].t;
    const until = fine[symbols[0]].at(-1).t + step;
    const holdout = Math.floor((start + .7 * (until - start)) / paper.hour) * paper.hour;
    const hours = hourly[symbols[0]];
    if (start % paper.hour || until % paper.hour ||
        hours[0].t % paper.hour || start - hours[0].t < warmup * paper.hour ||
        hours.at(-1).t + paper.hour < until || holdout <= start || holdout >= until) {
      throw Error('Test aralığı veya 250 saatlik gösterge geçmişi eksik.');
    }
    const runPeriod = (from, to) => ({base:replay(hourly, fine, symbols, from, to, false),
      emaSlope:replay(hourly, fine, symbols, from, to, true)});
    return {symbols, start, holdout, until, assumedSpread, initialCash:paper.initial().cash,
      orderCash:paper.initial().orderCash, maxPositions:paper.initial().maxPositions,
      development:runPeriod(start, holdout), test:runPeriod(holdout, until)};
  }

  return {compare, step};
})();
if (typeof module !== 'undefined') module.exports = LiveReplay;
