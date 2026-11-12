(() => {
  const button = document.getElementById('load-news');
  const status = document.getElementById('news-status');
  const list = document.getElementById('news-list');
  const hosts = {
    Fed: 'federalreserve.gov', ECB: 'ecb.europa.eu', BLS: 'bls.gov', SEC: 'sec.gov'
  };
  const formatDate = value => Number.isFinite(value)
    ? new Date(value).toLocaleString('tr-TR', {timeZone: 'Europe/Istanbul'})
    : 'Tarih belirtilmemiş';

  let timer;
  async function refresh() {
    if (document.hidden || button.disabled) return;
    clearTimeout(timer);
    button.disabled = true;
    status.textContent = 'Haber paketi alınıyor…';
    try {
      const response = await fetch('./news.json', {cache: 'no-store', signal: AbortSignal.timeout(10000)});
      if (!response.ok) throw Error('Haber paketi yayımlanmamış veya erişilemiyor.');
      const data = await response.json();
      if (data.schema !== 1 || !Number.isFinite(data.checkedAt) ||
          data.checkedAt > Date.now() + 60000 || !Array.isArray(data.sources)) {
        throw Error('Haber paketinin biçimi veya zamanı geçersiz.');
      }
      const open = new Set([...list.querySelectorAll('details[open]')].map(group => group.dataset.source));
      list.replaceChildren();
      let available = 0;
      for (const source of data.sources) {
        if (!Object.hasOwn(hosts, source.source)) continue;
        const group = document.createElement('details');
        group.dataset.source = source.source;
        group.open = open.has(source.source);
        const title = document.createElement('summary');
        group.append(title);
        let count = 0;
        if (source.status === 'ok' && Array.isArray(source.items)) {
          for (const item of source.items) {
            if (typeof item.title !== 'string') continue;
            let url;
            try { url = new URL(item.url); } catch (_) { continue; }
            const host = hosts[source.source];
            if (url.protocol !== 'https:' || url.username || url.password ||
                (url.hostname !== host && !url.hostname.endsWith('.' + host))) continue;
            const row = document.createElement('p');
            const link = document.createElement('a');
            link.href = url.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = item.title;
            const date = document.createElement('small');
            date.textContent = ' · ' + formatDate(item.published);
            row.append(link, date);
            group.append(row);
            count++;
          }
        }
        if (count) available++;
        title.textContent = source.source + ' · ' + (count ? count + ' başlık' : 'Kayıt alınamadı');
        list.append(group);
      }
      const stale = Date.now() - data.checkedAt >= 2 * 3600000;
      status.textContent = 'Son kontrol ' + formatDate(data.checkedAt) + ' (TSİ) · ' +
        available + '/4 kaynak' + (stale ? ' · ESKİ VERİ' : '');
    } catch (error) {
      status.textContent = error.message + (list.children.length ? ' Önceki paket ekranda.' : '');
    } finally {
      button.disabled = false;
      if (!document.hidden) timer = setTimeout(refresh, 5 * 60000);
    }
  }
  button.addEventListener('click', refresh);
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (!document.hidden) refresh();
  });
  refresh();
})();
