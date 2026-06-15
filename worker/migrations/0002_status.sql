-- Pravni status subjekta + oznaka je li veličina iz službenog izvora.
--
-- legal_status: aktivan | brisan | likvidacija | stecaj | predstecaj | blokada | nepoznato
-- legal_status_raw: izvorni tekst (npr. "U likvidaciji")
-- size_official: 1 ako je veličina službena oznaka (FINA info.BIZ "Veličina"),
--                0 ako je izračunata iz pokazatelja.

ALTER TABLE companies ADD COLUMN legal_status     TEXT;
ALTER TABLE companies ADD COLUMN legal_status_raw TEXT;
ALTER TABLE companies ADD COLUMN size_official    INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_companies_legal_status ON companies(legal_status);
