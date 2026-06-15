import { Hono } from "hono";
import type { Env } from "./types";
import { admin } from "./admin/app";
import { api } from "./api";
import { summaryCounts } from "./db";

// strict:false → /admin i /admin/ se tretiraju jednako (korisnici tipkaju oboje).
const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  const counts = await summaryCounts(c.env.DB).catch(() => ({}));
  return c.json({
    service: "firme.domovina.ai",
    purpose:
      "Razvrstavanje veličine hrvatskih poduzetnika (mikro/mali/srednji/veliki) i praćenje zaposlenih u udrugama, iz javnih izvora.",
    admin: "/admin",
    api: {
      classify: "POST /api/classify  { companies:[{oib,name}] }  (Bearer INGEST_KEY)",
      ingest: "POST /api/ingest  { records:[...] }  (Bearer INGEST_KEY)",
      list: "GET /api/companies?size=&status=&kind=&q=&limit=&offset=",
      detail: "GET /api/companies/:oib",
    },
    public_v1: {
      lookup: "POST /api/v1/companies  { oibs:[\"...\"] }  (Bearer <API ključ cdk_…>)",
      detail: "GET /api/v1/companies/:oib  (Bearer <API ključ>)",
      keys: "kreiraj/ugasi ključeve u /admin/keys",
    },
    klasifikacija: "Zakon o računovodstvu (NN 85/24, čl. 5)",
    counts,
  });
});

app.route("/admin", admin);
app.route("/api", api);

export default app;
