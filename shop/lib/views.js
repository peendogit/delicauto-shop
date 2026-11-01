'use strict';
const cfg = require('./config');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugify = s => String(s || '').toLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

// "KUTIJA OSIGURACA" -> "Kutija osiguraca"
const nice = s => {
  const t = String(s || '').trim();
  if (!t) return '';
  return t === t.toUpperCase() && /[A-ZČĆŠŽĐ]/.test(t) ? t.charAt(0) + t.slice(1).toLowerCase() : t;
};

const partTitle = p => [nice(p.type), p.make, p.model].filter(Boolean).join(' ') || ('Dio ' + p.id);
const partUrl = p => `/dio/${p.id}-${slugify(partTitle(p)) || 'dio'}`;
const imgUrl = (file, w) => `/img/${w}/${String(file).split('/').map(encodeURIComponent).join('/')}`;
const money = v => (v === null || v === undefined) ? '' :
  (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')) + ' KM';
const parseImgs = p => { try { return JSON.parse(p.images || '[]'); } catch { return []; } };

function rowToPart(r) {
  return {
    id: r.id, internal: r.internal, type: r.type, group: r.grp, make: r.make, model: r.model, vehicle: r.vehicle,
    catalog: r.catalog, side: r.side, fuel: r.fuel, displacement: r.displacement, power: r.power,
    engineCode: r.engine_code, gearboxCode: r.gearbox_code, gearbox: r.gearbox, gears: r.gears, body: r.body,
    drive: r.drive, note: r.note, price: r.price, qty: r.qty, images: r.images,
  };
}

function layout({ title, desc, path = '/', body, ogImage, jsonld, noindex }) {
  const full = title.includes(cfg.name) ? title : `${title} | ${cfg.name}`;
  const canonical = cfg.siteUrl + path;
  const contact = [
    cfg.phone ? `<a href="tel:${esc(cfg.phoneTel)}">${esc(cfg.phone)}</a>` : '',
    cfg.email ? `<a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a>` : '',
  ].filter(Boolean).join(' · ');
  return `<!doctype html>
<html lang="bs"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc || '')}">
<link rel="canonical" href="${esc(canonical)}">
${noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}
<meta property="og:type" content="website"><meta property="og:locale" content="bs_BA">
<meta property="og:title" content="${esc(full)}"><meta property="og:description" content="${esc(desc || '')}">
<meta property="og:url" content="${esc(canonical)}">
${ogImage ? `<meta property="og:image" content="${esc(cfg.siteUrl + ogImage)}">` : ''}
<meta name="theme-color" content="#0f2a47">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/static/style.css?v=2">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head><body>
<div class="util"><div class="wrap util-in"><span>${esc(cfg.name)} · ${esc(cfg.city)}</span><span>${cfg.phone ? `<a href="tel:${esc(cfg.phoneTel)}">${esc(cfg.phone)}</a>` : ''}</span></div></div>
<header class="top"><div class="wrap top-in">
  <a class="brand" href="/"><svg class="logo" viewBox="0 0 48 48" width="46" height="46" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f7bff"/><stop offset="1" stop-color="#0b3fa8"/></linearGradient></defs><path d="M24 2.5l18 10.2v22.6L24 45.5 6 35.3V12.7z" fill="url(#lg)" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="24" cy="24" r="14" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/><path d="M17.5 14.5h7.2c6.1 0 9.8 3.8 9.8 9.5s-3.700 9.500-9.800 9.500h-7.200z M22.200 19v10h2.400c3.100 0 5-2 5-5s-1.900-5-5-5z" fill="#fff" fill-rule="evenodd"/><circle cx="38" cy="10" r="3" fill="#ff8a1f" stroke="#fff" stroke-width="1.2"/></svg><span class="brand-name">Auto Otpad <b>Delić</b><small>Katalog polovnih dijelova</small></span></a>
  <form class="top-search" action="/dijelovi" method="get" role="search">
    <input type="search" name="q" placeholder="Brza pretraga: dio, marka, model, kataloški broj…" aria-label="Pretraga" autocomplete="off">
    <button type="submit" aria-label="Traži">Traži</button>
  </form>
  <a class="cart-link" href="/korpa">Korpa <span id="cartN" class="badge" hidden>0</span></a>
</div>
<nav class="mainnav" aria-label="Glavni meni"><div class="wrap"><a href="/katalog">Katalog po vozilu</a><a href="/dijelovi">Pretraga dijelova</a><a href="/kontakt">Kontakt</a></div></nav>
</header>
<main class="wrap">${body}</main>
<footer class="foot"><div class="wrap foot-in">
  <div><b>${esc(cfg.name)}</b><br>${esc(cfg.city)}, Bosna i Hercegovina${contact ? '<br>' + contact : ''}</div>
  <div><a href="/katalog">Katalog po vozilu</a><br><a href="/dijelovi">Svi dijelovi</a><br><a href="/kontakt">Kontakt i upit</a></div>
  <div class="muted small">Polovni dijelovi s vozila iz našeg otpada. Dostupnost se provjerava u trenutku narudžbe.</div>
</div></footer>
<script src="/static/app.js?v=2" defer></script>
</body></html>`;
}

function card(p) {
  const imgs = parseImgs(p);
  const title = partTitle(p);
  const sub = [p.vehicle, p.catalog && 'Kat. br. ' + p.catalog].filter(Boolean).join(' · ');
  return `<article class="card"><a href="${partUrl(p)}">
  <div class="card-img">${imgs[0]
    ? `<img src="${imgUrl(imgs[0], 480)}" srcset="${imgUrl(imgs[0], 240)} 240w, ${imgUrl(imgs[0], 480)} 480w" sizes="(max-width:600px) 46vw, 260px" loading="lazy" alt="${esc(title)}" width="480" height="360">`
    : '<div class="noimg">Nema slike</div>'}</div>
  <div class="card-b"><h3>${esc(title)}</h3>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
  <div class="card-f">${p.price ? `<span class="price">${esc(money(p.price))}</span>` : '<span class="ask">Pošalji upit</span>'}
  ${p.internal ? `<span class="code">${esc(p.internal)}</span>` : ''}</div></div></a></article>`;
}

// ---- polja za pretragu (ista kao u aplikaciji za otpad) ----
function sel(name, label, options, cur, { disabled = false, ph = 'Sve', fmt = x => x } = {}) {
  return `<label class="f"><span>${esc(label)}</span><select name="${name}"${disabled ? ' disabled' : ''}><option value="">${esc(ph)}</option>${(options || []).map(o =>
    `<option value="${esc(o)}"${o === cur ? ' selected' : ''}>${esc(fmt(o))}</option>`).join('')}</select></label>`;
}
function inp(name, label, val, ph = '', attrs = '') {
  return `<label class="f"><span>${esc(label)}</span><input name="${name}" value="${esc(val)}" placeholder="${esc(ph)}" autocomplete="off" ${attrs}></label>`;
}
const FILTER_KEYS = ['q', 'katbr', 'tip', 'sifra', 'grupa', 'marka', 'model', 'vozilo', 'ccm', 'kw', 'kodmj', 'kodmot', 'mjenjac', 'brzina', 'karoserija', 'pogon', 'gorivo', 'strana', 'cijena'];

function searchForm(f, fx) {
  return `<form class="sf" method="get" action="/dijelovi">
  <fieldset class="fs"><legend><i>1</i> Pretraga po broju</legend><div class="sf-grid">
    ${inp('q', 'Brza pretraga', f.q, 'dio, model, broj…')}
    ${inp('katbr', 'Kataloški broj', f.katbr, 'npr. 5G1941005')}
    ${inp('sifra', 'Interna šifra', f.sifra)}
  </div></fieldset>
  <fieldset class="fs"><legend><i>2</i> Vozilo</legend><div class="sf-grid">
    ${sel('marka', 'Marka', fx.makes, f.marka)}
    ${sel('model', 'Model', fx.models, f.model, { disabled: !f.marka, ph: f.marka ? 'Sve' : 'Prvo odaberi marku' })}
    ${sel('vozilo', 'Vozilo', fx.vehicles, f.vozilo, { disabled: !f.model, ph: f.model ? 'Sve' : 'Prvo odaberi model' })}
    ${sel('karoserija', 'Tip karoserije', fx.bodies, f.karoserija)}
    ${sel('pogon', 'Pogon', fx.drives, f.pogon)}
  </div></fieldset>
  <fieldset class="fs"><legend><i>3</i> Dio</legend><div class="sf-grid">
    ${sel('grupa', 'Grupa', fx.groups, f.grupa)}
    ${sel('tip', 'Tip dijela', fx.types, f.tip, { fmt: nice })}
    ${sel('strana', 'Strana', fx.sides, f.strana)}
    <label class="f"><span>Cijena</span><select name="cijena"><option value="">Sve</option><option value="1"${f.cijena ? ' selected' : ''}>Samo sa cijenom</option></select></label>
  </div></fieldset>
  <fieldset class="fs"><legend><i>4</i> Motor i mjenjač</legend><div class="sf-grid">
    ${sel('gorivo', 'Gorivo', fx.fuels, f.gorivo)}
    ${sel('ccm', 'Kubikaža (ccm)', fx.displacements, f.ccm)}
    ${inp('kw', 'Snaga (kW)', f.kw, '', 'inputmode="numeric"')}
    ${inp('kodmot', 'Kod motora', f.kodmot)}
    ${sel('mjenjac', 'Mjenjač', fx.gearboxes, f.mjenjac)}
    ${sel('brzina', 'Broj brzina', fx.gears, f.brzina)}
    ${inp('kodmj', 'Kod mjenjača', f.kodmj)}
  </div></fieldset>
  <div class="sf-actions"><button class="btn" type="submit">Traži</button><a class="reset" href="/dijelovi">Poništi sve</a></div>
</form>`;
}

// ---- tabela rezultata (kao katalog) ----
function partRow(p, i, start = 0) {
  const imgs = parseImgs(p), url = partUrl(p);
  const veh = [p.make, p.model].filter(Boolean).join(' ');
  const veh2 = [p.vehicle, p.fuel, p.engineCode && 'motor ' + p.engineCode].filter(Boolean).join(' · ');
  const num = v => (v && /^\d+([.,]\d+)?$/.test(String(v)) ? esc(v) : esc(v || '—'));
  return `<tr>
  <td class="c-no">${start + i + 1}</td>
  <td class="c-img"><a href="${url}" tabindex="-1">${imgs[0] ? `<img src="${imgUrl(imgs[0], 240)}" loading="lazy" alt="" width="240" height="180">` : '<span class="noimg">—</span>'}</a></td>
  <td data-l="Šifra" class="mono">${esc(p.internal || '—')}</td>
  <td data-l="Dio" class="c-name"><a href="${url}">${esc(nice(p.type) || 'Dio')}</a>${p.group ? `<small>${esc(p.group)}</small>` : ''}</td>
  <td data-l="Vozilo" class="c-veh"><b>${esc(veh || '—')}</b>${veh2 ? `<small>${esc(veh2)}</small>` : ''}</td>
  <td data-l="Kat. broj" class="mono">${esc(p.catalog || '—')}</td>
  <td data-l="Strana">${esc(p.side || '—')}</td>
  <td data-l="ccm" class="r mono">${num(p.displacement)}</td>
  <td data-l="kW" class="r mono">${num(p.power)}</td>
  <td data-l="Cijena" class="r c-price">${p.price ? `<b>${esc(money(p.price))}</b>` : '<span class="ask">Na upit</span>'}</td>
  <td class="c-act">${p.price
    ? `<button type="button" class="btn sm buy" data-add="${p.id}" data-max="${p.qty || 1}">U korpu</button>`
    : `<a class="btn sm ghost" href="${url}#upit">Pošalji upit</a>`}</td>
</tr>`;
}
function partsTable(rows, start = 0) {
  return `<div class="tbl-wrap"><table class="parts"><thead><tr>
  <th class="c-no">Br.</th><th class="c-img"></th><th>Šifra</th><th>Dio</th><th>Vozilo</th><th>Kat. broj</th><th>Strana</th><th class="r">ccm</th><th class="r">kW</th><th class="r">Cijena</th><th></th>
</tr></thead><tbody>${rows.map((p, i) => partRow(p, i, start)).join('')}</tbody></table></div>`;
}

function home({ makes, latest, total, facets, f }) {
  const body = `
<section class="panel home-panel">
  <div class="panel-h"><h1>Katalog polovnih auto dijelova</h1>
    <span class="muted">${total ? `<b>${total.toLocaleString('de-DE')}</b> dijelova na stanju` : 'Dijelovi s vozila iz našeg otpada'}</span></div>
  ${searchForm(f, facets)}
</section>
${makes.length ? `<section><div class="sec-h"><h2>Katalog po vozilu</h2><a href="/katalog">Sve marke →</a></div><div class="chips">${makes.map(m =>
    `<a class="chip" href="/katalog?marka=${encodeURIComponent(m.make)}">${esc(m.make)} <i>${m.n}</i></a>`).join('')}</div></section>` : ''}
${(facets.groups || []).length ? `<section><div class="sec-h"><h2>Grupe dijelova</h2><a href="/dijelovi">Svi dijelovi →</a></div><div class="gidx">${facets.groups.map((g, i) => `<a href="/dijelovi?grupa=${encodeURIComponent(g)}"><i>${i + 1}</i>${esc(g)}</a>`).join('')}</div></section>` : ''}
<section><div class="sec-h"><h2>Nedavno dodano</h2><a href="/dijelovi">Svi dijelovi →</a></div>
  ${latest.length ? partsTable(latest) : '<p class="muted">Katalog se učitava, pokušaj ponovo za koji trenutak.</p>'}
</section>
<section class="cta"><h2>Ne nalaziš dio?</h2>
  <p>Pošalji nam upit s modelom i godištem vozila, javit ćemo se čim prije.</p>
  <a class="btn" href="/kontakt">Pošalji upit</a></section>`;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'AutoPartsStore', name: cfg.name, url: cfg.siteUrl,
    address: { '@type': 'PostalAddress', addressLocality: cfg.city, addressCountry: 'BA' },
    ...(cfg.phone ? { telephone: cfg.phoneTel } : {}),
  };
  return layout({
    title: `Polovni auto dijelovi ${cfg.city} — ${cfg.name}`, path: '/', body, jsonld,
    desc: `${cfg.name}, ${cfg.city}: katalog polovnih auto dijelova s pretragom po vozilu, kataloškom broju, kodu motora i mjenjača. Fotografije i cijene.`,
  });
}

