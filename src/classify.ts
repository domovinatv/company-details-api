/**
 * Razvrstavanje poduzetnika po veličini — Zakon o računovodstvu (NN 85/24),
 * članak 5., na snazi od 27.7.2024.
 *
 * Poduzetnik se razvrstava u kategoriju prema tome NE prelazi li granične
 * pokazatelje u DVA od TRI uvjeta: ukupna aktiva, prihod, prosječan broj
 * zaposlenih tijekom poslovne godine.
 *
 *   mikro   — ne prelazi 2 od 3:  aktiva ≤ 450.000 €,  prihod ≤ 900.000 €,   zaposleni ≤ 10
 *   mali    — nije mikro i ne prelazi 2 od 3:  aktiva ≤ 5.000.000 €,  prihod ≤ 10.000.000 €,  zaposleni ≤ 50
 *   srednji — nije mali i ne prelazi 2 od 3:   aktiva ≤ 25.000.000 €, prihod ≤ 50.000.000 €,  zaposleni ≤ 250
 *   veliki  — prelazi 2 od 3 granična pokazatelja za srednje poduzetnike
 *
 * Izvor pragova: https://www.zakon.hr/z/118/zakon-o-racunovodstvu  (čl. 5)
 *                https://mfin.gov.hr/.../uputa-o-primjeni-novoga-zakona-o-racunovodstvu/3732
 */
import type { SizeClass, SizeMetrics, SizeResult, CompanyRecord } from "./types.ts";

export interface Thresholds {
  /** ukupna aktiva, EUR */
  assets: number;
  /** prihod, EUR */
  revenue: number;
  /** prosječan broj zaposlenih */
  employees: number;
}

/** Granični pokazatelji po Zakonu o računovodstvu (NN 85/24, čl. 5). */
export const THRESHOLDS: Record<"mikro" | "mali" | "srednji", Thresholds> = {
  mikro: { assets: 450_000, revenue: 900_000, employees: 10 },
  mali: { assets: 5_000_000, revenue: 10_000_000, employees: 50 },
  srednji: { assets: 25_000_000, revenue: 50_000_000, employees: 250 },
};

/**
 * Count how many of the (available) three criteria STRICTLY EXCEED the given
 * thresholds. Missing metrics are skipped, and `present` reports how many of
 * the three were actually evaluated.
 */
function exceedance(m: SizeMetrics, t: Thresholds): { exceeded: number; present: number } {
  let exceeded = 0;
  let present = 0;
  if (m.totalAssets != null) {
    present++;
    if (m.totalAssets > t.assets) exceeded++;
  }
  if (m.revenue != null) {
    present++;
    if (m.revenue > t.revenue) exceeded++;
  }
  if (m.employees != null) {
    present++;
    if (m.employees > t.employees) exceeded++;
  }
  return { exceeded, present };
}

/** True when the entity exceeds the thresholds in at least two of three criteria.
 *  When fewer than three metrics are known, "at least two" is interpreted against
 *  what's available (e.g. with two metrics, both must exceed). */
function exceedsAtLeastTwo(m: SizeMetrics, t: Thresholds): boolean {
  const { exceeded, present } = exceedance(m, t);
  const needed = Math.min(2, present);
  return present > 0 && exceeded >= needed;
}

function basisOf(m: SizeMetrics): SizeResult["basis"] {
  const b: SizeResult["basis"] = [];
  if (m.totalAssets != null) b.push("assets");
  if (m.revenue != null) b.push("revenue");
  if (m.employees != null) b.push("employees");
  return b;
}

/**
 * Classify a set of size metrics into a Croatian size class.
 * Returns null when there is no usable metric at all.
 */
export function classifySize(m: SizeMetrics): SizeClass | null {
  const basis = basisOf(m);
  if (basis.length === 0) return null;

  if (!exceedsAtLeastTwo(m, THRESHOLDS.mikro)) return "mikro";
  if (!exceedsAtLeastTwo(m, THRESHOLDS.mali)) return "mali";
  if (!exceedsAtLeastTwo(m, THRESHOLDS.srednji)) return "srednji";
  return "veliki";
}

/**
 * Build the final, auditable result for one enriched record.
 * For udruge (and other non-poduzetnici) we don't assign a size class — we just
 * report whether they employ anyone and how many.
 */
export function classifyRecord(rec: CompanyRecord): SizeResult {
  const basis = basisOf(rec.metrics);
  const notes: string[] = [];
  const status = rec.status?.value;
  const statusRaw = rec.statusRaw;

  // udruge / neprofitne: nema zakonske kategorije veličine poduzetnika.
  if (rec.kind === "udruga" || rec.kind === "ustanova") {
    const emp = rec.metrics.employees;
    return {
      oib: rec.oib,
      name: rec.name?.value,
      kind: rec.kind,
      size: null,
      status,
      statusRaw,
      metrics: rec.metrics,
      basis,
      confidence: emp != null ? "high" : "none",
      hasEmployees: emp != null ? emp > 0 : undefined,
      employees: emp,
      source: rec.metricsSource,
      notes: [
        "Udruga/ustanova — ne razvrstava se po Zakonu o računovodstvu (poduzetnici); izvještava se samo broj zaposlenih.",
        ...rec.warnings,
      ],
    };
  }

  // Official label (FINA info.BIZ "Veličina") is authoritative — trust it over
  // anything we'd compute from scraped metrics.
  if (rec.officialSize) {
    const computed = classifySize(rec.metrics);
    if (computed && computed !== rec.officialSize.value) {
      notes.push(
        `Napomena: izračunata veličina (${computed}) razlikuje se od službene (${rec.officialSize.value}); koristim službenu.`,
      );
    }
    return {
      oib: rec.oib,
      name: rec.name?.value,
      kind: rec.kind,
      size: rec.officialSize.value,
      sizeOfficial: true,
      status,
      statusRaw,
      metrics: rec.metrics,
      basis,
      confidence: "high",
      employees: rec.metrics.employees,
      hasEmployees: rec.metrics.employees != null ? rec.metrics.employees > 0 : undefined,
      source: rec.officialSize.source,
      notes: [...notes, ...rec.warnings],
    };
  }

  const size = classifySize(rec.metrics);
  let confidence: SizeResult["confidence"] = "none";
  if (basis.length >= 2) confidence = "high";
  else if (basis.length === 1) {
    confidence = "low";
    notes.push(
      `Klasifikacija temeljena na samo jednom kriteriju (${basis[0]}); zakon traži 2 od 3 — niska pouzdanost.`,
    );
  }
  if (size == null) notes.push("Nedovoljno podataka za razvrstavanje veličine.");

  return {
    oib: rec.oib,
    name: rec.name?.value,
    kind: rec.kind,
    size,
    sizeOfficial: false,
    status,
    statusRaw,
    metrics: rec.metrics,
    basis,
    confidence,
    employees: rec.metrics.employees,
    hasEmployees: rec.metrics.employees != null ? rec.metrics.employees > 0 : undefined,
    source: rec.metricsSource,
    notes: [...notes, ...rec.warnings],
  };
}
