import {
  createApiContext,
  createCaller,
  getOrganizationSetupReadiness,
} from "@duna/api";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ getServerCaller: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => new Map() }));
import { firstDayDashboard, firstDayWorkspace } from "./today-data";
import {
  askSuggestions,
  attentionItems,
  glanceMetrics,
  isFirstDay,
  scheduleStatus,
} from "./today-model";

async function demo() {
  const caller = createCaller(createApiContext());
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  return { dashboard, workspace };
}

describe("Today", () => {
  it("opens Duna Pay setup when payments are not connected, in Duna's words", async () => {
    const { dashboard } = await demo();
    const items = attentionItems({
      dashboard: {
        ...dashboard,
        organization: { ...dashboard.organization, stripeStatus: "pending" },
        alerts: [
          {
            id: "stripe",
            title: "Set up payments",
            detail: "Connect Stripe to accept payments and receive payouts.",
            action: "Open secure setup",
            tone: "warning",
          },
        ],
      },
      matches: [],
    });
    expect(items[0]).toMatchObject({
      title: "Set up Duna Pay",
      href: "/money/setup",
    });
    // The provider's name never reaches the screen.
    expect(JSON.stringify(items)).not.toMatch(/stripe/i);
  });

  it("puts sessions that are almost full and matches to score in Needs you", async () => {
    const { dashboard } = await demo();
    const items = attentionItems({
      dashboard,
      matches: [
        { id: "m1", status: "live" } as never,
        { id: "m2", status: "scheduled" } as never,
      ],
    });
    expect(
      items.some((item) => item.title === "2 matches are waiting for a score"),
    ).toBe(true);
    const filling = dashboard.schedule.filter(
      (item) => item.state === "almost-full",
    );
    for (const item of filling) {
      expect(items.some((entry) => entry.id === `filling-${item.id}`)).toBe(
        true,
      );
    }
  });

  it("reads schedule states as status chips (Live only for play in progress)", () => {
    const base = { spotsRemaining: 1 } as never as Parameters<
      typeof scheduleStatus
    >[0];
    expect(scheduleStatus({ ...base, state: "live" })).toEqual({
      label: "Live",
      tone: "live",
    });
    expect(scheduleStatus({ ...base, state: "almost-full" })?.label).toBe(
      "1 spot left",
    );
    expect(scheduleStatus({ ...base, state: "open" })).toBeUndefined();
  });

  it("treats a club with nothing yet as its first day, with setup as the next step", async () => {
    const { dashboard, workspace } = await demo();
    const empty = firstDayDashboard(dashboard);
    expect(isFirstDay({ dashboard: empty, memberCount: 0 })).toBe(true);
    expect(isFirstDay({ dashboard, memberCount: 3 })).toBe(false);
    const setup = getOrganizationSetupReadiness(firstDayWorkspace(workspace));
    expect(setup.complete).toBe(false);
    const suggestions = askSuggestions({ dashboard: empty, setup });
    expect(suggestions[0]).toBe(
      `Help me ${setup.nextStep!.label.toLowerCase()}`,
    );
    expect(suggestions).toContain("Draft our first week of sessions");
  });

  it("keeps the payments prompt out of the numbers row", () => {
    expect(
      glanceMetrics([
        { label: "Gross sales", value: "$0.00" },
        { label: "Payments", value: "Set up payments" },
      ]).map((metric) => metric.label),
    ).toEqual(["Gross sales"]);
  });
});
