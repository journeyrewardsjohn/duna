import type { PersonRole } from "@duna/core";

/**
 * The one table of what each role may do (PRIV-2). An actor's scopes are the
 * scopes of every role it holds (see `createApiContextFromWorkOSSession`)
 * plus the scopes stored on its memberships, and the stored scopes for a staff
 * role are derived from this table by `scopesForOrganizationStaffRole`, so the
 * two can no longer disagree.
 */
export const roleScopes: Readonly<Record<PersonRole, readonly string[]>> = {
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
    "messages:read",
    "messages:write",
  ],
  guardian: [
    "profile:read",
    "minor:read",
    "minor:write",
    "bookings:read",
    "bookings:write",
    "wallet:read",
    "wallet:write",
    "messages:read",
    "messages:write",
  ],
  coach: [
    "members:read",
    "sessions:read",
    "training:read",
    "training:write",
    "matches:read",
    "matches:write",
    "matches:score",
    "payments:collect",
    "messages:read",
    "messages:write",
    "messages:propose",
    "reports:read",
    "audiences:read",
    "audiences:write",
  ],
  owner: ["*"],
  manager: [
    "members:read",
    "members:write",
    "sessions:read",
    "sessions:write",
    "training:read",
    "training:write",
    "matches:read",
    "matches:write",
    "matches:score",
    "tickets:scan",
    "messages:read",
    "messages:write",
    "messages:propose",
    "payments:read",
    "reports:read",
    "audiences:read",
    "audiences:write",
  ],
  "front-desk": [
    "members:read",
    "sessions:read",
    "sessions:write",
    "training:read",
    "bookings:write",
    "payments:collect",
    "tickets:scan",
    "messages:read",
    "messages:write",
  ],
  scorekeeper: ["sessions:read", "matches:read", "matches:score"],
  accountant: ["sessions:read", "payments:read", "reports:read"],
  admin: ["platform:read", "trust:write", "organizations:read", "audit:read"],
  "super-admin": ["*"],
};

export function scopesForRoles(
  roles: readonly PersonRole[],
): readonly string[] {
  return [...new Set(roles.flatMap((role) => roleScopes[role] ?? []))];
}

/**
 * A Director is a manager membership with these extra grants stored on it
 * (see `membershipRoleForOrganizationStaffRole`).
 */
export const directorExtraScopes: readonly string[] = [
  "payments:write",
  "payments:collect",
];
