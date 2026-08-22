import { describe, expect, it } from "vitest";
import { buildInstallmentScheduleRows } from "./payment-schedules";

describe("payment schedules", () => {
  it("keeps every cent and assigns the first-only service fee", () => {
    const rows = buildInstallmentScheduleRows({
      installmentCount: 6,
      installmentAmountMinor: 33_333,
      firstInvoiceMinor: 34_008,
      totalMinor: 200_675,
      startsAt: new Date("2026-01-31T15:00:00.000Z"),
    });
    expect(rows.map((row) => row.amountMinor)).toEqual([
      34_008, 33_333, 33_333, 33_333, 33_333, 33_335,
    ]);
    expect(rows.reduce((sum, row) => sum + row.amountMinor, 0)).toBe(200_675);
    expect(rows.map((row) => row.dueAt.toISOString())).toEqual([
      "2026-01-31T15:00:00.000Z",
      "2026-02-28T15:00:00.000Z",
      "2026-03-31T15:00:00.000Z",
      "2026-04-30T15:00:00.000Z",
      "2026-05-31T15:00:00.000Z",
      "2026-06-30T15:00:00.000Z",
    ]);
  });
});
