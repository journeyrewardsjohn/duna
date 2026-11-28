import { describe, expect, it } from "vitest";
import {
  kindFromParam,
  mediaInput,
  missingSentence,
  missingSummary,
  offeringRule,
  priceSummary,
  publishChecklist,
  ruleSummary,
  saveInputFromItem,
  scheduleSummary,
  templateConfiguration,
  templateFor,
  templateFromLegacy,
} from "./offering-model";
import { demoOfferingIds, demoOfferings } from "./offerings-demo";

const find = (id: string) => demoOfferings.find((item) => item.id === id)!;
const clubDefault = {
  rules: {
    version: 2,
    unit: "player",
    minParticipants: 3,
    minimumPolicy: "cancel",
    lockMinutesBeforeStart: 1_440,
    waitlist: true,
    tiers: [],
  },
  appliesTo: ["service"],
};

describe("an offering in a row", () => {
  it("says the price, the schedule and the group in plain words", () => {
    const clinic = find(demoOfferingIds.clinic);
    expect(priceSummary(clinic, "USD")).toBe("$45.00 a session · 3 credits");
    expect(scheduleSummary(clinic)).toBe("Thursdays 6:00 PM · Dec 1 to Jan 31");
    expect(ruleSummary(clinic, offeringRule(clinic, clubDefault))).toBe(
      "4 to 12 players · price by group size",
    );
    const membership = find(demoOfferingIds.membership);
    expect(priceSummary(membership, "USD")).toBe("$120.00 a month");
    expect(scheduleSummary(membership)).toBe("Billed monthly");
  });

  it("inherits the club default only without a rule of its own", () => {
    const small = find(demoOfferingIds.smallGroup);
    const rule = offeringRule(small, clubDefault);
    expect(rule.source).toBe("club-default");
    expect(ruleSummary(small, rule)).toBe("3 to 6 players");
    expect(offeringRule(find(demoOfferingIds.clinic), clubDefault).source).toBe(
      "own",
    );
    expect(
      offeringRule(find(demoOfferingIds.privateLesson), clubDefault).source,
    ).toBe("none");
  });

  it("maps the old type pages and links onto kinds and templates", () => {
    expect(kindFromParam("services")?.type).toBe("service");
    expect(kindFromParam("plan")?.id).toBe("plans");
    expect(templateFromLegacy("service", "program")?.id).toBe("program");
    expect(templateFromLegacy("plan", undefined)?.type).toBe("plan");
  });
});

describe("the publish checklist", () => {
  const draftShirt = find(demoOfferingIds.shirt);

  it("blocks card offerings until Duna Pay is ready, and links to the next step", () => {
    const list = publishChecklist(draftShirt, {
      gate: {
        ready: false,
        steps: [
          {
            key: "business",
            label: "Confirm your business",
            state: "done",
            href: "/money/duna-pay",
          },
          {
            key: "verify",
            label: "Verify",
            state: "to-do",
            href: "/money/duna-pay/verify",
          },
          {
            key: "payouts",
            label: "Choose payouts",
            state: "to-do",
            href: "/money/payouts",
          },
        ],
      },
      coachCount: 1,
      hasActiveMembership: true,
      rule: { source: "none" },
    });
    const payments = list.find((entry) => entry.id === "payments")!;
    expect(payments.done).toBe(false);
    expect(payments.href).toBe("/money/duna-pay/verify");
    expect(missingSummary(list)).toEqual([
      "Duna Pay ready to take card payments",
    ]);
    expect(missingSentence(list)).toBe(
      "Before it goes live: finish Duna Pay setup to take card payments.",
    );
  });

  it("asks a draft without a price for one, and a group rule for dates", () => {
    const program = find(demoOfferingIds.program);
    const list = publishChecklist(
      {
        ...program,
        configuration: {
          ...program.configuration,
          participation: clubDefault.rules,
        },
      },
      {
        gate: "unknown",
        coachCount: 0,
        hasActiveMembership: false,
        rule: offeringRule(
          {
            ...program,
            configuration: {
              ...program.configuration,
              participation: clubDefault.rules,
            },
          },
          clubDefault,
        ),
      },
    );
    expect(missingSummary(list)).toEqual([
      "A price players can pay",
      "Set session dates (a group rule needs them)",
    ]);
    expect(list.find((entry) => entry.id === "coach")?.done).toBe(false);
  });
});

describe("saving never resets what a section doesn't own", () => {
  it("keeps every price, option and configuration value", () => {
    const shirt = find(demoOfferingIds.shirt);
    const input = saveInputFromItem(shirt);
    expect(input.priceMinor).toBe(3_000);
    expect(input.allowCash).toBe(true);
    expect(input.options).toEqual([{ name: "Size", values: ["S", "M", "L"] }]);
    expect(input.configuration).toEqual(shirt.configuration);
  });

  it("sends a photo for every variant without a variant index (the old -1 bug)", () => {
    const media = mediaInput(find(demoOfferingIds.shirt));
    expect(media[0]).not.toHaveProperty("variantIndex");
    // The size M photo points at size M by its options, not its position.
    expect(media[1]!.variantIndex).toBe(1);
  });
});

describe("templates", () => {
  it("give group templates set weekly dates, which a group rule needs", () => {
    const configuration = templateConfiguration(templateFor("clinic")!, {
      now: new Date("2026-11-28T12:00:00Z"),
      timeZone: "America/Los_Angeles",
    });
    const schedule = configuration.sessionSchedule as Record<string, unknown>;
    expect(schedule.mode).toBe("recurring");
    expect(schedule.weekdays).toEqual([4]);
    expect(schedule.startsOn).toBe("2026-12-03");
    expect(configuration.capacity).toBe(12);
  });

  it("never suggest a price", () => {
    for (const id of [
      "private-lesson",
      "clinic",
      "membership",
      "credit-pack",
      "apparel",
    ]) {
      const template = templateFor(id)!;
      expect(JSON.stringify(template)).not.toMatch(/priceMinor|amountMinor/);
    }
  });
});
