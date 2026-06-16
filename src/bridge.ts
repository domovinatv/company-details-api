/**
 * Bridge — local Node glue between the firecrawl pipeline and the Cloudflare
 * Worker (firme.domovina.ai). Mirrors the bridge pattern in
 * pipeline.domovina.ai: heavy work runs locally, results are pushed to the
 * Worker over an authenticated ingest endpoint.
 *
 * Usage:
 *   node --experimental-strip-types src/bridge.ts seed   [--input csv] [--all|--limit N]
 *   node --experimental-strip-types src/bridge.ts enrich [--input csv] [--limit N] [--all]
 *
 *   seed    upserts identities (OIB, name, legal form, kind) as status=pending,
 *           so the admin grid is populated instantly without any scraping.
 *   enrich  runs the firecrawl pipeline + classification and upserts full
 *           results (status=enriched/failed).
 *
 * Config (env / .env / .dev.vars):
 *   WORKER_URL   base URL of the worker   (default http://localhost:8787)
 *   INGEST_KEY   Bearer token for /api/ingest
 *   FIRECRAWL_API_KEYS  (enrich only)
 */
import { resolve } from "node:path";
import "dotenv/config";

import { FirecrawlClient } from "./firecrawl.ts";
import { FsCache } from "./cache.ts";
import { loadSeed } from "./csv.ts";
import { processOne } from "./pipeline.ts";
import { warmInfobizIndex } from "./sources/infobiz.ts";
import type { SeedRow } from "./csv.ts";
import type { CompanyRecord, SizeResult } from "./types.ts";

const WORKER_URL = (process.env.WORKER_URL ?? "http://localhost:8787").replace(/\/$/, "");
const INGEST_KEY = process.env.INGEST_KEY ?? "";

interface Args {
  input: string;
  limit: number;
  all: boolean;
  firecrawl: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { input: "data/input/pravne-osobe.csv", limit: 10, all: false, firecrawl: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--input": a.input = argv[++i]!; break;
      case "--limit": a.limit = Number(argv[++i]); break;
      case "--all": a.all = true; break;
      // Also use the credit-consuming Firecrawl sources (default is free-only).
      case "--firecrawl": a.firecrawl = true; break;
    }
  }
  return a;
}

