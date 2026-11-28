import {
  usesDemoData,
  type OperatorWorkspace,
  type participationAtRiskSchema,
  type participationCancelRequestSchema,
  type participationDefaultsSchema,
  type participationRuleToReviewSchema,
  type feesPlatformSummarySchema,
  type catalogItemVersionSummarySchema,
} from "@duna/api";
import { cookies } from "next/headers";
import { cache } from "react";
import type { z } from "zod";
import { getServerCaller } from "@/lib/api";
import { loadPublishGate, settle, type Loaded } from "../money/money-data";
import { getHqSession, hasScope } from "../shell/hq-session";
import type { ShellSession } from "../shell/session-types";
import { demoFirstDayRequested } from "../today/today-data";
import {
  sessionFromAtRisk,
  sessionFromOccurrence,
  type OperatorOccurrence,
  type SessionView,
} from "../participation/session-model";
import {
  DEMO_NOW,
  demoCoachNames,
  demoOccurrences,
  demoOfferings,
} from "./offerings-demo";
import {
  applyDemoStore,
  DEMO_OFFERINGS_COOKIE,
  readDemoStore,
} from "./demo-store";
import type { OfferingAccess, OfferingItem } from "./offering-model";

export { loadPublishGate, type Loaded };

/**
 * Offerings' reads (H-OFFER). Each procedure is read once per request and
 * turned into an honest result: the data, "you need access", "not
 * configured yet", not found, or a failure with its reference. In demo mode
 * (no Duna Database) the catalog and the sessions come from the demo club,
 * and the changes a person makes there stay in their browser.
 */

export interface OfferingsContext {
  readonly session: ShellSession;
  readonly organization: string;
  readonly timeZone: string;
  readonly currency: string;
  readonly access: OfferingAccess;
  /** Demo club: fixtures, and changes kept in this browser only. */
  readonly demo: boolean;
  /** The clock sessions are shown against (fixed in demo mode). */
  readonly now: string;
}

export const offeringsContext = cache(async (): Promise<OfferingsContext> => {
  const session = await getHqSession();
  const demo = usesDemoData();
  return {
    session,
    organization: session.organization?.name ?? "your club",
    timeZone: session.organization?.timezone ?? "UTC",
    currency: "USD",
    access: {
      money: hasScope(session, "payments:read"),
      write: hasScope(session, "payments:write"),
      sessions: hasScope(session, "sessions:write"),
    },
    demo,
    now: demo ? DEMO_NOW : new Date().toISOString(),
  };
});

export const loadWorkspace = cache(
  async (): Promise<Loaded<OperatorWorkspace>> => {
    const caller = await getServerCaller();
    return settle(() => caller.operator.workspace(), "offerings.workspace");
  },
);

/** The catalog without events (events have their own area). */
export const loadCatalog = cache(
  async (): Promise<Loaded<readonly OfferingItem[]>> => {
    const workspace = await loadWorkspace();
    if (workspace.state !== "ok") return workspace;
    const own = workspace.data.catalog.filter((item) => item.type !== "event");
    if (await demoFirstDayRequested()) return { state: "ok", data: [] };
    if (!usesDemoData() || own.length > 0) return { state: "ok", data: own };
    const store = await readDemoStore();
    return {
      state: "ok",
      data: applyDemoStore(demoOfferings, store, new Date(DEMO_NOW)),
    };
  },
);

export const loadOffering = cache(
  async (itemId: string): Promise<Loaded<OfferingItem>> => {
    const catalog = await loadCatalog();
    if (catalog.state !== "ok") return catalog;
    const item = catalog.data.find((candidate) => candidate.id === itemId);
    return item ? { state: "ok", data: item } : { state: "not-found" };
  },
);

export type ParticipationDefaults = z.infer<typeof participationDefaultsSchema>;

export const loadDefaults = cache(
  async (): Promise<Loaded<ParticipationDefaults>> => {
    const caller = await getServerCaller();
    const loaded = await settle(
      () => caller.operator.participation.defaults(),
      "participation.defaults",
    );
    if (loaded.state !== "ok" || !usesDemoData()) return loaded;
    // The demo club's saved rule lives in this browser.
    const store = await readDemoStore();
    if (!store.defaults) return loaded;
    return {
      state: "ok",
      data: {
        ...loaded.data,
        rules: loaded.data.rules
          ? { ...loaded.data.rules, ...(store.defaults.rules as object) }
          : loaded.data.rules,
        appliesTo: store.defaults
          .appliesTo as ParticipationDefaults["appliesTo"],
        proposed: false,
      },
    };
  },
);

/** The club's coaches (for the coach prerequisite and the People section). */
export function activeCoaches(workspace: OperatorWorkspace) {
  return workspace.staff.filter(
    (person) => person.active && person.role === "coach",
  );
}

