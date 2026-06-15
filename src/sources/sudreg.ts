/**
 * Sudski registar trgovačkih društava (sudreg.pravosudje.hr) — the authoritative
 * identity record for trgovačka društva: official name, MBS, OIB, sjedište,
 * legal form, founding, court, and registered persons (uprava). It does NOT
 * publish financial statements, so it contributes identity, not size metrics.
 *
 * Phase 1 uses Firecrawl (search + JSON scrape), matching the rest of the
 * pipeline. NOTE: the authoritative, free upgrade is the official open-data REST
 * API at https://sudreg-data.gov.hr/api/javni (lookup by OIB) — documented in
 * docs/02-izvori-podataka.md as the Phase-2 replacement for this scraper.
 */
import type { FirecrawlClient, JsonSchema } from "../firecrawl.ts";
import type { CompanyInput } from "../types.ts";
import type { Source, SourceResult } from "./index.ts";

const DETAIL_RE = /sudreg\.pravosudje\.hr/;

const SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Tvrtka/naziv subjekta iz sudskog registra." },
    oib: { type: "string", description: "11-znamenkasti OIB." },
    mbs: { type: "string", description: "Matični broj subjekta (MBS), npr. '080......'." },
    address: { type: "string", description: "Sjedište: puna adresa." },
    legal_form: { type: "string", description: "Pravni oblik (d.o.o., j.d.o.o., d.d., ...)." },
    founded_year: { type: "integer", description: "Godina upisa u sudski registar." },
    director: { type: "string", description: "Osoba ovlaštena za zastupanje (član/predsjednik uprave, direktor)." },
    director_role: { type: "string", description: "Funkcija zastupnika." },
    nkd: { type: "string", description: "Pretežita djelatnost (NKD), ako je navedena." },
  },
};

const PROMPT =
  "Izvuci službene podatke iz sudskog registra za ovaj subjekt: tvrtku/naziv, OIB, MBS, " +
  "sjedište, pravni oblik, godinu upisa, osobu ovlaštenu za zastupanje i funkciju te pretežitu djelatnost.";

interface RawSudreg {
  name?: string;
  oib?: string;
  mbs?: string;
  address?: string;
  legal_form?: string;
  founded_year?: number;
  director?: string;
  director_role?: string;
  nkd?: string;
}

async function findUrl(fc: FirecrawlClient, input: CompanyInput): Promise<string | null> {
  const queries = [
    `sudski registar OIB ${input.oib}`,
    input.name ? `sudreg ${input.name} ${input.oib}` : null,
  ].filter((q): q is string => q != null);
  for (const q of queries) {
    const hits = await fc.search(q, 5);
    for (const h of hits) {
      if (h.url && DETAIL_RE.test(h.url)) return h.url;
    }
  }
  return null;
}

export const sudreg: Source = {
  name: "sudreg",
  requiresFirecrawl: true,
  // Sudski registar covers trgovačka društva (and some ustanove); not udruge/obrti.
  appliesTo: (kind) => kind === "trgovacko_drustvo" || kind === "ustanova" || kind === "nepoznato",
  async enrich(fc, input): Promise<SourceResult> {
    if (!fc) return { source: "sudreg", warnings: ["sudreg: zahtijeva Firecrawl"] };
    const url = await findUrl(fc, input);
    if (!url) {
      return { source: "sudreg", warnings: ["sudreg: nije pronađen zapis"] };
    }
    const d = await fc.scrapeJson<RawSudreg>(url, SCHEMA, PROMPT);
    return {
      source: "sudreg",
      url,
      name: d.name?.trim() || undefined,
      address: d.address?.trim() || undefined,
      mbs: d.mbs?.trim() || undefined,
      director: d.director?.trim() || undefined,
      directorRole: d.director_role?.trim() || undefined,
      nkd: d.nkd?.trim() || undefined,
      foundedYear: d.founded_year || undefined,
      kind: "trgovacko_drustvo",
      raw: d,
    };
  },
};
