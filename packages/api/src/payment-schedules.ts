import {
  getDatabase,
  orderItems,
  paymentScheduleInstallments,
  paymentSchedules,
  payments,
} from "@duna/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";

function addUtcMonths(value: Date, months: number): Date {
  const date = new Date(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}

function scheduleStatus(
  value: string,
):
  "scheduled" | "active" | "past-due" | "completed" | "cancelled" | "refunded" {
  if (
    value === "scheduled" ||
    value === "active" ||
    value === "past-due" ||
    value === "completed" ||
    value === "cancelled" ||
    value === "refunded"
  ) {
    return value;
  }
  return "scheduled" as const;
}

function installmentStatus(
  value: string,
): "scheduled" | "processing" | "paid" | "failed" | "refunded" | "cancelled" {
  if (
    value === "scheduled" ||
    value === "processing" ||
    value === "paid" ||
    value === "failed" ||
    value === "refunded" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "scheduled" as const;
}

function scheduleCadence(value: string): "weekly" | "monthly" | "annual" {
  return value === "weekly" || value === "annual" ? value : "monthly";
}

function scheduleCurrency(
  value: string,
): "USD" | "CAD" | "AUD" | "BRL" | "EUR" {
  if (
    value === "USD" ||
    value === "CAD" ||
    value === "AUD" ||
    value === "BRL" ||
    value === "EUR"
  ) {
    return value;
  }
  return "USD" as const;
}

export function buildInstallmentScheduleRows(input: {
  readonly installmentCount: number;
  readonly installmentAmountMinor: number;
  readonly firstInvoiceMinor: number;
  readonly totalMinor: number;
  readonly startsAt: Date;
}) {
  return Array.from({ length: input.installmentCount }, (_, index) => {
    const sequence = index + 1;
    const scheduled =
      sequence === 1 ? input.firstInvoiceMinor : input.installmentAmountMinor;
    const assignedBefore =
      input.firstInvoiceMinor +
      Math.max(0, sequence - 2) * input.installmentAmountMinor;
    return {
      sequence,
      amountMinor:
        sequence === input.installmentCount
          ? input.totalMinor - assignedBefore
          : scheduled,
      dueAt: addUtcMonths(input.startsAt, index),
    };
  });
}

export async function createInstallmentPaymentSchedule(input: {
  readonly orderId: string;
  readonly organizationId: string;
  readonly buyerPersonId: string;
  readonly installmentCount: number;
  readonly installmentAmountMinor: number;
  readonly firstInvoiceMinor: number;
  readonly totalMinor: number;
  readonly currency: string;
  readonly now: Date;
}): Promise<string> {
  if (
    !Number.isSafeInteger(input.installmentCount) ||
    input.installmentCount < 2 ||
    input.installmentCount > 24 ||
    input.firstInvoiceMinor <= 0 ||
    input.totalMinor < input.firstInvoiceMinor
  ) {
    throw new Error("Payment schedule terms are invalid");
  }
  const database = getDatabase();
  const id = crypto.randomUUID();
  const installments = buildInstallmentScheduleRows({
    installmentCount: input.installmentCount,
    installmentAmountMinor: input.installmentAmountMinor,
    firstInvoiceMinor: input.firstInvoiceMinor,
    totalMinor: input.totalMinor,
    startsAt: input.now,
  }).map(({ sequence, amountMinor, dueAt }) => ({
    scheduleId: id,
    sequence,
    amountMinor,
    currency: input.currency,
    dueAt,
    status: "scheduled",
    createdAt: input.now,
    updatedAt: input.now,
  }));
  await database.batch([
    database
      .insert(paymentSchedules)
      .values({
        id,
        organizationId: input.organizationId,
        orderId: input.orderId,
        buyerPersonId: input.buyerPersonId,
        kind: "installment",
        status: "scheduled",
        installmentCount: input.installmentCount,
        totalMinor: input.totalMinor,
        currency: input.currency,
        cadence: "monthly",
        termsSnapshot: {
          installmentAmountMinor: input.installmentAmountMinor,
          firstInvoiceMinor: input.firstInvoiceMinor,
          createdAt: input.now.toISOString(),
        },
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing(),
    database.insert(paymentScheduleInstallments).values(installments),
  ]);
  return id;
}

export async function attachInstallmentSubscription(input: {
  readonly orderId: string;
  readonly stripeSubscriptionId: string;
  readonly stripeSubscriptionScheduleId?: string;
  readonly now: Date;
}): Promise<void> {
  await getDatabase()
    .update(paymentSchedules)
    .set({
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripeSubscriptionScheduleId: input.stripeSubscriptionScheduleId,
      status: "active",
      updatedAt: input.now,
    })
    .where(eq(paymentSchedules.orderId, input.orderId));
}

export async function recordInstallmentPayment(input: {
  readonly scheduleId: string;
  readonly paymentId: string;
  readonly amountMinor: number;
  readonly stripeInvoiceId?: string;
  readonly stripePaymentIntentId?: string;
  readonly now: Date;
}): Promise<string> {
  const database = getDatabase();
  const schedule = await database.query.paymentSchedules.findFirst({
    where: eq(paymentSchedules.id, input.scheduleId),
  });
  if (!schedule) throw new Error("Payment schedule was not found");
  const installment =
    await database.query.paymentScheduleInstallments.findFirst({
      where: input.stripeInvoiceId
        ? eq(paymentScheduleInstallments.stripeInvoiceId, input.stripeInvoiceId)
        : and(
            eq(paymentScheduleInstallments.scheduleId, schedule.id),
            eq(paymentScheduleInstallments.status, "scheduled"),
          ),
      orderBy: [asc(paymentScheduleInstallments.sequence)],
    });
  if (!installment) {
    const alreadyRecorded = input.stripeInvoiceId
      ? await database.query.payments.findFirst({
          where: eq(payments.stripeInvoiceId, input.stripeInvoiceId),
        })
      : undefined;
    if (alreadyRecorded) return alreadyRecorded.id;
    throw new Error("No scheduled installment is available for this payment");
  }
  if (installment.status === "paid") return installment.id;
  const nextPaidMinor = Math.min(
    schedule.totalMinor,
    schedule.paidMinor + input.amountMinor,
  );
  await database.batch([
    database
      .update(paymentScheduleInstallments)
      .set({
        paymentId: input.paymentId,
        amountMinor: input.amountMinor,
        stripeInvoiceId: input.stripeInvoiceId,
        stripePaymentIntentId: input.stripePaymentIntentId,
        status: "paid",
        attemptCount: sql`${paymentScheduleInstallments.attemptCount} + 1`,
        paidAt: input.now,
        failedAt: null,
        failureMessage: null,
        updatedAt: input.now,
      })
      .where(eq(paymentScheduleInstallments.id, installment.id)),
    database
      .update(paymentSchedules)
      .set({
        paidMinor: nextPaidMinor,
        status: nextPaidMinor >= schedule.totalMinor ? "completed" : "active",
        completedAt: nextPaidMinor >= schedule.totalMinor ? input.now : null,
        updatedAt: input.now,
      })
      .where(eq(paymentSchedules.id, schedule.id)),
  ]);
  return installment.id;
}

export async function markInstallmentFailed(input: {
  readonly stripeSubscriptionId: string;
  readonly stripeInvoiceId: string;
  readonly message?: string;
  readonly now: Date;
}): Promise<boolean> {
  const database = getDatabase();
  const schedule = await database.query.paymentSchedules.findFirst({
    where: eq(
      paymentSchedules.stripeSubscriptionId,
      input.stripeSubscriptionId,
    ),
  });
  if (!schedule) return false;
  const installment =
    await database.query.paymentScheduleInstallments.findFirst({
      where: and(
        eq(paymentScheduleInstallments.scheduleId, schedule.id),
        eq(paymentScheduleInstallments.status, "scheduled"),
      ),
      orderBy: [asc(paymentScheduleInstallments.sequence)],
    });
  if (!installment) return true;
  await database.batch([
    database
      .update(paymentScheduleInstallments)
      .set({
        stripeInvoiceId: input.stripeInvoiceId,
        status: "failed",
        attemptCount: sql`${paymentScheduleInstallments.attemptCount} + 1`,
        failedAt: input.now,
        failureMessage: input.message?.slice(0, 1_000),
        updatedAt: input.now,
      })
      .where(eq(paymentScheduleInstallments.id, installment.id)),
    database
      .update(paymentSchedules)
      .set({ status: "past-due", updatedAt: input.now })
      .where(eq(paymentSchedules.id, schedule.id)),
  ]);
  return true;
}

export async function loadCustomerPaymentSchedule(input: {
  readonly orderId: string;
  readonly buyerPersonId: string;
}) {
  const database = getDatabase();
  const schedule = await database.query.paymentSchedules.findFirst({
    where: and(
      eq(paymentSchedules.orderId, input.orderId),
      eq(paymentSchedules.buyerPersonId, input.buyerPersonId),
    ),
  });
  if (!schedule) return undefined;
  const [installments, items] = await Promise.all([
    database
      .select()
      .from(paymentScheduleInstallments)
      .where(eq(paymentScheduleInstallments.scheduleId, schedule.id))
      .orderBy(asc(paymentScheduleInstallments.sequence)),
    database
      .select({ description: orderItems.description })
      .from(orderItems)
      .where(eq(orderItems.orderId, input.orderId)),
  ]);
  return {
    id: schedule.id,
    orderId: schedule.orderId,
    title: items.map((item) => item.description).join(", ") || "Duna purchase",
    status: scheduleStatus(schedule.status),
    installmentCount: schedule.installmentCount,
    totalMinor: schedule.totalMinor,
    paidMinor: schedule.paidMinor,
    refundedMinor: schedule.refundedMinor,
    currency: scheduleCurrency(schedule.currency),
    cadence: scheduleCadence(schedule.cadence),
    installments: installments.map((installment) => ({
      id: installment.id,
      sequence: installment.sequence,
      amountMinor: installment.amountMinor,
      dueAt: installment.dueAt.toISOString(),
      status: installmentStatus(installment.status),
      paidAt: installment.paidAt?.toISOString(),
      failureMessage: installment.failureMessage ?? undefined,
    })),
  };
}

export async function loadCustomerPaymentSchedules(buyerPersonId: string) {
  const rows = await getDatabase()
    .select({ orderId: paymentSchedules.orderId })
    .from(paymentSchedules)
    .where(eq(paymentSchedules.buyerPersonId, buyerPersonId))
    .orderBy(desc(paymentSchedules.createdAt))
    .limit(100);
  const schedules = await Promise.all(
    rows.map(({ orderId }) =>
      loadCustomerPaymentSchedule({ orderId, buyerPersonId }),
    ),
  );
  return schedules.filter(
    (schedule): schedule is NonNullable<typeof schedule> => Boolean(schedule),
  );
}

export async function findPaymentScheduleBySubscription(
  stripeSubscriptionId: string,
) {
  return getDatabase().query.paymentSchedules.findFirst({
    where: eq(paymentSchedules.stripeSubscriptionId, stripeSubscriptionId),
  });
}
