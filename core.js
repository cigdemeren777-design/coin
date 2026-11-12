const Core = (() => {
  function ema(v, n) { const o = new Array(v.length).fill(null); if (v.length < n) return o;
    const k = 2 / (n + 1); let s = 0; for (let i = 0; i < n; i++) s += v[i]; s /= n; o[n - 1] = s;
    for (let i = n; i < v.length; i++) { s = v[i] * k + s * (1 - k); o[i] = s; } return o; }
  function sma(v, n) { const o = new Array(v.length).fill(null); let s = 0;
    for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; if (i >= n - 1) o[i] = s / n; } return o; }
  function rsi(c, n = 14) { const o = new Array(c.length).fill(null); if (c.length <= n) return o;
    let g = 0, l = 0; for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; g += Math.max(d, 0); l += Math.max(-d, 0); }
    g /= n; l /= n; o[n] = l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l);
    for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1];
      g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n;
      o[i] = l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l); } return o; }
  function atr(h, l, c, n = 14) { const o = new Array(c.length).fill(null); if (c.length <= n) return o;
    const tr = [h[0] - l[0]];
    for (let i = 1; i < c.length; i++) tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
    let a = 0; for (let i = 1; i <= n; i++) a += tr[i]; a /= n; o[n] = a;
    for (let i = n + 1; i < c.length; i++) { a = (a * (n - 1) + tr[i]) / n; o[i] = a; } return o; }
  function macdHist(c) { const ef = ema(c, 12), es = ema(c, 26), o = new Array(c.length).fill(null), st = 25;
    if (c.length < 35) return o; const m = []; for (let i = st; i < c.length; i++) m.push(ef[i] - es[i]);
    const sg = ema(m, 9); sg.forEach((s, j) => { if (s !== null) o[st + j] = m[j] - s; }); return o; }
  function highestPrev(h, n) { const o = new Array(h.length).fill(null);
    for (let i = n; i < h.length; i++) { let m = -Infinity; for (let j = i - n; j < i; j++) if (h[j] > m) m = h[j]; o[i] = m; } return o; }
  const MIN_BARS = 210;
  function prepare(k) { const c = k.map(x => x.c), h = k.map(x => x.h), l = k.map(x => x.l), v = k.map(x => x.v);
    return { o: k.map(x => x.o), h, l, c, v, t: k.map(x => x.t), ema20: ema(c, 20), ema50: ema(c, 50), ema200: ema(c, 200),
      rsi: rsi(c), atr: atr(h, l, c), hist: macdHist(c), vavg: sma(v, 20), hh: highestPrev(h, 20) }; }
  function btcOk(p, i) { if (i == null) i = p.c.length - 1; const e = p.ema50[i]; return e !== null && p.c[i] > e; }
  function evaluate(p, i, cfg, btc = true) {
    const res = { score: 0, reasons: [], signal: false, price: p.c[i] };
    if (i < MIN_BARS) return res;
    const need = [p.ema200[i], p.atr[i], p.hist[i], p.hist[i - 1], p.vavg[i - 1], p.hh[i], p.rsi[i]];
    if (need.some(x => x === null || x === undefined)) return res;
    const c = p.c[i], o = p.o[i], e20 = p.ema20[i], e50 = p.ema50[i], e200 = p.ema200[i], a = p.atr[i], r = p.rsi[i];
    let s = 0; const why = [];
    if (c > e50 && e50 > e200) { s += 25; why.push('Yükseliş trendi (fiyat > EMA50 > EMA200)'); }
    else if (c > e50) { s += 10; why.push('Kısa vadeli trend yukarı'); }
    if (p.hist[i] > 0 && p.hist[i] > p.hist[i - 1]) { s += 20; why.push('MACD momentumu güçleniyor'); }
    else if (p.hist[i] > 0) { s += 10; why.push('MACD pozitif'); }
    if (r >= 52 && r <= 70) { s += 15; why.push('RSI sağlıklı bölgede (' + Math.floor(r) + ')'); }
    else if (r > 70 && r <= 78) { s += 5; why.push('RSI yüksek (' + Math.floor(r) + ')'); }
    const vr = p.vavg[i - 1] ? p.v[i] / p.vavg[i - 1] : 0;
    if (vr >= 2) { s += 20; why.push('Hacim patlaması (ortalamanın ' + vr.toFixed(1) + ' katı)'); }
    else if (vr >= 1.5) { s += 12; why.push('Hacim artıyor (' + vr.toFixed(1) + ' kat)'); }
    else if (vr >= 1.2) s += 5;
    const hh = p.hh[i];
    if (c > hh) { s += 20; why.push('Son 20 mumun zirvesi kırıldı'); }
    else if (c > hh * 0.997) { s += 8; why.push('Zirveye çok yakın'); }
    if (c - e20 > 2.5 * a) { s -= 20; why.push('Uyarı: fiyat fazla uzamış'); }
    if (c < o) s -= 10;
    if (!btc) { s = Math.min(s, 60); why.push('BTC zayıf: alım kapalı'); }
    s = Math.max(0, Math.min(100, s));
    const ap = a / c * 100, dist = Math.max(cfg.stop_atr * a, c * cfg.min_stop_yuzde / 100);
    return { score: s, reasons: why, price: c, rsi: Math.round(r * 10) / 10, vol_ratio: Math.round(vr * 100) / 100,
      atr_pct: ap, stop_dist: dist, sl: c - dist, tp: c + dist * cfg.kar_zarar_orani,
      signal: s >= cfg.sinyal_esigi && ap >= 0.15 && ap <= 5 && btc };
  }
  const FEE = 0.001, SLIP = 0.0005;
  function roundTripPct(entryFill, exitMark, fee = FEE, slip = SLIP) {
    const buyCost = entryFill * (1 + fee);
    const sellProceeds = exitMark * (1 - slip) * (1 - fee);
    return (sellProceeds / buyCost - 1) * 100;
  }
  function backtest(bySym, btcK, cfg, tfs) {
    const ok = new Map();
    if (btcK && cfg.btc_filtresi) { const bp = prepare(btcK); btcK.forEach((k, i) => ok.set(k.t, btcOk(bp, i))); }
    const maxBars = Math.max(1, Math.floor(cfg.max_sure_dakika * 60 / tfs)), tr = [];
    for (const sym in bySym) { const k = bySym[sym]; if (k.length < MIN_BARS + 20) continue;
      const p = prepare(k), n = k.length; let i = MIN_BARS;
      while (i < n - 1) { const ev = evaluate(p, i, cfg, cfg.btc_filtresi ? (ok.has(p.t[i]) && ok.get(p.t[i])) : true);
        if (!ev.signal) { i++; continue; }
        const entry = p.o[i + 1] * (1 + SLIP), sl = entry - ev.stop_dist, tp = entry + ev.stop_dist * cfg.kar_zarar_orani;
        let ex = null, why = null, j = i + 1;
        for (; j < n; j++) { if (p.l[j] <= sl) { ex = Math.min(sl, p.o[j]); why = 'stop'; break; } if (p.h[j] >= tp) { ex = tp; why = 'hedef'; break; }
          if (j - i >= maxBars) { ex = p.c[j]; why = 'sure'; break; } }
        if (ex === null) break;
        tr.push({ pct: roundTripPct(entry, ex), why }); i = j + 1; } }
    const tot = tr.reduce((a, t) => a + t.pct, 0), w = tr.filter(t => t.pct > 0).length;
    let span = 0; for (const s in bySym) { const k = bySym[s]; if (k.length) span = Math.max(span, (k[k.length - 1].t - k[0].t) / 864e5); }
    const cnt = y => tr.filter(t => t.why === y).length;
    return { uyari: 'Toplam, işlem yüzdelerinin toplamıdır; portföy getirisi değildir. Aynı andaki işlemler ve nakit kısıtları modellenmedi.', islem: tr.length, kazanan: w, basari: tr.length ? w / tr.length * 100 : 0, toplam: tot, ortalama: tr.length ? tot / tr.length : 0,
      gun: span, coin: Object.keys(bySym).length, stop: cnt('stop'), hedef: cnt('hedef'), sure: cnt('sure') };
  }
  return { prepare, evaluate, btcOk, backtest, MIN_BARS, FEE, SLIP, roundTripPct };
})();


// ===================== STRATEJİ ADAYLARI VE 30 GÜNLÜK TEST =====================
if (typeof module !== 'undefined') module.exports = Core;
