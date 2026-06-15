# Izvori podataka

Svi izvori ključani su na **OIB** (11 znamenki). Svaki izvor je *best-effort*:
greška u jednom je upozorenje, ne fatalna greška, a pipeline spaja što god je
stiglo. Spajanje je per-polje, po prioritetu izvora.

## Izvori

| Izvor | Modul | Krediti | Daje | Pouzdanost |
|-------|-------|---------|------|-----------|
| **FINA info.BIZ** (infobiz.fina.hr) | `src/sources/infobiz.ts` | **NE** (fetch) | **službena veličina (Veličina), pravni status**, MBS, NKD, adresa, oblik, zastupnici | **primarni** — službena oznaka, OIB-keyed, besplatno |
| **companywall.hr** | `src/sources/companywall.ts` | da | naziv, OIB, MBS, adresa, direktor, NKD, veličina, zaposleni, aktiva/prihod | dobra agregacija; financije iz FINA-e |
| **Sudski registar** (sudreg.pravosudje.hr) | `src/sources/sudreg.ts` | da | službeni identitet: naziv, MBS, sjedište, uprava, upis | autoritativno za identitet; nema financija |
| **FINA RGFI** (rgfi.fina.hr javna objava) | `src/sources/fina_rgfi.ts` | da | ukupna aktiva, prihod, zaposleni iz GFI-POD | autoritativno za financije; UI je JSF pa scrape nije pouzdan |
| **Registar udruga / RNO** | `src/sources/udruge.ts` | da | identitet udruge + zaposleni / rashodi za zaposlene | za udruge |

`bridge:enrich` po defaultu koristi samo **besplatne** izvore (info.BIZ). `--firecrawl`
uključuje i scrapere koji troše kredite. Vidi [`docs/04-bolji-izvori.md`](04-bolji-izvori.md).

### info.BIZ — kako radi

OIB → URL profila rješava se iz XML sitemapova (`subjects-sitemap-{0..7}.xml`,
~319k subjekata) jer je tražilica reCAPTCHA-gated. Index se gradi jednom i
cacheira u `data/cache/infobiz/oib-index.tsv`. Profil daje **službenu veličinu**
i **pravni status** bez logina (sirovi iznosi aktiva/prihod su iza logina).
Coverage je djelomičan (veći/registrirani subjekti) — što info.BIZ ne pokrije,
nadopunjuje se Firecrawl izvorima.

### Prioritet spajanja

- **Veličina**: **službena** `fina_infobiz` (override) → izračun iz `fina_rgfi` → `companywall`
- **Pravni status**: `fina_infobiz` → `sudreg_api` → `sudreg` → `companywall`
- **Identitet** (naziv/adresa/MBS/direktor): `sudreg_api` → `fina_infobiz` → `sudreg` → `companywall` → `rno`
- **Financije** (aktiva/prihod/zaposleni): `fina_rgfi` → `companywall` → `rno`

Kad postoji **službena oznaka veličine** (info.BIZ), ona pobjeđuje izračunatu;
ako se razlikuju, razlika se bilježi u `notes`.

> Napomena iz lokalnog testa: FINA RGFI javna objava često vrati prazne (0)
> iznose kroz scrape, pa stvarne brojke u praksi dolaze s **companywall.hr**
> (koji ih preuzima iz FINA-e). Zato je `fina_rgfi` prvi po prioritetu, ali
> 0-iznosi se odbacuju i propušta se companywall vrijednost.

## Preporučena nadogradnja — službeni API-ji

Scraping je Phase-1 rješenje. Za Phase 2 prelazimo na službene API-je gdje
postoje (vidi i izvještaj istraživanja u `docs/03-bolji-izvori.md` kad bude
dovršen):

- **Sudski registar — otvoreni podaci REST API**
  (`https://sudreg-data.gov.hr/api/javni`) — dohvat subjekta po OIB-u, JSON,
  službeno. Zamjena za `sudreg.ts` scraper.
- **FINA RGFI** — provjeriti programatski pristup godišnjim financijskim
  izvještajima (aktiva/prihod/zaposleni) po OIB-u.
- **data.gov.hr** — registar poslovnih subjekata, registar udruga, Registar
  neprofitnih organizacija (RNO), GFI neprofitnih organizacija.

## Zaštita privatnosti

Ulazni CSV (`data/input/pravne-osobe.csv`) sadrži **osobne podatke** (e-mail,
telefon, IBAN, imena zastupnika) i **nikad se ne commita** (gitignored). Pipeline
koristi samo **OIB + naziv + pravni oblik**. U bazu/grid ide samo javno dostupna
poslovna informacija o subjektu.
