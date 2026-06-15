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
import { companywall, sudreg, finaRgfi, udruge } from "./sources/index.ts";
import type { Source, SourceResult } from "./sources/index.ts";
import type {
  CompanyInput,
  CompanyRecord,
  EntityKind,
  SizeMetrics,
  SizeResult,
  SourceName,
  Sourced,
} from "./types.ts";

const ALL_SOURCES: Source[] = [sudreg, companywall, finaRgfi, udruge];

const IDENTITY_PRIORITY: SourceName[] = ["sudreg", "companywall", "rno", "fina_rgfi"];
const METRICS_PRIORITY: SourceName[] = ["fina_rgfi", "companywall", "rno"];

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

export interface EnrichOptions {
  /** Pre-seeded entity kind (from the CSV legal_form), narrows which sources run. */
  seedKind?: EntityKind;
}

/** Run all applicable sources for one entity and assemble its record. */
export async function enrichOne(
  fc: FirecrawlClient,
  input: CompanyInput,
  opts: EnrichOptions = {},
): Promise<CompanyRecord> {
  const seedKind = opts.seedKind ?? "nepoznato";
  const results: SourceResult[] = [];
  const warnings: string[] = [];

  for (const source of ALL_SOURCES) {
    if (!source.appliesTo(seedKind)) continue;
    try {
      results.push(await source.enrich(fc, input));
    } catch (err) {
      warnings.push(`${source.name}: ${(err as Error).message}`);
    }
  }

  for (const r of results) if (r.warnings) warnings.push(...r.warnings);

  const kind = refineKind(seedKind, results);
  const { metrics, source: metricsSource } = mergeMetrics(results);

  const raw: Partial<Record<SourceName, unknown>> = {};
  for (const r of results) if (r.raw !== undefined) raw[r.source] = r.raw;

  return {
    input,
    oib: input.oib,
    kind,
    name: pickSourced(results, IDENTITY_PRIORITY, (r) => r.name) ?? (input.name ? { value: input.name, source: "companywall" } : undefined),
    address: pickSourced(results, IDENTITY_PRIORITY, (r) => r.address),
    mbs: pickSourced(results, IDENTITY_PRIORITY, (r) => r.mbs),
    foundedYear: pickSourced(results, IDENTITY_PRIORITY, (r) => r.foundedYear),
    director: pickSourced(results, IDENTITY_PRIORITY, (r) => r.director),
    directorRole: pickSourced(results, IDENTITY_PRIORITY, (r) => r.directorRole),
    nkd: pickSourced(results, IDENTITY_PRIORITY, (r) => r.nkd),
    metrics,
    metricsSource,
    raw,
    warnings,
  };
}

/** Full pipeline for one entity: enrich + classify. */
export async function processOne(
  fc: FirecrawlClient,
  input: CompanyInput,
  opts: EnrichOptions = {},
): Promise<{ record: CompanyRecord; result: SizeResult }> {
  const record = await enrichOne(fc, input, opts);
  return { record, result: classifyRecord(record) };
}
