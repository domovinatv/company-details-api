# Izvori podataka

Svi izvori ključani su na **OIB** (11 znamenki). Svaki izvor je *best-effort*:
greška u jednom je upozorenje, ne fatalna greška, a pipeline spaja što god je
stiglo. Spajanje je per-polje, po prioritetu izvora.

## Trenutni izvori (Firecrawl scrape)

| Izvor | Modul | Daje | Pouzdanost |
|-------|-------|------|-----------|
| **companywall.hr** | `src/sources/companywall.ts` | naziv, OIB, MBS, adresa, direktor, NKD, **veličina, zaposleni, aktiva/prihod** | dobra agregacija; financije iz FINA-e |
| **Sudski registar** (sudreg.pravosudje.hr) | `src/sources/sudreg.ts` | službeni identitet: naziv, MBS, sjedište, uprava, upis | autoritativno za identitet; **nema financija** |
| **FINA RGFI** (rgfi.fina.hr javna objava) | `src/sources/fina_rgfi.ts` | **ukupna aktiva, prihod, zaposleni** iz GFI-POD | autoritativno za financije; UI je JSF/PrimeFaces pa scrape nije pouzdan |
| **Registar udruga / RNO** | `src/sources/udruge.ts` | identitet udruge + **zaposleni / rashodi za zaposlene** | za udruge |

### Prioritet spajanja

- **Identitet** (naziv/adresa/MBS/direktor): `sudreg` → `companywall` → `rno`
- **Veličina** (aktiva/prihod/zaposleni): `fina_rgfi` → `companywall` → `rno`

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
