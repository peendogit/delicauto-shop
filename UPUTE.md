# Webshop delicauto.com — upute

Dvije cjeline u ZIP-u:

- `api-primjer-za-programera/` — mali API modul za TVOJU aplikaciju (ne mijenja ništa postojeće)
- `shop/` — sam webshop (zasebna aplikacija, port 3010)

Kako radi: webshop ima katalog kao TecDoc — na početnoj biraš marku → model → vozilo/motor (ili upišeš kataloški broj), pa grupu i tip dijela (`/katalog`, lijevo stablo grupa u rezultatima). Podaci za to dolaze iz polja marka, model, vozilo, grupa i tip dijela. Pretraga ima sva polja kao u tvojoj aplikaciji: brza pretraga, kataloški broj, tip dijela, interna šifra, grupa, marka, model, vozilo, kubikaža, snaga, kod mjenjača, kod motora, mjenjač, broj brzina, tip karoserije, pogon, gorivo, strana i „samo sa cijenom“. Webshop svakih 20 s pita aplikaciju šta je novo. Dodaš dio → pojavi se. Prodaš dio (`Prodaj dio`) ili količina padne na 0 → nestane. Kad kupac naruči, dio se **rezerviše u aplikaciji** (niko drugi ga ne može naručiti), a ti dobiješ Telegram poruku i narudžbu u `/admin`. Cijena u aplikaciji postoji → shop je prikazuje i dio se može naručiti; nema cijene → „Pošalji upit“.

## 0. Veza sa programom delicdijelovi (preporučeno)

Program **delicdijelovi** (peendogit/Delicdijelovi) već ima API koji ovaj shop koristi (`/shop-api`) — ništa ne treba dodavati:
1. U `.env` programa delicdijelovi: `SHOP_API_KEY=dugi-nasumicni-kljuc` pa `pm2 restart delic-dijelovi`
2. U `shop/.env`: `APP_URL=http://127.0.0.1:3020`, `APP_API_KEY=` isti ključ, `UPLOADS_DIR=/var/www/delicdijelovi/data/uploads`, pa `pm2 restart delicauto-shop`
3. Shop sam povuče sve dijelove (par minuta), a dalje svakih 20 s: novi dio se pojavi, prodat nestane, promjena cijene stigne, narudžba sa sajta rezerviše dio u programu.
ID-evi dijelova su isti kao kod uvoza iz backupa, pa postojeće narudžbe ostaju ispravne.

## 1. Aplikacija (izvor dijelova) — stari način

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
3. `cp .env.example .env` pa popuni: `APP_API_KEY` (isti kao SHOP_API_KEY), `UPLOADS_DIR`, telefon (`SHOP_PHONE`, već je +387 66 027 888), `ADMIN_PASS`, Telegram.
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

## Uvoz iz backupa baze (radi odmah, bez programera)

Ako nemaš API aplikacije, shop se puni iz backupa baze (ostavi `APP_API_KEY` prazan u `.env`):

1. Backup (`.sql.gz`) stavi na server, npr. `~/backup.sql.gz`.
2. `cd ~/delicauto-shop/shop && node tools/import-dump.js ~/backup.sql.gz` — uveze samo dijelove NA STANJU (nema prodanih). Korisnici i lozinke iz backupa se ne čitaju.
3. `pm2 restart delicauto-shop`.

Napomene:
- To je **snimak** stanja iz dana backupa. Za svježe stanje ponovi uvoz s novim backupom. Prava veza (automatski) dolazi kad programer da API.
- Cijena iz backupa se prikazuje ako postoji (BAM = KM), inače „Pošalji upit“.
- **Slike:** u backupu su samo ID-evi. Fajlove slika treba staviti u `UPLOADS_DIR`, a naziv fajla se određuje sa `IMG_PATTERN` u `.env` (zadano `{id}.jpg`).
- U ovom načinu shop ne rezerviše dio u aplikaciji. Narudžba stiže u Telegram i `/admin`; kad je označiš „završena“, dio nestaje iz shopa.

## Otkup vozila (stranica /otkup)

Posjetilac pošalje ime, telefon, lokaciju, opis i do 8 slika. Ponuda ide: u `/admin` (sekcija „Otkup vozila“, sa slikama), na Telegram i na mail `OTKUP_EMAIL` (slike u prilogu).

Da mail radi, u `.env` upiši `SMTP_USER=autootpaddelic@gmail.com` i `SMTP_PASS=` — to je **lozinka za aplikacije** iz Google računa (Sigurnost → Provjera u 2 koraka → Lozinke za aplikacije), ne obična lozinka. Zatim `pm2 restart delicauto-shop`. Bez toga ponude ipak stižu u admin i Telegram.
