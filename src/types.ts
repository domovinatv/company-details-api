/**
 * Shared domain types for the company-details pipeline.
 *
 * Pipeline shape:
 *   CompanyInput  -> (sources enrich) -> CompanyRecord -> (classify) -> SizeResult
 */

/** What the caller hands us. OIB is the primary, unambiguous key. */
export interface CompanyInput {
  /** 11-digit Croatian OIB (personal/entity identification number). Primary key. */
  oib: string;
  /** Optional human-readable name — used as a search hint / sanity check only. */
  name?: string;
}

/** Legal form bucket — classification by Zakon o računovodstvu applies to
 *  poduzetnici (trgovačka društva, obrti i sl.); udruge are reported separately. */
export type EntityKind =
  | "trgovacko_drustvo" // d.o.o., j.d.o.o., d.d., s.d.d. ...
  | "obrt"
  | "udruga"
  | "ustanova"
  | "nepoznato";

/** Croatian enterprise size class (Zakon o računovodstvu, NN 85/24, čl. 5). */
export type SizeClass = "mikro" | "mali" | "srednji" | "veliki";

/** The three financial/size indicators used by the law. All in EUR / headcount. */
export interface SizeMetrics {
  /** Ukupna aktiva (total assets), EUR — from FINA RGFI balance sheet. */
  totalAssets?: number;
  /** Prihod / neto prihod (net revenue), EUR — from FINA RGFI P&L. */
  revenue?: number;
  /** Prosječan broj zaposlenih tijekom poslovne godine. */
  employees?: number;
  /** Fiscal year the metrics belong to. */
  year?: number;
}

/** One enriched field with provenance, so the output is auditable. */
export interface Sourced<T> {
  value: T;
  /** Which source produced this value. */
  source: SourceName;
  /** URL the value was scraped from, when applicable. */
  url?: string;
}

export type SourceName =
  | "fina_infobiz"
  | "companywall"
  | "sudreg"
  | "sudreg_api"
  | "fina_rgfi"
  | "fina_neprofitne"
  | "rno";

/** Aggregated record after all sources have run. */
export interface CompanyRecord {
  input: CompanyInput;
  oib: string;
  kind: EntityKind;

  name?: Sourced<string>;
  address?: Sourced<string>;
  /** Matični broj subjekta (MBS) iz sudskog registra. */
  mbs?: Sourced<string>;
  foundedYear?: Sourced<number>;
  director?: Sourced<string>;
  directorRole?: Sourced<string>;
  nkd?: Sourced<string>; // šifra/naziv djelatnosti (NKD 2007)

  /** Pravni status: aktivan|brisan|likvidacija|stecaj|predstecaj|blokada|… */
  status?: Sourced<string>;
  /** Raw status label as published (e.g. "U likvidaciji"). */
  statusRaw?: string;

  /** Authoritative, pre-computed size class (FINA info.BIZ) when available. */
  officialSize?: Sourced<SizeClass>;

  /** Size indicators with provenance — best available across sources. */
  metrics: SizeMetrics;
  metricsSource?: SourceName;

  /** Raw per-source payloads, keyed by source, for debugging/audit. */
  raw: Partial<Record<SourceName, unknown>>;
  /** Non-fatal problems encountered while enriching this entity. */
  warnings: string[];
}

/** Final classification output for one entity. */
export interface SizeResult {
  oib: string;
  name?: string;
  kind: EntityKind;
  /** null for udruge / when there isn't enough data to classify. */
  size: SizeClass | null;
  /** True when `size` came from an official label (FINA info.BIZ), not computed. */
  sizeOfficial?: boolean;
  /** Pravni status (aktivan|brisan|likvidacija|stecaj|…). */
  status?: string;
  statusRaw?: string;
  metrics: SizeMetrics;
  /** Which criteria (assets/revenue/employees) were actually available. */
  basis: ("assets" | "revenue" | "employees")[];
  /** "high" when ≥2 criteria present, "low" when classifying on a single metric. */
  confidence: "high" | "low" | "none";
  /** For udruge: does it employ anyone, and how many. */
  hasEmployees?: boolean;
  employees?: number;
  source?: SourceName;
  notes: string[];
}
