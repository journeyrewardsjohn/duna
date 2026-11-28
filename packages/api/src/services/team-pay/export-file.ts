/**
 * The generic payroll CSV (B3b). One row per exported line; the club's
 * payroll system or accountant imports it. Duna computes no tax and no
 * withholding. Columns, in order:
 *
 * | Column               | Meaning                                                        |
 * | -------------------- | -------------------------------------------------------------- |
 * | pay_run_id           | Duna pay run id                                                |
 * | revision             | Pay run revision (an adjustment run has a higher revision)     |
 * | period_start         | First day of the pay period (club's local date)                |
 * | period_end           | Last day of the pay period                                     |
 * | staff_profile_id     | Duna team member id                                            |
 * | person_id            | Duna person id                                                 |
 * | name                 | Team member's name                                             |
 * | classification       | `w2-employee` or `1099-contractor`                             |
 * | compensation_model   | `per-session`, `hourly`, `salary`, `revenue-share`, `hourly-plus-share` |
 * | sessions             | Sessions paid on this line                                     |
 * | hours                | Hours worked, two decimals                                     |
 * | currency             | ISO 4217                                                       |
 * | earnings             | Earnings in major units ("1234.50")                            |
 * | adjustments          | Sum of labelled adjustments (negative for deductions)          |
 * | total                | earnings + adjustments                                         |
 * | adjustment_labels    | Labels and amounts, "; " separated                             |
 *
 * Text cells that start with = + - @ are prefixed with ' so spreadsheets
 * never run them as formulas.
 */

export interface ExportLine {
  readonly staffProfileId: string;
  readonly personId: string;
  readonly name: string;
  readonly classification: string;
  readonly compensationModel?: string;
  readonly sessionsCount: number;
  readonly minutesWorked: number;
  readonly currency: string;
  readonly earningsMinor: number;
  readonly adjustmentsMinor: number;
  readonly totalMinor: number;
  readonly adjustments: readonly { label: string; amountMinor: number }[];
}

export const PAYROLL_CSV_COLUMNS = [
  "pay_run_id",
  "revision",
  "period_start",
  "period_end",
  "staff_profile_id",
  "person_id",
  "name",
  "classification",
  "compensation_model",
  "sessions",
  "hours",
  "currency",
  "earnings",
  "adjustments",
  "total",
  "adjustment_labels",
] as const;

function minorDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** 123450 USD → "1234.50"; −500 → "-5.00". */
export function majorUnits(amountMinor: number, currency: string): string {
  const digits = minorDigits(currency);
  const negative = amountMinor < 0;
  const absolute = Math.abs(amountMinor);
  const scale = 10 ** digits;
  const whole = Math.floor(absolute / scale);
  const fraction = absolute % scale;
  const text =
    digits === 0
      ? `${whole}`
      : `${whole}.${String(fraction).padStart(digits, "0")}`;
  return negative ? `-${text}` : text;
}

function textCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function payrollCsv(input: {
  readonly payRunId: string;
  readonly revision: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly lines: readonly ExportLine[];
}): string {
  const rows = [PAYROLL_CSV_COLUMNS.join(",")];
  for (const line of input.lines) {
    rows.push(
      [
        input.payRunId,
        String(input.revision),
        input.periodStart,
        input.periodEnd,
        line.staffProfileId,
        line.personId,
        textCell(line.name),
        line.classification,
        line.compensationModel ?? "",
        String(line.sessionsCount),
        (line.minutesWorked / 60).toFixed(2),
        line.currency,
        majorUnits(line.earningsMinor, line.currency),
        majorUnits(line.adjustmentsMinor, line.currency),
        majorUnits(line.totalMinor, line.currency),
        textCell(
          line.adjustments
            .map(
              (adjustment) =>
                `${adjustment.label} ${majorUnits(adjustment.amountMinor, line.currency)}`,
            )
            .join("; "),
        ),
      ].join(","),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}
