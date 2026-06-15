/**
 * FINA info.BIZ (infobiz.fina.hr) — official, FREE, OIB-keyed source. The public
 * profile page publishes the **official enterprise size class** (Veličina:
 * Mikro/Mali/Srednji/Veliki) and the **legal status** (Aktivan / Brisan / U
 * likvidaciji / U stečaju / Blokiran …), plus MBS, NKD, address, legal form and
 * registered representatives. The raw aktiva/prihod figures are gated, but the
 * official size label is the gold standard we want — no Firecrawl, no credits.
 *
 * OIB → profile URL is resolved from the site's XML sitemaps (search is
 * reCAPTCHA-gated). We download the 8 `subjects-sitemap-{i}.xml` once, build a
 * compact OIB→URL index cached on disk, then fetch + parse each profile.
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CompanyInput, EntityKind, SizeClass } from "../types.ts";
import type { Source, SourceResult } from "./index.ts";

const BASE = "https://infobiz.fina.hr";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const SITEMAP_COUNT = 8;
const INDEX_DIR = "data/cache/infobiz";
const INDEX_FILE = join(INDEX_DIR, "oib-index.tsv");
const INDEX_MAX_AGE_MS = 14 * 24 * 3600 * 1000; // rebuild fortnightly

let indexPromise: Promise<Map<string, string>> | null = null;

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { headers: { "user-agent": UA } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.text();
}

/** Build (or load cached) OIB → profile-URL index from the info.BIZ sitemaps. */
async function buildIndex(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  // Reuse the on-disk index if fresh.
  try {
    const st = await stat(INDEX_FILE);
    if (Date.now() - st.mtimeMs < INDEX_MAX_AGE_MS) {
      const txt = await readFile(INDEX_FILE, "utf8");
      for (const line of txt.split("\n")) {
        const tab = line.indexOf("\t");
        if (tab > 0) map.set(line.slice(0, tab), line.slice(tab + 1));
      }
      if (map.size > 0) {
        console.log(`info.BIZ index: ${map.size} subjekata (iz cachea)`);
        return map;
      }
    }
  } catch {
    /* no cache yet */
  }

  console.log("info.BIZ index: preuzimam sitemapove (jednokratno ~56MB)…");
  const re = /<loc>(https:\/\/infobiz\.fina\.hr\/[^<]*?OIB-(\d{11}))<\/loc>/g;
  for (let i = 0; i < SITEMAP_COUNT; i++) {
    try {
      const xml = await fetchText(`${BASE}/subjects-sitemap-${i}.xml`);
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml)) !== null) map.set(m[2]!, m[1]!);
    } catch (e) {
      console.warn(`  sitemap-${i} preskočen: ${(e as Error).message}`);
    }
  }
  await mkdir(INDEX_DIR, { recursive: true });
  await writeFile(INDEX_FILE, [...map].map(([o, u]) => `${o}\t${u}`).join("\n"), "utf8");
  console.log(`info.BIZ index: ${map.size} subjekata (spremljeno u ${INDEX_FILE})`);
  return map;
}

function getIndex(): Promise<Map<string, string>> {
  if (!indexPromise) indexPromise = buildIndex();
  return indexPromise;
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Extract the "label : value" pairs from a profile page. */
function parsePairs(html: string): { pairs: [string, string][] } {
  const re =
    /justify-content-between[^>]*>\s*<div[^>]*>([\s\S]*?)<\/div>\s*<div class="text-right"[^>]*>([\s\S]*?)<\/div>/g;
  const pairs: [string, string][] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const label = unescapeHtml(m[1]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    const value = unescapeHtml(m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    if (label) pairs.push([label, value]);
  }
  return { pairs };
}

const SIZE_MAP: Record<string, SizeClass> = {
  mikro: "mikro",
  mali: "mali",
  srednji: "srednji",
  srednje: "srednji",
  veliki: "veliki",
  velik: "veliki",
};

function mapSize(v: string): SizeClass | undefined {
  const k = v.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return SIZE_MAP[k];
}

/** Normalise the legal status into a small enum, keeping the raw label too. */
export function normStatus(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("likvid")) return "likvidacija";
  if (s.includes("stečaj") || s.includes("stecaj")) return "stecaj";
  if (s.includes("predstečaj") || s.includes("predstecaj")) return "predstecaj";
  if (s.includes("brisan")) return "brisan";
  if (s.includes("blokad") || s.includes("blokiran")) return "blokada";
  if (s.includes("aktiv")) return "aktivan";
  return raw.trim() || "nepoznato";
}

function kindFromForm(form: string): EntityKind | undefined {
  const f = form.toLowerCase();
  if (!f) return undefined;
  if (f.includes("udrug")) return "udruga";
  if (f.includes("obrt") || f.includes("opg")) return "obrt";
  if (f.includes("ustanov")) return "ustanova";
  if (f.includes("ograničen") || f.includes("ogranicen") || f.includes("dioničk") || f.includes("dionick") || f.includes("d.o.o") || f.includes("d.d"))
    return "trgovacko_drustvo";
  return undefined;
}

export const infobiz: Source = {
  name: "fina_infobiz",
  requiresFirecrawl: false,
  appliesTo: () => true,
  async enrich(_fc, input: CompanyInput): Promise<SourceResult> {
    const index = await getIndex();
    const url = index.get(input.oib);
    if (!url) {
      return { source: "fina_infobiz", warnings: ["info.BIZ: subjekt nije u sitemap indexu"] };
    }
    let html: string;
    try {
      html = await fetchText(url);
    } catch (e) {
      return { source: "fina_infobiz", url, warnings: [`info.BIZ: ${(e as Error).message}`] };
    }

    const { pairs } = parsePairs(html);
    const get = (labelStartsWith: string) =>
      pairs.find(([k]) => k.toLowerCase().startsWith(labelStartsWith))?.[1];

    const sizeRaw = get("veličina") ?? get("velicina");
    const statusRaw = get("status");
    const form = get("pravni oblik") ?? "";
    // Representatives: any pair whose label denotes a management/representation role.
    const rep = pairs.find(([k]) =>
      /uprav|direktor|zastupanj|predsjednik|član uprave|clan uprave|likvidator/i.test(k),
    );

    const officialSize = sizeRaw ? mapSize(sizeRaw) : undefined;
    const warnings: string[] = [];
    if (sizeRaw && !officialSize) warnings.push(`info.BIZ: nepoznata oznaka veličine "${sizeRaw}"`);

    return {
      source: "fina_infobiz",
      url,
      name: undefined, // og:title is marketing-formatted; prefer registry name from other sources/seed
      address: get("adresa") || undefined,
      mbs: get("matični broj") || get("maticni broj") || undefined,
      nkd: get("djelatnost") || undefined,
      kind: kindFromForm(form),
      director: rep?.[1] || undefined,
      directorRole: rep?.[0] || undefined,
      officialSize,
      status: statusRaw ? normStatus(statusRaw) : undefined,
      statusRaw: statusRaw || undefined,
      raw: { url, pairs: Object.fromEntries(pairs), sizeRaw, statusRaw },
      warnings,
    };
  },
};

// Re-export so the bridge can warm the index up-front and report coverage.
export { getIndex as warmInfobizIndex };
