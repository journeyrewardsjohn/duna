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
    value: `go:${hqHref("teamInvite")}`,
    label: "Invite a team member",
    group: "Create",
    icon: "partner",
    keywords: ["coach", "staff"],
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
