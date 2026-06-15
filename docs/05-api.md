# Javni API (v1) — za vanjske potrošače

Vanjski sustavi (npr. **zef.hr**) predaju listu OIB-ova i dohvaćaju klasificirane
podatke za import u vlastitu bazu. Autentikacija ide **API ključem** (`cdk_…`).

Base URL: `https://firme.domovina.ai`

## Autentikacija

`Authorization: Bearer <API ključ>` (ključ počinje s `cdk_`). Ključeve kreira/gasi
admin u `/admin/keys` (sirovi ključ se pokaže samo jednom; čuva se SHA-256 hash).

## `POST /api/v1/companies` — batch lookup

Body:

```json
{ "oibs": ["22820690652", "16185960876"], "enqueue": true }
```

- `oibs` — do 1000 OIB-ova po zahtjevu.
- `enqueue` (default `true`) — nepoznate OIB-ove ubaci u red (status `pending`)
  da ih buduća obrada pokupi; za njih se vrati `found:false, processing:"queued"`.

Odgovor:

```json
{
  "count": 2,
  "found": 2,
  "missing": [],
  "results": [
    {
      "found": true,
      "oib": "16185960876",
      "name": "3 E Projekti d.o.o.",
      "kind": "trgovacko_drustvo",
      "processing": "enriched",
      "size": "mali",
      "size_official": true,
      "confidence": "high",
      "legal_status": "aktivan",
      "legal_status_raw": "Aktivan",
      "employees": null,
      "has_employees": null,
      "total_assets_eur": null,
      "revenue_eur": null,
      "metrics_year": null,
      "metrics_source": "fina_infobiz",
      "nkd": "...",
      "address": "...",
      "mbs": "...",
      "founded_year": null,
      "director": "...",
      "source_url": "https://infobiz.fina.hr/...",
      "updated_at": 1781517785,
      "enriched_at": 1781517785
    }
  ]
}
```

Polja:

| polje | značenje |
|-------|----------|
| `size` | `mikro`/`mali`/`srednji`/`veliki` ili `null` (udruge i nerazvrstano) |
| `size_official` | `true` = službena FINA info.BIZ oznaka; `false` = izračunato iz pokazatelja |
| `legal_status` | `aktivan`/`brisan`/`likvidacija`/`stecaj`/`predstecaj`/`blokada` |
| `processing` | `enriched` (obrađeno) / `pending` (u redu) / `failed` |
| `*_eur` | iznosi u EUR (mogu biti `null` ako nisu javno dostupni) |

## `GET /api/v1/companies/:oib` — jedan subjekt

```
GET /api/v1/companies/16185960876
Authorization: Bearer cdk_…
```

## curl primjeri

Batch lookup:

```bash
curl -s -X POST "https://firme.domovina.ai/api/v1/companies" \
  -H "Authorization: Bearer cdk_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"oibs":["22820690652","16185960876"]}'
```

Jedan OIB:

```bash
curl -s "https://firme.domovina.ai/api/v1/companies/16185960876" \
  -H "Authorization: Bearer cdk_xxxxxxxx"
```

Status kodovi: `200` ok · `400` neispravan body / >1000 OIB-ova · `401` nedostaje/
neispravan ključ.
