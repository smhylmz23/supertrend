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

// ---------- 1) SADE CSV ----------
export function sadeListe(satirlar) {
  const vir = (v) => String(v).replace('.', ',');
  const bas = ['sira', 'hisse', 'karar', 'yildiz', 'skor', 'risk', 'guclu_yonler', 'dikkat', 'fiyat', 'stop_seviyesi', 'bugun_yeni', 'tarih'];
  const out = [bas.join(';')];
  const liste = satirlar.slice().sort(sirala);
  liste.forEach((x, i) => {
    const d = degerlendir(x);
    out.push([
      i + 1, x.ad, d.karar, '*'.repeat(d.yildiz), vir(x.skor.toFixed(0)),
      d.riskSoz + ' (' + x.risk + ')',
      d.artilar.join(', ') || '-',
      (d.uyarilar.length ? d.uyarilar.join(', ') : (d.engel || '-')),
      vir(x.kapanis), vir(x.stCizgi.toFixed(2)),
      (x.yeniAl || x.yeniGuclu) ? 'BUGUN' : '', x.tarih,
    ].join(';'));
  });
  return out.join('\r\n');
}

// ---------- 2) HTML RAPOR ----------
const kacis = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function htmlRapor(satirlar, stSinyalleri, tarih) {
  const liste = satirlar.slice().sort(sirala);
  const gucluAdet = liste.filter((x) => x.guclu).length;
  const alAdet = liste.filter((x) => x.al && !x.guclu).length;
  const yeniAdet = liste.filter((x) => x.yeniAl || x.yeniGuclu).length;

  const kartlar = liste.map((x) => {
    const d = degerlendir(x);
    const sinif = x.guclu ? 'guclu' : x.al ? 'al' : 'izle';
    const yeni = (x.yeniAl || x.yeniGuclu) ? '<span class="rozet-yeni">BUGÜN YENİ</span>' : '';
    return `<article class="kart ${sinif}" data-durum="${sinif}" data-ad="${kacis(x.ad)}">
  <div class="ust">
    <div class="sol">
      <span class="ad">${kacis(x.ad)}</span>
      <span class="karar k-${sinif}">${d.karar}</span>
      ${yeni}
    </div>
    <div class="sag">
      <span class="yildiz" title="Konfluans ${x.skor.toFixed(0)}/100">${'★'.repeat(d.yildiz)}<span class="sonuk">${'★'.repeat(5 - d.yildiz)}</span></span>
    </div>
  </div>
  <div class="cubuk"><i style="width:${Math.max(0, Math.min(100, x.skor))}%"></i><b>${x.skor.toFixed(0)}</b></div>
  <div class="satir">
    <span class="etiket">Fiyat</span><span class="deger">${x.kapanis.toFixed(2)} <em class="${x.degisim >= 0 ? 'yes' : 'kir'}">${x.degisim >= 0 ? '+' : ''}${x.degisim.toFixed(1)}%</em></span>
    <span class="etiket">Stop</span><span class="deger">${x.stCizgi.toFixed(2)}</span>
    <span class="etiket">Risk</span><span class="deger risk-${d.riskSoz.split(' ')[0]}">${d.riskSoz} (${x.risk})</span>
  </div>
  ${d.artilar.length ? `<div class="etiketler arti">${d.artilar.map((a) => `<span>${kacis(a)}</span>`).join('')}</div>` : ''}
  ${d.uyarilar.length ? `<div class="etiketler eksi">${d.uyarilar.map((a) => `<span>${kacis(a)}</span>`).join('')}</div>` : ''}
  ${(!x.al && !x.guclu && d.engel) ? `<div class="engel">Neden alım değil: ${kacis(d.engel)}</div>` : ''}
</article>`;
  }).join('\n');

  const stKutu = stSinyalleri && stSinyalleri.length
    ? `<div class="st-kutu"><h2>Supertrend bugün AL verdi</h2><p>${stSinyalleri.map((s) => `<span>${kacis(s)}</span>`).join('')}</p></div>`
    : '';

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
  }
  @media (prefers-color-scheme: dark){
    :root{ --zemin:#15181c; --kart:#1e2227; --yazi:#e8eaed; --soluk:#9aa0a6; --cizgi:#2f343a;
      --yesil:#4ade80; --yesil-bg:#12301f; --mavi:#7cb0ff; --mavi-bg:#14243d;
      --gri:#7c848d; --gri-bg:#23272c; --kirmizi:#f28b82; --amber:#fbbf24; --amber-bg:#33260f; }
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
  .st-kutu{background:var(--yesil-bg);border:1px solid var(--yesil);border-radius:10px;padding:12px;margin-bottom:16px}
  .st-kutu h2{margin:0 0 8px;font-size:14px;color:var(--yesil)}
  .st-kutu p{margin:0;display:flex;flex-wrap:wrap;gap:6px}
  .st-kutu span{background:var(--kart);border-radius:6px;padding:2px 8px;font-weight:600;font-size:13px}
  .suzgec{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;position:sticky;top:0;
    background:var(--zemin);padding:8px 0;z-index:2}
  .suzgec button{border:1px solid var(--cizgi);background:var(--kart);color:var(--yazi);
    border-radius:999px;padding:7px 14px;font-size:14px;cursor:pointer}
  .suzgec button[aria-pressed="true"]{background:var(--yazi);color:var(--zemin);border-color:var(--yazi)}
  .suzgec input{flex:1;min-width:120px;border:1px solid var(--cizgi);background:var(--kart);
    color:var(--yazi);border-radius:999px;padding:7px 14px;font-size:14px}
  .kart{background:var(--kart);border:1px solid var(--cizgi);border-left-width:4px;
    border-radius:10px;padding:12px 14px;margin-bottom:10px}
  .kart.guclu{border-left-color:var(--yesil)}
  .kart.al{border-left-color:var(--mavi)}
  .kart.izle{border-left-color:var(--gri)}
  .ust{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
  .ad{font-weight:700;font-size:17px;letter-spacing:.3px}
  .karar{font-size:11px;font-weight:700;padding:3px 8px;border-radius:5px;margin-left:8px;white-space:nowrap}
  .k-guclu{background:var(--yesil-bg);color:var(--yesil)}
  .k-al{background:var(--mavi-bg);color:var(--mavi)}
  .k-izle{background:var(--gri-bg);color:var(--soluk)}
  .rozet-yeni{background:var(--amber-bg);color:var(--amber);font-size:11px;font-weight:700;
    padding:3px 8px;border-radius:5px;margin-left:6px}
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
  <p>${kacis(tarih)} kapanışı · konfluans sistemi + osilatör paneli</p>
</header>

<div class="ozet">
  <div><b>${gucluAdet}</b><span>GÜÇLÜ AL</span></div>
  <div><b>${alAdet}</b><span>AL</span></div>
  <div><b>${yeniAdet}</b><span>bugün yeni</span></div>
  <div><b>${liste.length}</b><span>taranan hisse</span></div>
</div>

${stKutu}

<div class="suzgec">
  <button data-f="hepsi" aria-pressed="true">Fırsatlar</button>
  <button data-f="guclu" aria-pressed="false">Sadece güçlü</button>
  <button data-f="yeni" aria-pressed="false">Bugün yeni</button>
  <button data-f="tumu" aria-pressed="false">Tümü</button>
  <input type="search" placeholder="hisse ara..." aria-label="Hisse ara">
</div>

<main id="liste">
${kartlar}
</main>

<footer>
  Bu sayfa her iş günü 18:45'te kendiliğinden yenilenir.<br>
  Teknik tarama sonucudur, yatırım tavsiyesi değildir.
</footer>

<script>
(function(){
  var kartlar = Array.prototype.slice.call(document.querySelectorAll('.kart'));
  var dugmeler = Array.prototype.slice.call(document.querySelectorAll('.suzgec button'));
  var arama = document.querySelector('.suzgec input');
  var aktif = 'hepsi';

  function uygula(){
    var q = (arama.value || '').trim().toUpperCase();
    kartlar.forEach(function(k){
      var d = k.dataset.durum, gorunur = true;
      if (aktif === 'hepsi') gorunur = (d === 'guclu' || d === 'al');
      else if (aktif === 'guclu') gorunur = (d === 'guclu');
      else if (aktif === 'yeni') gorunur = !!k.querySelector('.rozet-yeni');
      if (gorunur && q) gorunur = k.dataset.ad.indexOf(q) === 0;
      k.style.display = gorunur ? '' : 'none';
    });
  }
  dugmeler.forEach(function(b){
    b.addEventListener('click', function(){
      aktif = b.dataset.f;
      dugmeler.forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); });
      uygula();
    });
  });
  arama.addEventListener('input', uygula);
  uygula();
})();
</script>
</body>
</html>`;
}
