#!/usr/bin/env node
/*
 * ============================================================
 *  SUPERTREND TARAYICI  -  BIST
 * ============================================================
 *  TradingView'in kendi verisini kullanir. Ucretli uyelik,
 *  API anahtari veya kurulum gerekmez. Sadece Node.js yeter.
 *
 *  KULLANIM
 *    node supertrend-tarayici.mjs
 *
 *  SECENEKLER
 *    --atr 10           ATR periyodu            (varsayilan 10)
 *    --carpan 3         Carpan / Factor         (varsayilan 3)
 *    --periyot 1D       1D | 1W | 240 | 60 | 15 (varsayilan 1D)
 *    --sinyal al        al | sat | hepsi        (varsayilan al)
 *    --min-hacim 0      TL islem hacmi alt siniri
 *    --csv              sonucu CSV dosyasina da yaz
 *
 *  ORNEKLER
 *    node supertrend-tarayici.mjs --min-hacim 50000000
 *    node supertrend-tarayici.mjs --periyot 1W --sinyal hepsi
 *    node supertrend-tarayici.mjs --atr 7 --carpan 2 --csv
 * ============================================================
 */

import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const KLASOR = path.dirname(fileURLToPath(import.meta.url));
const YEDEK_LISTE = path.join(KLASOR, 'hisseler.json');
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- ayarlar ----------
const A = process.argv.slice(2);
const opt = (ad, varsayilan) => { const i = A.indexOf('--' + ad); return i >= 0 && A[i + 1] ? A[i + 1] : varsayilan; };
const CFG = {
  atr: +opt('atr', 10),
  carpan: +opt('carpan', 3),
  periyot: opt('periyot', '1D'),
  sinyal: opt('sinyal', 'al').toLowerCase(),
  minHacim: +opt('min-hacim', 0),
  csv: A.includes('--csv'),
  rapor: A.includes('--rapor'),
  bar: 300,
  isci: 6,
  zamanAsimi: 20000,
};

// --rapor verildiginde ekrana yazilan her sey ayrica dosyaya da kaydedilir
const raporSatirlari = [];
if (CFG.rapor) {
  const ekranaYaz = console.log;
  console.log = (...a) => { const s = a.join(' '); raporSatirlari.push(s); ekranaYaz(s); };
}
const bugunEtiket = () => {
  const g = new Date();
  return g.getFullYear() + '-' + String(g.getMonth() + 1).padStart(2, '0') + '-' + String(g.getDate()).padStart(2, '0');
};

// ---------- TradingView soket yardimcilari ----------
const WSOPTS = {
  headers: {
    Origin: 'https://www.tradingview.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
  },
};
const cerceve = (o) => { const s = JSON.stringify(o); return '~m~' + s.length + '~m~' + s; };
const coz = (raw) => {
  const out = []; const re = /~m~(\d+)~m~/g; let m;
  while ((m = re.exec(raw)) !== null) {
    const len = +m[1]; const bas = m.index + m[0].length;
    out.push(raw.slice(bas, bas + len)); re.lastIndex = bas + len;
  }
  return out;
};
const baglan = () => new Promise((ok, hata) => {
  const ws = new WebSocket('wss://data.tradingview.com/socket.io/websocket?from=chart%2F', WSOPTS);
  ws.addEventListener('open', () => ok(ws));
  ws.addEventListener('error', () => hata(new Error('baglanti kurulamadi')));
});

