import { hqHref } from "@duna/core/hq-routes";
import type { CommandPaletteItem } from "@duna/ui/tideline";
import { operatorNavigationItems } from "../navigation";

/**
 * What the command palette can do (Cmd/Ctrl K). Values are `go:<path>` for a
 * place, or `do:<command>` for something the shell runs itself. Every place
 * comes from the route map, so the palette never lists a dead address.
 */
export type ShellCommandValue = `go:${string}` | `do:${ShellAction}`;
export type ShellAction = "ask" | "theme-light" | "theme-dark" | "theme-system";

export interface ShellCommand extends CommandPaletteItem {
  readonly value: ShellCommandValue;
}

const places: readonly ShellCommand[] = [
  ...operatorNavigationItems.map((item): ShellCommand => ({
    value: `go:${item.href}`,
    label: item.label,
    group: "Go to",
    icon: item.icon,
    keywords: [item.group],
  })),
  {
    value: `go:${hqHref("settings")}`,
    label: "Club settings",
    group: "Go to",
    icon: "key",
    keywords: ["preferences", "billing", "roles"],
  },
  {
    value: `go:${hqHref("account")}`,
    label: "Your account",
    group: "Go to",
    icon: "you",
    keywords: ["profile", "password", "personal"],
  },
];

const create: readonly ShellCommand[] = [
  {
    value: `go:${hqHref("eventCreate")}`,
    label: "Create an event",
    group: "Create",
    icon: "trophy",
    keywords: ["tournament", "clinic", "league", "open play"],
  },
  {
    value: `go:${hqHref("offeringCreate")}`,
    label: "Create an offering",
    group: "Create",
    icon: "pass",
    keywords: ["lesson", "membership", "pack", "product"],
  },
  {
    value: `go:${hqHref("memberInvite")}`,
    label: "Add a person",
    group: "Create",
    icon: "user-plus",
    keywords: ["member", "player", "guardian", "invite"],
  },
  {
    value: `go:${hqHref("inboxCreate")}`,
    label: "Send an update",
    group: "Create",
    icon: "send",
    keywords: ["message", "email", "announce"],
  },
  {
    value: `go:${hqHref("trainingPracticePlanCreate")}`,
    label: "Plan a practice",
    group: "Create",
    icon: "coach",
    keywords: ["drill", "session"],
  },
  {
    value: `go:${hqHref("placeCreate")}`,
    label: "Add a place and courts",
    group: "Create",
    icon: "venue",
    keywords: ["venue", "court", "location"],
  },
];

/** Money (H10): its tabs and the money tasks people ask for by name. */
const money: readonly ShellCommand[] = [
  {
    value: `go:${hqHref("moneyPayouts")}`,
    label: "Go to payouts",
    group: "Money",
    icon: "wallet",
    keywords: ["payout", "bank", "schedule", "transfer"],
  },
  {
    value: `go:${hqHref("moneyTransactions")}`,
    label: "Go to transactions",
    group: "Money",
    icon: "pay",
    keywords: ["sales", "payments", "orders", "fees"],
  },
  {
    value: `go:${hqHref("moneyTransactions")}?refund=1`,
    label: "Refund a sale…",
    group: "Money",
    icon: "undo",
    keywords: ["refund", "money back", "credit"],
  },
  {
    value: `go:${hqHref("moneyDisputes")}`,
    label: "Respond to a dispute",
    group: "Money",
    icon: "policy",
    keywords: ["chargeback", "dispute", "evidence"],
  },
  {
    value: `go:${hqHref("moneyDunaPay")}`,
    label: "Set up Duna Pay",
    group: "Money",
    icon: "verified",
    keywords: ["payments", "verify", "bank", "onboarding"],
  },
  {
    value: `go:${hqHref("moneyHolds")}`,
    label: "See held money",
    group: "Money",
    icon: "clock",
    keywords: ["hold", "reserve", "owed"],
  },
];

/** Schedule (H-SCHEDULE): the calendar tasks the front desk asks for by name. */
const schedule: readonly ShellCommand[] = [
  {
    value: `go:${hqHref("schedule")}?intent=date`,
    label: "Go to date…",
    group: "Schedule",
    icon: "schedule",
    keywords: ["calendar", "day", "jump", "date"],
  },
  {
    // Opens the create sheet, which offers only what works here (blocks
    // until bookings from HQ are switched on: schedule-capabilities.ts).
    value: `go:${hqHref("schedule")}?intent=book`,
    label: "Add to the schedule",
    group: "Schedule",
    icon: "court",
    keywords: [
      "book a court",
      "booking",
      "reserve",
      "walk-in",
      "block",
      "lesson",
    ],
  },
  {
    value: `go:${hqHref("schedule")}?intent=who`,
    label: "Who is free at…",
    group: "Schedule",
    icon: "users",
    keywords: ["coach", "available", "availability", "cover"],
  },
  {
    value: `go:${hqHref("schedule")}?intent=close`,
    label: "Close courts",
    group: "Schedule",
    icon: "block",
    keywords: ["closure", "block", "maintenance", "weather", "stop play"],
  },
];

