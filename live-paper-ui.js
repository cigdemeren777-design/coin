(() => {
  const key = 'coin-paper-wallet-v1';
  const el = id => document.getElementById(id);
  const format = number => number == null ? '—' : number.toLocaleString('tr-TR', {maximumFractionDigits: 4});
  let active = true;
  let wallet, monitor;
  let listed = [];

  function chartButton(symbol) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Grafik';
    button.setAttribute('aria-label', symbol + ' grafiğini aç');
    button.addEventListener('click', () =>
      document.dispatchEvent(new CustomEvent('coin-chart-open', {detail:symbol})));
    return button;
  }

  function renderUniverse() {
    const term = el('live-search').value.trim().toUpperCase();
    const shown = listed.filter(symbol => symbol.toUpperCase().includes(term));
    const list = el('live-universe-list');
    list.replaceChildren();
    for (const symbol of shown) {
      const entry = document.createElement('li');
      entry.textContent = symbol.slice(0, -4) + '/USDT';
      entry.append(chartButton(symbol));
      list.append(entry);
    }
    el('live-universe-count').textContent = shown.length + '/' + listed.length + ' parite';
  }
  el('live-search').addEventListener('input', renderUniverse);

  function item(parent, text, action, symbol) {
    const row = document.createElement('p');
    row.textContent = text;
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.addEventListener('click', action.run);
      row.append(' ', button);
    }
    if (symbol) row.append(' ', chartButton(symbol));
    parent.append(row);
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
          (market.scanning ? ' · Tarama sürüyor' : '') +
          (market.shortHistory ? ' · Yetersiz geçmiş: ' + market.shortHistory : '') +
          (market.failed ? ' · Veri hatası: ' + market.failed : '') : 'Saatlik kapanış taraması bekleniyor');
    }
    const equity = LivePaper.value(state, quotes, now);
    el('live-wallet').textContent = 'Nakit ' + format(state.cash) + ' USDT · Cüzdan değeri ' +
      format(equity) + ' USDT' + (state.locked ? ' · %10 düşüş kilidi' : '');
    const output = el('live-signals');
    output.replaceChildren();
    const actionable = fresh && equity !== null && !state.locked ? signals.filter(signal =>
      LivePaper.buy(LivePaper.restore(JSON.stringify(state)), signal, quotes[signal.symbol], now)) : [];
    if (!actionable.length) item(output, fresh ? market?.scanning ? 'Pariteler kontrol ediliyor.' : 'Şu an işlem koşullarını karşılayan sinyal yok.' : 'Güncel fiyat bekleniyor.');
    for (const signal of actionable) {
      item(output, signal.symbol + ' · Saatlik zirve kırılımı · alış ' + format(quotes[signal.symbol].ask),
        {label: 'Sanal al', run: () => tryAction(() => monitor.buy(signal.symbol))}, signal.symbol);
    }
    const positions = el('live-positions');
    positions.replaceChildren();
    if (!state.positions.length) item(positions, 'Açık sanal pozisyon yok.');
    for (const p of state.positions) {
      item(positions, p.symbol + ' · Giriş ' + format(p.entry) + ' · Stop ' + format(p.stop) +
        ' · Hedef ' + format(p.target), LivePaper.usable(quotes[p.symbol], now)
        ? {label: 'Sanal kapat', run: () => tryAction(() => monitor.sell(p.symbol))} : null, p.symbol);
    }
    const trades = el('live-trades');
    trades.replaceChildren();
    for (const t of state.trades.slice(0, 12)) {
      item(trades, t.symbol + ' · ' + t.reason + ' · ' + format(t.pnl) + ' USDT');
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
    const raw = localStorage.getItem(key);
    wallet = raw ? LivePaper.restore(raw) : LivePaper.initial();
    // Auto mode is always off when a new tab opens.
  } catch (error) {
    el('live-status').textContent = 'Sanal cüzdan açılamadı. ' + error.message;
    el('live-start').disabled = true;
    el('live-auto').disabled = true;
    return;
  }

  monitor = LivePaper.monitor({
    state: wallet,
    persist: state => localStorage.setItem(key, JSON.stringify(state)),
    onUpdate: render,
    automatic: () => active && !document.hidden && el('live-auto').checked
  });
  el('live-auto').checked = false;
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
    el('live-start').disabled = true;
    el('live-status').textContent = 'Cüzdan başka sekmede değişti. Devam etmek için bu sayfayı yenile.';
  });
})();
