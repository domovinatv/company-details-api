/**
 * Thin client over the Firecrawl v2 HTTP API — TypeScript port of the client
 * used in klubovi.domovina.ai (src/firecrawl.py).
 *
 * We talk to the API directly (not via the MCP server) so it can run from the
 * local CLI now and from a Cloudflare Worker later — it only needs `fetch` and
 * a Cache implementation.
 *
 * Endpoints used:
 *   POST /v2/search  -> find candidate URLs for an entity query
 *   POST /v2/scrape  -> clean markdown OR an LLM-extracted JSON object from a
 *                        single URL, driven by a JSON schema we pass in
 *
 * Features ported from the Python client:
 *   - multiple API keys with automatic rotation on credit exhaustion
 *   - on-disk (pluggable) response cache so repeats don't burn credits
 *   - throttle + exponential backoff on 429
 */
import type { Cache } from "./cache.ts";
import { NullCache } from "./cache.ts";

const BASE_URL = "https://api.firecrawl.dev/v2";

export class InsufficientCreditsError extends Error {}

export interface FirecrawlOptions {
  apiKeys?: string[];
  throttleS?: number;
  cache?: Cache;
}

export interface SearchHit {
  url?: string;
  title?: string;
  description?: string;
}

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class FirecrawlClient {
  private readonly apiKeys: string[];
  private activeIdx = 0;
  private readonly throttleMs: number;
  private readonly cache: Cache;
  private lastRequest = 0;
  creditsUsed = 0;

  constructor(opts: FirecrawlOptions = {}) {
    let keys = opts.apiKeys;
    if (!keys || keys.length === 0) {
      const multi = (process.env.FIRECRAWL_API_KEYS ?? "").trim();
      if (multi) {
        keys = multi.split(",").map((k) => k.trim()).filter(Boolean);
      } else if (process.env.FIRECRAWL_API_KEY) {
        keys = [process.env.FIRECRAWL_API_KEY];
      } else {
        keys = [];
      }
    }
    if (keys.length === 0) {
      throw new Error("FIRECRAWL_API_KEY(S) not set (env or .env)");
    }
    this.apiKeys = keys;
    this.throttleMs = Math.round((opts.throttleS ?? (Number(process.env.FIRECRAWL_THROTTLE_S) || 0.5)) * 1000);
    this.cache = opts.cache ?? new NullCache();
  }

  get apiKey(): string {
    return this.apiKeys[this.activeIdx]!;
  }

  private rotateKey(): boolean {
    if (this.activeIdx + 1 >= this.apiKeys.length) return false;
    this.activeIdx++;
    console.warn(`firecrawl rotated to key #${this.activeIdx + 1}/${this.apiKeys.length}`);
    return true;
  }

  private async post(endpoint: string, payload: unknown): Promise<any> {
    const cached = await this.cache.get(endpoint, payload);
    if (cached != null) return cached;

    const elapsed = Date.now() - this.lastRequest;
    if (elapsed < this.throttleMs) await sleep(this.throttleMs - elapsed);

    const url = `${BASE_URL}/${endpoint}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      this.lastRequest = Date.now();

      if (resp.status === 429) {
        const wait = 2 ** attempt * 1000;
        console.warn(`firecrawl 429, sleeping ${wait}ms`);
        await sleep(wait);
        continue;
      }

      const text = await resp.text();
      const isInsufficient =
        resp.status === 402 || (resp.status === 429 && text.toLowerCase().includes("insufficient"));
      if (isInsufficient) {
        if (this.rotateKey()) continue; // retry same request with next key
        throw new InsufficientCreditsError(text.slice(0, 300));
      }
      if (resp.status >= 400) {
        throw new Error(`firecrawl ${endpoint} ${resp.status}: ${text.slice(0, 300)}`);
      }

      const data = JSON.parse(text);
      const credits =
        data?.data?.metadata?.creditsUsed ?? data?.data?.creditsUsed ?? data?.creditsUsed;
      if (typeof credits === "number") this.creditsUsed += credits;
      await this.cache.set(endpoint, payload, data);
      return data;
    }
    throw new Error(`firecrawl rate limit exhausted for ${endpoint}`);
  }

  async remainingCredits(): Promise<number | null> {
    try {
      const r = await fetch(`${BASE_URL}/team/credit-usage`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!r.ok) return null;
      const j = (await r.json()) as any;
      return Number(j?.data?.remainingCredits ?? 0);
    } catch {
      return null;
    }
  }

  /** Skip exhausted keys up-front so the retry loop doesn't burn its attempt
   *  budget on 402s before reaching a key with credits. Returns the chosen key
   *  index, or -1 if none has more than `min` credits. */
  async selectFundedKey(min = 50): Promise<number> {
    for (let i = 0; i < this.apiKeys.length; i++) {
      this.activeIdx = i;
      const rem = await this.remainingCredits();
      if (rem != null && rem > min) return i;
    }
    return -1;
  }

  async search(query: string, limit = 5): Promise<SearchHit[]> {
    const data = await this.post("search", { query, limit });
    return (data?.data?.web ?? []) as SearchHit[];
  }

  async scrapeJson<T = Record<string, unknown>>(
    url: string,
    schema: JsonSchema,
    prompt: string,
  ): Promise<T> {
    const data = await this.post("scrape", {
      url,
      formats: [{ type: "json", prompt, schema }],
    });
    return (data?.data?.json ?? {}) as T;
  }

  /** Plain clean-markdown scrape, for sources we parse ourselves. */
  async scrapeMarkdown(url: string): Promise<string> {
    const data = await this.post("scrape", { url, formats: ["markdown"] });
    return (data?.data?.markdown ?? "") as string;
  }
}
