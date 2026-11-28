import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleDemoBlock, scheduleDemoIds } from "@duna/core/demo/schedule";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import {
  scheduleCancelCourtBookingPreviewSchema,
  scheduleCreateCourtBookingSchema,
  teamAvailabilityRangeSchema,
} from "../contracts/schedule";

// SCHED-API in demo mode (no database): every procedure is mounted at the
// paths HQ's capability switches look for, answers its fixture and keeps
// the same permission rules.
describe("operator.schedule in demo mode", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  const as = (roles: Parameters<typeof createDemoActor>[0]) =>
    createCaller(createApiContext({ actor: createDemoActor(roles) })).operator;
  const slot = {
    courtId: scheduleDemoIds.court,
    startsAt: "2026-12-09T01:00:00.000Z",
    endsAt: "2026-12-09T02:00:00.000Z",
  };
  const key = () => crypto.randomUUID();

  it("books, moves, cancels, records a desk payment and removes a block", async () => {
    const desk = as(["front-desk"]);
    const created = await desk.schedule.createCourtBooking({
      ...slot,
      walkIn: { name: "Sam Walker" },
      currency: "USD",
      paymentIntent: "pay-at-desk",
      idempotencyKey: key(),
    });
    expect(scheduleCreateCourtBookingSchema.parse(created)).toMatchObject({
      paymentState: "unpaid",
      totalMinor: 4000,
    });
    const moved = await desk.schedule.moveCourtBooking({
      bookingId: created.id,
      ...slot,
      notify: true,
      idempotencyKey: key(),
    });
    expect(moved).toMatchObject({ sent: 0, toTell: 2 });
    const preview = await desk.schedule.cancelCourtBookingPreview({
      bookingId: created.id,
      refund: "none",
    });
    expect(
      scheduleCancelCourtBookingPreviewSchema.parse(preview).lines,
    ).toHaveLength(2);
    await expect(
      desk.schedule.cancelCourtBooking({
        bookingId: created.id,
        reason: "Player asked",
        refund: "full",
        confirmed: true,
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      await desk.schedule.recordDeskPayment({
        bookingId: created.id,
        amountMinor: 4000,
        method: "cash",
        confirmed: true,
        idempotencyKey: key(),
      }),
    ).toMatchObject({ orderStatus: "paid", ledgerRecorded: false });
    await expect(
      desk.schedule.removeCalendarBlock({
        id: scheduleDemoBlock.id,
        reason: "Weather cleared",
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(
      await desk.schedule.removeCalendarBlock({
        id: scheduleDemoBlock.id,
        reason: "Weather cleared",
        acknowledgeCancelled: true,
        idempotencyKey: key(),
      }),
    ).toMatchObject({ removed: true, stillCancelled: 1 });
  });

  it("keeps the permission rules: coaches cannot book, money stays hidden", async () => {
    const coach = as(["coach"]);
    await expect(
      coach.schedule.createCourtBooking({
        ...slot,
        walkIn: { name: "Sam" },
        currency: "USD",
        paymentIntent: "pay-at-desk",
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const scorekeeper = as(["scorekeeper"]);
    const preview = await scorekeeper.schedule.createCourtBookingPreview({
      ...slot,
      paymentIntent: "pay-at-desk",
    });
    expect(preview.price).toBeUndefined();
    await expect(
      scorekeeper.schedule.bookingPayments({
        from: "2026-12-08T00:00:00.000Z",
        to: "2026-12-10T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reads every coach's availability for a range", async () => {
    const range = await as(["manager"]).teamAvailability.range({
      from: "2026-12-07",
      to: "2026-12-13",
    });
    expect(teamAvailabilityRangeSchema.parse(range).staff.length).toBe(3);
  });
});
