/**
 * The Club setup readiness list (CS-Home), computed from the club's real
 * records on every read, never stored. Bookings open once places, hours, one
 * offering and Duna Pay are ready.
 */
import {
  catalogItems,
  courts,
  organizationProfiles,
  organizationRefundPolicies,
  organizationStaffProfiles,
  organizationThemes,
  organizations,
  setupProposals,
  setupRuns,
  venues,
  websiteSites,
} from "@duna/db";
import { log } from "@duna/observability";
import { and, desc, eq, sql } from "drizzle-orm";
import type { SetupReadiness } from "../../contracts/setup";
import { loadPayAccount, payPublishGate } from "../pay/account";
import { setupDatabase } from "./records";

type Section = SetupReadiness["sections"][number];
type SectionKey = Section["key"];
type State = Section["state"];

interface Pending {
  readonly total: number;
  readonly needsCheck: number;
}

function withPending(
  base: State,
  baseNote: string | undefined,
  pending: Pending | undefined,
) {
  if (base === "complete") return { state: base, note: baseNote };
  if (pending?.needsCheck) {
    return {
      state: "needs-attention" as const,
      note: `${pending.total} to review, ${pending.needsCheck} to check`,
    };
  }
  if (pending?.total) {
    const review = `${pending.total} to review`;
    return {
      state: "in-progress" as const,
      note: baseNote ? `${baseNote}, ${review}` : review,
    };
  }
  return { state: base, note: baseNote };
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export async function computeSetupReadiness(
  organizationId: string,
): Promise<SetupReadiness> {
  const database = setupDatabase();
  const count = sql<number>`count(*)::int`;
  const [
    [organization],
    [profile],
    [theme],
    venueRows,
    offeringRows,
    staffRows,
    policyRows,
    [website],
    [latestRun],
  ] = await Promise.all([
    database
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1),
    database
      .select()
      .from(organizationProfiles)
      .where(eq(organizationProfiles.organizationId, organizationId))
      .limit(1),
    database
      .select({
        logoUrl: organizationThemes.logoUrl,
        tagline: organizationThemes.tagline,
      })
      .from(organizationThemes)
      .where(eq(organizationThemes.organizationId, organizationId))
      .limit(1),
    database
      .select({
        status: venues.status,
        courts: sql<number>`count(${courts.id})::int`,
      })
      .from(venues)
      .leftJoin(courts, eq(courts.venueId, venues.id))
      .where(eq(venues.organizationId, organizationId))
      .groupBy(venues.id, venues.status),
    database
      .select({ status: catalogItems.status, count })
      .from(catalogItems)
      .where(eq(catalogItems.organizationId, organizationId))
      .groupBy(catalogItems.status),
    database
      .select({ active: organizationStaffProfiles.active, count })
      .from(organizationStaffProfiles)
      .where(eq(organizationStaffProfiles.organizationId, organizationId))
      .groupBy(organizationStaffProfiles.active),
    database
      .select({ active: organizationRefundPolicies.active, count })
      .from(organizationRefundPolicies)
      .where(eq(organizationRefundPolicies.organizationId, organizationId))
      .groupBy(organizationRefundPolicies.active),
    database
      .select({ published: websiteSites.publishedRevisionId })
      .from(websiteSites)
      .where(eq(websiteSites.organizationId, organizationId))
      .orderBy(desc(websiteSites.updatedAt))
      .limit(1),
    database
      .select({ id: setupRuns.id, status: setupRuns.status })
      .from(setupRuns)
      .where(eq(setupRuns.organizationId, organizationId))
      .orderBy(desc(setupRuns.createdAt))
      .limit(1),
  ]);

  const pending = new Map<SectionKey, Pending>();
  if (latestRun?.status === "review") {
    const rows = await database
      .select({
        category: setupProposals.category,
        fieldKey: setupProposals.fieldKey,
        needsCheck: setupProposals.needsCheck,
      })
      .from(setupProposals)
      .where(
        and(
          eq(setupProposals.runId, latestRun.id),
          eq(setupProposals.decision, "pending"),
        ),
      );
    for (const row of rows) {
      const key = (
        row.fieldKey === "places.hours" ? "hours" : row.category
      ) as SectionKey;
      const current = pending.get(key) ?? { total: 0, needsCheck: 0 };
      pending.set(key, {
        total: current.total + 1,
        needsCheck: current.needsCheck + (row.needsCheck ? 1 : 0),
      });
    }
  }

  let payState: State = "not-started";
  try {
    const gate = await payPublishGate(organizationId, {});
    if (gate.ready) payState = "complete";
    else if ((await loadPayAccount(organizationId)).status !== "not-started")
      payState = "in-progress";
  } catch (error) {
    log.warn("setup.readiness.pay-unavailable", {
      organizationId,
      error: error instanceof Error ? error.name : "unknown",
    });
  }

  const tally = <T extends { count: number }>(
    rows: readonly T[],
    match: (row: T) => boolean,
  ) => rows.filter(match).reduce((sum, row) => sum + Number(row.count), 0);
  const activeOfferings = tally(offeringRows, (row) => row.status === "active");
  const draftOfferings = tally(offeringRows, (row) => row.status === "draft");
  const activeStaff = tally(staffRows, (row) => row.active);
  const draftStaff = tally(staffRows, (row) => !row.active);
  const activePolicies = tally(policyRows, (row) => row.active);
  const draftPolicies = tally(policyRows, (row) => !row.active);
  const liveVenue = venueRows.some(
    (row) => row.status === "active" && Number(row.courts) > 0,
  );
  const draftVenues = venueRows.filter((row) => row.status === "draft").length;

  const identityDone = Boolean(
    organization?.name &&
    (profile?.tagline || profile?.about || theme?.tagline || theme?.logoUrl),
  );
  const contactDone = Boolean(profile?.phoneE164 || profile?.email);
  const hoursDone = (profile?.hours.weekly.length ?? 0) > 0;

  const base: Record<
    SectionKey,
    { state: State; note?: string; label: string; href: string }
  > = {
    identity: {
      label: "Identity",
      href: "/setup/identity",
      state: identityDone
        ? "complete"
        : organization?.name
          ? "in-progress"
          : "not-started",
    },
    contact: {
      label: "Contact",
      href: "/setup/contact",
      state: contactDone ? "complete" : "not-started",
    },
    places: {
      label: "Places and courts",
      href: "/setup/places",
      state: liveVenue
        ? "complete"
        : draftVenues
          ? "in-progress"
          : "not-started",
      note: liveVenue
        ? undefined
        : draftVenues
          ? plural(draftVenues, "draft place", "draft places")
          : undefined,
    },
    hours: {
      label: "Hours",
      href: "/setup/hours",
      state: hoursDone ? "complete" : "not-started",
    },
    offerings: {
      label: "Offerings",
      href: "/offerings",
      state: activeOfferings
        ? "complete"
        : draftOfferings
          ? "in-progress"
          : "not-started",
      note: activeOfferings
        ? undefined
        : draftOfferings
          ? plural(draftOfferings, "draft", "drafts")
          : undefined,
    },
    team: {
      label: "Team",
      href: "/team",
      state: activeStaff
        ? "complete"
        : draftStaff
          ? "in-progress"
          : "not-started",
      note: activeStaff
        ? undefined
        : draftStaff
          ? `${draftStaff} not invited`
          : undefined,
    },
    policies: {
      label: "Policies",
      href: "/setup/policies",
      state: activePolicies
        ? "complete"
        : draftPolicies
          ? "in-progress"
          : "not-started",
      note: activePolicies
        ? undefined
        : draftPolicies
          ? plural(draftPolicies, "draft", "drafts")
          : undefined,
    },
    "duna-pay": { label: "Duna Pay", href: "/money/duna-pay", state: payState },
    website: {
      label: "Website",
      href: "/website",
      state: website?.published
        ? "complete"
        : website
          ? "in-progress"
          : profile?.websiteUrl
            ? "complete"
            : "not-started",
      note: !website && profile?.websiteUrl ? "Your own website" : undefined,
    },
  };

  const sections = (Object.keys(base) as SectionKey[]).map((key) => {
    const entry = base[key];
    const resolved = withPending(entry.state, entry.note, pending.get(key));
    return {
      key,
      label: entry.label,
      state: resolved.state,
      ...(resolved.note ? { note: resolved.note } : {}),
      href: entry.href,
    };
  });
  const complete = (key: SectionKey) =>
    sections.find((s) => s.key === key)?.state === "complete";
  return {
    done: sections.filter((section) => section.state === "complete").length,
    total: sections.length,
    bookingsOpen:
      complete("places") &&
      complete("hours") &&
      complete("offerings") &&
      complete("duna-pay"),
    sections,
  };
}
