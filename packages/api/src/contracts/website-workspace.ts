/**
 * Contract: website-workspace (owner: B8a). The Website Changes model: a
 * site's page tree, change requests in four lanes on their own preview,
 * helper jobs, self-checks, a chat per change, and publish / undo / restore
 * by a person. Frozen by W3-0: B8a implements the service; H12 builds the UI
 * against these shapes and `@duna/core/demo/website-workspace`.
 * Procedures: `operator.websiteWorkspace.*` (docs/plan/w3-contracts.md).
 *
 * Copy never names the hosting or database vendor: "Duna Hosting".
 */
import {
  websiteChangeCheckKinds,
  websiteChangeCheckStatuses,
  websiteChangeJobStatuses,
  websiteChangeLanes,
  websiteChangeMessageRoles,
  websiteChangePageKinds,
  websiteChangeStatuses,
  websitePageManagers,
  websitePageStatuses,
  websitePublishEventKinds,
} from "@duna/db/schema";
import { z } from "zod";
import {
  w3DateSchema,
  w3DateTimeSchema,
  w3IdSchema,
  w3IdempotencyKeySchema,
  w3PersonRefSchema,
} from "./w3-common";

export const websiteWorkspacePageManagerSchema = z.enum(websitePageManagers);
export const websiteWorkspacePageStatusSchema = z.enum(websitePageStatuses);
export const websiteWorkspaceLaneSchema = z.enum(websiteChangeLanes);
export const websiteWorkspaceChangeStatusSchema = z.enum(websiteChangeStatuses);
export const websiteWorkspaceChangePageKindSchema = z.enum(
  websiteChangePageKinds,
);
export const websiteWorkspaceJobStatusSchema = z.enum(websiteChangeJobStatuses);
export const websiteWorkspaceCheckKindSchema = z.enum(websiteChangeCheckKinds);
export const websiteWorkspaceCheckStatusSchema = z.enum(
  websiteChangeCheckStatuses,
);
export const websiteWorkspaceMessageRoleSchema = z.enum(
  websiteChangeMessageRoles,
);
export const websiteWorkspacePublishKindSchema = z.enum(
  websitePublishEventKinds,
);
/** Whether the site is live (WS-Changes header). */
export const websiteWorkspaceSiteStateSchema = z.enum([
  "draft",
  "provisioning",
  "live",
  "paused",
]);

export const websiteWorkspaceSiteSchema = z.object({
  siteId: w3IdSchema,
  name: z.string().min(1),
  state: websiteWorkspaceSiteStateSchema,
  /** Display address on Duna Hosting or the club's own domain. */
  address: z.string().optional(),
  liveVersion: z.number().int().positive().optional(),
  publishedAt: w3DateTimeSchema.optional(),
  publishedBy: w3PersonRefSchema.optional(),
  /** "Site 1 of 3". */
  position: z.number().int().positive(),
  siteLimit: z.number().int().positive(),
  openChanges: z.number().int().nonnegative(),
});
export const websiteWorkspaceSitesSchema = z.object({
  sites: z.array(websiteWorkspaceSiteSchema),
});

export const websiteWorkspacePageSchema = z.object({
  pageId: w3IdSchema,
  parentPageId: w3IdSchema.optional(),
  path: z.string().regex(/^\/[a-z0-9/_-]*$/),
  title: z.string().min(1),
  position: z.number().int().nonnegative(),
  managedBy: websiteWorkspacePageManagerSchema,
  status: websiteWorkspacePageStatusSchema,
  /** Tag from the open change, when any ("Changed", "New"). */
  changeKind: websiteWorkspaceChangePageKindSchema.optional(),
});
export const websiteWorkspaceSiteInputSchema = z.object({ siteId: w3IdSchema });
export const websiteWorkspacePagesSchema = z.object({
  siteId: w3IdSchema,
  pages: z.array(websiteWorkspacePageSchema),
});

export const websiteWorkspaceJobSchema = z.object({
  jobId: w3IdSchema,
  sequence: z.number().int().nonnegative(),
  title: z.string().min(1),
  status: websiteWorkspaceJobStatusSchema,
  question: z.string().optional(),
  errorCode: z.string().max(64).optional(),
  startedAt: w3DateTimeSchema.optional(),
  finishedAt: w3DateTimeSchema.optional(),
});
export const websiteWorkspaceCheckSchema = z.object({
  kind: websiteWorkspaceCheckKindSchema,
  status: websiteWorkspaceCheckStatusSchema,
  summary: z.string().optional(),
  result: z.record(z.string(), z.unknown()),
  checkedAt: w3DateTimeSchema.optional(),
});
export const websiteWorkspaceMessageSchema = z.object({
  messageId: w3IdSchema,
  role: websiteWorkspaceMessageRoleSchema,
  author: w3PersonRefSchema.optional(),
  body: z.string().min(1),
  createdAt: w3DateTimeSchema,
});
export const websiteWorkspaceFactProposalSchema = z.object({
  entityType: z.string().min(1),
  entityId: w3IdSchema,
  field: z.string().min(1),
  before: z.unknown(),
  after: z.unknown(),
  /** "For bookings made from [date]". */
  effectiveFrom: w3DateSchema.optional(),
});
export const websiteWorkspaceCapabilityPlanSchema = z.object({
  summary: z.string().min(1),
  prerequisites: z.array(
    z.object({ label: z.string().min(1), met: z.boolean() }),
  ),
  storedDataImpact: z.string().min(1),
});

