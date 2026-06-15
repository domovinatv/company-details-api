/**
 * Orchestration: take one entity, run every applicable source, merge the
 * results into a single auditable CompanyRecord, then classify it.
 *
 * Merge precedence is per-field and provenance-aware:
 *   - identity (name/address/mbs/director/...): official registry first
 *       sudreg > companywall > rno
 *   - size metrics: the authoritative financial register first
 *       fina_rgfi > companywall   (poduzetnici)
 *       rno       > companywall   (udruge — employee count)
 */
import type { FirecrawlClient } from "./firecrawl.ts";
import { classifyRecord } from "./classify.ts";
import { infobiz, companywall, sudreg, finaRgfi, udruge } from "./sources/index.ts";
import type { Source, SourceResult } from "./sources/index.ts";
import type {
  CompanyInput,
  CompanyRecord,
  EntityKind,
  SizeClass,
  SizeMetrics,
  SizeResult,
  SourceName,
  Sourced,
} from "./types.ts";

// Order matters only as a stable default; appliesTo + mode filter the real set.
const ALL_SOURCES: Source[] = [infobiz, sudreg, companywall, finaRgfi, udruge];

const IDENTITY_PRIORITY: SourceName[] = ["sudreg_api", "fina_infobiz", "sudreg", "companywall", "rno", "fina_rgfi"];
const METRICS_PRIORITY: SourceName[] = ["fina_rgfi", "companywall", "rno"];
const STATUS_PRIORITY: SourceName[] = ["fina_infobiz", "sudreg_api", "sudreg", "companywall", "rno"];
const OFFICIAL_SIZE_PRIORITY: SourceName[] = ["fina_infobiz"];

function pickSourced<T>(
  results: SourceResult[],
  priority: SourceName[],
  get: (r: SourceResult) => T | undefined,
): Sourced<T> | undefined {
  for (const src of priority) {
    const r = results.find((x) => x.source === src && get(x) != null);
    if (r) return { value: get(r) as T, source: r.source, url: r.url };
  }
  return undefined;
}

/** Merge size metrics field-by-field, honouring source priority per field. */
function mergeMetrics(results: SourceResult[]): { metrics: SizeMetrics; source?: SourceName } {
  const fields: (keyof SizeMetrics)[] = ["totalAssets", "revenue", "employees", "year"];
  const metrics: SizeMetrics = {};
  let primary: SourceName | undefined;
  for (const f of fields) {
    for (const src of METRICS_PRIORITY) {
      const r = results.find((x) => x.source === src && x.metrics?.[f] != null);
      if (r) {
        (metrics[f] as number | undefined) = r.metrics![f];
        // The source of the first financial figure defines the headline provenance.
        if (primary === undefined && (f === "totalAssets" || f === "revenue" || f === "employees")) {
          primary = r.source;
        }
        break;
      }
    }
  }
  return { metrics, source: primary };
}

function refineKind(seed: EntityKind, results: SourceResult[]): EntityKind {
  // A source that positively identifies the legal form overrides an unknown seed.
  const fromSource = results.map((r) => r.kind).find((k) => k && k !== "nepoznato");
  if (seed !== "nepoznato") return seed;
  return fromSource ?? "nepoznato";
}

export type SourceMode = "free" | "all" | "fallback";

export interface EnrichOptions {
  /** Pre-seeded entity kind (from the CSV legal_form), narrows which sources run. */
  seedKind?: EntityKind;
  /**
   * "free"     — only no-credit sources (info.BIZ, official APIs)
   * "all"      — free + Firecrawl always
   * "fallback" — free first; spend Firecrawl ONLY when free didn't suffice
   */
  mode?: SourceMode;
}

/** True when the free sources already produced enough to classify this entity,
 *  so we can skip the credit-consuming Firecrawl scrapers. */
function freeResultSatisfies(kind: EntityKind, results: SourceResult[]): boolean {
  if (results.some((r) => r.officialSize)) return true;
  if (kind === "udruga" || kind === "ustanova") {
    return results.some((r) => r.metrics?.employees != null);
  }
  const fields = new Set<string>();
  for (const r of results) {
    if (r.metrics?.totalAssets != null) fields.add("assets");
    if (r.metrics?.revenue != null) fields.add("revenue");
    if (r.metrics?.employees != null) fields.add("employees");
  }
  return fields.size >= 2;
}

/** Run all applicable sources for one entity and assemble its record. */
export async function enrichOne(
  fc: FirecrawlClient | null,
  input: CompanyInput,
  opts: EnrichOptions = {},
): Promise<CompanyRecord> {
  const seedKind = opts.seedKind ?? "nepoznato";
  const mode = opts.mode ?? (fc ? "fallback" : "free");
  const results: SourceResult[] = [];
  const warnings: string[] = [];

  const runSource = async (source: Source) => {
    if (!source.appliesTo(seedKind)) return;
    if (source.requiresFirecrawl && !fc) return;
    try {
      results.push(await source.enrich(fc, input));
    } catch (err) {
      warnings.push(`${source.name}: ${(err as Error).message}`);
    }
  };

  // Free (no-credit) sources first.
  for (const source of ALL_SOURCES.filter((s) => !s.requiresFirecrawl)) await runSource(source);

  // Decide whether to spend Firecrawl credits.
  const runFirecrawl =
    fc != null && (mode === "all" || (mode === "fallback" && !freeResultSatisfies(seedKind, results)));
  if (runFirecrawl) {
    for (const source of ALL_SOURCES.filter((s) => s.requiresFirecrawl)) await runSource(source);
  }

  for (const r of results) if (r.warnings) warnings.push(...r.warnings);

  const kind = refineKind(seedKind, results);
  const { metrics, source: metricsSource } = mergeMetrics(results);
  const officialSize = pickSourced<SizeClass>(results, OFFICIAL_SIZE_PRIORITY, (r) => r.officialSize);
  const status = pickSourced(results, STATUS_PRIORITY, (r) => r.status);
  const statusRaw = results.find((r) => STATUS_PRIORITY.includes(r.source) && r.statusRaw)?.statusRaw;

  const raw: Partial<Record<SourceName, unknown>> = {};
  for (const r of results) if (r.raw !== undefined) raw[r.source] = r.raw;

  return {
    input,
    oib: input.oib,
    kind,
    name: pickSourced(results, IDENTITY_PRIORITY, (r) => r.name) ?? (input.name ? { value: input.name, source: "fina_infobiz" } : undefined),
    address: pickSourced(results, IDENTITY_PRIORITY, (r) => r.address),
    mbs: pickSourced(results, IDENTITY_PRIORITY, (r) => r.mbs),
    foundedYear: pickSourced(results, IDENTITY_PRIORITY, (r) => r.foundedYear),
    director: pickSourced(results, IDENTITY_PRIORITY, (r) => r.director),
    directorRole: pickSourced(results, IDENTITY_PRIORITY, (r) => r.directorRole),
    nkd: pickSourced(results, IDENTITY_PRIORITY, (r) => r.nkd),
    status,
    statusRaw,
    officialSize,
    metrics,
    metricsSource,
    raw,
    warnings,
  };
}

/** Full pipeline for one entity: enrich + classify. */
export async function processOne(
  fc: FirecrawlClient | null,
  input: CompanyInput,
  opts: EnrichOptions = {},
): Promise<{ record: CompanyRecord; result: SizeResult }> {
  const record = await enrichOne(fc, input, opts);
  return { record, result: classifyRecord(record) };
}
