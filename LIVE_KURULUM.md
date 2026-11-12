# Canlı Coin Tarayıcı kurulumu

## Safari

Panel açılınca **Canlı Spot Tarama** otomatik başlar. Etkin Binance Spot USDT pariteleri borsa listesinden belirlenir. İlk açılışta ve saat başında kapanmış mum geçmişi gruplarla hazırlanır. Sistem tüm paritelerin alış ve satış fiyatlarını yaklaşık 6 saniyede bir kontrol eder. Kapanmış 1 saatlik mumlarda EMA50 > EMA200 ise ve canlı en iyi alış (bid) son 20 kapanmış mumun zirvesini aşarsa aday oluşur. Aday, fiyat koşulları ilk kez sağlandığında en çok 5 dakika geçerli olur. Şimdi Al alanı elenme sayılarını ve izlemeye alınabilecek zirveye yakın coinleri gösterir. Fiyat zirvenin altına inerse aday kalkar. Ödenecek alış fiyatı zirvenin en fazla %0,5 üstünde olabilir ve spread sınırı %0,2’dir. Aynı saat ve parite tekrar alınmaz. İlk tarama sırasında hazırlığı tamamlanan coinler değerlendirmeye girer. Geçmiş test bölümü saat kapanışı kurallarını kullanır ve canlı fiyatla tetiklenen bu sürümün birebir testi değildir.

**Sanal işlem ayarları** bölümünde en fazla 1, 2 veya 3 açık işlem seç ve alım başına USDT tutarını yaz. **Ayarları kaydet** düğmesi seçimi bu tarayıcının cüzdanına kaydeder. Eski cüzdanlar iki işlem ve 100 USDT ile devam eder. Sınırı düşürmek açık pozisyonları kapatmaz. Tutar değişikliği sonraki alımlara uygulanır. Tutar, alış ücreti dahil toplam sanal harcamadır.

Model her yönde %0,10 ücret ve %0,05 kayma kullanır. Alım için emir defterinin en iyi alış ve satış seviyelerinde yeterli miktar aranır. Stop, hedef veya süre tetiklendiğinde en iyi alış miktarı yetersizse çıkış bekler ve fiyat değişebilir. Tahmini cüzdan değeri en iyi alıştan hesaplanır. Model kısmi dolum veya defterin daha derin seviyelerini simüle etmez. Stop girişe göre 2 ATR veya en az %0,8 uzakta. Hedef 2R ve süre sınırı 48 saat. Zirveye göre %10 cüzdan düşüşü yeni işlemleri kilitler. Sayfa arka plana geçince tarama durur. Bu sırada görülemeyen fiyatlar sonradan gerçekleşmiş işlem sayılmaz.

## 7/24 sanal sunucu

Bir bilgisayarın veya VPS'in sürekli açık olması gerekir. GitHub Pages mobil ekranı sunar. Aşağıdaki süreç sürekli açık makinede çalışır:

```sh
docker compose -f compose.paper.yml up -d --build
docker compose -f compose.paper.yml logs -f paper
docker compose -f compose.paper.yml exec paper node -e "fetch('http://127.0.0.1:8766/paper-state').then(r=>r.json()).then(console.log)"
```

Sanal otomatik alımı açmak için sunucunun ortamına `PAPER_AUTO=1` verip servisi başlat. Varsayılan durum tarama ve sinyal üretimidir. Stop, hedef ve süre çıkışı mevcut sanal pozisyonlarda çalışır. Cüzdan Docker volume içinde kalır. Tek süreç çalıştır; volume silme işlemi cüzdanı siler. Durum API'si konteyner içinde localhost'a bağlıdır. Safari cüzdanıyla sunucu cüzdanı ayrıdır. Her iki cüzdanı birleştiren kimlik doğrulamalı bağlantı henüz kurulmadı.

## Binance hesabına para yatırma

Panel, Binance’in kripto yatırma sayfasına ve Binance TR’nin yatırma ekranına yönlendirir. Yatırılan bakiye kullanıcının borsa hesabında kalır. Panel ve sanal sunucu kamu piyasa verisini okur. Borsa bakiyesi, API anahtarı ve gerçek emir bağlantısı kapalıdır. [Binance TR TL yatırma rehberi](https://www.binance.tr/tr/support/faq/deposit/binance-tr-uygulamas%C4%B1ndan-try-yat%C4%B1rma-170ea10b7c7140f7ad0286dcb939aa57)
