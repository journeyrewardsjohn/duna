/**
 * The words for group sessions (participation.md §7 tokens and §9 notices).
 * Surfaces receive TOKENS (a key and numbers) from `participationDisplay`
 * and render them here, so web, HQ, Player and Pro say exactly the same
 * thing. English only today; a new locale adds a table, not a branch.
 */

export const PARTICIPATION_COPY_KEYS = [
  // Player chips and lines
  "status.needs",
  "status.reached",
  "status.full",
  "status.confirmed",
  "status.confirmed-small",
  "status.cancelled-low",
  "status.cancelled-club",
  "status.done",
  "status.spots",
  "line.needs-cancel",
  "line.needs-run",
  "line.needs-run-tiers",
  "line.reached",
  "line.full-waitlist",
  "line.full-waiting",
  "line.place-being-booked",
  "line.confirmed",
  "line.absent",
  // Staff
  "staff.at-risk",
  "staff.on-track",
  "staff.full",
  "staff.confirmed",
  "staff.running-small",
  "staff.cancelled-low",
  "staff.cancelled-club",
  "staff.mark-attendance",
  "staff.done",
  // Money
  "price.now",
  "price.decided",
  "price.ladder-row",
  "price.ladder-now",
  "price.receipt",
  "cancel.free",
  "cancel.free-everything",
  "cancel.late",
  "cancel.late-nothing",
  "cancel.closed",
  "wallet.returned",
  // Accessibility
  "a11y.summary",
  // Notices (title, body)
  "notice.booked-needs-players.title",
  "notice.booked-needs-players.body",
  "notice.needs-players-reminder.title",
  "notice.needs-players-reminder.body",
  "notice.confirmed.title",
  "notice.confirmed.body",
  "notice.cancelled-low.title",
  "notice.cancelled-low.body",
  "notice.cancelled-club.title",
  "notice.cancelled-club.body",
  "notice.lock-extended.title",
  "notice.lock-extended.body",
  "notice.moved.title",
  "notice.moved.body",
  "notice.waitlist-offer.title",
  "notice.waitlist-offer.body",
  "notice.place-refilled.title",
  "notice.place-refilled.body",
  "notice.staff-at-risk-digest.title",
  "notice.staff-cancelled.title",
  "notice.refund-attention.title",
  // Errors the player sees
  "error.already-booked",
] as const;
export type ParticipationCopyKey = (typeof PARTICIPATION_COPY_KEYS)[number];

export type ParticipationCopyParams = Readonly<
  Record<string, string | number | undefined>
>;

export interface ParticipationToken {
  readonly key: ParticipationCopyKey;
  readonly params: ParticipationCopyParams;
}

export function participationToken(
  key: ParticipationCopyKey,
  params: ParticipationCopyParams = {},
): ParticipationToken {
  return { key, params };
}

const count = (value: string | number | undefined) => Number(value ?? 0);
const s = (value: string | number | undefined) => String(value ?? "");
const credits = (value: string | number | undefined) =>
  `${count(value)} credit${count(value) === 1 ? "" : "s"}`;
const players = (value: string | number | undefined, unit?: string | number) =>
  `${count(value)} ${unit === "team" ? "team" : "player"}${count(value) === 1 ? "" : "s"}`;
const joins = (value: string | number | undefined) =>
  count(value) === 1 ? "joins" : "join";

/** English. Every key has an entry (checked by the tests). */
const english: Readonly<
  Record<ParticipationCopyKey, (params: ParticipationCopyParams) => string>
