'use strict';
const MarketChartData = (() => {
  const intervals = new Set(['1m', '5m', '15m', '1h', '4h', '1d', '1w']);
  const symbol = value => {
    const normalized = String(value).trim().replace(/[\s/]/g, '').toUpperCase();
    const pair = normalized.endsWith('USDT') ? normalized : normalized + 'USDT';
    return /^[\p{L}\p{N}]{1,40}USDT$/u.test(pair) ? pair : null;
  };

  function parse(raw) {
    if (!Array.isArray(raw) || !raw.length) throw Error('Mum verisi boş.');
    let last = -1;
    return raw.map(row => {
      if (!Array.isArray(row) || row.length < 7) throw Error('Mum biçimi geçersiz.');
      const [opened, open, high, low, close, volume, ends] = row.slice(0, 7).map(Number);
      if (![opened, open, high, low, close, volume, ends].every(Number.isFinite) ||
          !Number.isSafeInteger(opened) || opened <= last || opened % 1000 || ends < opened ||
          low <= 0 || low > Math.min(open, close) || high < Math.max(open, close) || volume < 0) {
        throw Error('Mum verisi geçersiz veya sırasız.');
      }
      last = opened;
      return {time: opened / 1000, open, high, low, close, volume, ends};
    });
  }

  function merge(history, updates) {
    const byTime = new Map([...history, ...updates].map(bar => [bar.time, bar]));
    return [...byTime.values()].sort((a, b) => a.time - b.time).slice(-300);
  }

  function ema(bars, length) {
    if (bars.length < length) return [];
    let value = bars.slice(0, length).reduce((sum, bar) => sum + bar.close, 0) / length;
    const weight = 2 / (length + 1);
    const points = [{time: bars[length - 1].time, value}];
    for (let index = length; index < bars.length; index++) {
      value += (bars[index].close - value) * weight;
      points.push({time: bars[index].time, value});
    }
    return points;
  }

  return {intervals, symbol, parse, merge, ema};
})();
if (typeof module !== 'undefined') module.exports = MarketChartData;

