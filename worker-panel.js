(() => {
  const el = id => document.getElementById(id);
  const fmt = n => Number.isFinite(n) ? n.toLocaleString('tr-TR', {maximumFractionDigits: 4}) : '—';
  const time = n => Number.isFinite(n) ? new Date(n).toLocaleString('tr-TR') : '—';
  let timer;
  let refreshing = false;

  function rows(id, values, fallback) {
    el(id).replaceChildren();
    for (const value of (values.length ? values : [fallback])) {
      const p = document.createElement('p');
      p.textContent = value;
      el(id).append(p);
    }
  }

  async function refresh() {
    if (document.hidden || refreshing) return;
    refreshing = true;
    try {
      const response = await fetch('./paper-state', {cache: 'no-store', signal: AbortSignal.timeout(8000)});
      if (!response.ok) throw Error('HTTP ' + response.status);
      const report = await response.json();
      if (report.mode !== 'paper') throw Error('Sunucu modu doğrulanamadı.');
      const {state} = report;
      const fresh = report.healthy && Date.now() - report.updatedAt < 20000;
      el('state').textContent = (fresh ? 'Tarama aktif' : 'Güncel fiyat yok') + ' · ' +
        (report.auto ? 'Otomatik sanal alım açık' : 'Sinyal takibi') +
        (report.market?.total ? ' · ' + report.market.total + ' aktif parite' : '') +
        (report.market?.scanHour === Math.floor(Date.now() / 3600000) * 3600000
          ? ' · Kontrol ' + report.market.checked + '/' + report.market.total : '') +
        ' · Son kontrol ' + time(report.updatedAt) + (report.error ? ' · ' + report.error : '');
      rows('wallet', [
        'Nakit ' + fmt(state.cash) + ' USDT' + (state.locked ? ' · Risk kilidi açık' : ''),
        ...Object.entries(fresh ? report.quotes : {}).map(([symbol, quote]) =>
          symbol + ' · alış ' + fmt(quote.ask) + ' · satış ' + fmt(quote.bid))
      ], 'Veri bekleniyor.');
      rows('signals', (fresh && !state.locked ? report.signals : [])
        .filter(s => s.expires > Date.now() && !(state.seen[s.symbol] >= s.closedAt))
        .map(s => s.symbol + ' · Saatlik kırılım adayı · son geçerlilik ' + time(s.expires)),
        fresh ? 'Aktif aday yok.' : 'Güncel fiyat bekleniyor.');
      rows('positions', state.positions.map(p =>
        p.symbol + ' · Giriş ' + fmt(p.entry) + ' · Stop ' + fmt(p.stop) + ' · Hedef ' + fmt(p.target)),
      'Açık sanal işlem yok.');
      rows('trades', state.trades.slice(0, 15).map(t =>
        t.symbol + ' · ' + t.reason + ' · ' + fmt(t.pnl) + ' USDT · ' + time(t.at)),
      'Kapanan sanal işlem yok.');
    } catch (error) {
      el('state').textContent = 'Sunucu bağlantısı kesildi. ' + error.message;
      rows('signals', [], 'Güncel sinyaller alınamadı.');
      rows('wallet', [], 'Sunucu verisi alınamadı.');
      rows('positions', [], 'Sunucu verisi alınamadı.');
      rows('trades', [], 'Sunucu verisi alınamadı.');
    } finally {
      refreshing = false;
      if (!document.hidden) timer = setTimeout(refresh, 4000);
    }
  }

  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    refresh();
  });
  refresh();
})();
