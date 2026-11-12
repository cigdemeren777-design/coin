# iPhone’dan 7/24 sanal tarayıcı

Bu kurulum için sürekli açık Linux VPS, Docker Compose ve iPhone ile VPS'in aynı özel Tailscale ağına bağlı olması gerekir. Panel bu ağda görüntüleme içindir. Mevcut halka açık GitHub Pages ekranı kendi cihazındaki ayrı sanal cüzdanı kullanır.

Sunucuyu seçmeden önce Binance kamu veri erişimini sunucunun kendisinden kontrol edin:

```sh
curl --fail --max-time 12 'https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1'
```

JSON dönmelidir. IP bölgesi nedeniyle erişim reddedilirse bu sunucuda tarama sağlıklı çalışmaz.

1. Linux VPS'e Docker Compose ve Tailscale kurun. VPS ve iPhone'da aynı özel ağda oturum açın. Ağ üyelerinizin erişim izinlerini gözden geçirin.
2. Bu depoyu sunucuya alın. Depo klasöründe aşağıdaki komutu çalıştırın:

```sh
sh start-paper-vps.sh
```

3. Tailscale'in verdiği özel `https://…ts.net/` adresini iPhone’da Safari ile açın. İlk fiyat gelince **Tarama aktif** görünür.
4. Sanal otomatik alımı açmak için `PAPER_AUTO=1 sh start-paper-vps.sh` çalıştırın. Varsayılan mod yalnızca sinyal takibidir. Veri klasörü Docker volume'da korunur.

Özel erişim için Tailscale Serve kullanılır. Docker portu VPS'in yalnızca loopback adresine yayımlanır. Sunucu cüzdanı halka açık GitHub adresine veya GitHub deposuna gönderilmez. VPS hizmeti kapanırsa panel taramayı güncel olarak gösteremez; Docker yeniden başlatma ayarı servis açılışında süreci ayağa kaldırır.

Bu kurulum gerçek emir ve borsa anahtarı gerektirmez. VPS sağlayıcısında satın alma ve Tailscale hesap kurulumu kullanıcıya aittir.
