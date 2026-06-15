-- API ključevi za vanjske potrošače (npr. zef.hr) koji čitaju klasificirane
-- podatke kroz /api/v1/*. Pohranjuje se SAMO SHA-256 hash sirovog ključa —
-- sirovi ključ se pokaže jednom pri kreiranju.
--
-- Razlika od INGEST_KEY: INGEST_KEY (secret) je za interni bridge koji PIŠE
-- (/api/ingest, /api/classify). API ključevi su za vanjske klijente koji ČITAJU
-- (/api/v1/companies). Mogu se kreirati/ugasiti iz admina bez redeploya.

CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,                  -- uuid
  name         TEXT NOT NULL,                     -- npr. "zef.hr"
  key_hash     TEXT NOT NULL UNIQUE,              -- SHA-256 sirovog ključa
  enabled      INTEGER NOT NULL DEFAULT 1,        -- 0/1
  calls        INTEGER NOT NULL DEFAULT 0,        -- brojač poziva
  created_at   INTEGER NOT NULL,                  -- unix sekunde
  last_used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
