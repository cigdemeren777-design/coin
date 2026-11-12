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

el('load').onclick = async () => {
  el('load').disabled = true;
  el('file').disabled = true;
  el('status').textContent = 'GitHub veri paketi alınıyor…';
  try {
    const snapshot = await request('./snapshot.json');
    if (snapshot.schema !== 1 || snapshot.source !== 'Binance Spot' ||
        !Number.isFinite(snapshot.until) || !Number.isFinite(snapshot.fetchedAt) ||
        snapshot.fetchedAt < snapshot.until || snapshot.fetchedAt > Date.now() + 60000) {
      throw Error('Paket biçimi veya zamanı geçersiz.');
    }
    for (const symbol of ['BTCUSDT', 'ETHUSDT']) {
      const bars = snapshot.data?.[symbol];
      if (bars?.length !== 3000 || bars.at(-1).t + 3600000 !== snapshot.until) {
        throw Error(symbol + ' için paket eksik veya kapanış saati uyuşmuyor.');
      }
    }
    const age = Date.now() - snapshot.until;
    const date = new Date(snapshot.until).toLocaleString('tr-TR');
    const origin = 'GitHub · Binance Spot · son mum kapanışı ' + date +
      (age >= 2 * 3600000 ? ' · ESKİ VERİ' : '');
    render({BTCUSDT: snapshot.data.BTCUSDT, ETHUSDT: snapshot.data.ETHUSDT}, [], origin);
  } catch (error) {
    el('status').textContent = 'GitHub veri paketi alınamadı. ' + error.message +
      (current ? ' Önceki sonuç ekranda.' : '');
  } finally {
    el('load').disabled = false;
    el('file').disabled = false;
  }
};

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
  } catch (error) {
    el('status').textContent = 'Veri reddedildi. ' + error.message + (current ? ' Önceki sonuç ekranda.' : '');
  } finally {
    el('load').disabled = false;
  }
};

el('experiment').onclick = runExperiment;
el('export').onclick = () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type: 'application/json'}));
  const anchor = element('a');
  anchor.href = url;
  anchor.download = 'coin-arastirma-v7.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

