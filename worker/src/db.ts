import type { ApiKeyRow, CompanyRow, IngestRecord, Status } from "./types";
import { genApiKey, newId, nowSec, sha256Hex } from "./util";

export interface ListFilter {
  limit?: number;
  offset?: number;
  /** size class, "udruga", "nerazvrstano", or undefined */
  size?: string;
  status?: Status | string;
  /** legal status: aktivan|brisan|likvidacija|stecaj|… */
  lstatus?: string;
  kind?: string;
  q?: string;
}

function whereClause(f: ListFilter): { sql: string; binds: unknown[] } {
  const conds: string[] = [];
  const binds: unknown[] = [];
  if (f.status) {
    conds.push("status = ?");
    binds.push(f.status);
  }
  if (f.kind) {
    conds.push("kind = ?");
    binds.push(f.kind);
  }
  if (f.lstatus) {
    conds.push("legal_status = ?");
    binds.push(f.lstatus);
  }
  if (f.size) {
    if (f.size === "nerazvrstano") {
      conds.push("size IS NULL AND kind != 'udruga'");
    } else if (f.size === "udruga") {
      conds.push("kind = 'udruga'");
    } else {
      conds.push("size = ?");
      binds.push(f.size);
    }
  }
  if (f.q) {
    conds.push("(name LIKE ? OR oib LIKE ?)");
    binds.push(`%${f.q}%`, `%${f.q}%`);
  }
  return { sql: conds.length ? `WHERE ${conds.join(" AND ")}` : "", binds };
}