// Stablo: grupa dijelova -> tip dijela (mk(extra) vraća query string za link)
function treeHtml(tree, f, mk) {
  if (!tree.length) return '<p class="muted small">Nema grupa.</p>';
  return `<div class="tree">${tree.map(g => {
    const open = f.grupa === g.grupa;
    return `<details class="tg"${open ? ' open' : ''}><summary><span>${esc(g.grupa)}</span><i>${g.n}</i></summary><ul>
      <li><a href="/dijelovi?${mk({ grupa: g.grupa, tip: '', page: 1 })}"${open && !f.tip ? ' class="on"' : ''}>Sve iz grupe</a></li>
      ${g.types.map(t => `<li><a href="/dijelovi?${mk({ grupa: g.grupa, tip: t.tip, page: 1 })}"${open && f.tip === t.tip ? ' class="on"' : ''}>${esc(nice(t.tip))} <i>${t.n}</i></a></li>`).join('')}
    </ul></details>`;
  }).join('')}</div>`;
}

function list({ rows, total, page, pages, f, facets, tree, baseQuery }) {
  const pageLink = n => '/dijelovi?' + baseQuery({ page: n });
  const pager = pages > 1 ? `<nav class="pager" aria-label="Stranice">
    ${page > 1 ? `<a href="${pageLink(page - 1)}" rel="prev">← Prethodna</a>` : '<span></span>'}
    <span>Stranica ${page} od ${pages}</span>
    ${page < pages ? `<a href="${pageLink(page + 1)}" rel="next">Sljedeća →</a>` : '<span></span>'}</nav>` : '';
  const vehicle = [f.marka, f.model, f.vozilo].filter(Boolean).join(' ');
  const what = f.tip ? nice(f.tip) : f.grupa || '';
  const heading = [what, vehicle].filter(Boolean).join(' — ') || (f.q ? `„${f.q}“` : 'Svi dijelovi');
  const active = FILTER_KEYS.filter(k => f[k]).length;
  const crumbs = [`<a href="/">Početna</a>`, `<a href="/katalog">Katalog</a>`];
  if (f.marka) crumbs.push(`<a href="/katalog?marka=${encodeURIComponent(f.marka)}">${esc(f.marka)}</a>`);
  if (f.marka && f.model) crumbs.push(`<a href="/katalog?marka=${encodeURIComponent(f.marka)}&model=${encodeURIComponent(f.model)}">${esc(f.model)}</a>`);
  if (f.vozilo) crumbs.push(`<a href="/dijelovi?${baseQuery({ grupa: '', tip: '', page: 1 })}">${esc(f.vozilo)}</a>`);
  if (f.grupa) crumbs.push(`<a href="/dijelovi?${baseQuery({ tip: '', page: 1 })}">${esc(f.grupa)}</a>`);
  if (f.tip) crumbs.push(`<span>${esc(nice(f.tip))}</span>`);
  const link = (extra, text, on) => `<a href="/dijelovi?${baseQuery({ ...extra, page: 1 })}" class="${on ? 'on' : ''}">${text}</a>`;
  const body = `
<nav class="crumbs">${crumbs.join(' › ')}</nav>
<details class="panel mfold"${active ? '' : ' open'}><summary>Pretraga — sva polja${active ? ` <em>${active} aktivno</em>` : ''}</summary>${searchForm(f, facets)}</details>
<div class="cat-layout">
<aside class="side">
  <div class="side-box vbox">${f.marka
    ? `<h3>Odabrano vozilo</h3><p><b>${esc(vehicle)}</b></p><a href="/katalog?marka=${encodeURIComponent(f.marka)}${f.model ? '&model=' + encodeURIComponent(f.model) : ''}">Promijeni vozilo</a>`
    : `<h3>Vozilo</h3><p class="muted small">Odaberi vozilo da vidiš samo dijelove koji mu odgovaraju.</p><a class="btn sm" href="/katalog">Odaberi vozilo</a>`}</div>
  <details class="mfold" open><summary>Grupe dijelova</summary><div class="side-box"><h3 class="dsk">Grupe dijelova</h3>${treeHtml(tree, f, baseQuery)}</div></details>
</aside>
<div class="results">
  <h1 class="pg-h">${esc(heading)}</h1>
  <div class="toolbar"><span class="count">${total.toLocaleString('de-DE')} ${total === 1 ? 'dio' : 'dijelova'}</span>
    <span class="tb-r"><span class="vt"><em>Sortiraj</em>${link({ sort: '' }, 'Najnovije', !f.sort)}${link({ sort: 'cijena_asc' }, 'Cijena ↑', f.sort === 'cijena_asc')}${link({ sort: 'cijena_desc' }, 'Cijena ↓', f.sort === 'cijena_desc')}</span>
    <span class="vt">${link({ prikaz: 'lista' }, 'Tabela', f.prikaz === 'lista')}${link({ prikaz: 'mreza' }, 'Mreža', f.prikaz === 'mreza')}</span></span></div>
  ${rows.length ? (f.prikaz === 'mreza' ? `<div class="grid g3">${rows.map(card).join('')}</div>` : partsTable(rows, (page - 1) * cfg.pageSize)) + pager :
    `<div class="empty"><p>Nema rezultata za ovaj izbor.</p><p><a class="btn" href="/kontakt">Pošalji upit za dio</a></p></div>`}
</div>
</div>`;
  const deep = Object.entries(f).some(([k, v]) => v && !['marka', 'model', 'grupa', 'tip', 'prikaz'].includes(k)) || f.prikaz === 'mreza';
  return layout({
    title: `${heading}${page > 1 ? ' — stranica ' + page : ''} — polovni dijelovi`, path: '/dijelovi', body,
    desc: `${heading}: polovni auto dijelovi na stanju, ${cfg.name} ${cfg.city}.`,
    noindex: deep || page > 1,
  });
}

