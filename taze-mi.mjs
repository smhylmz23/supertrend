// Yayindaki index.html hangi kapanisa ait? Borsanin son kapanisi hangi gun?
// Ikisi ayniysa "EVET" (tarama gereksiz), degilse "HAYIR" yazar.
// Herhangi bir aksilikte HAYIR der; yani suphede kalirsak tarariz.
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

function yayindakiGun() {
  try {
    const h = fs.readFileSync('index.html', 'utf8').slice(0, 4000);
    const m = h.match(/<title>[^<]*?(\d{2})\.(\d{2})\.(\d{4})/);
    return m ? m[3] + '-' + m[2] + '-' + m[1] : null;
  } catch (e) { return null; }
}

const borsa = await sonKapanisGunu();
const yayin = yayindakiGun();
process.stderr.write('  borsanin son kapanisi: ' + (borsa || '?') + ' | yayindaki veri: ' + (yayin || '?') + '\n');
console.log(borsa && yayin && borsa === yayin ? 'EVET' : 'HAYIR');
