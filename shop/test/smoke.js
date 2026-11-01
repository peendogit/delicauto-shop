'use strict';
// Smoke test: lažna aplikacija (s pravim shop-api.cjs modulom) + pravi shop, kompletan tok od dodavanja do narudžbe.
// Pokretanje: npm test
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'delic-'));
const KEY = 'test-kljuc-123', APP_PORT = 3999, SHOP_PORT = 3998;
process.env.SHOP_API_KEY = KEY;

// ----- lažna aplikacija -----
const adb = new DatabaseSync(path.join(tmp, 'app.db'));
adb.exec(`CREATE TABLE dijelovi (id INTEGER PRIMARY KEY AUTOINCREMENT, interna_sifra TEXT, tip_dijela TEXT, grupa TEXT, marka TEXT, model TEXT,
  vozilo TEXT, kataloski_broj TEXT, strana TEXT, gorivo TEXT, kubikaza TEXT, snaga TEXT, kod_motora TEXT, kod_mjenjaca TEXT, mjenjac TEXT,
  broj_brzina TEXT, tip_karoserije TEXT, pogon TEXT, napomena TEXT, cijena REAL, kolicina INTEGER, slike TEXT, nabavna_cijena REAL, updated TEXT)`);
const ins = adb.prepare(`INSERT INTO dijelovi(interna_sifra,tip_dijela,marka,model,vozilo,kataloski_broj,gorivo,kubikaza,snaga,cijena,kolicina,slike,nabavna_cijena)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
ins.run('7CM2', 'KUTIJA OSIGURACA', 'Land Rover', 'Range Rover Sport L494 (13-17)', '3.0 Dizel', 'CPLA14Q073AA', 'Dizel', '2993', '190', 85, 1, '["uploads/7CM2/a.jpg"]', 10);
ins.run('E90M', 'KEYLESS MODUL', 'Land Rover', 'Range Rover Sport L494 (13-17)', '3.0 Dizel', 'DPLA19H440AE', 'Dizel', null, null, null, 1, 'b.jpg', 5);
ins.run('G7F', 'FAR LIJEVI', 'Volkswagen', 'Golf 7', '1.6 TDI', '5G1941005', 'Dizel', '1598', '81', 120, 2, '', 20);
adb.exec("UPDATE dijelovi SET grupa = 'Elektrika' WHERE id IN (1, 2); UPDATE dijelovi SET grupa = 'Karoserija' WHERE id = 3");
adb.exec("UPDATE dijelovi SET kod_motora = '306DT', pogon = '4x4', mjenjac = 'Automatik', broj_brzina = '8', tip_karoserije = 'SUV', kod_mjenjaca = 'ZF8HP' WHERE id = 1; UPDATE dijelovi SET strana = 'Lijeva', kod_motora = 'CLHA' WHERE id = 3");
ins.run('SOLD', 'ZRCALO', 'Audi', 'A4 B8', '2.0 TDI', '8K0857409', 'Dizel', null, null, 40, 0, '', 5);

const shopApi = require('../../api-primjer-za-programera/shop-api.cjs');
const mw = [];
const fakeApp = { use: (p, fn) => mw.push([p, fn]) };
shopApi(fakeApp, adb);
const appServer = http.createServer((req, res) => {
  for (const [p, fn] of mw) if (req.url.startsWith(p)) { req.url = req.url.slice(p.length) || '/'; return fn(req, res); }
  res.statusCode = 404; res.end('x');
});

// ----- helpers -----
let fails = 0;
const ok = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) fails++; };
const tb = t => (String(t).match(/<tbody>([\s\S]*?)<\/tbody>/) || [, ''])[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const S = p => `http://127.0.0.1:${SHOP_PORT}${p}`;
const get = async p => { const r = await fetch(S(p)); return { status: r.status, text: await r.text(), type: r.headers.get('content-type') }; };
const post = async (p, body, headers = {}) => {
  const r = await fetch(S(p), { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch { /* */ } return { status: r.status, json: j };
};
const waitFor = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(300); } return false; };
const basic = 'Basic ' + Buffer.from('nino:tajna123').toString('base64');

(async () => {
  await new Promise(r => appServer.listen(APP_PORT, r));
  const uploads = path.join(tmp, 'uploads'); fs.mkdirSync(path.join(uploads, '7CM2'), { recursive: true });
  let sharpOk = false;
  try {
    const sharp = require('sharp');
    await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#cc5500' } }).jpeg().toFile(path.join(uploads, '7CM2', 'a.jpg'));
    sharpOk = true;
  } catch { fs.writeFileSync(path.join(uploads, '7CM2', 'a.jpg'), Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64')); }

  const shop = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: SHOP_PORT, APP_URL: `http://127.0.0.1:${APP_PORT}`, APP_API_KEY: KEY, UPLOADS_DIR: uploads,
      DATA_DIR: path.join(tmp, 'data'), ADMIN_USER: 'nino', ADMIN_PASS: 'tajna123', POLL_SECONDS: '2', SITE_URL: 'https://delicauto.com',
      SHOP_PHONE: '+387 66 027 888', NODE_PATH: process.env.NODE_PATH || '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; shop.stdout.on('data', d => log += d); shop.stderr.on('data', d => log += d);

  try {
    console.log('Sinhronizacija');
    ok(await waitFor(async () => { try { return JSON.parse((await get('/health')).text).parts === 3; } catch { return false; } }), 'shop učitao 3 dijela na stanju (4. je prodan)');

    console.log('Katalog');
    let r = await get('/dijelovi');
    ok(r.status === 200 && tb(r.text).includes('Kutija osiguraca') && tb(r.text).includes('Land Rover Range Rover Sport'), 'tabela prikazuje dio 1 (naziv normalizovan)');
    ok(tb(r.text).includes('85 KM'), 'cijena prikazana kad postoji');
    ok(tb(r.text).includes('Na upit') && !tb(r.text).includes('wa.me/') && !tb(r.text).includes('viber://'), 'u rezultatima nema Pozovi/Viber/WhatsApp dugmadi');
    ok(!r.text.includes('Zrcalo'), 'prodani dio nije prikazan');
    ok(!r.text.includes('nabavna'), 'nabavne cijene nema u izlazu');
    r = await get('/dijelovi?q=osigura%C4%8Da'); ok(r.text.includes('Kutija osiguraca') && !r.text.includes('Golf 7'), 'pretraga s dijakritikom (osigurača)');
    r = await get('/dijelovi?q=CPLA-14Q073-AA'); ok(r.text.includes('Kutija osiguraca'), 'pretraga kataloškog broja s crticama');
    r = await get('/dijelovi?marka=Volkswagen'); ok(r.text.includes('Golf 7') && !r.text.includes('Range Rover'), 'filter po marki');
    r = await get('/'); ok(r.status === 200 && r.text.includes('AutoPartsStore'), 'početna + LocalBusiness schema');

    console.log('TecDoc katalog');
    r = await get('/katalog'); ok(r.status === 200 && r.text.includes('Odaberi marku vozila') && r.text.includes('Volkswagen') && r.text.includes('slovo-L'), 'katalog: marke po slovima');
    r = await get('/katalog?marka=Land%20Rover'); ok(r.text.includes('Range Rover Sport L494 (13-17)') && r.text.includes('2 dijelova'), 'katalog: modeli marke s brojem dijelova');
    const mdl = encodeURIComponent('Range Rover Sport L494 (13-17)');
    r = await get('/katalog?marka=Land%20Rover&model=' + mdl);
    ok(r.text.includes('3.0 Dizel') && r.text.includes('Grupe dijelova') && r.text.includes('Elektrika'), 'katalog: vozila i grupe za model');
    r = await get('/dijelovi?marka=Land%20Rover&model=' + mdl + '&grupa=Elektrika');
    ok(r.text.includes('Kutija osiguraca') && r.text.includes('Keyless modul') && !r.text.includes('Golf 7') && r.text.includes('class="parts"'), 'lista po vozilu i grupi, tabelarni prikaz');
    ok(r.text.includes('class="tree"') && r.text.includes('Sve iz grupe'), 'stablo grupa u sidebaru');
    r = await get('/dijelovi?marka=Land%20Rover&vozilo=' + encodeURIComponent('3.0 Dizel')); ok(r.text.includes('Kutija osiguraca'), 'filter po vozilu');
    r = await get('/dijelovi?grupa=Karoserija&prikaz=mreza'); ok(r.text.includes('grid g3') && r.text.includes('Golf 7'), 'prikaz mreže + filter po grupi');
    r = await get('/api/facets?marka=Land%20Rover'); ok(JSON.parse(r.text).models.includes('Range Rover Sport L494 (13-17)'), 'API facets: modeli marke');
    r = await get('/'); ok(['q', 'katbr', 'tip', 'sifra', 'grupa', 'marka', 'model', 'vozilo', 'ccm', 'kw', 'kodmj', 'kodmot', 'mjenjac', 'brzina', 'karoserija', 'pogon', 'gorivo', 'strana', 'cijena'].every(n => r.text.includes(`name="${n}"`)), 'početna: sva polja pretrage kao u aplikaciji');
    ok(r.text.includes('value="4x4"') && r.text.includes('value="Automatik"') && r.text.includes('value="1598"'), 'padajuće liste popunjene stvarnim vrijednostima');
    const has = async (qs, yes, no) => { const t = tb((await get('/dijelovi?' + qs)).text); return yes.every(x => t.includes(x)) && (no || []).every(x => !t.includes(x)); };
    ok(await has('kodmot=306', ['Kutija osiguraca'], ['Golf 7']), 'filter: kod motora');
    ok(await has('kw=190', ['Kutija osiguraca'], ['Golf 7']), 'filter: snaga kW');
    ok(await has('ccm=1598', ['Golf 7'], ['Kutija osiguraca']), 'filter: kubikaža');
    ok(await has('sifra=7cm', ['Kutija osiguraca'], ['Golf 7']), 'filter: interna šifra (bez obzira na velika slova)');
    ok(await has('katbr=CPLA-14Q073', ['Kutija osiguraca'], ['Golf 7']), 'filter: kataloški broj s crticama');
    ok(await has('cijena=1', ['Kutija osiguraca', 'Golf 7'], ['Keyless modul']), 'filter: samo sa cijenom');
    ok(await has('pogon=4x4&mjenjac=Automatik&brzina=8&karoserija=SUV&kodmj=zf8', ['Kutija osiguraca'], ['Golf 7']), 'filter: pogon + mjenjač + brzine + karoserija + kod mjenjača');
    ok(await has('strana=Lijeva', ['Golf 7'], ['Kutija osiguraca']), 'filter: strana');
    ok(await has('kodmot=%25', [], ['Golf 7', 'Kutija osiguraca']), 'kod motora: % nije džoker (nema lažnih pogodaka)');

    console.log('Detalj');
    const id1 = JSON.parse((await get('/api/dijelovi?ids=1,2,3')).text);
    ok(id1.length === 3, 'API za korpu vraća 3 dijela');
    r = await get(id1.find(x => x.id === 1).url);
    ok(r.status === 200 && r.text.includes('application/ld+json') && r.text.includes('"price":"85"') && !r.text.includes('Dodaj u korpu') && r.text.includes('wa.me/38766027888?text=') && r.text.includes('viber://chat?number=%2B38766027888') && r.text.includes('tel:+38766027888') && r.text.includes('Interesuje me cijena') && r.text.includes('data-copy='), 'detalj: schema, cijena, Pozovi/Viber/WhatsApp s tekstom upita');
    r = await get(id1.find(x => x.id === 2).url);
    ok(r.text.includes('Cijena na upit') && !r.text.includes('Dodaj u korpu'), 'detalj bez cijene: upit, bez korpe');
    r = await get('/dio/1'); ok(r.status === 200 || r.status === 301, 'dio/1 preusmjeren na kanonski URL');

    console.log('Slike');
    r = await fetch(S('/img/480/7CM2/a.jpg')); ok(r.status === 200 && r.headers.get('content-type') === 'image/jpeg', `slika se servira (sharp: ${sharpOk ? 'da' : 'ne'})`);
    const bytes = Buffer.from(await (await fetch(S('/img/480/7CM2/a.jpg'))).arrayBuffer());
    ok(bytes.length > 100 && bytes[0] === 0xff && bytes[1] === 0xd8, 'slika ima pravi JPEG sadržaj (' + bytes.length + ' B)');
    const css = await get('/static/style.css'); ok(css.status === 200 && css.text.includes('--ac:'), 'style.css se isporučuje s tijelom');
    const js = await get('/static/app.js'); ok(js.status === 200 && js.text.includes('delic_cart_v1'), 'app.js se isporučuje s tijelom');
    r = await fetch(S('/img/480/..%2F..%2Fetc%2Fpasswd')); ok(r.status === 404, 'path traversal blokiran');

    console.log('Prodaja u aplikaciji -> nestaje iz shopa');
    adb.prepare('UPDATE dijelovi SET kolicina = 0 WHERE id = 1').run();
    ok(await waitFor(async () => !tb((await get('/dijelovi')).text).includes('Kutija osiguraca')), 'prodan dio nestao iz liste');
    r = await get('/dio/1'); ok(r.status === 410, 'detalj prodanog dijela vraća 410');

    console.log('Dodavanje u aplikaciji -> pojavi se u shopu');
    ins.run('NEW1', 'ALTERNATOR', 'BMW', '320d E90', '2.0 Dizel', 'ALT123', 'Dizel', null, null, 150, 1, '', 30);
    ok(await waitFor(async () => tb((await get('/dijelovi')).text).includes('Alternator')), 'novi dio se pojavio');

    console.log('Narudžba i rezervacija');
    const cust = { name: 'Test Kupac', phone: '065 123 456', delivery: 'dostava', city: 'Brčko', address: 'Ulica 1' };
    let o = await post('/api/narudzba', { ...cust, items: [{ id: 3, qty: 3 }] });
    ok(o.status === 409, 'više od dostupne količine se odbija');
    o = await post('/api/narudzba', { ...cust, items: [{ id: 2, qty: 1 }] });
    ok(o.status === 409, 'dio bez cijene se ne može naručiti');
    o = await post('/api/narudzba', { ...cust, items: [{ id: 3, qty: 2 }] });
    ok(o.status === 200 && /^DS-\d{6}-[A-Z0-9]{4}$/.test(o.json.ref), 'narudžba uspješna: ' + (o.json && o.json.ref));
    const ref = o.json.ref;
    o = await post('/api/narudzba', { ...cust, items: [{ id: 3, qty: 1 }] });
    ok(o.status === 409, 'rezervisan dio drugi kupac ne može naručiti');
    ok(await waitFor(async () => !tb((await get('/dijelovi')).text).includes('Golf 7')), 'rezervisan dio nestaje iz javne liste');
    ok(adb.prepare('SELECT COUNT(*) AS n FROM shop_reservations').get().n === 1, 'rezervacija upisana u bazu aplikacije');

    console.log('Admin');
    r = await fetch(S('/admin')); ok(r.status === 401, 'admin traži prijavu');
    r = await fetch(S('/admin'), { headers: { authorization: basic } }); const t = await r.text();
    ok(r.status === 200 && !t.includes('Test Kupac'), 'admin više ne prikazuje narudžbe');
    const oid = Number(adb.prepare('SELECT 1 AS x').get().x) && 1;
    const c = await fetch(S('/admin/order/' + oid), { method: 'POST', redirect: 'manual', headers: { authorization: basic, 'content-type': 'application/x-www-form-urlencoded' }, body: 'status=otkazana' });
    ok(c.status === 303, 'otkazivanje narudžbe');
    ok(adb.prepare('SELECT COUNT(*) AS n FROM shop_reservations').get().n === 0, 'otkazivanje oslobodilo rezervaciju u aplikaciji');
    ok(await waitFor(async () => tb((await get('/dijelovi')).text).includes('Golf 7')), 'dio se vratio u shop');
    const bad = await fetch(S('/admin/sync'), { method: 'POST', redirect: 'manual', headers: { authorization: basic, origin: 'https://evil.example' } });
    ok(bad.status === 403, 'admin POST s tuđeg origina odbijen (CSRF)');

    console.log('Upit');
    o = await post('/api/upit', { name: 'Marko', phone: '1', message: 'x' }); ok(o.status === 400, 'neispravan telefon odbijen');
    o = await post('/api/upit', { name: 'Marko', phone: '065 111 222', partId: 2, message: 'Koja cijena?' }); ok(o.status === 200, 'upit za dio bez cijene prihvaćen');
    o = await post('/api/upit', { name: 'Bot', phone: '065 111 222', hp: 'spam' }); ok(o.status === 200, 'honeypot tiho prihvaćen');
    r = await fetch(S('/admin'), { headers: { authorization: basic } }); ok(!(await r.text()).includes('Koja cijena?'), 'admin više ne prikazuje upite');

    console.log('Otkup vozila');
    r = await get('/otkup'); ok(r.status === 200 && r.text.includes('otkup-form') && r.text.includes('Otkup'), 'stranica otkupa');
    const jpg = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(900, 7)]).toString('base64');
    o = await post('/api/otkup', { name: 'Pero', phone: '1', location: 'Bijeljina' }); ok(o.status === 400, 'otkup: neispravan telefon odbijen');
    o = await post('/api/otkup', { name: 'Pero Peric', phone: '065 333 444', location: 'Brčko', vehicle: 'Golf 5 2005', description: 'Udaren naprijed', images: [jpg, 'data:text/html;base64,AAAA'] });
    ok(o.status === 200, 'otkup: ponuda prihvaćena');
    r = await fetch(S('/admin'), { headers: { authorization: basic } }); const adm = await r.text();
    const det = await (await fetch(S('/admin/otkup/1'), { headers: { authorization: basic } })).text();
    ok(adm.includes('Golf 5 2005') && adm.includes('href="/admin/otkup/1"') && det.includes('/admin/otkup/1/1') && !det.includes('/admin/otkup/1/2'), 'otkup: lista, stranica ponude i samo ispravna slika');
    r = await fetch(S('/admin/otkup/1/1')); ok(r.status === 401, 'otkup: slika zaštićena lozinkom');
    r = await fetch(S('/admin/otkup/1/1'), { headers: { authorization: basic } }); ok(r.status === 200 && r.headers.get('content-type') === 'image/jpeg', 'otkup: slika dostupna adminu');
    r = await get('/'); ok(r.text.includes('/otkup'), 'meni vodi na otkup');

    console.log('SEO');
    r = await get('/sitemap.xml'); ok(r.text.includes('sitemap-dijelovi-1.xml'), 'sitemap indeks');
    r = await get('/sitemap-dijelovi-1.xml'); ok(r.text.includes('/dio/'), 'sitemap dijelova');
    r = await get('/robots.txt'); ok(r.text.includes('Sitemap: https://delicauto.com/sitemap.xml'), 'robots.txt');
    r = await get('/nepostojece'); ok(r.status === 404, '404 stranica');

    console.log('API zaštita');
    const noKey = await fetch(`http://127.0.0.1:${APP_PORT}/shop-api/parts`); ok(noKey.status === 401, 'API aplikacije bez ključa odbijen');
    const withKey = await fetch(`http://127.0.0.1:${APP_PORT}/shop-api/parts`, { headers: { 'x-api-key': KEY } });
    const body = await withKey.text(); ok(withKey.status === 200 && !body.includes('nabavna'), 'API s ključem radi, bez internih polja');
  } catch (e) { console.error('TEST GREŠKA', e); fails++; }

  console.log(fails ? `\n${fails} NEUSPJEŠNIH` : '\nSVE PROŠLO');
  if (fails) console.log('--- log shopa ---\n' + log);
  shop.kill(); appServer.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(fails ? 1 : 0);
})();
