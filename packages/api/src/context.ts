import { createClerkClient, type ClerkClient } from "@clerk/backend";
import type { PersonRole } from "@duna/core";
import { demoOrganization, demoPlayer } from "@duna/core/demo";
import {
  adminRoles,
  getDatabase,
  isDatabaseConfigured,
  organizationMemberships,
  organizations,
  people,
} from "@duna/db";
import { and, eq } from "drizzle-orm";
import {
  isClerkConfigured as hasClerkCredentials,
  resolveClerkCredentials,
} from "./clerk-environment";

export type ApiAgeBand = "unknown" | "under-13" | "teen" | "adult";

export interface ApiActor {
  readonly personId: string;
  readonly displayName: string;
  readonly roles: readonly PersonRole[];
  readonly organizationId?: string;
  readonly scopes: readonly string[];
  readonly ageBand: ApiAgeBand;
  readonly isDemo: boolean;
}

export interface ApiContext {
  readonly actor?: ApiActor;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly now: Date;
}

interface ApiContextInput {
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly now?: Date;
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
    "matches:score",
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
    "matches:score",
    "payments:read",
    "payments:write",
    "tickets:scan",
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
    ageBand: "adult",
    isDemo: true,
  };
}

export function createApiContext(input?: {
  readonly actor?: ApiActor;
  readonly requestId?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly now?: Date;
  readonly useDemoActor?: boolean;
}): ApiContext {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
  return {
    actor:
      input?.actor ??
      (demoMode && input?.useDemoActor !== false
        ? createDemoActor()
        : undefined),
    requestId: input?.requestId ?? crypto.randomUUID(),
    ipAddress: input?.ipAddress,
    userAgent: input?.userAgent,
    now: input?.now ?? new Date(),
  };
}

let clerkClient: ClerkClient | undefined;

function isClerkConfigured(): boolean {
  return Boolean(
    hasClerkCredentials() ||
    (process.env.CLERK_SECRET_KEY && process.env.CLERK_JWT_KEY),
  );
}

function getClerkClient(): ClerkClient {
  if (!clerkClient) {
    const credentials = resolveClerkCredentials();
    clerkClient = createClerkClient({
      secretKey: credentials?.secretKey ?? process.env.CLERK_SECRET_KEY,
      publishableKey: credentials?.publishableKey,
      jwtKey: process.env.CLERK_JWT_KEY,
      telemetry: { disabled: true },
    });
  }
  return clerkClient;
}

function authorizedParties(): string[] | undefined {
  const values = [
    ...(process.env.CLERK_AUTHORIZED_PARTIES?.split(",") ?? []),
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_HQ_URL,
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return values.length > 0 ? [...new Set(values)] : undefined;
}

function safeHandle(input: {
  readonly username?: string | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly userId: string;
}): string {
  const base = (
    input.username ??
    [input.firstName, input.lastName].filter(Boolean).join("-") ??
    "player"
  )
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "")
    .slice(0, 36);
  const suffix = input.userId.replaceAll(/[^a-zA-Z0-9]/g, "").slice(-8);
  return `${base || "player"}-${suffix}`.slice(0, 48);
}

async function resolveClerkPerson(client: ClerkClient, clerkUserId: string) {
  const database = getDatabase();
  let person = await database.query.people.findFirst({
    where: eq(people.clerkUserId, clerkUserId),
  });
  if (person) return person;

  const user = await client.users.getUser(clerkUserId);
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.username ||
    "Duna player";
  await database
    .insert(people)
    .values({
      clerkUserId,
      email: user.primaryEmailAddress?.emailAddress,
      phoneE164: user.primaryPhoneNumber?.phoneNumber,
      givenName: user.firstName,
      familyName: user.lastName,
      displayName,
      handle: safeHandle({
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        userId: clerkUserId,
      }),
      ageBand: "unknown",
      profileVisibility: "private",
    })
    .onConflictDoNothing();
  person = await database.query.people.findFirst({
    where: eq(people.clerkUserId, clerkUserId),
  });
  if (!person) throw new Error("Clerk identity could not be synchronized");
  return person;
}

async function resolveClerkOrganization(
  client: ClerkClient,
  clerkOrganizationId: string,
) {
  const database = getDatabase();
  let organization = await database.query.organizations.findFirst({
    where: eq(organizations.clerkOrganizationId, clerkOrganizationId),
  });
  if (organization) return organization;

  const clerkOrganization = await client.organizations.getOrganization({
    organizationId: clerkOrganizationId,
  });
  await database
    .insert(organizations)
    .values({
      clerkOrganizationId,
      slug: clerkOrganization.slug,
      name: clerkOrganization.name,
      plan: "coach",
      marketLaunchEnabled: false,
    })
    .onConflictDoNothing();
  organization = await database.query.organizations.findFirst({
    where: eq(organizations.clerkOrganizationId, clerkOrganizationId),
  });
  if (!organization) {
    throw new Error("Clerk organization could not be synchronized");
  }
  return organization;
}

