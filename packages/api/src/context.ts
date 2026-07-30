import type { PersonRole } from "@duna/core";
import { demoOrganization, demoPlayer } from "@duna/core/demo";

export interface ApiActor {
  readonly personId: string;
  readonly displayName: string;
  readonly roles: readonly PersonRole[];
  readonly organizationId?: string;
  readonly scopes: readonly string[];
  readonly isDemo: boolean;
}

export interface ApiContext {
  readonly actor?: ApiActor;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly now: Date;
}

const roleScopes: Readonly<Record<PersonRole, readonly string[]>> = {
  player: [
    "profile:read",
    "profile:write",
    "matches:read",
    "matches:write",
    "bookings:read",
    "bookings:write",
    "wallet:read",
    "wallet:write",
    "social:write",
  ],
  guardian: [
    "profile:read",
    "minor:read",
    "minor:write",
    "bookings:read",
    "bookings:write",
    "wallet:read",
    "wallet:write",
  ],
  coach: [
    "members:read",
    "sessions:read",
    "sessions:write",
    "matches:read",
    "matches:write",
    "messages:propose",
    "reports:read",
  ],
  owner: ["*"],
  manager: [
    "members:read",
    "members:write",
    "sessions:read",
    "sessions:write",
    "matches:read",
    "matches:write",
    "payments:read",
    "payments:write",
    "messages:propose",
    "reports:read",
  ],
  "front-desk": [
    "members:read",
    "sessions:read",
    "bookings:write",
    "payments:write",
    "tickets:scan",
  ],
  scorekeeper: ["sessions:read", "matches:read", "matches:score"],
  accountant: ["payments:read", "reports:read"],
  admin: ["platform:read", "trust:write", "organizations:read", "audit:read"],
  "super-admin": ["*"],
};

export function scopesForRoles(
  roles: readonly PersonRole[],
): readonly string[] {
  return [...new Set(roles.flatMap((role) => roleScopes[role] ?? []))];
}

export function createDemoActor(
  roles: readonly PersonRole[] = ["player", "manager"],
): ApiActor {
  return {
    personId: demoPlayer.id,
    displayName: demoPlayer.displayName,
    roles,
    organizationId: demoOrganization.id,
    scopes: scopesForRoles(roles),
    isDemo: true,
  };
}

export function createApiContext(input?: {
  readonly actor?: ApiActor;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly now?: Date;
}): ApiContext {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
  return {
    actor: input?.actor ?? (demoMode ? createDemoActor() : undefined),
    requestId: input?.requestId ?? crypto.randomUUID(),
    ipAddress: input?.ipAddress,
    userAgent: input?.userAgent,
    now: input?.now ?? new Date(),
  };
}
