/**
 * Central map of every Duna HQ path, in the information architecture of
 * docs/design/tideline-4.1.1/ia-hq.md (work package S2; the old-to-new table
 * is docs/plan/s2-route-map.md).
 *
 * Each template mirrors a `page.tsx` under apps/hq/app exactly: `[param]` is a
 * dynamic segment and `[[...param]]` an optional catch-all. `hq-routes.test.ts`
 * fails if a template stops matching a real page, if a page is missing from the
 * map, or if a module slug is no longer served, so the map cannot rot.
 *
 * New code builds HQ addresses with `hqHref(...)` instead of string literals.
 */
export const hqRoutes = {
  // Run the day.
  home: "/",
  inbox: "/inbox",
  inboxCreate: "/inbox/create",
  ask: "/ask/[[...conversation]]",
  /** Retired by the IA (its cards have homes); package B4 removes it. */
  activities: "/activities",

  // People and play. People, Events, Offerings, Schedule, Marketing and
  // Reports lists are served by the generic module page; see hqModuleHref.
  memberInvite: "/people/invite",
  member: "/people/[personId]",
  memberHealth: "/people/[personId]/health",
  /** Team (H-TEAM): the roster, coverage, pay, and each member as an object. */
  team: "/team",
  teamInvite: "/team/invite",
  teamCoverage: "/team/coverage",
  teamPay: "/team/pay",
  teamPayRun: "/team/pay/[payRunId]",
  teamMember: "/team/[personId]",
  teamMemberAvailability: "/team/[personId]/availability",
  teamMemberSessions: "/team/[personId]/sessions",
  teamMemberPay: "/team/[personId]/pay",
  teamMemberAccess: "/team/[personId]/access",
  training: "/training",
  trainingDrillCreate: "/training/drills/create",
  trainingDrillCreateAdvanced: "/training/drills/create/advanced",
  trainingPracticePlanCreate: "/training/practice-plans/create",
  trainingPracticePlan: "/training/practice-plans/[planId]",
  trainingPracticePlanPrint: "/training/practice-plans/[planId]/print",
  trainingPractice: "/training/practices/[eventId]",
  trainingProgramCreate: "/training/programs/create",
  trainingProgram: "/training/programs/[programId]",
  /** Dropped by the IA in favour of Training › Programs; package B4 removes it. */
  programs: "/programs",
  eventCreate: "/events/create",
  event: "/events/[sessionId]",
  eventDivision: "/events/[sessionId]/divisions/[divisionId]",
  eventCourtBooking: "/events/court-bookings/[activityId]",
  eventMatch: "/events/matches/[activityId]",
  /** Becomes an in-page filter of Events in package H9. */
  eventType: "/events/types/[eventType]",
  offeringCreate: "/offerings/create",
  offering: "/offerings/[itemId]",
  offeringBuilder: "/offerings/[itemId]/builder",
  offeringDraftReady: "/offerings/[itemId]/draft-ready",
  /** Becomes an in-page filter of Offerings in package H9. */
  offeringType: "/offerings/types/[productType]",

  // Money and setup.
  money: "/money",
  moneyTransactions: "/money/transactions",
  moneyTransaction: "/money/transactions/[transactionId]",
  moneyPayouts: "/money/payouts",
  moneyPayout: "/money/payouts/[payoutId]",
  /** The old "Configure money" address; it opens Duna Pay setup. */
  moneySetup: "/money/setup",
  moneyRefundPolicies: "/money/refund-policies",
  moneyDisputes: "/money/disputes",
  moneyDispute: "/money/disputes/[disputeId]",
  moneyHolds: "/money/holds",
  moneyTax: "/money/tax",
  /** Duna Pay setup (H10); the backend's publish gate links to these. */
  moneyDunaPay: "/money/duna-pay",
  moneyDunaPayBusiness: "/money/duna-pay/business",
  moneyDunaPayVerify: "/money/duna-pay/verify",
  moneyDunaPayPayouts: "/money/duna-pay/payouts",
  setup: "/setup",
  setupStart: "/setup/start",
  setupStartComplete: "/setup/start/complete",
  setupIdentity: "/setup/identity",
  setupReview: "/setup/review",
  places: "/setup/places",
  placeCreate: "/setup/places/create",
  place: "/setup/places/[venueId]",
  placeLayout: "/setup/places/[venueId]/layout",
  placeDetails: "/setup/places/[venueId]/details",
  placeCourtCreate: "/setup/places/[venueId]/courts/create",
  placeCourt: "/setup/places/[venueId]/courts/[courtId]",
  /** Duna Pay (Stripe Connect) return and refresh address; never rename. */
  stripeReturn: "/stripe/return",

  // Grow.
  website: "/website",
  marketingCreate: "/marketing/create",
  marketingAudiences: "/marketing/audiences",
  marketingAudienceCreate: "/marketing/audiences/create",
  marketingAudience: "/marketing/audiences/[audienceId]",
  marketingPromoCodes: "/marketing/promo-codes",

  // Account menu.
  settings: "/settings",
  account: "/account",

  /** Generic operator module page; prefer hqModuleHref(slug). */
  module: "/[module]",

  // Super Admin (7 pages).
  admin: "/admin",
  adminAskDuna: "/admin/ask-duna",
  adminMessagingSafety: "/admin/messaging-safety",
  adminOrganization: "/admin/organizations/[organizationId]",
  adminSupport: "/admin/support",
  adminVideo: "/admin/video",
  /** Generic admin module page; prefer hqAdminModuleHref(slug). */
  adminModule: "/admin/[module]",
} as const;

