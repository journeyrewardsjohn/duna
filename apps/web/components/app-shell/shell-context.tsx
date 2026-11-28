"use client";

import { createContext, useContext } from "react";
import type { AppSession } from "./session-types";

export interface AppShellApi {
  readonly session: AppSession;
  /** Opens Ask Duna, optionally with a question to send. */
  readonly openAsk: (prompt?: string) => void;
  /** Opens the create action ("New"). */
  readonly openNew: () => void;
}

export const AppShellContext = createContext<AppShellApi | null>(null);

/** The shell's session and actions, for client parts of a page. */
export function useAppShell(): AppShellApi {
  const api = useContext(AppShellContext);
  if (!api) throw new Error("useAppShell() must be used inside <AppShell>.");
  return api;
}
