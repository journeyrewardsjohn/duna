import { teamPaySetCompensationInputSchema } from "@duna/api";
import { sessionPay } from "@duna/api/team-pay-compute";
import {
  teamAvailabilityDemoBlackouts,
  teamAvailabilityDemoSchedules,
  teamAvailabilityDemoTimeOff,
} from "@duna/core/demo/team-availability";
import { teamPayDemoCompensation } from "@duna/core/demo/team-pay";
import { describe, expect, it } from "vitest";
import {
  accessSentences,
  availabilitySummary,
  compensationFormProblem,
  compensationInput,
  compensationSentence,
  compensationShapeOf,
  dateSpanWords,
  formFromCompensation,
  parseInviteContact,
  removesAccess,
  type ScheduleRow,
  windowLabel,
} from "./team-model";
import { payExample } from "./team-pay-example";

const zone = "America/Los_Angeles";
const usd = (amountMinor: number) => ({ amountMinor, currency: "USD" });

const schedule = (
  overrides: Partial<ScheduleRow> & Pick<ScheduleRow, "windows">,
): ScheduleRow => ({
  id: "00000000-0000-4000-8000-000000000001",
  staffProfileId: "00000000-0000-4000-8000-000000000002",
  name: "Winter term",
  status: "active",
  effectiveFrom: "2026-11-01",
  timezone: zone,
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...overrides,
});

const window = (weekday: number, startsAt: string, endsAt: string) => ({
  id: `00000000-0000-4000-8000-0000000001${weekday}${startsAt.slice(0, 2)}`,
  weekday,
  startsAt,
  endsAt,
  kind: "coaching" as const,
});

describe("the pay sentence", () => {
  it("says each model the way an owner would", () => {
    const base = { revenueShareScope: [] as string[] };
    expect(
      compensationSentence({
        ...base,
        model: "per-session",
        perSessionRate: usd(4000),
      }),
    ).toBe("$40.00 per session");
    expect(
      compensationSentence({ ...base, model: "hourly", hourlyRate: usd(2800) }),
    ).toBe("$28.00 an hour for scheduled time");
    expect(
      compensationSentence({
        model: "revenue-share",
        revenueShareBps: 3000,
        revenueShareScope: ["clinic"],
      }),
    ).toBe("30% of net proceeds from clinics");
    expect(
      compensationSentence({
        ...base,
        model: "salary",
        annualSalary: usd(4_800_000),
      }),
    ).toBe("$48,000.00 a year in salary");
    expect(
      compensationSentence({
        model: "hourly-plus-share",
        hourlyRate: usd(4000),
        revenueShareBps: 2000,
        revenueShareScope: ["private-lesson"],
      }),
    ).toBe(
      "$40.00 an hour for scheduled time, plus 20% of net proceeds from private lessons",
    );
    expect(
      compensationSentence({
        model: "revenue-share",
        revenueShareBps: 1250,
        revenueShareScope: [],
      }),
    ).toBe("12.5% of net proceeds from every offering");
  });

  it("reads every demo model, and the form round-trips into a valid setCompensation input", () => {
    for (const current of teamPayDemoCompensation) {
      const form = formFromCompensation(current, current.effectiveFrom);
      expect(compensationFormProblem(form)).toBeUndefined();
      const input = compensationInput(current.staffProfileId, form, "USD");
      expect(teamPaySetCompensationInputSchema.safeParse(input).success).toBe(
        true,
      );
      expect(compensationSentence(compensationShapeOf(form, "USD"))).toBe(
        compensationSentence(current),
      );
    }
  });

  it("sends only the fields a model uses, and names what is missing", () => {
    const form = {
      ...formFromCompensation(undefined, "2026-12-01"),
      model: "hourly" as const,
      hourlyRateMinor: 2800,
      perSessionRateMinor: 5000,
      revenueShareScope: ["clinic"],
    };
    expect(compensationInput("p", form, "USD")).toEqual({
      staffProfileId: "p",
      model: "hourly",
      classification: "1099-contractor",
      effectiveFrom: "2026-12-01",
      hourlyRate: usd(2800),
      revenueShareScope: [],
    });
    expect(compensationFormProblem({ ...form, hourlyRateMinor: null })).toBe(
      "Enter the hourly rate.",
    );
    expect(
      compensationFormProblem({
        ...form,
        model: "salary",
        annualSalaryMinor: 1,
      }),
    ).toBe("Salary is for employees (W-2) only.");
  });

  it("takes the worked example from the backend's own pay function", () => {
    const form = {
      ...formFromCompensation(undefined, "2026-12-01"),
      model: "hourly-plus-share" as const,
      hourlyRateMinor: 4000,
      revenueShareBps: 2000,
    };
    const example = payExample(form, "USD");
    const direct = sessionPay(
      {
        key: "k",
        kind: "session",
        staffProfileId: "s",
        startsAt: "2027-01-06T17:00:00.000Z",
        endsAt: "2027-01-06T18:30:00.000Z",
        localDate: "2027-01-06",
        minutes: 90,
        attended: true,
        revenueMinor: 10_000,
      },
      {
        id: "m",
        staffProfileId: "s",
        model: "hourly-plus-share",
        classification: "1099-contractor",
        effectiveFrom: "2000-01-01",
        hourlyRateMinor: 4000,
        revenueShareBps: 2000,
        revenueShareScope: [],
      },
    );
    expect(example?.lines.at(-1)).toEqual({
      label: "For this session",
      amount: "$80.00",
    });
    expect(direct.amountMinor).toBe(8000);
    expect(
      payExample({ ...form, hourlyRateMinor: null }, "USD"),
    ).toBeUndefined();
  });
});

