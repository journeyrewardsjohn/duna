/**
 * Contract: team-pay (owner: B3b). Compensation models, income goals, pay
 * periods, pay runs and lines, and export records. Duna computes and exports;
 * it never runs payroll and never pays a W-2 employee. Frozen by W3-0: B3b
 * implements the service; H5 builds TM-Compensation and TM-PayRun against
 * these shapes and `@duna/core/demo/team-pay`. Procedures:
 * `operator.teamPay.*` (docs/plan/w3-contracts.md).
 */
import {
  staffCompensationModels,
  staffPayExportFormats,
  staffPayFrequencies,
  staffPayLineStatuses,
  staffPayMethods,
  staffPayPeriodStatuses,
  staffPayRunStatuses,
  staffWorkerClassifications,
} from "@duna/db/schema";
import { z } from "zod";
import {
  w3AmountSchema,
  w3BasisPointsSchema,
  w3DateSchema,
  w3DateTimeSchema,
  w3IdSchema,
  w3IdempotencyKeySchema,
  w3MoneySchema,
  w3PersonRefSchema,
} from "./w3-common";

export const teamPayCompensationModelSchema = z.enum(staffCompensationModels);
export const teamPayClassificationSchema = z.enum(staffWorkerClassifications);
export const teamPayFrequencySchema = z.enum(staffPayFrequencies);
export const teamPayPeriodStatusSchema = z.enum(staffPayPeriodStatuses);
export const teamPayRunStatusSchema = z.enum(staffPayRunStatuses);
export const teamPayMethodSchema = z.enum(staffPayMethods);
export const teamPayLineStatusSchema = z.enum(staffPayLineStatuses);
export const teamPayExportFormatSchema = z.enum(staffPayExportFormats);
/** Same periods as operator_earnings_goals. */
export const teamPayGoalPeriodSchema = z.enum([
  "week",
  "month",
  "quarter",
  "year",
]);

export const teamPayStaffRefSchema = w3PersonRefSchema.extend({
  staffProfileId: w3IdSchema,
});

const compensationFields = {
  model: teamPayCompensationModelSchema,
  classification: teamPayClassificationSchema,
  effectiveFrom: w3DateSchema,
  effectiveTo: w3DateSchema.optional(),
  hourlyRate: w3AmountSchema.optional(),
  perSessionRate: w3AmountSchema.optional(),
  annualSalary: w3AmountSchema.optional(),
  revenueShareBps: w3BasisPointsSchema.optional(),
  /** Catalog subtypes the share applies to ("private-lesson"); empty = all. */
  revenueShareScope: z.array(z.string().min(1).max(48)),
};

function requireModelAmounts(
  value: {
    model: z.infer<typeof teamPayCompensationModelSchema>;
    classification: z.infer<typeof teamPayClassificationSchema>;
    hourlyRate?: unknown;
    perSessionRate?: unknown;
    annualSalary?: unknown;
    revenueShareBps?: unknown;
  },
  context: z.RefinementCtx,
) {
  const needs: Record<typeof value.model, readonly (keyof typeof value)[]> = {
    "per-session": ["perSessionRate"],
    hourly: ["hourlyRate"],
    salary: ["annualSalary"],
    "revenue-share": ["revenueShareBps"],
    "hourly-plus-share": ["hourlyRate", "revenueShareBps"],
  };
  for (const key of needs[value.model]) {
    if (value[key] === undefined) {
      context.addIssue({
        code: "custom",
        path: [key],
        message: `${value.model} needs ${key}`,
      });
    }
  }
  if (value.model === "salary" && value.classification !== "w2-employee") {
    context.addIssue({
      code: "custom",
      path: ["classification"],
      message: "Salary is for W-2 employees only",
    });
  }
}

export const teamPayCompensationSchema = z
  .object({
    id: w3IdSchema,
    staffProfileId: w3IdSchema,
    ...compensationFields,
  })
  .superRefine(requireModelAmounts);

export const teamPayStaffCompensationInputSchema = z.object({
  staffProfileId: w3IdSchema,
});
/** TM-Compensation: the current model, its history and the income goal. */
export const teamPayStaffCompensationSchema = z.object({
  staff: teamPayStaffRefSchema,
  current: teamPayCompensationSchema.optional(),
  history: z.array(teamPayCompensationSchema),
  goal: z
    .object({
      id: w3IdSchema,
      target: w3AmountSchema,
      period: teamPayGoalPeriodSchema,
      periodStartsAt: w3DateTimeSchema,
      periodEndsAt: w3DateTimeSchema,
      earned: w3AmountSchema,
      /** Computed: earned ÷ target, 0–100+ (may exceed 100). */
      progressPercent: z.number().nonnegative(),
    })
    .optional(),
});

