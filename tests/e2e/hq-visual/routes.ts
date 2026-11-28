/**
 * The HQ route matrix shared by the visual baselines and the runtime CSS
 * coverage run. Every `apps/hq/app/**\/page.tsx` must appear either in
 * `visualRoutes` (through its `page` pattern) or in `skippedPages` with the
 * reason it cannot render in demo mode; `route-manifest.spec.ts` enforces it.
 *
 * Record IDs are the fixed demo-adapter identifiers. They are not secrets and
 * do not exist in any connected environment.
 */
export interface VisualRoute {
  /** Stable screenshot name. Changing it orphans the committed baseline. */
  readonly name: string;
  /** Path requested from the HQ server. */
  readonly path: string;
  /** The `page.tsx` route pattern this entry exercises. */
  readonly page: string;
  /** Extra selectors to mask on this route only. */
  readonly mask?: readonly string[];
  /** Path the browser must end on when the page redirects. */
  readonly landsOn?: string;
}

const venue = "10000000-0000-4000-8000-000000000101";
const court = "10000000-0000-4000-8000-000000000103";
const clinic = "10000000-0000-4000-8000-000000000301";
const tournament = "10000000-0000-4000-8000-000000000303";
const member = "10000000-0000-4000-8000-000000000201";
const audience = "00000000-0000-4000-8000-000000000091";
const transaction = "00000000-0000-4000-8000-000000000093";
const practicePlan = "33000000-0000-4000-8000-000000000300";
const practice = "33000000-0000-4000-8000-000000000600";
const program = "33000000-0000-4000-8000-000000000400";

export const visualRoutes: readonly VisualRoute[] = [
  // Today
  { name: "home", path: "/", page: "/" },
  { name: "setup", path: "/setup", page: "/setup" },
  { name: "calendar", path: "/schedule", page: "/[module]" },
  { name: "activities", path: "/activities", page: "/activities" },
  { name: "ask", path: "/ask", page: "/ask/[[...conversation]]" },
  {
    name: "ask-history",
    path: "/ask/history",
    page: "/ask/[[...conversation]]",
  },

  // Run: venues
  { name: "locations", path: "/setup/places", page: "/setup/places" },
  {
    name: "locations-create",
    path: "/setup/places/create",
    page: "/setup/places/create",
  },
  {
    name: "location-detail",
    path: `/setup/places/${venue}`,
    page: "/setup/places/[venueId]",
  },
  {
    name: "location-layout",
    path: `/setup/places/${venue}/layout`,
    page: "/setup/places/[venueId]/layout",
  },
  {
    name: "court-create",
    path: `/setup/places/${venue}/courts/create`,
    page: "/setup/places/[venueId]/courts/create",
  },
  {
    name: "court-detail",
    path: `/setup/places/${venue}/courts/${court}`,
    page: "/setup/places/[venueId]/courts/[courtId]",
  },

  // Run: people and staff
  { name: "members", path: "/people", page: "/[module]" },
  {
    name: "member-detail",
    path: `/people/${member}`,
    page: "/people/[personId]",
  },
  { name: "members-invite", path: "/people/invite", page: "/people/invite" },
  { name: "team", path: "/team", page: "/[module]" },
  { name: "team-invite", path: "/team/invite", page: "/team/invite" },

  // Run: training
  { name: "training", path: "/training", page: "/training" },
  {
    name: "drill-create",
    path: "/training/drills/create",
    page: "/training/drills/create",
  },
  {
    name: "drill-create-advanced",
    path: "/training/drills/create/advanced",
    page: "/training/drills/create/advanced",
  },
  {
    name: "practice-plan-create",
    path: "/training/practice-plans/create",
    page: "/training/practice-plans/create",
  },
  {
    name: "practice-plan-detail",
    path: `/training/practice-plans/${practicePlan}`,
    page: "/training/practice-plans/[planId]",
  },
  {
    name: "practice-plan-print",
    path: `/training/practice-plans/${practicePlan}/print`,
    page: "/training/practice-plans/[planId]/print",
  },
  {
    name: "practice-detail",
    path: `/training/practices/${practice}`,
    page: "/training/practices/[eventId]",
  },
  {
    name: "program-create",
    path: "/training/programs/create",
    page: "/training/programs/create",
  },
  {
    name: "program-detail",
    path: `/training/programs/${program}`,
    page: "/training/programs/[programId]",
  },
  { name: "programs", path: "/programs", page: "/programs" },

  // Run: products
  { name: "products", path: "/offerings", page: "/[module]" },
  {
    name: "products-create",
    path: "/offerings/create",
    page: "/offerings/create",
  },
  {
    name: "products-services",
    path: "/offerings/types/services",
    page: "/offerings/types/[productType]",
  },
  {
    name: "products-plans",
    path: "/offerings/types/plans",
    page: "/offerings/types/[productType]",
  },
  {
    name: "products-goods",
    path: "/offerings/types/goods",
    page: "/offerings/types/[productType]",
  },

  // Run: events and leagues
  { name: "events", path: "/events", page: "/[module]" },
  { name: "events-create", path: "/events/create", page: "/events/create" },
  {
    name: "events-tournaments",
    path: "/events/types/tournaments",
    page: "/events/types/[eventType]",
  },
  {
    name: "events-clinics",
    path: "/events/types/clinics",
    page: "/events/types/[eventType]",
  },
  {
    name: "events-open-play",
    path: "/events/types/open-play",
    page: "/events/types/[eventType]",
  },
  {
    name: "events-pickup",
    path: "/events/types/pickup",
    page: "/events/types/[eventType]",
  },
  {
    name: "event-clinic-detail",
    path: `/events/${clinic}`,
    page: "/events/[sessionId]",
  },
  {
    name: "event-tournament-detail",
    path: `/events/${tournament}`,
    page: "/events/[sessionId]",
  },
  { name: "leagues", path: "/events?type=league", page: "/[module]" },

  // Run: inbox and audiences
  { name: "messages", path: "/inbox", page: "/inbox" },
  {
    name: "messages-create",
    path: "/inbox/create",
    page: "/inbox/create",
    landsOn: "/inbox?compose=new",
  },
  {
    name: "audiences",
    path: "/marketing/audiences",
    page: "/marketing/audiences",
  },
  {
    name: "audiences-create",
    path: "/marketing/audiences/create",
    page: "/marketing/audiences/create",
  },
  {
    name: "audience-detail",
    path: `/marketing/audiences/${audience}`,
    page: "/marketing/audiences/[audienceId]",
  },

  // Grow
  { name: "website", path: "/website", page: "/website" },
  { name: "payments", path: "/money", page: "/money" },
  {
    name: "payments-setup",
    path: "/money/setup",
    page: "/money/setup",
  },
  {
    name: "payments-transactions",
    path: "/money/transactions",
    page: "/money/transactions",
  },
  {
    name: "payments-transaction-detail",
    path: `/money/transactions/${transaction}`,
    page: "/money/transactions/[transactionId]",
  },
  {
    name: "payments-disputes",
    path: "/money/disputes",
    page: "/money/disputes",
  },
  {
    name: "payments-payout-settings",
    path: "/money/payouts",
    page: "/money/payouts",
  },
  {
    name: "payments-refund-policies",
    path: "/money/refund-policies",
    page: "/money/refund-policies",
  },
  { name: "marketing", path: "/marketing", page: "/[module]" },
  {
    name: "marketing-create",
    path: "/marketing/create",
    page: "/marketing/create",
  },
  { name: "reports", path: "/reports", page: "/[module]" },

  // Configure and account
  { name: "settings", path: "/settings", page: "/settings" },
  { name: "settings-theme", path: "/setup/identity", page: "/setup/identity" },
  { name: "account", path: "/account", page: "/account" },
  { name: "onboarding", path: "/setup/start", page: "/setup/start" },
  {
    name: "onboarding-complete",
    path: "/setup/start/complete",
    page: "/setup/start/complete",
    landsOn: "/setup",
  },

  // Shared shell states
  { name: "not-found", path: "/overview", page: "/[module]" },

  // Super Admin. The demo actor holds no platform role, so these routes
  // render the access-denied surface, not the admin panels.
  { name: "admin", path: "/admin", page: "/admin" },
  {
    name: "admin-organizations",
    path: "/admin/organizations",
    page: "/admin/[module]",
  },
  { name: "admin-ask-duna", path: "/admin/ask-duna", page: "/admin/ask-duna" },
  { name: "admin-video", path: "/admin/video", page: "/admin/video" },
];

