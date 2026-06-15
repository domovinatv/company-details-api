# Deploy na Cloudflare (Phase 2)

Cilj: javni servis na **`firme.domovina.ai`** (poddomena slobodna — provjereno
`dig`-om, nema DNS zapisa). Worker je već konfiguriran kao *custom domain* u
`worker/wrangler.toml`, pa wrangler na deployu sam stvori proxied DNS zapis +
edge certifikat.

> Account: `7dc7167b7e2e00923bfa7cd697df14e4` (isti kao ostali domovina.* servisi).

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

## Nakon deploya

- Admin: `https://firme.domovina.ai/admin` (Basic Auth).
- Napuni produkciju s lokalnog stroja (bridge gađa produkciju):

  ```bash
  # iz root foldera projekta
  WORKER_URL=https://firme.domovina.ai INGEST_KEY=<prod-key> npm run bridge:seed -- --all
  WORKER_URL=https://firme.domovina.ai INGEST_KEY=<prod-key> npm run bridge:enrich -- --limit 50
  ```

## Napomene

- **Worker ne scrapea u produkciji.** Firecrawl obrada ostaje lokalna (bridge);
  Worker samo prima rezultate i poslužuje grid/API. Time izbjegavamo Firecrawl
  ključeve i duge zahtjeve na rubu.
- Ako kasnije želimo obradu i u oblaku: dodati Cloudflare **Queue** + consumer
  koji zove službene API-je (sudreg-data.gov.hr) umjesto scrapea (vidi
  `docs/02-izvori-podataka.md`).
- Custom domain (ne plain route) je nužan jer je poddomena nova; bonus: nije pod
  Cloudflare Access app-om pa je javno dostupna odmah, a auth radi sam Worker.
