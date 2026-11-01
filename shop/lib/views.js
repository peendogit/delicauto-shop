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
const partUrl = p => `/dio/${slugify([p.catalog, partTitle(p)].filter(Boolean).join(' ')) || 'dio'}-${p.id}`;
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
<link rel="icon" href="/static/favicon.png" type="image/png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/static/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Delić">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/static/style.css?v=18">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head><body>
<div class="util"><div class="wrap util-in"><span>${esc(cfg.name)} · ${esc(cfg.city)}</span><span>${cfg.phone ? `<a href="tel:${esc(cfg.phoneTel)}">${esc(cfg.phone)}</a>` : ''} <a class="admin-btn" href="/admin" rel="nofollow">Admin</a></span></div></div>
<header class="top"><div class="wrap top-in">
  <a class="brand" href="/" aria-label="Auto Otpad Delić — početna"><img class="brand-logo" src="/static/logo.png" alt="Delić" width="237" height="88"><span class="brand-name"><b>Auto otpad</b><small>Katalog polovnih dijelova</small></span></a>
  <form class="top-search" action="/dijelovi" method="get" role="search">
    <input type="search" name="q" placeholder="Brza pretraga: dio, marka, model, kataloški broj…" aria-label="Pretraga" autocomplete="off">
    <button type="submit" aria-label="Traži">Traži</button>
  </form>
</div>
<nav class="mainnav" aria-label="Glavni meni"><div class="wrap"><a href="/katalog">Katalog po vozilu</a><a href="/felne">Felne</a><a href="/otkup" class="nav-hl">Otkup vozila</a><a href="/kontakt">Kontakt</a></div></nav>
</header>
<main class="wrap">${body}</main>
<footer class="foot"><div class="wrap foot-in">
  <div><img class="foot-logo" src="/static/logo.png" alt="Delić" width="158" height="59" loading="lazy"><br><b>${esc(cfg.name)}</b><br>${cfg.address ? esc(cfg.address) + '<br>' : ''}${esc(cfg.city)}, Bosna i Hercegovina${contact ? '<br>' + contact : ''}</div>
  <div><a href="/katalog">Katalog po vozilu</a><br><a href="/dijelovi">Svi dijelovi</a><br><a href="/felne">Felne</a><br><a href="/otkup">Otkup vozila</a><br><a href="/kontakt">Kontakt i upit</a></div>
  <div class="muted small">Polovni dijelovi s vozila iz našeg otpada. Dostupnost se provjerava u trenutku narudžbe.</div>
</div></footer>
<script src="/static/app.js?v=15" defer></script>
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
  ${p.internal ? `<span class="code">${esc(p.internal)}</span>` : ''}</div>${warranty('sm')}</div></a></article>`;
}

// mala ikona + tekst garancije
const warranty = (cls = '') => `<span class="warr ${cls}"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.600-8-6-8-11V5z" fill="#1b7f3a"/><path d="M8 12l3 3 5-6" fill="none" stroke="#fff" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"/></svg>Garancija 7 dana</span>`;

// dugmad za kontakt uz dio: Pozovi, Viber, WhatsApp
function contactBtnsMsg(msg, cls = 'sm') {
  const wa = `https://wa.me/${cfg.waNumber}?text=${encodeURIComponent(msg)}`;
  return `<span class="cbtns"><a class="btn ${cls} call" href="tel:${esc(cfg.phoneTel)}">Pozovi</a>`
    + `<a class="btn ${cls} vb" href="viber://chat?number=${esc(encodeURIComponent(cfg.viber))}" data-copy="${esc(msg)}" rel="nofollow">Viber</a>`
    + `<a class="btn ${cls} wa" href="${esc(wa)}" target="_blank" rel="noopener nofollow">WhatsApp</a></span>`;
}
function contactBtns(p, cls = 'sm') {
  const code = p.internal ? `, šifra ${p.internal}` : '';
  return contactBtnsMsg(`Zdravo, vidio sam ovaj dio na vašem sajtu: ${partTitle(p)}${code}. Interesuje me cijena.\n${cfg.siteUrl}${partUrl(p)}`, cls);
}

