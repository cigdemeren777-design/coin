# Coin Tarayıcı · iPhone / GitHub Pages

Binance Spot, BTCUSDT ve ETHUSDT'nin 1 saatlik mumlarını sağlar. GitHub Actions iki parite için 3.000'er kapanmış mumu tek bir JSON dosyasına yazar. GitHub Pages bu dosyayı ve statik araştırma panelini aynı adresten sunar. iPhone'da panel Safari'den açılır. Panelde son mum kapanış saati görünür. İki saati aşan veri eski olarak işaretlenir. Yenileme sırasında iki pariteden biri alınamazsa o çalıştırma başarısız olur ve önceki yayın kalır. Saatlik GitHub Actions çalışmaları gecikebilir.

## Kurulum

1. Arşivdeki dosyaları GitHub deposunun köküne yükleyin. Gizli klasör olan `.github/workflows` içindeki `pages.yml` dosyasının da depoya eklendiğini kontrol edin.
2. Depoda **Settings → Pages → Source → GitHub Actions** seçin. Pages yayını herkese açıktır.
3. **Actions → Coin Tarayici Pages → Run workflow** ile ilk çalıştırmayı başlatın. İş akışı varsayılan dalda olmalı.
4. Dağıtım başarılı olursa **Settings → Pages → Visit site** bağlantısını Safari'de açın ve **GitHub verisini al** düğmesine basın.

Panel sanal portföy backtesti, al-tut kıyası ve ileri dönem deneyi içerir. V7'nin çalışan Python sunucusuna bağlı haber arşivi ve canlı sanal cüzdanı bu mobil paketin kapsamı dışındadır. Hazır veri paketi oluşturulmadıysa panel yerel JSON yüklemeyi de destekler.

Doğrulama: Test verisiyle 3.000+3.000 mum, kapanış eşleştirme, statik dosya üretimi ve bir kaynak hatasında önceki paketin korunması geçti. Canlı Binance denemesinde bağlantı zaman aşımına uğradı. GitHub Actions, Pages yayını ve iPhone Safari üzerinde uçtan uca çalışma doğrulanmadı.

## Mobil haber bölümü

Yayınla birlikte Fed, ECB, BLS ve SEC'in en yeni başlıkları kontrol edilir. Panel son kontrol saatini, erişilemeyen kaynakları ve yayın tarihlerini gösterir. Haber başlıkları ve bağlantıları yayımlanır. RSS akışı erişilemezse o kaynak boş olarak işaretlenir ve piyasa verisi yayımlanmaya devam eder. Bu bölüm geçmiş haber arşivi ve backtest için ilk görülme kaydı sağlamaz.