// ---------- Supertrend (TradingView ta.supertrend birebir) ----------
function supertrend(bars, carpan, periyot) {
  const n = bars.length; const tr = new Array(n); const atr = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const h = bars[i].h; const l = bars[i].l;
    tr[i] = i === 0 ? h - l : Math.max(h - l, Math.abs(h - bars[i - 1].c), Math.abs(l - bars[i - 1].c));
  }
  for (let i = 0; i < n; i++) {
    if (i < periyot - 1) atr[i] = NaN;
    else if (i === periyot - 1) { let s = 0; for (let k = 0; k < periyot; k++) s += tr[k]; atr[i] = s / periyot; }
    else atr[i] = (atr[i - 1] * (periyot - 1) + tr[i]) / periyot;
  }
  const dir = new Array(n).fill(NaN); const st = new Array(n).fill(NaN);
  let ustO = 0; let altO = 0; let stO = NaN;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(atr[i])) continue;
    const hl2 = (bars[i].h + bars[i].l) / 2;
    let ust = hl2 + carpan * atr[i];
    let alt = hl2 - carpan * atr[i];
    const ko = i > 0 ? bars[i - 1].c : NaN;
    alt = (alt > altO || ko < altO) ? alt : altO;
    ust = (ust < ustO || ko > ustO) ? ust : ustO;
    let d;
    if (i === 0 || Number.isNaN(atr[i - 1])) d = 1;
    else if (stO === ustO) d = bars[i].c > ust ? -1 : 1;
    else d = bars[i].c < alt ? 1 : -1;
    const s = d === -1 ? alt : ust;
    dir[i] = d; st[i] = s;
    ustO = ust; altO = alt; stO = s;
  }
  return { dir, st };
}

// ---------- 1) evren ----------
async function evreniAl() {
  const govde = {
    filter: [{ left: 'type', operation: 'equal', right: 'stock' }],
    options: { lang: 'tr' },
    markets: ['turkey'],
    symbols: { query: { types: [] }, tickers: [] },
    columns: ['name', 'close', 'change', 'volume', 'Value.Traded'],
    sort: { sortBy: 'Value.Traded', sortOrder: 'desc' },
    range: [0, 2000],
  };
  // not: Node'un fetch'i bu adrese ECONNRESET veriyor, https modulu sorunsuz calisiyor.
  // Servis ara sira baglantiyi kesiyor, o yuzden birkac kez deniyoruz.
  const govdeMetin = JSON.stringify(govde);
  const birDene = () => new Promise((ok, hata) => {
    const istek = https.request({
      host: 'scanner.tradingview.com',
      path: '/turkey/scan',
      method: 'POST',
      maxVersion: 'TLSv1.2',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': WSOPTS.headers['User-Agent'],
        'Content-Length': Buffer.byteLength(govdeMetin),
      },
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); hata(new Error('HTTP ' + res.statusCode)); return; }
      let d = ''; res.setEncoding('utf8');
      res.on('data', (c) => { d += c; });
      res.on('end', () => ok(d));
    });
    istek.setTimeout(15000, () => istek.destroy(new Error('zaman asimi')));
    istek.on('error', (e) => hata(new Error(e.code || e.message)));
    istek.write(govdeMetin);
    istek.end();
  });

  for (let deneme = 1; deneme <= 4; deneme++) {
    try {
      const j = JSON.parse(await birDene());
      const liste = j.data.map((x) => ({ ticker: x.s, ad: x.d[0] }));
      try { fs.writeFileSync(YEDEK_LISTE, JSON.stringify(liste)); } catch (e) {}
      return liste;
    } catch (e) {
      process.stderr.write('  liste alinamadi (' + e.message + '), ' + deneme + '. deneme...\n');
      if (deneme < 4) await bekle(2000);
    }
  }

  // servis hic cevap vermediyse en son basarili listeyle devam et
  if (fs.existsSync(YEDEK_LISTE)) {
    const liste = JSON.parse(fs.readFileSync(YEDEK_LISTE, 'utf8'));
    process.stderr.write('  Servise ulasilamadi. Kayitli hisse listesi kullaniliyor (' + liste.length + ' hisse).\n');
    return liste;
  }
  throw new Error('Hisse listesi alinamadi ve kayitli yedek liste yok. Internet baglantinizi kontrol edip tekrar deneyin.');
}

