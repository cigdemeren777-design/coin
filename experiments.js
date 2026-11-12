/* Rolling out-of-sample experiments. Browser and Node use the same implementation. */
const Experiments = (() => {
  const engine = typeof Research !== 'undefined' ? Research : require('./research.js');
  const hypotheses = ['breakout', 'pullback', 'breakout-volume'];
  const labels = {
    breakout: '20 mum kırılımı',
    pullback: 'EMA20 geri çekilmesi',
    'breakout-volume': 'Hacim teyitli kırılım'
  };
  const step = 3600000;
  const version = 'v7.0';

  function generator(seed) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function matchedBlocks(candidates, random) {
    const blocked = new Set();
    for (const symbol of new Set(candidates.map(candidate => candidate.symbol))) {
      const group = candidates.filter(candidate => candidate.symbol === symbol);
      const count = group.filter(candidate => candidate.negative).length;
      for (let i = 0; i < count; i++) {
        const j = i + Math.floor(random() * (group.length - i));
        [group[i], group[j]] = [group[j], group[i]];
        blocked.add(group[i].key);
      }
    }
    return blocked;
  }

  function metrics(result) {
    const total = result.ledger.reduce((sum, trade) => sum + trade.pnl, 0);
    const blocks = result.candidates.filter(candidate => candidate.negative).length;
    return {
      returnPct: result.returnPct, maxDrawdownPct: result.maxDrawdownPct,
      benchmarkPct: result.benchmarkPct, trades: result.trades,
      expectancy: result.trades ? total / result.trades : null,
      profitFactor: result.profitFactor, winRate: result.winRate,
      newsCoveragePct: result.newsCoveragePct, signals: result.candidates.length,
      negativeSignals: blocks
    };
  }

  function logReturns(result) {
    let previous = result.settings.capital;
    return result.curve.map(({ equity }) => {
      const change = Math.log(equity / previous);
      previous = equity;
      return change;
    });
  }

  function pairedInterval(pairs, seed, blockSize = 24, samples = 500) {
    if (pairs.length < 3 || pairs.some(pair => pair.left.length < 3 * blockSize)) return null;
    const random = generator(seed);
    const estimates = Array.from({ length: samples }, () => {
      let left = 0, right = 0;
      for (const pair of pairs) {
        const n = pair.left.length;
        for (let offset = 0; offset < n; offset += blockSize) {
          const start = Math.floor(random() * (n - blockSize + 1));
          const length = Math.min(blockSize, n - offset);
          for (let i = start; i < start + length; i++) {
            left += pair.left[i];
            right += pair.right[i];
          }
        }
      }
      return 100 * (Math.expm1(left) - Math.expm1(right));
    }).sort((a, b) => a - b);
    return {
      lower: estimates[Math.floor(samples * .025)], upper: estimates[Math.ceil(samples * .975) - 1],
      confidence: .95, blockSize, samples, unit: 'yüzde puan'
    };
  }

  function run(data, news = [], options = {}) {
    const { windowHours = 168, seed = 1729 } = options;
    if (!Number.isInteger(windowHours) || windowHours < 72 || windowHours > 2160 ||
        !Number.isInteger(seed)) throw Error('Deney ayarları geçersiz.');
    if (!Array.isArray(news)) throw Error('Haber alanı dizi olmalı.');
    const symbols = engine.validate(data, step);
    const bars = data[symbols[0]];
    const warmup = 211;
    const minimum = warmup + 4 * windowHours;
    if (bars.length < minimum) throw Error('Bu pencere için en az ' + minimum + ' kapanmış saatlik mum gerekli.');
    const shared = { capital: 1000, fee: .001, slip: .0005, risk: .005, allocation: .1, maxPositions: 2, step };
    const folds = [], pairs = [];
    const random = generator(seed);
    const summarizePeriod = (first, last) => ({ from: bars[first].t, until: bars[last].t + step });
    // A period is [first, last]. The signal bar immediately precedes the first fill.
    for (let first = warmup + 3 * windowHours; first + windowHours <= bars.length; first += windowHours) {
      const end = first + windowHours - 1;
      const validation = hypotheses.map(hypothesis => {
        const config = { ...shared, hypothesis };
        const train = engine.run(data, { ...config, start:first - 3 * windowHours - 1, end:first - windowHours - 1 });
        const check = engine.run(data, { ...config, start:first - windowHours - 1, end:first - 1 });
        return { hypothesis, train: metrics(train), validation: metrics(check) };
      });
      const eligible = validation.filter(candidate => candidate.train.trades && candidate.validation.trades);
      eligible.sort((a, b) => b.validation.returnPct - a.validation.returnPct);
      const hypothesis = eligible[0]?.hypothesis || 'breakout';
      const config = { ...shared, hypothesis, start:first - 1, end };
      const technical = engine.run(data, config, news);
      const blocks = matchedBlocks(technical.candidates, random);
      const technicalMetrics = metrics(technical);
      let newsMetrics = null, randomMetrics = null;
      if (technicalMetrics.negativeSignals) {
        const filtered = engine.run(data, config, news, true);
        const placebo = engine.run(data, config, news, false, blocks);
        newsMetrics = metrics(filtered);
        randomMetrics = { ...metrics(placebo), blockedSignals: blocks.size };
        pairs.push({ left: logReturns(filtered), right: logReturns(technical) });
      }
      folds.push({
        train: summarizePeriod(first - 3 * windowHours, first - windowHours - 1),
        validation: summarizePeriod(first - windowHours, first - 1),
        test: summarizePeriod(first, end), hypothesis,
        usedFallback: eligible.length === 0, selection: validation,
        technical: technicalMetrics, random: randomMetrics, news: newsMetrics
      });
    }
    return {
      version, symbols, seed, windowHours, settings: shared, folds,
      excludedTailBars: (bars.length - warmup) % windowHours,
      bootstrapNewsVsTechnical: pairedInterval(pairs, seed + 1),
      dsr: null
    };
  }

  return { run, labels, matchedBlocks, generator, pairedInterval };
})();
if (typeof module !== 'undefined') module.exports = Experiments;
