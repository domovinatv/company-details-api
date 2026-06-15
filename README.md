# company-details-api · firme.domovina.ai

Servis koji za listu hrvatskih pravnih osoba (po **OIB-u**) iz javnih izvora
dohvaća poslovne podatke, **razvrstava poduzetnike po veličini** —
**mikro / mali / srednji / veliki** — prema Zakonu o računovodstvu (NN 85/24,
čl. 5) i bilježi **pravni status** (aktivan / brisan / u likvidaciji / u stečaju /
blokada …). Za **udruge** ne računa kategoriju veličine nego prati **ima li
zaposlenih i koliko**.

Primarni izvor je **FINA info.BIZ** (`infobiz.fina.hr`), koji javno objavljuje
**službenu oznaku veličine** i status po OIB-u — dohvaća se običnim `fetch`-om,
**bez Firecrawl kredita**. Firecrawl izvori (companywall, sudreg, FINA RGFI,
registar udruga) su nadopuna za ono što info.BIZ ne pokriva.

Dio [domovina.ai](https://domovina.ai) ekosustava. Klasifikacija ide ili po
**FINA RGFI bilanci** (ukupna aktiva + prihod) ili po **broju zaposlenih**
(2 od 3 kriterija, kako traži zakon).

## Arhitektura

Monorepo, dva dijela (model preuzet iz `pipeline.domovina.ai`):

| Dio | Tehnologija | Uloga |
|-----|-------------|-------|
| `src/` | Node 20+ / TypeScript | **lokalni engine + bridge** — Firecrawl scrape iz javnih izvora, razvrstavanje, push u Worker |
| `worker/` | Cloudflare Worker · Hono · D1 | **backend API + admin grid** — pohrana i posluživanje; server-rendered UI |

```
CSV (OIB lista)  ──seed──▶  D1 (status=pending)  ──▶  Admin grid /admin
       │                                                    ▲
       └──enrich──▶ Firecrawl izvori ──▶ classify ──ingest──┘ (status=enriched)
                    companywall · sudreg · FINA RGFI · udruge
```

**Worker ne scrapea** — sva teška obrada (Firecrawl, klasifikacija) je lokalna,
a rezultati se gađaju u Worker preko autenticiranog `POST /api/ingest`. To drži
javni servis brzim i jeftinim (D1 read), kao kod ostalih DOMOVINA servisa.

## Izvori podataka

companywall.hr · sudski registar (sudreg) · FINA RGFI · registar udruga / RNO.
Detalji i prioritet spajanja: [`docs/02-izvori-podataka.md`](docs/02-izvori-podataka.md).
Pravila razvrstavanja: [`docs/01-klasifikacija-velicine.md`](docs/01-klasifikacija-velicine.md).

## Lokalno pokretanje (Phase 1)

```bash
# 1) Ovisnosti
npm install
(cd worker && npm install)

# 2) Tajne
cp .env.example .env                 # FIRECRAWL_API_KEYS=... , INGEST_KEY=...
cp worker/.dev.vars.example worker/.dev.vars   # ADMIN_USER/PASS, INGEST_KEY (isti kao .env)

# 3) Lokalna D1 baza
(cd worker && npm run db:migrate:local)

# 4) Pokreni Worker (admin grid + API)
(cd worker && npm run dev)           # http://localhost:8787/admin

# 5) Napuni grid identitetima s popisa (bez scrapea, instant)
npm run bridge:seed -- --all

# 6) Obogati + razvrstaj — BESPLATNO (info.BIZ, bez Firecrawl kredita)
npm run bridge:enrich -- --all

# 6b) Opcijski: nadopuna Firecrawl izvorima za ono što info.BIZ ne pokriva
#     (troši kredite — počni s malim brojem)
npm run bridge:enrich -- --limit 10 --firecrawl
```

**Način rada:** `bridge:enrich` je po defaultu **free** (samo info.BIZ +
službeni API-ji, bez kredita). Dodaj `--firecrawl` da uključiš i companywall/
sudreg/FINA RGFI scrapere. Svi Firecrawl odgovori se trajno cacheiraju u
`data/cache/` (sirovi JSON), pa se krediti troše samo jednom — kasniji
re-processing nad istim podacima je besplatan.

Admin grid: **<http://localhost:8787/admin>** (Basic Auth iz `worker/.dev.vars`).

### Bez Workera (samo offline)

```bash
npm run classify -- --limit 10       # piše data/output/results.json
npm run classify -- --oib 22820690652
```

### Ulazni CSV

Default je `data/input/pravne-osobe.csv` (gitignored). Koriste se samo stupci
`company_oib`/`oib`, `legal_entity_name`, `legal_form` — ostali stupci (e-mail,
telefon, IBAN…) se **ignoriraju i ne napuštaju stroj**.

## API

| Metoda | Putanja | Auth | Opis |
|--------|---------|------|------|
| `POST` | `/api/classify` | Bearer `INGEST_KEY` | predaj `{companies:[{oib,name}]}` → enqueue + vrati poznato |
| `POST` | `/api/ingest` | Bearer `INGEST_KEY` | batch upsert razvrstanih zapisa (bridge) |
| `GET`  | `/api/companies` | — | `?size=&status=&kind=&q=&limit=&offset=` |
| `GET`  | `/api/companies/:oib` | — | jedan subjekt |
| `GET`  | `/admin` | Basic Auth | grid |

## Deploy na Cloudflare (Phase 2)

Predviđena poddomena: **`firme.domovina.ai`** (slobodna; custom domain u
`worker/wrangler.toml`). Koraci u [`docs/03-deploy.md`](docs/03-deploy.md).

## Testovi

```bash
npm test        # provjera pravila razvrstavanja (classify.test.ts)
npm run typecheck
```

## Licenca

[MIT](LICENSE) (kod). Podaci potječu iz javnih registara i pripadaju izvornim
nositeljima.
