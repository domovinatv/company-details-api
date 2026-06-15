/**
 * A "source" enriches a CompanyInput from one public Croatian registry/portal.
 * Each returns a partial enrichment plus the raw payload for audit. Sources are
 * intentionally independent and best-effort: a failure in one is a warning, not
 * a fatal error, and the pipeline merges whatever came back.
 */
import type { FirecrawlClient } from "../firecrawl.ts";
import type { CompanyInput, EntityKind, SourceName, SizeMetrics } from "../types.ts";

export interface SourceResult {
  source: SourceName;
  /** URL the data was scraped from, when applicable. */
  url?: string;
  name?: string;
  address?: string;
  mbs?: string;
  foundedYear?: number;
  director?: string;
  directorRole?: string;
  nkd?: string;
  kind?: EntityKind;
  /** Size indicators this source could provide. */
  metrics?: SizeMetrics;
  /** Raw payload (parsed JSON / extracted object) for debugging. */
  raw?: unknown;
  /** Non-fatal issues. */
  warnings?: string[];
}

export interface Source {
  name: SourceName;
  /** True if this source is relevant for the (possibly unknown) entity kind. */
  appliesTo(kind: EntityKind): boolean;
  enrich(fc: FirecrawlClient, input: CompanyInput): Promise<SourceResult>;
}

export { companywall } from "./companywall.ts";
export { sudreg } from "./sudreg.ts";
export { finaRgfi } from "./fina_rgfi.ts";
export { udruge } from "./udruge.ts";