/** Leagues are an event type: the Events list filtered to leagues. */
export const hqLeaguesPath = "/events?type=league";

export type HqRouteName = keyof typeof hqRoutes;
export type HqRouteTemplate = (typeof hqRoutes)[HqRouteName];

/**
 * Development-only HQ surfaces, deliberately absent from the product map above.
 * `/tideline` is the Tideline component gallery: it exists only when HQ runs
 * with TIDELINE_GALLERY=1, and apps/hq/proxy.ts answers it with a 404 otherwise.
 */
export const hqDevOnlyRoutePrefixes = ["/tideline"] as const;
export type HqDevOnlyRoutePrefix = (typeof hqDevOnlyRoutePrefixes)[number];

/** True for a path or page template inside a development-only surface. */
export function isHqDevOnlyRoute(path: string): boolean {
  return hqDevOnlyRoutePrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Operator module slugs that have no page of their own and are served by
 * apps/hq/app/[module]/page.tsx (slugs from apps/hq/components/navigation.ts).
 */
export const hqOperatorModuleSlugs = [
  "events",
  "marketing",
  "offerings",
  "people",
  "reports",
  "schedule",
] as const;

/** Admin module slugs served by apps/hq/app/admin/[module]/page.tsx. */
export const hqAdminModuleSlugs = [
  "audit",
  "flags",
  "health",
  "organizations",
  "payments",
  "people",
  "player-intelligence",
  "player-mapping",
  "predictions",
  "pro-tour",
  "profile-merge",
  "ratings",
  "ratings-lab",
  "sand-data",
  "trust",
  "vision",
] as const;

export type HqOperatorModuleSlug = (typeof hqOperatorModuleSlugs)[number];
export type HqAdminModuleSlug = (typeof hqAdminModuleSlugs)[number];

type PathSegments<T extends string> = T extends `/${infer Head}/${infer Rest}`
  ? Head | PathSegments<`/${Rest}`>
  : T extends `/${infer Last}`
    ? Last
    : never;

type RequiredParam<S> = S extends `[[...${string}]]`
  ? never
  : S extends `[${infer Name}]`
    ? Name
    : never;

type OptionalParam<S> = S extends `[[...${infer Name}]]` ? Name : never;

export type HqRouteParams<T extends string> = {
  readonly [K in RequiredParam<PathSegments<T>>]: string;
} & {
  readonly [K in OptionalParam<PathSegments<T>>]?: string | readonly string[];
};

type HqHrefArgs<T extends string> = [RequiredParam<PathSegments<T>>] extends [
  never,
]
  ? [params?: HqRouteParams<T>]
  : [params: HqRouteParams<T>];

/** Build a concrete HQ path from a named template, encoding every segment. */
export function hqHref<N extends HqRouteName>(
  name: N,
  ...[params]: HqHrefArgs<(typeof hqRoutes)[N]>
): string {
  return fillHqTemplate(
    hqRoutes[name],
    (params ?? {}) as Readonly<
      Record<string, string | readonly string[] | undefined>
    >,
  );
}

export function hqModuleHref(slug: HqOperatorModuleSlug): string {
  return hqHref("module", { module: slug });
}

export function hqAdminModuleHref(slug: HqAdminModuleSlug): string {
  return hqHref("adminModule", { module: slug });
}

export function fillHqTemplate(
  template: string,
  params: Readonly<Record<string, string | readonly string[] | undefined>>,
): string {
  const segments = template
    .split("/")
    .filter(Boolean)
    .flatMap((segment) => {
      const catchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/);
      if (catchAll) {
        const value = params[catchAll[1]!];
        const parts = value === undefined ? [] : [value].flat();
        return parts.map((part) => encodeURIComponent(part));
      }
      const dynamic = segment.match(/^\[(.+)\]$/);
      if (dynamic) {
        const value = params[dynamic[1]!];
        if (typeof value !== "string" || value.length === 0) {
          throw new TypeError(
            `HQ route ${template} needs a "${dynamic[1]}" parameter.`,
          );
        }
        return [encodeURIComponent(value)];
      }
      return [segment];
    });
  return `/${segments.join("/")}`;
}