// TecDoc-style navigacija: marka -> model -> vozilo i grupe dijelova
function catalog({ marka, model, makes, models, variants, tree, total }) {
  const e = encodeURIComponent;
  const mk = extra => new URLSearchParams(Object.entries({ marka, model, ...extra }).filter(([, v]) => v)).toString();
  const crumbs = [`<a href="/">Početna</a>`, marka ? `<a href="/katalog">Katalog</a>` : '<span>Katalog</span>'];
  if (marka) crumbs.push(model ? `<a href="/katalog?marka=${e(marka)}">${esc(marka)}</a>` : `<span>${esc(marka)}</span>`);
  if (model) crumbs.push(`<span>${esc(model)}</span>`);
  let inner, title, desc;
  if (!marka) {
    title = 'Katalog dijelova po vozilu'; desc = `Odaberi marku vozila i pronađi polovne dijelove — ${cfg.name}, ${cfg.city}.`;
    const byLetter = new Map();
    for (const m of makes) { const L = m.make.charAt(0).toUpperCase(); if (!byLetter.has(L)) byLetter.set(L, []); byLetter.get(L).push(m); }
    inner = `<h1 class="pg-h">Odaberi marku vozila</h1>
      <p class="letters">${[...byLetter.keys()].map(L => `<a href="#slovo-${e(L)}">${esc(L)}</a>`).join('')}</p>
      ${[...byLetter].map(([L, ms]) => `<section id="slovo-${e(L)}"><h2 class="letter">${esc(L)}</h2>
        <div class="tiles">${ms.map(m => `<a class="tile" href="/katalog?marka=${e(m.make)}"><b>${esc(m.make)}</b><i>${m.n} dijelova</i></a>`).join('')}</div></section>`).join('')}`;
  } else if (!model) {
    title = `${marka} — modeli`; desc = `${marka} polovni dijelovi po modelu — ${cfg.name}, ${cfg.city}.`;
    inner = `<h1 class="pg-h">${esc(marka)} — odaberi model</h1>
      ${models.length ? `<div class="tiles">${models.map(m => `<a class="tile" href="/katalog?marka=${e(marka)}&model=${e(m.model)}"><b>${esc(m.model)}</b><i>${m.n} dijelova</i></a>`).join('')}</div>` : '<p class="muted">Nema modela.</p>'}
      <p><a class="btn ghost" href="/dijelovi?marka=${e(marka)}">Svi dijelovi ${esc(marka)}</a></p>`;
  } else {
    title = `${marka} ${model} — polovni dijelovi`; desc = `${marka} ${model}: polovni dijelovi po vozilu i grupi — ${cfg.name}, ${cfg.city}.`;
    const spec = (v, u) => (v ? esc(v) + (u && /^\d+([.,]\d+)?$/.test(String(v)) ? u : '') : '—');
    inner = `<h1 class="pg-h">${esc(marka)} ${esc(model)}</h1>
      <p class="muted">${total.toLocaleString('de-DE')} dijelova na stanju · <a href="/dijelovi?${mk({})}">Prikaži sve</a></p>
      <div class="two cat2">
        <div><h2>Vozilo / motor</h2>
          <table class="vt-table"><thead><tr><th>Vozilo</th><th>Gorivo</th><th>ccm</th><th>kW</th><th>Motor</th><th></th></tr></thead><tbody>
          ${variants.map(v => `<tr><td><a href="/dijelovi?${mk({ vozilo: v.vehicle })}">${esc(v.vehicle || '(bez oznake)')}</a></td><td>${spec(v.fuel)}</td><td>${spec(v.displacement)}</td><td>${spec(v.power)}</td><td class="mono">${spec(v.engineCode)}</td><td class="num">${v.n}</td></tr>`).join('')}
          </tbody></table></div>
        <div><h2>Grupe dijelova</h2>${treeHtml(tree, {}, mk)}</div>
      </div>`;
  }
  return layout({ title, desc, path: '/katalog' + (marka ? `?marka=${e(marka)}${model ? '&model=' + e(model) : ''}` : ''),
    body: `<nav class="crumbs">${crumbs.join(' › ')}</nav>${inner}` });
}

