/* V5: deterministic, long-only shared-cash research engine. Times in milliseconds. */
const Research = (() => {
 const C=typeof Core!=='undefined'?Core:require('./core.js');
 function validate(data,step,now=Date.now()) {
  if(!Number.isFinite(step)||step<=0) throw Error('Geçersiz mum aralığı');
  const symbols=Object.keys(data); if(!symbols.length) throw Error('Mum verisi yok');
  for(const s of symbols){const a=data[s]; if(!Array.isArray(a)||a.length<212)throw Error(s+': en az 212 mum gerekli');
   a.forEach((b,i)=>{if(!['t','o','h','l','c','v'].every(k=>Number.isFinite(b[k]))||b.l<=0||b.v<0||b.h<Math.max(b.o,b.c)||b.l>Math.min(b.o,b.c)||b.t+step>now)throw Error(s+': geçersiz veya kapanmamış mum '+i); if(i&&b.t-a[i-1].t!==step)throw Error(s+': eksik, yinelenmiş veya sırasız mum');});
   if(s!==symbols[0]&&(a.length!==data[symbols[0]].length||a.some((b,i)=>b.t!==data[symbols[0]][i].t)))throw Error('Paritelerin zaman aralıkları aynı olmalı');
  } return symbols.sort();
 }
 function evaluate(prepared, index, strategy, hypothesis) {
  if (!hypothesis) return C.evaluate(prepared, index, strategy, true);
  const price = prepared.c[index];
  const trend = prepared.ema50[index] > prepared.ema200[index];
  const breakout = price > prepared.hh[index];
  const pullback = prepared.l[index] <= prepared.ema20[index] && price > prepared.ema20[index];
  const trigger = hypothesis === 'pullback' ? pullback : breakout;
  const volume = prepared.v[index];
  const volumeConfirmed = hypothesis !== 'breakout-volume' ||
    (prepared.vavg[index - 1] > 0 && volume >= 1.5 * prepared.vavg[index - 1]);
  return {
   signal: trend && trigger && volume > 0 && volumeConfirmed,
   stop_dist: Math.max(strategy.stop_atr * prepared.atr[index], price * strategy.min_stop_yuzde / 100)
  };
 }

 function availableNews(news, at, step) {
  const index = new Map();
  for (const event of news) {
   if (!event || typeof event.symbol !== 'string' ||
       !Number.isFinite(event.firstSeen) || !Number.isFinite(event.published) ||
       !Number.isFinite(event.sentiment)) continue;
   const first = Math.max(event.firstSeen, event.published, at);
   const last = event.published + 48 * 3600000;
   const start = at + Math.ceil((first - at) / step) * step;
   for (let time = start; time <= last; time += step) {
    const key = event.symbol + '|' + time;
    index.set(key, index.get(key) || event.sentiment < 0);
   }
  }
  return index;
 }

 function run(data, cfg={}, news=[], useNews=false, randomBlocks=null) {
  const o={capital:1000,fee:.001,slip:.0005,risk:.005,allocation:.1,maxPositions:2,step:3600000,start:210,end:Infinity,...cfg};
  for(const k of ['capital','fee','slip','risk','allocation','maxPositions','start'])if(!Number.isFinite(o[k]))throw Error('Geçersiz ayar: '+k);
  if(o.capital<=0||o.fee<0||o.fee>.1||o.slip<0||o.slip>.1||o.risk<=0||o.risk>1||o.allocation<=0||o.allocation>1||!Number.isInteger(o.maxPositions)||o.maxPositions<1||o.start<210)throw Error('Ayar sınırları geçersiz');
  if (o.hypothesis && !['breakout','pullback','breakout-volume'].includes(o.hypothesis)) {
   throw Error('Bilinmeyen strateji');
  }
  const syms=validate(data,o.step), ps=Object.fromEntries(syms.map(s=>[s,C.prepare(data[s])])), n=data[syms[0]].length, end=Math.min(n-1,o.end);
  if(!Number.isInteger(o.start)||!Number.isInteger(end)||o.start>=end)throw Error('Test dönemi çok kısa');
  const evidence = availableNews(news, data[syms[0]][o.start + 1].t, o.step);
  const candidates = [];
  let cash=o.capital, peak=cash, dd=0, positions=[], trades=[], curve=[], covered=0, decisions=0;
  const strategy={stop_atr:2,min_stop_yuzde:.8,kar_zarar_orani:2,sinyal_esigi:70,...o.strategy};
  for(let i=o.start+1;i<=end;i++) {
   const t=data[syms[0]][i].t;
   // Previous close signals, next open execution. Fixed alphabetical tie-break.
   for(const s of syms){
    const key = s + '|' + t;
    const e = evaluate(ps[s], i-1, strategy, o.hypothesis);
    decisions++;
    if(evidence.has(key))covered++;
    if(!e.signal)continue;
    const negative = evidence.get(key) === true;
    candidates.push({ symbol:s, key, negative });
    if((useNews && negative) || randomBlocks?.has(key))continue;
    if(positions.some(p=>p.s===s)||positions.length>=o.maxPositions)continue;
    const entry=data[s][i].o*(1+o.slip), dist=e.stop_dist;
    const qty=Math.min(cash/(entry*(1+o.fee)),o.capital*o.allocation/(entry*(1+o.fee)),o.capital*o.risk/dist);
    if(!(qty * entry > o.capital * Number.EPSILON)||dist>=entry)continue;
    const cost=qty*entry*(1+o.fee);cash-=cost;positions.push({s,entry,qty,cost,sl:entry-dist,tp:entry+strategy.kar_zarar_orani*dist,entered:t,index:i});
   }
   positions=positions.filter(p=>{const b=data[p.s][i];let price,reason;
    if(b.l<=p.sl){price=Math.min(b.o,p.sl);reason='stop';}else if(b.h>=p.tp){price=p.tp;reason='hedef';}else if(i-p.index>=48||i===end){price=b.c;reason=i===end?'test sonu':'süre';}
    if(price===undefined)return true;
    const proceeds=p.qty*price*(1-o.slip)*(1-o.fee);cash+=proceeds;trades.push({...p, buyFee:p.qty*p.entry*o.fee, sellFee:p.qty*price*(1-o.slip)*o.fee, entrySlippage:p.qty*(p.entry-data[p.s][p.index].o), exitSlippage:p.qty*price*o.slip, exit:t+o.step,price,pnl:proceeds-p.cost,reason});return false;
   });
   const equity=cash+positions.reduce((v,p)=>v+p.qty*data[p.s][i].c*(1-o.slip)*(1-o.fee),0);peak=Math.max(peak,equity);dd=Math.max(dd,(peak-equity)/peak);curve.push({t:t+o.step,equity});
  }
  const profits=trades.reduce((a,x)=>a+Math.max(x.pnl,0),0),losses=-trades.reduce((a,x)=>a+Math.min(x.pnl,0),0);
  const benchmark=syms.reduce((a,s)=>a+data[s][end].c*(1-o.slip)*(1-o.fee)/(data[s][o.start+1].o*(1+o.slip)*(1+o.fee)),0)/syms.length-1;
  return {returnPct:(cash/o.capital-1)*100,maxDrawdownPct:dd*100,profitFactor:losses?profits/losses:null,trades:trades.length,winRate:trades.length?100*trades.filter(x=>x.pnl>0).length/trades.length:null,benchmarkPct:benchmark*100,newsCoveragePct:decisions?100*covered/decisions:0,curve,ledger:trades,candidates,settings:o};
 }
 function compare(data,cfg={},news=[]){const n=data[Object.keys(data)[0]].length,split=Math.max(212,Math.floor(n*.7));return {technical:run(data,cfg,news),newsFiltered:run(data,cfg,news,true),holdout:run(data,{...cfg,start:split},news),stress:[.0005,.0015,.003].map(slip=>run(data,{...cfg,slip})),note:'Son %30 ayrılmış dönem; parametre optimizasyonu yapılmadı. Haber yoksa haberli sonuç ek kanıt değildir. Güncel coin seçimi hayatta kalma yanlılığı taşır.'};}
 return {validate,run,compare};
})();
if(typeof module!=='undefined')module.exports=Research;
