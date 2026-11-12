# Coin Tarayıcı · iPhone / GitHub Pages

Canlı tarama Binance Spot USDT paritelerini ve herkese açık emir defterini kullanır. Sanal cüzdan ve işlem ayarları tarayıcıda saklanır. GitHub Actions, BTCUSDT ve ETHUSDT için 3.000'er kapanmış saatlik mumu ve resmî haber başlıklarını yayımlar. Veri paketinin son kapanışı panelde görünür. İki saati aşan paket eski olarak işaretlenir. Saatlik GitHub Actions çalışmaları gecikebilir.

## Kurulum

1. Arşivdeki dosyaları GitHub deposunun köküne yükleyin. Gizli klasör olan `.github/workflows` içindeki `pages.yml` dosyasının da depoya eklendiğini kontrol edin.
2. Depoda **Settings → Pages → Source → GitHub Actions** seçin. Pages yayını herkese açıktır.
3. **Actions → Coin Tarayici Pages → Run workflow** ile ilk çalıştırmayı başlatın. İş akışı varsayılan dalda olmalı.
4. Dağıtım başarılı olursa **Settings → Pages → Visit site** bağlantısını tarayıcıda açın. Canlı tarama ve veri yenileme sayfa görünürken otomatik çalışır.

Sanal işlem ayarları, fiyatın yanı sıra emir defterindeki miktar kontrolü ve isteğe bağlı yerel sunucu için [canlı kurulum rehberini](LIVE_KURULUM.md) açın. Panel saatlik portföy ve walk-forward testleri için JSON içe aktarmayı destekler.

## Canlı kırılım testi

Panelden son 28 günlük Binance 5 dakikalık mumlarıyla test çalıştırılabilir. Geliştirme ve test dönemleri kronolojik olarak ayrılır ve her dönem 1.000 USDT ile başlar. Emir defteri bulunmadığı için %0,10 alış-satış farkı varsayılır. Giriş sonraki mumun açılışında tekrar kontrol edilir. Aynı mumda stop ve hedef görülürse stop önceliklidir. Açık pozisyonlar dönem sonu getirisinde değerlenir. Kârla kapanan işlem oranının paydası kapanmış işlemlerdir.

84 günlük yerel ölçüm 20 Ağustos–12 Kasım 2026 UTC tarihlerini kapsadı. BTC ve ETH için parite başına 24.192 adet 5 dakikalık mum ve 2.266 adet saatlik mum kullanıldı. Test penceresi 17 Ekim 2026 19.00 UTC’de başladı.

| Dönem ve kural | Kapanan | Kârla kapanan | Net getiri |
| --- | ---: | ---: | ---: |
| İlk %70 · mevcut kural | 48 | 14 | −%1,66 |
| İlk %70 · EMA50 eğimi | 44 | 12 | −%1,80 |
| Son %30 · mevcut kural | 1 | 0 | −%0,11 |
| Son %30 · EMA50 eğimi | 1 | 0 | −%0,11 |

EMA50 eğimi filtresi deneyde tutuldu. Son dönemdeki örneklem doğruluk artışını ölçmek için yetersizdir. Veri SHA-256 özeti `150622fa24cf48a6f3d7a8d3f2ac7c8c3e48986fda7df92f7d13debf2b9f815e`.

Yayımdan önce `node --test tests/*.test.js` çalışır. Testler ayarların kaydını, eski cüzdanın açılmasını, bakiye ve açık işlem sınırını, stop ve hedefi, gecikmiş çıkışı, istek sınırını, mum boşluklarını ve gelecekteki fiyatların önceki test sonucunu değiştirmediğini denetler.

## Mobil haber bölümü

Yayınla birlikte Fed, ECB, BLS ve SEC'in en yeni başlıkları kontrol edilir. Panel son kontrol saatini, erişilemeyen kaynakları ve yayın tarihlerini gösterir. Haber başlıkları ve bağlantıları yayımlanır. RSS akışı erişilemezse o kaynak boş olarak işaretlenir ve piyasa verisi yayımlanmaya devam eder. Bu bölüm geçmiş haber arşivi ve backtest için ilk görülme kaydı sağlamaz.
