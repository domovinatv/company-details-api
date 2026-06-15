# Deploy na Cloudflare — UŽIVO

Servis je deployan na **<https://firme.domovina.ai>** (custom domain). Worker je
konfiguriran kao *custom domain* u `worker/wrangler.toml`, pa je wrangler na
deployu sam stvorio proxied DNS zapis + edge certifikat.

> Account: `7dc7167b7e2e00923bfa7cd697df14e4` (isti kao ostali domovina.* servisi).
> D1: `company_details` = `edcb397a-653e-492b-a606-ae4776d4139b`.
> Tajne: `ADMIN_USER` (=`domovina`), `ADMIN_PASS`, `INGEST_KEY` — postavljene
> kroz `wrangler secret put`; lokalna kopija u gitignored `worker/.prod.vars`.

> **Gotcha (svjež custom domain):** edge SSL certifikat se izdaje ~5–15 min;
> dok traje, `https://firme.domovina.ai` vraća HTTP 000. Dodatno, lokalni
> resolver zna keširati negativni DNS odgovor (NXDOMAIN) od prije nego je zapis
> postojao, pa `curl`/Node ne razrješavaju host iako `dig` vidi IP. Zaobilazak:
> `curl --resolve firme.domovina.ai:443:<CF-IP>` za test, a punjenje prod baze
> ide preko Cloudflare API-ja (D1 import), ne preko custom domene.

## Koraci

```bash
cd worker

# 1) Kreiraj produkcijsku D1 bazu i zalijepi database_id u wrangler.toml
npx wrangler d1 create company_details
#   → kopiraj "database_id" u [[d1_databases]] (zamijeni PLACEHOLDER_DATABASE_ID)

# 2) Migracije na produkciju
npm run db:migrate:prod

# 3) Tajne (NIKAD u repo — public je!)
npx wrangler secret put ADMIN_USER
npx wrangler secret put ADMIN_PASS
npx wrangler secret put INGEST_KEY

# 4) Deploy (stvara i DNS zapis za firme.domovina.ai)
npm run deploy
```

## Punjenje / sync produkcije

Dva načina:

**A) Bridge gađa produkciju** (kad lokalni resolver razrješava poddomenu):

```bash
WORKER_URL=https://firme.domovina.ai INGEST_KEY=<prod-key> npm run bridge:seed -- --all
WORKER_URL=https://firme.domovina.ai INGEST_KEY=<prod-key> npm run bridge:enrich -- --all --firecrawl
```

**B) Export lokalne D1 → import u prod** (robusno, BEZ ovisnosti o DNS-u — preko
Cloudflare API-ja). Koristi se kad je lokalna D1 već obrađena pa samo želimo
preslikati stanje u prod:

```bash
cd worker
npx wrangler d1 export company_details --local --no-schema --table companies --output ./prod-load.sql
{ echo "DELETE FROM companies;"; cat ./prod-load.sql; } > ./prod-sync.sql   # idempotentno (clear + reload)
npx wrangler d1 execute company_details --remote --file ./prod-sync.sql
rm -f ./prod-load.sql ./prod-sync.sql                                        # ne commitati (sadrži podatke)
```

> `--file` putanja mora biti unutar projekta (wrangler ne čita iz `/tmp`).

## Napomene

- **Worker ne scrapea u produkciji.** Firecrawl obrada ostaje lokalna (bridge);
  Worker samo prima rezultate i poslužuje grid/API. Time izbjegavamo Firecrawl
  ključeve i duge zahtjeve na rubu.
- Ako kasnije želimo obradu i u oblaku: dodati Cloudflare **Queue** + consumer
  koji zove službene API-je (sudreg-data.gov.hr) umjesto scrapea (vidi
  `docs/02-izvori-podataka.md`).
- Custom domain (ne plain route) je nužan jer je poddomena nova; bonus: nije pod
  Cloudflare Access app-om pa je javno dostupna odmah, a auth radi sam Worker.
