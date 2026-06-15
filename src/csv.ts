/**
 * Minimal RFC-4180 CSV reader + a loader for the membership export
 * (data/input/pravne-osobe.csv). We deliberately read ONLY the fields the
 * pipeline needs — OIB, name, legal form — and ignore the PII columns (email,
 * phone, IBAN, …). That export is gitignored and never leaves the machine.
 */
import { readFile } from "node:fs/promises";
import type { CompanyInput, EntityKind } from "./types.ts";

/** Parse CSV text into rows of string cells (handles quotes and embedded commas/newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  // Strip BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c === "\r") {
      // ignore — handled by the following \n
    } else {
      cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Map the wild mix of legal_form codes in the export to our EntityKind. */
export function legalFormToKind(form: string): EntityKind {
  const f = form.trim().toLowerCase();
  if (!f) return "nepoznato";
  // trgovačka društva (and zadruge — also GFI obveznici, classified as poduzetnici)
  if (
    ["llc", "llc-s", "jsc", "d.o.o.", "j.d.o.o.", "d.d.", "coop", "zadruga"].includes(f) ||
    f.includes("d.o.o") ||
    f.includes("zadrug")
  )
    return "trgovacko_drustvo";
  // udruge / neprofitne
  if (f.includes("udrug") || f === "assoc" || f.includes("neprofit")) return "udruga";
  // obrti / OPG / craft / freelance
  if (["craft", "obrt", "opg", "ff"].includes(f) || f.includes("obrt")) return "obrt";
  // ustanove / javni sektor / sveučilišta / JLS
  if (["ustanova", "uni", "jls"].includes(f) || f.includes("ustanov")) return "ustanova";
  return "nepoznato";
}

export interface SeedRow extends CompanyInput {
  kind: EntityKind;
  /** Original legal_form string from the export, for audit. */
  legalForm: string;
}

/** Load the membership export, returning de-duplicated seed rows with a valid OIB. */
export async function loadSeed(path: string): Promise<SeedRow[]> {
  const rows = parseCsv(await readFile(path, "utf8"));
  if (rows.length < 2) return [];
  const header = rows[0]!.map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const iName = idx("legal_entity_name");
  const iForm = idx("legal_form");
  // Prefer the dedicated company_oib, fall back to the generic oib column.
  const iOib = idx("company_oib");
  const iOibAlt = idx("oib");

  const seen = new Set<string>();
  const out: SeedRow[] = [];
  for (const r of rows.slice(1)) {
    if (r.length === 1 && r[0]!.trim() === "") continue;
    const rawOib = (r[iOib] ?? r[iOibAlt] ?? "").trim() || (r[iOibAlt] ?? "").trim();
    const oib = rawOib.replace(/\D/g, "");
    if (oib.length !== 11) continue; // skip rows without a usable OIB
    if (seen.has(oib)) continue;
    seen.add(oib);
    const legalForm = (r[iForm] ?? "").trim();
    out.push({
      oib,
      name: (r[iName] ?? "").trim() || undefined,
      legalForm,
      kind: legalFormToKind(legalForm),
    });
  }
  return out;
}
