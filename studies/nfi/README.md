# NostalgiaForInfinity X8 · Binance Spot deneyi

NFI X8 v18.0.265 ([kaynak revizyonu](https://github.com/iterativv/NostalgiaForInfinity/blob/f8af377b919adedc135c6c9aad2ab46ebd12266f/NostalgiaForInfinityX8.py)) Freqtrade 2026.9 ve CCXT 4.5.92 ile çalıştırıldı. Deney Binance Spot BTC/USDT, ETH/USDT ve SOL/USDT paritelerinin 5 dakikalık kapanmış mumlarını kullandı. Parite başına gösterge geçmişi dahil 40.896 adet 5 dakikalık, 1.482 adet 4 saatlik ve 917 adet günlük mum alındı. 15 dakikalık ve saatlik mumlar 5 dakikalık veriden üretildi.

İki dönem birbirinden bağımsız olarak 1.000 USDT sanal nakitle başladı. NFI'da pozisyon büyütme kapatıldı ve stratejinin özel tutar hesaplaması yerine 100 USDT emir tutarı kullanıldı. NFI kendi giriş ve çıkış kurallarını korudu. İşlem ücreti iki motorda da yön başına %0,10. Freqtrade mum fiyatlarından yaklaşık dolum yapar ve NFI koşusuna ayrıca kayma eklenmedi. Coin Tarayıcı simülasyonu 100 USDT toplam alım bütçesi, yön başına %0,05 kayma ve %0,10 varsayımsal alış-satış farkı kullandı. Sonuçlar bu yürütme farklarıyla birlikte okunmalı.

| Dönem (UTC, bitiş hariç) | Limit | NFI ham alım sinyali / işlem | NFI net % | Coin Tarayıcı işlem | Coin Tarayıcı net % | Coin Tarayıcı azami düşüş % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 Ağustos–10 Ekim 2026 | 1 | 0 / 0 | 0,00 | 49 | −0,48 | 2,26 |
| 1 Ağustos–10 Ekim 2026 | 2 | 0 / 0 | 0,00 | 77 | −0,95 | 3,52 |
| 1 Ağustos–10 Ekim 2026 | 3 | 0 / 0 | 0,00 | 92 | +0,08 | 3,90 |
| 10 Ekim–16 Kasım 2026 | 1 | 0 / 0 | 0,00 | 1 | −0,11 | 0,22 |
| 10 Ekim–16 Kasım 2026 | 2 | 0 / 0 | 0,00 | 2 | −0,30 | 0,41 |
| 10 Ekim–16 Kasım 2026 | 3 | 0 / 0 | 0,00 | 2 | −0,30 | 0,41 |

NFI üç paritede de ham alım sinyali üretmedi. NFI'nin %0 getirisi işlem yapılmayan cüzdanı gösterir. Bu deneyde etkin bir NFI işlem örneği, kayma karşılaştırması veya sanal ileri test sonucu oluşmadı. Projenin kendi önerisi daha geniş bir parite listesidir. Coin Tarayıcı'nın son döneminde de örneklem küçük kaldı.

## Tekrar çalıştırma

Python 3.12, Freqtrade 2026.9, CCXT 4.5.92 ve Node.js kullanın. Veri ve strateji kodu çalışma dizinine alınır. Strateji SHA-256 ile doğrulanır. API anahtarı ve hesap bağlantısı gerekmiyor.

```sh
python -m venv /tmp/nfi-venv
/tmp/nfi-venv/bin/pip install freqtrade==2026.9 ccxt==4.5.92
/tmp/nfi-venv/bin/python studies/nfi/data.py /tmp/nfi-data
for period in 20260801-20261010 20261010-20261116; do
  for limit in 1 2 3; do
    /tmp/nfi-venv/bin/python studies/nfi/bench.py /tmp/nfi-data "$limit" 0.001 "$period"
  done
done
node studies/nfi/baseline.cjs /tmp/nfi-data
```

Freqtrade koşuları yerel mum ve Binance pazar meta verisi ile çalışır. Raporlar çalışma dizinindeki her koşunun `results` dizinine yazılır.
