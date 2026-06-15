/**
 * FINA RGFI — Registar godišnjih financijskih izvještaja, javna objava
 * (https://rgfi.fina.hr/JavnaObjava-web/). The AUTHORITATIVE source for the size
 * metrics the law cares about: ukupna aktiva (total assets), prihod (revenue),
 * and prosječan broj zaposlenih, taken from the filed GFI-POD forms.
 *
 * This is the primary signal for classification (companywall is the fallback).
 *
 * Caveat: the javna-objava UI is a stateful PrimeFaces/JSF app, so a plain
 * scrape may not reach the figures. Phase 2 should switch to either the FINA
 * RGFI API or a Firecrawl "interact" flow (search by OIB → open the latest GFI →
 * read AOP positions). For now we attempt a best-effort JSON scrape and degrade
 * gracefully when the numbers aren't reachable.
 *
 * Key AOP positions (standard GFI-POD):
 *   - AOP 001 = UKUPNO AKTIVA
 *   - AOP 125/126 = UKUPNI PRIHODI (P&L)
 */
import type { FirecrawlClient, JsonSchema } from "../firecrawl.ts";
import type { CompanyInput } from "../types.ts";
import type { Source, SourceResult } from "./index.ts";

const SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    oib: { type: "string", description: "OIB subjekta." },
    total_assets_eur: { type: "number", description: "UKUPNO AKTIVA (AOP 001) iz bilance, u EUR, najnovija dostupna godina." },
    revenue_eur: { type: "number", description: "UKUPNI PRIHODI iz računa dobiti i gubitka, u EUR, najnovija dostupna godina." },
    employees: { type: "integer", description: "Prosječan broj zaposlenih (na temelju sati rada), ako je iskazan." },
    year: { type: "integer", description: "Godina na koju se odnosi GFI (npr. 2024)." },
  },
};

const PROMPT =
  "Ovo je javna objava godišnjeg financijskog izvještaja (GFI) iz FINA RGFI registra. " +
  "Izvuci za najnoviju dostupnu godinu: UKUPNU AKTIVU (AOP 001) u EUR, UKUPNE PRIHODE u EUR, " +
  "prosječan broj zaposlenih te godinu izvještaja. Iznose vrati kao brojeve bez tisućnih separatora.";

interface RawFina {
  oib?: string;
  total_assets_eur?: number;
  revenue_eur?: number;
  employees?: number;
  year?: number;
}

/** Try to discover a public RGFI page for the entity (by OIB). */
async function findUrl(fc: FirecrawlClient, input: CompanyInput): Promise<string | null> {
  const queries = [
    `site:rgfi.fina.hr ${input.oib}`,
    `FINA RGFI javna objava ${input.oib}`,
    input.name ? `FINA godišnji financijski izvještaj ${input.name} ${input.oib}` : null,
  ].filter((q): q is string => q != null);
  for (const q of queries) {
    const hits = await fc.search(q, 5);
    for (const h of hits) {
      if (h.url && /fina\.hr/.test(h.url)) return h.url;
    }
  }
  return null;
}

export const finaRgfi: Source = {
  name: "fina_rgfi",
  requiresFirecrawl: true,
  // Trgovačka društva i obrti koji predaju GFI-POD. Udruge idu kroz fina_neprofitne.
  appliesTo: (kind) => kind !== "udruga",
  async enrich(fc, input): Promise<SourceResult> {
    if (!fc) return { source: "fina_rgfi", warnings: ["fina_rgfi: zahtijeva Firecrawl"] };
    const url = await findUrl(fc, input);
    if (!url) {
      return {
        source: "fina_rgfi",
        warnings: [
          "fina_rgfi: javna objava nije dohvatljiva izravnim scrapeom (JSF/PrimeFaces) — vidi docs/02 za API/interact put",
        ],
      };
    }
    const d = await fc.scrapeJson<RawFina>(url, SCHEMA, PROMPT);
    // The LLM fills unknown numeric fields with 0; a real company never has 0
    // assets/revenue, so treat 0 as "not found" to avoid a false "mikro".
    const pos = (n?: number) => (typeof n === "number" && n > 0 ? n : undefined);
    return {
      source: "fina_rgfi",
      url,
      metrics: {
        totalAssets: pos(d.total_assets_eur),
        revenue: pos(d.revenue_eur),
        employees: pos(d.employees),
        year: d.year && d.year > 1990 ? d.year : undefined,
      },
      raw: d,
    };
  },
};
