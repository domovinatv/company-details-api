/**
 * Pluggable cache so the Firecrawl client works in both worlds:
 *   - Node CLI (Phase 1): FsCache writes data/cache/<endpoint>/<hash>.json so
 *     repeat runs never re-burn Firecrawl credits.
 *   - Cloudflare Worker (Phase 2): swap in a KV-backed cache implementing the
 *     same interface.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface Cache {
  get(endpoint: string, payload: unknown): Promise<unknown | null>;
  set(endpoint: string, payload: unknown, value: unknown): Promise<void>;
}

export function cacheKey(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 16);
}

/** No-op cache — every request hits the network. */
export class NullCache implements Cache {
  async get(): Promise<null> {
    return null;
  }
  async set(): Promise<void> {}
}

/** Filesystem cache rooted at a directory (default data/cache). */
export class FsCache implements Cache {
  private readonly root: string;
  constructor(root: string) {
    this.root = root;
  }

  private path(endpoint: string, payload: unknown): string {
    return join(this.root, endpoint, `${cacheKey(payload)}.json`);
  }

  async get(endpoint: string, payload: unknown): Promise<unknown | null> {
    try {
      const txt = await readFile(this.path(endpoint, payload), "utf8");
      return JSON.parse(txt);
    } catch {
      return null;
    }
  }

  async set(endpoint: string, payload: unknown, value: unknown): Promise<void> {
    const p = this.path(endpoint, payload);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, JSON.stringify(value, null, 2), "utf8");
  }
}
