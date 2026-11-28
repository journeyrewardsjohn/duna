/**
 * Schedule's capability switches: one per feature whose backend procedure
 * has not landed yet. A feature is offered (its button, drag affordance,
 * panel action and empty-slot choice) only when its procedure exists in the
 * API router, so nothing in production leads to a dead end, and each turns
 * on by itself when the backend package adds the procedure. Demo mode keeps
 * them on: its changes live in the person's own browser. Pure: the server
 * reads the router's procedure paths and passes them in (`schedule-data.ts`).
 */
export const SCHEDULE_CAPABILITY_PROCEDURES = {
  /** Book a court or a lesson for a member or a walk-in. */
  createBooking: "operator.schedule.createCourtBooking",
  /** Move a court booking (drag or the panel's Move). */
  moveBooking: "operator.schedule.moveCourtBooking",
  /** Cancel a court booking, with its refund choice. */
  cancelBooking: "operator.schedule.cancelCourtBooking",
  /** Record a payment taken at the desk. */
  deskPayment: "operator.schedule.recordDeskPayment",
  /** Remove a block or a closure. */
  removeBlock: "operator.schedule.removeCalendarBlock",
} as const;

export type ScheduleCapability = keyof typeof SCHEDULE_CAPABILITY_PROCEDURES;
export type ScheduleCapabilities = Readonly<
  Record<ScheduleCapability, boolean>
>;

/** Which capabilities are on, given every procedure path the API serves. */
export function capabilitiesFrom(
  procedurePaths: Iterable<string>,
): ScheduleCapabilities {
  const paths = [...procedurePaths];
  const has = (path: string) =>
    paths.some((entry) => entry === path || entry.startsWith(`${path}.`));
  return Object.fromEntries(
    Object.entries(SCHEDULE_CAPABILITY_PROCEDURES).map(([key, path]) => [
      key,
      has(path),
    ]),
  ) as unknown as ScheduleCapabilities;
}

/** Demo mode: every feature works against the person's own browser. */
export const demoCapabilities: ScheduleCapabilities = Object.fromEntries(
  Object.keys(SCHEDULE_CAPABILITY_PROCEDURES).map((key) => [key, true]),
) as unknown as ScheduleCapabilities;
