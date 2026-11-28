/**
 * Word-for-word parity with Duna HQ's Team screens (H-TEAM,
 * `apps/hq/components/team/team-model.test.ts`). These expectations are
 * HQ's own; if HQ changes a sentence, this test fails until the phone says
 * the same thing (and the sentences move to a shared package: Needs core).
 */
import {
  teamAvailabilityDemoBlackouts,
  teamAvailabilityDemoSchedules,
  teamAvailabilityDemoTimeOff,
} from "@duna/core/demo/team-availability";
import { teamPayDemoCompensation } from "@duna/core/demo/team-pay";
import { describe, expect, it } from "vitest";
import {
  availabilitySummary,
  classificationLabel,
  compensationSentence,
  coverageReasonWords,
  coverageStatusCopy,
  dateSpanWords,
  lineMethodWords,
  offerStatusWords,
  payRunStatusCopy,
  scheduleStatusCopy,
  timeOffStatusCopy,
  windowLabel,
  type ScheduleRow,
} from "./team-words";

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

describe("the pay sentence (HQ's words)", () => {
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

  it("reads every demo model", () => {
    for (const current of teamPayDemoCompensation) {
      expect(compensationSentence(current)).not.toContain("[rate]");
    }
  });

  it("names classification as the club set it, and the pay-run words", () => {
    expect(classificationLabel("1099-contractor")).toBe("Contractor (1099)");
    expect(classificationLabel("w2-employee")).toBe("Employee (W-2)");
    expect(classificationLabel("not-set")).toBe("Not set");
    expect(lineMethodWords("duna-pay")).toBe("Duna Pay (not configured yet)");
    expect(lineMethodWords("export")).toBe("Your payroll (export)");
    expect(payRunStatusCopy("ready-for-approval").label).toBe(
      "Ready to approve",
    );
    expect(payRunStatusCopy("partially-paid").label).toBe("Partly paid");
  });
});

describe("the availability sentence (HQ's words)", () => {
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

  it("uses HQ's state words", () => {
    expect(scheduleStatusCopy("active").label).toBe("In use");
    expect(timeOffStatusCopy("requested").label).toBe("Asked for");
    expect(timeOffStatusCopy("declined").label).toBe("Declined");
    expect(coverageStatusCopy("open").label).toBe("Needs cover");
    expect(coverageStatusCopy("nobody-free").label).toBe("Nobody free");
    expect(coverageReasonWords("blackout", "Theo")).toBe(
      "Theo can't work then",
    );
    expect(offerStatusWords("withdrawn")).toBe("No longer needed");
  });
});
