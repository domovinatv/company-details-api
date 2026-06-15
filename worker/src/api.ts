import { Hono } from "hono";
import type { CompanyRow, Env, IngestRecord } from "./types";
import { checkBearer, extractBearer, normOib, sha256Hex } from "./util";
import {
  countCompanies,
  findApiKeyByHash,
  getCompany,
  listCompanies,
  summaryCounts,
  touchApiKey,
  upsertCompany,
} from "./db";

export const api = new Hono<{ Bindings: Env }>();

/** Clean, stable subset of a row for external consumers (no raw/internal blobs). */
function publicView(r: CompanyRow) {
  return {
    oib: r.oib,
    name: r.name,
    kind: r.kind,
    processing: r.status, // pending | enriched | failed
    size: r.size, // mikro | mali | srednji | veliki | null
    size_official: !!r.size_official, // true = službena FINA info.BIZ oznaka
    confidence: r.confidence,
    legal_status: r.legal_status, // aktivan | brisan | likvidacija | stecaj | ...
    legal_status_raw: r.legal_status_raw,
    employees: r.employees,
    has_employees: r.has_employees == null ? null : !!r.has_employees,
    total_assets_eur: r.total_assets,
    revenue_eur: r.revenue,
    metrics_year: r.metrics_year,
    metrics_source: r.metrics_source,
    nkd: r.nkd,
    address: r.address,
    mbs: r.mbs,
    founded_year: r.founded_year,
    director: r.director,
    source_url: r.source_url,
    updated_at: r.updated_at,
    enriched_at: r.enriched_at,
  };
}

// ───────────────────────── Bearer-gated write endpoints ─────────────────────────

function requireKey(req: Request, env: Env): Response | null {
  if (!env.INGEST_KEY) return new Response("INGEST_KEY nije konfiguriran", { status: 503 });
  if (!checkBearer(req, env.INGEST_KEY)) return new Response("Neovlašteno", { status: 401 });
  return null;
}

/**
 * POST /api/ingest — batch upsert. The local bridge calls this after enriching
 * + classifying. Body: { records: IngestRecord[] }  (or a bare array).
 */
api.post("/ingest", async (c) => {
  const denied = requireKey(c.req.raw, c.env);
  if (denied) return denied;

  const body = await c.req.json().catch(() => null);
  const records: IngestRecord[] = Array.isArray(body) ? body : (body?.records ?? []);
  if (!Array.isArray(records) || records.length === 0) {
    return c.json({ error: "očekujem { records: [...] } ili niz zapisa" }, 400);
  }

  let ok = 0;
  const errors: { oib?: string; error: string }[] = [];
  for (const rec of records) {
    const oib = normOib(rec.oib);
    if (!oib) {
      errors.push({ oib: rec.oib, error: "neispravan OIB" });
      continue;
    }
    try {
      await upsertCompany(c.env.DB, { ...rec, oib });
      ok++;
    } catch (e) {
      errors.push({ oib, error: (e as Error).message });
    }
  }
  return c.json({ ok, failed: errors.length, errors });
});

/**
 * POST /api/classify — the public "predaj listu firmi" endpoint. In the
 * Worker-orchestrated model this ENQUEUES the OIBs (inserts as pending) and
 * returns whatever is already known; the local bridge does the actual scraping
 * + classification and ingests results. Same Bearer auth as /ingest.
 *
 * Body: { companies: [{ oib, name? }] }  or  { oibs: ["...","..."] }
 */
api.post("/classify", async (c) => {
  const denied = requireKey(c.req.raw, c.env);
  if (denied) return denied;

  const body = await c.req.json().catch(() => null);
  const items: { oib: string; name?: string }[] = body?.companies
    ? body.companies
    : Array.isArray(body?.oibs)
      ? body.oibs.map((o: string) => ({ oib: o }))
      : [];
  if (items.length === 0) {
    return c.json({ error: "očekujem { companies: [{oib,name}] } ili { oibs: [...] }" }, 400);
  }

  const results = [];
  for (const it of items) {
    const oib = normOib(it.oib);
    if (!oib) {
      results.push({ oib: it.oib, status: "invalid" });
      continue;
    }
    const existing = await getCompany(c.env.DB, oib);
    if (!existing) {
      await upsertCompany(c.env.DB, { oib, name: it.name, status: "pending" });
      results.push({ oib, status: "queued" });
    } else {
      results.push({
        oib,
        status: existing.status,
        name: existing.name,
        kind: existing.kind,
        size: existing.size,
        employees: existing.employees,
      });
    }
  }
  return c.json({ count: results.length, results });
});

