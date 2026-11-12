"""Package only the public mobile research panel and validated Binance candles."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import shutil
import time
from xml.etree.ElementTree import ParseError

from providers import FEEDS, HOUR, feed_items, get, market_bars

ROOT = Path(__file__).resolve().parent
FILES = ("index.html", "core.js", "research.js", "experiments.js", "research-ui.js", "mobile-news.js",
         "live-paper.js", "live-paper-ui.js", "live-replay.js", "panel.css", "lwc.js", "market-chart.js",
         "LIGHTWEIGHT_CHARTS_LICENSE.txt", "LIGHTWEIGHT_CHARTS_NOTICE.txt")


OFFICIAL_FEEDS = {name: feed for name, feed in FEEDS.items() if feed[2] == "resmî"}


def public_news(fetch=get, clock=time.time):
    def read_source(source):
        name, (url, domain, tier) = source
        try:
            items = feed_items(url, domain, tier, fetch(url))
        except (ParseError, ValueError, OSError):
            return {"source": name, "status": "unavailable", "items": []}
        ordered = sorted(items, key=lambda item: item["published"] or 0, reverse=True)
        return {
            "source": name, "status": "ok",
            "items": [{key: item[key] for key in ("title", "url", "published")}
                      for item in ordered[:8]],
        }

    with ThreadPoolExecutor(max_workers=len(OFFICIAL_FEEDS)) as pool:
        sources = list(pool.map(read_source, OFFICIAL_FEEDS.items()))
    return {"schema": 1, "checkedAt": int(clock() * 1000), "sources": sources}


def write_json(output, name, value):
    temp = output / (name + ".tmp")
    temp.write_text(json.dumps(value, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    temp.replace(output / name)


def build(output, load=market_bars, clock=time.time, load_news=public_news):
    until = int(clock() * 1000) // HOUR * HOUR
    candles = {symbol: load(symbol, until) for symbol in ("BTCUSDT", "ETHUSDT")}
    output.mkdir(parents=True, exist_ok=True)
    for filename in FILES:
        shutil.copyfile(ROOT / filename, output / filename)
    snapshot = {
        "schema": 1, "source": "Binance Spot", "until": until,
        "fetchedAt": int(clock() * 1000), "data": candles,
    }
    write_json(output, "snapshot.json", snapshot)
    write_json(output, "news.json", load_news(clock=clock))


if __name__ == "__main__":
    build(ROOT / "_site")
