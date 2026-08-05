import type { PersonRole } from "@duna/core";
import { demoOrganization, demoPlayer } from "@duna/core/demo";
import {
  adminRoles,
  getDatabase,
  guardianships,
  isDatabaseConfigured,
  organizationMemberships,
  organizations,
  people,
} from "@duna/db";
import { WorkOS, type User } from "@workos-inc/node";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  type JWTPayload,
} from "jose";
import {
  isWorkOSConfigured,
  resolveWorkOSCredentials,
} from "./workos-environment";

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

let workosClient: WorkOS | undefined;
let workosJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let workosJwksClientId: string | undefined;

export interface WorkOSAccessTokenClaims extends JWTPayload {
  readonly client_id?: string;
  readonly org_id?: string;
  readonly role?: string;
  readonly roles?: string[];
}

export function isWorkOSAccessTokenForClient(
  claims: WorkOSAccessTokenClaims,
  clientId: string,
): claims is WorkOSAccessTokenClaims & { readonly sub: string } {
  return Boolean(claims.sub && claims.client_id === clientId);
}

function getWorkOSClient(): WorkOS {
  const credentials = resolveWorkOSCredentials();
  if (!credentials) {
    throw new Error("WorkOS credentials are not configured");
  }
  workosClient ??= new WorkOS(credentials.apiKey, {
    appInfo: { name: "duna", version: "0.1.0" },
  });
  return workosClient;
}

function getWorkOSJwks(client: WorkOS, clientId: string) {
  if (!workosJwks || workosJwksClientId !== clientId) {
    workosJwks = createRemoteJWKSet(
      new URL(client.userManagement.getJwksUrl(clientId)),
    );
    workosJwksClientId = clientId;
  }
  return workosJwks;
}

export async function verifyWorkOSAccessToken(
  token: string,
): Promise<WorkOSAccessTokenClaims & { readonly sub: string }> {
  const credentials = resolveWorkOSCredentials();
  if (!credentials) throw new Error("WorkOS credentials are not configured");
  const client = getWorkOSClient();
  const { payload } = await jwtVerify(
    token,
    getWorkOSJwks(client, credentials.clientId),
  );
  const claims = payload as WorkOSAccessTokenClaims;
  if (!isWorkOSAccessTokenForClient(claims, credentials.clientId)) {
    throw new Error("WorkOS access token is invalid");
  }
  return claims;
}

export function workOSAccessTokenExpiresAt(token: string): number {
  try {
    const expiration = decodeJwt(token).exp;
    return typeof expiration === "number" ? expiration * 1_000 : Date.now();
  } catch {
    return Date.now();
  }
}

function safeHandle(input: {
  readonly email?: string | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly userId: string;
}): string {
  const base = (
    [input.firstName, input.lastName].filter(Boolean).join("-") ||
    input.email?.split("@")[0] ||
    "player"
  )
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "")
    .slice(0, 36);
  const suffix = input.userId.replaceAll(/[^a-zA-Z0-9]/g, "").slice(-8);
  return `${base || "player"}-${suffix}`.slice(0, 48);
}

export async function resolveWorkOSPerson(user: User) {
  const database = getDatabase();
  let person = await database.query.people.findFirst({
    where: eq(people.workosUserId, user.id),
  });
  if (person) return person;

  if (user.externalId) {
    person = await database.query.people.findFirst({
      where: eq(people.id, user.externalId),
    });
  }
  if (!person) {
    [person] = await database
      .select()
      .from(people)
      .where(sql`lower(${people.email}) = ${user.email.toLowerCase()}`)
      .limit(1);
  }
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.name ||
    "Duna player";
  if (person) {
    await database
      .update(people)
      .set({
        workosUserId: user.id,
        email: user.email,
        givenName: user.firstName,
        familyName: user.lastName,
        displayName,
        avatarUrl: user.profilePictureUrl,
      })
      .where(eq(people.id, person.id));
  } else {
    await database
      .insert(people)
      .values({
        workosUserId: user.id,
        email: user.email,
        givenName: user.firstName,
        familyName: user.lastName,
        displayName,
        avatarUrl: user.profilePictureUrl,
        handle: safeHandle({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userId: user.id,
        }),
        ageBand: "unknown",
        profileVisibility: "private",
      })
      .onConflictDoNothing();
  }
  person = await database.query.people.findFirst({
    where: eq(people.workosUserId, user.id),
  });
  if (!person) throw new Error("WorkOS identity could not be synchronized");
  return person;
}

export function organizationSlug(name: string, organizationId: string): string {
  const base = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "")
    .slice(0, 48);
  const suffix = organizationId.replaceAll(/[^a-zA-Z0-9]/g, "").slice(-8);
  return `${base || "club"}-${suffix}`.slice(0, 64);
}