const SPEC_GROUPS = [
  ['Identifikacija', [['internal', 'Interna šifra'], ['catalog', 'Kataloški broj'], ['type', 'Tip dijela'], ['group', 'Grupa'], ['side', 'Strana']]],
  ['Vozilo', [['make', 'Marka'], ['model', 'Model'], ['vehicle', 'Vozilo'], ['body', 'Tip karoserije'], ['drive', 'Pogon']]],
  ['Motor i prenos', [['fuel', 'Gorivo'], ['displacement', 'Kubikaža'], ['power', 'Snaga'], ['engineCode', 'Kod motora'], ['gearbox', 'Mjenjač'], ['gearboxCode', 'Kod mjenjača'], ['gears', 'Broj brzina']]],
];
const UNITS = { displacement: ' ccm', power: ' kW' };

function detail(p) {
  const imgs = parseImgs(p);
  const title = partTitle(p);
  const specs = SPEC_GROUPS.map(([title, fields]) => {
    const rows = fields.filter(([k]) => p[k] !== null && p[k] !== undefined && String(p[k]).trim() !== '')
      .map(([k, l]) => `<tr><th>${l}</th><td${['internal', 'catalog', 'engineCode', 'gearboxCode'].includes(k) ? ' class="mono"' : ''}>${esc(k === 'type' ? nice(p[k]) : p[k])}${UNITS[k] && /^\d+([.,]\d+)?$/.test(String(p[k])) ? UNITS[k] : ''}</td></tr>`).join('');
    return rows ? `<table class="specs"><caption>${title}</caption><tbody>${rows}</tbody></table>` : '';
  }).join('');
  const phone = cfg.phoneTel;
  const inquiry = `
<form class="box inq" id="upit" data-ajax action="/api/upit" method="post">
  <h2>${p.price ? 'Imaš pitanje o dijelu?' : 'Pošalji upit za cijenu'}</h2>
  <input type="hidden" name="partId" value="${p.id}">
  <input class="hp" type="text" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
  <label class="f"><span>Ime</span><input name="name" required maxlength="80" autocomplete="name"></label>
  <label class="f"><span>Telefon</span><input name="phone" type="tel" required maxlength="40" autocomplete="tel"></label>
  <label class="f"><span>Poruka (nije obavezno)</span><textarea name="message" rows="3" maxlength="1000" placeholder="npr. godište vozila, broj šasije…"></textarea></label>
  <button type="submit" class="btn">${p.price ? 'Pošalji upit' : 'Pošalji upit za cijenu'}</button>
  <p class="form-msg" role="status"></p>
</form>`;
  const body = `
<nav class="crumbs"><a href="/">Početna</a> › <a href="/katalog">Katalog</a>${p.make ? ` › <a href="/katalog?marka=${encodeURIComponent(p.make)}">${esc(p.make)}</a>` : ''}${p.make && p.model ? ` › <a href="/katalog?marka=${encodeURIComponent(p.make)}&model=${encodeURIComponent(p.model)}">${esc(p.model)}</a>` : ''}</nav>
<div class="spec-strip">${[['Šifra', p.internal], ['Kat. broj', p.catalog], ['Vozilo', [p.make, p.model].filter(Boolean).join(' ')], ['Strana', p.side], ['Motor', p.engineCode]].filter(x => x[1]).map(([l, v]) => `<div><small>${l}</small><b>${esc(v)}</b></div>`).join('')}</div>
<div class="detail">
  <section class="gal">
    <div class="gal-main">${imgs[0]
      ? `<img id="mainimg" src="${imgUrl(imgs[0], 960)}" alt="${esc(title)}" width="960" height="720">` : '<div class="noimg big">Nema slike</div>'}</div>
    ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((f, i) =>
      `<button type="button" data-thumb="${imgUrl(f, 960)}" aria-label="Slika ${i + 1}"><img src="${imgUrl(f, 240)}" alt="" loading="lazy" width="240" height="180"></button>`).join('')}</div>` : ''}
  </section>
  <section class="info">
    <h1>${esc(title)}</h1>
    ${p.vehicle ? `<p class="sub">${esc(p.vehicle)}</p>` : ''}
    <div class="box buy">
      ${p.price ? `<div class="price big">${esc(money(p.price))}</div>
        ${p.qty > 1 ? `<label class="f qty"><span>Količina (na stanju: ${p.qty})</span><input id="qty" type="number" min="1" max="${p.qty}" value="1"></label>` : ''}
        <button class="btn" type="button" data-add="${p.id}" data-max="${p.qty}">Dodaj u korpu</button>`
        : `<div class="ask big">Cijena na upit</div><p class="muted">Pošalji upit ispod ili nas kontaktiraj direktno.</p>`}
      ${phone ? `<a class="btn ghost" href="tel:${esc(phone)}">Pozovi ${esc(cfg.phone)}</a>` : ''}
      ${cfg.viber ? `<a class="btn ghost" href="viber://chat?number=${esc(encodeURIComponent(cfg.viber))}">Viber</a>` : ''}
    </div>
    ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}
    ${inquiry}
  </section>