// obavijest: vozilo je na placu (cijelo, nije rastavljeno) -> možda imamo dio koji još nije u bazi
function yardNotice(list) {
  if (!list || !list.length) return '';
  const lines = list.slice(0, 5).map(v => `${esc(v.make)} ${esc(v.model)}${v.year ? ', ' + v.year : ''}${[v.fuel, v.engine_code && 'motor ' + v.engine_code].filter(Boolean).length ? ' (' + esc([v.fuel, v.engine_code && 'motor ' + v.engine_code].filter(Boolean).join(', ')) + ')' : ''}`);
  const first = list[0];
  const msg = `Zdravo, vidio sam da imate na placu vozilo ${first.make} ${first.model}${first.year ? ' ' + first.year : ''}. Tražim dio koji nisam našao na sajtu.`;
  return `<aside class="yard"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M5 11l1.600-4.200A2 2 0 018.500 5.500h7a2 2 0 011.900 1.300L19 11h1a1 1 0 011 1v4h-2a2 2 0 01-4 0h-6a2 2 0 01-4 0H3v-4a1 1 0 011-1zm2.200 0h9.600l-1.200-3h-7.200z" fill="currentColor"/></svg>
  <div><b>Imamo ovo vozilo na placu</b>
  <ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>
  <p>Pozovite nas — možda imamo dio koji još nije u bazi.</p>${contactBtnsMsg(msg)}</div></aside>`;
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
  ${f.q ? `<input type="hidden" name="q" value="${esc(f.q)}">` : ''}
  <fieldset class="fs"><legend><i>1</i> Pretraga po broju</legend><div class="sf-grid">
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
  <td data-l="Dio" class="c-name"><a href="${url}">${esc(nice(p.type) || 'Dio')}</a>${p.group ? `<small>${esc(p.group)}</small>` : ''}${warranty('sm')}</td>
  <td data-l="Vozilo" class="c-veh"><b>${esc(veh || '—')}</b>${veh2 ? `<small>${esc(veh2)}</small>` : ''}</td>
  <td data-l="Kat. broj" class="mono${p.catalog ? '' : ' e'}">${esc(p.catalog || '—')}</td>
  <td data-l="Strana" class="${p.side ? '' : 'e'}">${esc(p.side || '—')}</td>
  <td data-l="ccm" class="r mono${p.displacement ? '' : ' e'}">${num(p.displacement)}</td>
  <td data-l="kW" class="r mono${p.power ? '' : ' e'}">${num(p.power)}</td>
  <td data-l="Cijena" class="r c-price">${p.price ? `<b>${esc(money(p.price))}</b>` : '<span class="ask">Na upit</span>'}</td>
</tr>`;
}
function partsTable(rows, start = 0) {
  return `<div class="tbl-wrap"><table class="parts"><thead><tr>
  <th class="c-no">Br.</th><th class="c-img"></th><th>Šifra</th><th>Dio</th><th>Vozilo</th><th>Kat. broj</th><th>Strana</th><th class="r">ccm</th><th class="r">kW</th><th class="r">Cijena</th>
</tr></thead><tbody>${rows.map((p, i) => partRow(p, i, start)).join('')}</tbody></table></div>`;
}

function home({ makes, latest, total, facets, f }) {
  const body = `
<section class="panel home-panel">
  <div class="panel-h"><h1>Katalog polovnih auto dijelova</h1>
    <span class="muted">${total ? `<b>${total.toLocaleString('de-DE')}</b> dijelova na stanju` : 'Dijelovi s vozila iz našeg otpada'}</span></div>
  ${searchForm(f, facets)}
</section>
<div id="live" aria-live="polite"></div>
<section><div class="sec-h"><h2>Nedavno dodano</h2><a href="/dijelovi">Svi dijelovi →</a></div>
  ${latest.length ? partsTable(latest) : '<p class="muted">Katalog se učitava, pokušaj ponovo za koji trenutak.</p>'}
</section>
<section class="cta buy-cta"><h2>Otkupljujemo havarisana vozila</h2>
  <p>Prodaješ vozilo u kvaru ili nakon udesa? Pošalji slike i lokaciju, javimo se brzo s ponudom.</p>
  <a class="btn" href="/otkup">Pošalji vozilo za otkup</a></section>
<section class="cta"><h2>Ne nalaziš dio?</h2>
  <p>Pošalji nam upit s modelom i godištem vozila, javit ćemo se čim prije.</p>
  <a class="btn" href="/kontakt">Pošalji upit</a></section>`;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'AutoPartsStore', name: cfg.name, url: cfg.siteUrl,
    address: { '@type': 'PostalAddress', ...(cfg.address ? { streetAddress: cfg.address } : {}), addressLocality: cfg.city, addressCountry: 'BA' },
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

function resultsHtml({ rows, total, page, pages, f, heading, link, pager, yard }) {
  return `<div class="results" id="rez">
  <h1 class="pg-h">${esc(heading)}</h1>
  <div class="toolbar"><span class="count">${total.toLocaleString('de-DE')} ${total === 1 ? 'dio' : 'dijelova'}</span>
    <span class="tb-r"><span class="vt"><em>Sortiraj</em>${link({ sort: '' }, 'Najnovije', !f.sort)}${link({ sort: 'cijena_asc' }, 'Cijena ↑', f.sort === 'cijena_asc')}${link({ sort: 'cijena_desc' }, 'Cijena ↓', f.sort === 'cijena_desc')}</span>
    <span class="vt">${link({ prikaz: 'lista' }, 'Tabela', f.prikaz === 'lista')}${link({ prikaz: 'mreza' }, 'Mreža', f.prikaz === 'mreza')}</span></span></div>
  ${rows.length ? (f.prikaz === 'mreza' ? `<div class="grid g3">${rows.map(card).join('')}</div>` : partsTable(rows, (page - 1) * cfg.pageSize)) + pager :
    `<div class="empty"><p>Nema rezultata za ovaj izbor.</p><p><a class="btn" href="/kontakt">Pošalji upit za dio</a></p></div>`}
  ${yardNotice(yard)}
</div>`;
}

// samo blok rezultata (za pretragu "uživo")
function listFrag({ rows, total, page, pages, f, baseQuery, yard }) {
  const pageLink = n => '/dijelovi?' + baseQuery({ page: n });
  const pager = pages > 1 ? `<nav class="pager" aria-label="Stranice">
    ${page > 1 ? `<a href="${pageLink(page - 1)}" rel="prev">← Prethodna</a>` : '<span></span>'}
    <span>Stranica ${page} od ${pages}</span>
    ${page < pages ? `<a href="${pageLink(page + 1)}" rel="next">Sljedeća →</a>` : '<span></span>'}</nav>` : '';
  const vehicle = [f.marka, f.model, f.vozilo].filter(Boolean).join(' ');
  const what = f.tip ? nice(f.tip) : f.grupa || '';
  const heading = [what, vehicle].filter(Boolean).join(' — ') || (f.q ? `„${f.q}“` : 'Svi dijelovi');
  const link = (extra, text, on) => `<a href="/dijelovi?${baseQuery({ ...extra, page: 1 })}" class="${on ? 'on' : ''}">${text}</a>`;
  return resultsHtml({ rows, total, page, pages, f, heading, link, pager, yard });
}

function list({ rows, total, page, pages, f, facets, tree, baseQuery, yard }) {
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
  const resultsBlock = resultsHtml({ rows, total, page, pages, f, heading, link, pager, yard });
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
${resultsBlock}
</div>`;
  const deep = Object.entries(f).some(([k, v]) => v && !['marka', 'model', 'grupa', 'tip', 'prikaz'].includes(k)) || f.prikaz === 'mreza';
  return layout({
    title: `${heading}${page > 1 ? ' — stranica ' + page : ''} — polovni dijelovi`, path: '/dijelovi', body,
    desc: `${heading}: polovni auto dijelovi na stanju, ${cfg.name} ${cfg.city}.`,
    noindex: deep || page > 1,
  });
}

