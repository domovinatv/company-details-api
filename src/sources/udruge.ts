/**
 * Udruge / neprofitne organizacije. Croatian associations don't get a
 * poduzetnik size class — the question the caller cares about is simply:
 * *does this udruga employ anyone, and how many?*
 *
 * Signals, in order of authority:
 *   1. Registar neprofitnih organizacija (RNO, banovac.mfin.hr) — identity +
 *      whether the org reports as an employer.
 *   2. FINA financijski izvještaji neprofitnih organizacija (PR-RAS): a non-zero
 *      "Rashodi za zaposlene" (AOP 088) implies employees; headcount may appear
 *      in the bilješke.
 *   3. companywall.hr udruga profile — often surfaces a plain employee count.
 *
 * Phase 1 does a best-effort Firecrawl search+scrape across these; the value we
 * most want to pin down is `employees` (0 / N / unknown).
 */
import type { FirecrawlClient, JsonSchema } from "../firecrawl.ts";
import type { CompanyInput } from "../types.ts";
import type { Source, SourceResult } from "./index.ts";

const SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Naziv udruge/neprofitne organizacije." },
    oib: { type: "string", description: "OIB udruge." },
    rno: { type: "string", description: "RNO broj (Registar neprofitnih organizacija), ako je naveden." },
    address: { type: "string", description: "Sjedište udruge." },
    director: { type: "string", description: "Osoba ovlaštena za zastupanje (predsjednik/ica)." },
    founded_year: { type: "integer", description: "Godina osnivanja/upisa." },
    employees: { type: "integer", description: "Broj zaposlenih u udruzi (0 ako udruga nema zaposlenih)." },
    has_employees: { type: "boolean", description: "Ima li udruga zaposlenih (true/false)." },
    employee_expenses_eur: { type: "number", description: "Rashodi za zaposlene (PR-RAS AOP 088) u EUR, ako su iskazani." },
    year: { type: "integer", description: "Godina na koju se odnose podaci o zaposlenima/financijama." },
  },
};

const PROMPT =
  "Ovo je hrvatska udruga / neprofitna organizacija. Izvuci: naziv, OIB, RNO broj, sjedište, " +
  "osobu ovlaštenu za zastupanje, godinu osnivanja te — najvažnije — ima li udruga zaposlenih i " +
  "koliko (broj zaposlenih; 0 ako nema). Ako je naveden iznos 'Rashodi za zaposlene' iz financijskog " +
  "izvještaja, vrati ga u EUR. Vrati godinu na koju se podaci odnose.";

interface RawUdruga {
  name?: string;
  oib?: string;
  rno?: string;
  address?: string;
  director?: string;
  founded_year?: number;
  employees?: number;
  has_employees?: boolean;
  employee_expenses_eur?: number;
  year?: number;
}

async function findUrl(fc: FirecrawlClient, input: CompanyInput): Promise<string | null> {
  const queries = [
    `registar udruga OIB ${input.oib}`,
    `site:companywall.hr udruga ${input.oib}`,
    input.name ? `udruga "${input.name}" OIB ${input.oib} zaposleni` : null,
  ].filter((q): q is string => q != null);
  for (const q of queries) {
    const hits = await fc.search(q, 5);
    for (const h of hits) {
      const u = h.url ?? "";
      if (/companywall\.hr|udruge\.gov\.hr|banovac\.mfin\.hr|registri\.uprava\.hr/.test(u)) return u;
    }
  }
  return null;
}

export const udruge: Source = {
  name: "rno",
  requiresFirecrawl: true,
  appliesTo: (kind) => kind === "udruga" || kind === "nepoznato",
  async enrich(fc, input): Promise<SourceResult> {
    if (!fc) return { source: "rno", warnings: ["udruge: zahtijeva Firecrawl"] };
    const url = await findUrl(fc, input);
    if (!url) {
      return { source: "rno", warnings: ["udruge: nije pronađen zapis u registru udruga/RNO/companywall"] };
    }
    const d = await fc.scrapeJson<RawUdruga>(url, SCHEMA, PROMPT);

    // Derive employees from the expense signal when an explicit count is absent.
    let employees = d.employees;
    const warnings: string[] = [];
    if (employees == null && d.has_employees != null) {
      if (d.has_employees === false) employees = 0;
      else warnings.push("udruge: poznato je da ima zaposlenih, ali broj nije iskazan");
    }
    if (employees == null && d.employee_expenses_eur != null) {
      if (d.employee_expenses_eur === 0) employees = 0;
      else warnings.push(`udruge: rashodi za zaposlene ${d.employee_expenses_eur} € upućuju na zaposlene, broj nepoznat`);
    }

    return {
      source: "rno",
      url,
      name: d.name?.trim() || undefined,
      address: d.address?.trim() || undefined,
      director: d.director?.trim() || undefined,
      foundedYear: d.founded_year || undefined,
      kind: "udruga",
      metrics: { employees, year: d.year ?? undefined },
      raw: d,
      warnings,
    };
  },
};