</div>
${specs ? `<section class="sheet"><h2>Specifikacija dijela</h2><div class="sheet-grid">${specs}</div></section>` : ''}`;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Product', name: title,
    ...(imgs.length ? { image: imgs.slice(0, 5).map(f => cfg.siteUrl + imgUrl(f, 960)) } : {}),
    ...(p.internal ? { sku: p.internal } : {}), ...(p.catalog ? { mpn: p.catalog } : {}),
    ...(p.make ? { brand: { '@type': 'Brand', name: p.make } } : {}),
    itemCondition: 'https://schema.org/UsedCondition',
    ...(p.price ? { offers: { '@type': 'Offer', priceCurrency: 'BAM', price: String(p.price), availability: 'https://schema.org/InStock',
      url: cfg.siteUrl + partUrl(p), seller: { '@type': 'Organization', name: cfg.name } } } : {}),
  };
  return layout({
    title: `${title}${p.catalog ? ' ' + p.catalog : ''}`, path: partUrl(p), body, jsonld,
    ogImage: imgs[0] ? imgUrl(imgs[0], 960) : null,
    desc: `${title}${p.vehicle ? ' (' + p.vehicle + ')' : ''}${p.price ? ' — ' + money(p.price) : ' — cijena na upit'}. Polovni dio, ${cfg.name} ${cfg.city}.`,
  });
}

function unavailable(id) {
  return layout({
    title: 'Dio više nije dostupan', path: '/dio/' + id, noindex: true,
    body: `<div class="empty"><h1>Ovaj dio više nije dostupan</h1><p>Vjerovatno je prodan. Pogledaj slične dijelove ili nam pošalji upit.</p>
    <p><a class="btn" href="/dijelovi">Pogledaj dijelove</a> <a class="btn ghost" href="/kontakt">Pošalji upit</a></p></div>`,
  });
}

function cart() {
  return layout({
    title: 'Korpa', path: '/korpa', noindex: true,
    body: `<h1 class="pg-h">Korpa</h1><div id="cart-root"><p class="muted">Učitavanje…</p></div>`,
  });
}

function contact() {
  const phone = cfg.phoneTel;
  return layout({
    title: 'Kontakt i upit', path: '/kontakt',
    desc: `Kontakt ${cfg.name}, ${cfg.city}. Pošalji upit za auto dio.`,
    body: `<h1 class="pg-h">Kontakt i upit</h1>
