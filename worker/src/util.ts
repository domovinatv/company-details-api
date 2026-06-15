export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Normalise an OIB to 11 digits, or return null if not valid-shaped. */
export function normOib(input: unknown): string | null {
  const d = String(input ?? "").replace(/\D/g, "");
  return d.length === 11 ? d : null;
}

/** Extract the raw Bearer token from a request, or null. */
export function extractBearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1]!.trim() : null;
}

/** Constant-time-ish bearer check for the ingest API. */
export function checkBearer(req: Request, key?: string): boolean {
  if (!key) return false;
  return extractBearer(req) === key;
}

/** Generate a raw API key for external clients. Prefix 'cdk_' (company details
 *  key) + 32 random bytes hex. Only the SHA-256 hash is stored. */
export function genApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "cdk_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newId(): string {
  return crypto.randomUUID();
}

export function eur(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n).toLocaleString("hr-HR")} €`;
}
