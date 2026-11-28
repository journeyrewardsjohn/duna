/**
 * Central map of every Duna HQ path, in TODAY's shape.
 *
 * Each template mirrors a `page.tsx` under apps/hq/app exactly: `[param]` is a
 * dynamic segment and `[[...param]]` an optional catch-all. `hq-routes.test.ts`
 * fails if a template stops matching a real page, if a page is missing from the
 * map, or if a module slug is no longer served, so the map cannot rot.
 *
 * Work package S2 (HQ information architecture) renames HQ routes HERE, in one
 * place, and then moves the directories. Until S2 lands nothing is required to
 * import this map; new code should prefer `hqHref(...)` over string literals.
 */

export const hqRoutes = {
  // Operator workspace (58 pages, including the two dynamic module pages).
  home: "/",
  account: "/account",
  activities: "/activities",
  ask: "/ask/[[...conversation]]",
  audiences: "/audiences",
  audienceCreate: "/audiences/create",
  audience: "/audiences/[audienceId]",
  eventCreate: "/events/create",
  event: "/events/[sessionId]",
  eventDivision: "/events/[sessionId]/divisions/[divisionId]",
  eventCourtBooking: "/events/court-bookings/[activityId]",
  eventMatch: "/events/matches/[activityId]",
  eventType: "/events/types/[eventType]",
  leagueCreate: "/leagues/create",
  locationCreate: "/locations/create",
  location: "/locations/[venueId]",
  locationLayout: "/locations/[venueId]/layout",
  locationCourtCreate: "/locations/[venueId]/courts/create",
  locationCourt: "/locations/[venueId]/courts/[courtId]",
  marketingCreate: "/marketing/create",
  memberInvite: "/members/invite",
  member: "/members/[personId]",
  memberHealth: "/members/[personId]/health",
  messages: "/messages",
  messageCreate: "/messages/create",
  onboarding: "/onboarding",
  onboardingComplete: "/onboarding/complete",
  payments: "/payments",
  paymentDisputes: "/payments/disputes",
  paymentPayoutSettings: "/payments/payout-settings",
  paymentRefundPolicies: "/payments/refund-policies",
  paymentSetup: "/payments/setup",
  paymentTransactions: "/payments/transactions",
  paymentTransaction: "/payments/transactions/[transactionId]",
  productCreate: "/products/create",
  product: "/products/[itemId]",
  productBuilder: "/products/[itemId]/builder",
  productDraftReady: "/products/[itemId]/draft-ready",
  productType: "/products/types/[productType]",
  programs: "/programs",
  promoCodes: "/promo-codes",
  settings: "/settings",
  settingsTheme: "/settings/theme",
  setup: "/setup",
  stripeReturn: "/stripe/return",
  teamInvite: "/team/invite",
  teamMember: "/team/[personId]",
  training: "/training",
  trainingDrillCreate: "/training/drills/create",
  trainingDrillCreateAdvanced: "/training/drills/create/advanced",
  trainingPracticePlanCreate: "/training/practice-plans/create",
  trainingPracticePlan: "/training/practice-plans/[planId]",
  trainingPracticePlanPrint: "/training/practice-plans/[planId]/print",
  trainingPractice: "/training/practices/[eventId]",
  trainingProgramCreate: "/training/programs/create",
  trainingProgram: "/training/programs/[programId]",
  website: "/website",
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
  "calendar",
  "events",
  "leagues",
  "locations",
  "marketing",
  "members",
  "products",
  "reports",
  "team",
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