// ---------- 2) barlar ----------
async function barlariAl(evren) {
  const sonuc = {};
  let bitti = 0;
  const parcalar = Array.from({ length: CFG.isci }, () => []);
  evren.forEach((u, i) => parcalar[i % CFG.isci].push({ ...u }));

  const isci = (liste) => new Promise(async (bittiginde) => {
    let ws; let cs; let sira = 0; let akt = null; let sayac = null;
    const sonraki = () => {
      if (!liste.length) { try { ws.close(); } catch (e) {} return bittiginde(); }
      const it = liste.shift(); sira++;
      akt = { it, sid: 's' + sira, symid: 'sym' + sira, bars: null };
      clearTimeout(sayac);
      sayac = setTimeout(() => kapat(), CFG.zamanAsimi);
      ws.send(cerceve({ m: 'resolve_symbol', p: [cs, akt.symid, '=' + JSON.stringify({ symbol: it.ticker, adjustment: 'splits' })] }));
      ws.send(cerceve({ m: 'create_series', p: [cs, akt.sid, akt.sid, akt.symid, CFG.periyot, CFG.bar, ''] }));
    };
    const kapat = () => {
      clearTimeout(sayac);
      if (akt) {
        sonuc[akt.it.ticker] = { ...akt.it, bars: akt.bars };
        try { ws.send(cerceve({ m: 'remove_series', p: [cs, akt.sid] })); } catch (e) {}
        akt = null;
        bitti++;
        if (bitti % 100 === 0) process.stderr.write('  ' + bitti + '/' + evren.length + '\n');
      }
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
        if (j.session_id) {
          ws.send(cerceve({ m: 'set_auth_token', p: ['unauthorized_user_token'] }));
          ws.send(cerceve({ m: 'chart_create_session', p: [cs, ''] }));
          sonraki(); continue;
        }
        if (!akt) continue;
        if (j.m === 'timescale_update' && j.p && j.p[1] && j.p[1][akt.sid]) {
          const s = j.p[1][akt.sid].s;
          if (s && s.length) akt.bars = s.map((x) => ({ t: x.v[0], o: x.v[1], h: x.v[2], l: x.v[3], c: x.v[4], v: x.v[5] }));
        } else if (j.m === 'series_completed' || j.m === 'symbol_error' || j.m === 'series_error') kapat();
      }
    });
  });

  await Promise.all(parcalar.map(isci));
  return sonuc;
}

// ---------- calistir ----------
const tarih = (t) => new Date(t * 1000).toLocaleDateString('tr-TR');
const tl = (n) => Math.round(n).toLocaleString('tr-TR');

console.log('\nSUPERTREND TARAYICI  -  ATR ' + CFG.atr + ' / Carpan ' + CFG.carpan + ' / Periyot ' + CFG.periyot + '\n');
process.stderr.write('Hisse listesi aliniyor...\n');
const evren = await evreniAl();
process.stderr.write(evren.length + ' hisse bulundu. Veriler cekiliyor...\n');

const t0 = Date.now();
const veri = await barlariAl(evren);

// ilk turda alinamayanlari bir kez daha dene
const alinamayan = evren.filter((u) => !veri[u.ticker] || !veri[u.ticker].bars);
if (alinamayan.length) {
  process.stderr.write(alinamayan.length + ' hisse alinamadi, tekrar deneniyor...\n');
  Object.assign(veri, await barlariAl(alinamayan));
}
process.stderr.write('Veri alindi (' + ((Date.now() - t0) / 1000).toFixed(0) + ' sn).\n\n');

const al = []; const sat = []; const eksik = [];
const enAzBar = CFG.atr * 5;
for (const k in veri) {
  const r = veri[k]; const b = r.bars;
  if (!b || b.length < enAzBar) { eksik.push(r.ad); continue; }
  const n = b.length;
  const son = b[n - 1]; const onceki = b[n - 2];
  const hacimTL = (son.c || 0) * (son.v || 0);   // gunun TL islem hacmi
  if (hacimTL < CFG.minHacim) continue;
  const { dir, st } = supertrend(b, CFG.carpan, CFG.atr);
  const kayit = {
    ad: r.ad,
    kapanis: son.c,
    degisim: ((son.c - onceki.c) / onceki.c) * 100,
    st: st[n - 1],
    tarih: tarih(son.t),
    hacimTL,
  };
  if (dir[n - 1] === -1 && dir[n - 2] === 1) al.push(kayit);
  if (dir[n - 1] === 1 && dir[n - 2] === -1) sat.push(kayit);
}
al.sort((a, b) => b.hacimTL - a.hacimTL);
sat.sort((a, b) => b.hacimTL - a.hacimTL);

