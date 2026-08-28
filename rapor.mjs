/*
 * rapor.mjs — Ham tarama sonucunu insanin okuyabilecegi hale getirir.
 *   1) sadeLIste()  -> kisa, sirali, dusunmeden okunan CSV
 *   2) htmlRapor()  -> telefonda acilan renkli sayfa
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
  const bas = ['sira', 'hisse', 'karar', 'skor', 'risk', 'potansiyel_%', 'osilator'];
  const out = [bas.join(';')];
  suz(satirlar).forEach((x, i) => {
    const d = degerlendir(x);
    out.push([
      i + 1, x.ad, d.karar, vir(x.skor.toFixed(0)),
      d.riskSoz + ' (' + x.risk + ')',
      vir(x.potansiyel.toFixed(1)),
      x.osilator.alSayisi + '/6',
    ].join(';'));
  });
  return out.join('\r\n');
}

// ---------- 2) HTML RAPOR ----------
const kacis = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function htmlRapor(satirlar, stSinyalleri, tarih, gunIci) {
  const liste = suz(satirlar);
  const gucluAdet = liste.filter((x) => x.guclu).length;
  const alAdet = liste.filter((x) => x.al && !x.guclu).length;
  const izleAdet = liste.filter((x) => !x.al && !x.guclu).length;
  // Supertrend'in TAM BUGUN yukari dondugu hisseler (yesil kutudaki liste)
  const stKume = new Set((stSinyalleri || []).map((s) => String(s).trim().toUpperCase()));
  const stAdet = liste.filter((x) => stKume.has(x.ad)).length;
  const thAdet = liste.filter((x) => x.trendHacim).length;

  const kartlar = liste.map((x) => {
    const d = degerlendir(x);
    const sinif = x.guclu ? 'guclu' : x.al ? 'al' : 'izle';
    const stAl = stKume.has(x.ad);
    return `<article class="kart ${sinif}" data-durum="${sinif}" data-ad="${kacis(x.ad)}" data-sira="${liste.indexOf(x)}" data-skor="${x.skor.toFixed(2)}" data-risk="${x.risk}" data-pot="${x.potansiyel.toFixed(2)}" data-osc="${x.osilator.alSayisi}" data-st="${stAl ? 1 : 0}" data-th="${x.trendHacim ? 1 : 0}">
  <div class="ust">
    <span class="ad">${kacis(x.ad)}</span>
    <span class="karar k-${sinif}">${d.karar}</span>
    ${stAl ? '<span class="rozet-st">⚡ ST bugün AL</span>' : ''}
    <button class="radarBtn" type="button" title="Radarıma ekle" aria-label="${kacis(x.ad)} radarıma ekle">☆</button>
  </div>
  <div class="radar-bilgi"></div>
  <div class="cubuk"><i style="width:${Math.max(0, Math.min(100, x.skor))}%"></i><b>${x.skor.toFixed(0)}</b></div>
  <div class="satir">
    <span class="etiket">Risk</span><span class="deger risk-${d.riskSoz.split(' ')[0]}">${d.riskSoz} (${x.risk})</span>
    <span class="etiket">Potansiyel</span><span class="deger ${x.potansiyel < 0.1 ? '' : 'yes'}">${x.potansiyel < 0.1 ? 'zirvede' : '+' + x.potansiyel.toFixed(1) + '%'}</span>
    <span class="etiket">Osilatör</span><span class="deger">${x.osilator.alSayisi}/6</span>
  </div>
</article>`;
  }).join('\n');

  // Bugun ST AL veren ama listeye giremeyen hisseler. Sebep hisseye gore degisir:
  // ya hic hesaplanamamistir (gecmis veri yetersiz), ya da listeye girme kurallarina
  // takilmistir (Supertrend asagi / IZLE olup skor 50 alti). Dipnotta gercek sebep yazar.
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

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BIST Günlük Tarama — ${kacis(tarih)}</title>
<style>
  :root{
    --zemin:#f6f7f9; --kart:#ffffff; --yazi:#1a1d21; --soluk:#6b7280; --cizgi:#e5e7eb;
    --yesil:#0f9d58; --yesil-bg:#e8f5ee; --mavi:#1a73e8; --mavi-bg:#e8f0fe;
    --gri:#9aa0a6; --gri-bg:#f1f3f4; --kirmizi:#d93025; --amber:#b06000; --amber-bg:#fef3e2;
    --sari-bg:#fdf5d8;
  }
  @media (prefers-color-scheme: dark){
    :root{ --zemin:#15181c; --kart:#1e2227; --yazi:#e8eaed; --soluk:#9aa0a6; --cizgi:#2f343a;
      --yesil:#4ade80; --yesil-bg:#12301f; --mavi:#7cb0ff; --mavi-bg:#14243d;
      --gri:#7c848d; --gri-bg:#23272c; --kirmizi:#f28b82; --amber:#fbbf24; --amber-bg:#33260f;
      --sari-bg:#2b2412; }
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--zemin);color:var(--yazi);
    font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
    padding:16px;max-width:900px;margin-inline:auto}
  header h1{font-size:20px;margin:0 0 4px}
  header p{margin:0 0 16px;color:var(--soluk);font-size:14px}
  .ozet{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
  .ozet div{flex:1;min-width:96px;background:var(--kart);border:1px solid var(--cizgi);
    border-radius:10px;padding:10px 12px}
  .ozet b{display:block;font-size:22px;line-height:1.2}
  .ozet span{font-size:12px;color:var(--soluk)}
  .uyari{background:var(--amber-bg);border:1px solid var(--amber);color:var(--amber);
    border-radius:10px;padding:11px 13px;margin-bottom:16px;font-size:13px;line-height:1.55}
  .uyari b{display:block;font-size:14px;margin-bottom:2px}
  .suzgec{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;position:sticky;top:0;
    background:var(--zemin);padding:8px 0;z-index:2}
  .suzgec button{border:1px solid var(--cizgi);background:var(--kart);color:var(--yazi);
    border-radius:999px;padding:7px 14px;font-size:14px;cursor:pointer}
  .suzgec button b{font-weight:700;opacity:.55;margin-left:2px;font-size:12px}
  /* secili dugmelerin hepsi ayni temada — etiket rengine gore degismiyor */
  .suzgec button[aria-pressed="true"]{background:var(--yazi);color:var(--zemin);border-color:var(--yazi)}
  .suzgec button.ikincil{font-size:13px;opacity:.9}
  .bos{display:none;text-align:center;color:var(--soluk);font-size:14px;
    background:var(--kart);border:1px dashed var(--cizgi);border-radius:10px;padding:22px 14px;margin:0 0 12px}
  .suzgec input{flex:1;min-width:120px;border:1px solid var(--cizgi);background:var(--kart);
    color:var(--yazi);border-radius:999px;padding:7px 14px;font-size:14px}
  .sirala{display:flex;align-items:center;gap:8px;margin-bottom:12px}
  .sirala label{font-size:13px;color:var(--soluk)}
  .sirala select{flex:1;border:1px solid var(--cizgi);background:var(--kart);color:var(--yazi);
    border-radius:8px;padding:8px 10px;font-size:14px}
  .kart{background:var(--kart);border:1px solid var(--cizgi);border-left-width:4px;
    border-radius:10px;padding:12px 14px;margin-bottom:10px}
  .kart.guclu{border-left-color:var(--yesil)}
  .kart.al{border-left-color:var(--mavi)}
  .kart.izle{border-left-color:var(--gri)}
  .ust{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .radarBtn{margin-left:auto;background:none;border:0;font-size:22px;line-height:1;cursor:pointer;
    color:var(--cizgi);padding:2px 4px;transition:color .15s,transform .1s}
  .radarBtn:hover{color:#f5b400}
  .radarBtn:active{transform:scale(1.2)}
  .radarBtn.acik{color:#f5b400}
  .kart.radarda{background:linear-gradient(90deg,var(--sari-bg) 0%,var(--kart) 55%)}
  .radar-bilgi{display:none;margin-top:6px;font-size:12px;color:var(--amber);font-weight:600}
  .kart.radarda .radar-bilgi{display:block}
  .ad{font-weight:700;font-size:17px;letter-spacing:.3px}
  .karar{font-size:11px;font-weight:700;padding:3px 8px;border-radius:5px;margin-left:8px;white-space:nowrap}
  .k-guclu{background:var(--yesil-bg);color:var(--yesil)}
  .k-al{background:var(--mavi-bg);color:var(--mavi)}
  .k-izle{background:var(--gri-bg);color:var(--soluk)}
  .rozet-yeni{background:var(--amber-bg);color:var(--amber);font-size:11px;font-weight:700;
    padding:3px 8px;border-radius:5px;margin-left:6px}
  .rozet-st{background:var(--yesil-bg);color:var(--yesil);font-size:11px;font-weight:700;
    padding:3px 8px;border-radius:5px;white-space:nowrap}
  .yildiz{color:#f5b400;letter-spacing:1px}
  .yildiz .sonuk{color:var(--cizgi)}
  .cubuk{position:relative;height:6px;background:var(--gri-bg);border-radius:99px;margin:10px 0 12px}
  .cubuk i{display:block;height:100%;background:var(--yesil);border-radius:99px}
  .kart.al .cubuk i{background:var(--mavi)}
  .kart.izle .cubuk i{background:var(--gri)}
  .cubuk b{position:absolute;right:0;top:-20px;font-size:12px;color:var(--soluk)}
  .satir{display:grid;grid-template-columns:auto 1fr auto 1fr auto 1fr;gap:4px 8px;font-size:13px;align-items:baseline}
  .etiket{color:var(--soluk);font-size:12px}
  .deger{font-weight:600}
  .deger em{font-style:normal;font-size:12px}
  .yes{color:var(--yesil)} .kir{color:var(--kirmizi)}
  .risk-düşük{color:var(--yesil)} .risk-orta{color:var(--amber)}
  .risk-yüksek{color:var(--kirmizi)} .risk-çok{color:var(--kirmizi)}
  .etiketler{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}
  .etiketler span{font-size:12px;padding:2px 8px;border-radius:5px}
  .arti span{background:var(--yesil-bg);color:var(--yesil)}
  .eksi span{background:var(--amber-bg);color:var(--amber)}
  .engel{margin-top:8px;font-size:12px;color:var(--soluk);font-style:italic}
  footer{margin:24px 0 8px;color:var(--soluk);font-size:12px;text-align:center;line-height:1.7}
  @media (max-width:560px){ .satir{grid-template-columns:auto 1fr;} body{padding:12px} }
</style>
</head>
<body>
<header>
  <h1>BIST Günlük Tarama</h1>
  <p>${kacis(tarih)}${gunIci ? '' : ' kapanışı'} · konfluans sistemi + osilatör paneli</p>
</header>
${gunIci ? `<div class="uyari"><b>Borsa açık — bu rakamlar geçici.</b>
  Bugünün mumu henüz kapanmadı; kapanışa kadar skorlar ve sinyaller değişebilir.
  Kesin liste her akşam 18:45'te oluşur.</div>` : ''}

<div class="ozet">
  <div><b>${gucluAdet}</b><span>GÜÇLÜ AL</span></div>
  <div><b>${alAdet}</b><span>AL</span></div>
  <div><b>${izleAdet}</b><span>izle</span></div>
  <div><b>${liste.length}</b><span>toplam</span></div>
</div>

<div class="suzgec">
  <button data-g="guclu" aria-pressed="true">GÜÇLÜ AL <b>${gucluAdet}</b></button>
  <button data-g="al" aria-pressed="true">AL <b>${alAdet}</b></button>
  <button data-g="izle" aria-pressed="false">İZLE <b>${izleAdet}</b></button>
  <button id="tumuBtn" class="ikincil">Tümü</button>
  <button data-s="1" aria-pressed="false" class="ikincil">⚡ Bugün ST AL (${stAdet})</button>
  <button data-th="1" aria-pressed="false" class="ikincil" title="Günü artıda kapatmış, hacmi 500 binin üzerinde, göreceli hacmi 1.5×'ten yüksek, SMA20 &gt; SMA50 ve fiyatı EMA9 üzerinde olanlar">📈 Trend + Hacim (${thAdet})</button>
  <button data-r="1" aria-pressed="false" class="ikincil">★ Radarım (<span id="radarSayi">0</span>)</button>
  <input type="search" placeholder="hisse ara..." aria-label="Hisse ara">
</div>

<div class="sirala">
  <label for="sirasec">Sırala</label>
  <select id="sirasec">
    <option value="varsayilan">Karar sırası (önce güçlüler)</option>
    <option value="skor">Skor — yüksekten düşüğe</option>
    <option value="risk">Risk — düşükten yükseğe</option>
    <option value="pot">Potansiyel — yüksekten düşüğe</option>
    <option value="osc">Osilatör — yüksekten düşüğe</option>
  </select>
</div>

<p id="bosMesaj" class="bos">Seçili grupta gösterilecek hisse yok.</p>

<main id="liste">
${kartlar}
</main>

<footer>
  ${stListeDisi.length ? `Bugün Supertrend AL verip listeye giremeyen: <b>${stListeDisi.join(', ')}</b><br>` : ''}
  Bu sayfa her iş günü 18:45'te kendiliğinden yenilenir.<br>
  Teknik tarama sonucudur, yatırım tavsiyesi değildir.
</footer>

<script>
(function(){
  var kartlar = Array.prototype.slice.call(document.querySelectorAll('.kart'));
  var grupDugmeleri = Array.prototype.slice.call(document.querySelectorAll('.suzgec button[data-g]'));
  var radarDugmesi = document.querySelector('.suzgec button[data-r]');
  var stDugmesi = document.querySelector('.suzgec button[data-s]');
  var thDugmesi = document.querySelector('.suzgec button[data-th]');
  var tumuDugmesi = document.getElementById('tumuBtn');
  var bosMesaj = document.getElementById('bosMesaj');
  var arama = document.querySelector('.suzgec input');
  // hangi gruplar secili — birden fazlasi ayni anda acik olabilir
  var secili = { guclu: true, al: true, izle: false };
  var radarAktif = false;
  var stAktif = false;
  var thAktif = false;

  // ---- RADAR: isaretlenen hisseler tarayicida saklanir ----
  var ANAHTAR = 'bist-radar';
  function radarOku(){
    try { return JSON.parse(localStorage.getItem(ANAHTAR)) || {}; } catch (e) { return {}; }
  }
  function radarYaz(r){
    try { localStorage.setItem(ANAHTAR, JSON.stringify(r)); } catch (e) {}
  }
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
        bilgi.textContent = f === 0 ? '★ bugün radarınıza eklediniz'
          : f === 1 ? '★ dün radarınıza eklediniz'
          : '★ ' + f + ' gündür radarınızda';
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
      if (radarAktif) uygula();   // radar suzgeci aciksa liste aninda guncellensin
    });
  });

  function uygula(){
    var q = (arama.value || '').trim().toUpperCase();
    var n = 0, grupHaric = 0;
    kartlar.forEach(function(k){
      // once grup disindaki olcutler, sonra grup secimi — boylece
      // "olcute uyuyor ama secili grupta degil" durumunu ayirt edebiliyoruz
      var uyar = true;
      if (stAktif) uyar = k.dataset.st === '1';
      if (uyar && thAktif) uyar = k.dataset.th === '1';
      if (uyar && radarAktif) uyar = !!radar[k.dataset.ad];
      if (uyar && q) uyar = k.dataset.ad.indexOf(q) === 0;
      if (uyar) grupHaric++;
      var gorunur = uyar && !!secili[k.dataset.durum];
      k.style.display = gorunur ? '' : 'none';
      if (gorunur) n++;
    });
    if (n === 0) {
      bosMesaj.style.display = 'block';
      bosMesaj.innerHTML = grupHaric > 0
        ? grupHaric + ' hisse bu ölçüte uyuyor ama seçili gruplarda değil.<br><b>Tümü</b> düğmesine basarak hepsini görebilirsiniz.'
        : 'Bu ölçütlere uyan hisse yok.';
    } else {
      bosMesaj.style.display = 'none';
    }
    grupDugmeleri.forEach(function(b){ b.setAttribute('aria-pressed', String(!!secili[b.dataset.g])); });
    radarDugmesi.setAttribute('aria-pressed', String(radarAktif));
    stDugmesi.setAttribute('aria-pressed', String(stAktif));
    thDugmesi.setAttribute('aria-pressed', String(thAktif));
    tumuDugmesi.setAttribute('aria-pressed', String(secili.guclu && secili.al && secili.izle));
  }

  grupDugmeleri.forEach(function(b){
    b.addEventListener('click', function(){
      secili[b.dataset.g] = !secili[b.dataset.g];   // her grup bagimsiz acilip kapanir
      uygula();
    });
  });
  tumuDugmesi.addEventListener('click', function(){
    var hepsiAcik = secili.guclu && secili.al && secili.izle;
    // hepsi aciksa varsayilana don (guclu + al), degilse hepsini ac
    secili = hepsiAcik ? { guclu: true, al: true, izle: false } : { guclu: true, al: true, izle: true };
    uygula();
  });
  radarDugmesi.addEventListener('click', function(){
    radarAktif = !radarAktif;
    uygula();
  });
  stDugmesi.addEventListener('click', function(){
    stAktif = !stAktif;
    uygula();   // grup secimine dokunulmaz; bos kalirsa mesaj yol gosterir
  });
  thDugmesi.addEventListener('click', function(){
    thAktif = !thAktif;
    uygula();
  });
  arama.addEventListener('input', uygula);

  // --- siralama ---
  var kapsayici = document.getElementById('liste');
  var sirasec = document.getElementById('sirasec');
  var sayi = function(k, ad){ return parseFloat(k.dataset[ad]); };
  function siralamayiUygula(){
    var t = sirasec.value, kopya = kartlar.slice();
    kopya.sort(function(a, b){
      if (t === 'skor') return sayi(b,'skor') - sayi(a,'skor');
      if (t === 'risk') return sayi(a,'risk') - sayi(b,'risk') || sayi(b,'skor') - sayi(a,'skor');
      if (t === 'pot')  return sayi(b,'pot')  - sayi(a,'pot')  || sayi(b,'skor') - sayi(a,'skor');
      if (t === 'osc')  return sayi(b,'osc')  - sayi(a,'osc')  || sayi(b,'skor') - sayi(a,'skor');
      return sayi(a,'sira') - sayi(b,'sira');
    });
    var parca = document.createDocumentFragment();
    kopya.forEach(function(k){ parca.appendChild(k); });
    kapsayici.appendChild(parca);
  }
  sirasec.addEventListener('change', siralamayiUygula);

  radarCiz();
  uygula();
})();
</script>
</body>
</html>`;
}
