from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, UTC
import hashlib
import json
import sys
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlencode
import time

START = int(datetime(2026,8,1,tzinfo=UTC).timestamp()*1000)
END = int(datetime(2026,11,16,tzinfo=UTC).timestamp()*1000)
DAY = 86400000
FIVE = 300000
root = Path(sys.argv[1]).resolve()
root.mkdir(parents=True, exist_ok=True)
pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']
revision = 'f8af377b919adedc135c6c9aad2ab46ebd12266f'
source_url = (
    'https://raw.githubusercontent.com/iterativv/NostalgiaForInfinity/'
    + revision + '/NostalgiaForInfinityX8.py'
)
with urlopen(source_url, timeout=30) as response:
    source = response.read(4_000_000)
if hashlib.sha256(source).hexdigest() != 'a6562d4a0767799d1538f8fc4dbd7277b8cef655b618e60a02f0f567418e10a4':
    raise ValueError('NFI source checksum mismatch')
(root / 'pinned.py').write_bytes(source)
for group, filename in ((pairs[:2], 'exchange.json'), (pairs, 'exchange-3.json')):
    query = urlencode({'symbols': json.dumps(group, separators=(',', ':'))})
    with urlopen('https://data-api.binance.vision/api/v3/exchangeInfo?' + query, timeout=15) as response:
        metadata = json.load(response)
    if {row['symbol'] for row in metadata['symbols']} != set(group):
        raise ValueError('Binance symbol metadata mismatch')
    (root / filename).write_text(json.dumps(metadata))
def fetch(task):
    symbol, timeframe, step, start, end = task
    query = urlencode(dict(symbol=symbol, interval=timeframe, startTime=start, endTime=end-1, limit=(end-start)//step))
    for attempt in range(3):
        try:
            with urlopen('https://data-api.binance.vision/api/v3/klines?'+query,timeout=14) as response:
                rows = json.load(response)
            if [row[0] for row in rows] != list(range(start, end, step)):
                raise ValueError(f'Missing or unordered candles: {task}')
            return symbol, timeframe, [[r[0], *map(float,r[1:6])] for r in rows]
        except OSError as error:
            if getattr(error,'code',None) in (418,429,451) or attempt==2:
                raise
            time.sleep(2)
jobs = [(s, timeframe, step, t, min(END,t+step*1000)) for s in pairs
        for timeframe, step, warm in [('5m',FIVE,35),('4h',14400000,140),('1d',DAY,810)]
        for t in range(START-warm*DAY,END,step*1000)]
with ThreadPoolExecutor(max_workers=6) as pool:
    data = {(s,tf):[] for s in pairs for tf in ['5m','4h','1d']}
    for s,tf,rows in pool.map(fetch,jobs):
        data[s,tf].extend(rows)
for (s,tf),rows in data.items():
    print(s,tf,len(rows),flush=True)
    (root/f'{s}-{tf}.json').write_text(json.dumps(rows,separators=(',',':')))