/** Team (H-TEAM): inviting, cover and pay, by the words people use. */
const team: readonly ShellCommand[] = [
  {
    value: `go:${hqHref("teamInvite")}`,
    label: "Invite a coach",
    group: "Team",
    icon: "user-plus",
    keywords: ["staff", "team member", "manager", "front desk", "invite"],
  },
  {
    value: `go:${hqHref("teamCoverage")}?at=thu-18`,
    label: "Who is free Thursday at 6?",
    group: "Team",
    icon: "schedule",
    keywords: ["available", "free", "cover", "substitute", "coach"],
  },
  {
    value: `go:${hqHref("teamCoverage")}`,
    label: "Find cover for a session",
    group: "Team",
    icon: "coach",
    keywords: ["coverage", "substitute", "sick", "time off", "gap"],
  },
  {
    value: `go:${hqHref("teamPay")}`,
    label: "Run team pay",
    group: "Team",
    icon: "wallet",
    keywords: ["payroll", "pay run", "export", "coaches pay"],
  },
];

/** Offerings (H-OFFER): group sessions and the club's booking rule by name. */
const offerings: readonly ShellCommand[] = [
  {
    value: `go:${hqHref("offeringsAtRisk")}`,
    label: "Sessions at risk this week",
    group: "Offerings",
    icon: "users",
    keywords: ["needs players", "minimum", "cancel", "merge", "clinic"],
  },
  {
    value: `go:${hqHref("offeringsSettings")}`,
    label: "Set the club's booking rule",
    group: "Offerings",
    icon: "policy",
    keywords: ["minimum", "group size", "players", "decide", "default"],
  },
  {
    value: `go:${hqHref("offeringCreate")}?kind=services&template=clinic`,
    label: "New clinic",
    group: "Offerings",
    icon: "clinic",
    keywords: ["group", "lesson", "class"],
  },
  {
    value: `go:${hqHref("offeringCreate")}?kind=plans&template=membership`,
    label: "New membership",
    group: "Offerings",
    icon: "member-card",
    keywords: ["monthly", "plan", "subscription"],
  },
  {
    value: `go:${hqHref("offeringCreate")}?kind=plans&template=credit-pack`,
    label: "New credit pack",
    group: "Offerings",
    icon: "credit-pack",
    keywords: ["credits", "pack", "bundle"],
  },
];

/** Club setup (H-SETUP): Duna reading the club's website, and its identity. */
const setup: readonly ShellCommand[] = [
  {
    value: `go:${hqHref("setupStart")}?path=website`,
    label: "Read my website",
    group: "Club setup",
    icon: "find",
    keywords: ["website", "import", "set up", "ai", "onboarding"],
  },
  {
    value: `go:${hqHref("setupIdentity")}`,
    label: "Edit club identity",
    group: "Club setup",
    icon: "member-card",
    keywords: ["name", "logo", "colour", "color", "brand", "hours", "contact"],
  },
  {
    value: `go:${hqHref("setupReview")}`,
    label: "Review what Duna found",
    group: "Club setup",
    icon: "check",
    keywords: ["proposals", "website read", "keep", "apply"],
  },
  {
    value: `go:${hqHref("places")}`,
    label: "Go to places and courts",
    group: "Club setup",
    icon: "venue",
    keywords: ["venue", "court", "layout", "map"],
  },
];

const run: readonly ShellCommand[] = [
  {
    value: "do:ask",
    label: "Ask Duna",
    group: "Do",
    icon: "find",
    keywords: ["assistant", "ai", "help"],
  },
  {
    value: "do:theme-light",
    label: "Use the light theme",
    group: "Do",
    icon: "full-sun",
    keywords: ["appearance", "mode"],
  },
  {
    value: "do:theme-dark",
    label: "Use the dark theme",
    group: "Do",
    icon: "under-lights",
    keywords: ["appearance", "mode", "night"],
  },
  {
    value: "do:theme-system",
    label: "Match the device theme",
    group: "Do",
    icon: "layout",
    keywords: ["appearance", "mode", "system"],
  },
];

/** Every command, places first. */
export const shellCommands: readonly ShellCommand[] = [
  ...places,
  ...create,
  ...schedule,
  ...money,
  ...team,
  ...offerings,
  ...setup,
  ...run,
];

export type ParsedCommand =
  | { readonly kind: "go"; readonly href: string }
  | { readonly kind: "do"; readonly action: ShellAction }
  | { readonly kind: "unknown" };

export function parseShellCommand(value: string): ParsedCommand {
  if (value.startsWith("go:")) {
    const href = value.slice(3);
    // Only local paths: a command never leaves HQ.
    return href.startsWith("/") && !href.startsWith("//")
      ? { kind: "go", href }
      : { kind: "unknown" };
  }
  if (value.startsWith("do:")) {
    const action = value.slice(3);
    if (run.some((command) => command.value === `do:${action}`)) {
      return { kind: "do", action: action as ShellAction };
    }
  }
  return { kind: "unknown" };
}
