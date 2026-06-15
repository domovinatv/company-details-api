import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import type { Env } from "../types";
import {
  countCompanies,
  createApiKey,
  deleteApiKey,
  deleteCompany,
  listApiKeys,
  listCompanies,
  requeueCompany,
  setApiKeyEnabled,
  summaryCounts,
} from "../db";
import { normOib } from "../util";
import { renderGridPage, renderKeysPage } from "./views";

export const admin = new Hono<{ Bindings: Env }>();

// Basic Auth gate na cijelo /admin stablo. Bez secreta → 503 (safe default).
admin.use("*", async (c, next) => {
  if (!c.env.ADMIN_USER || !c.env.ADMIN_PASS) {
    return c.text("Admin nije konfiguriran (postavi ADMIN_USER + ADMIN_PASS secrete).", 503);
  }
  const mw = basicAuth({
    username: c.env.ADMIN_USER,
    password: c.env.ADMIN_PASS,
    realm: "DOMOVINA firme admin",
  });
  return mw(c, next);
});

admin.get("/", (c) => c.html(renderGridPage()));

// JSON za client-side grid (filter + pretraga + pager + auto-refresh).
admin.get("/api/companies", async (c) => {
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

// ───────────────────────── API ključevi ─────────────────────────
admin.get("/keys", async (c) => {
  const keys = await listApiKeys(c.env.DB);
  return c.html(renderKeysPage(keys));
});

admin.post("/keys", async (c) => {
  const form = await c.req.parseBody();
  const name = String(form.name ?? "").trim() || "bez imena";
  const { row, rawKey } = await createApiKey(c.env.DB, name);
  const keys = await listApiKeys(c.env.DB);
  return c.html(renderKeysPage(keys, { rawKey, name: row.name }));
});

admin.post("/keys/:id/:action", async (c) => {
  const id = c.req.param("id");
  switch (c.req.param("action")) {
    case "enable":
      await setApiKeyEnabled(c.env.DB, id, true);
      break;
    case "disable":
      await setApiKeyEnabled(c.env.DB, id, false);
      break;
    case "delete":
      await deleteApiKey(c.env.DB, id);
      break;
    default:
      return c.text("nepoznata akcija", 400);
  }
  return c.redirect("/admin/keys", 303);
});

// Akcije po subjektu (poziva ih grid preko fetch-a; Basic Auth se nasljeđuje).
admin.post("/companies/:oib/:action", async (c) => {
  const oib = normOib(c.req.param("oib"));
  if (!oib) return c.json({ error: "neispravan OIB" }, 400);
  switch (c.req.param("action")) {
    case "requeue":
      await requeueCompany(c.env.DB, oib);
      break;
    case "delete":
      await deleteCompany(c.env.DB, oib);
      break;
    default:
      return c.json({ error: "nepoznata akcija" }, 400);
  }
  return c.json({ ok: true });
});
