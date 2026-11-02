'use strict';
// Pametna pretraga: slovne greške (fuzzy), množina/padeži (skraćivanje) i sinonimi.
const fold = x => String(x || '').toLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[̀-ͯ]/g, '');

// grupe riječi koje znače isto (sve bez dijakritika)
const GROUPS = [
  ['far', 'farovi', 'reflektor', 'reflektori', 'glavno svjetlo'],
  ['branik', 'odbojnik', 'stoper', 'soder', 'bamper'],
  ['retrovizor', 'ogledalo', 'ogledala', 'spigl', 'spiglovi'],
  ['hauba', 'kapa', 'poklopac motora'],
  ['mjenjac', 'menjac', 'mjenjaci'],
  ['svjetlo', 'svetlo', 'svijetlo', 'svjetla', 'svetla'],
  ['anlaser', 'alnaser', 'anlazer', 'starter', 'alnaser'],
  ['dizna', 'brizgaljka', 'injektor', 'brizgalica'],
  ['turbina', 'turbo', 'turbokompresor', 'turbo punjac'],
  ['alternator', 'dinamo'],
  ['hladnjak', 'ladnjak', 'hladnjaci', 'radijator', 'hladnjak vode'],
  ['klima', 'klime', 'ac', 'klimatizacija'],
  ['akumulator', 'baterija'],
  ['amortizer', 'amortizeri', 'amortiser', 'amortizeri'],
  ['poluosovina', 'poluosovine', 'poluosovinu', 'poluosovina', 'poluosovna', 'homokineticki'],
  ['stakla', 'staklo', 'steka', 'steklo'],
  ['brisac', 'brisaci', 'brisaca', 'metlice'],
  ['rucica', 'rucke', 'kvaka', 'kvake'],
  ['bravica', 'brava', 'brave', 'kljuc'],
  ['sjedalo', 'sjediste', 'sediste', 'sedala', 'sjedista'],
  ['volan', 'volani', 'volana'],
  ['zracni jastuk', 'airbag', 'erbag', 'jastuk'],
  ['kocnica', 'kocnice', 'kocioni', 'kocne', 'disk'],
  ['felna', 'felne', 'aluminijska felna'],
  ['gume', 'guma', 'pneumatik'],
  ['auspuh', 'ispuh', 'izduvni', 'izduvna'],
  ['katalizator', 'kat', 'katalizatori'],
  ['kompresor', 'kompresora', 'kompresori'],
  ['kardan', 'kardansko', 'kardanska'],
  ['krilo', 'blatobran', 'blatobrani'],
  ['maglenka', 'maglenke', 'far za maglu', 'svjetlo za maglu'],
  ['zmigavac', 'migavac', 'zmigavci', 'migavci', 'blinker'],
  ['kontrolna tabla', 'kilometar sat', 'sat', 'instrument tabla', 'kilometar'],
].map(g => g.map(fold));
const SYN = new Map();
for (const g of GROUPS) for (const w of g) { if (w.includes(' ')) continue; SYN.set(w, [...new Set([...(SYN.get(w) || []), ...g.filter(x => x !== w)])]); }

// kandidati za osnovu riječi: "farovi" -> farovi, farov, faro, far
const stems = w => { const out = [w]; for (let k = 1; k <= 3; k++) if (w.length - k >= 3) out.push(w.slice(0, w.length - k)); return out; };

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = [];
  for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

// vocab: Map(riječ bez dijakritika -> broj pojavljivanja)
function makeVocab(strings) {
  const m = new Map();
  for (const s of strings) for (const w of fold(s).split(/[^a-z0-9]+/).filter(Boolean)) m.set(w, (m.get(w) || 0) + 1);
  const prefixOk = new Map();
  return { words: m, has: w => m.has(w), anyPrefix: w => { if (prefixOk.has(w)) return prefixOk.get(w); let ok = false; for (const k of m.keys()) if (k.startsWith(w)) { ok = true; break; } prefixOk.set(w, ok); return ok; } };
}

// varijante jedne riječi koje postoje u vokabularu: sama riječ (ili ispravka/osnova) + sinonimi
function resolve(word, vocab, fuzzy = true) {
  const w = fold(word).replace(/[^a-z0-9]/g, '');
  if (!w) return { vars: [], fixed: null };
  const out = new Set();
  let fixed = null, base = null;
  if (vocab.anyPrefix(w)) base = w;
  else {
    const c = fuzzy ? correct(w, vocab) : null;
    if (c) { base = c; fixed = c; }
    else for (const s of stems(w).slice(1)) if (vocab.anyPrefix(s)) { base = s; break; }
  }
  if (base) out.add(base);
  for (const s of [w, base, ...stems(w)]) for (const syn of (s && SYN.get(s)) || []) { const b2 = syn.replace(/[^a-z0-9]/g, ''); if (b2 && vocab.anyPrefix(b2)) out.add(b2); }
  return { vars: [...out], fixed };
}

// ispravka slovne greške: najbliža riječ iz vokabulara (isto početno slovo)
function correct(word, vocab) {
  const w = fold(word).replace(/[^a-z0-9]/g, '');
  if (w.length < 4 || /\d/.test(w)) return null;
  const max = w.length <= 5 ? 1 : 2;
  let best = null;
  for (const [k, n] of vocab.words) {
    if (k[0] !== w[0] || k.length < 3) continue;
    const dist = lev(w, k, max);
    if (dist > max) continue;
    if (!best || dist < best.dist || (dist === best.dist && n > best.n)) best = { w: k, dist, n };
  }
  return best ? best.w : null;
}

module.exports = { fold, resolve, correct, makeVocab, stems };
