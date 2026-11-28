"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { ShellSession } from "./session-types";

/** What a page tells the shell about itself (see `ShellPage`). */
export interface ShellPageInfo {
  /** The last breadcrumb: an object's name, like "Mara Lewis". */
  readonly crumb?: string;
  /** A link for the area crumb when the page is below the area's list. */
  readonly parentHref?: string;
  /** How Ask Duna names this page: "Today", "Mara Lewis's membership". */
  readonly askLabel?: string;
  /** Prompts Ask Duna offers on this page, most useful first. */
  readonly askStarters?: readonly string[];
}

export interface ShellApi {
  readonly session: ShellSession;
  /** Opens the docked Ask Duna panel, optionally starting with a prompt. */
  readonly openAsk: (prompt?: string) => void;
  readonly closeAsk: () => void;
  readonly askOpen: boolean;
  readonly page: ShellPageInfo;
  readonly setPage: (page: ShellPageInfo) => void;
}

export const ShellContext = createContext<ShellApi | null>(null);

/** The shell's API. Throws outside the `(next)` shell, where it cannot work. */
export function useShell(): ShellApi {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell needs the HQ shell (app/(next)).");
  return shell;
}

/** The person, organisation and permissions, in a client component. */
export function useShellSession(): ShellSession {
  return useShell().session;
}

/**
 * Tells the shell about the page: the last breadcrumb and Ask Duna's page
 * context. Render it once near the top of a `(next)` page; it renders nothing.
 *
 *   <ShellPage askLabel="Today" askStarters={["What needs me today?"]} />
 */
export function ShellPage(props: ShellPageInfo & { children?: ReactNode }) {
  const { setPage } = useShell();
  const { crumb, parentHref, askLabel } = props;
  const starters = props.askStarters?.join("\n");
  useEffect(() => {
    setPage({
      crumb,
      parentHref,
      askLabel,
      askStarters: starters ? starters.split("\n") : undefined,
    });
    return () => setPage({});
  }, [setPage, crumb, parentHref, askLabel, starters]);
  return props.children ?? null;
}