// TecDoc-style navigacija: marka -> model -> vozilo i grupe dijelova
function catalog({ marka, model, makes, models, variants, tree, total, yard }) {
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
        <div><h2>Godišta</h2>
          <table class="vt-table"><thead><tr><th>Vozilo (godišta)</th><th></th></tr></thead><tbody>
          ${variants.map(v => `<tr><td><a href="/dijelovi?${mk({ vozilo: v.vehicle })}">${esc(v.vehicle || '(bez oznake)')}</a></td><td class="num">${v.n}</td></tr>`).join('')}
          </tbody></table></div>
        <div><h2>Grupe dijelova</h2>${treeHtml(tree, {}, mk)}</div>
      </div>
      ${yardNotice(yard)}`;
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
  const body = `
<nav class="crumbs"><a href="/">Početna</a> › <a href="/katalog">Katalog</a>${p.make ? ` › <a href="/katalog?marka=${encodeURIComponent(p.make)}">${esc(p.make)}</a>` : ''}${p.make && p.model ? ` › <a href="/katalog?marka=${encodeURIComponent(p.make)}&model=${encodeURIComponent(p.model)}">${esc(p.model)}</a>` : ''}</nav>
<div class="spec-strip">${[['Kat. broj', p.catalog], ['Šifra', p.internal], ['Vozilo', [p.make, p.model].filter(Boolean).join(' ')], ['Strana', p.side], ['Motor', p.engineCode]].filter(x => x[1]).map(([l, v]) => `<div><small>${l}</small><b>${esc(v)}</b></div>`).join('')}</div>
<div class="detail">
  <section class="gal">
    <div class="gal-main">${imgs[0]
      ? `<img id="mainimg" src="${imgUrl(imgs[0], 960)}" alt="${esc(title)}" width="960" height="720">` : '<div class="noimg big">Nema slike</div>'}</div>
    ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((f, i) =>
      `<button type="button" data-thumb="${imgUrl(f, 960)}" aria-label="Slika ${i + 1}"><img src="${imgUrl(f, 240)}" alt="" loading="lazy" width="240" height="180"></button>`).join('')}</div>` : ''}
  </section>
  <section class="info">
    <h1>${esc(title)}</h1>
    ${p.catalog ? `<p class="katline">Kataloški broj: <b>${esc(p.catalog)}</b></p>` : ''}
    ${p.vehicle ? `<p class="sub">${esc(p.vehicle)}</p>` : ''}
    <div class="box buy">
      ${p.price ? `<div class="price big">${esc(money(p.price))}</div>` : `<div class="ask big">Cijena na upit</div>`}
      <p>${warranty()}</p>
      <p class="muted">Pozovi ili nam piši — rado ćemo ti odgovoriti.</p>
      ${contactBtns(p, '')}
    </div>
    ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}
  </section>
</div>
${specs ? `<section class="sheet"><h2>Specifikacija dijela</h2><div class="sheet-grid">${specs}</div></section>` : ''}
${mapSection('Gdje preuzeti ovaj dio', true)}`;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Product', name: title,
    ...(imgs.length ? { image: imgs.slice(0, 5).map(f => cfg.siteUrl + imgUrl(f, 960)) } : {}),
    ...(p.internal ? { sku: p.internal } : {}), ...(p.catalog ? { mpn: p.catalog } : {}),
    ...(p.make ? { brand: { '@type': 'Brand', name: p.make } } : {}),
    itemCondition: 'https://schema.org/UsedCondition',
    warranty: { '@type': 'WarrantyPromise', durationOfWarranty: { '@type': 'QuantitativeValue', value: 7, unitCode: 'DAY' } },
    ...(p.price ? { offers: { '@type': 'Offer', priceCurrency: 'BAM', price: String(p.price), availability: 'https://schema.org/InStock',
      url: cfg.siteUrl + partUrl(p), seller: { '@type': 'Organization', name: cfg.name } } } : {}),
  };
  return layout({
    title: `${p.catalog ? p.catalog + ' · ' : ''}${title}`, path: partUrl(p), body,
    jsonld: [jsonld, { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Početna', item: cfg.siteUrl + '/' },
      ...(p.make ? [{ '@type': 'ListItem', position: 2, name: p.make, item: `${cfg.siteUrl}/katalog?marka=${encodeURIComponent(p.make)}` }] : []),
      { '@type': 'ListItem', position: p.make ? 3 : 2, name: title, item: cfg.siteUrl + partUrl(p) }] }],
    ogImage: imgs[0] ? imgUrl(imgs[0], 960) : null,
    desc: `${p.catalog ? 'Kataloški broj ' + p.catalog + ': ' : ''}${title}${p.vehicle ? ' (' + p.vehicle + ')' : ''}${p.price ? ' — ' + money(p.price) : ' — cijena na upit'}. Polovni dio, garancija 7 dana, ${cfg.name} ${cfg.city}.`,
  });
}