describe("the availability sentence", () => {
  const now = "2026-11-28T18:00:00.000Z";

  it("names days and parts of the day from the schedule in force", () => {
    expect(
      availabilitySummary({
        schedules: [
          schedule({
            windows: [window(2, "17:00", "21:00"), window(4, "18:00", "21:00")],
          }),
        ],
        blackouts: [],
        timeOff: [],
        now,
        timeZone: zone,
      }),
    ).toBe("Available Tue and Thu evenings");
  });

  it("adds the next time away (blackouts and approved time off only)", () => {
    expect(
      availabilitySummary({
        schedules: [
          schedule({
            windows: [window(2, "17:00", "21:00"), window(4, "17:00", "21:00")],
          }),
        ],
        blackouts: [],
        timeOff: [
          {
            startsAt: "2026-12-12T08:00:00.000Z",
            endsAt: "2026-12-20T08:00:00.000Z",
            status: "approved",
          },
          {
            startsAt: "2026-12-01T08:00:00.000Z",
            endsAt: "2026-12-02T08:00:00.000Z",
            status: "requested",
          },
        ],
        now,
        timeZone: zone,
      }),
    ).toBe("Available Tue and Thu evenings; off 12 to 19 December");
  });

  it("reads the demo coach: drafts and archived schedules never count", () => {
    const theo = teamAvailabilityDemoSchedules.filter(
      (row) =>
        row.staffProfileId === teamAvailabilityDemoSchedules[0]!.staffProfileId,
    );
    expect(
      availabilitySummary({
        schedules: theo,
        blackouts: teamAvailabilityDemoBlackouts,
        timeOff: teamAvailabilityDemoTimeOff,
        now,
        timeZone: zone,
      }),
    ).toBe(
      "Available Mon and Wed afternoons and evenings, Tue mornings, afternoons and evenings, Fri afternoons, Sat mornings; off 12 to 13 December (and 1 more time away)",
    );
  });

  it("is honest when there is nothing to read", () => {
    const base = { blackouts: [], timeOff: [], now, timeZone: zone };
    expect(availabilitySummary({ ...base, schedules: [] })).toBe(
      "No availability set",
    );
    expect(
      availabilitySummary({
        ...base,
        schedules: [
          schedule({ status: "draft", windows: [window(1, "09:00", "12:00")] }),
        ],
      }),
    ).toBe("No schedule in force today");
  });

  it("writes times and date spans plainly", () => {
    expect(windowLabel("15:00", "20:00")).toBe("3:00–8:00 PM");
    expect(windowLabel("07:00", "12:30")).toBe("7:00 AM–12:30 PM");
    expect(dateSpanWords("2026-11-30", "2026-12-02")).toBe(
      "30 November to 2 December",
    );
    expect(dateSpanWords("2026-12-12", "2026-12-12")).toBe("12 December");
  });
});

describe("invitations and access", () => {
  it("reads one contact field as an email or a mobile number", () => {
    expect(parseInviteContact("Jordan@Example.com")).toEqual({
      kind: "email",
      email: "jordan@example.com",
    });
    expect(parseInviteContact("(704) 555-0123")).toEqual({
      kind: "phone",
      phoneE164: "+17045550123",
    });
    expect(parseInviteContact("+44 7700 900123")).toEqual({
      kind: "phone",
      phoneE164: "+447700900123",
    });
    expect(parseInviteContact("")).toEqual({ kind: "none" });
    expect(parseInviteContact("jordan@").kind).toBe("invalid");
  });

  it("says what a role can and cannot do, and when a change takes access away", () => {
    const coach = ["members:read", "sessions:read", "messages:write"];
    const manager = [...coach, "members:write", "payments:read"];
    expect(accessSentences(coach).cannot).toContain(
      "Can't see money or anyone else's pay (their own pay, yes).",
    );
    expect(accessSentences(["*"]).cannot).toEqual([]);
    expect(removesAccess(manager, coach)).toBe(true);
    expect(removesAccess(coach, manager)).toBe(false);
    expect(removesAccess(["*"], manager)).toBe(true);
  });
});