export async function listCompanies(db: D1Database, f: ListFilter): Promise<CompanyRow[]> {
  const { sql, binds } = whereClause(f);
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 500);
  const offset = Math.max(f.offset ?? 0, 0);
  const stmt = db
    .prepare(`SELECT * FROM companies ${sql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, limit, offset);
  const { results } = await stmt.all<CompanyRow>();
  return results ?? [];
}

export async function countCompanies(db: D1Database, f: ListFilter): Promise<number> {
  const { sql, binds } = whereClause(f);
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM companies ${sql}`)
    .bind(...binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getCompany(db: D1Database, oib: string): Promise<CompanyRow | null> {
  return db.prepare("SELECT * FROM companies WHERE oib = ?").bind(oib).first<CompanyRow>();
}

/** Counts grouped into the buckets the grid shows as stat tiles. */
export async function summaryCounts(db: D1Database): Promise<Record<string, number>> {
  const out: Record<string, number> = {
    ukupno: 0,
    pending: 0,
    mikro: 0,
    mali: 0,
    srednji: 0,
    veliki: 0,
    udruga: 0,
    nerazvrstano: 0,
    failed: 0,
  };
  const { results } = await db
    .prepare(
      `SELECT
         COUNT(*) AS n,
         SUM(status='pending') AS pending,
         SUM(status='failed') AS failed,
         SUM(kind='udruga') AS udruga,
         SUM(size='mikro') AS mikro,
         SUM(size='mali') AS mali,
         SUM(size='srednji') AS srednji,
         SUM(size='veliki') AS veliki,
         SUM(size IS NULL AND status='enriched' AND kind!='udruga') AS nerazvrstano
       FROM companies`,
    )
    .all<Record<string, number>>();
  const r = results?.[0];
  if (r) {
    out.ukupno = r.n ?? 0;
    out.pending = r.pending ?? 0;
    out.failed = r.failed ?? 0;
    out.udruga = r.udruga ?? 0;
    out.mikro = r.mikro ?? 0;
    out.mali = r.mali ?? 0;
    out.srednji = r.srednji ?? 0;
    out.veliki = r.veliki ?? 0;
    out.nerazvrstano = r.nerazvrstano ?? 0;
  }
  return out;
}

/**
 * Upsert one ingest record. Identity-only payloads (seed) insert a `pending`
 * row; full payloads update everything provided. We only overwrite columns that
 * are present in the payload, so a seed never wipes an earlier enrichment.
 */
export async function upsertCompany(db: D1Database, rec: IngestRecord): Promise<void> {
  const now = nowSec();
  const existing = await getCompany(db, rec.oib);
  const has = (k: keyof IngestRecord) => rec[k] !== undefined;
  const pick = <T>(k: keyof IngestRecord, cur: T): T =>
    (has(k) ? (rec[k] as T) : cur);

  const status: Status = rec.status ?? (existing?.status as Status) ?? "pending";
  const notes = rec.notes !== undefined ? JSON.stringify(rec.notes) : (existing?.notes ?? null);
  const raw = rec.raw !== undefined ? JSON.stringify(rec.raw) : (existing?.raw ?? null);
  const hasEmp =
    rec.has_employees === undefined
      ? (existing?.has_employees ?? null)
      : rec.has_employees == null
        ? null
        : rec.has_employees
          ? 1
          : 0;
  const enrichedAt = status === "enriched" ? now : (existing?.enriched_at ?? null);

  const sizeOfficial = rec.size_official === undefined ? (existing?.size_official ?? 0) : rec.size_official ? 1 : 0;

  await db
    .prepare(
      `INSERT INTO companies (
         oib, name, legal_form, kind, status, legal_status, legal_status_raw,
         size, size_official, confidence,
         total_assets, revenue, employees, has_employees, metrics_year, metrics_source,
         address, mbs, founded_year, director, director_role, nkd, source_url,
         notes, raw, created_at, updated_at, enriched_at
       ) VALUES (?,?,?,?,?,?,?, ?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?)
       ON CONFLICT(oib) DO UPDATE SET
         name=excluded.name, legal_form=excluded.legal_form, kind=excluded.kind,
         status=excluded.status, legal_status=excluded.legal_status,
         legal_status_raw=excluded.legal_status_raw,
         size=excluded.size, size_official=excluded.size_official, confidence=excluded.confidence,
         total_assets=excluded.total_assets, revenue=excluded.revenue, employees=excluded.employees,
         has_employees=excluded.has_employees, metrics_year=excluded.metrics_year,
         metrics_source=excluded.metrics_source, address=excluded.address, mbs=excluded.mbs,
         founded_year=excluded.founded_year, director=excluded.director,
         director_role=excluded.director_role, nkd=excluded.nkd, source_url=excluded.source_url,
         notes=excluded.notes, raw=excluded.raw, updated_at=excluded.updated_at,
         enriched_at=excluded.enriched_at`,
    )
    .bind(
      rec.oib,
      pick("name", existing?.name ?? null),
      pick("legal_form", existing?.legal_form ?? null),
      pick("kind", existing?.kind ?? "nepoznato"),
      status,
      pick("legal_status", existing?.legal_status ?? null),
      pick("legal_status_raw", existing?.legal_status_raw ?? null),
      pick("size", existing?.size ?? null),
      sizeOfficial,
      pick("confidence", existing?.confidence ?? null),
      pick("total_assets", existing?.total_assets ?? null),
      pick("revenue", existing?.revenue ?? null),
      pick("employees", existing?.employees ?? null),
      hasEmp,
      pick("metrics_year", existing?.metrics_year ?? null),
      pick("metrics_source", existing?.metrics_source ?? null),
      pick("address", existing?.address ?? null),
      pick("mbs", existing?.mbs ?? null),
      pick("founded_year", existing?.founded_year ?? null),
      pick("director", existing?.director ?? null),
      pick("director_role", existing?.director_role ?? null),
      pick("nkd", existing?.nkd ?? null),
      pick("source_url", existing?.source_url ?? null),
      notes,
      raw,
      existing?.created_at ?? now,
      now,
      enrichedAt,
    )
    .run();
}

export async function deleteCompany(db: D1Database, oib: string): Promise<void> {
  await db.prepare("DELETE FROM companies WHERE oib = ?").bind(oib).run();
}

/** Reset a row back to pending so the bridge re-processes it. */
export async function requeueCompany(db: D1Database, oib: string): Promise<void> {
  await db
    .prepare("UPDATE companies SET status='pending', updated_at=? WHERE oib=?")
    .bind(nowSec(), oib)
    .run();
}

// ───────────────────────── API ključevi ─────────────────────────

/** Create a key. Returns the row plus the RAW key (shown to the admin once). */
export async function createApiKey(
  db: D1Database,
  name: string,
): Promise<{ row: ApiKeyRow; rawKey: string }> {
  const rawKey = genApiKey();
  const keyHash = await sha256Hex(rawKey);
  const now = nowSec();
  const id = newId();
  await db
    .prepare("INSERT INTO api_keys (id, name, key_hash, enabled, calls, created_at) VALUES (?,?,?,1,0,?)")
    .bind(id, name, keyHash, now)
    .run();
  return { row: { id, name, key_hash: keyHash, enabled: 1, calls: 0, created_at: now, last_used_at: null }, rawKey };
}

export async function listApiKeys(db: D1Database): Promise<ApiKeyRow[]> {
  const { results } = await db.prepare("SELECT * FROM api_keys ORDER BY created_at DESC").all<ApiKeyRow>();
  return results ?? [];
}

/** Look up an enabled key by the SHA-256 of the presented raw key. */
export async function findApiKeyByHash(db: D1Database, keyHash: string): Promise<ApiKeyRow | null> {
  return db
    .prepare("SELECT * FROM api_keys WHERE key_hash = ? AND enabled = 1")
    .bind(keyHash)
    .first<ApiKeyRow>();
}

export async function touchApiKey(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE api_keys SET calls = calls + 1, last_used_at = ? WHERE id = ?")
    .bind(nowSec(), id)
    .run();
}

export async function setApiKeyEnabled(db: D1Database, id: string, enabled: boolean): Promise<void> {
  await db.prepare("UPDATE api_keys SET enabled = ? WHERE id = ?").bind(enabled ? 1 : 0, id).run();
}

export async function deleteApiKey(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM api_keys WHERE id = ?").bind(id).run();
}
