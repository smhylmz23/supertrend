/*
 * ta.mjs — TradingView Pine Script'teki ta.* fonksiyonlarinin birebir JS karsiligi.
 *
 * Onemli: Pine'da ta.ema ve ta.rma ilk degeri SMA ile tohumlar; bundan onceki
 * barlar na'dir. Burada na yerine NaN kullaniliyor. Ayni sekilde ta.stdev
 * varsayilan olarak POPULASYON standart sapmasidir (N'e boler, N-1'e degil).
 */

const N = NaN;
export const nz = (v, d = 0) => (v === undefined || v === null || Number.isNaN(v) ? d : v);

// ---------- temel diziler ----------
export function sma(src, len) {
  const n = src.length, out = new Array(n).fill(N);
  let top = 0, adet = 0;
  for (let i = 0; i < n; i++) {
    const v = src[i];
    if (!Number.isNaN(v)) { top += v; adet++; }
    if (i >= len) { const eski = src[i - len]; if (!Number.isNaN(eski)) { top -= eski; adet--; } }
    if (i >= len - 1 && adet === len) out[i] = top / len;
  }
  return out;
}

export function ema(src, len) {
  const n = src.length, out = new Array(n).fill(N);
  const a = 2 / (len + 1);
  const s = sma(src, len);
  let bas = -1;
  for (let i = 0; i < n; i++) if (!Number.isNaN(s[i])) { bas = i; break; }
  if (bas < 0) return out;
  out[bas] = s[bas];
  for (let i = bas + 1; i < n; i++) out[i] = a * src[i] + (1 - a) * out[i - 1];
  return out;
}

// Wilder yumusatmasi (ta.rma) — ta.rsi, ta.atr, ta.dmi bunu kullanir
export function rma(src, len) {
  const n = src.length, out = new Array(n).fill(N);
  const a = 1 / len;
  const s = sma(src, len);
  let bas = -1;
  for (let i = 0; i < n; i++) if (!Number.isNaN(s[i])) { bas = i; break; }
  if (bas < 0) return out;
  out[bas] = s[bas];
  for (let i = bas + 1; i < n; i++) out[i] = a * src[i] + (1 - a) * out[i - 1];
  return out;
}

export function stdev(src, len) {
  const n = src.length, out = new Array(n).fill(N);
  const ort = sma(src, len);
  for (let i = len - 1; i < n; i++) {
    if (Number.isNaN(ort[i])) continue;
    let t = 0;
    for (let k = i - len + 1; k <= i; k++) { const f = src[k] - ort[i]; t += f * f; }
    out[i] = Math.sqrt(t / len);   // populasyon (Pine varsayilani biased=true)
  }
  return out;
}

export function highest(src, len) {
  const n = src.length, out = new Array(n).fill(N);
  for (let i = len - 1; i < n; i++) { let m = -Infinity; for (let k = i - len + 1; k <= i; k++) if (src[k] > m) m = src[k]; out[i] = m; }
  return out;
}

export function lowest(src, len) {
  const n = src.length, out = new Array(n).fill(N);
  for (let i = len - 1; i < n; i++) { let m = Infinity; for (let k = i - len + 1; k <= i; k++) if (src[k] < m) m = src[k]; out[i] = m; }
  return out;
}

export const seri = (bars, alan) => bars.map((b) => b[alan]);
export const hlc3 = (bars) => bars.map((b) => (b.h + b.l + b.c) / 3);
export const hl2 = (bars) => bars.map((b) => (b.h + b.l) / 2);

// ---------- volatilite ----------
export function trueRange(bars) {
  const n = bars.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    const { h, l } = bars[i];
    out[i] = i === 0 ? h - l : Math.max(h - l, Math.abs(h - bars[i - 1].c), Math.abs(l - bars[i - 1].c));
  }
  return out;
}
export const atr = (bars, len) => rma(trueRange(bars), len);

// ---------- osilatorler ----------
export function rsi(src, len) {
  const n = src.length;
  const yuk = new Array(n).fill(0), dus = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const f = src[i] - src[i - 1];
    yuk[i] = Math.max(f, 0);
    dus[i] = Math.max(-f, 0);
  }
  const ry = rma(yuk, len), rd = rma(dus, len);
  const out = new Array(n).fill(N);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(ry[i]) || Number.isNaN(rd[i])) continue;
    out[i] = rd[i] === 0 ? 100 : ry[i] === 0 ? 0 : 100 - 100 / (1 + ry[i] / rd[i]);
  }
  return out;
}

// ta.mfi(src, len) — tipik fiyat kaynagi disaridan verilir
export function mfi(src, hacim, len) {
  const n = src.length;
  const poz = new Array(n).fill(0), neg = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const f = src[i] - src[i - 1];
    if (f > 0) poz[i] = hacim[i] * src[i];
    else if (f < 0) neg[i] = hacim[i] * src[i];
  }
  const sp = new Array(n).fill(N), sn = new Array(n).fill(N);
  let tp = 0, tn = 0;
  for (let i = 0; i < n; i++) {
    tp += poz[i]; tn += neg[i];
    if (i >= len) { tp -= poz[i - len]; tn -= neg[i - len]; }
    if (i >= len) { sp[i] = tp; sn[i] = tn; }
  }
  const out = new Array(n).fill(N);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(sp[i])) continue;
    out[i] = sn[i] === 0 ? 100 : sp[i] === 0 ? 0 : 100 - 100 / (1 + sp[i] / sn[i]);
  }
  return out;
}

