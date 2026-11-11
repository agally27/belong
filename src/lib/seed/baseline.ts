import type { Db } from "../db/types";
import { DEFAULT_FLAGS, DEFAULT_PLANS } from "../config";
import { DEFAULT_WEIGHTS } from "../matching/engine";

/** Reference data every installation needs (plans, flags, matching weights). Idempotent. */
export async function ensureBaseline(db: Db) {
  const ts = new Date().toISOString();
  const havePlans = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM plans");
  if (!Number(havePlans?.n)) {
    let sort = 0;
    for (const p of DEFAULT_PLANS) {
      await db.run(
        "INSERT INTO plans (id, name, tagline, price_pence, currency, billing_interval, features, limits, active, sort, updated_at) VALUES (?, ?, ?, ?, 'GBP', 'month', ?, ?, 1, ?, ?)",
        [p.id, p.name, p.tagline, p.pricePence, JSON.stringify(p.features), JSON.stringify(p.limits), sort++, ts],
      );
    }
  }
  for (const f of DEFAULT_FLAGS) {
    await db.run(
      "INSERT INTO feature_flags (key, description, enabled, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO NOTHING",
      [f.key, f.description, f.enabled ? 1 : 0, ts],
    );
  }
  await db.run(
    "INSERT INTO app_settings (key, value, updated_at) VALUES ('matching_weights', ?, ?) ON CONFLICT (key) DO NOTHING",
    [JSON.stringify(DEFAULT_WEIGHTS), ts],
  );
}
