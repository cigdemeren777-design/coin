# Canlı Coin Tarayıcı kurulumu

## Safari

Panelde **Canlı Spot Tarama → Taramayı başlat**. Etkin Binance Spot USDT pariteleri borsa listesinden belirlenir. Saat başında tüm liste istek sınırına uyan gruplarla taranır. Aday ve açık pozisyon fiyatları yaklaşık dört saniyede bir yenilenir. İlk tarama her parite için geçmiş mumları topladığı için sonraki taramalardan daha fazla internet kullanır. Yeterli geçmişi olmayan yeni pariteler ve veri hataları ekranda sayılır. Kapanmış 1 saatlik mumda EMA50 > EMA200, kapanış son 20 mumun en yüksek fiyatından büyük ve hacim pozitif ise Şimdi Al adayı oluşur. Aday ilk beş dakika içinde ve alış fiyatı sinyalden en fazla %0,5 uzaktayken değerlendirilebilir. Spread sınırı %0,2. Aynı mum ve parite tekrar alınmaz.

Her yeni sanal alım 100 USDT, azami iki açık pozisyon. Fiyat, spread, %0,10 ücret ve her yönde %0,05 kayma hesaba katılır. Stop girişe göre 2 ATR veya en az %0,8 uzakta. Hedef 2R ve süre sınırı 48 saat. Zirveye göre %10 cüzdan düşüşü yeni işlemleri kilitler. Cüzdan bu tarayıcıya aittir. Sayfa arka plana geçince tarama durur; o arada görülemeyen fiyatlar sonradan gerçekleşmiş işlem sayılmaz. Yayımlanmış saatlik veri paketi geçmiş test ekranına aittir; canlı tarama ayrı istekler kullanır.

## 7/24 sanal sunucu

Bir bilgisayarın veya VPS'in sürekli açık olması gerekir. GitHub Pages mobil ekranı sunar. Aşağıdaki süreç sürekli açık makinede çalışır:

```sh
docker compose -f compose.paper.yml up -d --build
docker compose -f compose.paper.yml logs -f paper
docker compose -f compose.paper.yml exec paper node -e "fetch('http://127.0.0.1:8766/paper-state').then(r=>r.json()).then(console.log)"
```

Sanal otomatik alımı açmak için sunucunun ortamına `PAPER_AUTO=1` verip servisi başlat. Varsayılan durum tarama ve sinyal üretimidir. Stop, hedef ve süre çıkışı mevcut sanal pozisyonlarda çalışır. Cüzdan Docker volume içinde kalır. Tek süreç çalıştır; volume silme işlemi cüzdanı siler. Durum API'si konteyner içinde localhost'a bağlıdır. Safari cüzdanıyla sunucu cüzdanı ayrıdır. Her iki cüzdanı birleştiren kimlik doğrulamalı bağlantı henüz kurulmadı.

## Gerçek para bağlantısı için geçiş koşulları

Önce sunucu yerleştirme, kesinti ve tekrar başlatma denemeleri, ardından yeterli sayıda ileri dönem sanal işlem ve risk sınırlarının gözden geçirilmesi gerekir. Sonraki adım ayrı bir Binance Spot Testnet bağlayıcısıdır. Emirler için benzersiz istemci kimliği, lot ve tutar kontrolleri, kısmi dolum, belirsiz yanıt sonrası emir sorgulama, borsa bakiyesiyle uzlaştırma ve durdurma anahtarı doğrulanır. Gerçek spot emir bağlayıcısı ve anahtar kurulumu ayrıca ele alınır. Anahtarlar sunucuda saklanır ve çekim izni verilmez.

Bu sürümde tarayıcı ve sunucu yalnızca kamu piyasa verisine bağlanır. GitHub depo ayarına anahtar girilmez. Varlık evrenini genişletmeden önce likidite filtresi ve Binance istek bütçesi tasarlanmalıdır.
