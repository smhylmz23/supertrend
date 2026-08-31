/*
 * rapor.mjs — Ham tarama sonucunu insanin okuyabilecegi hale getirir.
 *   1) sadeListe()  -> kisa, sirali, dusunmeden okunan CSV
 *   2) htmlRapor()  -> telefonda ve masaustunde acilan bento panel
 */

// ---------- ortak degerlendirme ----------
export function degerlendir(x) {
  const o = x.osilator;

  // yildiz: kullanicinin kendi konfluans skoruna gore (uydurma formul yok)
  const yildiz = x.skor >= 95 ? 5 : x.skor >= 90 ? 4 : x.skor >= 85 ? 3 : x.skor >= 75 ? 2 : 1;

  const artilar = [];
  if (x.sTrend >= 30) artilar.push('trend güçlü');
  if (x.sMom >= 27) artilar.push('momentum tam');
  if (x.sVol >= 30) artilar.push('hacim destekli');
  if (x.rsGuclu) artilar.push('endeksten güçlü');
  if (x.htfBull) artilar.push('haftalık yukarı');
  if (o.alSayisi >= 5) artilar.push('osilatör ' + o.alSayisi + '/6');

  const uyarilar = [];
  if (x.divCnt >= 1) uyarilar.push('uyumsuzluk ' + x.divCnt + '/5');
  if (x.extR >= 2.1) uyarilar.push('aşırı uzamış (' + x.extR.toFixed(1) + '× ATR)');
  if (x.rsi >= 70) uyarilar.push('RSI aşırı alım');
  if (x.distCnt >= 3) uyarilar.push('dağıtım ' + x.distCnt + ' gün');
  if (x.climax) uyarilar.push('doruk hacim');
  if (x.momFade) uyarilar.push('momentum sönümü');
  if (x.volRat < 0.8) uyarilar.push('hacim zayıf');

  const riskSoz = x.risk <= 20 ? 'düşük' : x.risk <= 40 ? 'orta' : x.risk <= 60 ? 'yüksek' : 'çok yüksek';
  const karar = x.guclu ? 'GÜÇLÜ AL' : x.al ? 'AL' : 'İZLE';

  // engelleyen sebep: neden AL degil?
  let engel = '';
  if (!x.al && !x.guclu) {
    if (x.divCnt >= 3) engel = 'uyumsuzluk çok (' + x.divCnt + '/5)';
    else if (x.risk > 40) engel = 'risk yüksek (' + x.risk + ')';
    else if (!x.stBull) engel = 'Supertrend aşağı';
    else if (x.skor < 60) engel = 'skor düşük';
    else engel = 'fiyat EMA50 altında';
  }
  return { yildiz, artilar, uyarilar, riskSoz, karar, engel };
}

// siralama: once GUCLU AL, sonra AL, sonra izle; her grup icinde skor
export const sirala = (a, b) => {
  const d = (x) => (x.guclu ? 2 : x.al ? 1 : 0);
  return d(b) - d(a) || b.skor - a.skor;
};

/* Listeye girme kurallari (kullanici talebi):
 *  1) Supertrend AL pozisyonunda olmayan hisse hic giremez.
 *  2) Karari "IZLE" olup skoru 50'nin altinda kalanlar da giremez.
 */
export const listeyeUygun = (x) => {
  if (!x.stBull) return false;
  if (!x.al && !x.guclu && x.skor < 50) return false;
  return true;
};

export const suz = (satirlar) => satirlar.filter(listeyeUygun).sort(sirala);

// ---------- 1) SADE CSV ----------
export function sadeListe(satirlar) {
  const vir = (v) => String(v).replace('.', ',');
  const bas = ['sira', 'hisse', 'karar', 'skor', 'risk', 'potansiyel_%', 'osilator', 'temel', 'bilanco', 'haber', 'analist_hedef', 'haber_7gun'];
  const out = [bas.join(';')];
  suz(satirlar).forEach((x, i) => {
    const d = degerlendir(x);
    out.push([
      i + 1, x.ad, d.karar, vir(x.skor.toFixed(0)),
      d.riskSoz + ' (' + x.risk + ')',
      vir(x.potansiyel.toFixed(1)),
      x.osilator.alSayisi + '/6',
      x.temel || 'yok', x.bilanco || 'yok',
      (x.haberVeri || {}).durum || 'yok',
      (x.haberVeri || {}).hedef ? vir(x.haberVeri.hedef.toFixed(2)) : '',
      (x.haberVeri || {}).hafta || 0,
    ].join(';'));
  });
  return out.join('\r\n');
}