export const websiteWorkspaceChangeSummarySchema = z.object({
  changeId: w3IdSchema,
  siteId: w3IdSchema,
  number: z.number().int().positive(),
  title: z.string().min(1),
  lane: websiteWorkspaceLaneSchema,
  /** The lane Duna chose, when the person overrode it. */
  laneOverriddenFrom: websiteWorkspaceLaneSchema.optional(),
  status: websiteWorkspaceChangeStatusSchema,
  askedBy: w3PersonRefSchema.optional(),
  jobsDone: z.number().int().nonnegative(),
  jobsTotal: z.number().int().nonnegative(),
  creditsReserved: z.number().int().nonnegative(),
  creditsSpent: z.number().int().nonnegative(),
  scheduledFor: w3DateTimeSchema.optional(),
  publishedAt: w3DateTimeSchema.optional(),
  updatedAt: w3DateTimeSchema,
});
export const websiteWorkspaceChangesInputSchema = z.object({
  siteId: w3IdSchema,
  status: websiteWorkspaceChangeStatusSchema.optional(),
});
export const websiteWorkspaceChangesSchema = z.object({
  siteId: w3IdSchema,
  changes: z.array(websiteWorkspaceChangeSummarySchema),
});

export const websiteWorkspaceChangeSchema =
  websiteWorkspaceChangeSummarySchema.extend({
    requestText: z.string().min(1),
    previewUrl: z.url().optional(),
    /** True when the live site moved on after this change was built ("Out of date"). */
    behindLive: z.boolean(),
    pages: z.array(
      z.object({
        pageId: w3IdSchema,
        path: z.string(),
        title: z.string(),
        kind: websiteWorkspaceChangePageKindSchema,
      }),
    ),
    jobs: z.array(websiteWorkspaceJobSchema),
    checks: z.array(websiteWorkspaceCheckSchema),
    messages: z.array(websiteWorkspaceMessageSchema),
    factProposal: websiteWorkspaceFactProposalSchema.optional(),
    capabilityPlan: websiteWorkspaceCapabilityPlanSchema.optional(),
    /** Who may publish it (role names), shown before review. */
    publishableBy: z.array(z.string()),
  });
export const websiteWorkspaceChangeInputSchema = z.object({
  changeId: w3IdSchema,
});

export const websiteWorkspaceCreateChangeInputSchema = z.object({
  siteId: w3IdSchema,
  requestText: z.string().trim().min(3).max(4000),
  /** Override the lane Duna would choose. */
  lane: websiteWorkspaceLaneSchema.optional(),
});
export const websiteWorkspaceSendMessageInputSchema = z.object({
  changeId: w3IdSchema,
  body: z.string().trim().min(1).max(4000),
});
export const websiteWorkspaceAnswerJobInputSchema = z.object({
  changeId: w3IdSchema,
  jobId: w3IdSchema,
  answer: z.string().trim().min(1).max(2000),
});
export const websiteWorkspaceScheduleInputSchema = z.object({
  changeId: w3IdSchema,
  scheduledFor: w3DateTimeSchema,
  idempotencyKey: w3IdempotencyKeySchema,
});
export const websiteWorkspacePublishInputSchema = z.object({
  changeId: w3IdSchema,
  idempotencyKey: w3IdempotencyKeySchema,
});

export const websiteWorkspacePublishEventSchema = z.object({
  eventId: w3IdSchema,
  siteId: w3IdSchema,
  kind: websiteWorkspacePublishKindSchema,
  version: z.number().int().positive(),
  changeId: w3IdSchema.optional(),
  changeNumber: z.number().int().positive().optional(),
  reversesEventId: w3IdSchema.optional(),
  actor: w3PersonRefSchema,
  occurredAt: w3DateTimeSchema,
  liveNow: z.boolean(),
});
export const websiteWorkspacePublishResultSchema = z.object({
  change: websiteWorkspaceChangeSchema,
  event: websiteWorkspacePublishEventSchema,
});
export const websiteWorkspaceVersionsSchema = z.object({
  siteId: w3IdSchema,
  events: z.array(websiteWorkspacePublishEventSchema),
});
/** Undo the latest publish, or restore an earlier version. Data received since is kept. */
export const websiteWorkspaceUndoInputSchema = z.object({
  siteId: w3IdSchema,
  eventId: w3IdSchema,
  idempotencyKey: w3IdempotencyKeySchema,
});
export const websiteWorkspaceRestoreInputSchema = z.object({
  siteId: w3IdSchema,
  version: z.number().int().positive(),
  idempotencyKey: w3IdempotencyKeySchema,
});

export type WebsiteWorkspaceSite = z.infer<typeof websiteWorkspaceSiteSchema>;
export type WebsiteWorkspaceChange = z.infer<
  typeof websiteWorkspaceChangeSchema
>;
export type WebsiteWorkspacePublishEvent = z.infer<
  typeof websiteWorkspacePublishEventSchema
>;
