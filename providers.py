"""Fixed public data endpoints and shared HTTP cooldowns."""
from datetime import datetime
from email.utils import parsedate_to_datetime
from hashlib import sha256
import json
import math
import re
from threading import Lock
import time
from urllib.error import HTTPError
from urllib.parse import urlencode, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import xml.etree.ElementTree as ET

HOUR = 3600000
MARKET = "https://data-api.binance.vision"
FEEDS = {
    "Fed": ("https://www.federalreserve.gov/feeds/press_all.xml", "federalreserve.gov", "resmî"),
    "ECB": ("https://www.ecb.europa.eu/rss/press.html", "ecb.europa.eu", "resmî"),
    "BLS": ("https://www.bls.gov/feed/bls_latest.rss", "bls.gov", "resmî"),
    "SEC": ("https://www.sec.gov/news/pressreleases.rss", "sec.gov", "resmî"),
    "CoinDesk": ("https://www.coindesk.com/arc/outboundfeeds/rss/", "coindesk.com", "medya"),
}
ALLOWED = {urlsplit(MARKET).hostname, *(urlsplit(feed[0]).hostname for feed in FEEDS.values())}
ALLOWED.update({"coindesk.com", "sec.gov", "bls.gov", "ecb.europa.eu", "federalreserve.gov"})


def permitted(url):
    parsed = urlsplit(url)
    return parsed.scheme == "https" and parsed.netloc.lower() in ALLOWED


class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not permitted(newurl):
            raise ValueError("Yönlendirme izinli kaynak dışında")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


opener = build_opener(SafeRedirect())
blocked = {}
lock = Lock()


def get(url):
    if not permitted(url):
        raise ValueError("İzinli kaynak dışında")
    host = urlsplit(url).hostname
    with lock:
        if blocked.get(host, 0) > time.monotonic():
            raise ValueError("Kaynak istek sınırı nedeniyle beklemede")
    try:
        request = Request(url, headers={"User-Agent": "CoinTarayiciResearch/7.0 (local RSS reader)"})
        with opener.open(request, timeout=8) as response:
            data = response.read(4_000_001)
    except HTTPError as error:
        if error.code in (418, 429, 503):
            value = error.headers.get("Retry-After", "")
            try:
                delay = float(value)
            except ValueError:
                try:
                    delay = parsedate_to_datetime(value).timestamp() - time.time()
                except (ValueError, TypeError, OverflowError):
                    delay = 0
            with lock:
                blocked[host] = time.monotonic() + max(120 if error.code == 418 else 60, delay)
        raise
    if len(data) > 4_000_000:
        raise ValueError("Yanıt boyutu sınırı aşıldı")
    return data


def market_bars(symbol, until, fetch=get):
    rows = []
    end = until - 1
    for _ in range(3):
        query = urlencode(dict(symbol=symbol, interval="1h", limit=1000, endTime=end))
        page = json.loads(fetch(MARKET + "/api/v3/klines?" + query))
        if not isinstance(page, list) or not page:
            raise ValueError("Boş mum yanıtı")
        rows = page + rows
        end = page[0][0] - 1
    bars = []
    previous = None
    for row in rows:
        t = row[0]
        o, h, low, c, v = map(float, row[1:6])
        if (not isinstance(t, int) or t % HOUR or row[6] != t + HOUR - 1
                or t + HOUR > until or (previous is not None and t != previous + HOUR)
                or not all(map(math.isfinite, (o, h, low, c, v))) or v < 0
                or not 0 < low <= min(o, c) <= max(o, c) <= h):
            raise ValueError("Mum biçimi veya zaman dizisi geçersiz")
        bars.append(dict(t=t, o=o, h=h, l=low, c=c, v=v))
        previous = t
    if len(bars) != 3000 or bars[-1]["t"] + HOUR != until:
        raise ValueError("Eksik veya eski mum verisi")
    return bars


def published_ms(value):
    try:
        stamp = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        try:
            stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return int(stamp.timestamp() * 1000) if stamp.tzinfo else None


def feed_items(url, domain, tier, data):
    if re.search(rb"<!\s*(?:DOCTYPE|ENTITY)", data, re.I):
        raise ValueError("XML belge türüne izin verilmiyor")
    root = ET.fromstring(data)
    atom = "{http://www.w3.org/2005/Atom}"
    items = []
    seen = set()
    for node in (root.findall(".//item") or root.findall(f".//{atom}entry"))[:40]:
        title = " ".join((node.findtext("title") or node.findtext(atom + "title") or "").split())[:500]
        date = (node.findtext("pubDate") or node.findtext(atom + "published")
                or node.findtext("{http://purl.org/dc/elements/1.1/}date") or "")
        link = node.findtext("link")
        if not link:
            link = next((tag.get("href") for tag in node.findall(atom + "link")
                         if tag.get("rel", "alternate") == "alternate"), "")
        if not link or not title:
            continue
        parsed = urlsplit(urljoin(url, link))
        host = parsed.hostname or ""
        if parsed.scheme != "https" or parsed.username or parsed.password or not (
                host == domain or host.endswith("." + domain)):
            continue
        canonical = parsed._replace(fragment="").geturl()
        published = published_ms(date)
        if published is not None and published > time.time() * 1000 + 60_000:
            published = None
        digest = sha256(json.dumps([title, published], ensure_ascii=False).encode()).hexdigest()
        if (canonical, digest) in seen:
            continue
        seen.add((canonical, digest))
        items.append(dict(title=title, url=canonical, published=published,
                          hash=digest, officialDomain=tier == "resmî", tier=tier))
    if not items:
        raise ValueError("Akışta kabul edilen kayıt yok")
    return items
