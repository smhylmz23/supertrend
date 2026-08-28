#!/usr/bin/env node
/*
 * yeniden-ciz.mjs — index.html'i YENIDEN TARAMA YAPMADAN uretir.
 *
 * Son taramanin girdisi `sonuclar/veri.json` icinde saklaniyor.
 * Sadece sayfanin gorunumunu (rapor.mjs) degistirdiginde bunu calistir:
 *
 *    node yeniden-ciz.mjs
 *
 * Veriyi tazelemek gerekiyorsa normal taramayi calistir:
 *    node konfluans-tarayici.mjs --sinyal tumu --csv --rapor
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { htmlRapor } from './rapor.mjs';

const KLASOR = path.dirname(fileURLToPath(import.meta.url));
const KAYNAK = path.join(KLASOR, 'sonuclar', 'veri.json');

if (!fs.existsSync(KAYNAK)) {
  console.error('sonuclar/veri.json yok. Once tam taramayi calistir:');
  console.error('  node konfluans-tarayici.mjs --sinyal tumu --csv --rapor');
  process.exit(1);
}

const { satirlar, stSinyal, gun, gunIci } = JSON.parse(fs.readFileSync(KAYNAK, 'utf8'));
const html = htmlRapor(satirlar, stSinyal, gun, gunIci);
fs.writeFileSync(path.join(KLASOR, 'index.html'), html, 'utf8');
console.log('index.html yeniden cizildi — ' + satirlar.length + ' hisse, ' + gun +
  (gunIci ? ' (gun ici)' : ' kapanisi') + ', ' + Math.round(html.length / 1024) + ' KB');
