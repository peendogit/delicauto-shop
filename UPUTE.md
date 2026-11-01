# Webshop delicauto.com — upute

Dvije cjeline u ZIP-u:

- `AutoDelicGume-dodatak/` — mali API modul za TVOJU aplikaciju (ne mijenja ništa postojeće)
- `shop/` — sam webshop (zasebna aplikacija, port 3010)

Kako radi: webshop ima katalog kao TecDoc — na početnoj biraš marku → model → vozilo/motor (ili upišeš kataloški broj), pa grupu i tip dijela (`/katalog`, lijevo stablo grupa u rezultatima). Podaci za to dolaze iz polja marka, model, vozilo, grupa i tip dijela. Pretraga ima sva polja kao u tvojoj aplikaciji: brza pretraga, kataloški broj, tip dijela, interna šifra, grupa, marka, model, vozilo, kubikaža, snaga, kod mjenjača, kod motora, mjenjač, broj brzina, tip karoserije, pogon, gorivo, strana i „samo sa cijenom“. Webshop svakih 20 s pita aplikaciju šta je novo. Dodaš dio → pojavi se. Prodaš dio (`Prodaj dio`) ili količina padne na 0 → nestane. Kad kupac naruči, dio se **rezerviše u aplikaciji** (niko drugi ga ne može naručiti), a ti dobiješ Telegram poruku i narudžbu u `/admin`. Cijena u aplikaciji postoji → shop je prikazuje i dio se može naručiti; nema cijene → „Pošalji upit“.

## 1. Aplikacija (izvor dijelova)

> Napomena: stvarna aplikacija s dijelovima je dijelovi.delicauto.com (ne AutoDelicGume). Fajl `shop-api.cjs` je referentna implementacija API-ja: programer te aplikacije može prepisati istu logiku u svoj jezik, ili je koristiti ako aplikacija radi na Node.js + SQLite.

1. Kopiraj `shop-api.cjs` i `inspect-schema.cjs` u folder pored glavnog server fajla.
2. Provjeri nazive kolona: `node inspect-schema.cjs putanja/do/baze.db` — ako se razlikuju od onih na vrhu `shop-api.cjs` (blok `MAP`), prilagodi ih, ili mi pošalji ispis pa ću to ja.
3. U glavnom server fajlu, **prije** auth-a i prije `app.get('*')`, dodaj:
   ```js
   require('./shop-api.cjs')(app, db);   // ako server koristi import: import shopApi from './shop-api.cjs'; shopApi(app, db);
   ```
   (`db` je tvoja SQLite konekcija.)
4. U `.env` aplikacije dodaj liniju (ne briši PORT=3003!): `SHOP_API_KEY=dugi-nasumicni-kljuc`
5. `pm2 restart` aplikacije. U logu mora pisati `[shop-api] aktivno…`. Ako piše `PROBLEMI S MAPIRANJEM`, to znači da neka kolona ima drugo ime.

## 2. Webshop

1. Stavi `shop/` na GitHub (npr. repo `delicauto-shop`; `.env` se ne šalje) i kloniraj na VPS.
2. `cd delicauto-shop && npm install --omit=dev` (instalira `better-sqlite3` i `sharp` za brže slike; radi i bez njih na Node 22+)
3. `cp .env.example .env` pa popuni: `APP_API_KEY` (isti kao SHOP_API_KEY), `UPLOADS_DIR`, telefon (`SHOP_PHONE`, već je 066 027 888), `ADMIN_PASS`, Telegram.
4. `pm2 start ecosystem.config.cjs && pm2 save`
5. Nginx: `deploy/nginx-delicauto.conf` → `certbot --nginx -d delicauto.com -d www.delicauto.com`. DNS: A zapis `delicauto.com` i `www` → 158.220.96.229.
6. Auto-deploy (opciono): cron linija iz `deploy/deploy.sh`.

Pri prvom pokretanju shop povuče sve dijelove na stanju (nekoliko minuta za ~180.000). Status se vidi na `/admin` i `/health`.

## Šta znati

- `/admin` (korisnik i lozinka iz .env): narudžbe, upiti, status sinhronizacije. „Otkaži + oslobodi dio“ vraća dio u prodaju.
- Nakon završene prodaje u aplikaciji klikni `Prodaj dio` kao i do sada. Rezervacija se sama briše nakon 14 dana.
- Slike se smanjuju i keširaju u `shop/data/imgcache`.
- Plaćanje je pouzećem / preuzimanje. Cijena dostave se dogovara telefonom. Kartično plaćanje se može dodati naknadno.
- Test cijelog toka (lažna aplikacija + shop): `npm test`.
