/* ============================================================================
   BIST PANELI - CLOUDFLARE WORKER
   ----------------------------------------------------------------------------
   Iki is yapar:

   1) ZAMANLAYICI  (scheduled)
      Her aksam GitHub'a "taramayi calistir" emri gonderir. GitHub'in kendi
      zamanlayicisi yeni/dusuk trafikli depolarda saatlerce gecikebiliyor;
      disaridan gelen bu emir ise kuyruga girmeden aninda calisiyor.

   2) RADAR SENKRONU  (fetch)
      Yildizlanan hisseleri kucuk bir anahtar-deger deposunda (KV) tutar.
      Telefon ve bilgisayar ayni "senkron kodunu" kullanir, listeler birlesir.

   ----------------------------------------------------------------------------
   GEREKENLER (Cloudflare panelinden ayarlanir)
     KV baglantisi : RADAR
     Gizli deger   : GITHUB_TOKEN   (GitHub'dan uretilen dar yetkili anahtar)
     Gizli deger   : TETIK_KODU     (sadece test tetigi icin; kendi belirledigin
                                     bir parola gibi dusun)
   ========================================================================== */

const DEPO = 'smhylmz23/supertrend';
const AKIS = 'tarama.yml';
const DAL = 'main';

/* Radar kaydinin bicimi:
     { "RYSAS": { d: "2026-08-31", t: 1788198759585, s: 1 }, ... }
   d = radara eklendigi gun,  t = son degisiklik ani,  s = 1 ekli / 0 cikarilmis.
   Cikarilanlari silmeyip s:0 olarak saklariz; yoksa diger cihaz onlari
   geri diriltir. Birlestirmede her hisse icin "t" degeri buyuk olan kazanir. */
function birlestir(a, b) {
  const c = {};
  for (const ad of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const x = (a || {})[ad], y = (b || {})[ad];
    if (!x) { c[ad] = y; continue; }
    if (!y) { c[ad] = x; continue; }
    c[ad] = (Number(y.t) || 0) > (Number(x.t) || 0) ? y : x;
  }
  return c;
}

// Cok eski "cikarildi" kayitlarini temizle; sonsuza kadar birikmesinler.
function buda(kayit) {
  const sinir = Date.now() - 180 * 86400000;   // 180 gun
  const c = {};
  for (const [ad, v] of Object.entries(kayit)) {
    if (v && v.s === 0 && (Number(v.t) || 0) < sinir) continue;
    c[ad] = v;
  }
  return c;
}

const KOD_BICIMI = /^[A-Za-z0-9-]{8,64}$/;

function basliklar(ekstra) {
  return Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Kod',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
  }, ekstra || {});
}

const yanit = (nesne, durum) => new Response(JSON.stringify(nesne), {
  status: durum || 200,
  headers: basliklar({ 'Content-Type': 'application/json; charset=utf-8' }),
});

async function taramayiTetikle(env, zorla) {
  if (!env.GITHUB_TOKEN) return { ok: false, not: 'GITHUB_TOKEN tanimli degil' };
  const adres = 'https://api.github.com/repos/' + DEPO + '/actions/workflows/' + AKIS + '/dispatches';
  const c = await fetch(adres, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.GITHUB_TOKEN,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'bist-paneli-zamanlayici',
    },
    body: JSON.stringify({ ref: DAL, inputs: { zorla: zorla ? 'evet' : 'hayir' } }),
  });
  // Basarili istek 204 doner, govdesi bostur.
  const govde = c.status === 204 ? '' : (await c.text()).slice(0, 400);
  return { ok: c.status === 204, durum: c.status, not: govde };
}

export default {

  // ---- her aksam otomatik ----
  async scheduled(olay, env, ctx) {
    ctx.waitUntil((async () => {
      const s = await taramayiTetikle(env, false);
      console.log('zamanlanmis tetik ->', JSON.stringify(s));
    })());
  },

  // ---- panelin konustugu adresler ----
  async fetch(istek, env) {
    const u = new URL(istek.url);

    if (istek.method === 'OPTIONS') return new Response(null, { status: 204, headers: basliklar() });

    // Calisiyor mu, ayarlar tamam mi? (gizli degerleri sizdirmadan)
    if (u.pathname === '/durum') {
      return yanit({
        calisiyor: true,
        githubAnahtari: !!env.GITHUB_TOKEN,
        tetikKodu: !!env.TETIK_KODU,
        radarDeposu: !!env.RADAR,
        depo: DEPO,
      });
    }

    // Elle test tetigi: kurulumdan sonra 18:45'i beklemeden denemek icin.
    if (u.pathname === '/tetikle') {
      if (istek.method !== 'POST') return yanit({ hata: 'POST kullanin' }, 405);
      if (!env.TETIK_KODU || istek.headers.get('X-Kod') !== env.TETIK_KODU) {
        return yanit({ hata: 'kod gecersiz' }, 403);
      }
      const s = await taramayiTetikle(env, true);
      return yanit(s, s.ok ? 200 : 502);
    }

    // Radar senkronu
    if (u.pathname === '/radar') {
      if (!env.RADAR) return yanit({ hata: 'RADAR deposu bagli degil' }, 500);
      const kod = istek.headers.get('X-Kod') || '';
      if (!KOD_BICIMI.test(kod)) return yanit({ hata: 'senkron kodu gecersiz' }, 400);
      const anahtar = 'radar:' + kod;

      if (istek.method === 'GET') {
        const v = await env.RADAR.get(anahtar, 'json');
        return yanit({ kayit: v || {} });
      }

      if (istek.method === 'POST') {
        let gelen;
        try { gelen = await istek.json(); } catch (e) { return yanit({ hata: 'gecersiz govde' }, 400); }
        const yerel = (gelen && gelen.kayit) || {};
        if (typeof yerel !== 'object' || Array.isArray(yerel)) return yanit({ hata: 'gecersiz kayit' }, 400);
        if (Object.keys(yerel).length > 3000) return yanit({ hata: 'kayit cok buyuk' }, 413);

        const sunucu = await env.RADAR.get(anahtar, 'json');
        const yeni = buda(birlestir(sunucu || {}, yerel));
        await env.RADAR.put(anahtar, JSON.stringify(yeni));
        return yanit({ kayit: yeni });
      }

      return yanit({ hata: 'GET ya da POST kullanin' }, 405);
    }

    return yanit({ hata: 'bilinmeyen adres' }, 404);
  },
};
