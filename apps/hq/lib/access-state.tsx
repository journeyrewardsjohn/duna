import { log } from "@duna/observability";
import { PermissionDenied } from "@duna/ui/tideline";
import type { ReactNode } from "react";

/**
 * HQ's one "You need access" state (the kit's PermissionDenied: what, who can
 * grant it, a way on), shared by the new shell (app/(next)) and the legacy
 * pages' `AccessDenied` (lib/access.tsx). Design system only: safe to import
 * from app/(next). Logged at info: a refusal is a normal outcome.
 */
export function AccessDeniedState({
  area,
  grantedBy = "an owner of your club",
  action,
  compact,
  reason = "missing-scope",
}: {
  /** What they tried to open: "Money", "Duna HQ". */
  readonly area: string;
  readonly grantedBy?: string;
  readonly action?: ReactNode;
  readonly compact?: boolean;
  readonly reason?: "missing-scope" | "not-staff" | "signed-out";
}) {
  log.info("hq.access.denied", { area, reason });
  return (
    <PermissionDenied
      action={action}
      area={area}
      compact={compact}
      grantedBy={grantedBy}
    />
  );
}