export interface SkippedPage {
  readonly page: string;
  readonly reason: string;
}

/** `page.tsx` routes that cannot render a real surface in demo mode. */
export const skippedPages: readonly SkippedPage[] = [
  {
    page: "/offerings/[itemId]",
    reason: "The demo catalog is empty, so no product record resolves.",
  },
  {
    page: "/offerings/[itemId]/builder",
    reason: "The demo catalog is empty, so no product record resolves.",
  },
  {
    page: "/offerings/[itemId]/draft-ready",
    reason: "The demo catalog is empty, so no product record resolves.",
  },
  {
    page: "/team/[personId]",
    reason: "The demo workspace has no staff records.",
  },
  {
    page: "/events/[sessionId]/divisions/[divisionId]",
    reason: "No demo event has an entry division.",
  },
  {
    page: "/events/court-bookings/[activityId]",
    reason: "operator.activityDetail requires the connected database.",
  },
  {
    page: "/events/matches/[activityId]",
    reason: "operator.activityDetail requires the connected database.",
  },
  {
    page: "/people/[personId]/health",
    reason: "operator.memberHealthProfile requires the connected database.",
  },
  {
    page: "/marketing/promo-codes",
    reason: "Promo codes require the connected database; the page throws.",
  },
  {
    page: "/stripe/return",
    reason: "Calls WorkOS withAuth, which is not configured in demo mode.",
  },
  {
    page: "/admin/messaging-safety",
    reason: "Throws for any actor without the Super Admin role.",
  },
  {
    page: "/admin/support",
    reason: "Throws for any actor without the Super Admin role.",
  },
  {
    page: "/admin/organizations/[organizationId]",
    reason: "Needs a platform role and a connected organization record.",
  },
];