> = {
  "status.needs": (p) => `Needs ${count(p.n)} more`,
  "status.reached": () => "Minimum reached",
  "status.full": () => "Full",
  "status.confirmed": (p) => `Confirmed · ${players(p.n, p.unit)}`,
  "status.confirmed-small": () => "Confirmed · small group",
  "status.cancelled-low": () => "Cancelled · not enough players",
  "status.cancelled-club": (p) => `Cancelled by ${s(p.club)}`,
  "status.done": () => "Done",
  "status.spots": (p) =>
    `${count(p.n)} spot${count(p.n) === 1 ? "" : "s"} left`,
  "line.needs-cancel": (p) =>
    `Confirms ${s(p.lock)} if ${count(p.n)} more ${joins(p.n)}`,
  "line.needs-run": () => "Runs either way",
  "line.needs-run-tiers": (p) =>
    `Runs either way · ${count(p.n)} more lowers the price`,
  "line.reached": (p) => `Confirms ${s(p.lock)}`,
  "line.full-waitlist": () => "Join the waitlist",
  "line.full-waiting": (p) => `${count(p.n)} waiting`,
  "line.place-being-booked": (p) =>
    `${count(p.n)} place${count(p.n) === 1 ? "" : "s"} being booked`,
  "line.confirmed": (p) => `Decided ${s(p.lock)}`,
  "line.absent": () => "You were marked absent",
  "staff.at-risk": (p) => `At risk · needs ${count(p.n)} by ${s(p.lock)}`,
  "staff.on-track": (p) =>
    `On track · ${count(p.booked)} of ${count(p.capacity)}`,
  "staff.full": (p) => `Full · ${count(p.waiting)} waiting`,
  "staff.confirmed": (p) => `Confirmed · ${count(p.booked)}`,
  "staff.running-small": (p) =>
    `Running with ${count(p.booked)} of ${count(p.min)}`,
  "staff.cancelled-low": (p) =>
    `Cancelled · ${count(p.booked)} of ${count(p.min)} booked`,
  "staff.cancelled-club": (p) => `Cancelled by ${s(p.name)}`,
  "staff.mark-attendance": () => "Mark attendance",
  "staff.done": () => "Done",
  "price.now": (p) =>
    `${credits(p.max)} now. If more join by ${s(p.lock)}, the difference comes back.`,
  "price.decided": (p) => `Group confirmed · you pay ${credits(p.final)}`,
  "price.ladder-row": (p) => {
    const min = count(p.min);
    const max = count(p.max);
    const size =
      min === max
        ? players(min, p.unit)
        : p.last === 1 || p.last === "true"
          ? `${min} or more`
          : `${min} to ${max} ${p.unit === "team" ? "teams" : "players"}`;
    return `${size} · ${credits(p.credits)}${min === max && min === 1 ? "" : " each"}`;
  },
  "price.ladder-now": (p) => `Now (${count(p.n)} booked)`,
  "price.receipt": (p) =>
    `${s(p.title)} · paid ${credits(p.paid)} · ${count(p.returned)} returned (group of ${count(p.group)})`,
  "cancel.free": (p) => `Free cancellation until ${s(p.lock)}`,
  "cancel.free-everything": (p) => `Cancel and get ${credits(p.credits)} back?`,
  "cancel.late": (p) =>
    `Cancelling now costs ${credits(p.final)}. You get them back if someone takes your place.`,
  "cancel.late-nothing": () => "Cancelling now returns nothing.",
  "cancel.closed": () => "Cancellation closed when this session started.",
  "wallet.returned": (p) => `${credits(p.n)} back in your wallet`,
  "a11y.summary": (p) =>
    [
      s(p.title),
      s(p.status),
      p.line ? s(p.line) : undefined,
      `${count(p.booked)} of ${count(p.capacity)} places booked.`,
    ]
      .filter(Boolean)
      .map((part) => (part!.endsWith(".") ? part : `${part}.`))
      .join(" "),
  "notice.booked-needs-players.title": (p) => `You're in · ${s(p.title)}`,
  "notice.booked-needs-players.body": (p) =>
    `It needs ${count(p.n)} more by ${s(p.lock)}. Share the link to bring a friend.`,
  "notice.needs-players-reminder.title": (p) =>
    `${s(p.title)} needs ${count(p.n)} more`,
  "notice.needs-players-reminder.body": (p) =>
    `If ${count(p.n)} more ${joins(p.n)} by ${s(p.lock)} it's on. Share the link.`,
  "notice.confirmed.title": (p) => `${s(p.title)} is on`,
  "notice.confirmed.body": (p) =>
    count(p.returned) > 0
      ? `${players(p.group, p.unit)}. You paid ${credits(p.paid)}; ${count(p.returned)} ${count(p.returned) === 1 ? "is" : "are"} back in your wallet.`
      : `${players(p.group, p.unit)}.`,
  "notice.cancelled-low.title": (p) => `${s(p.title)} is cancelled`,
  "notice.cancelled-low.body": (p) =>
    `Only ${count(p.booked)} of the ${players(p.min, p.unit)} it needs booked. ${s(p.refund)}`.trim(),
  "notice.cancelled-club.title": (p) => `${s(p.title)} is cancelled`,
  "notice.cancelled-club.body": (p) =>
    `${s(p.club)}: ${s(p.reason)}. ${s(p.refund)}`.trim(),
  "notice.lock-extended.title": (p) =>
    `${s(p.title)}: decision moved to ${s(p.lock)}`,
  "notice.lock-extended.body": () => "Free cancellation until then too.",
  "notice.moved.title": (p) => `${s(p.title)} moved to ${s(p.time)}`,
  "notice.moved.body": (p) =>
    `Same price or less. Can't make it? Cancel by ${s(p.lock)} for a full refund.`,
  "notice.waitlist-offer.title": (p) => `A place opened in ${s(p.title)}`,
  "notice.waitlist-offer.body": (p) => `Book by ${s(p.until)} to take it.`,
  "notice.place-refilled.title": () => "Your place was taken",
  "notice.place-refilled.body": (p) =>
    `${credits(p.n)} ${count(p.n) === 1 ? "is" : "are"} back in your wallet.`,
  "notice.staff-at-risk-digest.title": (p) =>
    `${count(p.n)} session${count(p.n) === 1 ? "" : "s"} need${count(p.n) === 1 ? "s" : ""} players this week`,
  "notice.staff-cancelled.title": (p) =>
    `${s(p.title)} cancelled · ${count(p.booked)} of ${count(p.min)}`,
  "notice.refund-attention.title": (p) =>
    `A card refund for ${s(p.title)} needs you`,
  "error.already-booked": () => "You're already booked for this session",
};

export function renderParticipationCopy(
  token: ParticipationToken,
  locale = "en",
): string {
  // One table today. Unknown locales fall back to English, never to a key.
  void locale;
  return english[token.key](token.params);
}

/** The refund line a cancellation notice carries. */
export function participationRefundLine(input: {
  readonly credits: number;
  readonly cardAmount?: string;
}): string {
  if (input.cardAmount) {
    return `Your ${input.cardAmount} refund is on its way to your card; it can take 5–10 business days.`;
  }
  if (input.credits > 0) {
    return `${input.credits} credit${input.credits === 1 ? " is" : "s are"} back in your wallet.`;
  }
  return "";
}
