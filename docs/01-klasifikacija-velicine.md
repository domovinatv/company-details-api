# Klasifikacija veličine poduzetnika

Razvrstavanje provodi `src/classify.ts` prema **Zakonu o računovodstvu
(NN 85/24), članak 5.**, na snazi od **27.7.2024.**

Poduzetnik se razvrstava prema tome **ne prelazi li granične pokazatelje u dva
od tri uvjeta**: ukupna aktiva, prihod, prosječan broj zaposlenih tijekom
poslovne godine.

| Kategorija  | Ukupna aktiva | Prihod        | Zaposleni |
|-------------|---------------|---------------|-----------|
| **mikro**   | ≤ 450.000 €   | ≤ 900.000 €   | ≤ 10      |
| **mali**    | ≤ 5.000.000 € | ≤ 10.000.000 €| ≤ 50      |
| **srednji** | ≤ 25.000.000 €| ≤ 50.000.000 €| ≤ 250     |
| **veliki**  | prelazi 2 od 3 granična pokazatelja za srednje poduzetnike    |

Algoritam (`classifySize`):

1. ako **ne** prelazi 2/3 mikro pragova → **mikro**
2. inače ako **ne** prelazi 2/3 malih pragova → **mali**
3. inače ako **ne** prelazi 2/3 srednjih pragova → **srednji**
4. inače → **veliki**

## Nepotpuni podaci

Zakon traži 2 od 3 pokazatelja. Kad imamo manje:

- **2+ pokazatelja** → `confidence: "high"`
- **1 pokazatelj** → `confidence: "low"` (razvrstavanje indikativno, u gridu se
  označava `!`)
- **0 pokazatelja** → `size: null`, `confidence: "none"` (status ostaje
  *nerazvrstano* dok ne stigne barem jedan pokazatelj)

Iznos **0 € aktive/prihoda se tretira kao „nije pronađeno"** (ne kao stvarna
nula), jer ekstraktor prazna numerička polja zna popuniti nulom — inače bi
subjekt bez podataka lažno ispao „mikro".

## Udruge i ustanove

Udruge/neprofitne organizacije i ustanove **ne razvrstavaju se** po ovom zakonu
(on se odnosi na poduzetnike). Za njih pratimo samo **ima li zaposlenih i
koliko** (`hasEmployees`, `employees`).

## Izvori

- Zakon o računovodstvu (NN 85/24): <https://www.zakon.hr/z/118/zakon-o-racunovodstvu>
- Uputa o primjeni novoga Zakona o računovodstvu (MFIN):
  <https://mfin.gov.hr/vijesti/uputa-o-primjeni-novoga-zakona-o-racunovodstvu/3732>
