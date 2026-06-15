/**
 * companywall.hr — aggregated public business profile. Often the single richest
 * page: legal name, OIB, MBS, address, director (odgovorna osoba), NKD activity,
 * an explicit size label ("Mikro"/"Mali"/...), employee count, and a financial
 * summary (prihod / aktiva / dobit) sourced from FINA filings.
 *
 * Discovery uses Firecrawl /v2/search with a Google `site:` query keyed on the
 * OIB (unambiguous), then /v2/scrape with a JSON schema. Mirrors the proven
 * pattern in klubovi.domovina.ai/scripts/23_companywall_sdd.py.
 */
import type { FirecrawlClient, JsonSchema } from "../firecrawl.ts";
import type { CompanyInput, EntityKind } from "../types.ts";
import type { Source, SourceResult } from "./index.ts";

const DETAIL_RE = /companywall\.hr\/(tvrtka|udruga|obrt)\/[^/]+\/[A-Za-z0-9]+/;

const SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Puni registrirani naziv subjekta." },
    oib: { type: "string", description: "11-znamenkasti OIB." },
    mbs: { type: "string", description: "Matični broj subjekta (MBS) iz sudskog registra, ako je naveden." },
    address: { type: "string", description: "Puna adresa sjedišta: ulica, broj, poštanski broj, grad." },
    director: { type: "string", description: "Ime i prezime odgovorne osobe / direktora / predsjednika uprave. Title case." },
    director_role: { type: "string", description: "Funkcija (npr. 'Direktor', 'Predsjednik uprave', 'Član uprave')." },
    nkd: { type: "string", description: "Pretežita djelatnost (NKD 2007): šifra i/ili naziv." },
    legal_form: { type: "string", description: "Pravni oblik: 'd.o.o.', 'j.d.o.o.', 'd.d.', 'obrt', 'udruga', 'ustanova' i sl." },
    founded_year: { type: "integer", description: "Godina osnivanja / upisa." },
    employees: { type: "integer", description: "Broj zaposlenih (najnoviji dostupni podatak)." },
    size_label: { type: "string", description: "Iskazana veličina poduzetnika ako je navedena: 'Mikro', 'Mali', 'Srednji', 'Veliki'." },
    total_assets_eur: { type: "number", description: "Ukupna aktiva u EUR (najnovija godina), ako je iskazana." },
    revenue_eur: { type: "number", description: "Ukupni prihod / poslovni prihod u EUR (najnovija godina), ako je iskazan." },
    financials_year: { type: "integer", description: "Godina na koju se odnose financijski podaci (aktiva/prihod)." },
  },
};

const PROMPT =
  "Izvuci podatke o ovom hrvatskom poslovnom subjektu s companywall.hr: puni naziv, " +
  "OIB, MBS, adresu sjedišta, odgovornu osobu (direktor/predsjednik uprave) i njezinu funkciju, " +
  "pretežitu djelatnost (NKD), pravni oblik, godinu osnivanja, broj zaposlenih, iskazanu veličinu " +
  "poduzetnika te najnovije financijske pokazatelje (ukupna aktiva i prihod u EUR) i godinu na koju " +
  "se odnose. Vrati prazno/izostavljeno za polja koja nisu navedena.";

interface RawCW {
  name?: string;
  oib?: string;
  mbs?: string;
  address?: string;
  director?: string;
  director_role?: string;
  nkd?: string;
  legal_form?: string;
  founded_year?: number;
  employees?: number;
  size_label?: string;
  total_assets_eur?: number;
  revenue_eur?: number;
  financials_year?: number;
}

function kindFromForm(form?: string): EntityKind | undefined {
  const f = (form ?? "").toLowerCase();
  if (!f) return undefined;
  if (f.includes("udrug")) return "udruga";
  if (f.includes("obrt")) return "obrt";
  if (f.includes("ustanov")) return "ustanova";
  if (f.includes("d.o.o") || f.includes("d.d") || f.includes("j.d.o.o") || f.includes("d. o. o"))
    return "trgovacko_drustvo";
  return undefined;
}

async function findUrl(fc: FirecrawlClient, input: CompanyInput): Promise<string | null> {
  // OIB is unambiguous — try it first, then fall back to the name.
  const queries = [
    `site:companywall.hr "${input.oib}"`,
    input.name ? `site:companywall.hr "${input.name}"` : null,
    input.name ? `${input.name} companywall OIB ${input.oib}` : `${input.oib} companywall.hr`,
  ].filter((q): q is string => q != null);

  for (const q of queries) {
    const hits = await fc.search(q, 5);
    for (const h of hits) {
      if (h.url && DETAIL_RE.test(h.url)) return h.url;
    }
  }
  return null;
}

export const companywall: Source = {
  name: "companywall",
  appliesTo: () => true,
  async enrich(fc, input): Promise<SourceResult> {
    const url = await findUrl(fc, input);
    if (!url) {
      return { source: "companywall", warnings: ["companywall: nije pronađen profil"] };
    }

    const d = await fc.scrapeJson<RawCW>(url, SCHEMA, PROMPT);
    const warnings: string[] = [];
    if (d.oib && d.oib.replace(/\D/g, "") !== input.oib) {
      warnings.push(`companywall: OIB na stranici (${d.oib}) ne odgovara traženom (${input.oib})`);
    }

    return {
      source: "companywall",
      url,
      name: d.name?.trim() || undefined,
      address: d.address?.trim() || undefined,
      mbs: d.mbs?.trim() || undefined,
      director: d.director?.trim() || undefined,
      directorRole: d.director_role?.trim() || undefined,
      nkd: d.nkd?.trim() || undefined,
      foundedYear: d.founded_year || undefined,
      kind: kindFromForm(d.legal_form),
      metrics: {
        // 0 from the extractor means "not stated", not a real zero balance.
        totalAssets: typeof d.total_assets_eur === "number" && d.total_assets_eur > 0 ? d.total_assets_eur : undefined,
        revenue: typeof d.revenue_eur === "number" && d.revenue_eur > 0 ? d.revenue_eur : undefined,
        employees: typeof d.employees === "number" && d.employees > 0 ? d.employees : undefined,
        year: d.financials_year && d.financials_year > 1990 ? d.financials_year : undefined,
      },
      raw: d,
      warnings,
    };
  },
};
