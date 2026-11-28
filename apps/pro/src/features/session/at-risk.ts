/**
 * "At risk this week" (participation.md §7.4, Today and Schedule): the
 * sessions under their minimum, each with the shared compact state
 * ("Needs 2 more") and the decision time with a countdown. Pure; the words
 * come from `@duna/core` through `sessionDisplay`.
 */
import { renderParticipationCopy } from "@duna/core";
import { countdownParts, formatCountdown } from "@duna/tideline-core";
import {
  sessionDisplay,
  sessionFromAtRisk,
  sessionTime,
  type AtRiskSessionInput,
} from "./session-model";

export interface AtRiskRow {
  readonly id: string;
  readonly title: string;
  /** "Thu 4:30 PM": the session's start. */
  readonly when: string;
  /** "Needs 2 more" (core `status.needs`). */
  readonly status: string;
  /** "At risk · needs 2 by Thu 6:00 PM" (core `staff.at-risk`). */
  readonly staff: string;
  /** "Thu 6:00 PM": the decision time. */
  readonly decides: string;
  /** "in 3h 05m" until the decision; null once it has passed. */
  readonly countdown: string | null;
  readonly lockAt: number;
  readonly startsAt: number;
  readonly accessibilityLabel: string;
}

export const AT_RISK_HORIZON_MS = 7 * 24 * 60 * 60_000;

/** Sessions still under their minimum this week, soonest decision first. */
export function atRiskRows(
  sessions: readonly AtRiskSessionInput[],
  now: number,
  timeZone = "UTC",
  locale = "en-US",
): readonly AtRiskRow[] {
  return sessions
    .map((risk) => {
      const detail = sessionFromAtRisk(risk, timeZone);
      const display = sessionDisplay(detail, now);
      return { risk, detail, display };
    })
    .filter(
      ({ detail, display }) =>
        display.state === "needs-players" &&
        detail.startsAt > now &&
        detail.startsAt - now <= AT_RISK_HORIZON_MS,
    )
    .sort(
      (left, right) => left.detail.group!.lockAt - right.detail.group!.lockAt,
    )
    .map(({ risk, detail, display }): AtRiskRow => {
      const lockAt = detail.group!.lockAt;
      const parts = countdownParts(lockAt, now);
      const countdown =
        parts.direction === "in" ? formatCountdown(parts) : null;
      const day = new Intl.DateTimeFormat(locale, {
        weekday: "short",
        timeZone: detail.timeZone,
      }).format(new Date(detail.startsAt));
      const status = renderParticipationCopy(display.status);
      const staff = renderParticipationCopy(display.staff);
      const decides = display.lock?.label ?? "";
      return {
        id: risk.subjectId,
        title: risk.title,
        when: `${day} ${sessionTime(detail, locale)}`,
        status,
        staff,
        decides,
        countdown,
        lockAt,
        startsAt: detail.startsAt,
        accessibilityLabel: [
          risk.title,
          `${day} ${sessionTime(detail, locale)}`,
          staff,
          countdown ? `Decision ${countdown}` : undefined,
        ]
          .filter(Boolean)
          .join(". "),
      };
    });
}
