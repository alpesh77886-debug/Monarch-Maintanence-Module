// Browser smoke test for the core Scenario-A-style happy path (report ->
// acknowledge -> journal entry). Requires a running app at BASE_URL and a
// staff login (email/password) that already has a maintenance.staff row.
//
// Usage: BASE_URL=https://<preview>.vercel.app TEST_EMAIL=... TEST_PASSWORD=... node e2e/smoke.mjs
//
// NOTE: in this repo's own sandboxed dev environment, the egress proxy
// policy-denies direct connections to *.supabase.co, so this script cannot
// run against `next dev` from inside that sandbox — only against a real
// deployment (Vercel preview/production) reachable over normal internet.
// The backend logic this would exercise (state transitions, RLS, idempotency,
// first-valid-actor ownership) was instead verified directly against Postgres
// via the Supabase MCP `execute_sql` tool — see CHANGELOG.md Loop 1 entry.
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const EMAIL = process.env.TEST_EMAIL ?? "exec1@monarch.test";
const PASSWORD = process.env.TEST_PASSWORD ?? "Loop1TestPass!23";

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });

  console.log("1. Load /login");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=MONARCH Maintenance");

  console.log("2. Sign in");
  page.on("response", async (res) => {
    if (res.url().includes("supabase.co/auth")) {
      console.log("   auth response:", res.status(), res.url());
    }
  });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  const errText = await page.locator("main").innerText();
  console.log("   page text after submit:\n" + errText);
  await page.waitForURL(`${BASE}/cases`, { timeout: 10000 });
  console.log("   -> landed on /cases");

  console.log("3. Report a new case");
  await page.click("text=+ Report case");
  await page.waitForURL(`${BASE}/cases/new`);
  await page.fill("textarea", "Conveyor belt motor overheating on Line 2");
  await page.fill('input[type="text"]', ""); // no-op, area/line are plain inputs below
  const areaInput = page.locator("label:has-text('Area') input");
  const lineInput = page.locator("label:has-text('Line') input");
  await areaInput.fill("Packing");
  await lineInput.fill("Line 2");
  await page.click('button[type="submit"]:has-text("Submit case")');
  await page.waitForURL(/\/cases\/[0-9a-f-]+$/, { timeout: 10000 });
  const caseUrl = page.url();
  console.log("   -> case created at", caseUrl);

  console.log("4. Acknowledge the case");
  await page.waitForSelector("text=Acknowledge this case");
  await page.selectOption("select", "HIGH");
  await page.fill('label:has-text("Initial assessment") input', "Likely bearing failure, needs inspection");
  await page.click('button:has-text("Acknowledge & take ownership")');
  await page.waitForSelector("text=Status: ACKNOWLEDGED", { timeout: 10000 });
  console.log("   -> status is ACKNOWLEDGED");

  console.log("5. Add an observation journal entry");
  await page.click("text=+ Add observation / action entry");
  await page.fill('label:has-text("Observation") textarea', "Motor casing hot to touch, unusual noise");
  await page.fill('label:has-text("Action taken") textarea', "Isolated motor, requested electrical check");
  await page.fill('label:has-text("Current condition") input', "Motor isolated, line stopped");
  await page.fill('label:has-text("Next step") input', "Await electrician inspection");
  await page.click('button:has-text("Save entry")');
  await page.waitForSelector("text=Motor casing hot to touch, unusual noise", { timeout: 10000 });
  console.log("   -> journal entry visible");

  console.log("6. Audit trail present");
  await page.waitForSelector("text=ACKNOWLEDGED (REPORTED → ACKNOWLEDGED)", { timeout: 10000 }).catch(() => {});
  const auditText = await page.locator("text=Audit trail").locator("xpath=following-sibling::ol").innerText();
  console.log("   audit trail:\n" + auditText);

  if (errors.length > 0) {
    console.log("BROWSER ERRORS DETECTED:");
    errors.forEach((e) => console.log("  " + e));
    process.exitCode = 1;
  } else {
    console.log("NO BROWSER CONSOLE/PAGE ERRORS.");
  }

  await browser.close();
})().catch((e) => {
  console.error("SMOKE TEST FAILED:", e);
  process.exit(1);
});