if (typeof document !== 'undefined') (() => {
  const el = id => document.getElementById(id);
  const input = el('chart-symbol');
  const container = el('candle-chart');
  const status = el('chart-status');
  const frames = [...el('chart-timeframes').querySelectorAll('button')];
  const endpoint = 'https://data-api.binance.vision/api/v3/klines';
  const up = '#1fc77e', down = '#f0506e';
  let current = 'BTCUSDT', interval = '1h', bars = [], timer, request, sequence = 0;
  let rateLimitUntil = 0;
  let chart, candles, volume, ema20, ema50, lines = [], paperPositions = [], positionSignature = '';
  const date = new Intl.DateTimeFormat('tr-TR', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Istanbul'});
  const precision = price => price >= 100 ? 2 : price >= 1 ? 4 : price >= .01 ? 6 : price >= .0001 ? 8 : 10;
  const format = price => price.toLocaleString('tr-TR', {maximumFractionDigits: precision(price)});

  function showBar(bar) {
    if (!bar) return;
    el('chart-ohlc').textContent = 'Açılış ' + format(bar.open) + ' · Yüksek ' + format(bar.high) +
      ' · Düşük ' + format(bar.low) + ' · Kapanış ' + format(bar.close) + ' · ' + date.format(bar.time * 1000);
  }

  function ensureChart() {
    if (chart) return;
    if (!window.LightweightCharts) throw Error('Grafik kütüphanesi yüklenemedi.');
    chart = window.LightweightCharts.createChart(container, {
      width: container.clientWidth, height: container.clientHeight,
      layout: {background:{color:'#0e141b'}, textColor:'#a1afbd'},
      grid: {vertLines:{color:'#1b232d'}, horzLines:{color:'#1b232d'}},
      rightPriceScale: {borderColor:'#26323f', scaleMargins:{top:.08,bottom:.24}},
      timeScale: {borderColor:'#26323f', timeVisible:true, secondsVisible:false, rightOffset:3},
      localization: {locale:'tr-TR', timeFormatter: time => date.format(time * 1000)},
      handleScroll: {vertTouchDrag:false}
    });
    candles = chart.addCandlestickSeries({upColor:up, downColor:down, wickUpColor:up, wickDownColor:down, borderVisible:false});
    volume = chart.addHistogramSeries({priceScaleId:'volume', priceFormat:{type:'volume'}, priceLineVisible:false, lastValueVisible:false});
    chart.priceScale('volume').applyOptions({scaleMargins:{top:.8,bottom:0}});
    const line = color => chart.addLineSeries({color, lineWidth:1, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false});
    ema20 = line('#f5b041');
    ema50 = line('#73adff');
    chart.subscribeCrosshairMove(event => showBar(bars.find(bar => bar.time === event.time) || bars.at(-1)));
    const resize = () => chart.resize(container.clientWidth, container.clientHeight);
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(container);
    else window.addEventListener('resize', resize);
  }

  function drawPositions(force = false) {
    if (!candles) return;
    const p = paperPositions.find(position => position.symbol === current);
    const signature = p ? [current, p.entry, p.stop, p.target].join('|') : '';
    if (!force && signature === positionSignature) return;
    positionSignature = signature;
    lines.forEach(line => candles.removePriceLine(line));
    lines = [];
    if (!p || !bars.length) return;
    for (const [price, color, title] of [[p.entry, '#73adff', 'Sanal giriş'], [p.stop, down, 'Stop'], [p.target, up, 'Hedef']]) {
      if (Number.isFinite(price)) lines.push(candles.createPriceLine({price, color, title, lineWidth:1, lineStyle:2, axisLabelVisible:true}));
    }
  }

  function draw(reset) {
    const last = bars.at(-1);
    const digits = precision(last.close);
    candles.applyOptions({priceFormat:{type:'price', precision:digits, minMove:10 ** -digits}});
    candles.setData(bars.map(({time, open, high, low, close}) => ({time, open, high, low, close})));
    volume.setData(bars.map(bar => ({time:bar.time, value:bar.volume, color:bar.close >= bar.open ? 'rgba(31,199,126,.45)' : 'rgba(240,80,110,.45)'})));
    ema20.setData(MarketChartData.ema(bars, 20));
    ema50.setData(MarketChartData.ema(bars, 50));
    if (reset) {
      chart.applyOptions({timeScale:{timeVisible:interval !== '1d' && interval !== '1w'}});
      chart.timeScale().setVisibleLogicalRange({from:Math.max(0, bars.length - (container.clientWidth < 550 ? 42 : 82)), to:bars.length + 2});
    }
    el('chart-price').textContent = current.slice(0, -4) + '/USDT · ' + format(last.close);
    showBar(last);
    drawPositions(reset);
  }

  async function load(reset = false) {
    if (document.hidden) return;
    const token = sequence;
    const previous = request;
    if (previous) previous.abort();
    const controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 9000);
    let delay = 10000;
    try {
      if (Date.now() < rateLimitUntil) throw Error('Binance istek sınırı. Yenileme bekliyor.');
      const incremental = !reset && bars.length;
      const query = new URLSearchParams({symbol:current, interval, limit:incremental ? '4' : '300'});
      const response = await fetch(endpoint + '?' + query, {cache:'no-store', signal:controller.signal});
      if (response.status === 429 || response.status === 418) {
        const seconds = Number(response.headers.get('Retry-After'));
        rateLimitUntil = Date.now() + Math.max(response.status === 418 ? 120 : 60, Number.isFinite(seconds) ? seconds : 0) * 1000;
      }
      if (!response.ok) throw Error('Binance HTTP ' + response.status);
      const updates = MarketChartData.parse(await response.json());
      if (token !== sequence || request !== controller) return;
      if (incremental && updates[0].time > bars.at(-1).time) {
        bars = [];
        status.textContent = 'Aradaki mumlar yeniden yükleniyor…';
        delay = 100;
        return;
      }
      ensureChart();
      bars = incremental ? MarketChartData.merge(bars, updates) : updates;
      draw(!incremental);
      const last = bars.at(-1);
      status.textContent = 'Binance Spot · ' + (last.ends >= Date.now() ? 'Son mum açık' : 'Son mum kapanmış') +
        ' · Alınma ' + date.format(Date.now()) + ' (TSİ)';
    } catch (error) {
      if (token !== sequence || request !== controller) return;
      status.textContent = 'Grafik güncellenemedi. ' + (error.name === 'AbortError' ? 'Bağlantı zaman aşımı.' : error.message);
      delay = 20000;
    } finally {
      clearTimeout(timeout);
      if (token === sequence && request === controller && !document.hidden) {
        request = null;
        timer = setTimeout(load, Math.max(delay, rateLimitUntil - Date.now()));
      }
    }
  }

  function open(value, frame = interval, focus = false) {
    const symbol = MarketChartData.symbol(value);
    if (!symbol || !MarketChartData.intervals.has(frame)) {
      status.textContent = 'Geçerli bir USDT paritesi gir. Örnek: SOL veya SOLUSDT.';
      return;
    }
    current = symbol;
    interval = frame;
    input.value = symbol;
    sequence++;
    if (request) request.abort();
    clearTimeout(timer);
    bars = [];
    if (chart) {
      drawPositions(true);
      [candles, volume, ema20, ema50].forEach(series => series.setData([]));
    }
    el('chart-price').textContent = symbol.slice(0, -4) + '/USDT · —';
    el('chart-ohlc').textContent = 'Açılış — · Yüksek — · Düşük — · Kapanış —';
    for (const button of frames) button.setAttribute('aria-pressed', String(button.dataset.timeframe === interval));
    status.textContent = 'Binance mumları yükleniyor…';
    load(true);
    if (focus) el('market-chart').scrollIntoView({block:'start', behavior:'smooth'});
  }

  el('chart-load').addEventListener('click', () => open(input.value));
  input.addEventListener('keydown', event => { if (event.key === 'Enter') open(input.value); });
  for (const button of frames) button.addEventListener('click', () => open(input.value, button.dataset.timeframe));
  document.addEventListener('coin-chart-open', event => open(event.detail, interval, true));
  document.addEventListener('coin-chart-state', event => {
    paperPositions = event.detail.positions;
    drawPositions();
    if (event.detail.symbols) {
      el('chart-pairs').replaceChildren(...event.detail.symbols.map(value => {
        const option = document.createElement('option');
        option.value = value;
        return option;
      }));
    }
  });
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (document.hidden) {
      sequence++;
      if (request) request.abort();
    } else load();
  });
  open(current);
})();
