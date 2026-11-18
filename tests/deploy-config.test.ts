import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { env } from "@/lib/config";

const saved = { ...process.env };
afterEach(() => {
  for (const k of ["BELONG_DEMO_MODE", "VERCEL_ENV", "DATABASE_URL"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("demo mode defaults", () => {
  const set = (vars: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };

  it("is on for local development and off for real deployments unless explicitly set", () => {
    set({ BELONG_DEMO_MODE: undefined, VERCEL_ENV: undefined, DATABASE_URL: undefined });
    expect(env.demoMode()).toBe(true);
    set({ VERCEL_ENV: "production" });
    expect(env.demoMode()).toBe(false);
    set({ VERCEL_ENV: "preview", DATABASE_URL: "postgres://example" });
    expect(env.demoMode()).toBe(false);
    set({ BELONG_DEMO_MODE: "true" });
    expect(env.demoMode()).toBe(true); // explicit wins, e.g. a demo deployment
    set({ BELONG_DEMO_MODE: "false", VERCEL_ENV: undefined, DATABASE_URL: undefined });
    expect(env.demoMode()).toBe(false);
  });
});

describe("vercel.json", () => {
  const cfg = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  it("runs in London and calls the network cron at most daily (deploys on every Vercel plan)", () => {
    expect(cfg.regions).toEqual(["lhr1"]);
    const cron = cfg.crons.find((c: { path: string }) => c.path === "/api/cron/network");
    expect(cron).toBeTruthy();
    const [minute, hour] = cron.schedule.split(" ");
    expect(/^\d+$/.test(minute) && /^\d+$/.test(hour)).toBe(true); // a fixed time once a day
  });
});