// ───────────────────────── Public read endpoints ─────────────────────────

/** GET /api/companies — paginated, filterable list (public). */
api.get("/companies", async (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  const offset = Number(c.req.query("offset") ?? 0);
  const filter = {
    limit,
    offset,
    size: c.req.query("size") || undefined,
    status: c.req.query("status") || undefined,
    lstatus: c.req.query("lstatus") || undefined,
    kind: c.req.query("kind") || undefined,
    q: c.req.query("q") || undefined,
  };
  const [companies, total, counts] = await Promise.all([
    listCompanies(c.env.DB, filter),
    countCompanies(c.env.DB, filter),
    summaryCounts(c.env.DB),
  ]);
  return c.json({ counts, companies, total, limit, offset });
});

/** GET /api/companies/:oib — single record (public). */
api.get("/companies/:oib", async (c) => {
  const oib = normOib(c.req.param("oib"));
  if (!oib) return c.json({ error: "neispravan OIB" }, 400);
  const row = await getCompany(c.env.DB, oib);
  if (!row) return c.json({ error: "nije pronađeno" }, 404);
  return c.json(row);
});

// ───────────────────────── v1 — vanjski API (API ključ) ─────────────────────────
// Za potrošače poput zef.hr: predaj listu OIB-ova, dobij klasificirane podatke.

const v1 = new Hono<{ Bindings: Env }>();
const MAX_OIBS = 1000;

// API-ključ auth na cijelo /v1 stablo.
v1.use("*", async (c, next) => {
  const raw = extractBearer(c.req.raw);
  if (!raw) return c.json({ error: "nedostaje API ključ (Authorization: Bearer cdk_…)" }, 401);
  const key = await findApiKeyByHash(c.env.DB, await sha256Hex(raw));
  if (!key) return c.json({ error: "neispravan ili onemogućen API ključ" }, 401);
  c.executionCtx.waitUntil(touchApiKey(c.env.DB, key.id));
  await next();
});

/**
 * POST /api/v1/companies — batch lookup po OIB-ovima.
 * Body: { "oibs": ["...","..."], "enqueue": true }
 *   enqueue (default true): nepoznate OIB-ove ubaci u red (status pending) da ih
 *   buduća obrada pokupi. Vrati found:false za njih.
 */
v1.post("/companies", async (c) => {
  const body = await c.req.json().catch(() => null);
  const oibsIn: unknown[] = Array.isArray(body?.oibs) ? body.oibs : [];
  if (oibsIn.length === 0) return c.json({ error: "očekujem { oibs: [\"...\"] }" }, 400);
  if (oibsIn.length > MAX_OIBS) return c.json({ error: `najviše ${MAX_OIBS} OIB-ova po zahtjevu` }, 400);
  const enqueue = body?.enqueue !== false;

  const results: unknown[] = [];
  const missing: string[] = [];
  let found = 0;
  for (const raw of oibsIn) {
    const oib = normOib(raw);
    if (!oib) {
      results.push({ oib: String(raw), found: false, reason: "neispravan OIB" });
      continue;
    }
    const row = await getCompany(c.env.DB, oib);
    if (row) {
      found++;
      results.push({ found: true, ...publicView(row) });
    } else {
      missing.push(oib);
      if (enqueue) await upsertCompany(c.env.DB, { oib, status: "pending" });
      results.push({ oib, found: false, processing: enqueue ? "queued" : "unknown" });
    }
  }
  return c.json({ count: results.length, found, missing, results });
});

/** GET /api/v1/companies/:oib — jedan subjekt. */
v1.get("/companies/:oib", async (c) => {
  const oib = normOib(c.req.param("oib"));
  if (!oib) return c.json({ error: "neispravan OIB" }, 400);
  const row = await getCompany(c.env.DB, oib);
  if (!row) return c.json({ oib, found: false }, 404);
  return c.json({ found: true, ...publicView(row) });
});

api.route("/v1", v1);
