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

/** Constant-time-ish bearer check for the ingest API. */
export function checkBearer(req: Request, key?: string): boolean {
  if (!key) return false;
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m != null && m[1] === key;
}

export function eur(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n).toLocaleString("hr-HR")} €`;
}