async function resolveWorkOSOrganization(
  client: WorkOS,
  workosOrganizationId: string,
) {
  const database = getDatabase();
  let organization = await database.query.organizations.findFirst({
    where: eq(organizations.workosOrganizationId, workosOrganizationId),
  });
  if (organization) return organization;

  const workosOrganization =
    await client.organizations.getOrganization(workosOrganizationId);
  if (workosOrganization.externalId) {
    organization = await database.query.organizations.findFirst({
      where: eq(organizations.id, workosOrganization.externalId),
    });
  }
  if (organization) {
    await database
      .update(organizations)
      .set({
        workosOrganizationId,
        name: workosOrganization.name,
      })
      .where(eq(organizations.id, organization.id));
  } else {
    await database
      .insert(organizations)
      .values({
        workosOrganizationId,
        slug: organizationSlug(workosOrganization.name, workosOrganizationId),
        name: workosOrganization.name,
        plan: "coach",
        marketLaunchEnabled: false,
      })
      .onConflictDoNothing();
  }
  organization = await database.query.organizations.findFirst({
    where: eq(organizations.workosOrganizationId, workosOrganizationId),
  });
  if (!organization) {
    throw new Error("WorkOS organization could not be synchronized");
  }
  return organization;
}

async function resolveWorkOSActor(input: {
  readonly client: WorkOS;
  readonly user: User;
  readonly workosOrganizationId?: string | null;
  readonly workosOrganizationRole?: string | null;
  readonly workosOrganizationRoles?: readonly string[] | null;
}): Promise<ApiActor> {
  if (!isDatabaseConfigured()) {
    throw new Error("WorkOS authentication requires DATABASE_URL");
  }
  const database = getDatabase();
  const person = await resolveWorkOSPerson(input.user);
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
  const email = input.user.email.toLowerCase();
  const metadataRole = input.user.metadata.dunaRole;
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
  const organization = input.workosOrganizationId
    ? await resolveWorkOSOrganization(input.client, input.workosOrganizationId)
    : undefined;

  const workosRoleCandidates = [
    input.workosOrganizationRole,
    ...(input.workosOrganizationRoles ?? []),
  ]
    .filter((role): role is string => Boolean(role))
    .map((role) => role.replace(/^org:/, ""));
  const organizationRoleByWorkOSRole: Readonly<
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
  const organizationRole = workosRoleCandidates
    .map((role) => organizationRoleByWorkOSRole[role])
    .find(Boolean);
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

  const [membershipRows, platformRoleRows, guardianshipRows] =
    await Promise.all([
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
      database
        .select({ minorId: guardianships.minorId })
        .from(guardianships)
        .where(
          and(
            eq(guardianships.guardianId, person.id),
            inArray(guardianships.reviewStatus, ["pending", "verified"]),
          ),
        ),
    ]);
  const roles = new Set<PersonRole>(["player"]);
  if (guardianshipRows.length > 0) roles.add("guardian");
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
  const credentials = resolveWorkOSCredentials();
  if (!credentials) return createApiContext(base);

  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return createApiContext({ ...base, useDemoActor: false });
    }
    const client = getWorkOSClient();
    const claims = await verifyWorkOSAccessToken(
      authorization.slice("Bearer ".length),
    );
    const user = await client.userManagement.getUser(claims.sub);
    const actor = await resolveWorkOSActor({
      client,
      user,
      workosOrganizationId: claims.org_id,
      workosOrganizationRole: claims.role,
      workosOrganizationRoles: claims.roles,
    });
    return createApiContext({ ...base, actor, useDemoActor: false });
  } catch (error) {
    console.warn("WorkOS request authentication failed", {
      requestId: base.requestId,
      reason: error instanceof Error ? error.message : "Unknown error",
    });
    return createApiContext({ ...base, useDemoActor: false });
  }
}

export async function createApiContextFromWorkOSSession(
  session: {
    readonly user?: User | null;
    readonly organizationId?: string | null;
    readonly role?: string | null;
    readonly roles?: readonly string[] | null;
  },
  input?: ApiContextInput,
): Promise<ApiContext> {
  const base = {
    requestId: input?.requestId,
    ipAddress: input?.ipAddress,
    userAgent: input?.userAgent,
    now: input?.now,
  };
  if (!session.user || !isWorkOSConfigured()) {
    return createApiContext({ ...base, useDemoActor: false });
  }
  const actor = await resolveWorkOSActor({
    client: getWorkOSClient(),
    user: session.user,
    workosOrganizationId: session.organizationId,
    workosOrganizationRole: session.role,
    workosOrganizationRoles: session.roles,
  });
  return createApiContext({ ...base, actor, useDemoActor: false });
}
