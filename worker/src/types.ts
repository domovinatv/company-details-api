export interface Env {
  DB: D1Database;
  // vars
  SITE_BASE?: string;
  // secrets
  ADMIN_USER?: string;
  ADMIN_PASS?: string;
  INGEST_KEY?: string;
}

export type EntityKind =
  | "trgovacko_drustvo"
  | "obrt"
  | "udruga"
  | "ustanova"
  | "nepoznato";

export type SizeClass = "mikro" | "mali" | "srednji" | "veliki";
export type Status = "pending" | "enriched" | "failed";

/** Row shape in D1. */
export interface CompanyRow {
  oib: string;
  name: string | null;
  legal_form: string | null;
  kind: EntityKind;
  status: Status;
  legal_status: string | null;
  legal_status_raw: string | null;
  size: SizeClass | null;
  size_official: number;
  confidence: string | null;
  total_assets: number | null;
  revenue: number | null;
  employees: number | null;
  has_employees: number | null;
  metrics_year: number | null;
  metrics_source: string | null;
  address: string | null;
  mbs: string | null;
  founded_year: number | null;
  director: string | null;
  director_role: string | null;
  nkd: string | null;
  source_url: string | null;
  notes: string | null;
  raw: string | null;
  created_at: number;
  updated_at: number;
  enriched_at: number | null;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  key_hash: string;
  enabled: number;
  calls: number;
  created_at: number;
  last_used_at: number | null;
}

/** Payload the bridge POSTs to /api/ingest (a batch of these). */
export interface IngestRecord {
  oib: string;
  name?: string;
  legal_form?: string;
  kind?: EntityKind;
  status?: Status;
  legal_status?: string | null;
  legal_status_raw?: string | null;
  size?: SizeClass | null;
  size_official?: boolean;
  confidence?: string;
  total_assets?: number | null;
  revenue?: number | null;
  employees?: number | null;
  has_employees?: boolean | null;
  metrics_year?: number | null;
  metrics_source?: string | null;
  address?: string | null;
  mbs?: string | null;
  founded_year?: number | null;
  director?: string | null;
  director_role?: string | null;
  nkd?: string | null;
  source_url?: string | null;
  notes?: string[];
  raw?: unknown;
}
