/**
 * Service seam: team-pay (owner: B3b). Staff compensation, income goals,
 * pay periods, pay runs and payroll exports, called from
 * ../../routers/team-pay.ts. The computation is the pure `computePayRun` in
 * ./compute; the generic payroll CSV is ./export-file. Duna computes and
 * exports; it pays nobody here and computes no tax or withholding.
 */
export * from "./compute";
export { PAYROLL_CSV_COLUMNS, majorUnits, payrollCsv } from "./export-file";
export {
  adjustLine,
  approvePayRun,
  cancelPayRun,
  computePayRun as computeTeamPayRun,
  createPayPeriod,
  exportPayRun,
  type PayContext,
  type PayExportStorage,
  payPeriods,
  payRun,
  payRuns,
  setCompensation,
  setIncomeGoal,
  setPayExportStorageForTests,
  staffCompensationPage,
} from "./pay-service";