/** An offering's sessions (or every offering's, without an id), as view models. */
export const loadSessions = cache(
  async (
    catalogItemId: string | undefined,
    rule?: unknown,
  ): Promise<Loaded<readonly SessionView[]>> => {
    const context = await offeringsContext();
    const now = new Date(context.now);
    let occurrences: readonly OperatorOccurrence[];
    if (usesDemoData() && !(await demoFirstDayRequested())) {
      const store = await readDemoStore();
      occurrences = demoOccurrences
        .filter((occurrence) =>
          catalogItemId ? occurrence.catalogItemId === catalogItemId : true,
        )
        .map((occurrence) => {
          const change = store.sessions[occurrence.id];
          if (!change) return occurrence;
          return {
            ...occurrence,
            ...(change.cancelled ? { status: "cancelled" as const } : {}),
            participation: occurrence.participation
              ? {
                  ...occurrence.participation,
                  ...(change.cancelled
                    ? { displayState: "cancelled-club" as const }
                    : {}),
                  ...(change.lockAt
                    ? {
                        lockAt: change.lockAt,
                        decisionAt: change.lockAt,
                        freeCancelUntil: change.lockAt,
                      }
                    : {}),
                }
              : undefined,
            bookings: occurrence.bookings.map((booking) => {
              const mark = change.attendance?.[booking.fulfillmentId];
              return mark
                ? {
                    ...booking,
                    attendance:
                      mark === "attended"
                        ? ("attended" as const)
                        : ("no-show" as const),
                  }
                : booking;
            }),
          };
        });
    } else {
      const caller = await getServerCaller();
      const loaded = await settle(
        () =>
          caller.operator.catalogSessionOccurrences(
            catalogItemId ? { catalogItemId } : {},
          ),
        "offerings.sessions",
      );
      if (loaded.state !== "ok") return loaded;
      occurrences = loaded.data;
    }
    const coaches = usesDemoData() ? [...demoCoachNames] : [];
    return {
      state: "ok",
      data: occurrences.map((occurrence) => {
        const view = sessionFromOccurrence(occurrence, {
          now,
          clubName: context.organization,
          coachNames: coaches,
          rule: catalogItemId ? rule : undefined,
        });
        if (context.access.money) return view;
        // Money stays with the people who may see it.
        const {
          atStakeCredits: _credits,
          atStakeMinor: _minor,
          ...rest
        } = view;
        void _credits;
        void _minor;
        return rest;
      }),
    };
  },
);

export type AtRisk = z.infer<typeof participationAtRiskSchema>;

export const loadAtRisk = cache(
  async (): Promise<
    Loaded<{
      readonly totals: AtRisk["totals"];
      readonly sessions: readonly SessionView[];
    }>
  > => {
    const context = await offeringsContext();
    const caller = await getServerCaller();
    if (await demoFirstDayRequested()) {
      return {
        state: "ok",
        data: {
          totals: { sessions: 0, booked: 0, currency: context.currency },
          sessions: [],
        },
      };
    }
    const loaded = await settle(
      () => caller.operator.participation.atRisk(),
      "participation.atRisk",
    );
    if (loaded.state !== "ok") return loaded;
    const now = new Date(context.now);
    const store = usesDemoData() ? await readDemoStore() : undefined;
    const sessions = loaded.data.sessions
      .filter((row) => !store?.sessions[row.subjectId]?.cancelled)
      .map((row) =>
        sessionFromAtRisk(
          {
            ...row,
            lockAt: store?.sessions[row.subjectId]?.lockAt ?? row.lockAt,
          },
          { now, clubName: context.organization },
        ),
      );
    return { state: "ok", data: { totals: loaded.data.totals, sessions } };
  },
);

export type CancelRequest = z.infer<typeof participationCancelRequestSchema>;

export const loadCancelRequests = cache(
  async (): Promise<Loaded<readonly CancelRequest[]>> => {
    const caller = await getServerCaller();
    if (await demoFirstDayRequested()) return { state: "ok", data: [] };
    return settle(
      () => caller.operator.participation.cancelRequests(),
      "participation.cancelRequests",
    );
  },
);

export type RuleToReview = z.infer<typeof participationRuleToReviewSchema>;

export const loadRulesToReview = cache(
  async (): Promise<Loaded<readonly RuleToReview[]>> => {
    const caller = await getServerCaller();
    if (await demoFirstDayRequested()) return { state: "ok", data: [] };
    const loaded = await settle(
      () => caller.operator.participation.rulesToReview(),
      "participation.rulesToReview",
    );
    if (loaded.state !== "ok" || !usesDemoData()) return loaded;
    const store = await readDemoStore();
    return {
      state: "ok",
      data: loaded.data.filter((rule) => !store.kept.includes(rule.subjectId)),
    };
  },
);

export type PlatformFees = z.infer<typeof feesPlatformSummarySchema>;

export const loadPlatformFees = cache(
  async (): Promise<Loaded<PlatformFees>> => {
    const caller = await getServerCaller();
    return settle(
      () => caller.operator.fees.platformSummary(),
      "fees.platformSummary",
    );
  },
);

export type CatalogVersion = z.infer<typeof catalogItemVersionSummarySchema>;

export const loadVersions = cache(
  async (catalogItemId: string): Promise<Loaded<readonly CatalogVersion[]>> => {
    if (usesDemoData()) return { state: "not-configured" };
    const caller = await getServerCaller();
    return settle(
      () => caller.operator.catalogItemVersions({ catalogItemId }),
      "offerings.versions",
    );
  },
);

export const loadWaivers = cache(async () => {
  const caller = await getServerCaller();
  return settle(() => caller.operator.waiverWorkspace(), "offerings.waivers");
});

/** Whether the demo store cookie is present (the demo note says so). */
export async function demoChangesKept(): Promise<boolean> {
  return Boolean((await cookies()).get(DEMO_OFFERINGS_COOKIE)?.value);
}

/** The public booking page of an offering, for "Message the group" (share link). */
export async function offeringShareUrls(): Promise<Record<string, string>> {
  const [workspace, catalog] = await Promise.all([
    loadWorkspace(),
    loadCatalog(),
  ]);
  if (workspace.state !== "ok" || catalog.state !== "ok") return {};
  const web = (
    process.env.NEXT_PUBLIC_DUNA_WEB_URL ??
    process.env.NEXT_PUBLIC_WEB_URL ??
    "https://duna.coach"
  ).replace(/\/$/, "");
  const club = workspace.data.organization.slug;
  return Object.fromEntries(
    catalog.data
      .filter((item) => item.status === "active")
      .map((item) => [item.id, `${web}/clubs/${club}/products/${item.slug}`]),
  );
}
