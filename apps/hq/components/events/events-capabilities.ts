/**
 * Events' capability switches: one per feature whose backend procedure has
 * not landed yet. A feature is offered (its button, its row action) only
 * when its procedure exists in the API router, so nothing in production
 * leads to a dead end, and each turns on by itself when a backend package
 * adds the procedure. Demo mode keeps them on: its changes live in the
 * person's own browser. Pure: the server reads the router's procedure paths
 * and passes them in (`events-data.ts`).
 *
 * The guard test (`events-capabilities.test.ts`) fails if a switch is on
 * while its server action still answers "needs API".
 */
export const EVENT_CAPABILITY_PROCEDURES = {
  /**
   * Duna sends one message to every entrant (with consent and quiet hours).
   * Until it lands, "Message entrants" opens the person's own Messages or
   * email app with the entrants who gave a number or an address.
   */
  messageEntrants: "operator.events.messageEntrants",
  /** Enter or correct a match result from HQ (courtside scoring sends them today). */
  recordResult: "operator.events.recordMatchResult",
  /**
   * Change a division's entry fee after people entered, with the
   * difference refunded or charged per entrant. The fee is set in the
   * event studio before anyone enters.
   */
  changeFee: "operator.events.changeDivisionFee",
} as const;

export type EventCapability = keyof typeof EVENT_CAPABILITY_PROCEDURES;
export type EventCapabilities = Readonly<Record<EventCapability, boolean>>;

/** Which capabilities are on, given every procedure path the API serves. */
export function capabilitiesFrom(
  procedurePaths: Iterable<string>,
): EventCapabilities {
  const paths = [...procedurePaths];
  const has = (path: string) =>
    paths.some((entry) => entry === path || entry.startsWith(`${path}.`));
  return Object.fromEntries(
    Object.entries(EVENT_CAPABILITY_PROCEDURES).map(([key, path]) => [
      key,
      has(path),
    ]),
  ) as unknown as EventCapabilities;
}

/**
 * Demo mode: every feature works against the person's own browser, except
 * sending, which the demo club never does.
 */
export const demoCapabilities: EventCapabilities = {
  ...(Object.fromEntries(
    Object.keys(EVENT_CAPABILITY_PROCEDURES).map((key) => [key, true]),
  ) as unknown as EventCapabilities),
  messageEntrants: false,
};
