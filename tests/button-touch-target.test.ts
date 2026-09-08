import { describe, it, expect } from "vitest";
import { buttonClass } from "../src/components/ui";

// Loop 48 — §30 mobile-first UX, §32 item 21.
//
// The "md" size is the default/primary action size across the app — every
// "Save", "Acknowledge", "Submit" button on the primary operating surface —
// and it computed to roughly 36px tall (py-2 = 16px vertical padding +
// text-sm's 20px line-height), under the ~48px minimum touch target §30
// names. "sm" stays deliberately compact: it is the smaller size for
// secondary/inline actions (26 call sites — row-level buttons in dense
// lists like spares-panel), not the primary tap target the guideline is
// about, so it is NOT touched here.
//
// This is a plain function test (buttonClass returns a string, no JSX), so
// it needs no component-render tooling this project doesn't otherwise use —
// tests/ is exclusively Supabase RPC integration tests; this is the one
// exception, testing a pure presentational helper with zero I/O.

describe("buttonClass — mobile touch targets", () => {
  it("gives the default 'md' size a >=48px minimum height", () => {
    const cls = buttonClass("primary", "md");
    expect(cls).toMatch(/min-h-12\b/);
  });

  it("leaves 'sm' compact — it is the deliberate secondary-action size", () => {
    const cls = buttonClass("primary", "sm");
    expect(cls).not.toMatch(/min-h-12\b/);
  });

  it("applies to every button variant, not just 'primary'", () => {
    (["primary", "secondary", "danger", "warning", "success", "ghost"] as const).forEach((variant) => {
      expect(buttonClass(variant, "md")).toMatch(/min-h-12\b/);
    });
  });
});