// ---------- 2) BENTO PANEL ----------
const kacis = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Tum BIST endeksleri, gruplanmis. Sadece "Capped / Equal Weighted / Return"
 * turevleri disarida: uye listeleri ana endeksle BIREBIR ayni oldugu icin
 * filtrede hicbir sey daraltmiyorlar (X100S = XU100'un ayni 100 hissesi). */
const ENDEKS_GRUP = [
  ['Ana endeksler', [
    ['XU030', 'BIST 30'], ['XU050', 'BIST 50'], ['XU100', 'BIST 100'],
    ['XYUZO', 'BIST 100-30'], ['XELOT', 'BIST 50-30'],
    ['XYLDZ', 'Yıldız Pazar'], ['XBANA', 'Ana Pazar'],
    ['XTUMY', 'BIST Tüm-100'], ['XUTUM', 'BIST Tüm'],
  ]],
  ['Sektör endeksleri', [
    ['XBANK', 'Bankacılık'], ['XUMAL', 'Mali'], ['XUSIN', 'Sınai'], ['XUHIZ', 'Hizmetler'],
    ['XUTEK', 'Teknoloji'], ['XBLSM', 'Bilişim'], ['XILTM', 'Telekomünikasyon'],
    ['XGIDA', 'Gıda & İçecek'], ['XKMYA', 'Kimya, Petrol, Plastik'],
    ['XMESY', 'Metal Eşya & Makine'], ['XMANA', 'Ana Metal'], ['XELKT', 'Elektrik'],
    ['XINSA', 'İnşaat'], ['XTEKS', 'Tekstil & Deri'], ['XKAGT', 'Orman, Kâğıt, Basım'],
    ['XTAST', 'Taş & Toprak'], ['XTCRT', 'Ticaret'], ['XULAS', 'Ulaştırma'],
    ['XTRZM', 'Turizm'], ['XMADN', 'Madencilik'], ['XSGRT', 'Sigorta'],
    ['XAKUR', 'Aracı Kurumlar'], ['XFINK', 'Finansal Kiralama & Faktoring'],
    ['XYORT', 'Yatırım Ortaklıkları'], ['XGMYO', 'Gayrimenkul Yat. Ort.'],
    ['XHOLD', 'Holding & Yatırım'], ['XSPOR', 'Spor'],
  ]],
  ['Tema endeksleri', [
    ['XTMTU', 'Temettü'], ['XTM25', 'Temettü 25'],
    ['XUSRD', 'Sürdürülebilirlik'], ['XSD25', 'Sürdürülebilirlik 25'],
    ['XKURY', 'Kurumsal Yönetim'], ['XHARZ', 'Halka Arz'], ['XKOBI', 'KOBİ Sanayi'],
    ['XKTUM', 'Katılım Tüm'], ['XK100', 'Katılım 100'], ['XK050', 'Katılım 50'],
    ['XK030', 'Katılım 30'], ['XKTMT', 'Katılım Temettü'], ['XSRDK', 'Katılım Sürdürülebilirlik'],
    ['X10XB', 'Likit 10 (banka dışı)'], ['XLBNK', 'Likit Bankalar'],
  ]],
  ['Şehir endeksleri', [
    ['XSIST', 'İstanbul'], ['XSANK', 'Ankara'], ['XSIZM', 'İzmir'], ['XSKOC', 'Kocaeli'],
    ['XSBUR', 'Bursa'], ['XSKAY', 'Kayseri'], ['XSBAL', 'Balıkesir'], ['XSMNS', 'Manisa'],
    ['XSTKR', 'Tekirdağ'], ['XSKON', 'Konya'], ['XSADA', 'Adana'], ['XSANT', 'Antalya'],
    ['XSAYD', 'Aydın'], ['XSDNZ', 'Denizli'],
  ]],
];
const SEKTOR_TR = {
  'Finance': 'Finans', 'Process Industries': 'Kimya & Temel Sanayi',
  'Producer Manufacturing': 'Üretim & Makine', 'Consumer Non-Durables': 'Gıda & Dayanıksız Tüketim',
  'Non-Energy Minerals': 'Madencilik & Çimento', 'Utilities': 'Enerji & Altyapı',
  'Consumer Services': 'Tüketici Hizmetleri', 'Consumer Durables': 'Dayanıklı Tüketim',
  'Technology Services': 'Teknoloji Hizmetleri', 'Distribution Services': 'Dağıtım & Toptan',
  'Retail Trade': 'Perakende', 'Industrial Services': 'Sanayi Hizmetleri',
  'Transportation': 'Ulaştırma', 'Electronic Technology': 'Elektronik Teknoloji',
  'Commercial Services': 'Ticari Hizmetler', 'Health Technology': 'Sağlık Teknolojisi',
  'Health Services': 'Sağlık Hizmetleri', 'Energy Minerals': 'Enerji Madenleri',
  'Communications': 'İletişim', 'Miscellaneous': 'Diğer',
};

export function htmlRapor(satirlar, stSinyalleri, tarih, gunIci, surum) {
  const SURUM = String(surum || Date.now());
  const liste = suz(satirlar);
  const gucluAdet = liste.filter((x) => x.guclu).length;
  const alAdet = liste.filter((x) => x.al && !x.guclu).length;
  const izleAdet = liste.filter((x) => !x.al && !x.guclu).length;

  const stKume = new Set((stSinyalleri || []).map((s) => String(s).trim().toUpperCase()));
  const stAdet = liste.filter((x) => stKume.has(x.ad)).length;
  const thAdet = liste.filter((x) => x.trendHacim).length;
  const daAdet = liste.filter((x) => x.dipAvi).length;
  const tmAdet = liste.filter((x) => x.temel === 'pozitif').length;
  const blAdet = liste.filter((x) => x.bilanco === 'pozitif').length;
  const hbAdet = liste.filter((x) => (x.haberVeri || {}).durum === 'pozitif').length;

  // endeks ve sektor secenekleri — sadece listede uyesi olanlar gosteriliyor
  const endeksGrupHtml = ENDEKS_GRUP.map(([grupAd, uyeler]) => {
    const dolu = uyeler
      .map(([kod, ad]) => [kod, ad, liste.filter((x) => (x.endeksler || []).includes(kod)).length])
      .filter(([, , n]) => n > 0);
    if (!dolu.length) return '';
    return '<optgroup label="' + kacis(grupAd) + '">'
      + dolu.map(([kod, ad, n]) => `<option value="${kod}">${kacis(ad)} (${n})</option>`).join('')
      + '</optgroup>';
  }).join('');
  const sektorSayim = {};
  for (const x of liste) { const s = x.sektor || ''; if (s) sektorSayim[s] = (sektorSayim[s] || 0) + 1; }
  const sektorSecenek = Object.entries(sektorSayim)
    .map(([s, n]) => [s, SEKTOR_TR[s] || s, n])
    .sort((a, b) => b[2] - a[2]);

  const haberIpucu = (x) => {
    const h = x.haberVeri;
    if (!h) return 'Haber verisi yok';
    const p = [];
    if (h.tavsiyeler && h.tavsiyeler.length) p.push('Son analist tavsiyeleri: ' + h.tavsiyeler.join(' · '));
    else p.push('Analist tavsiyesi bulunamadı — nokta bu yüzden renksiz');
    if (h.hedef) {
      const fark = ((h.hedef / x.kapanis - 1) * 100);
      p.push('Ortalama hedef fiyat ' + h.hedef.toFixed(2) + ' TL (' + (fark >= 0 ? '+' : '') + fark.toFixed(0) + '%)');
    }
    p.push('Son 7 günde ' + (h.hafta || 0) + ' haber, 90 günde ' + (h.toplamHaber || 0));
    if (h.sonBaslik) p.push('Son başlık: ' + h.sonBaslik);
    return p.join(' — ');
  };

  // rozet ipucu: puanin hangi rakamlardan geldigini yazar
  const yuzde = (v) => (typeof v === 'number' && isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(0) + '%' : '—');
  const oran = (v) => (typeof v === 'number' && isFinite(v) ? v.toFixed(2) : '—');
  const temelIpucu = (x) => {
    const t = x.temelDetay; if (!t || !t.medyan) return 'Temel veri yok';
    const m = t.medyan;
    return 'Piyasa medyanına göre — PD/DD ' + oran(t.pddd) + ' (medyan ' + oran(m.PDDD) + ')'
      + ' · ROE ' + yuzde(t.roe) + ' (medyan ' + yuzde(m.ROE) + ')'
      + ' · Net marj ' + yuzde(t.marj) + ' (medyan ' + yuzde(m.MARJ) + ')'
      + ' · Borç/Özkaynak ' + oran(t.borc) + ' (medyan ' + oran(m.BORC) + ')';
  };
  const bilancoIpucu = (x) => {
    const t = x.temelDetay; if (!t || !t.medyan) return 'Bilanço verisi yok';
    return 'Son çeyrek — '
      + 'Geçen yılın aynı çeyreğine göre: net kâr ' + yuzde(t.kar) + ' → ' + (t.yillikDurum || '—')
      + ' · Bir önceki çeyreğe göre: net kâr ' + yuzde(t.karQ) + ' → ' + (t.ceyrekDurum || '—')
      + ' · Gelir (yıllık) ' + yuzde(t.gelir) + ' → ' + (t.gelirDurum || '—')
      + ' — iyi/normal/kötü ayrımı piyasanın alt ve üst üçte birlik dilimine göre';
  };
  const mevsimIpucu = (x) => {
    const v = x.mevsim;
    if (!v || v.durum === 'yok') {
      return (v && v.ayAdi ? v.ayAdi + ' için ' : '') + 'yeterli geçmiş yok (en az 8 yıl gerekiyor)'
        + (v && v.toplam ? ' — elde ' + v.toplam + ' yıl var' : '');
    }
    return v.ayAdi + ' ayında son ' + v.toplam + ' yılın ' + v.artan + "'inde yükselmiş"
      + ' (%' + Math.round(v.oran * 100) + ')';
  };

  // ST AL verip listeye giremeyenler — sebebi hisseye gore degisir
  const listedekiler = new Set(liste.map((x) => x.ad));
  const hesaplananlar = new Map(satirlar.map((x) => [x.ad, x]));
  const stListeDisi = Array.from(stKume)
    .filter((s) => !listedekiler.has(s))
    .map((s) => {
      const x = hesaplananlar.get(s);
      if (!x) return kacis(s) + ' (yeterli geçmiş verisi yok)';
      if (!x.stBull) return kacis(s) + ' (Supertrend yönü aşağı)';
      return kacis(s) + ' (skor ' + x.skor.toFixed(0) + ' — 50 barajının altında)';
    });

  const kartlar = liste.map((x) => {
    const d = degerlendir(x);
    const sinif = x.guclu ? 'guclu' : x.al ? 'al' : 'izle';
    const stAl = stKume.has(x.ad);
    const riskSinif = x.risk <= 20 ? 'r-dusuk' : x.risk <= 40 ? 'r-orta' : 'r-yuksek';
    return `<article class="kart ${sinif}" data-durum="${sinif}" data-ad="${kacis(x.ad)}" data-sira="${liste.indexOf(x)}" data-skor="${x.skor.toFixed(2)}" data-risk="${x.risk}" data-pot="${x.potansiyel.toFixed(2)}" data-osc="${x.osilator.alSayisi}" data-st="${stAl ? 1 : 0}" data-th="${x.trendHacim ? 1 : 0}" data-da="${x.dipAvi ? 1 : 0}" data-tm="${x.temel || 'yok'}" data-bl="${x.bilanco || 'yok'}" data-hb="${(x.haberVeri || {}).durum || 'yok'}" data-sk="${kacis(x.sektor || '')}" data-ex="${kacis((x.endeksler || []).join(' '))}" data-mv="${(x.mevsim || {}).durum || 'yok'}">
  <div class="kart-ust">
    <div class="kimlik">
      <h3 class="ad">${kacis(x.ad)}${stAl ? '<i class="nokta" title="Supertrend bugün AL verdi"></i>' : ''}</h3>
      <span class="etiket e-${sinif}">${d.karar}</span>
    </div>
    <span class="skor">${x.skor.toFixed(0)}</span>
  </div>
  <div class="olcek"><i style="width:${Math.max(0, Math.min(100, x.skor))}%"></i></div>
  <div class="kart-alt">
    <span class="radar-bilgi"></span>
    <button class="radarBtn" type="button" title="Radarıma ekle" aria-label="${kacis(x.ad)} radarıma ekle">☆</button>
  </div>
  <dl class="metrik">
    <div><dt>Risk</dt><dd class="${riskSinif}">${x.risk}</dd></div>
    <div><dt>Potansiyel</dt><dd class="${x.potansiyel < 0.1 ? 'notr' : 'arti'}">${x.potansiyel < 0.1 ? 'zirve' : '+' + x.potansiyel.toFixed(1) + '%'}</dd></div>
    <div><dt>Osilatör</dt><dd>${x.osilator.alSayisi}<span class="bolu">/6</span></dd></div>
  </dl>
  <div class="analiz">
    <span class="rozet d-${x.temel || 'yok'}" title="${kacis(temelIpucu(x))}"><i></i>Temel</span>
    <span class="rozet d-${x.bilanco || 'yok'}" title="${kacis(bilancoIpucu(x))}"><i></i>Bilanço</span>
    <span class="rozet d-${(x.haberVeri || {}).durum || 'yok'}" title="${kacis(haberIpucu(x))}"><i></i>Haber</span>
    <span class="rozet d-${(x.mevsim || {}).durum || 'yok'}" title="${kacis(mevsimIpucu(x))}"><i></i>Mevsim</span>
  </div>
</article>`;
  }).join('\n');

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="BIST hisselerinin konfluans skoru ve osilatör durumu — her iş günü 18:45'te yenilenir.">
<meta name="theme-color" content="#0B0C0E">
<meta http-equiv="Cache-Control" content="no-cache, must-revalidate">
<title>BIST Günlük Tarama — ${kacis(tarih)}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%230B0C0E'/><path d='M7 21l5-6 4 3 9-10' stroke='%2334D07F' stroke-width='3' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --zemin:#0B0C0E;      /* duz siyah degil, hafif soguk antrasit */
    --yuzey:#131518;
    --yuzey-2:#181B1F;
    --cizgi:#23272C;
    --cizgi-2:#2E343A;
    --yazi:#F2F4F6;
    --yazi-2:#A8B0B8;
    --soluk:#6E767E;
    --yesil:#34D07F;      /* GUCLU AL */
    --yesil-loş:rgba(52,208,127,.13);
    --mavi:#6BA5F0;       /* AL */
    --mavi-loş:rgba(107,165,240,.13);
    --gri:#98A0A8;        /* IZLE */
    --gri-loş:rgba(152,160,168,.11);
    --uyari:#D9A441;
    --dusus:#D96A6A;
    --r-kart:14px;
    --r-ic:8px;
    --gecis:180ms cubic-bezier(.2,.7,.3,1);
  }
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{
    margin:0;background:var(--zemin);color:var(--yazi);
    font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    font-size:15px;line-height:1.5;
    -webkit-font-smoothing:antialiased;
    padding:28px clamp(16px,2.4vw,40px) 64px;
  }
  /* dijital duzlugu kiran cok hafif doku */
  body::after{
    content:'';position:fixed;inset:0;pointer-events:none;z-index:5;opacity:.028;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  .sarmal{max-width:2100px;margin-inline:auto}
  :focus-visible{outline:2px solid var(--yesil);outline-offset:2px;border-radius:4px}

  /* ---------- BENTO: ust bolum ---------- */
  .bento{display:grid;gap:12px;margin-bottom:14px;
    grid-template-columns:repeat(4,minmax(0,1fr))}
  .kutu{background:var(--yuzey);border:1px solid var(--cizgi);border-radius:var(--r-kart);padding:20px 22px}
  .kutu-baslik{grid-column:span 4;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}
  h1{margin:0;font-size:clamp(26px,3.1vw,44px);font-weight:800;letter-spacing:-.035em;line-height:1}
  .altbaslik{margin:8px 0 0;color:var(--soluk);font-size:13.5px}
  .altbaslik b{color:var(--yazi-2);font-weight:500}
  .sayac{display:flex;flex-direction:column;gap:6px}
  .sayac .n{font-size:clamp(30px,3.4vw,46px);font-weight:700;letter-spacing:-.04em;line-height:1;
    font-variant-numeric:tabular-nums}
  .sayac .e{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--soluk);font-weight:500}
  .kutu.vurgu{background:linear-gradient(160deg,var(--yesil-loş),var(--yuzey) 62%);border-color:rgba(52,208,127,.3)}
  .kutu.vurgu .n{color:var(--yesil)}

  /* ---------- uyari ---------- */
  .uyari{grid-column:1/-1;background:var(--yuzey);border:1px solid rgba(217,164,65,.42);
    border-left-width:3px;border-radius:var(--r-kart);padding:14px 18px;font-size:13.5px;color:var(--yazi-2)}
  .uyari b{display:block;color:var(--uyari);font-weight:600;margin-bottom:2px;font-size:14px}

  /* ---------- kontroller ---------- */
  .kontrol{position:sticky;top:0;z-index:4;background:var(--zemin);
    padding:12px 0;margin-bottom:14px;border-bottom:1px solid var(--cizgi)}
  .suzgec{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .suzgec button{
    font:inherit;font-size:13px;font-weight:500;color:var(--yazi-2);
    background:var(--yuzey);border:1px solid var(--cizgi);border-radius:999px;
    padding:8px 15px;cursor:pointer;transition:background var(--gecis),border-color var(--gecis),color var(--gecis),transform 90ms}
  .suzgec button:hover{background:var(--yuzey-2);border-color:var(--cizgi-2);color:var(--yazi)}
  .suzgec button:active{transform:scale(.97)}
  .suzgec button b{font-variant-numeric:tabular-nums;font-weight:600;opacity:.5;margin-left:5px}
  .suzgec button[aria-pressed="true"]{background:var(--yazi);border-color:var(--yazi);color:var(--zemin)}
  .suzgec button[aria-pressed="true"] b{opacity:.55}
  .ayrac{width:1px;height:24px;background:var(--cizgi);margin:0 3px}
  .suzgec input,.suzgec select{
    font:inherit;font-size:13px;color:var(--yazi);background:var(--yuzey);
    border:1px solid var(--cizgi);border-radius:999px;padding:8px 15px;transition:border-color var(--gecis)}
  .suzgec input{flex:1;min-width:140px}
  .suzgec input::placeholder{color:var(--soluk)}
  .suzgec input:hover,.suzgec select:hover{border-color:var(--cizgi-2)}
  .suzgec select{cursor:pointer;padding-right:32px;
    appearance:none;-webkit-appearance:none;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236E767E' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat:no-repeat;background-position:right 14px center}

  /* ---------- BENTO: hisse izgarasi ---------- */
  #liste{display:grid;gap:12px;
    grid-template-columns:repeat(auto-fill,minmax(268px,1fr))}
  /* sade kutu — sol renk seridi yok, renk vurgusu etikette ve olcekte */
  .kart{background:var(--yuzey);border:1px solid var(--cizgi);border-radius:var(--r-kart);
    padding:16px 17px 14px;
    transition:border-color var(--gecis),background var(--gecis),transform var(--gecis)}
  .kart:hover{border-color:var(--cizgi-2);background:var(--yuzey-2);transform:translateY(-1px)}
  .kart.radarda{border-color:rgba(52,208,127,.34)}

  .kart-ust{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
  .kimlik{min-width:0}
  .ad{margin:0;font-size:17px;font-weight:700;letter-spacing:-.01em;display:flex;align-items:center;gap:6px}
  .nokta{width:6px;height:6px;border-radius:50%;background:var(--yesil);flex:none}
  .etiket{display:inline-block;margin-top:5px;font-size:10px;font-weight:600;
    letter-spacing:.1em;text-transform:uppercase;padding:3px 7px;border-radius:5px}
  .e-guclu{background:var(--yesil-loş);color:var(--yesil)}
  .e-al{background:var(--mavi-loş);color:var(--mavi)}
  .e-izle{background:var(--gri-loş);color:var(--gri)}
  .skor{font-size:38px;font-weight:700;letter-spacing:-.045em;line-height:.9;
    font-variant-numeric:tabular-nums;flex:none}
  .kart.izle .skor{color:var(--yazi-2)}

  .olcek{height:3px;background:var(--cizgi);border-radius:99px;margin:12px 0 0;overflow:hidden}
  .olcek i{display:block;height:100%;border-radius:99px}
  .kart.guclu .olcek i{background:var(--yesil)}
  .kart.al .olcek i{background:var(--mavi)}
  .kart.izle .olcek i{background:var(--gri)}

  .kart-alt{display:flex;align-items:center;gap:8px;min-height:24px;margin-top:2px}
  .radar-bilgi{display:none;font-size:11px;color:var(--yesil);font-weight:500}
  .kart.radarda .radar-bilgi{display:block}
  .radarBtn{margin-left:auto;background:none;border:0;font-size:20px;line-height:1;cursor:pointer;
    color:var(--soluk);padding:2px 2px;transition:color var(--gecis),transform 90ms}
  .radarBtn:hover{color:var(--yesil)}
  .radarBtn:active{transform:scale(1.18)}
  .radarBtn.acik{color:var(--yesil)}

  .metrik{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0 0;
    padding-top:11px;border-top:1px solid var(--cizgi)}
  .metrik dt{font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--soluk);font-weight:500}
  .metrik dd{margin:3px 0 0;font-size:14.5px;font-weight:600;font-variant-numeric:tabular-nums}
  .metrik .bolu{color:var(--soluk);font-weight:400}
  .r-dusuk{color:var(--yesil)} .r-orta{color:var(--yazi)} .r-yuksek{color:var(--dusus)}
  .arti{color:var(--yesil)} .notr{color:var(--soluk)}

  /* temel + bilanco + haber rozetleri — ustteki metrik satiriyla ayni izgara,
     boylece Temel/Bilanco/Haber sirasiyla Risk/Potansiyel/Osilator ile hizalanir.
     Etiketler her zaman ayni acik gri; renk SADECE noktada degisir. */
  .analiz{display:grid;grid-template-columns:repeat(2,1fr);gap:7px 8px;
    margin-top:10px;padding-top:10px;border-top:1px solid var(--cizgi)}
  .rozet{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:500;
    color:var(--soluk);cursor:help;letter-spacing:.01em;white-space:nowrap}
  .rozet i{width:7px;height:7px;border-radius:50%;background:var(--cizgi-2);flex:none}
  .d-pozitif i{background:var(--yesil)}
  .d-negatif i{background:var(--dusus)}
  .d-notr i{background:var(--soluk)}
  .d-yok i{background:transparent;box-shadow:inset 0 0 0 1px var(--cizgi-2)}

  .bos{display:none;grid-column:1/-1;text-align:center;color:var(--yazi-2);font-size:14px;
    background:var(--yuzey);border:1px dashed var(--cizgi-2);border-radius:var(--r-kart);padding:44px 20px}
  .bos b{color:var(--yazi)}

  footer{margin-top:34px;padding-top:20px;border-top:1px solid var(--cizgi);
    color:var(--soluk);font-size:12.5px;line-height:1.9;text-wrap:pretty}
  footer b{color:var(--yazi-2);font-weight:500}

  @media (max-width:900px){
    .bento{grid-template-columns:repeat(2,minmax(0,1fr))}
    .kutu-baslik{grid-column:span 2}
    body{padding:20px 14px 48px}
    .kutu{padding:16px 17px}
  }
</style>
</head>
<body>
<div class="sarmal">

<section class="bento">
  <div class="kutu kutu-baslik">
    <div>
      <h1>BIST Günlük Tarama</h1>
      <p class="altbaslik"><b>${kacis(tarih)}</b>${gunIci ? '' : ' kapanışı'} · konfluans sistemi + osilatör paneli</p>
    </div>
  </div>
  <div class="kutu vurgu"><div class="sayac"><span class="n">${gucluAdet}</span><span class="e">Güçlü al</span></div></div>
  <div class="kutu"><div class="sayac"><span class="n">${alAdet}</span><span class="e">Al</span></div></div>
  <div class="kutu"><div class="sayac"><span class="n">${izleAdet}</span><span class="e">İzle</span></div></div>
  <div class="kutu"><div class="sayac"><span class="n">${liste.length}</span><span class="e">Taranan</span></div></div>
  ${gunIci ? `<div class="uyari"><b>Borsa açık — bu rakamlar geçici.</b>Bugünün mumu henüz kapanmadı; kapanışa kadar skorlar ve sinyaller değişebilir. Kesin liste her akşam 18:45'te oluşur.</div>` : ''}
  <div class="uyari" id="bayatUyari" hidden><b>Bu liste son kapanışa ait olmayabilir.</b><span id="bayatMetin"></span></div>
</section>

<nav class="kontrol" aria-label="Filtreler">
  <div class="suzgec">
    <button data-g="guclu" aria-pressed="true">Güçlü al <b>${gucluAdet}</b></button>
    <button data-g="al" aria-pressed="true">Al <b>${alAdet}</b></button>
    <button data-g="izle" aria-pressed="false">İzle <b>${izleAdet}</b></button>
    <button id="tumuBtn">Tümü</button>
    <span class="ayrac"></span>
    <button data-s="1" aria-pressed="false" title="Supertrend'in tam bugün yukarı döndüğü hisseler">Bugün ST al <b>${stAdet}</b></button>
    <button data-th="1" aria-pressed="false" title="Günü artıda kapatmış, hacmi 500 binin üzerinde, göreceli hacmi 1.5×'ten yüksek, SMA20 &gt; SMA50 ve fiyatı EMA9 üzerinde olanlar">Trend + hacim <b>${thAdet}</b></button>
    <button data-da="1" aria-pressed="false" title="RSI son 5 günde 30'u yukarı kesmiş, Stokastik %K &gt; %D, MACD sinyal hattının üzerinde ve 30 günlük ortalama hacmi 300 binin üzerinde olanlar">Dip avcılığı <b>${daAdet}</b></button>
    <button data-tm="1" aria-pressed="false" title="PD/DD, ROE, net marj ve borç/özkaynak — piyasa medyanına göre çoğunlukla iyi olanlar">Temel pozitif <b>${tmAdet}</b></button>
    <button data-bl="1" aria-pressed="false" title="Son çeyrek gelir ve net kâr büyümesi — piyasa medyanının üzerinde olanlar">Bilanço pozitif <b>${blAdet}</b></button>
    <button data-hb="1" aria-pressed="false" title="Son 3 analist tavsiyesi ağırlıklı olarak AL / Endeks Üstü olanlar">Haber pozitif <b>${hbAdet}</b></button>
    <button data-r="1" aria-pressed="false">★ Radarım <b id="radarSayi">0</b></button>
    <span class="ayrac"></span>
    <select id="endekssec" aria-label="Endeks">
      <option value="">Tüm endeksler</option>
      ${endeksGrupHtml}
    </select>
    <select id="sektorsec" aria-label="Sektör">
      <option value="">Tüm sektörler</option>
      ${sektorSecenek.map(([s, ad, n]) => `<option value="${kacis(s)}">${kacis(ad)} (${n})</option>`).join('')}
    </select>
    <select id="sirasec" aria-label="Sıralama">
      <option value="varsayilan">Karar sırası</option>
      <option value="skor">Skor — yüksekten</option>
      <option value="risk">Risk — düşükten</option>
      <option value="pot">Potansiyel — yüksekten</option>
      <option value="osc">Osilatör — yüksekten</option>
      <option value="hb">Haber — pozitif önce</option>
      <option value="tm">Temel — pozitif önce</option>
      <option value="mv">Mevsim — pozitif önce</option>
    </select>
    <input type="search" placeholder="hisse ara…" aria-label="Hisse ara">
  </div>
</nav>

<main id="liste">
<p id="bosMesaj" class="bos">Seçili grupta gösterilecek hisse yok.</p>
${kartlar}
</main>

<footer>
  ${stListeDisi.length ? `Bugün Supertrend al verip listeye giremeyen: <b>${stListeDisi.join(', ')}</b><br>` : ''}
  Bu sayfa her iş günü 18:45'te kendiliğinden yenilenir.<br>
  Teknik tarama sonucudur, yatırım tavsiyesi değildir.
</footer>

</div>
<script>
/* Tarayici eski kopyayi onbellekte tutabiliyor. Sayfa acilinca sunucudaki
   surum damgasini onbelleksiz okur; farkliysa kendini bir kez yeniler. */
(function(){
  var SURUM = '${SURUM}';
  try {
    fetch('surum.txt?_=' + Date.now(), { cache: 'no-store' })
      .then(function(y){ return y.ok ? y.text() : null; })
      .then(function(t){
        if (!t) return;
        t = t.trim();
        var anahtar = 'yenilendi-' + t;
        if (t && t !== SURUM && !sessionStorage.getItem(anahtar)) {
          sessionStorage.setItem(anahtar, '1');   // dongu olmasin diye tek sefer
          location.reload();
        }
      })
      .catch(function(){});
  } catch (e) {}
})();

/* Otomatik tarama gecikirse ya da hic calismazsa sayfa sessizce eski veriyi
   gosterir. Bunu fark edelim: sayfadaki veri gunu, borsanin olmasi gereken
   son kapanisindan eskiyse ustte uyari cikar. (Resmi tatillerde de cikabilir,
   o yuzden "olmayabilir" diyoruz.) */
(function(){
  var VERI_GUNU = '${kacis(tarih)}';                 // GG.AA.YYYY
  var p = VERI_GUNU.split('.');
  if (p.length !== 3) return;
  var veri = new Date(+p[2], +p[1] - 1, +p[0]);
  if (isNaN(veri)) return;

  // Borsanin son kapanisi hangi gun olmali? Hafta ici 18:45'ten once
  // bakiyorsak bugunun kapanisi henuz yok; bir onceki is gunune bakariz.
  var s = new Date();
  var beklenen = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  if (s.getHours() * 60 + s.getMinutes() < 18 * 60 + 45) beklenen.setDate(beklenen.getDate() - 1);
  while (beklenen.getDay() === 0 || beklenen.getDay() === 6) beklenen.setDate(beklenen.getDate() - 1);

  var fark = Math.round((beklenen - veri) / 86400000);
  if (fark < 1) return;

  var kutu = document.getElementById('bayatUyari');
  var metin = document.getElementById('bayatMetin');
  if (!kutu || !metin) return;
  var g = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][beklenen.getDay()];
  metin.textContent = 'Ekrandaki veriler ' + VERI_GUNU + ' kapanışına ait. Bu arada ' +
    ('0' + beklenen.getDate()).slice(-2) + '.' + ('0' + (beklenen.getMonth() + 1)).slice(-2) + '.' +
    beklenen.getFullYear() + ' (' + g + ') kapanışı gerçekleşmiş olmalıydı. ' +
    'Ya o gün borsa kapalıydı (resmi tatil), ya da akşamki otomatik tarama gecikti. ' +
    'Birkaç saat sonra sayfayı tekrar açın; liste kendini yeniler.';
  kutu.hidden = false;
})();

(function(){
  var kartlar = Array.prototype.slice.call(document.querySelectorAll('.kart'));
  var grupDugmeleri = Array.prototype.slice.call(document.querySelectorAll('.suzgec button[data-g]'));
  var radarDugmesi = document.querySelector('.suzgec button[data-r]');
  var stDugmesi = document.querySelector('.suzgec button[data-s]');
  var thDugmesi = document.querySelector('.suzgec button[data-th]');
  var daDugmesi = document.querySelector('.suzgec button[data-da]');
  var tmDugmesi = document.querySelector('.suzgec button[data-tm]');
  var blDugmesi = document.querySelector('.suzgec button[data-bl]');
  var hbDugmesi = document.querySelector('.suzgec button[data-hb]');
  var tumuDugmesi = document.getElementById('tumuBtn');
  var bosMesaj = document.getElementById('bosMesaj');
  var arama = document.querySelector('.suzgec input');
  var endeksSec = document.getElementById('endekssec');
  var sektorSec = document.getElementById('sektorsec');
  var secili = { guclu: true, al: true, izle: false };
  var radarAktif = false, stAktif = false, thAktif = false, daAktif = false;
  var tmAktif = false, blAktif = false, hbAktif = false;

  // ---- RADAR: isaretlenen hisseler tarayicida saklanir ----
  var ANAHTAR = 'bist-radar';
  function radarOku(){ try { return JSON.parse(localStorage.getItem(ANAHTAR)) || {}; } catch (e) { return {}; } }
  function radarYaz(r){ try { localStorage.setItem(ANAHTAR, JSON.stringify(r)); } catch (e) {} }
  var radar = radarOku();

  function gunFarki(iso){
    var a = new Date(iso + 'T00:00:00'), b = new Date();
    b = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    var f = Math.round((b - a) / 86400000);
    return isNaN(f) ? 0 : f;
  }
  function bugunISO(){
    var g = new Date(), p = function(n){ return (n < 10 ? '0' : '') + n; };
    return g.getFullYear() + '-' + p(g.getMonth() + 1) + '-' + p(g.getDate());
  }
  function radarCiz(){
    var n = 0;
    kartlar.forEach(function(k){
      var ad = k.dataset.ad, btn = k.querySelector('.radarBtn'), bilgi = k.querySelector('.radar-bilgi');
      if (radar[ad]) {
        n++;
        k.classList.add('radarda'); btn.classList.add('acik');
        btn.textContent = '★'; btn.title = 'Radarımdan çıkar';
        var f = gunFarki(radar[ad]);
        bilgi.textContent = f === 0 ? 'bugün eklendi' : f === 1 ? 'dün eklendi' : f + ' gündür radarda';
      } else {
        k.classList.remove('radarda'); btn.classList.remove('acik');
        btn.textContent = '☆'; btn.title = 'Radarıma ekle';
        bilgi.textContent = '';
      }
    });
    var sayac = document.getElementById('radarSayi');
    if (sayac) sayac.textContent = n;
  }
  kartlar.forEach(function(k){
    k.querySelector('.radarBtn').addEventListener('click', function(e){
      e.stopPropagation();
      var ad = k.dataset.ad;
      if (radar[ad]) delete radar[ad]; else radar[ad] = bugunISO();
      radarYaz(radar); radarCiz();
      if (radarAktif) uygula();
    });
  });

  function uygula(){
    var q = (arama.value || '').trim().toUpperCase();
    var ex = endeksSec.value, sk = sektorSec.value;
    var n = 0, grupHaric = 0;
    kartlar.forEach(function(k){
      // once grup disindaki olcutler, sonra grup secimi — boylece
      // "olcute uyuyor ama secili grupta degil" durumunu ayirt edebiliyoruz
      var uyar = true;
      if (stAktif) uyar = k.dataset.st === '1';
      if (uyar && thAktif) uyar = k.dataset.th === '1';
      if (uyar && daAktif) uyar = k.dataset.da === '1';
      if (uyar && tmAktif) uyar = k.dataset.tm === 'pozitif';
      if (uyar && blAktif) uyar = k.dataset.bl === 'pozitif';
      if (uyar && hbAktif) uyar = k.dataset.hb === 'pozitif';
      if (uyar && radarAktif) uyar = !!radar[k.dataset.ad];
      if (uyar && ex) uyar = (' ' + k.dataset.ex + ' ').indexOf(' ' + ex + ' ') >= 0;
      if (uyar && sk) uyar = k.dataset.sk === sk;
      if (uyar && q) uyar = k.dataset.ad.indexOf(q) === 0;
      if (uyar) grupHaric++;
      var gorunur = uyar && !!secili[k.dataset.durum];
      k.style.display = gorunur ? '' : 'none';
      if (gorunur) n++;
    });
    if (n === 0) {
      bosMesaj.style.display = 'block';
      bosMesaj.innerHTML = grupHaric > 0
        ? grupHaric + ' hisse bu ölçüte uyuyor ama seçili gruplarda değil.<br>· <b>Tümü</b> düğmesine basarak hepsini görebilirsiniz.'
        : 'Bu ölçütlere uyan hisse yok.';
    } else {
      bosMesaj.style.display = 'none';
    }
    grupDugmeleri.forEach(function(b){ b.setAttribute('aria-pressed', String(!!secili[b.dataset.g])); });
    radarDugmesi.setAttribute('aria-pressed', String(radarAktif));
    stDugmesi.setAttribute('aria-pressed', String(stAktif));
    thDugmesi.setAttribute('aria-pressed', String(thAktif));
    daDugmesi.setAttribute('aria-pressed', String(daAktif));
    tmDugmesi.setAttribute('aria-pressed', String(tmAktif));
    blDugmesi.setAttribute('aria-pressed', String(blAktif));
    hbDugmesi.setAttribute('aria-pressed', String(hbAktif));
  }

  grupDugmeleri.forEach(function(b){
    b.addEventListener('click', function(){ secili[b.dataset.g] = !secili[b.dataset.g]; uygula(); });
  });
  tumuDugmesi.addEventListener('click', function(){
    var hepsiAcik = secili.guclu && secili.al && secili.izle;
    secili = hepsiAcik ? { guclu: true, al: true, izle: false } : { guclu: true, al: true, izle: true };
    uygula();
  });
  radarDugmesi.addEventListener('click', function(){ radarAktif = !radarAktif; uygula(); });
  stDugmesi.addEventListener('click', function(){ stAktif = !stAktif; uygula(); });
  thDugmesi.addEventListener('click', function(){ thAktif = !thAktif; uygula(); });
  daDugmesi.addEventListener('click', function(){ daAktif = !daAktif; uygula(); });
  tmDugmesi.addEventListener('click', function(){ tmAktif = !tmAktif; uygula(); });
  blDugmesi.addEventListener('click', function(){ blAktif = !blAktif; uygula(); });
  hbDugmesi.addEventListener('click', function(){ hbAktif = !hbAktif; uygula(); });
  arama.addEventListener('input', uygula);
  endeksSec.addEventListener('change', uygula);
  sektorSec.addEventListener('change', uygula);

  // ---- siralama ----
  var kapsayici = document.getElementById('liste');
  var sirasec = document.getElementById('sirasec');
  var sayi = function(k, ad){ return parseFloat(k.dataset[ad]); };
  sirasec.addEventListener('change', function(){
    var t = sirasec.value, kopya = kartlar.slice();
    kopya.sort(function(a, b){
      if (t === 'skor') return sayi(b,'skor') - sayi(a,'skor');
      if (t === 'risk') return sayi(a,'risk') - sayi(b,'risk') || sayi(b,'skor') - sayi(a,'skor');
      if (t === 'pot')  return sayi(b,'pot')  - sayi(a,'pot')  || sayi(b,'skor') - sayi(a,'skor');
      if (t === 'osc')  return sayi(b,'osc')  - sayi(a,'osc')  || sayi(b,'skor') - sayi(a,'skor');
      // durum siralamasi: pozitif > notr > negatif > veri yok, esitlikte skor
      var sira = { pozitif: 3, notr: 2, negatif: 1, yok: 0 };
      if (t === 'hb') return (sira[b.dataset.hb]||0) - (sira[a.dataset.hb]||0) || sayi(b,'skor') - sayi(a,'skor');
      if (t === 'tm') return (sira[b.dataset.tm]||0) - (sira[a.dataset.tm]||0) || sayi(b,'skor') - sayi(a,'skor');
      if (t === 'mv') return (sira[b.dataset.mv]||0) - (sira[a.dataset.mv]||0) || sayi(b,'skor') - sayi(a,'skor');
      return sayi(a,'sira') - sayi(b,'sira');
    });
    var parca = document.createDocumentFragment();
    kopya.forEach(function(k){ parca.appendChild(k); });
    kapsayici.appendChild(parca);
  });

  radarCiz();
  uygula();
})();
</script>
</body>
</html>`;
}
