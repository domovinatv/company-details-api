# Bolji / pouzdaniji izvori — istraživanje

Ključni nalaz: podaci se dijele na **dva sloja** i **nijedan izvor ne pokriva
oba**:

- **Identitet / registracija** (naziv, adresa, NKD, pravni oblik, status,
  temeljni kapital) → pokriveno **besplatnim službenim REST API-jem**
  (sudreg-data.gov.hr) i besplatnim open-data dumpovima.
- **Pokazatelji veličine** (ukupna aktiva, prihod, zaposleni, kategorija) →
  **nema besplatnog službenog API-ja.** Žive samo u FINA RGFI, koja **nema API**.
  Ovo je stvarno teški dio i nijedan državni JSON endpoint ga ne zamjenjuje.

## Što dodati / promijeniti

### 1. Sudski registar — službeni API ✅ (zamijeni scraper)
- Base: `https://sudreg-data.gov.hr/api/javni` · OpenAPI:
  `…/dokumentacija/open_api` · registracija na `sudreg-data.gov.hr`
- **Besplatno**, **OAuth2 Client Credentials v3** (POST na `/api/oauth/token`,
  Bearer vrijedi 6 h). Stari `Ocp-Apim-Subscription-Key` se **gasi** — koristi v3.
- Ključni poziv (OIB-keyed):
  `GET /detalji_subjekta?tip_identifikatora=oib&identifikator={oib}&expand_relations=true`
- Vraća **samo identitet** (naziv, adresa, NKD, oblik, status, `temeljni_kapitali`).
  **Nema financija/zaposlenih.** Uprava/osnivači GDPR-gated.
- `GET /gfi` → **indeks** koji GFI izvještaji postoje za subjekt (godina, vrsta) —
  ne i iznosi.
- ⚠️ OIB/MBS se vraćaju kao brojevi bez vodećih nula → padaj na 11/9 znamenki.

### 2. FINA financije — info.BIZ javne stranice ✅ (najbolji scrape cilj)
- **FINA nema REST API** za financije (potvrđeno; jedini FINA API je e-Račun).
- **info.BIZ javni profili** (`infobiz.fina.hr/tvrtka/{slug}/OIB-{oib}`) bez logina
  izlažu **prihod, neto dobit, broj zaposlenih i EKSPLICITNU kategoriju veličine
  (Mikro/Mali/Srednji/Veliki)** — keyed po OIB-u. Aktiva je gated.
  → **vjerojatno pouzdaniji od companywall.hr** i daje nam **službenu oznaku
  veličine za double-check** naše izračunate klasifikacije.
- RGFI Javna objava CSV (besplatno, **samo mikro/mali**) za punu bilancu interno;
  licenca zabranjuje redistribuciju.
- Pravi API = plaćeni **CompanyWall WebAPI** (FINA-izvor, JSON, OIB) ili D&B.

### 3. GLEIF API ✅ (besplatna validacija identiteta)
- `api.gleif.org` — besplatno, bez ključa, REST/JSON. Most **LEI ↔ nacionalni
  matični broj** (`registeredAt.id = RA000156` = HR sudski registar). Samo za
  subjekte koji imaju LEI (uglavnom oni s obvezama na fin. tržištu).

### 4. Udruge — data.gov.hr `registar-udruga` ✅ (zamijeni scraper)
- Dnevno ažuriran, **besplatan, Open License, CSV/JSON/XML, OIB-keyed**. Tri
  tablice spojene na `UDR_ID`. **Nema zaposlenih/financija.**
- **Zaposleni u udrugama = stvarni jaz.** Postoje samo u neprofitnim GFI
  (BIL-NPF / PR-RAS-NPF) kod FINA-e — **bez API-ja/open-data**, ručni zahtjev
  ~1,35 €/str. info.BIZ ima i javne profile neprofitnih → scrape best-effort.

## Što ostaviti kao fallback / odbaciti
- **Fallback:** companywall.hr, FINA RGFI/info.BIZ HTML, RNO CSV (banovac.mfin.hr).
- **Odbaci:** Porezna (samo status PDV-a, bez API-ja), DZS (samo agregati),
  OpenCorporates i North Data (nemaju HR financije), BRIS (bez API-ja).
  Analitika.hr / Solventi.hr — **ne postoje** kao stvarni provideri.

## Preporuka (rangirano)

**Tvrtke:** (1) **sudreg API** kao autoritativni identitet (zamijeni HTML scrape),
(2) **info.BIZ javne stranice** za prihod+zaposlene+**službenu kategoriju veličine**
(double-check naše klasifikacije), (3) **GLEIF** za besplatnu validaciju.

**Udruge:** (1) **data.gov.hr registar-udruga** za identitet, (2) zaposleni ostaju
best-effort scrape (info.BIZ neprofitni profili) — nema čistog službenog puta.

**Neto promjena pipelinea:** dva HTML scrapea (sudreg, registar udruga) → službeni
besplatni feedovi s OIB-om; dodati GLEIF; financije/veličina ostaju scrape (najbolji
cilj: **FINA info.BIZ javni OIB profili**, koji usput daju i službenu oznaku veličine).
