import type {
  OperatorDashboard,
  OperatorScorableMatch,
  OrganizationSetupReadiness,
} from "@duna/api";
import { hqHref, hqModuleHref } from "@duna/core/hq-routes";
import type { Metric } from "@duna/core";

/**
 * Pure rules for the Today screen (no React), unit-tested in
 * today-model.test.ts: what needs the owner, what Ask Duna suggests, and how
 * the schedule and the numbers read.
 */

export type ScheduleItem = OperatorDashboard["schedule"][number];

export interface ScheduleStatus {
  readonly label: string;
  /**
   * `live` (Solar, pulsing) is only for play in progress. "Almost full" is a
   * quiet note with an icon, never a coloured status that reads as live.
   */
  readonly tone: "live" | "positive" | "note" | "neutral";
}

/** The status chip of a schedule row; `undefined` for an ordinary open session. */
export function scheduleStatus(item: ScheduleItem): ScheduleStatus | undefined {
  switch (item.state) {
    case "live":
      return { label: "Live", tone: "live" };
    case "full":
      return { label: "Full", tone: "positive" };
    case "almost-full":
      return {
        label: `${item.spotsRemaining} ${item.spotsRemaining === 1 ? "spot" : "spots"} left`,
        tone: "note",
      };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    default:
      return undefined;
  }
}

/** "Clinic", "Open play", "Court rental". */
export function kindLabel(kind: string): string {
  const words = kind.split("-").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface AttentionItem {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly href: string;
  readonly action: string;
  readonly icon: "pay" | "schedule" | "score" | "users" | "alert" | "info";
}

/**
 * Payment setup copy in Duna's own words (the dashboard's alert names the
 * provider, which product copy never does).
 */
function paymentsAttention(
  status: OperatorDashboard["organization"]["stripeStatus"],
): AttentionItem {
  return {
    id: "payments",
    title:
      status === "restricted"
        ? "Duna Pay needs your attention"
        : "Set up Duna Pay",
    detail:
      status === "restricted"
        ? "Charges or payouts are limited until a few details are confirmed."
        : "Take payments for bookings and memberships, and get paid out.",
    href: hqHref("moneySetup"),
    action: status === "restricted" ? "Review Duna Pay" : "Set up Duna Pay",
    icon: "pay",
  };
}

/**
 * What needs the owner today, most urgent first: payments that block money,
 * matches waiting for a score, sessions about to fill, then the dashboard's
 * own alerts.
 */
export function attentionItems({
  dashboard,
  matches,
}: {
  readonly dashboard: OperatorDashboard;
  readonly matches: readonly OperatorScorableMatch[];
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (dashboard.organization.stripeStatus !== "connected") {
    items.push(paymentsAttention(dashboard.organization.stripeStatus));
  }
  if (matches.length > 0) {
    const live = matches.filter((match) => match.status === "live").length;
    items.push({
      id: "matches",
      title: `${matches.length} ${matches.length === 1 ? "match is" : "matches are"} waiting for a score`,
      detail:
        live > 0
          ? `${live} ${live === 1 ? "is" : "are"} being played now.`
          : "Scores keep ratings and standings right.",
      href: hqModuleHref("events"),
      action: "Open matches",
      icon: "score",
    });
  }
  for (const item of dashboard.schedule) {
    if (item.state !== "almost-full") continue;
    items.push({
      id: `filling-${item.id}`,
      title: `${item.title} is almost full`,
      detail: `${item.spotsRemaining} of ${item.capacity} spots left · ${item.time}`,
      href: hqHref("event", { sessionId: item.id }),
      action: "Open session",
      icon: "users",
    });
  }
  for (const alert of dashboard.alerts) {
    // The payments alert is covered above, in Duna's words.
    if (alert.id === "stripe") continue;
    items.push({
      id: `alert-${alert.id}`,
      title: alert.title,
      detail: alert.detail,
      href: hqModuleHref("schedule"),
      action: alert.action || "Review",
      icon: alert.tone === "warning" ? "alert" : "info",
    });
  }
  return items;
}

/** The numbers row: the dashboard's metrics without the payments prompt. */
export function glanceMetrics(metrics: readonly Metric[]): Metric[] {
  return metrics.filter((metric) => metric.label !== "Payments").slice(0, 4);
}

/** A club with nothing in it yet: no sessions, no events, no people. */
export function isFirstDay({
  dashboard,
  memberCount,
}: {
  readonly dashboard: OperatorDashboard;
  readonly memberCount: number;
}): boolean {
  return (
    dashboard.schedule.length === 0 &&
    dashboard.events.length === 0 &&
    memberCount === 0
  );
}

/**
 * What Ask Duna offers to do next, built only from what the data shows (no
 * invented facts): the next setup step, a session filling up, a failed
 * payment state, then a summary of the day.
 */
export function askSuggestions({
  dashboard,
  setup,
}: {
  readonly dashboard?: OperatorDashboard;
  readonly setup?: OrganizationSetupReadiness;
}): string[] {
  const suggestions: string[] = [];
  if (setup?.nextStep) {
    suggestions.push(`Help me ${setup.nextStep.label.toLowerCase()}`);
  }
  const filling = dashboard?.schedule.find(
    (item) => item.state === "almost-full",
  );
  if (filling) {
    suggestions.push(`Should I add another ${filling.title} session?`);
  }
  if (dashboard && dashboard.schedule.length > 0) {
    suggestions.push("Summarise today's schedule and who is coming");
  }
  if (dashboard && dashboard.schedule.length === 0) {
    suggestions.push("Draft our first week of sessions");
  }
  suggestions.push("What needs my attention today?");
  return [...new Set(suggestions)].slice(0, 3);
}

/** "Friday, November 27" in the club's time zone. */
export function todayLabel(timezone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: timezone,
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(now);
  }
}
