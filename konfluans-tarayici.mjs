#!/usr/bin/env node
/*
 * ============================================================
 *  BIST KONFLUANS TARAYICI
 * ============================================================
 *  Kullanicinin TradingView gostergelerinin birebir karsiligi:
 *
 *   - "Trend Bulutu & BIST KP Panel Pro"  -> 100 puanlik konfluans
 *     skoru (Trend 35 + Momentum 30 + Hacim/Yapi 35), risk skoru,
 *     uyumsuzluk motoru, rejim ve AL / GUCLU AL kurallari
 *   - "Gelismis Secmeli Osilator v4"      -> 8 gostergeli ozet tablo
 *
 *  SMC (LuxAlgo) bolumu dahil DEGILDIR: kullanicinin ayarlarinda SMC
 *  filtresi kapali oldugu icin sinyaller ona bagli degil.
 *
 *  KULLANIM
 *    node konfluans-tarayici.mjs
 *
 *  SECENEKLER
 *    --sinyal hepsi     al | guclu | hepsi | tumu   (varsayilan: al)
 *                       "tumu" = sinyal sartina bakmadan tum hisseler
 *    --min-skor 0       konfluans skoru alt siniri
 *    --min-hacim 0      TL islem hacmi alt siniri
 *    --csv              Excel dosyasi olustur
 *    --rapor            sonuclari dosyaya da yaz
 *    --hisse ATATR      tek hissenin tum detayini goster (dogrulama icin)
 * ============================================================
 */

import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import * as ta from './ta.mjs';
import { sadeListe, htmlRapor } from './rapor.mjs';

const KLASOR = path.dirname(fileURLToPath(import.meta.url));
const YEDEK_LISTE = path.join(KLASOR, 'hisseler.json');
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

const A = process.argv.slice(2);
const opt = (ad, v) => { const i = A.indexOf('--' + ad); return i >= 0 && A[i + 1] ? A[i + 1] : v; };
const CFG = {
  sinyal: opt('sinyal', 'al').toLowerCase(),
  minSkor: +opt('min-skor', 0),
  minHacim: +opt('min-hacim', 0),
  csv: A.includes('--csv'),
  rapor: A.includes('--rapor'),
  tekHisse: opt('hisse', '').toUpperCase(),
  bar: 600,
  isci: 6,
  zamanAsimi: 25000,
};

// GOSTERGE AYARLARI — TradingView'deki input degerlerinizle birebir ayni
const P = {
  len21: 21, len50: 50, len100: 100, len200: 200,
  stLen: 10, stMult: 3.0,
  adxLen: 14, adxMin: 20.0,
  htfRes: 'W',
  rsiLen: 14, mfiLen: 14, rsiLo: 45, rsiHi: 72,
  volLen: 20, volMult: 1.3, hhLen: 60,
  divPiv: 5, divHold: 20, divLook: 80,
  atrLen: 14, extMax: 3.0, climaxMult: 2.5, distWin: 10,
  thStrong: 75, thBuy: 60, dgBuyMax: 40, divBlock: 3,
  // osilator
  wtN1: 10, wtN2: 21, stochK: 3, stochD: 3, stochRsiLen: 14, stochLen: 14,
  sharpeLook: 180, riskFree: 0.04,
};

const raporSatirlari = [];
const yaz = (...a) => { const s = a.join(' '); raporSatirlari.push(s); console.log(s); };
const bugunEtiket = () => { const g = new Date(); return g.getFullYear() + '-' + String(g.getMonth() + 1).padStart(2, '0') + '-' + String(g.getDate()).padStart(2, '0'); };