export function macd(src, hizli = 12, yavas = 26, sinyalLen = 9) {
  const eh = ema(src, hizli), ey = ema(src, yavas);
  const cizgi = src.map((_, i) => (Number.isNaN(eh[i]) || Number.isNaN(ey[i]) ? N : eh[i] - ey[i]));
  const sinyal = ema(cizgi, sinyalLen);
  const hist = cizgi.map((v, i) => (Number.isNaN(v) || Number.isNaN(sinyal[i]) ? N : v - sinyal[i]));
  return { cizgi, sinyal, hist };
}

// ta.dmi(diLen, adxSmooth) -> [+DI, -DI, ADX]
export function dmi(bars, diLen, adxSmooth) {
  const n = bars.length;
  const pDM = new Array(n).fill(0), mDM = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const yuk = bars[i].h - bars[i - 1].h;
    const dus = bars[i - 1].l - bars[i].l;
    pDM[i] = (yuk > dus && yuk > 0) ? yuk : 0;
    mDM[i] = (dus > yuk && dus > 0) ? dus : 0;
  }
  const trur = rma(trueRange(bars), diLen);
  const rp = rma(pDM, diLen), rm = rma(mDM, diLen);
  const plus = new Array(n).fill(N), minus = new Array(n).fill(N), dx = new Array(n).fill(N);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(trur[i]) || trur[i] === 0) continue;
    plus[i] = 100 * rp[i] / trur[i];
    minus[i] = 100 * rm[i] / trur[i];
    const t = plus[i] + minus[i];
    dx[i] = t === 0 ? 0 : 100 * Math.abs(plus[i] - minus[i]) / t;
  }
  return { plus, minus, adx: rma(dx, adxSmooth) };
}

export function obv(bars) {
  const n = bars.length, out = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const y = Math.sign(bars[i].c - bars[i - 1].c);
    out[i] = out[i - 1] + y * bars[i].v;
  }
  return out;
}

export const mom = (src, len) => src.map((v, i) => (i < len ? N : v - src[i - len]));

// ta.stoch(src, yuksek, dusuk, len)
export function stoch(src, yuk, dus, len) {
  const hh = highest(yuk, len), ll = lowest(dus, len);
  return src.map((v, i) => {
    if (Number.isNaN(hh[i]) || Number.isNaN(ll[i])) return N;
    const a = hh[i] - ll[i];
    return a === 0 ? 0 : 100 * (v - ll[i]) / a;
  });
}

// ta.pivothigh(src, sol, sag): pivot, onaylandigi barda (pivot + sag) doner
export function pivotHigh(src, sol, sag) {
  const n = src.length, out = new Array(n).fill(N);
  for (let p = sol; p < n - sag; p++) {
    const v = src[p];
    let pivot = true;
    for (let k = p - sol; k < p; k++) if (src[k] >= v) { pivot = false; break; }
    if (pivot) for (let k = p + 1; k <= p + sag; k++) if (src[k] > v) { pivot = false; break; }
    if (pivot) out[p + sag] = v;
  }
  return out;
}

// ---------- Supertrend (ta.supertrend) ----------
export function supertrend(bars, carpan, periyot) {
  const n = bars.length;
  const a = atr(bars, periyot);
  const yon = new Array(n).fill(N), cizgi = new Array(n).fill(N);
  let ustO = 0, altO = 0, stO = N;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(a[i])) continue;
    const orta = (bars[i].h + bars[i].l) / 2;
    let ust = orta + carpan * a[i], alt = orta - carpan * a[i];
    const ko = i > 0 ? bars[i - 1].c : N;
    alt = (alt > altO || ko < altO) ? alt : altO;
    ust = (ust < ustO || ko > ustO) ? ust : ustO;
    let d;
    if (i === 0 || Number.isNaN(a[i - 1])) d = 1;
    else if (stO === ustO) d = bars[i].c > ust ? -1 : 1;
    else d = bars[i].c < alt ? 1 : -1;
    const s = d === -1 ? alt : ust;
    yon[i] = d; cizgi[i] = s;
    ustO = ust; altO = alt; stO = s;
  }
  return { yon, cizgi };
}

// ---------- yardimcilar ----------
// gunluk barlari haftalik barlara cevirir (Pazartesi baslangicli, TradingView ile ayni)
export function haftalikYap(bars) {
  const out = [];
  let mevcut = null, oncekiHafta = null;
  for (const b of bars) {
    const g = new Date(b.t * 1000);
    // ISO hafta numarasi: yil + hafta
    const t = new Date(Date.UTC(g.getUTCFullYear(), g.getUTCMonth(), g.getUTCDate()));
    const gun = (t.getUTCDay() + 6) % 7;              // Pazartesi = 0
    t.setUTCDate(t.getUTCDate() - gun);               // haftanin Pazartesisi
    const anahtar = t.getTime();
    if (anahtar !== oncekiHafta) {
      if (mevcut) out.push(mevcut);
      mevcut = { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
      oncekiHafta = anahtar;
    } else {
      mevcut.h = Math.max(mevcut.h, b.h);
      mevcut.l = Math.min(mevcut.l, b.l);
      mevcut.c = b.c;
      mevcut.v += b.v;
    }
  }
  if (mevcut) out.push(mevcut);
  return out;
}

// Pine'in f_norm fonksiyonu: degeri [lo,hi] araliginda 0..1'e sikistirir
export const norm = (v, lo, hi) => (hi === lo || Number.isNaN(v) ? 0 : Math.max(0, Math.min(1, (v - lo) / (hi - lo))));
