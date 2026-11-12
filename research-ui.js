const el = id => document.getElementById(id);
const format = number => number == null ? '—' : number.toLocaleString('tr-TR', {maximumFractionDigits: 2});
const day = time => new Date(time).toISOString().slice(0, 10);
let current = null;
let report = null;


function element(tag, text, parent) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (parent) parent.append(node);
  return node;
}

async function request(url) {
  const response = await fetch(url, {cache: 'no-store', signal: AbortSignal.timeout(45000)});
  const result = await response.json();
  if (!response.ok) throw Error(result.detail || 'HTTP ' + response.status);
  return result;
}

function renderTable(parent, headers, rows) {
  const scroll = element('div', null, parent);
  scroll.className = 'scroll';
  const table = element('table', null, scroll);
  const head = table.createTHead().insertRow();
  headers.forEach(value => element('th', value, head).scope = 'col');
  const body = table.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    row.forEach(value => tr.insertCell().textContent = value);
  }
}

function equityChart(parent, model) {
  const canvas = element('canvas', null, parent);
  canvas.width = 720;
  canvas.height = 190;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Teknik strateji sanal portföy değeri, USDT');
  const context = canvas.getContext('2d');
  if (!context) return;
  const values = [model.settings.capital, ...model.curve.map(point => point.equity)];
  const min = values.reduce((a, b) => Math.min(a, b));
  const max = values.reduce((a, b) => Math.max(a, b));
  context.fillStyle = '#e2e8f0';
  context.font = '15px system-ui';
  context.fillText('Sanal portföy değeri (USDT)', 12, 20);
  context.fillText(format(max), 12, 43);
  context.fillText(format(min), 12, 170);
  context.strokeStyle = '#82ebd5';
  context.lineWidth = 2;
  context.beginPath();
  values.forEach((value, index) => {
    const x = 90 + 618 * index / (values.length - 1);
    const y = 43 + 127 * (max === min ? .5 : (max - value) / (max - min));
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
}

function render(data, news, origin) {
  if (!Array.isArray(news)) throw Error('Haber alanı dizi olmalı.');
  const comparison = Research.compare(data, {}, news);
  const available = comparison.technical.candidates.some(candidate => candidate.negative);
  current = { data, news, origin };
  report = { origin, portfolio: comparison };
  const results = el('results');
  const rows = [['Teknik', comparison.technical], ['Son %30 · teknik', comparison.holdout]];
  if (available) rows.push(['Haber filtresi · içe aktarılan kayıt', comparison.newsFiltered]);
  results.replaceChildren();
  renderTable(results, ['Model', 'Getiri %', 'Azami düşüş %', 'İşlem', 'Al-tut %'],
    rows.map(([label, r]) => [label, format(r.returnPct), format(r.maxDrawdownPct), r.trades, format(r.benchmarkPct)]));
  equityChart(results, comparison.technical);
  element('p', 'Kayma stresi · ' + comparison.stress.map(r =>
    '%' + format(r.settings.slip * 100) + ' / yan: %' + format(r.returnPct) + ' net getiri'
  ).join(' · '), results);
  if (!available) element('p', 'Haber karşılaştırması atlandı. Teknik girişlerde karar anına uygun negatif kayıt yok.', results);
  el('status').textContent = origin + ' · ' + comparison.note;
  el('export').disabled = false;
  el('experiment').disabled = false;
  el('folds').replaceChildren();
  el('experiment-status').textContent = 'Veri hazır.';

}

async function digest(value) {
  if (!globalThis.crypto?.subtle) return null;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function runExperiment() {
  const input = current;
  el('experiment').disabled = true;
  el('experiment-status').textContent = 'İleri dönemler hesaplanıyor…';
  try {
    const result = Experiments.run(input.data, input.news, {windowHours: Number(el('window').value)});
    const market = result.symbols.map(symbol => [symbol, input.data[symbol].map(bar =>
      [bar.t, bar.o, bar.h, bar.l, bar.c, bar.v]
    )]);
    result.dataHash = await digest([market, input.news]);
    result.codeHash = null;
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      try {
        const sources = await Promise.all(['core.js', 'research.js', 'experiments.js'].map(async file => {
          const response = await fetch(file, {cache: 'no-store'});
          if (!response.ok) throw Error('Kaynak özeti alınamadı.');
          return [file, await response.text()];
        }));
        result.codeHash = await digest(sources);
      } catch (_) {}
    }
    if (input !== current) return;
    const windows = result.folds.map(fold => [fold.test.from, fold.test.until].join('/'));
    let previouslyTested = false;
    try {
      const key = 'coin-tested-periods-v7';
      const previous = JSON.parse(localStorage.getItem(key) || '[]');
      previouslyTested = windows.some(period => {
        const [start, end] = period.split('/').map(Number);
        return previous.some(entry => {
          const [oldStart, oldEnd] = entry.split('/').map(Number);
          return start < oldEnd && end > oldStart;
        });
      });
      localStorage.setItem(key, JSON.stringify([...new Set([...previous, ...windows])].slice(-2000)));
    } catch (_) {}
    report.experiment = result;
    const output = el('folds');
    output.replaceChildren();
    renderTable(output, ['Test aralığı (UTC)', 'Seçilen kural', 'Teknik %', 'Düşüş %', 'İşlem', 'Al-tut %', 'Rastgele %', 'Haber %'],
      result.folds.map(fold => [
        day(fold.test.from) + ' → ' + day(fold.test.until),
        Experiments.labels[fold.hypothesis] + (fold.usedFallback ? ' (varsayılan)' : ''),
        format(fold.technical.returnPct), format(fold.technical.maxDrawdownPct), fold.technical.trades,
        format(fold.technical.benchmarkPct), format(fold.random?.returnPct), format(fold.news?.returnPct)
      ]));
    const interval = result.bootstrapNewsVsTechnical;
    element('p', interval
      ? 'Haber – teknik getiri farkı için keşif amaçlı %95 blok bootstrap aralığı: ' +
        format(interval.lower) + ' ile ' + format(interval.upper) + ' yüzde puan.'
      : 'Bootstrap aralığı için en az üç haberli test penceresi gerekir.', output);
    el('experiment-status').textContent = input.origin + ' · ' + result.folds.length + ' test penceresi.' +
      (previouslyTested ? ' Bu tarayıcı daha önce çakışan bir test aralığını çalıştırdı.' : '');
  } catch (error) {
    el('experiment-status').textContent = 'Deney yapılamadı. ' + error.message;
  } finally {
    el('experiment').disabled = !current;
  }
}

const researchHour = 3600000;
const researchPairs = ['BTCUSDT', 'ETHUSDT'];
let baseSnapshot, refreshedHour, autoResearch = true, researchTimer;

function snapshotFrom(source) {
  if (source.schema !== 1 || source.source !== 'Binance Spot' ||
      !Number.isSafeInteger(source.until) || source.until > Date.now() ||
      source.until % researchHour || !Number.isFinite(source.fetchedAt) ||
      source.fetchedAt < source.until || source.fetchedAt > Date.now() + 60000) {
    throw Error('Paket biçimi veya zamanı geçersiz.');
  }
  for (const symbol of researchPairs) {
    const bars = source.data?.[symbol];
    if (bars?.length !== 3000 || bars.at(-1).t + researchHour !== source.until) {
      throw Error(symbol + ' için paket eksik veya kapanış saati uyuşmuyor.');
    }
  }
  Research.validate(source.data, researchHour);
  return source;
}

async function getClosedBars(symbol, limit, endTime, interval = '1h', step = researchHour) {
  const q = new URLSearchParams({symbol, interval, limit, endTime});
  return LivePaper.parseBars(await request('https://data-api.binance.vision/api/v3/klines?' + q), Date.now(), step);
}

function enableLiveReplay() {
  const status = el('live-replay-status');
  if (status.textContent === 'Binance saatlik geçmişi bekleniyor.') {
    el('live-replay-run').disabled = false;
    status.textContent = 'Binance verisi hazır.';
  }
}

async function runLiveReplay() {
  const snapshot = baseSnapshot;
  const button = el('live-replay-run');
  const status = el('live-replay-status');
  const output = el('live-replay-results');
  if (!snapshot) return;
  button.disabled = true;
  status.textContent = 'Binance 5 dakikalık mumları yükleniyor…';
  try {
    const perSymbol = 28 * 24 * researchHour / LiveReplay.step;
    const fine = Object.fromEntries(await Promise.all(researchPairs.map(async symbol => {
      let bars = [], end = snapshot.until - 1;
      while (bars.length < perSymbol) {
        const size = Math.min(1000, perSymbol - bars.length);
        const page = await getClosedBars(symbol, size, end, '5m', LiveReplay.step);
        if (page.length !== size || page.at(-1).t + LiveReplay.step !== end + 1) {
          throw Error(symbol + ' için 5 dakikalık veri eksik.');
        }
        bars = page.concat(bars);
        end = page[0].t - 1;
      }
      return [symbol, bars];
    })));
    const result = LiveReplay.compare(snapshot.data, fine);
    if (report) report.liveReplay = result;
    const rows = [];
    for (const [period, models] of [['İlk %70', result.development], ['Son %30 · test', result.test]]) {
      for (const [label, model] of [['Canlı kural', models.base], ['EMA50 eğim filtresi', models.emaSlope]]) {
        rows.push([period, label, model.trades, format(model.winRate), format(model.expectancy),
          format(model.returnPct), format(model.maxDrawdownPct), model.openPositions]);
      }
    }
    output.replaceChildren();
    renderTable(output, ['Dönem', 'Kural', 'Kapanan', 'Kârla kapanan %', 'Ort. net USDT', 'Getiri %', 'Düşüş %', 'Açık'], rows);
    element('p', 'Model 1.000 USDT ile başlar ve en fazla iki adet 100 USDT sanal işlem açar. ' +
      'Ücret ve kaymaya ek olarak %0,10 alış-satış farkı varsayılır. 5 dakikalık kapanışta görülen aday ' +
      'sonraki mumun açılışında fiyat koşullarıyla yeniden kontrol edilir. Tarihsel emir defteri yoktur. ' +
      'Getiri açık pozisyonları içerir. Kârla kapanan oranı kapanmış işlemlerden hesaplanır.', output);
    const date = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
    status.textContent = 'Binance Spot · ' + date(result.start) + ' → ' + date(result.until) +
      ' UTC · Test başlangıcı ' + date(result.holdout) + ' UTC.';
  } catch (error) {
    status.textContent = 'Canlı model testi tamamlanamadı. ' + error.message +
      (output.children.length ? ' Önceki test tablosu ekranda.' : '');
  } finally {
    button.disabled = false;
  }
}
el('live-replay-run').onclick = runLiveReplay;

async function updateFromBinance(base, until) {
  const data = Object.fromEntries(await Promise.all(researchPairs.map(async symbol => {
    const delta = base ? (until - base.until) / researchHour : Infinity;
    let bars;
    if (delta >= 0 && delta < 1000) {
      const latest = await getClosedBars(symbol, Math.max(1, delta), until - 1);
      const combined = new Map([...base.data[symbol], ...latest].map(bar => [bar.t, bar]));
      bars = [...combined.values()].sort((a, b) => a.t - b.t).slice(-3000);
    } else {
      bars = [];
      let end = until - 1;
      for (let i = 0; i < 3; i++) {
        const page = await getClosedBars(symbol, 1000, end);
        if (page.length !== 1000) throw Error('Binance geçmiş mumları eksik.');
        bars = page.concat(bars);
        end = page[0].t - 1;
      }
    }
    return [symbol, bars];
  })));
  return snapshotFrom({schema:1, source:'Binance Spot', data, until, fetchedAt:Date.now()});
}

function originOf(snapshot, title) {
  const date = new Date(snapshot.until).toLocaleString('tr-TR', {timeZone:'Europe/Istanbul'});
  return title + ' · son kapanış ' + date + ' (TSİ)' +
    (Date.now() - snapshot.until >= 2 * researchHour ? ' · ESKİ VERİ' : '');
}

function scheduleResearch(delay) {
  clearTimeout(researchTimer);
  if (autoResearch && !document.hidden) researchTimer = setTimeout(() => refreshResearch(), delay);
}

async function refreshResearch(force = false) {
  if (document.hidden || el('load').disabled || (!autoResearch && !force)) return;
  const now = Date.now();
  const until = Math.floor(now / researchHour) * researchHour;
  const next = () => Math.max(5000, until + researchHour + 12000 - Date.now());
  if (!force && refreshedHour === until) { scheduleResearch(next()); return; }
  if (!force && now - until < 12000) { scheduleResearch(until + 12000 - now); return; }
  autoResearch = true;
  el('load').disabled = true;
  el('file').disabled = true;
  el('status').textContent = 'Kapanmış Binance mumları yenileniyor…';
  let delay = 120000;
  try {
    if (!baseSnapshot) {
      try { baseSnapshot = snapshotFrom(await request('./snapshot.json')); }
      catch (_) {}
    }
    let live;
    try { live = await updateFromBinance(baseSnapshot, until); }
    catch (error) {
      if (!baseSnapshot) throw error;
      enableLiveReplay();
      render(baseSnapshot.data, [], originOf(baseSnapshot, 'Son veri paketi · Binance güncellemesi alınamadı'));
      void runExperiment();
      return;
    }
    baseSnapshot = live;
    enableLiveReplay();
    render(live.data, [], originOf(live, 'Binance Spot · otomatik güncelleme'));
    void runExperiment();
    refreshedHour = until;
    delay = next();
  } catch (error) {
    el('status').textContent = 'Veri alınamadı. ' + error.message + (current ? ' Önceki sonuç ekranda.' : '');
  } finally {
    el('load').disabled = false;
    el('file').disabled = false;
    scheduleResearch(delay);
  }
}
el('load').onclick = () => refreshResearch(true);
document.addEventListener('visibilitychange', () => {
  clearTimeout(researchTimer);
  if (!document.hidden) refreshResearch();
});

el('file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  el('load').disabled = true;
  try {
    if (file.size > 30 * 1024 * 1024) throw Error('JSON dosyası 30 MB sınırını aşıyor.');
    const input = JSON.parse(await file.text());
    const origin = input.datasetKind === 'synthetic'
      ? 'Sentetik test verisi'
      : 'İçe aktarılan JSON · kaynak beyanı doğrulanmadı';
    render(input.data || input, input.news || [], origin);
    autoResearch = false;
    clearTimeout(researchTimer);
    void runExperiment();
  } catch (error) {
    el('status').textContent = 'Veri reddedildi. ' + error.message + (current ? ' Önceki sonuç ekranda.' : '');
  } finally {
    el('load').disabled = false;
  }
};

el('experiment').onclick = runExperiment;
el('window').onchange = () => { if (current && !el('experiment').disabled) void runExperiment(); };
el('export').onclick = () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type: 'application/json'}));
  const anchor = element('a');
  anchor.href = url;
  anchor.download = 'coin-arastirma-v7.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};


void refreshResearch();
