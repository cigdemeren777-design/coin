'use strict';
const LivePaper = (() => {
  const indicators = typeof Core === 'undefined' ? require('./core') : Core;
  const symbols = Object.freeze(['BTCUSDT', 'ETHUSDT']);
  const hour = 3600000;
  const signalWindow = 5 * 60000;
  const fee = .001, slip = .0005, initialCash = 1000, orderCash = 100;
  const endpoint = 'https://data-api.binance.vision/api/v3/';
  const clockHour = now => Math.floor(now / hour) * hour;
  const initial = () => ({version: 1, cash: initialCash, positions: [], trades: [], seen: {}, peak: initialCash, locked: false});

  function restore(raw) {
    const state = JSON.parse(raw);
    const validMoney = value => Number.isFinite(value) && value >= 0;
    if (state?.version !== 1 || !validMoney(state.cash) || !validMoney(state.peak) ||
        typeof state.locked !== 'boolean' || !Array.isArray(state.positions) ||
        !Array.isArray(state.trades) || !state.seen || state.positions.length > 2 ||
        new Set(state.positions.map(position => position.symbol)).size !== state.positions.length ||
        state.positions.some(p => !symbols.includes(p.symbol) ||
          ![p.entry, p.qty, p.stop, p.target, p.cost, p.openedAt].every(x => validMoney(x) && x > 0))) {
      throw Error('Sanal cüzdan kaydı geçersiz.');
    }
    return state;
  }

  function candidate(symbol, bars, now) {
    if (!symbols.includes(symbol) || bars.length < 250) return null;
    const last = bars.at(-1);
    const closedAt = last.t + hour;
    if (closedAt !== clockHour(now) || now - closedAt >= signalWindow) return null;
    if (bars.some((b, i) => ![b.t, b.o, b.h, b.l, b.c, b.v].every(Number.isFinite) ||
        b.l <= 0 || b.v < 0 || b.l > Math.min(b.o, b.c) || b.h < Math.max(b.o, b.c) ||
        (i > 0 && b.t - bars[i - 1].t !== hour))) return null;
    const data = indicators.prepare(bars);
    if (!(data.ema50.at(-1) > data.ema200.at(-1) && last.c > data.hh.at(-1) && last.v > 0)) return null;
    const distance = Math.max(data.atr.at(-1) * 2, last.c * .008);
    return {symbol, closedAt, expires: closedAt + signalWindow, close: last.c, distance};
  }

  function parseBars(rows, now) {
    if (!Array.isArray(rows)) throw Error('Binance mum yanıtı geçersiz.');
    return rows.filter(row => Array.isArray(row) && row[6] < now && row[6] === row[0] + hour - 1)
      .map(row => ({t: row[0], ...Object.fromEntries('ohlcv'.split('').map((key, i) => [key, Number(row[i + 1])]))}));
  }

  function parseQuotes(rows, at) {
    if (!Array.isArray(rows)) throw Error('Binance alış/satış fiyatı alınamadı.');
    const quotes = Object.fromEntries(rows.filter(row => symbols.includes(row.symbol)).map(row =>
      [row.symbol, {bid: Number(row.bidPrice), ask: Number(row.askPrice), at}]));
    if (!symbols.every(symbol => usable(quotes[symbol], at))) throw Error('Binance fiyat verisi eksik.');
    return quotes;
  }

  function usable(quote, now) {
    return quote && Number.isFinite(quote.at) && now >= quote.at && now - quote.at <= 12000 &&
      Number.isFinite(quote.bid) && Number.isFinite(quote.ask) && quote.bid > 0 && quote.ask >= quote.bid;
  }

  function buy(state, signal, quote, now) {
    if (!signal || now < signal.closedAt || now >= signal.expires || !usable(quote, now) ||
        state.locked || state.cash < orderCash || state.positions.length >= 2 ||
        !symbols.includes(signal.symbol) || state.positions.some(p => p.symbol === signal.symbol) ||
        state.seen[signal.symbol] >= signal.closedAt ||
        !Number.isFinite(signal.distance) || signal.distance <= 0 ||
        quote.ask / signal.close > 1.005 || (quote.ask - quote.bid) / quote.ask > .002) return false;
    const entry = quote.ask * (1 + slip);
    if (signal.distance >= entry) return false;
    state.cash -= orderCash;
    state.positions.push({
      symbol: signal.symbol, entry, qty: orderCash / (entry * (1 + fee)), cost: orderCash,
      stop: entry - signal.distance, target: entry + 2 * signal.distance, openedAt: now
    });
    state.seen[signal.symbol] = signal.closedAt;
    return true;
  }

  function sell(state, symbol, quote, now, reason = 'Elle çıkış') {
    const index = state.positions.findIndex(p => p.symbol === symbol);
    if (index < 0 || !usable(quote, now)) return false;
    const position = state.positions[index];
    const exit = quote.bid * (1 - slip);
    const proceeds = exit * position.qty * (1 - fee);
    state.positions.splice(index, 1);
    state.cash += proceeds;
    state.trades.unshift({symbol, entry: position.entry, exit, pnl: proceeds - position.cost, at: now, reason});
    return true;
  }

  function mark(state, quotes, now) {
    let changed = false;
    for (const p of [...state.positions]) {
      const q = quotes[p.symbol];
      if (!usable(q, now)) continue;
      const reason = q.bid <= p.stop ? 'Stop' : q.bid >= p.target ? 'Hedef' :
        now - p.openedAt >= 48 * hour ? 'Süre doldu' : null;
      if (reason) changed = sell(state, p.symbol, q, now, reason) || changed;
    }
    const equity = value(state, quotes, now);
    if (equity !== null && equity > state.peak) {
      state.peak = equity;
      changed = true;
    }
    if (!state.locked && equity !== null && equity <= state.peak * .9) {
      state.locked = true;
      changed = true;
    }
    return changed;
  }

  function value(state, quotes, now) {
    if (state.positions.some(p => !usable(quotes[p.symbol], now))) return null;
    return state.cash + state.positions.reduce((sum, p) =>
      sum + p.qty * quotes[p.symbol].bid * (1 - slip) * (1 - fee), 0);
  }

  function monitor({persist, state = initial(), onUpdate, automatic = () => false, get = fetch, now = Date.now}) {
    let quotes = {}, signals = [], lastHour = -1, quoteDelay = 4000, busy = false;
    let marketDelayUntil = 0, nextBarTry = 0, timer, stopped = false;
    const report = error => onUpdate({state, quotes, signals, error});
    const change = mutation => {
      const next = restore(JSON.stringify(state));
      if (!mutation(next)) return false;
      persist(next);
      state = next;
      return true;
    };
    async function query(path, params) {
      if (now() < marketDelayUntil) throw Error('Binance istek sınırı. Yenileme bekliyor.');
      const response = await get(endpoint + path + '?' + new URLSearchParams(params), {
        cache: 'no-store', signal: AbortSignal.timeout(7000)
      });
      if (response.status === 429 || response.status === 418) {
        const seconds = Number(response.headers.get('retry-after'));
        marketDelayUntil = now() + 1000 * Math.max(response.status === 418 ? 120 : 60, Number.isFinite(seconds) ? seconds : 0);
      }
      if (!response.ok) throw Error('Binance HTTP ' + response.status);
      return response.json();
    }
    async function tick() {
      if (busy || stopped) return;
      busy = true;
      try {
        const raw = await query('ticker/bookTicker', {symbols: JSON.stringify(symbols)});
        const at = now();
        quotes = parseQuotes(raw, at);
        if (stopped) return;
        change(next => mark(next, quotes, at));
        report(null);
        const currentHour = clockHour(at);
        if (currentHour !== lastHour && at >= nextBarTry) {
          nextBarTry = at + 30000;
          const result = await Promise.all(symbols.map(async symbol =>
            parseBars(await query('klines', {symbol, interval: '1h', limit: 300, endTime: currentHour - 1}), now())));
          if (stopped) return;
          if (result.some(bars => bars.length < 250 || bars.at(-1).t + hour !== currentHour ||
              bars.some((bar, i) => i && bar.t - bars[i - 1].t !== hour))) throw Error('Kapanmış saatlik mumlar eksik.');
          signals = symbols.map((symbol, i) => candidate(symbol, result[i], now())).filter(Boolean);
          lastHour = currentHour;
        }
        signals = signals.filter(signal => now() < signal.expires);
        if (automatic()) {
          for (const signal of signals) change(next => buy(next, signal, quotes[signal.symbol], now()));
        }
        quoteDelay = 4000;
        report(null);
      } catch (error) {
        quotes = {};
        quoteDelay = Math.min(30000, quoteDelay * 2);
        report(error.message);
      } finally {
        busy = false;
        if (!stopped) timer = setTimeout(tick, Math.max(quoteDelay, marketDelayUntil - now()));
      }
    }
    return {
      start() { clearTimeout(timer); stopped = false; tick(); },
      stop() { stopped = true; clearTimeout(timer); quotes = {}; report('Tarama durdu.'); },
      buy(symbol) {
        const result = change(next => buy(next, signals.find(x => x.symbol === symbol), quotes[symbol], now()));
        report(null);
        return result;
      },
      sell(symbol) {
        const result = change(next => sell(next, symbol, quotes[symbol], now()));
        report(null);
        return result;
      }
    };
  }

  return {symbols, hour, initial, restore, candidate, parseBars, parseQuotes, buy, sell, mark, value, usable, monitor};
})();
if (typeof module !== 'undefined') module.exports = LivePaper;
