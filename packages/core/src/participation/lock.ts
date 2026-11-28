/**
 * The lock: when the group is decided and, by decision 1, the last moment to
 * cancel for free. The lock is an INSTANT (start minus minutes), so across a
 * daylight-saving change "24 hours before" is 24 real hours. Words on screen
 * use the venue's zone; a viewer elsewhere also sees their own time.
 */

/**
 * When the minimum is checked. A session that opened inside its own lock
 * window (created, published or given rules shortly before it starts) would
 * otherwise be decided the moment it appears; its lock moves to halfway
 * between opening and the start. An operator's "Extend the lock" wins.
 */
export function participationLockAt(input: {
  readonly startsAt: Date;
  readonly lockMinutesBeforeStart: number;
  readonly openedAt?: Date;
  readonly overrideAt?: Date | null;
}): Date {
  if (input.overrideAt && input.overrideAt < input.startsAt) {
    return new Date(input.overrideAt.getTime());
  }
  const nominal = new Date(
    input.startsAt.getTime() - input.lockMinutesBeforeStart * 60_000,
  );
  if (!input.openedAt || input.openedAt <= nominal) return nominal;
  return new Date(
    input.openedAt.getTime() +
      Math.max(0, input.startsAt.getTime() - input.openedAt.getTime()) / 2,
  );
}

/** Checks an operator's new lock: later than now and the current lock, before the start. */
export function validateLockExtension(input: {
  readonly currentLockAt: Date;
  readonly requestedLockAt: Date;
  readonly startsAt: Date;
  readonly now: Date;
}): string | undefined {
  if (Number.isNaN(input.requestedLockAt.getTime())) {
    return "Choose a valid time.";
  }
  if (input.requestedLockAt >= input.startsAt) {
    return "We need to decide before the session starts.";
  }
  if (input.requestedLockAt <= input.currentLockAt) {
    return "The new decision time must be later than the current one.";
  }
  if (input.requestedLockAt <= input.now) {
    return "The new decision time must be in the future.";
  }
  return undefined;
}

interface ZonedParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function zonedDate(at: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(at);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day") };
}

/** Whole calendar days between two instants, counted in one zone. */
export function calendarDaysBetween(
  from: Date,
  to: Date,
  timeZone: string,
): number {
  const a = zonedDate(from, timeZone);
  const b = zonedDate(to, timeZone);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) /
      86_400_000,
  );
}

function safeZone(timeZone: string | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

export interface ParticipationTimeLabel {
  /** ISO instant. */
  readonly at: string;
  /** "Thu 6:00 PM" within 6 days, "Dec 18, 6:00 PM" beyond (venue zone). */
  readonly label: string;
  /** "Thu 6:00 PM PST (9:00 PM your time)" when the viewer is elsewhere. */
  readonly labelWithViewer?: string;
  readonly timeZone: string;
}

/**
 * Formats a lock or start for every surface the same way. Day name within 6
 * days, the date beyond; the venue's zone; the viewer's time added when the
 * viewer's zone shows a different wall clock.
 */
export function formatParticipationTime(input: {
  readonly at: Date;
  readonly now: Date;
  readonly timeZone?: string;
  readonly viewerTimeZone?: string;
  readonly locale?: string;
}): ParticipationTimeLabel {
  const zone = safeZone(input.timeZone);
  const locale = input.locale ?? "en-US";
  const days = calendarDaysBetween(input.now, input.at, zone);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  }).format(input.at);
  const day =
    days >= 0 && days <= 6
      ? new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: "short" }).format(
          input.at,
        )
      : new Intl.DateTimeFormat(locale, {
          timeZone: zone,
          month: "short",
          day: "numeric",
        }).format(input.at) + ",";
  const label = `${day} ${time}`;
  let labelWithViewer: string | undefined;
  if (input.viewerTimeZone) {
    const viewer = safeZone(input.viewerTimeZone);
    const viewerTime = new Intl.DateTimeFormat(locale, {
      timeZone: viewer,
      hour: "numeric",
      minute: "2-digit",
    }).format(input.at);
    const sameWallClock =
      viewerTime === time &&
      zonedDate(input.at, viewer).day === zonedDate(input.at, zone).day;
    if (viewer !== zone && !sameWallClock) {
      const abbreviation =
        new Intl.DateTimeFormat(locale, {
          timeZone: zone,
          timeZoneName: "short",
        })
          .formatToParts(input.at)
          .find((part) => part.type === "timeZoneName")?.value ?? zone;
      labelWithViewer = `${label} ${abbreviation} (${viewerTime} your time)`;
    }
  }
  return {
    at: input.at.toISOString(),
    label,
    ...(labelWithViewer ? { labelWithViewer } : {}),
    timeZone: zone,
  };
}
