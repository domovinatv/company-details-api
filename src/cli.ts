/**
 * Phase-1 local CLI.
 *
 *   npm run classify -- [options]
 *
 * Options:
 *   --input <path>   CSV to read (default: data/input/pravne-osobe.csv)
 *   --oib <oib>      classify a single OIB (ignores --input); repeatable
 *   --limit <n>      process at most n entities (default: 10 — guards credits)
 *   --all            process the whole input (overrides --limit)
 *   --out <path>     write results JSON (default: data/output/results.json)
 *   --no-cache       bypass the on-disk Firecrawl cache
 *
 * Reads FIRECRAWL_API_KEYS from .env. Every Firecrawl response is cached under
 * data/cache/ so re-runs are free.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import "dotenv/config";

import { FirecrawlClient } from "./firecrawl.ts";
import { FsCache, NullCache } from "./cache.ts";
import { loadSeed } from "./csv.ts";
import { processOne } from "./pipeline.ts";
import type { SeedRow } from "./csv.ts";
import type { SizeResult } from "./types.ts";

interface Args {
  input: string;
  oibs: string[];
  limit: number;
  all: boolean;
  out: string;
  cache: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    input: "data/input/pravne-osobe.csv",
    oibs: [],
    limit: 10,
    all: false,
    out: "data/output/results.json",
    cache: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--input": a.input = argv[++i]!; break;
      case "--oib": a.oibs.push(argv[++i]!.replace(/\D/g, "")); break;
      case "--limit": a.limit = Number(argv[++i]); break;
      case "--all": a.all = true; break;
      case "--out": a.out = argv[++i]!; break;
      case "--no-cache": a.cache = false; break;
      default:
        if (arg?.startsWith("--")) throw new Error(`nepoznata opcija: ${arg}`);
    }
  }
  return a;
}

function fmtEur(n?: number): string {
  return n == null ? "—" : `${Math.round(n).toLocaleString("hr-HR")} €`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let seed: SeedRow[];
  if (args.oibs.length > 0) {
    seed = args.oibs.map((oib) => ({ oib, kind: "nepoznato" as const, legalForm: "" }));
  } else {
    seed = await loadSeed(resolve(args.input));
    console.log(`Učitano ${seed.length} subjekata iz ${args.input}`);
  }

  if (seed.length === 0) {
    console.error("Nema subjekata za obradu.");
    process.exit(1);
  }

  const batch = args.all ? seed : seed.slice(0, args.limit);
  if (!args.all && seed.length > batch.length) {
    console.log(
      `Obrađujem prvih ${batch.length} (od ${seed.length}). Koristi --all za sve ili --limit N.`,
    );
  }

  const fc = new FirecrawlClient({
    cache: args.cache ? new FsCache(resolve("data/cache")) : new NullCache(),
  });

  // Pick a funded key up-front so we don't waste retries on 402s.
  const keyIdx = await fc.selectFundedKey(50);
  if (keyIdx < 0) {
    console.error("Nijedan Firecrawl ključ nema dovoljno kredita (>50). Provjeri .env.");
    process.exit(1);
  }

  const results: SizeResult[] = [];
  let n = 0;
  for (const row of batch) {
    n++;
    const label = row.name ?? row.oib;
    process.stdout.write(`[${n}/${batch.length}] ${label} (${row.kind}) … `);
    try {
      const { result } = await processOne(fc, { oib: row.oib, name: row.name }, { seedKind: row.kind });
      results.push(result);
      const sizeStr = result.size ?? (result.kind === "udruga" ? `udruga(zap:${result.employees ?? "?"})` : "—");
      console.log(`${sizeStr}  [aktiva ${fmtEur(result.metrics.totalAssets)}, prihod ${fmtEur(result.metrics.revenue)}, zap ${result.metrics.employees ?? "—"}]`);
    } catch (err) {
      console.log(`GREŠKA: ${(err as Error).message}`);
      results.push({
        oib: row.oib, name: row.name, kind: row.kind, size: null,
        metrics: {}, basis: [], confidence: "none", notes: [(err as Error).message],
      });
    }
  }

  await mkdir(dirname(resolve(args.out)), { recursive: true });
  await writeFile(resolve(args.out), JSON.stringify(results, null, 2), "utf8");

  // Summary
  const counts: Record<string, number> = {};
  for (const r of results) {
    const k = r.size ?? (r.kind === "udruga" ? "udruga" : "nerazvrstano");
    counts[k] = (counts[k] ?? 0) + 1;
  }
  console.log("\n── Sažetak ──");
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(14)} ${v}`);
  }
  console.log(`\nFirecrawl krediti potrošeni: ${fc.creditsUsed}`);
  console.log(`Rezultati zapisani u ${args.out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
