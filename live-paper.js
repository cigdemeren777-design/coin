'use strict';
const LivePaper = (() => {
  const indicators = typeof Core === 'undefined' ? require('./core') : Core;
  const isUsdtSymbol = symbol => typeof symbol === 'string' && /^[\p{L}\p{N}]{1,40}USDT$/u.test(symbol);
  const historySize = 250;
  const hour = 3600000;
  const signalWindow = 5 * 60000;
  const pollInterval = 6000;
  const fee = .001, slip = .0005, initialCash = 1000;
  const defaultMaxPositions = 2, defaultOrderCash = 100;
  const exitReasons = new Set(['Stop', 'Hedef', 'Süre doldu']);
  const endpoint = 'https://data-api.binance.vision/api/v3/';
  const clockHour = now => Math.floor(now / hour) * hour;
  const number = value => typeof value === 'number' || (typeof value === 'string' && value.trim()) ?
    Number(value) : NaN;
  const initial = () => ({version: 1, cash: initialCash, positions: [], trades: [], seen: {},
    peak: initialCash, locked: false, maxPositions: defaultMaxPositions, orderCash: defaultOrderCash});

  function validSettings(maxPositions, orderCash) {
    const cents = Math.round(orderCash * 100);
    return [1, 2, 3].includes(maxPositions) && Number.isSafeInteger(cents) &&
      cents > 0 && orderCash === cents / 100;
  }

  function restore(raw) {
    const state = JSON.parse(raw);
    const validMoney = value => Number.isFinite(value) && value >= 0;
    if (state?.version !== 1 || !validMoney(state.cash) || !validMoney(state.peak) ||
        typeof state.locked !== 'boolean' || !Array.isArray(state.positions) ||
        !Array.isArray(state.trades) || !state.seen || typeof state.seen !== 'object' ||
        Array.isArray(state.seen) || state.positions.length > 3 ||
        new Set(state.positions.map(position => position?.symbol)).size !== state.positions.length ||
        state.positions.some(p => !isUsdtSymbol(p?.symbol) ||
          ![p.entry, p.qty, p.stop, p.target, p.cost, p.openedAt].every(x => validMoney(x) && x > 0) ||
          !(p.stop < p.entry && p.entry < p.target) ||
          (p.exitReason !== undefined && !exitReasons.has(p.exitReason)))) {
      throw Error('Sanal cüzdan kaydı geçersiz.');
    }
    const {maxPositions = defaultMaxPositions, orderCash = defaultOrderCash} = state;
    if (!validSettings(maxPositions, orderCash)) throw Error('Sanal cüzdan ayarları geçersiz.');
    return {...state, maxPositions, orderCash};
  }

  function setupFor(symbol, bars, now) {
    if (!isUsdtSymbol(symbol) || bars.length < historySize) return null;
    const last = bars.at(-1);
    const closedAt = last.t + hour;
    if (closedAt !== clockHour(now)) return null;
    if (bars.some((b, i) => ![b.t, b.o, b.h, b.l, b.c, b.v].every(Number.isFinite) ||
        b.l <= 0 || b.v < 0 || b.l > Math.min(b.o, b.c) || b.h < Math.max(b.o, b.c) ||
        (i > 0 && b.t - bars[i - 1].t !== hour))) return null;
    const data = indicators.prepare(bars);
    if (!(data.ema50.at(-1) > data.ema200.at(-1) && last.v > 0)) return null;
    const level = Math.max(...bars.slice(-20).map(bar => bar.h));
    return {symbol, closedAt, level, atr: data.atr.at(-1), risingTrend: data.ema50.at(-1) > data.ema50.at(-7)};
  }

  function signalFor(setup, quote, now, firstAbove) {
    if (!setup || setup.closedAt !== clockHour(now) || !usable(quote, now) ||
        quote.bid <= setup.level || !Number.isFinite(firstAbove) || firstAbove > now ||
        now - firstAbove >= signalWindow) return null;
    return {
      symbol: setup.symbol, closedAt: setup.closedAt, level: setup.level, close: setup.level,
      expires: Math.min(firstAbove + signalWindow, setup.closedAt + hour),
      distance: Math.max(setup.atr * 2, quote.ask * .008)
    };
  }

  function parseBars(rows, now, step = hour) {
    if (!Array.isArray(rows)) throw Error('Binance mum yanıtı geçersiz.');
    const bars = [];
    for (const row of rows) {
      if (!Array.isArray(row) || !Number.isSafeInteger(row[0]) || row[0] % step !== 0 ||
          row[6] !== row[0] + step - 1) throw Error('Binance mum zamanı geçersiz.');
      if (row[6] >= now) continue;
      const [o, h, l, c, v] = row.slice(1, 6).map(number);
      if (![o, h, l, c, v].every(Number.isFinite) || l <= 0 || h < Math.max(o, c) ||
          l > Math.min(o, c) || v < 0) throw Error('Binance mum fiyatı veya hacmi geçersiz.');
      bars.push({t:row[0], o, h, l, c, v});
    }
    return bars;
  }

  function parseUniverse(data) {
    if (!Array.isArray(data?.symbols)) throw Error('Binance parite listesi geçersiz.');
    const active = new Set(data.symbols.filter(row => row && row.status === 'TRADING' &&
      row.quoteAsset === 'USDT' && row.isSpotTradingAllowed === true && isUsdtSymbol(row.symbol))
      .map(row => row.symbol));
    if (!active.size) throw Error('Aktif Spot USDT paritesi bulunamadı.');
    return [...active].sort();
  }

  function parseQuotes(rows, at) {
    if (!Array.isArray(rows)) throw Error('Binance alış/satış fiyatı alınamadı.');
    return Object.fromEntries(rows.filter(row => row && isUsdtSymbol(row.symbol)).flatMap(row => {
      const quote = {bid: number(row.bidPrice), ask: number(row.askPrice),
        bidQty: number(row.bidQty), askQty: number(row.askQty), at};
      return usable(quote, at) ? [[row.symbol, quote]] : [];
    }));
  }

  function contiguous(bars, end) {
    return bars.length > 0 && bars.at(-1).t + hour === end &&
      bars.every((bar, index) => index === 0 || bar.t - bars[index - 1].t === hour);
  }

  function mergeBars(previous, latest, end) {
    const byTime = new Map([...previous, ...latest].map(bar => [bar.t, bar]));
    const joined = [...byTime.values()].sort((a, b) => a.t - b.t).slice(-historySize);
    return joined.length === historySize && contiguous(joined, end) ? joined : null;
  }

  function usable(quote, now) {
    return quote && Number.isFinite(quote.at) && now >= quote.at && now - quote.at <= 12000 &&
      Number.isFinite(quote.bid) && Number.isFinite(quote.ask) && quote.bid > 0 && quote.ask >= quote.bid;
  }

  function priceBlock(level, quote) {
    if ((quote.ask - quote.bid) / quote.ask > .002) return 'spread';
    if (quote.ask / level > 1.005) return 'distance';
    return null;
  }

  function entryTerms(quote, amount) {
    const entry = quote.ask * (1 + slip);
    return {entry, qty:amount / (entry * (1 + fee))};
  }

  const covers = (available, needed) => Number.isFinite(available) && available >= needed;
  function hasEntryLiquidity(quote, amount) {
    const {qty} = entryTerms(quote, amount);
    return qty > 0 && covers(quote.askQty, qty) && covers(quote.bidQty, qty);
  }

  function canSell(position, quote, now) {
    return usable(quote, now) && covers(quote.bidQty, position.qty);
  }

  function evaluateMarket(setups, quotes, firstEligible, at, amount = defaultOrderCash) {
    const signals = [], near = [];
    const stats = {trend:0, quoted:0, above:0, spread:0, distance:0, liquidity:0, expired:0};
    for (const [symbol, setup] of setups) {
      if (setup.closedAt !== clockHour(at)) continue;
      stats.trend++;
      const quote = quotes[symbol];
      if (!usable(quote, at)) continue;
      stats.quoted++;
      if (quote.bid <= setup.level) {
        firstEligible.delete(symbol);
        near.push({symbol, remainingPct:100 * (1 - quote.bid / setup.level)});
        continue;
      }
      stats.above++;
      const blocked = priceBlock(setup.level, quote);
      if (blocked) {
        stats[blocked]++;
        continue;
      }
      if (!firstEligible.has(symbol)) firstEligible.set(symbol, at);
      const signal = signalFor(setup, quote, at, firstEligible.get(symbol));
      if (!signal) stats.expired++;
      else if (!hasEntryLiquidity(quote, amount)) stats.liquidity++;
      else signals.push(signal);
    }
    signals.sort((a, b) => firstEligible.get(a.symbol) - firstEligible.get(b.symbol) ||
      (a.symbol < b.symbol ? -1 : 1));
    near.sort((a, b) => a.remainingPct - b.remainingPct);
    return {signals, stats:{...stats, near:near.slice(0, 3)}};
  }

  function canBuy(state, signal, quote, now) {
    if (!signal || signal.closedAt !== clockHour(now) || !Number.isFinite(signal.expires) || now >= signal.expires ||
        !usable(quote, now) || !Number.isFinite(signal.level) || quote.bid <= signal.level ||
        state.locked || state.cash < state.orderCash || state.positions.length >= state.maxPositions ||
        !isUsdtSymbol(signal.symbol) || state.positions.some(p => p.symbol === signal.symbol) ||
        state.seen[signal.symbol] >= signal.closedAt ||
        !Number.isFinite(signal.close) || signal.close <= 0 ||
        !Number.isFinite(signal.distance) || signal.distance <= 0 ||
        priceBlock(signal.level, quote) || !hasEntryLiquidity(quote, state.orderCash)) return false;
    return signal.distance < quote.ask * (1 + slip);
  }

  function buy(state, signal, quote, now) {
    if (!canBuy(state, signal, quote, now)) return false;
    const {entry, qty} = entryTerms(quote, state.orderCash);
    state.cash -= state.orderCash;
    state.positions.push({
      symbol: signal.symbol, entry, qty, cost: state.orderCash,
      stop: entry - signal.distance, target: entry + 2 * signal.distance, openedAt: now
    });
    state.seen[signal.symbol] = signal.closedAt;
    return true;
  }

  function sell(state, symbol, quote, now, reason = 'Elle çıkış') {
    const index = state.positions.findIndex(p => p.symbol === symbol);
    if (index < 0) return false;
    const position = state.positions[index];
    if (!canSell(position, quote, now)) return false;
    const exit = quote.bid * (1 - slip);
    const proceeds = exit * position.qty * (1 - fee);
    state.positions.splice(index, 1);
    state.cash += proceeds;
    state.trades.unshift({symbol, entry: position.entry, exit, cost: position.cost,
      pnl: proceeds - position.cost, at: now, reason: position.exitReason || reason});
    return true;
  }

  function mark(state, quotes, now) {
    let changed = false;
    for (const p of [...state.positions]) {
      const q = quotes[p.symbol];
      if (!usable(q, now)) continue;
      const reason = p.exitReason || (q.bid <= p.stop ? 'Stop' : q.bid >= p.target ? 'Hedef' :
        now - p.openedAt >= 48 * hour ? 'Süre doldu' : null);
      if (!reason) continue;
      if (sell(state, p.symbol, q, now, reason)) changed = true;
      else if (!p.exitReason) {
        p.exitReason = reason;
        changed = true;
      }
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
    let quotes = {}, signals = [], quoteDelay = pollInterval, busy = false, stopped = true;
    let marketDelayUntil = 0, timer, universe = [], universeAt = null, generation = 0;
    let scan = null, signalStats = null, lastError = null;
    const histories = new Map();
    const setups = new Map();
    const firstEligible = new Map();
    const report = (error = lastError) => {
      lastError = error;
      const timestamp = now();
      const valued = value(state, quotes, timestamp) !== null;
      onUpdate({
        state, quotes, signals, error,
        market: {
          symbols: universe, total: universe.length, quoted: Object.keys(quotes).length, checked: scan?.checked ?? 0,
          shortHistory: scan?.shortHistory ?? 0, failed: scan?.failed ?? 0, scanHour: scan?.hour ?? null,
          scanning: !!scan?.running,
          signalStats: signalStats && !error ? {
            ...signalStats, walletBlocked: signals.filter(signal =>
              !valued || !canBuy(state, signal, quotes[signal.symbol], timestamp)).length
          } : null
        }
      });
    };
    function evaluate() {
      const evaluated = evaluateMarket(setups, quotes, firstEligible, now(), state.orderCash);
      signals = evaluated.signals;
      signalStats = evaluated.stats;
    }
    const change = mutation => {
      const next = restore(JSON.stringify(state));
      if (!mutation(next)) return false;
      persist(next);
      state = next;
      return true;
    };
    async function query(path, params = {}) {
      if (now() < marketDelayUntil) throw Error('Binance istek sınırı. Yenileme bekliyor.');
      const queryString = new URLSearchParams(params).toString();
      const response = await get(endpoint + path + (queryString ? '?' + queryString : ''), {
        cache: 'no-store', signal: AbortSignal.timeout(7000)
      });
      if (response.status === 429 || response.status === 418) {
        const seconds = Number(response.headers.get('retry-after'));
        marketDelayUntil = now() + 1000 * Math.max(response.status === 418 ? 120 : 60, Number.isFinite(seconds) ? seconds : 0);
      }
      if (!response.ok) throw Error('Binance HTTP ' + response.status);
      return response.json();
    }

    async function refreshUniverse(token) {
      const updated = parseUniverse(await query('exchangeInfo', {permissions: 'SPOT', showPermissionSets: false}));
      if (stopped || token !== generation) return;
      const changed = universe.length !== updated.length || universe.some((symbol, i) => symbol !== updated[i]);
      universe = updated;
      universeAt = now();
      if (!changed) return;
      scan = null;
      const active = new Set(universe);
      signals = signals.filter(signal => active.has(signal.symbol));
      for (const symbol of histories.keys()) {
        if (!active.has(symbol)) {
          histories.delete(symbol);
          setups.delete(symbol);
          firstEligible.delete(symbol);
        }
      }
    }

    async function fetchHistory(symbol, end) {
      const load = async limit => parseBars(await query('klines', {
        symbol, interval: '1h', limit, endTime: end - 1
      }), now());
      const cached = histories.get(symbol);
      if (cached) {
        if (contiguous(cached, end)) return cached;
        const joined = mergeBars(cached, await load(3), end);
        if (joined) return joined;
      }
      const bars = await load(historySize);
      if (!contiguous(bars, end)) throw Error('Saatlik mum verisi eksik.');
      return bars;
    }

    async function scanMarket(run, pool, token) {
      const checkedAtStart = run.checked;
      let cursor = 0;
      let nextRequestAt = 0;
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      const valid = () => !stopped && token === generation && scan === run &&
        clockHour(now()) === run.hour && now() >= marketDelayUntil;
      async function lane() {
        while (cursor < pool.length && valid()) {
          const symbol = pool[cursor++];
          const scheduled = Math.max(Date.now(), nextRequestAt);
          nextRequestAt = scheduled + 100;
          if (scheduled > Date.now()) await delay(scheduled - Date.now());
          if (!valid()) return;
          try {
            const bars = await fetchHistory(symbol, run.hour);
            if (!valid()) return;
            if (bars.length < historySize) run.shortHistory++;
            else {
              histories.set(symbol, bars);
              const setup = setupFor(symbol, bars, now());
              if (setup) setups.set(symbol, setup);
              else setups.delete(symbol);
            }
          } catch (_) {
            if (valid()) run.failedSymbols.push(symbol);
          } finally {
            if (valid()) run.checked++;
          }
        }
      }
      await Promise.all(Array.from({length: 8}, lane));
      run.running = false;
      run.interrupted = run.checked - checkedAtStart < pool.length;
      run.failed = run.failedSymbols.length;
      run.retryAt = now() + 15000;
    }

    async function fetchQuotes() {
      const observedAt = now();
      const active = new Set(universe);
      const rows = await query('ticker/bookTicker');
      const market = parseQuotes(rows, observedAt);
      for (const symbol of Object.keys(market)) {
        if (!active.has(symbol)) delete market[symbol];
      }
      if (!Object.values(market).some(quote => usable(quote, now()))) {
        throw Error('Binance fiyat verisi eksik veya gecikti.');
      }
      return market;
    }

    async function tick() {
      if (busy || stopped) return;
      const token = generation;
      busy = true;
      try {
        const at = now();
        let listingError = null;
        if (universeAt === null || at - universeAt > 15 * 60000) {
          try { await refreshUniverse(token); }
          catch (error) {
            if (!universe.length) throw error;
            listingError = error.message;
          }
        }
        if (stopped || token !== generation) return;
        const currentHour = clockHour(now());
        if (!listingError && now() - currentHour >= 3000 &&
            (scan?.hour !== currentHour || (scan.interrupted && !scan.running))) {
          setups.clear();
          firstEligible.clear();
          scan = {hour: currentHour, running: true, checked: 0, failed: 0, shortHistory: 0,
            failedSymbols: [], retried: false};
          void scanMarket(scan, universe, token);
        } else if (!listingError && scan?.hour === currentHour && !scan.running &&
                   !scan.retried && scan.failed && now() >= scan.retryAt) {
          const retry = scan.failedSymbols;
          scan.failedSymbols = [];
          scan.checked -= retry.length;
          scan.retried = true;
          scan.running = true;
          void scanMarket(scan, retry, token);
        }
        const freshQuotes = await fetchQuotes();
        if (stopped || token !== generation) return;
        quotes = freshQuotes;
        change(next => mark(next, quotes, now()));
        if (!listingError) evaluate();
        else {
          signals = [];
          signalStats = null;
        }
        if (!listingError && automatic() && value(state, quotes, now()) !== null) {
          for (const signal of signals) change(next => buy(next, signal, quotes[signal.symbol], now()));
        }
        quoteDelay = pollInterval;
        report(listingError);
      } catch (error) {
        if (stopped || token !== generation) return;
        quotes = {};
        signals = [];
        firstEligible.clear();
        signalStats = null;
        quoteDelay = Math.min(30000, quoteDelay * 2);
        report(error.message);
      } finally {
        busy = false;
        if (!stopped) timer = setTimeout(tick, token !== generation ? 0 :
          Math.max(quoteDelay, marketDelayUntil - now()));
      }
    }

    return {
      start() { clearTimeout(timer); stopped = false; tick(); },
      stop() {
        stopped = true;
        generation++;
        clearTimeout(timer);
        quotes = {};
        signals = [];
        scan = null;
        setups.clear();
        firstEligible.clear();
        signalStats = null;
        report('Tarama durdu.');
      },
      buy(symbol) {
        const result = change(next => !stopped && !lastError && universe.includes(symbol) && universeAt !== null &&
          now() - universeAt <= 15 * 60000 && value(next, quotes, now()) !== null &&
          buy(next, signals.find(x => x.symbol === symbol), quotes[symbol], now()));
        report();
        return result;
      },
      sell(symbol) {
        const result = change(next => sell(next, symbol, quotes[symbol], now()));
        report();
        return result;
      },
      setSettings(maxPositions, orderCash) {
        if (!validSettings(maxPositions, orderCash)) throw Error('Geçerli bir sınır ve USDT tutarı gir.');
        change(next => {
          if (next.maxPositions === maxPositions && next.orderCash === orderCash) return false;
          next.maxPositions = maxPositions;
          next.orderCash = orderCash;
          return true;
        });
        if (!stopped && !lastError && Object.keys(quotes).length) evaluate();
        report();
      }
    };
  }

  return {isUsdtSymbol, hour, initial, restore, setupFor, signalFor, evaluateMarket, parseBars, parseUniverse, parseQuotes, mergeBars, canBuy, canSell, buy, sell, mark, value, usable, monitor};
})();
if (typeof module !== 'undefined') module.exports = LivePaper;