// ================= VERI =================
const WSOPTS = { headers: { Origin: 'https://www.tradingview.com', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' } };
const cerceve = (o) => { const s = JSON.stringify(o); return '~m~' + s.length + '~m~' + s; };
const coz = (raw) => { const out = []; const re = /~m~(\d+)~m~/g; let m; while ((m = re.exec(raw)) !== null) { const len = +m[1], bas = m.index + m[0].length; out.push(raw.slice(bas, bas + len)); re.lastIndex = bas + len; } return out; };
const baglan = () => new Promise((ok, hata) => {
  const ws = new WebSocket('wss://data.tradingview.com/socket.io/websocket?from=chart%2F', WSOPTS);
  ws.addEventListener('open', () => ok(ws));
  ws.addEventListener('error', () => hata(new Error('baglanti kurulamadi')));
});

async function evreniAl() {
  const govde = JSON.stringify({
    filter: [{ left: 'type', operation: 'equal', right: 'stock' }],
    options: { lang: 'tr' }, markets: ['turkey'],
    symbols: { query: { types: [] }, tickers: [] },
    columns: ['name'], sort: { sortBy: 'Value.Traded', sortOrder: 'desc' }, range: [0, 2000],
  });
  const birDene = () => new Promise((ok, hata) => {
    const q = https.request({ host: 'scanner.tradingview.com', path: '/turkey/scan', method: 'POST', maxVersion: 'TLSv1.2',
      headers: { 'Content-Type': 'application/json', 'User-Agent': WSOPTS.headers['User-Agent'], 'Content-Length': Buffer.byteLength(govde) } },
      (res) => { if (res.statusCode !== 200) { res.resume(); return hata(new Error('HTTP ' + res.statusCode)); }
        let d = ''; res.setEncoding('utf8'); res.on('data', (c) => { d += c; }); res.on('end', () => ok(d)); });
    q.setTimeout(15000, () => q.destroy(new Error('zaman asimi')));
    q.on('error', (e) => hata(new Error(e.code || e.message)));
    q.write(govde); q.end();
  });
  for (let i = 1; i <= 4; i++) {
    try {
      const j = JSON.parse(await birDene());
      const liste = j.data.map((x) => ({ ticker: x.s, ad: x.d[0] }));
      try { fs.writeFileSync(YEDEK_LISTE, JSON.stringify(liste)); } catch (e) {}
      return liste;
    } catch (e) { process.stderr.write('  liste alinamadi (' + e.message + '), ' + i + '. deneme...\n'); if (i < 4) await bekle(2000); }
  }
  if (fs.existsSync(YEDEK_LISTE)) { const l = JSON.parse(fs.readFileSync(YEDEK_LISTE, 'utf8')); process.stderr.write('  Kayitli liste kullaniliyor (' + l.length + ').\n'); return l; }
  throw new Error('Hisse listesi alinamadi.');
}

async function barlariAl(evren) {
  const sonuc = {}; let bitti = 0;
  const parcalar = Array.from({ length: CFG.isci }, () => []);
  evren.forEach((u, i) => parcalar[i % CFG.isci].push({ ...u }));
  const isci = (liste) => new Promise(async (bittiginde) => {
    let ws, cs, sira = 0, akt = null, sayac = null;
    const sonraki = () => {
      if (!liste.length) { try { ws.close(); } catch (e) {} return bittiginde(); }
      const it = liste.shift(); sira++;
      akt = { it, sid: 's' + sira, symid: 'sym' + sira, bars: null };
      clearTimeout(sayac); sayac = setTimeout(() => kapat(), CFG.zamanAsimi);
      ws.send(cerceve({ m: 'resolve_symbol', p: [cs, akt.symid, '=' + JSON.stringify({ symbol: it.ticker, adjustment: 'splits' })] }));
      ws.send(cerceve({ m: 'create_series', p: [cs, akt.sid, akt.sid, akt.symid, '1D', CFG.bar, ''] }));
    };
    const kapat = () => {
      clearTimeout(sayac);
      if (akt) { sonuc[akt.it.ticker] = { ...akt.it, bars: akt.bars };
        try { ws.send(cerceve({ m: 'remove_series', p: [cs, akt.sid] })); } catch (e) {}
        akt = null; if (++bitti % 150 === 0) process.stderr.write('  ' + bitti + '/' + evren.length + '\n'); }
      sonraki();
    };
    try { ws = await baglan(); } catch (e) { return bittiginde(); }
    cs = 'cs_' + Math.random().toString(36).slice(2, 12);
    ws.addEventListener('close', () => bittiginde());
    ws.addEventListener('error', () => bittiginde());
    ws.addEventListener('message', (ev) => {
      for (const p of coz(String(ev.data))) {
        if (p.startsWith('~h~')) { try { ws.send('~m~' + p.length + '~m~' + p); } catch (e) {} continue; }
        let j; try { j = JSON.parse(p); } catch (e) { continue; }
        if (j.session_id) { ws.send(cerceve({ m: 'set_auth_token', p: ['unauthorized_user_token'] })); ws.send(cerceve({ m: 'chart_create_session', p: [cs, ''] })); sonraki(); continue; }
        if (!akt) continue;
        if (j.m === 'timescale_update' && j.p?.[1]?.[akt.sid]) {
          const s = j.p[1][akt.sid].s;
          if (s?.length) akt.bars = s.map((x) => ({ t: x.v[0], o: x.v[1], h: x.v[2], l: x.v[3], c: x.v[4], v: x.v[5] }));
        } else if (j.m === 'series_completed' || j.m === 'symbol_error' || j.m === 'series_error') kapat();
      }
    });
  });
  await Promise.all(parcalar.map(isci));
  return sonuc;
}

// zaman damgasina gore "o tarihte ya da oncesindeki son deger"
function hizaliSeri(hedefBarlar, kaynakBarlar) {
  const out = new Array(hedefBarlar.length).fill(NaN);
  if (!kaynakBarlar || !kaynakBarlar.length) return out;
  let j = 0;
  for (let i = 0; i < hedefBarlar.length; i++) {
    while (j + 1 < kaynakBarlar.length && kaynakBarlar[j + 1].t <= hedefBarlar[i].t) j++;
    out[i] = kaynakBarlar[j].t <= hedefBarlar[i].t ? kaynakBarlar[j].c : NaN;
  }
  return out;
}

// ================= UYUMSUZLUK MOTORU (Pine f_bearDiv birebir) =================
function ayiUyumsuzlugu(bars, src, pivLen, hold, maxGap) {
  const ph = ta.pivotHigh(ta.seri(bars, 'h'), pivLen, pivLen);
  let sonPHi = NaN, sonSrc = NaN, sonBar = NaN, vurusBar = -9999;
  for (let i = 0; i < bars.length; i++) {
    if (!Number.isNaN(ph[i])) {
      const cur = src[i - pivLen];
      if (!Number.isNaN(sonPHi) && !Number.isNaN(cur) && !Number.isNaN(sonSrc) && (i - sonBar) < maxGap) {
        if (ph[i] > sonPHi * 1.002 && cur < sonSrc) vurusBar = i;
      }
      if (!Number.isNaN(cur)) { sonPHi = ph[i]; sonSrc = cur; sonBar = i - pivLen; }
    }
  }
  return (bars.length - 1 - vurusBar) <= hold;
}

// ================= ANA HESAPLAMA =================
function hesapla(bars, xu100, usdtry) {
  const n = bars.length;
  const kapanis = ta.seri(bars, 'c'), hacim = ta.seri(bars, 'v');
  const e21 = ta.ema(kapanis, P.len21), e50 = ta.ema(kapanis, P.len50);
  const e100 = ta.ema(kapanis, P.len100), e200 = ta.ema(kapanis, P.len200);
  const st = ta.supertrend(bars, P.stMult, P.stLen);
  const { plus: diP, minus: diM, adx } = ta.dmi(bars, P.adxLen, P.adxLen);
  const rsi = ta.rsi(kapanis, P.rsiLen);
  const mfi = ta.mfi(ta.hlc3(bars), hacim, P.mfiLen);
  const mac = ta.macd(kapanis, 12, 26, 9);
  const atr = ta.atr(bars, P.atrLen);
  const volSma = ta.sma(hacim, P.volLen);
  const obv = ta.obv(bars), obvEma = ta.ema(obv, 21);
  const hh = ta.highest(ta.seri(bars, 'h'), P.hhLen);

  // haftalik EMA20 filtresi
  const haftalik = ta.haftalikYap(bars);
  const hEma = ta.ema(ta.seri(haftalik, 'c'), 20);
  const hBar = haftalik.map((b, i) => ({ t: b.t, c: b.c, e: hEma[i] }));
  let hj = 0; const htfBull = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    while (hj + 1 < hBar.length && hBar[hj + 1].t <= bars[i].t) hj++;
    htfBull[i] = !Number.isNaN(hBar[hj].e) && hBar[hj].c > hBar[hj].e;
  }

  // goreli guc ve USD bazli seri
  const benchCl = hizaliSeri(bars, xu100);
  const rsLine = kapanis.map((c, i) => (!Number.isNaN(benchCl[i]) && benchCl[i] > 0 ? c / benchCl[i] : NaN));
  const rsMa = ta.sma(rsLine, 50);
  const fxCl = hizaliSeri(bars, usdtry);
  const usdLine = kapanis.map((c, i) => (!Number.isNaN(fxCl[i]) && fxCl[i] > 0 ? c / fxCl[i] : NaN));
  const usdMa = ta.sma(usdLine, 50);

  // uyumsuzluklar
  const dRsi = ayiUyumsuzlugu(bars, rsi, P.divPiv, P.divHold, P.divLook);
  const dMfi = ayiUyumsuzlugu(bars, mfi, P.divPiv, P.divHold, P.divLook);
  const dObv = ayiUyumsuzlugu(bars, obv, P.divPiv, P.divHold, P.divLook);
  const dRs = ayiUyumsuzlugu(bars, rsLine, P.divPiv, P.divHold, P.divLook);
  const dUsd = ayiUyumsuzlugu(bars, usdLine, P.divPiv, P.divHold, P.divLook);
  const divCnt = (dRsi ? 1 : 0) + (dMfi ? 1 : 0) + (dObv ? 1 : 0) + (dRs ? 1 : 0) + (dUsd ? 1 : 0);
  const fDiv = divCnt >= 4 ? 40 : divCnt === 3 ? 32 : divCnt === 2 ? 22 : divCnt === 1 ? 10 : 0;

  // --- belirli bir bardaki degerler ---
  const bardaki = (i) => {
    if (i < 1) return null;
    const c = kapanis[i];
    const volRat = volSma[i] > 0 ? hacim[i] / volSma[i] : 1.0;
    const stBull = st.yon[i] < 0;

    const tr1 = ta.norm((c - e200[i]) / e200[i], -0.03, 0.06) * 10;
    const tr2 = (e21[i] > e50[i] && e50[i] > e200[i]) ? 10 : (e21[i] > e50[i] ? 5 : (e50[i] > e200[i] ? 3 : 0));
    const tr3 = stBull ? 8 : 0;
    const tr4 = ta.norm(adx[i], 12, 30) * 7 * (diP[i] > diM[i] ? 1.0 : 0.35);
    const sTrend = tr1 + tr2 + tr3 + tr4;

    const mo1 = (rsi[i] >= P.rsiLo && rsi[i] <= P.rsiHi) ? 8
      : rsi[i] < P.rsiLo ? ta.norm(rsi[i], 25, P.rsiLo) * 6
        : Math.max(0, 8 - (rsi[i] - P.rsiHi) * 0.5);
    const mo2 = (mac.hist[i] > 0 && mac.cizgi[i] > mac.sinyal[i]) ? 8
      : (mac.hist[i] > mac.hist[i - 1] ? 4 : ta.norm(mac.hist[i], -atr[i] * 0.5, 0) * 3);
    const mo3 = ta.norm((c - e50[i]) / atr[i], -1.5, 1.5) * 7;
    const mo4 = (Number.isNaN(rsLine[i]) || Number.isNaN(rsMa[i])) ? 3.5 : ta.norm(rsLine[i] / rsMa[i], 0.95, 1.05) * 7;
    const sMom = mo1 + mo2 + mo3 + mo4;

    const vo1 = ta.norm(volRat, 0.7, P.volMult) * 10;
    const vo2 = obv[i] > obvEma[i] ? 8 : (obv[i] > obv[i - 5] ? 4 : 0);
    const vo3 = ta.norm(c / hh[i], 0.80, 0.97) * 9;
    const vo4 = htfBull[i] ? 8 : 0;
    const sVol = vo1 + vo2 + vo3 + vo4;

    const skor = sTrend + sMom + sVol;

    // risk
    const extR = atr[i] > 0 ? (c - e50[i]) / atr[i] : 0;
    const fExt = extR >= P.extMax ? 20 : extR >= P.extMax * 0.7 ? 10 : 0;
    const fRsi = rsi[i] >= 78 ? 15 : rsi[i] >= 70 ? 8 : 0;
    const rng = bars[i].h - bars[i].l;
    const closeP = rng > 0 ? (c - bars[i].l) / rng : 0.5;
    const climax = volRat >= P.climaxMult && closeP < 0.40 && c > e21[i];
    const fClm = climax ? 12 : 0;
    const momFade = i >= 5 && c > kapanis[i - 5] && mac.hist[i] < mac.hist[i - 5] && mac.hist[i] > 0;
    const fMom = momFade ? 8 : 0;
    let distCnt = 0;
    for (let k = Math.max(1, i - P.distWin + 1); k <= i; k++) if (kapanis[k] < kapanis[k - 1] && kapanis[k] < bars[k].o && hacim[k] > hacim[k - 1]) distCnt++;
    const fDist = distCnt >= 4 ? 10 : distCnt >= 3 ? 6 : 0;
    const risk = Math.min(100, fDiv + fExt + fRsi + fClm + fMom + fDist);

    const rejim = (adx[i] >= P.adxMin && e21[i] > e50[i] && e50[i] > e200[i] && c > e100[i]) ? 2
      : (c > e50[i] && e50[i] > e200[i]) ? 1 : 0;

    const divClear = divCnt < P.divBlock;
    const guclu = skor >= P.thStrong && risk <= P.dgBuyMax && divClear && stBull && c > e200[i] && c > e50[i] && adx[i] >= P.adxMin;
    const al = skor >= P.thBuy && risk <= P.dgBuyMax && divClear && stBull && c > e50[i];

    return { skor, sTrend, sMom, sVol, risk, rejim, guclu, al, stBull, volRat, extR, distCnt, momFade, climax,
      adx: adx[i], diP: diP[i], diM: diM[i], rsi: rsi[i], mfi: mfi[i], atr: atr[i],
      rsGuclu: !Number.isNaN(rsLine[i]) && !Number.isNaN(rsMa[i]) && rsLine[i] > rsMa[i],
      usdYukselis: !Number.isNaN(usdLine[i]) && !Number.isNaN(usdMa[i]) && usdLine[i] > usdMa[i],
      htfBull: htfBull[i], stCizgi: st.cizgi[i], e21: e21[i], e50: e50[i], e200: e200[i] };
  };

  // ---- osilator paneli (Gelismis Secmeli Osilator v4) ----
  const ap = ta.hlc3(bars);
  const esa = ta.ema(ap, P.wtN1);
  const wd = ta.ema(ap.map((v, i) => Math.abs(v - esa[i])), P.wtN1);
  const ci = ap.map((v, i) => (wd[i] ? (v - esa[i]) / (0.015 * wd[i]) : NaN));
  const wt1 = ta.ema(ci, P.wtN2), wt2 = ta.sma(wt1, 4);
  const rsiStoch = ta.rsi(kapanis, P.stochRsiLen);
  const kLine = ta.sma(ta.stoch(rsiStoch, rsiStoch, rsiStoch, P.stochLen), P.stochK);
  const dLine = ta.sma(kLine, P.stochD);
  const gunlukGetiri = kapanis.map((c, i) => (i === 0 ? NaN : (c - kapanis[i - 1]) / kapanis[i - 1]));
  const ort180 = ta.sma(gunlukGetiri, P.sharpeLook);
  const sap180 = ta.stdev(gunlukGetiri, P.sharpeLook).map((v) => v * Math.sqrt(P.sharpeLook));
  const momSerisi = ta.mom(kapanis, 10);
  const i = n - 1;
  const sharpe = (!Number.isNaN(ort180[i]) && sap180[i]) ? (ort180[i] * 365 - P.riskFree) / sap180[i] : NaN;
  const osilator = {
    macd: mac.cizgi[i] > mac.sinyal[i] ? 'AL' : 'SAT',
    rsi: rsi[i] > 50 ? 'POZITIF' : 'NEGATIF',
    adx: (adx[i] > 20 && diP[i] > diM[i]) ? 'AL' : ((adx[i] > 20 && diM[i] > diP[i]) ? 'SAT' : 'NOTR'),
    momentum: momSerisi[i] > 0 ? 'POZITIF' : 'NEGATIF',
    atr: atr[i] > atr[i - 1] ? 'ARTIYOR' : 'AZALIYOR',
    wavetrend: wt1[i] > wt2[i] ? 'AL' : 'SAT',
    stochrsi: kLine[i] > dLine[i] ? 'AL' : 'SAT',
    sharpe: Number.isNaN(sharpe) ? 'veri yok' : (sharpe < -1 ? 'UCUZ (AL)' : (sharpe > 5 ? 'PAHALI (SAT)' : 'NOTR')),
    sharpeDeger: sharpe,
  };
  osilator.alSayisi = ['macd', 'adx', 'wavetrend', 'stochrsi'].filter((k) => osilator[k] === 'AL').length
    + (osilator.rsi === 'POZITIF' ? 1 : 0) + (osilator.momentum === 'POZITIF' ? 1 : 0);

  return { bugun: bardaki(n - 1), dun: bardaki(n - 2), divCnt, uyumsuzluk: { dRsi, dMfi, dObv, dRs, dUsd }, osilator };
}

// ================= CALISTIR =================
yaz('');
yaz('BIST KONFLUANS TARAYICI  —  TradingView gostergelerinizin birebir karsiligi');
yaz('');
let evren;
if (CFG.tekHisse) {
  evren = [{ ticker: 'BIST:' + CFG.tekHisse, ad: CFG.tekHisse }];
  process.stderr.write('Tek hisse modu: ' + CFG.tekHisse + '\n');
} else {
  process.stderr.write('Hisse listesi aliniyor...\n');
  evren = await evreniAl();
}
const tumSemboller = [...evren, { ticker: 'BIST:XU100', ad: 'XU100' }, { ticker: 'FX_IDC:USDTRY', ad: 'USDTRY' }];
process.stderr.write(evren.length + ' hisse + 2 referans serisi. Veriler cekiliyor (' + CFG.bar + ' bar)...\n');

const t0 = Date.now();
const veri = await barlariAl(tumSemboller);
const eksikler = tumSemboller.filter((u) => !veri[u.ticker] || !veri[u.ticker].bars);
if (eksikler.length) { process.stderr.write(eksikler.length + ' sembol alinamadi, tekrar deneniyor...\n'); Object.assign(veri, await barlariAl(eksikler)); }
process.stderr.write('Veri alindi (' + ((Date.now() - t0) / 1000).toFixed(0) + ' sn).\n\n');

const xu100 = veri['BIST:XU100']?.bars || null;
const usdtry = veri['FX_IDC:USDTRY']?.bars || null;
if (!xu100) process.stderr.write('UYARI: XU100 alinamadi, goreli guc notr sayilacak.\n');
if (!usdtry) process.stderr.write('UYARI: USDTRY alinamadi, USD bazli uyumsuzluk devre disi.\n');

const satirlar = []; const yetersiz = [];
for (const k in veri) {
  if (k === 'BIST:XU100' || k === 'FX_IDC:USDTRY') continue;
  const r = veri[k], b = r.bars;
  if (!b || b.length < 210) { yetersiz.push(r.ad); continue; }   // EMA200 icin gerekli
  const son = b[b.length - 1], onceki = b[b.length - 2];
  const hacimTL = (son.c || 0) * (son.v || 0);
  if (hacimTL < CFG.minHacim) continue;
  let h; try { h = hesapla(b, xu100, usdtry); } catch (e) { yetersiz.push(r.ad + '(hata)'); continue; }
  if (!h.bugun || Number.isNaN(h.bugun.skor)) { yetersiz.push(r.ad); continue; }
  satirlar.push({
    ad: r.ad, ...h.bugun, divCnt: h.divCnt, osilator: h.osilator,
    yeniAl: h.bugun.al && h.dun && !h.dun.al,
    yeniGuclu: h.bugun.guclu && h.dun && !h.dun.guclu,
    kapanis: son.c, degisim: ((son.c - onceki.c) / onceki.c) * 100, hacimTL, tarih: new Date(son.t * 1000).toLocaleDateString('tr-TR'),
  });
}

// tek hisse detay modu (dogrulama icin)
if (CFG.tekHisse) {
  const x = satirlar.find((s) => s.ad === CFG.tekHisse);
  if (!x) { yaz('Bulunamadi veya yeterli verisi yok: ' + CFG.tekHisse); process.exit(1); }
  const o = x.osilator;
  yaz('=== ' + x.ad + ' · ' + x.tarih + ' ===');
  yaz('  DURUM            : ' + (x.guclu ? 'GUCLU AL' : x.al ? 'AL' : 'izle'));
  yaz('  Rejim            : ' + (x.rejim === 2 ? 'guclu trend' : x.rejim === 1 ? 'ilimli' : 'zayif / yatay'));
  yaz('  Konfluans        : ' + x.skor.toFixed(1) + ' / 100');
  yaz('   Trend           : ' + x.sTrend.toFixed(1) + '/35   ADX ' + x.adx.toFixed(1));
  yaz('   Momentum        : ' + x.sMom.toFixed(1) + '/30   RSI ' + x.rsi.toFixed(1) + '  MFI ' + x.mfi.toFixed(1));
  yaz('   Hacim/Yapi      : ' + x.sVol.toFixed(1) + '/35   ' + x.volRat.toFixed(2) + 'x');
  yaz('  RISK SKORU       : ' + x.risk);
  yaz('  UYUMSUZLUK       : ' + x.divCnt + '/5');
  yaz('   Konum (EMA50)   : ' + x.extR.toFixed(1) + 'x ATR');
  yaz('   Dagitim (10 bar): ' + x.distCnt + ' gun');
  yaz('   Momentum Sonumu : ' + (x.momFade ? 'VAR' : 'yok'));
  yaz('   Doruk Hacim     : ' + (x.climax ? 'VAR' : 'yok'));
  yaz('   Goreli Guc      : ' + (x.rsGuclu ? 'ENDEKSTEN GUCLU' : 'endeksten zayif'));
  yaz('   Reel (USD) trend: ' + (x.usdYukselis ? 'GERCEK YUKSELIS' : 'reel zayif'));
  yaz('   Haftalik trend  : ' + (x.htfBull ? 'yukari' : 'asagi'));
  yaz('  --- Osilator paneli ---');
  yaz('   MACD ' + o.macd + ' | RSI ' + o.rsi + ' | ADX ' + o.adx + ' | Momentum ' + o.momentum);
  yaz('   ATR ' + o.atr + ' | WaveTrend ' + o.wavetrend + ' | Stoch RSI ' + o.stochrsi + ' | Sharpe ' + o.sharpe);
  process.exit(0);
}

// filtrele
let liste = satirlar.filter((x) => x.skor >= CFG.minSkor);
if (CFG.sinyal === 'al') liste = liste.filter((x) => x.al);
else if (CFG.sinyal === 'guclu') liste = liste.filter((x) => x.guclu);
else if (CFG.sinyal === 'hepsi') liste = liste.filter((x) => x.al || x.guclu);
liste.sort((a, b) => b.skor - a.skor);

const etiket = CFG.sinyal === 'guclu' ? 'GUCLU AL' : CFG.sinyal === 'al' ? 'AL' : CFG.sinyal === 'hepsi' ? 'AL + GUCLU AL' : 'TUM HISSELER';
yaz('=== ' + etiket + ' : ' + liste.length + ' hisse ===');
yaz('');
yaz('  HISSE   DURUM     SKOR  TRD  MOM  HCM  RISK UYM  ADX   RSI  KAPANIS   DEG%   OSILATOR');
for (const x of liste.slice(0, 60)) {
  yaz('  ' + x.ad.padEnd(7)
    + (x.guclu ? 'GUCLU AL' : x.al ? 'AL      ' : 'izle    ').padEnd(10)
    + x.skor.toFixed(0).padStart(4)
    + x.sTrend.toFixed(0).padStart(5) + x.sMom.toFixed(0).padStart(5) + x.sVol.toFixed(0).padStart(5)
    + String(x.risk).padStart(6) + String(x.divCnt).padStart(4)
    + x.adx.toFixed(0).padStart(5) + x.rsi.toFixed(0).padStart(6)
    + x.kapanis.toFixed(2).padStart(10)
    + ((x.degisim >= 0 ? '+' : '') + x.degisim.toFixed(1)).padStart(8)
    + '   ' + x.osilator.alSayisi + '/6');
}
if (liste.length > 60) yaz('  ... ve ' + (liste.length - 60) + ' hisse daha (tamami Excel dosyasinda)');
yaz('');

const yeniler = liste.filter((x) => x.yeniAl || x.yeniGuclu);
if (yeniler.length) yaz('BUGUN YENI SINYAL VEREN: ' + yeniler.map((x) => x.ad).join(', ') + '\n');
if (liste.length) yaz('TradingView listesine yapistirmak icin:\n  ' + liste.slice(0, 40).map((x) => 'BIST:' + x.ad).join(',') + '\n');
if (yetersiz.length) yaz('Not: ' + yetersiz.length + ' hisse 200 gunluk EMA icin yeterli gecmise sahip degil.\n');

// ---- cikti dosyalari ----
const SONUC = path.join(KLASOR, 'sonuclar');
if ((CFG.csv || CFG.rapor) && !fs.existsSync(SONUC)) fs.mkdirSync(SONUC, { recursive: true });

if (CFG.csv) {
  const vir = (v) => String(v).replace('.', ',');
  const bas = ['hisse', 'durum', 'yeni_sinyal', 'konfluans', 'trend_35', 'momentum_30', 'hacim_35', 'risk', 'uyumsuzluk',
    'rejim', 'adx', 'rsi', 'mfi', 'supertrend', 'goreli_guc', 'usd_trend', 'haftalik_trend', 'hacim_orani',
    'ema50_uzaklik_atr', 'dagitim_gun', 'kapanis', 'degisim%', 'islem_hacmi_tl', 'st_cizgisi',
    'osc_macd', 'osc_rsi', 'osc_adx', 'osc_momentum', 'osc_atr', 'osc_wavetrend', 'osc_stochrsi', 'osc_sharpe', 'osc_al_sayisi', 'tarih'];
  const cikti = CFG.sinyal === 'tumu' ? satirlar.slice().sort((a, b) => b.skor - a.skor) : liste;
  const sat = [bas.join(';')];
  for (const x of cikti) {
    const o = x.osilator;
    sat.push([x.ad, x.guclu ? 'GUCLU AL' : x.al ? 'AL' : 'izle', (x.yeniGuclu || x.yeniAl) ? 'EVET' : '',
      vir(x.skor.toFixed(1)), vir(x.sTrend.toFixed(1)), vir(x.sMom.toFixed(1)), vir(x.sVol.toFixed(1)), x.risk, x.divCnt,
      x.rejim === 2 ? 'guclu trend' : x.rejim === 1 ? 'ilimli' : 'zayif',
      vir(x.adx.toFixed(1)), vir(x.rsi.toFixed(1)), vir(x.mfi.toFixed(1)),
      x.stBull ? 'yukari' : 'asagi', x.rsGuclu ? 'guclu' : 'zayif', x.usdYukselis ? 'yukselis' : 'zayif',
      x.htfBull ? 'yukari' : 'asagi', vir(x.volRat.toFixed(2)), vir(x.extR.toFixed(2)), x.distCnt,
      vir(x.kapanis), vir(x.degisim.toFixed(2)), Math.round(x.hacimTL), vir(x.stCizgi.toFixed(2)),
      o.macd, o.rsi, o.adx, o.momentum, o.atr, o.wavetrend, o.stochrsi, o.sharpe, o.alSayisi, x.tarih].join(';'));
  }
  const govde = sat.join('\r\n');
  fs.writeFileSync(path.join(SONUC, 'konfluans_' + bugunEtiket() + '.csv'), '﻿' + govde, 'utf8');
  fs.writeFileSync(path.join(SONUC, 'konfluans-son.csv'), govde, 'utf8');
  yaz('Excel dosyasi: sonuclar\\konfluans_' + bugunEtiket() + '.csv  (' + cikti.length + ' satir, ' + bas.length + ' sutun)\n');
}

// ---- KULLANICI DOSTU CIKTILAR ----
if (CFG.csv || CFG.rapor) {
  // 1) sade liste: dusunmeden okunan kisa CSV
  const sade = sadeListe(satirlar);
  fs.writeFileSync(path.join(SONUC, 'firsatlar_' + bugunEtiket() + '.csv'), '﻿' + sade, 'utf8');
  fs.writeFileSync(path.join(SONUC, 'firsatlar-son.csv'), sade, 'utf8');

  // 2) telefonda acilan renkli sayfa. Supertrend sinyallerini de ustune koy.
  let stSinyal = [];
  try {
    const p = path.join(SONUC, 'son.csv');
    if (fs.existsSync(p)) {
      stSinyal = fs.readFileSync(p, 'utf8').split(/\r?\n/).slice(1)
        .map((s) => s.split(';')).filter((c) => c[0] === 'AL').map((c) => c[1]).filter(Boolean);
    }
  } catch (e) {}
  const gun = satirlar.length ? satirlar[0].tarih : bugunEtiket();
  fs.writeFileSync(path.join(KLASOR, 'index.html'), htmlRapor(satirlar, stSinyal, gun), 'utf8');
  yaz('Sade liste  : sonuclar\\firsatlar_' + bugunEtiket() + '.csv');
  yaz('Renkli sayfa: index.html\n');
}

if (CFG.rapor) {
  const metin = raporSatirlari.join('\r\n');
  fs.writeFileSync(path.join(SONUC, 'konfluans-' + bugunEtiket() + '.txt'), metin, 'utf8');
  fs.writeFileSync(path.join(KLASOR, 'SON-KONFLUANS.txt'), metin, 'utf8');
}
process.exit(0);
