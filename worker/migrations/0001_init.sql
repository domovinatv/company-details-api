-- company-details-api — pohrana razvrstanih hrvatskih pravnih osoba.
--
-- Jedan red = jedan subjekt (po OIB-u). Worker NE scrapea — lokalni bridge
-- (src/bridge.ts) dohvaća iz javnih izvora (companywall, sudreg, FINA RGFI,
-- registar udruga), razvrsta veličinu po Zakonu o računovodstvu (NN 85/24) i
-- upserta rezultat ovamo preko POST /api/ingest. Worker poslužuje grid + API.
--
-- status: pending   — u redu, čeka obradu (bridge još nije dohvatio)
--         enriched  — obrađeno, podaci/veličina popunjeni
--         failed    — obrada trajno pala (vidi notes)
--
-- size (samo za poduzetnike): mikro | mali | srednji | veliki | NULL
--   udruge/ustanove se NE razvrstavaju — prati se samo broj zaposlenih.

CREATE TABLE IF NOT EXISTS companies (
  oib            TEXT PRIMARY KEY,                  -- 11-znamenkasti OIB
  name           TEXT,                              -- naziv subjekta
  legal_form     TEXT,                              -- izvorni legal_form iz importa
  kind           TEXT NOT NULL DEFAULT 'nepoznato', -- trgovacko_drustvo|obrt|udruga|ustanova|nepoznato
  status         TEXT NOT NULL DEFAULT 'pending',   -- pending|enriched|failed

  size           TEXT,                              -- mikro|mali|srednji|veliki|NULL
  confidence     TEXT,                              -- high|low|none
  total_assets   REAL,                              -- ukupna aktiva, EUR
  revenue        REAL,                              -- prihod, EUR
  employees      INTEGER,                           -- prosječan broj zaposlenih
  has_employees  INTEGER,                           -- 0/1/NULL (za udruge)
  metrics_year   INTEGER,                           -- godina financijskih pokazatelja
  metrics_source TEXT,                              -- fina_rgfi|companywall|rno

  address        TEXT,
  mbs            TEXT,                              -- matični broj subjekta (sudreg)
  founded_year   INTEGER,
  director       TEXT,
  director_role  TEXT,
  nkd            TEXT,                              -- pretežita djelatnost (NKD 2007)
  source_url     TEXT,                              -- primarna poveznica izvora

  notes          TEXT,                              -- JSON niz napomena/upozorenja
  raw            TEXT,                              -- JSON cijelog zapisa (audit)

  created_at     INTEGER NOT NULL,                  -- unix sekunde
  updated_at     INTEGER NOT NULL,
  enriched_at    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_companies_status  ON companies(status);
CREATE INDEX IF NOT EXISTS idx_companies_size     ON companies(size);
CREATE INDEX IF NOT EXISTS idx_companies_kind     ON companies(kind);
CREATE INDEX IF NOT EXISTS idx_companies_updated  ON companies(updated_at DESC);
