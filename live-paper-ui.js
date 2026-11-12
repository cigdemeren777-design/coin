(() => {
  const key = 'coin-paper-wallet-v1';
  const el = id => document.getElementById(id);
  const format = number => number == null ? '—' : number.toLocaleString('tr-TR', {maximumFractionDigits: 4});
  let active = true;
  let wallet, monitor, savedWallet;
  let listed = [];
  let chartRow = null;
  const chart = el('market-chart');

  function closeChart() {
    if (!chartRow) return;
    chartRow.classList.remove('chart-open');
    chartRow.querySelector('.chart-toggle')?.setAttribute('aria-expanded', 'false');
    el('chart-home').append(chart);
    chartRow = null;
    document.dispatchEvent(new CustomEvent('coin-chart-close'));
  }

  function chartButton(symbol) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Grafik';
    button.className = 'chart-toggle';
    button.setAttribute('aria-label', symbol + ' grafiği');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'market-chart');
    button.addEventListener('click', () => {
      const row = button.closest('[data-chart-symbol]');
      if (row === chartRow) {
        closeChart();
        if (row.parentElement.id === 'live-universe-list') button.scrollIntoView({block:'nearest'});
        return;
      }
      closeChart();
      chartRow = row;
      row.classList.add('chart-open');
      button.setAttribute('aria-expanded', 'true');
      row.append(chart);
      document.dispatchEvent(new CustomEvent('coin-chart-open', {detail:symbol}));
      button.scrollIntoView({block:'nearest'});
    });
    return button;
  }

  function setRows(parent, rows) {
    if (chartRow?.parentElement !== parent) {
      parent.replaceChildren(...rows);
      return;
    }
    const index = rows.findIndex(row => row.dataset.chartSymbol === chartRow.dataset.chartSymbol);
    if (index < 0) {
      closeChart();
      parent.replaceChildren(...rows);
      return;
    }
    // Keep the live chart attached when prices refresh its coin's row.
    const header = rows[index].firstElementChild;
    if (header.textContent !== chartRow.firstElementChild.textContent) {
      header.querySelector('.chart-toggle').setAttribute('aria-expanded', 'true');
      chartRow.firstElementChild.replaceWith(header);
    }
    for (const row of [...parent.children]) {
      if (row !== chartRow) row.remove();
    }
    chartRow.before(...rows.slice(0, index));
    chartRow.after(...rows.slice(index + 1));
  }

  function renderUniverse() {
    const term = el('live-search').value.trim().toUpperCase();
    const shown = listed.filter(symbol => symbol.toUpperCase().includes(term));
    const rows = shown.map(symbol => {
      const entry = document.createElement('li');
      entry.dataset.chartSymbol = symbol;
      const line = document.createElement('div');
      line.className = 'coin-line';
      line.append(symbol.slice(0, -4) + '/USDT', chartButton(symbol));
      entry.append(line);
      return entry;
    });
    setRows(el('live-universe-list'), rows);
    el('live-universe-count').textContent = shown.length + '/' + listed.length + ' parite';
  }
  el('live-search').addEventListener('input', renderUniverse);
  el('coin-search').addEventListener('toggle', event => {
    if (!event.target.open && chartRow?.parentElement === el('live-universe-list')) closeChart();
  });
  el('coin-search-link').addEventListener('click', () => { el('coin-search').open = true; });

  function item(text, action, symbol) {
    const row = document.createElement(symbol ? 'div' : 'p');
    const line = symbol ? document.createElement('p') : row;
    line.textContent = text;
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.addEventListener('click', action.run);
      line.append(' ', button);
    }
    if (symbol) {
      row.dataset.chartSymbol = symbol;
      line.append(' ', chartButton(symbol));
      row.append(line);
    }
    return row;
  }

  function render({state, quotes, signals, error, market}) {
    const now = Date.now();
    const fresh = !error && Object.values(quotes).some(quote => LivePaper.usable(quote, now));
    el('live-status').textContent = error || (fresh ? 'Binance fiyatı alındı · ' + new Date(now).toLocaleTimeString('tr-TR') : 'Bağlanıyor…');
    const listChanged = market?.symbols && market.symbols !== listed;
    if (listChanged) {
      listed = market.symbols;
      renderUniverse();
    }
    document.dispatchEvent(new CustomEvent('coin-chart-state', {
      detail:{positions:state.positions, symbols:listChanged ? listed : null}
    }));
    if (market?.total) {
      const checked = market.scanHour === Math.floor(now / LivePaper.hour) * LivePaper.hour;
      el('live-coverage').textContent = market.total + ' aktif parite · ' +
        (checked ? market.checked + '/' + market.total + ' kontrol edildi' +
          (market.scanning ? ' · Geçmiş mumlar hazırlanıyor' : ' · Canlı fiyat takibi açık') +
          (market.shortHistory ? ' · Yetersiz geçmiş: ' + market.shortHistory : '') +
          (market.failed ? ' · Veri hatası: ' + market.failed : '') : 'Canlı tarama için mumlar hazırlanıyor');
    }
    const equity = LivePaper.value(state, quotes, now);
    el('live-wallet').textContent = 'Nakit ' + format(state.cash) + ' USDT · Tahmini cüzdan değeri ' +
      format(equity) + ' USDT' + (state.locked ? ' · %10 düşüş kilidi' : '');
    el('live-settings-active').textContent = 'Açık işlem ' + state.positions.length + ' / ' + state.maxPositions +
      ' · Yeni alım başına ' + format(state.orderCash) + ' USDT';
    const output = el('live-signals');
    const signalRows = [];
    const actionable = fresh && equity !== null && !state.locked ? signals.filter(signal =>
      LivePaper.canBuy(state, signal, quotes[signal.symbol], now)) : [];
    const stats = market?.signalStats;
    if (!actionable.length) {
      let explanation = 'Şu an işlem koşullarını karşılayan sinyal yok.';
      if (!fresh) explanation = 'Güncel fiyat bekleniyor.';
      else if (state.locked) explanation = 'Risk kilidi yeni sanal alımları durdurdu.';
      else if (state.positions.length >= state.maxPositions) explanation = 'Açık sanal işlem sınırı dolu.';
      else if (state.cash < state.orderCash) explanation = 'Yeni sanal alım için nakit yetersiz.';
      else if (equity === null) explanation = 'Açık pozisyonun güncel fiyatı bekleniyor.';
      else if (market?.scanning) explanation = 'Paritelerin mum geçmişi kontrol ediliyor.';
      else if (stats && !stats.trend) explanation = 'Trend ve mum geçmişi koşullarını karşılayan parite yok.';
      else if (stats && !stats.quoted) explanation = 'Trendi uygun pariteler için güncel fiyat bekleniyor.';
      else if (stats && !stats.above) explanation = 'Trendi uygun coinlerden hiçbiri son 20 mumun zirvesini aşmadı.';
      else if (stats?.walletBlocked) explanation = 'Kırılım var. Aynı parite için açık işlem veya saatlik tekrar kuralı kontrol ediliyor.';
      else if (stats?.above) explanation = 'Kırılım var. Alış-satış farkı, likidite, zirveden uzaklık veya sinyal süresi uygun değil.';
      signalRows.push(item(explanation));
    }
    const detail = el('live-signal-detail');
    const near = el('live-near-breakouts');
    const nearRows = [];
    detail.textContent = fresh && stats ? stats.trend + ' trendi uygun · ' + stats.above + ' zirve üstünde' +
      (stats.spread ? ' · Alış-satış farkı yüksek: ' + stats.spread : '') +
      (stats.distance ? ' · Zirveden %0,5’ten fazla uzakta: ' + stats.distance : '') +
      (stats.liquidity ? ' · Seçilen tutar için miktar yetersiz: ' + stats.liquidity : '') +
      (stats.expired ? ' · Süresi dolan: ' + stats.expired : '') +
      (stats.walletBlocked ? ' · Cüzdan kuralları: ' + stats.walletBlocked : '') : '';
    if (fresh && stats?.near.length) {
      const heading = document.createElement('small');
      heading.textContent = 'Zirveye en yakın coinler · İzleme';
      nearRows.push(heading);
      for (const candidate of stats.near) {
        nearRows.push(item(candidate.symbol.slice(0, -4) + '/USDT · zirveye %' + format(candidate.remainingPct), null, candidate.symbol));
      }
    }
    setRows(near, nearRows);
    for (const signal of actionable) {
      signalRows.push(item(signal.symbol + ' · Canlı zirve kırılımı · alış ' + format(quotes[signal.symbol].ask),
        {label: 'Sanal al', run: () => tryAction(() => monitor.buy(signal.symbol))}, signal.symbol));
    }
    setRows(output, signalRows);
    const positions = el('live-positions');
    const positionRows = [];
    if (!state.positions.length) positionRows.push(item('Açık sanal pozisyon yok.'));
    for (const p of state.positions) {
      const quote = quotes[p.symbol];
      const status = p.exitReason ? ' · ' + p.exitReason + ' tetiklendi, yeterli alış miktarı bekleniyor' :
        LivePaper.usable(quote, now) && !LivePaper.canSell(p, quote, now) ? ' · Alış miktarı yetersiz' : '';
      positionRows.push(item(p.symbol + ' · Giriş ' + format(p.entry) + ' · Stop ' + format(p.stop) +
        ' · Hedef ' + format(p.target) + status, LivePaper.canSell(p, quote, now)
        ? {label: 'Sanal kapat', run: () => tryAction(() => monitor.sell(p.symbol))} : null, p.symbol));
    }
    setRows(positions, positionRows);
    const trades = el('live-trades');
    trades.replaceChildren();
    const profitable = state.trades.filter(t => t.pnl > 0).length;
    const pnl = state.trades.reduce((total, t) => total + t.pnl, 0);
    el('live-performance').textContent = state.trades.length
      ? 'Kârla kapanan ' + profitable + ' / ' + state.trades.length + ' (%' +
        format(100 * profitable / state.trades.length) + ') · Net sonuç ' + format(pnl) + ' USDT'
      : 'Performansı hesaplamak için kapanan sanal işlem bekleniyor.';
    for (const t of state.trades.slice(0, 12)) {
      trades.append(item(t.symbol + ' · ' + t.reason + ' · ' + format(t.pnl) + ' USDT'));
    }
  }

  function tryAction(action) {
    try {
      if (!action()) el('live-status').textContent = 'Fiyat veya işlem koşulu değişti. Bir sonraki taramayı bekle.';
    } catch (error) {
      el('live-status').textContent = 'Cüzdan yazılamadı. ' + error.message;
    }
  }

  try {
    savedWallet = localStorage.getItem(key);
    wallet = savedWallet ? LivePaper.restore(savedWallet) : LivePaper.initial();
    // Auto mode is always off when a new tab opens.
  } catch (error) {
    el('live-status').textContent = 'Sanal cüzdan açılamadı. ' + error.message;
    el('live-start').disabled = true;
    el('live-auto').disabled = true;
    el('live-settings-fields').disabled = true;
    return;
  }

  monitor = LivePaper.monitor({
    state: wallet,
    persist: state => {
      if (localStorage.getItem(key) !== savedWallet) throw Error('Cüzdan başka sekmede değişti. Sayfayı yenile.');
      const next = JSON.stringify(state);
      localStorage.setItem(key, next);
      savedWallet = next;
    },
    onUpdate: render,
    automatic: () => active && !document.hidden && el('live-auto').checked
  });
  el('live-auto').checked = false;
  el('live-max-positions').value = String(wallet.maxPositions);
  el('live-order-cash').value = String(wallet.orderCash).replace('.', ',');
  el('live-settings').addEventListener('submit', event => {
    event.preventDefault();
    const amount = el('live-order-cash').value.trim();
    try {
      if (!/^\d+([,.]\d{1,2})?$/.test(amount)) throw Error('Pozitif bir tutar yaz. Örnek 25,50.');
      monitor.setSettings(Number(el('live-max-positions').value), Number(amount.replace(',', '.')));
      el('live-settings-status').textContent = 'Kaydedildi. Yeni ayarlar sonraki alımlarda uygulanır.';
    } catch (error) {
      el('live-settings-status').textContent = error.message;
    }
  });
  el('live-start').textContent = 'Taramayı durdur';
  render({state: wallet, quotes: {}, signals: [], error: null});
  if (!document.hidden) monitor.start();
  el('live-start').addEventListener('click', () => {
    active = !active;
    el('live-start').textContent = active ? 'Taramayı durdur' : 'Taramayı başlat';
    if (active && !document.hidden) monitor.start();
    else {
      el('live-auto').checked = false;
      monitor.stop();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!active) return;
    if (document.hidden) monitor.stop();
    else monitor.start();
  });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    active = false;
    monitor.stop();
    el('live-auto').checked = false;
    el('live-auto').disabled = true;
    el('live-start').disabled = true;
    el('live-settings-fields').disabled = true;
    el('live-status').textContent = 'Cüzdan başka sekmede değişti. Devam etmek için bu sayfayı yenile.';
  });
})();
