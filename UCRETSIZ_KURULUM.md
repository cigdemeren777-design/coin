# Ücretsiz 7/24 sanal takip

Hedef bir Oracle Cloud Always Free Linux sunucusu ve iPhone'da ücretsiz Tailscale Personal. Oracle hesabını ücretliye yükseltmeyin. Ücretli kaynak veya deneme kredisi gerektiren ayar seçmeyin. Kurulum yalnızca sanal işlemdir.

## Sunucu oluşturma

1. [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) hesabını açın. Oracle kimlik doğrulaması için uygun kredi veya banka kartı isteyebilir. Kart bilgisini yalnızca Oracle'ın kendi formuna girin.
2. Konsolda Compute → Instances → Create instance ekranına gidin. Kendi ana bölgenizde, **Always Free-eligible** görünen Ubuntu ve **VM.Standard.A1.Flex** seçin. Bir OCPU, 2 GB RAM ve varsayılan ücretsiz disk yeterli başlangıç hedefidir. Mevcut kullanımınız varsa ücretsiz kotada kalan miktarı kontrol edin.
3. Ücretsiz kapasite yoksa bu kurulumu bekletin. Ücretli plana geçmeden önce kapasite yeniden kontrol edilebilir.
4. Sunucu açıldığında önce [VPS_KURULUM.md](VPS_KURULUM.md) içindeki Binance bağlantı testini sunucudan çalıştırın. Sunucu IP'sinin veri erişimi doğrulanmadan taramayı etkinleştirmeyin.
5. Aynı rehberdeki Tailscale ve Docker adımlarıyla özel sunucu panelini açın. Sonra sanal modda bağlantı, yeniden başlatma ve işlem kaydı kontrollerini yapın.

Oracle ücretsiz kaynaklarda kapasite ve boşta kalan sunucuların geri alınması nedeniyle kesintisiz çalışma garantisi vermez. 7/24 takibi ancak sunucu gerçekten kurulduğunda ve bağlantı testleri geçtiğinde başlar.

[Oracle ücretsiz kaynak ve kullanım sınırları](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) · [Oracle kayıt ve kart koşulları](https://www.oracle.com/cloud/free/faq/) · [Tailscale Personal](https://tailscale.com/pricing)
