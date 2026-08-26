import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const onboarding = readFileSync(
  new URL("../app/onboarding/page.tsx", import.meta.url),
  "utf8",
);
const overview = readFileSync(
  new URL("./operator-overview.tsx", import.meta.url),
  "utf8",
);
const repository = readFileSync(
  new URL("../../../packages/api/src/database-repository.ts", import.meta.url),
  "utf8",
);
const stylesheet = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

describe("business onboarding experience", () => {
  it("presents the shared Duna HQ plans as the branded pricing comparison", () => {
    expect(onboarding).toContain(
      'import { formatMoney, ORGANIZATION_PLANS } from "@duna/core";',
    );
    expect(onboarding).toContain('className="workspace-billing-picker"');
    expect(onboarding).toContain('name="interval"');
    expect(onboarding).toContain('value="month"');
    expect(onboarding).toContain('value="year"');
    expect(onboarding).toContain("plan.definition.productName");
    expect(onboarding).toContain("plan.definition.defaultCommissionBps / 100");
    expect(onboarding).toContain("plan.annualSavingsPercent");
    expect(onboarding).toContain("plan.features.slice(0, 4)");
    expect(onboarding).toContain('className="workspace-plan-card__selection"');
    expect(stylesheet).toContain('.workspace-plan-card[data-featured="true"]');
    expect(stylesheet).toContain(".workspace-plan-card__price");
    expect(stylesheet).toContain(".workspace-plan-card__fee");
  });

  it("makes payment readiness a clear action that opens secure setup", () => {
    expect(overview.match(/\/payments\/setup/g)).toHaveLength(2);
    expect(overview).toContain("hq-analytics-metric__status");
    expect(overview).toContain("Open secure setup");
    expect(overview).not.toContain("Action required");
    expect(repository).toContain('? "Set up payments"');
    expect(repository).toContain(
      "Connect Stripe to accept payments and receive payouts.",
    );
    expect(repository).not.toContain("Finish setup");
    expect(repository).not.toContain(
      "Verify the account before publishing paid sessions.",
    );
  });
});