// ---- felne ----
const rimTitle = r => [nice(r.type) || 'Felne', r.diameter && `${r.diameter}"`, r.bolts, r.make, r.model].filter(Boolean).join(' ');
const rimUrl = r => `/felna/${slugify([rimTitle(r), r.internal].filter(Boolean).join(' ')) || 'felne'}-${r.id}`;
const rimSub = r => [r.width && `${r.width}J`, r.et && `ET ${r.et}`, r.center && `CB ${r.center}`].filter(Boolean).join(' · ');

function rimCard(r) {
  const imgs = parseImgs(r), title = rimTitle(r);
  return `<article class="card"><a href="${rimUrl(r)}">
  <div class="card-img">${imgs[0]
    ? `<img src="${imgUrl(imgs[0], 480)}" srcset="${imgUrl(imgs[0], 240)} 240w, ${imgUrl(imgs[0], 480)} 480w" sizes="(max-width:600px) 46vw, 260px" loading="lazy" alt="${esc(title)}" width="480" height="360">`
    : '<div class="noimg">Nema slike</div>'}</div>
  <div class="card-b"><h3>${esc(title)}</h3>${rimSub(r) ? `<p class="sub">${esc(rimSub(r))}</p>` : ''}
  <div class="card-f">${r.price ? `<span class="price">${esc(money(r.price))}</span>` : '<span class="ask">Cijena na upit</span>'}
  ${r.internal ? `<span class="code">${esc(r.internal)}</span>` : ''}</div></div></a></article>`;
}

