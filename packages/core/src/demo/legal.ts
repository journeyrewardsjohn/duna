/**
 * Demo fixtures: legal (owner: L3). The document registry (the 15 draft
 * documents from apps/web/content/legal/index.json at "1.0-draft" plus the
 * four published keys), acceptances in every surface, accepted-as and
 * method, and requirements in every state. Content hashes are placeholders;
 * L3 computes the real SHA-256 of each published text.
 */
import { demoOrganization, demoPlayer } from "../demo";
import { healthDemoIds } from "./health";
import { demoId } from "./ids";

const hash = (n: number) => n.toString(16).padStart(2, "0").repeat(32);
const draftPublished = "2026-11-27T00:00:00.000Z";
const draftEffective = "2027-01-01T00:00:00.000Z";

type Audience = "players" | "guardians" | "organizations" | "everyone";
const draft = (
  n: number,
  documentKey: string,
  title: string,
  audience: Audience,
  requiresReacceptance = false,
) => ({
  id: demoId("legal", n),
  documentKey,
  version: "1.0-draft",
  title,
  audience,
  contentHash: hash(n),
  url: `/legal/${documentKey}`,
  publishedAt: draftPublished,
  effectiveAt: draftEffective,
  requiresReacceptance,
});
const published = (
  n: number,
  documentKey: string,
  version: string,
  title: string,
  audience: Audience,
) => ({
  id: demoId("legal", n),
  documentKey,
  version,
  title,
  audience,
  contentHash: hash(n),
  url: `/legal/${documentKey}`,
  publishedAt: `${version}T00:00:00.000Z`,
  effectiveAt: `${version}T00:00:00.000Z`,
  requiresReacceptance: false,
});

export const legalDemoDocuments = [
  draft(1, "terms", "Terms of Service", "players", true),
  draft(
    2,
    "guardians-and-youth",
    "Guardian and Youth Terms",
    "guardians",
    true,
  ),
  draft(3, "fees-and-premium", "Player Fees and Duna Premium", "players"),
  draft(4, "booking-and-refunds", "Booking and Refund Policy", "players"),
  draft(5, "hq-terms", "Duna HQ Terms", "organizations", true),
  draft(6, "duna-pay", "Duna Pay Terms", "organizations", true),
  draft(7, "privacy", "Privacy Policy", "everyone"),
  draft(
    8,
    "consumer-health-privacy",
    "Consumer Health Data Privacy Policy",
    "everyone",
  ),
  draft(9, "childrens-privacy", "Children's Privacy Notice", "guardians"),
  draft(10, "cookies", "Cookie Policy", "everyone"),
  draft(11, "subprocessors", "Service Providers", "everyone"),
  draft(12, "acceptable-use", "Acceptable Use and Community Rules", "everyone"),
  draft(13, "messaging", "Messaging and Notifications Terms", "everyone"),
  draft(
    14,
    "content-and-video",
    "Content, Video and Likeness Policy",
    "everyone",
  ),
  draft(15, "copyright", "Copyright and Takedown Policy", "everyone"),
  published(
    16,
    "consumer-terms",
    "2026-08-04",
    "Terms of Service (published)",
    "players",
  ),
  published(
    17,
    "privacy-policy",
    "2026-08-04",
    "Privacy Policy (published)",
    "everyone",
  ),
  published(18, "mobile-eula", "2026-08-04", "Mobile App License", "players"),
  published(
    19,
    "hq-terms",
    "2026-08-20",
    "Duna HQ Terms (published)",
    "organizations",
  ),
];

const mara = { personId: demoPlayer.id, displayName: demoPlayer.displayName };
const remy = { personId: healthDemoIds.child, displayName: "Remy Lewis" };
const sky = { personId: healthDemoIds.teen, displayName: "Sky Lewis" };

type Surface =
  | "web-sign-up"
  | "web-checkout"
  | "web-settings"
  | "player-app"
  | "pro-app"
  | "hq-onboarding"
  | "hq-settings"
  | "guardian-flow"
  | "admin-import";
const acceptance = (
  n: number,
  documentKey: string,
  documentVersion: string,
  surface: Surface,
  extra: Record<string, unknown> = {},
) => ({
  id: demoId("legal", 100 + n),
  documentKey,
  documentVersion,
  documentHash: hash(n),
  acceptedAs: "self" as "self" | "guardian" | "organization-authority",
  person: mara,
  surface,
  locale: "en-US",
  acceptanceMethod: "clickwrap" as
    "clickwrap" | "signed-order-form" | "admin-import",
  acceptedAt: `2026-11-${String(10 + n).padStart(2, "0")}T17:00:00.000Z`,
  ...extra,
});

export const legalDemoAcceptances = [
  acceptance(1, "consumer-terms", "2026-08-04", "web-sign-up"),
  acceptance(2, "privacy-policy", "2026-08-04", "player-app"),
  acceptance(3, "booking-and-refunds", "1.0-draft", "web-checkout"),
  acceptance(4, "messaging", "1.0-draft", "web-settings"),
  acceptance(5, "mobile-eula", "2026-08-04", "pro-app"),
  acceptance(6, "hq-terms", "2026-08-20", "hq-onboarding", {
    acceptedAs: "organization-authority",
    organizationId: demoOrganization.id,
  }),
  acceptance(7, "duna-pay", "1.0-draft", "hq-settings", {
    acceptedAs: "organization-authority",
    organizationId: demoOrganization.id,
    acceptanceMethod: "signed-order-form",
  }),
  acceptance(8, "guardians-and-youth", "1.0-draft", "guardian-flow", {
    acceptedAs: "guardian",
    onBehalfOf: remy,
  }),
  acceptance(9, "consumer-terms", "2026-08-04", "admin-import", {
    acceptanceMethod: "admin-import",
    person: sky,
  }),
];

export const legalDemoRequirements = [
  {
    documentKey: "terms",
    title: "Terms of Service",
    currentVersion: "1.0-draft",
    url: "/legal/terms",
    contentHash: hash(1),
    state: "needs-reacceptance" as const,
    acceptedVersion: "2026-08-04",
  },
  {
    documentKey: "booking-and-refunds",
    title: "Booking and Refund Policy",
    currentVersion: "1.0-draft",
    url: "/legal/booking-and-refunds",
    contentHash: hash(4),
    state: "accepted" as const,
    acceptedVersion: "1.0-draft",
  },
  {
    documentKey: "guardians-and-youth",
    title: "Guardian and Youth Terms",
    currentVersion: "1.0-draft",
    url: "/legal/guardians-and-youth",
    contentHash: hash(2),
    state: "needs-acceptance" as const,
    forPerson: sky,
  },
];

export const legalDemo = {
  domain: "legal",
  documents: legalDemoDocuments,
  acceptances: legalDemoAcceptances,
  requirements: legalDemoRequirements,
} as const;
