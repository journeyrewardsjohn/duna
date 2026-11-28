import type { OrganizationSummary, PersonRole } from "@duna/core";
import type { WorkspaceOption } from "@/lib/workspace-options";

/**
 * What the shell knows about the person on the page. Serialisable: the server
 * layout builds it (`getHqSession`) and hands it to the client shell.
 */
export interface ShellSession {
  /** Sign-in is set up (production). False in demo and local development. */
  readonly authConfigured: boolean;
  /** Demo data: no real club and no real person behind the page. */
  readonly demo: boolean;
  readonly person?: { readonly id: string; readonly displayName: string };
  readonly roles: readonly PersonRole[];
  /** "Owner", "Coach"…: the most senior HQ role. */
  readonly roleLabel?: string;
  /** Permission scopes; `*` holds every scope. Read with `hasScope`. */
  readonly scopes: readonly string[];
  /**
   * `operator`: works in HQ for this organisation. `denied`: signed in but
   * not staff here (a player or a guardian). `none`: signed out.
   */
  readonly access: "operator" | "denied" | "none";
  readonly organization?: Pick<
    OrganizationSummary,
    "id" | "name" | "plan" | "timezone" | "stripeStatus"
  >;
  /** Organisations the person may switch to (empty without sign-in). */
  readonly workspaces: readonly WorkspaceOption[];
  readonly currentWorkspaceId?: string;
  /**
   * `ready`: Ask Duna can run. Everything else is an honest state the panel
   * shows instead of making a request that would fail.
   */
  readonly askDuna:
    "ready" | "demo" | "not-configured" | "no-access" | "signed-out";
}