async function ingest(records: unknown[]): Promise<void> {
  if (records.length === 0) return;
  const res = await fetch(`${WORKER_URL}/api/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${INGEST_KEY}` },
    body: JSON.stringify({ records }),
  });
  if (!res.ok) {
    throw new Error(`ingest ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const j = (await res.json()) as { ok: number; failed: number };
  console.log(`  → upsert ok=${j.ok} failed=${j.failed}`);
}

function primaryUrl(rec: CompanyRecord): string | undefined {
  for (const f of [rec.name, rec.director, rec.address, rec.mbs] as const) {
    if (f?.url) return f.url;
  }
  return undefined;
}

function toIngest(seed: SeedRow, rec: CompanyRecord, result: SizeResult, status: "enriched" | "failed") {
  return {
    oib: seed.oib,
    name: rec.name?.value ?? seed.name,
    legal_form: seed.legalForm,
    kind: rec.kind,
    status: status,
    legal_status: result.status ?? null,
    legal_status_raw: result.statusRaw ?? null,
    size: result.size,
    size_official: result.sizeOfficial ?? false,
    confidence: result.confidence,
    total_assets: rec.metrics.totalAssets ?? null,
    revenue: rec.metrics.revenue ?? null,
    employees: rec.metrics.employees ?? null,
    has_employees: result.hasEmployees ?? null,
    metrics_year: rec.metrics.year ?? null,
    metrics_source: rec.metricsSource ?? null,
    address: rec.address?.value ?? null,
    mbs: rec.mbs?.value ?? null,
    founded_year: rec.foundedYear?.value ?? null,
    director: rec.director?.value ?? null,
    director_role: rec.directorRole?.value ?? null,
    nkd: rec.nkd?.value ?? null,
    source_url: primaryUrl(rec) ?? null,
    notes: result.notes,
    raw: rec,
  };
}

async function cmdSeed(args: Args) {
  const seed = await loadSeed(resolve(args.input));
  const batch = args.all ? seed : seed.slice(0, args.limit);
  console.log(`Seed: ${batch.length}/${seed.length} subjekata → ${WORKER_URL}`);
  // Chunk to keep request bodies modest.
  for (let i = 0; i < batch.length; i += 100) {
    const chunk = batch.slice(i, i + 100).map((s) => ({
      oib: s.oib,
      name: s.name,
      legal_form: s.legalForm,
      kind: s.kind,
      status: "pending" as const,
    }));
    await ingest(chunk);
  }
  console.log("Seed gotov.");
}

/** Shared: enrich a batch of seed rows and push results to the worker. */
async function runBatch(batch: SeedRow[], firecrawl: boolean) {
  // --firecrawl => "fallback": free first, spend credits only on the gaps.
  const mode: "free" | "fallback" = firecrawl ? "fallback" : "free";

  let fc: FirecrawlClient | null = null;
  if (mode === "fallback") {
    fc = new FirecrawlClient({ cache: new FsCache(resolve("data/cache")) });
    const keyIdx = await fc.selectFundedKey(50);
    if (keyIdx < 0) {
      console.error("Nijedan Firecrawl ključ nema dovoljno kredita (>50). (Bez --firecrawl ide besplatni način.)");
      process.exit(1);
    }
  } else {
    const idx = await warmInfobizIndex();
    const hit = batch.filter((r) => idx.has(r.oib)).length;
    console.log(`info.BIZ pokriva ${hit}/${batch.length} OIB-ova iz batcha.`);
  }

  console.log(`Enrich (${mode}): ${batch.length} subjekata`);
  let n = 0;
  for (const row of batch) {
    n++;
    process.stdout.write(`[${n}/${batch.length}] ${row.name ?? row.oib} … `);
    try {
      const { record, result } = await processOne(fc, { oib: row.oib, name: row.name }, { seedKind: row.kind, mode });
      const sizeStr = result.size ?? (result.kind === "udruga" ? `udruga(zap:${result.employees ?? "?"})` : "—");
      console.log(`${sizeStr}${result.sizeOfficial ? "✓" : ""} [${result.status ?? "status:?"}]`);
      await ingest([toIngest(row, record, result, "enriched")]);
    } catch (err) {
      console.log(`GREŠKA: ${(err as Error).message}`);
      await ingest([
        {
          oib: row.oib, name: row.name, legal_form: row.legalForm, kind: row.kind,
          status: "failed", notes: [(err as Error).message],
        },
      ]);
    }
  }
  if (fc) console.log(`\nFirecrawl krediti potrošeni: ${fc.creditsUsed}`);
}

async function cmdEnrich(args: Args) {
  const seed = await loadSeed(resolve(args.input));
  const batch = args.all ? seed : seed.slice(0, args.limit);
  await runBatch(batch, args.firecrawl);
}

/** Pull OIBs queued in the cloud (status=pending) — these arrived via the v1 API
 *  (e.g. zef.hr appended a list). Closes the append→analyze loop. */
async function fetchPending(max: number): Promise<SeedRow[]> {
  const out: SeedRow[] = [];
  let offset = 0;
  while (out.length < max) {
    const res = await fetch(`${WORKER_URL}/api/companies?status=pending&limit=500&offset=${offset}`);
    if (!res.ok) throw new Error(`pending fetch ${res.status}: ${(await res.text()).slice(0, 150)}`);
    const d = (await res.json()) as { companies?: Array<Record<string, unknown>>; total?: number };
    const rows = d.companies ?? [];
    for (const c of rows) {
      out.push({
        oib: String(c.oib),
        name: (c.name as string) ?? undefined,
        kind: (c.kind as SeedRow["kind"]) ?? "nepoznato",
        legalForm: (c.legal_form as string) ?? "",
      });
    }
    offset += 500;
    if (rows.length === 0 || offset >= (d.total ?? 0)) break;
  }
  return Number.isFinite(max) ? out.slice(0, max) : out;
}

async function cmdPending(args: Args) {
  const batch = await fetchPending(args.all ? Infinity : args.limit);
  if (batch.length === 0) {
    console.log(`Nema pending subjekata u cloudu (${WORKER_URL}).`);
    return;
  }
  console.log(`Pending iz ${WORKER_URL}: ${batch.length} subjekata za obradu`);
  await runBatch(batch, args.firecrawl);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (!INGEST_KEY) {
    console.error("INGEST_KEY nije postavljen (env / .env / .dev.vars).");
    process.exit(1);
  }
  switch (cmd) {
    case "seed": return cmdSeed(args);
    case "enrich": return cmdEnrich(args);
    case "pending": return cmdPending(args);
    default:
      console.error("Koristi: bridge.ts <seed|enrich|pending> [--input csv] [--limit N|--all] [--firecrawl]");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