const yaz = (baslik, liste) => {
  console.log('=== ' + baslik + ': ' + liste.length + ' hisse ===');
  if (!liste.length) { console.log('  (yok)\n'); return; }
  console.log('  HISSE   KAPANIS      DEG%    ST CIZGISI     ISLEM HACMI (TL)   TARIH');
  for (const x of liste) {
    console.log('  ' + x.ad.padEnd(7)
      + x.kapanis.toFixed(2).padStart(8)
      + ((x.degisim >= 0 ? '+' : '') + x.degisim.toFixed(2)).padStart(9)
      + x.st.toFixed(2).padStart(13)
      + tl(x.hacimTL).padStart(21) + '   ' + x.tarih);
  }
  console.log('');
};

if (CFG.sinyal === 'al' || CFG.sinyal === 'hepsi') yaz('AL SINYALI', al);
if (CFG.sinyal === 'sat' || CFG.sinyal === 'hepsi') yaz('SAT SINYALI', sat);

if (al.length) console.log('TradingView listesine yapistirmak icin:\n  ' + al.map((x) => 'BIST:' + x.ad).join(',') + '\n');
if (eksik.length) console.log('Not: ' + eksik.length + ' hisse yeterli gecmis veriye sahip degil (yeni islem gormeye baslamis): ' + eksik.join(', ') + '\n');

// sonuclar klasoru (rapor ve csv icin)
const SONUC_KLASORU = path.join(KLASOR, 'sonuclar');
if ((CFG.csv || CFG.rapor) && !fs.existsSync(SONUC_KLASORU)) fs.mkdirSync(SONUC_KLASORU, { recursive: true });

if (CFG.csv) {
  // Turkce Excel/E-Tablolar ondalik ayraci olarak VIRGUL bekler.
  // Nokta kullanilirsa 9.07 gibi degerler tarih sanilip bozuluyor.
  const vir = (n) => String(n).replace('.', ',');
  const satirlar = ['sinyal;hisse;kapanis;degisim%;st_cizgisi;islem_hacmi_tl;tarih'];
  for (const x of al) satirlar.push(['AL', x.ad, vir(x.kapanis), vir(x.degisim.toFixed(2)), vir(x.st.toFixed(2)), Math.round(x.hacimTL), x.tarih].join(';'));
  for (const x of sat) satirlar.push(['SAT', x.ad, vir(x.kapanis), vir(x.degisim.toFixed(2)), vir(x.st.toFixed(2)), Math.round(x.hacimTL), x.tarih].join(';'));
  const icerik = '﻿' + satirlar.join('\r\n');
  fs.writeFileSync(path.join(SONUC_KLASORU, 'supertrend_' + bugunEtiket() + '.csv'), icerik, 'utf8');
  // sabit isimli kopya: Google E-Tablolar formulu hep bu dosyaya baksin diye
  fs.writeFileSync(path.join(SONUC_KLASORU, 'son.csv'), icerik, 'utf8');
  console.log('CSV yazildi: sonuclar\\supertrend_' + bugunEtiket() + '.csv  (Excel ile acilabilir)\n');
}

if (CFG.rapor) {
  const metin = raporSatirlari.join('\r\n');
  fs.writeFileSync(path.join(SONUC_KLASORU, bugunEtiket() + '.txt'), metin, 'utf8');
  fs.writeFileSync(path.join(KLASOR, 'SON-TARAMA.txt'), metin, 'utf8');
}
process.exit(0);
