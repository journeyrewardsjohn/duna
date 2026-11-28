/**
 * Inbox's capability switches: one per feature that needs a backend
 * procedure. A feature's controls (its button, filter chip or menu entry)
 * appear only when EVERY procedure it needs exists in the API router, so
 * nothing in production leads to a dead end, and each turns on by itself
 * when the backend adds what is missing. Pure: the server reads the router's
 * procedure paths and passes them in (`inbox-data.ts`).
 *
 * The guard test (`inbox-capabilities.test.ts`) fails if a switch is on
 * while its server action still answers "isn't switched on yet".
 */
export const INBOX_CAPABILITY_PROCEDURES = {
  /** Reply in a thread: the Send review, then a person presses Send. */
  reply: [
    "operator.concierge.draftSend",
    "operator.concierge.editDraft",
    "operator.concierge.confirmSend",
    "operator.concierge.cancelSend",
  ],
  /** Change one person's channel on the Send review. */
  channelChoice: ["operator.concierge.setRecipientChannel"],
  /** Each person's delivery after a send. */
  deliveries: ["operator.concierge.deliveries"],
  /** The staff queue: assign a thread to yourself or hand it to a teammate. */
  assign: ["operator.concierge.assignThread"],
  /** Mark a thread read for the club's staff. */
  markRead: ["operator.concierge.markRead"],
  /** Start a thread for the club, a session, a league, a division or one person. */
  startThread: ["operator.concierge.drafts.createFromHandoff"],
  /** A named group of several chosen people, with cards and polls (Duna app only). */
  groupConversation: ["messaging.create"],
  /**
   * Mute a thread for the club's staff (the Muted filter too). Concierge
   * has a person's own mute (`player.concierge.setThreadMute`) but no staff
   * mute yet, and thread summaries don't say whether a thread is muted.
   */
  mute: ["operator.concierge.setThreadMute"],
  /** Mark a thread done (out of the queue until someone writes again): not built. */
  markDone: ["operator.concierge.setThreadStatus"],
  /**
   * Ask Duna writes a reply straight into the composer. Until this lands,
   * "Draft with Ask Duna" opens the Ask Duna panel with the thread as its
   * context and the person copies what they want; nothing is sent either way.
   */
  askDraft: ["operator.concierge.suggestReply"],
} as const satisfies Record<string, readonly string[]>;

export type InboxCapability = keyof typeof INBOX_CAPABILITY_PROCEDURES;
export type InboxCapabilities = Readonly<Record<InboxCapability, boolean>>;

/** Which capabilities are on, given every procedure path the API serves. */
export function capabilitiesFrom(
  procedurePaths: Iterable<string>,
): InboxCapabilities {
  const paths = [...procedurePaths];
  const has = (path: string) =>
    paths.some((entry) => entry === path || entry.startsWith(`${path}.`));
  return Object.fromEntries(
    Object.entries(INBOX_CAPABILITY_PROCEDURES).map(([key, needed]) => [
      key,
      needed.every(has),
    ]),
  ) as unknown as InboxCapabilities;
}