function rimsList({ rows, f, fx }) {
  const sl = (name, label, opts, cur, ph = 'Sve') => `<label class="f"><span>${esc(label)}</span><select name="${name}"><option value="">${ph}</option>${opts.map(o =>
    `<option value="${esc(o)}"${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  const body = `
<nav class="crumbs"><a href="/">Početna</a> › <span>Felne</span></nav>
<section class="panel"><div class="panel-h"><h1>Felne</h1><span class="muted">${rows.length} ${rows.length === 1 ? 'komplet / komad' : 'kompleta i komada'} na stanju</span></div>
  <form class="sf" method="get" action="/felne" data-auto>
    <div class="sf-grid">
      ${sl('tip', 'Vrsta', fx.types, f.tip)}
      ${sl('promjer', 'Promjer (inča)', fx.diameters, f.promjer)}
      ${sl('sirina', 'Širina (J)', fx.widths, f.sirina)}
      ${sl('raspored', 'Raspored šarafa', fx.bolts, f.raspored)}
      ${sl('marka', 'Marka vozila', fx.makes, f.marka)}
      <label class="f"><span>Cijena</span><select name="cijena"><option value="">Sve</option><option value="1"${f.cijena ? ' selected' : ''}>Samo sa cijenom</option></select></label>
    </div>
    <div class="sf-actions"><button class="btn" type="submit">Traži</button><a class="reset" href="/felne">Poništi sve</a></div>
  </form>
</section>
${rows.length ? `<div class="grid g3">${rows.map(rimCard).join('')}</div>` : `<div class="empty"><p>Nema felni za ovaj izbor.</p><p>Pozovi nas — možda imamo felne koje još nisu u bazi.</p>${contactBtnsMsg('Zdravo, tražim felne koje nisam našao na sajtu.')}</div>`}`;
  return layout({ title: 'Felne — aluminijumske i čelične', path: '/felne', noindex: Object.values(f).some(Boolean), body,
    desc: `Polovne felne (aluminijumske i čelične) po promjeru, širini i rasporedu šarafa — ${cfg.name}, ${cfg.city}.` });
}

function rimDetail(r) {
  const imgs = parseImgs(r), title = rimTitle(r);
  const rows = [['Šifra', r.internal], ['Vrsta', nice(r.type)], ['Promjer', r.diameter && r.diameter + '"'], ['Širina', r.width && r.width + ' J'],
    ['Raspored šarafa', r.bolts], ['ET', r.et], ['Centralna rupa', r.center && r.center + ' mm'], ['Marka vozila', r.make], ['Model', r.model],
    ['Šarafi uključeni', r.screws ? 'Da' : null], ['Hromirane / niklovane', r.chrome ? 'Da' : null], ['Oštećene', r.damaged ? 'Da' : null]]
    .filter(([, v]) => v).map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('');
  const msg = `Zdravo, vidio sam ove felne na vašem sajtu: ${title}${r.internal ? ', šifra ' + r.internal : ''}. Interesuje me cijena.\n${cfg.siteUrl}${rimUrl(r)}`;
  const body = `
<nav class="crumbs"><a href="/">Početna</a> › <a href="/felne">Felne</a> › <span>${esc(title)}</span></nav>
<div class="detail">
  <section class="gal">
    <div class="gal-main">${imgs[0] ? `<img id="mainimg" src="${imgUrl(imgs[0], 960)}" alt="${esc(title)}" width="960" height="720">` : '<div class="noimg big">Nema slike</div>'}</div>
    ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((f, i) => `<button type="button" data-thumb="${imgUrl(f, 960)}" aria-label="Slika ${i + 1}"><img src="${imgUrl(f, 240)}" alt="" loading="lazy" width="240" height="180"></button>`).join('')}</div>` : ''}
  </section>
  <section class="info">
    <h1>${esc(title)}</h1>
    ${rimSub(r) ? `<p class="sub">${esc(rimSub(r))}</p>` : ''}
    <div class="box buy">
      ${r.price ? `<div class="price big">${esc(money(r.price))}</div>` : '<div class="ask big">Cijena na upit</div>'}
      <p class="muted">Pozovi ili nam piši — rado ćemo ti odgovoriti.</p>
      ${contactBtnsMsg(msg, '')}
    </div>
    ${r.note ? `<p class="note">${esc(r.note)}</p>` : ''}
  </section>
</div>
<section class="sheet"><h2>Specifikacija felni</h2><div class="sheet-grid"><table class="specs"><tbody>${rows}</tbody></table></div></section>
${mapSection('Gdje preuzeti ove felne', true)}`;
  const jsonld = { '@context': 'https://schema.org', '@type': 'Product', name: title, ...(imgs.length ? { image: imgs.slice(0, 5).map(f => cfg.siteUrl + imgUrl(f, 960)) } : {}),
    ...(r.internal ? { sku: r.internal } : {}), ...(r.make ? { brand: { '@type': 'Brand', name: r.make } } : {}), itemCondition: 'https://schema.org/UsedCondition',
    ...(r.price ? { offers: { '@type': 'Offer', priceCurrency: 'BAM', price: String(r.price), availability: 'https://schema.org/InStock', url: cfg.siteUrl + rimUrl(r) } } : {}) };
  return layout({ title, path: rimUrl(r), body, jsonld, ogImage: imgs[0] ? imgUrl(imgs[0], 960) : null,
    desc: `${title}${rimSub(r) ? ' (' + rimSub(r) + ')' : ''}${r.price ? ' — ' + money(r.price) : ' — cijena na upit'}. Polovne felne, ${cfg.name} ${cfg.city}.` });
}

function buyout() {
  const phone = cfg.phoneTel;
  const body = `
<nav class="crumbs"><a href="/">Početna</a> › <span>Otkup vozila</span></nav>
<section class="panel buy-page"><div class="panel-h"><h1>Otkup havarisanih vozila</h1></div>
  <p class="lead">Otkupljujemo havarisana, neispravna i otpisana vozila. Pošalji nekoliko slika i podatke, a mi ćemo ti se javiti s ponudom${phone ? ` — ili nas odmah nazovi na <a href="tel:${esc(phone)}">${esc(cfg.phone)}</a>` : ''}.</p>
  <form id="otkup-form" class="box otkup" novalidate>
    <input class="hp" type="text" name="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <div class="sf-grid">
      <label class="f"><span>Ime i prezime *</span><input name="name" required maxlength="80" autocomplete="name"></label>
      <label class="f"><span>Telefon *</span><input name="phone" type="tel" required maxlength="40" autocomplete="tel"></label>
      <label class="f"><span>Gdje se vozilo nalazi (grad / mjesto) *</span><input name="location" required maxlength="120" autocomplete="address-level2"></label>
      <label class="f"><span>Marka, model, godište</span><input name="vehicle" maxlength="120" placeholder="npr. Audi A4 2012"></label>
    </div>
    <label class="f"><span>Opis stanja (šta je oštećeno, da li se pokreće, papiri…)</span><textarea name="description" rows="4" maxlength="1500"></textarea></label>
    <div class="f"><span>Slike vozila (do 8)</span>
      <input id="otkup-files" type="file" accept="image/*" multiple>
      <div id="otkup-prev" class="prev"></div>
      <small class="muted">Slike se automatski smanje prije slanja.</small></div>
    <button type="submit" class="btn">Pošalji ponudu</button>
    <p class="form-msg" role="status"></p>
  </form>
</section>`;
  return layout({ title: 'Otkup havarisanih vozila', path: '/otkup', body,
    desc: `Otkup havarisanih i neispravnih vozila — ${cfg.name}, ${cfg.city}. Pošalji slike i lokaciju, javimo se s ponudom.` });
}

function unavailable(id) {
  return layout({
    title: 'Dio više nije dostupan', path: '/dio/' + id, noindex: true,
    body: `<div class="empty"><h1>Ovaj dio više nije dostupan</h1><p>Vjerovatno je prodan. Pogledaj slične dijelove ili nam pošalji upit.</p>
    <p><a class="btn" href="/dijelovi">Pogledaj dijelove</a> <a class="btn ghost" href="/kontakt">Pošalji upit</a></p></div>`,
  });
}


// Google mapa lokacije otpada (ispod kontakta)
function mapSection(title = 'Gdje se nalazimo', compact = false) {
  const q = cfg.mapQuery || [cfg.name, cfg.address || cfg.city].filter(Boolean).join(', ');
  const e = encodeURIComponent(q);
  return `<section class="box map-box${compact ? ' compact' : ''}"><h2>${esc(title)}</h2>
  <p>${cfg.address ? esc(cfg.address) + ', ' : ''}${esc(cfg.city)}, Bosna i Hercegovina</p>
  <p class="map-act"><a class="btn" href="${esc(cfg.mapLink || 'https://www.google.com/maps/dir/?api=1&destination=' + e)}" target="_blank" rel="noopener">Navigacija u Google mapama</a></p>
  <div class="map-frame"><iframe title="Lokacija — ${esc(cfg.name)}" src="https://www.google.com/maps?q=${e}&hl=bs&z=15&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>
</section>`;
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
    <p>${cfg.address ? esc(cfg.address) + '<br>' : ''}${esc(cfg.city)}, Bosna i Hercegovina</p>
    ${phone ? `<p><a class="btn ghost" href="tel:${esc(phone)}">${esc(cfg.phone)}</a></p>` : ''}
    ${cfg.viber ? `<p><a class="btn ghost" href="viber://chat?number=${esc(encodeURIComponent(cfg.viber))}">Viber</a></p>` : ''}
    ${cfg.email ? `<p><a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a></p>` : ''}
  </div>
</div>
${mapSection()}`,
  });
}

function notFound() {
  return layout({ title: 'Stranica nije pronađena', noindex: true, body: `<div class="empty"><h1>Stranica nije pronađena</h1><p><a class="btn" href="/">Na početnu</a></p></div>` });
}

module.exports = { rimsList, rimDetail, rimUrl, rimTitle, yardNotice, warranty, contactBtnsMsg, contactBtns, buyout, listFrag, esc, slugify, nice, partTitle, partUrl, imgUrl, money, rowToPart, parseImgs, layout, home, list, catalog, detail, unavailable, contact, notFound };
