/**
 * BELONG browser smoke test (Playwright).
 *
 *   BASE_URL=http://localhost:3000 npm run test:e2e
 *
 * Needs a running server in demo mode with a freshly seeded database.
 * Walks the full member journey in a real browser, visits every page at
 * desktop and phone widths, and fails on console errors, failed requests,
 * error pages or horizontal overflow. Screenshots go to ./e2e-screenshots.
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(require.resolve("playwright", { paths: [process.env.NODE_PATH ?? "", "/opt/node22/lib/node_modules", "/usr/lib/node_modules", "/usr/local/lib/node_modules"] })));
}

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.E2E_SHOTS === "0" ? null : "e2e-screenshots";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const failures = [];
let checks = 0;
const ok = (cond, msg) => {
  checks++;
  if (!cond) {
    failures.push(msg);
    console.log(`  ✗ ${msg}`);
  }
};
const step = (name) => console.log(`\n▸ ${name}`);

function watch(page, label) {
  page.on("console", (m) => {
    if (m.type() === "error") failures.push(`[${label}] console error on ${page.url()}: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => failures.push(`[${label}] page error on ${page.url()}: ${String(e).slice(0, 300)}`));
  page.on("response", (r) => {
    if (r.status() >= 500) failures.push(`[${label}] HTTP ${r.status()} for ${r.url()}`);
  });
}

async function visit(page, path, label, { shot = true } = {}) {
  const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
  ok(res && res.status() < 400, `${label}: ${path} returned ${res?.status()}`);
  const text = await page.locator("body").innerText();
  ok(!/Something went wrong|Application error|We couldn't find that page/i.test(text), `${label}: ${path} shows an error page`);
  ok((await page.locator("h1").count()) >= 1, `${label}: ${path} has no <h1>`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 1, `${label}: ${path} overflows horizontally by ${overflow}px`);
  if (SHOT_OK(shot)) await page.screenshot({ path: `${SHOTS}/${label}-${path.replace(/[^a-z0-9]+/gi, "_") || "home"}.png`, fullPage: true });
  return text;
}
const SHOT_OK = (shot) => Boolean(SHOTS && shot);

const MARKETING = ["/", "/pricing", "/about", "/safety", "/privacy", "/terms", "/support", "/login", "/register"];
const MEMBER = ["/dashboard", "/companion", "/companion/settings", "/memories", "/discover", "/live", "/introductions", "/messages", "/connections", "/circles", "/events", "/graph", "/profile", "/settings", "/settings/privacy", "/membership", "/notifications", "/help"];
const ADMIN = ["/admin", "/admin/users", "/admin/signals", "/admin/matching", "/admin/introductions", "/admin/circles", "/admin/moderation", "/admin/subscriptions", "/admin/analytics", "/admin/flags", "/admin/audit"];

const browser = await chromium.launch();
try {
  /* ---------------------------------------------------------------- public */
  step("Public site (desktop + phone)");
  for (const [label, viewport] of [
    ["desktop", { width: 1280, height: 800 }],
    ["phone", { width: 390, height: 844 }],
  ]) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    watch(page, `public-${label}`);
    for (const p of MARKETING) await visit(page, p, `public-${label}`);
    await ctx.close();
  }

  step("Access control for signed-out visitors");
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    for (const p of ["/dashboard", "/companion", "/admin", "/messages"]) {
      await page.goto(BASE + p, { waitUntil: "networkidle" });
      ok(new URL(page.url()).pathname === "/login", `signed-out visit to ${p} should redirect to /login (got ${page.url()})`);
    }
    const health = await ctx.request.get(BASE + "/api/health");
    ok(health.ok() && (await health.json()).status === "ok", "/api/health should report ok");
    ok((await ctx.request.get(BASE + "/api/account/export")).status() === 401, "data export must require sign-in");
    ok((await ctx.request.post(BASE + "/api/cron/network")).status() !== 200, "cron endpoint must not run without its secret");
    await ctx.close();
  }

  /* ------------------------------------------------- the full member journey */
  step("New member journey: join → companion → signal → match → introduction → connection → message");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  watch(page, "journey");
  const email = `e2e-${Date.now()}@example.test`;

  await page.goto(BASE + "/register");
  await page.fill('input[name="displayName"]', "Robin");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "a-long-test-password");
  await page.check('input[name="ageConfirmed"]');
  await page.check('input[name="termsAccepted"]');
  await page.click('button[type="submit"]');
  await page.waitForURL("**/onboarding");
  ok(true, "registered");

  // 1. About you
  await page.fill('input[name="area"]', "Southville, Bristol");
  await page.click("text=Continue");
  // 2. Interests
  await page.click("text=Continue"); // should be blocked: needs two interests
  ok(await page.locator("text=Choose at least two interests").first().isVisible(), "onboarding should require two interests");
  for (const t of ["hiking", "coffee", "photography"]) await page.click(`button.chip-toggle:text-is("${t}")`);
  await page.click("text=Continue");
  // 3. Social style
  await page.click("label.chip-toggle:has-text('in small groups')");
  await page.click("label.chip-toggle:has-text('New friends')");
  await page.click("text=Continue");
  // 4. Companion
  await page.fill('input[name="companionName"]', "Willow");
  await page.click("text=Continue");
  // 5. Privacy — everything must start OFF
  ok((await page.locator('input[role="switch"]:checked').count()) === 0, "consent switches must start switched off");
  await page.click("text=Use recommended settings");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/journey-onboarding-privacy.png`, fullPage: true });
  await page.click("text=Finish and meet my companion");
  await page.waitForURL("**/companion**");
  ok(await page.locator("text=Willow").first().isVisible(), "companion should use the chosen name");
  ok(await page.locator("text=Simulated companion").first().isVisible(), "simulated AI must be labelled");

  // Companion conversation → intention proposal
  await page.fill("#companion-message", "I'd love to find someone to go hiking with this weekend");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=Share this intention?");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/journey-companion-proposal.png` });
  await page.click("button:has-text('Share for 4 days')");
  await page.waitForSelector("text=Share this intention?", { state: "detached" });
  ok(true, "intention approved and shared");

  // Memory proposal
  await page.fill("#companion-message", "I really enjoy board games and I can teach photography");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=Can share: photography");
  // The companion may propose more than one memory; decide on each of them.
  for (let n = await page.locator("button:has-text('Remember privately')").count(); n > 0; n--) {
    await page.locator("button:has-text('Remember privately')").first().click();
    await page.waitForFunction((want) => document.querySelectorAll("button").length && [...document.querySelectorAll("button")].filter((b) => b.textContent.includes("Remember privately")).length === want, n - 1);
  }

  // Privacy page shows the signal
  const privacy = await visit(page, "/settings/privacy", "journey");
  ok(/hiking/i.test(privacy) && /Current moment/i.test(privacy), "privacy page should list the shared hiking moment");

  // Discover → match → ask
  const discover = await visit(page, "/discover", "journey");
  ok(/Why your companion thinks you'd get along/i.test(discover), "Discover should show suggested connections");
  ok(/Fictional demo member/.test(discover), "fictional members must be labelled");
  ok((await page.locator("a[href^='/messages/']").count()) === 0, "no conversation may exist before mutual approval");
  const before = await page.locator("button:has-text('Ask for an introduction')").count();
  ok(before > 0, "there should be someone to ask for an introduction");
  await page.locator("button:has-text('Ask for an introduction')").first().click();
  await page.waitForSelector("text=Waiting for");
  await visit(page, "/messages", "journey", { shot: false });
  ok(await page.locator("text=No conversations yet").first().isVisible(), "one-sided approval must not open messaging");

  // Demo: simulate the fictional member's yes
  await visit(page, "/introductions", "journey");
  await page.locator("button:has-text('Simulate')").first().click();
  await page.waitForSelector("text=Open conversation");
  await page.click("text=Open conversation");
  await page.waitForURL("**/messages/**");
  await page.waitForSelector("h2:has-text('Connection assistant')");
  ok(true, "connection assistant appears");
  await page.fill("#message-input", "Hello! Lovely to be introduced.");
  await page.keyboard.press("Enter");
  await page.waitForSelector("text=simulated reply from a fictional demo member");
  ok(true, "messaging works after mutual approval; simulated reply is labelled");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/journey-conversation.png`, fullPage: true });

  // Circles, events, membership
  await visit(page, "/circles", "journey", { shot: false });
  await page.locator("button:has-text('Join Circle')").first().click();
  await page.waitForSelector('a:text-is("Open Circle")');
  await page.locator('a:text-is("Open Circle")').first().click();
  await page.waitForSelector("text=Who's here");
  ok(true, "joined a Circle");
  await visit(page, "/events", "journey", { shot: false });
  await page.locator("button:has-text(\"I'll be there\")").first().click();
  await page.waitForSelector("text=In your diary");
  await visit(page, "/membership", "journey", { shot: false });
  page.once("dialog", (d) => d.accept());
  await page.locator("button:has-text('Upgrade to Premium')").click();
  await page.waitForSelector("button:has-text('Cancel membership')");
  ok(await page.locator("text=Simulated payments").first().isVisible(), "simulated payments must be labelled");

  // A member may not open the admin console or another member's conversation.
  await page.goto(BASE + "/admin", { waitUntil: "networkidle" });
  ok(new URL(page.url()).pathname === "/dashboard", "members must be redirected away from /admin");
  await page.goto(BASE + "/messages/00000000-0000-0000-0000-000000000000", { waitUntil: "networkidle" });
  ok(/couldn't find that page/i.test(await page.locator("body").innerText()), "unknown or forbidden conversations show not-found");

  step("Every member page, desktop then phone");
  for (const p of MEMBER) await visit(page, p, "member-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const p of MEMBER) await visit(page, p, "member-phone");
  await page.goto(BASE + "/dashboard");
  await page.click("button:has-text('More')");
  ok(await page.locator("#mobile-menu").isVisible(), "phone menu should open");
  await page.locator("#mobile-menu a:has-text('Circles')").click();
  await page.waitForURL("**/circles");

  // Data export and account deletion
  await page.setViewportSize({ width: 1280, height: 860 });
  const exp = await ctx.request.get(BASE + "/api/account/export");
  const data = await exp.json();
  ok(data.account?.email === email && Array.isArray(data.memories), "data export should contain the member's own data");
  ok(!JSON.stringify(data).includes("password_hash"), "data export must not include the password hash");
  await page.goto(BASE + "/settings/privacy");
  await page.click("text=Delete my account…");
  await page.fill('input[name="password"]', "a-long-test-password");
  await page.fill('input[name="confirm"]', "DELETE");
  await page.click("button:has-text('Permanently delete everything')");
  await page.waitForURL("**/?deleted=1");
  await page.goto(BASE + "/dashboard", { waitUntil: "networkidle" });
  ok(new URL(page.url()).pathname === "/login", "deleted accounts are signed out");
  await ctx.close();

  /* ------------------------------------------------------------ demo member */
  step("Seeded demo member (Alex)");
  {
    const c = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await c.newPage();
    watch(p, "alex");
    await p.goto(BASE + "/login");
    await p.click("button:has-text('Explore as Alex')");
    await p.waitForURL("**/dashboard");
    for (const path of ["/dashboard", "/discover", "/live", "/introductions", "/graph", "/memories", "/circles"]) await visit(p, path, "alex");
    await p.goto(BASE + "/circles");
    await p.locator('a:text-is("Open Circle")').first().click();
    await p.waitForSelector("text=Who's here");
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/alex-circle.png`, fullPage: true });
    await c.close();
  }

  /* ------------------------------------------------------------------ admin */
  step("Admin console");
  {
    const c = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await c.newPage();
    watch(p, "admin");
    await p.goto(BASE + "/login");
    await p.click("button:has-text('Open admin console')");
    await p.waitForURL("**/admin");
    for (const path of ADMIN) await visit(p, path, "admin-desktop");
    await p.goto(BASE + "/admin/matching");
    await p.click("button:has-text('Run now')");
    await p.waitForSelector("text=Compared");
    ok(true, "admin can run the agent network");
    await p.setViewportSize({ width: 390, height: 844 });
    for (const path of ADMIN) await visit(p, path, "admin-phone", { shot: false });
    await c.close();
  }
} catch (e) {
  failures.push(`Uncaught: ${e.stack ?? e}`);
  // Capture what the browser was showing when the run stopped.
  for (const c of browser.contexts()) for (const p of c.pages()) if (SHOTS) await p.screenshot({ path: `${SHOTS}/FAILURE.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

console.log(`\n${checks} checks, ${failures.length} problem(s).`);
if (failures.length) {
  for (const f of [...new Set(failures)]) console.log(` - ${f}`);
  process.exit(1);
}
console.log("All browser checks passed.");
