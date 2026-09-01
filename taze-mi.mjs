// Yayindaki index.html tazelenmeli mi?  "EVET" = gerek yok, atla.  "HAYIR" = tara.
// Herhangi bir aksilikte HAYIR der; suphede kalirsak tararız.
//
// Iki tuzagi birden kolluyor:
//  1) Yayindaki sayfa gun-ici (borsa aciktan) uretilmisse ASLA taze sayilmaz.
//     Yoksa "tarih ayni" diye bakip yarim veriyi guncel sanar, aksam taramasini
//     atlar ve panel butun aksam kapanmamis mumla kalir.
//  2) Su anda borsa aciksa zamanlanmis tarama hic yapilmaz. Gecikmis bir yedek
//     cron seans ortasina denk gelip saglam kapanis verisinin uzerine yarim
//     veri yazmasin. (Elle "zorla" calistirilirsa yine de tarar.)
import fs from 'fs';

const WSOPTS = { headers: { Origin: 'https://www.tradingview.com', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' } };
const cerceve = (o) => { const s = JSON.stringify(o); return '~m~' + s.length + '~m~' + s; };
const coz = (raw) => { const out = []; const re = /~m~(\d+)~m~/g; let m; while ((m = re.exec(raw)) !== null) { const len = +m[1], bas = m.index + m[0].length; out.push(raw.slice(bas, bas + len)); re.lastIndex = bas + len; } return out; };

function sonKapanisGunu() {
  return new Promise((ok) => {
    let ws; let bars = null;
    const bitir = () => { try { ws.close(); } catch (e) {} ok(bars && bars.length ? new Date(bars[bars.length - 1].t * 1000).toISOString().slice(0, 10) : null); };
    const zaman = setTimeout(bitir, 25000);
    try { ws = new WebSocket('wss://data.tradingview.com/socket.io/websocket?from=chart%2F', WSOPTS); } catch (e) { clearTimeout(zaman); return ok(null); }
    const cs = 'cs_' + Math.random().toString(36).slice(2, 12);
    ws.addEventListener('message', (ev) => {
      for (const p of coz(String(ev.data))) {
        if (p.startsWith('~h~')) { try { ws.send('~m~' + p.length + '~m~' + p); } catch (e) {} continue; }
        let j; try { j = JSON.parse(p); } catch (e) { continue; }
        if (j.session_id) {
          ws.send(cerceve({ m: 'set_auth_token', p: ['unauthorized_user_token'] }));
          ws.send(cerceve({ m: 'chart_create_session', p: [cs, ''] }));
          ws.send(cerceve({ m: 'resolve_symbol', p: [cs, 'sy1', '=' + JSON.stringify({ symbol: 'BIST:XU100', adjustment: 'splits' })] }));
          ws.send(cerceve({ m: 'create_series', p: [cs, 's1', 's1', 'sy1', '1D', 5, ''] }));
          continue;
        }
        if (j.m === 'timescale_update' && j.p && j.p[1] && j.p[1].s1) {
          const s = j.p[1].s1.s;
          if (s && s.length) bars = s.map((x) => ({ t: x.v[0] }));
        } else if (j.m === 'series_completed' || j.m === 'symbol_error' || j.m === 'series_error') { clearTimeout(zaman); bitir(); }
      }
    });
    ws.addEventListener('error', () => { clearTimeout(zaman); ok(null); });
  });
}

// Yayindaki sayfadan iki bilgi: hangi gune ait, ve gun-ici mi uretilmis.
function yayinDurumu() {
  try {
    const h = fs.readFileSync('index.html', 'utf8');
    const m = h.slice(0, 4000).match(/<title>[^<]*?(\d{2})\.(\d{2})\.(\d{4})/);
    return {
      gun: m ? m[3] + '-' + m[2] + '-' + m[1] : null,
      gunIci: h.includes('Borsa açık — bu rakamlar geçici.'),
    };
  } catch (e) { return { gun: null, gunIci: false }; }
}

// Borsa su anda acik mi? (Turkiye = UTC+3, yaz saati yok. Seans 10:00-18:00,
// kapanis seansi 18:10'a kadar surer.)
function borsaAcikMi() {
  const tr = new Date(Date.now() + 3 * 3600 * 1000);
  const gun = tr.getUTCDay();                       // 0 Pazar ... 6 Cumartesi
  if (gun === 0 || gun === 6) return false;
  const dk = tr.getUTCHours() * 60 + tr.getUTCMinutes();
  return dk >= 10 * 60 && dk < 18 * 60 + 10;
}

const borsa = await sonKapanisGunu();
const yayin = yayinDurumu();
const acik = borsaAcikMi();

let sonuc;
if (acik) sonuc = 'EVET';                                   // seans ortasinda tarama yok
else if (!borsa || !yayin.gun) sonuc = 'HAYIR';             // bilgi eksik -> tara
else if (yayin.gunIci) sonuc = 'HAYIR';                     // yayindaki veri yarim -> tara
else sonuc = borsa === yayin.gun ? 'EVET' : 'HAYIR';

process.stderr.write(
  '  borsanin son bari: ' + (borsa || '?') +
  ' | yayindaki veri: ' + (yayin.gun || '?') + (yayin.gunIci ? ' (GUN ICI, yarim)' : '') +
  ' | borsa su an: ' + (acik ? 'ACIK' : 'kapali') +
  ' -> ' + sonuc + '\n');
console.log(sonuc);
