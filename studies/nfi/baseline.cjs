'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {replay} = require('../../live-replay');
const dataDirectory = path.resolve(process.argv[2]);
const symbols=['BTCUSDT','ETHUSDT','SOLUSDT'].slice(0, Number(process.argv[3] || 3));
const fine=Object.fromEntries(symbols.map(s=>[s,JSON.parse(fs.readFileSync(path.join(dataDirectory, s+'-5m.json')))
  .map(([t,o,h,l,c,v])=>({t,o,h,l,c,v}))]));
const hourly=Object.fromEntries(symbols.map(s=>[s,Array.from({length:fine[s].length/12},(_,i)=>{
  const group=fine[s].slice(i*12,i*12+12);
  return {t:group[0].t,o:group[0].o,h:Math.max(...group.map(x=>x.h)),l:Math.min(...group.map(x=>x.l)),
    c:group.at(-1).c,v:group.reduce((a,x)=>a+x.v,0)};
})]));
for (const [begin,end] of [['2026-08-01','2026-10-10'],['2026-10-10','2026-11-16']]) {
 for (const cap of [1,2,3]) {
   const {ledger,...values}=replay(hourly,fine,symbols,Date.parse(begin),Date.parse(end),false,cap);
   console.log(JSON.stringify({begin,end,cap,...values}));
 }
}
