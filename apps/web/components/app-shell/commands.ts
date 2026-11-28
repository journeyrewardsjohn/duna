import type { CommandPaletteItem } from "@duna/ui/tideline";
import {
  APP_ROUTES,
  APP_VERBS,
  NEW_ACTIONS,
  isDynamicRoute,
  type AppRoute,
} from "@/lib/app-routes";

/** A palette value: `go:<path>` navigates, `do:<action>` runs a shell action. */
export type ShellCommand =
  | { readonly kind: "go"; readonly href: string }
  | {
      readonly kind: "do";
      readonly action:
        "ask" | "new" | "theme-light" | "theme-dark" | "theme-system";
    }
  | { readonly kind: "act"; readonly personId: string | null }
  | { readonly kind: "unknown" };

const verbTitle = (verb: AppRoute["verb"]) =>
  APP_VERBS.find((definition) => definition.key === verb)?.title ?? "Play";

/**
 * The command palette (Cmd/Ctrl K): every listed page in the route table,
 * grouped by verb, the create actions, Ask Duna, appearance, and for a
 * guardian the accounts they can act for.
 */
export function shellCommands(options: {
  readonly junior: boolean;
  readonly dependents?: readonly {
    readonly personId: string;
    readonly displayName: string;
  }[];
}): CommandPaletteItem[] {
  const pages = (Object.values(APP_ROUTES) as AppRoute[])
    .filter(
      (route) =>
        route.listed &&
        !isDynamicRoute(route) &&
        !(options.junior && route.adultOnly),
    )
    .map((route) => ({
      value: `go:${route.path}`,
      label: route.title,
      group: verbTitle(route.verb),
      icon: route.icon,
      keywords: [route.summary, verbTitle(route.verb)],
    }));
  const create = NEW_ACTIONS.filter(
    (action) => !(options.junior && action.adultOnly),
  ).map((action) => ({
    value: `go:${action.href}#${action.key}`,
    label: action.title,
    group: "New",
    icon: action.icon,
    keywords: [action.summary, "new", "create"],
  }));
  const accounts = options.dependents?.length
    ? [
        {
          value: "act:self",
          label: "Show my own account",
          group: "Whose account",
          icon: "you" as const,
          keywords: ["acting for", "switch", "me"],
        },
        ...options.dependents.map((dependent) => ({
          value: `act:${dependent.personId}`,
          label: `Act for ${dependent.displayName}`,
          group: "Whose account",
          icon: "junior-guardian" as const,
          keywords: ["acting for", "junior", "child", "switch"],
        })),
      ]
    : [];
  return [
    ...pages,
    ...create,
    {
      value: "do:ask",
      label: "Ask Duna",
      group: "Duna",
      icon: "thread",
      shortcut: "mod+j",
      keywords: ["ai", "help", "question"],
    },
    ...accounts,
    {
      value: "do:theme-system",
      label: "Appearance: match device",
      group: "Appearance",
      keywords: ["theme", "system", "auto"],
    },
    {
      value: "do:theme-light",
      label: "Appearance: light",
      group: "Appearance",
      keywords: ["theme"],
    },
    {
      value: "do:theme-dark",
      label: "Appearance: dark",
      group: "Appearance",
      keywords: ["theme", "night"],
    },
  ];
}

export function parseShellCommand(value: string): ShellCommand {
  if (value.startsWith("go:")) {
    return { kind: "go", href: value.slice(3).split("#")[0] ?? "/app" };
  }
  if (value.startsWith("act:")) {
    const id = value.slice(4);
    return { kind: "act", personId: id === "self" ? null : id };
  }
  const action = value.slice(3);
  if (
    value.startsWith("do:") &&
    ["ask", "new", "theme-light", "theme-dark", "theme-system"].includes(action)
  ) {
    return {
      kind: "do",
      action: action as Extract<ShellCommand, { kind: "do" }>["action"],
    };
  }
  return { kind: "unknown" };
}
