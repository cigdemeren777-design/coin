"""Package only the public mobile research panel and validated Binance candles."""
import json
from pathlib import Path
import shutil
import time

from providers import HOUR, market_bars

ROOT = Path(__file__).resolve().parent
FILES = ("index.html", "core.js", "research.js", "experiments.js", "research-ui.js")


def build(output, load=market_bars, clock=time.time):
    until = int(clock() * 1000) // HOUR * HOUR
    candles = {symbol: load(symbol, until) for symbol in ("BTCUSDT", "ETHUSDT")}
    output.mkdir(parents=True, exist_ok=True)
    for filename in FILES:
        shutil.copyfile(ROOT / filename, output / filename)
    snapshot = {
        "schema": 1, "source": "Binance Spot", "until": until,
        "fetchedAt": int(clock() * 1000), "data": candles,
    }
    temp = output / "snapshot.tmp"
    temp.write_text(json.dumps(snapshot, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    temp.replace(output / "snapshot.json")


if __name__ == "__main__":
    build(ROOT / "_site")