/** A new model starts on effectiveFrom and closes the current one the day before. */
export const teamPaySetCompensationInputSchema = z
  .object({ staffProfileId: w3IdSchema, ...compensationFields })
  .superRefine(requireModelAmounts);

export const teamPaySetIncomeGoalInputSchema = z.object({
  staffProfileId: w3IdSchema,
  target: w3AmountSchema,
  period: teamPayGoalPeriodSchema,
});

export const teamPayPeriodSchema = z.object({
  id: w3IdSchema,
  frequency: teamPayFrequencySchema,
  startsOn: w3DateSchema,
  endsOn: w3DateSchema,
  approveBy: w3DateSchema.optional(),
  status: teamPayPeriodStatusSchema,
});
export const teamPayPeriodsSchema = z.object({
  periods: z.array(teamPayPeriodSchema),
});
export const teamPayCreatePeriodInputSchema = z.object({
  frequency: teamPayFrequencySchema,
  startsOn: w3DateSchema,
  approveBy: w3DateSchema.optional(),
});

export const teamPayAdjustmentSchema = z.object({
  label: z.string().min(1).max(120),
  /** Signed: a deduction is negative. */
  amount: w3MoneySchema,
});

export const teamPayLineSchema = z.object({
  id: w3IdSchema,
  staff: teamPayStaffRefSchema,
  classification: teamPayClassificationSchema,
  compensationModel: teamPayCompensationModelSchema.optional(),
  /** W-2: always "export" or "none". Contractors: "duna-pay" or "export". */
  method: teamPayMethodSchema,
  status: teamPayLineStatusSchema,
  sessionsCount: z.number().int().nonnegative(),
  minutesWorked: z.number().int().nonnegative(),
  earnings: w3AmountSchema,
  adjustments: z.array(teamPayAdjustmentSchema),
  total: w3AmountSchema,
  /** Contractor's connected account is verified (TM-PayRun "Stripe verified"). */
  payoutReady: z.boolean(),
});

export const teamPayRunSchema = z.object({
  id: w3IdSchema,
  payPeriod: teamPayPeriodSchema,
  revision: z.number().int().positive(),
  status: teamPayRunStatusSchema,
  contractorTotal: w3AmountSchema,
  employeeTotal: w3AmountSchema,
  computedAt: w3DateTimeSchema.optional(),
  approvedAt: w3DateTimeSchema.optional(),
  approvedBy: w3PersonRefSchema.optional(),
  lines: z.array(teamPayLineSchema),
  exports: z.array(
    z.object({
      id: w3IdSchema,
      format: teamPayExportFormatSchema,
      rowCount: z.number().int().nonnegative(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      createdAt: w3DateTimeSchema,
      createdBy: w3PersonRefSchema,
    }),
  ),
});

export const teamPayRunsInputSchema = z.object({
  payPeriodId: w3IdSchema.optional(),
  status: z.array(teamPayRunStatusSchema).optional(),
});
export const teamPayRunsSchema = z.object({ runs: z.array(teamPayRunSchema) });
export const teamPayRunInputSchema = z.object({ payRunId: w3IdSchema });

/** Computes a new revision for the period; the same key returns the same run. */
export const teamPayComputeRunInputSchema = z.object({
  payPeriodId: w3IdSchema,
  idempotencyKey: w3IdempotencyKeySchema,
});
export const teamPayAdjustLineInputSchema = z.object({
  lineId: w3IdSchema,
  adjustments: z.array(teamPayAdjustmentSchema).max(20),
  method: teamPayMethodSchema.optional(),
});
export const teamPayApproveRunInputSchema = z.object({
  payRunId: w3IdSchema,
  idempotencyKey: w3IdempotencyKeySchema,
});
export const teamPayExportRunInputSchema = z.object({
  payRunId: w3IdSchema,
  format: teamPayExportFormatSchema,
});
export const teamPayExportSchema = z.object({
  id: w3IdSchema,
  payRunId: w3IdSchema,
  format: teamPayExportFormatSchema,
  rowCount: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** Short-lived signed download URL. */
  downloadUrl: z.url(),
  createdAt: w3DateTimeSchema,
});
export const teamPayCancelRunInputSchema = z.object({ payRunId: w3IdSchema });

export type TeamPayCompensation = z.infer<typeof teamPayCompensationSchema>;
export type TeamPayRun = z.infer<typeof teamPayRunSchema>;
export type TeamPayLine = z.infer<typeof teamPayLineSchema>;