async function resolveClerkActor(input: {
  readonly client: ClerkClient;
  readonly clerkUserId: string;
  readonly clerkOrganizationId?: string | null;
  readonly clerkOrganizationRole?: string | null;
}): Promise<ApiActor> {
  if (!isDatabaseConfigured()) {
    throw new Error("Clerk authentication requires DATABASE_URL");
  }
  const database = getDatabase();
  const person = await resolveClerkPerson(input.client, input.clerkUserId);
  const clerkUser = await input.client.users.getUser(input.clerkUserId);
  const configuredSuperAdmins = new Set(
    (process.env.DUNA_SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email: string) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  const configuredAdmins = new Set(
    (process.env.DUNA_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email: string) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  const email = clerkUser.primaryEmailAddress?.emailAddress.toLowerCase();
  const metadataRole =
    typeof clerkUser.privateMetadata.dunaRole === "string"
      ? clerkUser.privateMetadata.dunaRole
      : typeof clerkUser.publicMetadata.dunaRole === "string"
        ? clerkUser.publicMetadata.dunaRole
        : undefined;
  const platformRole =
    metadataRole === "super-admin" ||
    (email && configuredSuperAdmins.has(email))
      ? "super-admin"
      : metadataRole === "admin" || (email && configuredAdmins.has(email))
        ? "admin"
        : undefined;
  if (platformRole) {
    await database
      .insert(adminRoles)
      .values({
        personId: person.id,
        role: platformRole,
        scopes: [],
        grantedByPersonId: person.id,
      })
      .onConflictDoNothing();
  }
  const organization = input.clerkOrganizationId
    ? await resolveClerkOrganization(input.client, input.clerkOrganizationId)
    : undefined;

  const clerkOrganizationRole =
    input.clerkOrganizationRole?.replace(/^org:/, "") ?? undefined;
  const organizationRoleByClerkRole: Readonly<
    Record<
      string,
      | "owner"
      | "manager"
      | "coach"
      | "front-desk"
      | "scorekeeper"
      | "accountant"
    >
  > = {
    admin: "owner",
    owner: "owner",
    manager: "manager",
    coach: "coach",
    member: "coach",
    "front-desk": "front-desk",
    scorekeeper: "scorekeeper",
    accountant: "accountant",
  };
  const organizationRole = clerkOrganizationRole
    ? organizationRoleByClerkRole[clerkOrganizationRole]
    : undefined;
  if (organization && organizationRole) {
    await database
      .insert(organizationMemberships)
      .values({
        organizationId: organization.id,
        personId: person.id,
        role: organizationRole,
        scopes: [],
      })
      .onConflictDoNothing();
  }

  const [membershipRows, platformRoleRows] = await Promise.all([
    organization
      ? database
          .select()
          .from(organizationMemberships)
          .where(
            and(
              eq(organizationMemberships.organizationId, organization.id),
              eq(organizationMemberships.personId, person.id),
              eq(organizationMemberships.active, true),
            ),
          )
      : Promise.resolve([]),
    database
      .select()
      .from(adminRoles)
      .where(eq(adminRoles.personId, person.id)),
  ]);
  const roles = new Set<PersonRole>(["player"]);
  for (const membership of membershipRows) roles.add(membership.role);
  for (const platformRole of platformRoleRows) {
    if (platformRole.role === "admin" || platformRole.role === "super-admin") {
      roles.add(platformRole.role);
    }
  }
  const customScopes = [
    ...membershipRows.flatMap((membership) => membership.scopes),
    ...platformRoleRows.flatMap((platformRole) => platformRole.scopes),
  ];
  return {
    personId: person.id,
    displayName: person.displayName,
    roles: [...roles],
    organizationId: organization?.id,
    scopes: [...new Set([...scopesForRoles([...roles]), ...customScopes])],
    ageBand: person.ageBand as ApiAgeBand,
    isDemo: false,
  };
}

export async function createApiContextFromRequest(
  request: Request,
  input?: ApiContextInput,
): Promise<ApiContext> {
  const base = {
    requestId: input?.requestId,
    ipAddress: input?.ipAddress,
    userAgent: input?.userAgent,
    now: input?.now,
  };
  if (!isClerkConfigured()) return createApiContext(base);

  try {
    const client = getClerkClient();
    const state = await client.authenticateRequest(request, {
      acceptsToken: "session_token",
      authorizedParties: authorizedParties(),
    });
    if (!state.isAuthenticated) {
      return createApiContext({ ...base, useDemoActor: false });
    }
    const auth = state.toAuth({ treatPendingAsSignedOut: true });
    if (!auth.userId) {
      return createApiContext({ ...base, useDemoActor: false });
    }
    const actor = await resolveClerkActor({
      client,
      clerkUserId: auth.userId,
      clerkOrganizationId: auth.orgId,
      clerkOrganizationRole: auth.orgRole,
    });
    return createApiContext({ ...base, actor, useDemoActor: false });
  } catch {
    return createApiContext({ ...base, useDemoActor: false });
  }
}

export async function createApiContextFromClerkSession(
  session: {
    readonly userId?: string | null;
    readonly organizationId?: string | null;
    readonly organizationRole?: string | null;
  },
  input?: ApiContextInput,
): Promise<ApiContext> {
  const base = {
    requestId: input?.requestId,
    ipAddress: input?.ipAddress,
    userAgent: input?.userAgent,
    now: input?.now,
  };
  if (!session.userId || !isClerkConfigured()) {
    return createApiContext({ ...base, useDemoActor: false });
  }
  const actor = await resolveClerkActor({
    client: getClerkClient(),
    clerkUserId: session.userId,
    clerkOrganizationId: session.organizationId,
    clerkOrganizationRole: session.organizationRole,
  });
  return createApiContext({ ...base, actor, useDemoActor: false });
}
