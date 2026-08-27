# Supertrend Tarayıcı — BIST

BIST hisselerinde **Supertrend** indikatörünün günlük grafikte AL / SAT sinyali ürettiği
hisseleri bulur. Veri kaynağı TradingView'dir; ücretli üyelik gerekmez.

Tarama her iş günü (Pazartesi–Cuma) **18:45 Türkiye saatinde** GitHub'ın sunucularında
otomatik çalışır. Bilgisayarın açık olması gerekmez.

## Günlük rapor sayfası

Renkli, telefona uygun özet: **https://smhylmz23.github.io/supertrend/**

## Sonuçlar

| Dosya | İçerik |
|-------|--------|
| [`SON-TARAMA.txt`](SON-TARAMA.txt) | En son taramanın okunabilir raporu |
| [`sonuclar/son.csv`](sonuclar/son.csv) | En son sonuç, tablo formatında (adresi hep aynı kalır) |
| `sonuclar/<tarih>.txt` | Geçmiş taramaların arşivi |

## Google E-Tablolar'a bağlamak

Boş bir E-Tabloda A1 hücresine:

```
=IMPORTDATA("https://raw.githubusercontent.com/KULLANICI/DEPO/main/sonuclar/son.csv"; ";"; "tr_TR")
```

Tablo kendi kendine güncellenir; telefondan da açılabilir.

## Ayarlar

Varsayılan: ATR 10, Çarpan 3, günlük periyot — TradingView'in fabrika ayarlarıyla aynı.

Elle çalıştırmak için:

```bash
node supertrend-tarayici.mjs                        # günlük AL sinyalleri
node supertrend-tarayici.mjs --sinyal hepsi --csv   # AL + SAT, CSV çıktısı
node supertrend-tarayici.mjs --periyot 1W           # haftalık tarama
node supertrend-tarayici.mjs --min-hacim 50000000   # düşük hacimlileri ele
```

Node.js dışında hiçbir bağımlılığı yoktur.

## Not

50 günden az işlem geçmişi olan hisseler (yeni halka arzlar) hesaplamaya dahil
edilmez — ATR'nin oturması için yeterli veri olmadığından sinyal güvenilir olmaz.
Bu hisseler raporun sonunda ayrıca listelenir.
