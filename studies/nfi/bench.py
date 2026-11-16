import json
from pathlib import Path
import sys

import ccxt.async_support as ccxt
import ccxt.pro
from freqtrade.main import main
import pandas as pd

root = Path(sys.argv[1]).resolve()
cap, fee, span = sys.argv[2:5]
size = int(sys.argv[5]) if len(sys.argv) > 5 else 3
if cap not in {'1', '2', '3'} or size not in {2, 3} or span not in {'20260801-20261010', '20261010-20261116'}:
    raise ValueError('Invalid cap, universe or study period')
run = root / f'run-{size}-{cap}-{fee}-{span}'
run.mkdir(exist_ok=True)
out = run / 'data'
strategies = run / 'strategies'
results = run / 'results'
for path in (out, strategies, results):
    path.mkdir(exist_ok=True)
source = root / 'pinned.py'
(strategies / 'NostalgiaForInfinityX8.py').write_bytes(source.read_bytes())
(strategies / 'FixedNFI.py').write_text(
    'import pandas\nfrom NostalgiaForInfinityX8 import NostalgiaForInfinityX8\n\n'
    'class FixedNFI(NostalgiaForInfinityX8):\n'
    '    position_adjustment_enable = False\n'
    '    def custom_stake_amount(self, pair, current_time, current_rate, proposed_stake, '
    'min_stake, max_stake, leverage, entry_tag, side, **kwargs):\n'
    '        return proposed_stake\n'
    '    def populate_entry_trend(self, frame, metadata):\n'
    '        frame = super().populate_entry_trend(frame, metadata)\n'
    f'        start = pandas.Timestamp({span[:8]!r}, tz=\"UTC\")\n'
    f'        end = pandas.Timestamp({span[9:]!r}, tz=\"UTC\")\n'
    '        mask = (frame.date >= start) & (frame.date < end)\n'
    '        print(\"Raw long signals:\", metadata[\"pair\"], int(frame.loc[mask, \"enter_long\"].fillna(0).sum()), flush=True)\n'
    '        return frame\n'
)
symbols = ['BTCUSDT','ETHUSDT','SOLUSDT'][:size]
pairs = [s[:-4]+'/USDT' for s in symbols]
exchange_rows = json.loads((root/('exchange-3.json' if size==3 else 'exchange.json')).read_text())['symbols']
assert {r['symbol'] for r in exchange_rows} == set(symbols)
async def fetch_markets(client, params=None):
    client.options.update(crossMarginPairsData=[], isolatedMarginPairsData=[])
    return [client.parse_market(info) for info in exchange_rows]
for klass in (ccxt.binance, ccxt.pro.binance):
    klass.fetch_markets = fetch_markets
async def no_network(*args, **kwargs):
    raise RuntimeError('Unexpected network request during offline backtest')
ccxt.Exchange.fetch = no_network
for symbol, pair in zip(symbols,pairs):
    for interval in ['5m','4h','1d']:
        raw = json.loads((root/f'{symbol}-{interval}.json').read_text())
        frame = pd.DataFrame(raw,columns=['date','open','high','low','close','volume'])
        frame['date'] = pd.to_datetime(frame['date'],unit='ms',utc=True)
        frame.to_feather(out/f"{pair.replace('/','_')}-{interval}.feather")
        if interval == '5m':
            for tf in ['15min','1h']:
                higher = frame.set_index('date').resample(tf).agg(
                    {'open':'first','high':'max','low':'min','close':'last','volume':'sum'}
                ).reset_index()
                higher.to_feather(out/f"{pair.replace('/','_')}-{tf.replace('min','m')}.feather")

config = dict(
    dry_run=True, dry_run_wallet=1000, trading_mode='spot', margin_mode='',
    stake_currency='USDT', stake_amount=100, tradable_balance_ratio=1,
    max_open_trades=int(cap), position_adjustment_enable=False, timeframe='5m',
    entry_pricing={'price_side':'same','use_order_book':False},
    exit_pricing={'price_side':'same','use_order_book':False},
    dataformat_ohlcv='feather', exchange={'name':'binance','key':'','secret':'',
        'pair_whitelist':pairs,'pair_blacklist':[],
        'ccxt_async_config':{'options':{'fetchCurrencies':False}}},
    pairlists=[{'method':'StaticPairList'}],
)
config_path = run/f'config-{cap}.json'
config_path.write_text(json.dumps(config))
main(['backtesting','-c',str(config_path),'--userdir',str(run),'--strategy-path',str(strategies),
      '--strategy','FixedNFI','--datadir',str(out),'--timerange',span[:8] + '-' + str(int(pd.Timestamp(span[9:], tz='UTC').timestamp()) - 1),'--fee',fee,
      '--cache','none','--export','trades','--backtest-directory',str(results)])
