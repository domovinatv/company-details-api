import { Hono } from "hono";
import type { Env, IngestRecord } from "./types";
import { checkBearer, normOib } from "./util";
import {
  countCompanies,
  getCompany,
  listCompanies,
  summaryCounts,
  upsertCompany,
} from "./db";

export const api = new Hono<{ Bindings: Env }>();

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