<div class="two">
  <form class="box inq" data-ajax action="/api/upit" method="post">
    <h2>Pošalji upit</h2>
    <input class="hp" type="text" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <label class="f"><span>Ime</span><input name="name" required maxlength="80" autocomplete="name"></label>
    <label class="f"><span>Telefon</span><input name="phone" type="tel" required maxlength="40" autocomplete="tel"></label>
    <label class="f"><span>Koji dio tražiš? (marka, model, godište)</span><textarea name="message" rows="5" required maxlength="1000"></textarea></label>
    <button type="submit" class="btn">Pošalji upit</button>
    <p class="form-msg" role="status"></p>
  </form>
  <div class="box"><h2>${esc(cfg.name)}</h2>
    <p>${esc(cfg.city)}, Bosna i Hercegovina</p>
    ${phone ? `<p><a class="btn ghost" href="tel:${esc(phone)}">${esc(cfg.phone)}</a></p>` : ''}
    ${cfg.viber ? `<p><a class="btn ghost" href="viber://chat?number=${esc(encodeURIComponent(cfg.viber))}">Viber</a></p>` : ''}
    ${cfg.email ? `<p><a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a></p>` : ''}
  </div>
</div>`,
  });
}

function notFound() {
  return layout({ title: 'Stranica nije pronađena', noindex: true, body: `<div class="empty"><h1>Stranica nije pronađena</h1><p><a class="btn" href="/">Na početnu</a></p></div>` });
}

module.exports = { esc, slugify, nice, partTitle, partUrl, imgUrl, money, rowToPart, parseImgs, layout, home, list, catalog, detail, unavailable, cart, contact, notFound };
