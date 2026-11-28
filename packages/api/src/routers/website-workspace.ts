/**
 * Router seam: website-workspace (owner: B8a). The Website Changes model
 * (flag website.workspace). Shapes are frozen in
 * ../contracts/website-workspace.ts (W3-0).
 *
 * Mounted once in ../router.ts as `operator.websiteWorkspace`
 * (organizationProcedure). Reads use "sessions:read"; requests, schedule,
 * publish, undo and restore use "sessions:write" until R3 adds dedicated
 * website scopes (docs/plan/w3-contracts.md). A person publishes; nothing
 * publishes itself.
 *
 * Every procedure returns its fixture from @duna/core/demo/website-workspace
 * in demo mode and throws `notImplementedYet` otherwise until B8a lands the
 * service in ../services/website-workspace/. Read ./README.md first.
 */
import {
  websiteWorkspaceDemo,
  websiteWorkspaceDemoIds,
} from "@duna/core/demo/website-workspace";
import { TRPCError } from "@trpc/server";
import { organizationProcedure, rateLimitMiddleware, router } from "../auth";
import {
  websiteWorkspaceAnswerJobInputSchema,
  websiteWorkspaceChangeInputSchema,
  websiteWorkspaceChangeSchema,
  websiteWorkspaceChangeSummarySchema,
  websiteWorkspaceChangesInputSchema,
  websiteWorkspaceChangesSchema,
  websiteWorkspaceCreateChangeInputSchema,
  websiteWorkspaceMessageSchema,
  websiteWorkspacePagesSchema,
  websiteWorkspacePublishEventSchema,
  websiteWorkspacePublishInputSchema,
  websiteWorkspacePublishResultSchema,
  websiteWorkspaceRestoreInputSchema,
  websiteWorkspaceScheduleInputSchema,
  websiteWorkspaceSendMessageInputSchema,
  websiteWorkspaceSiteInputSchema,
  websiteWorkspaceSitesSchema,
  websiteWorkspaceUndoInputSchema,
  websiteWorkspaceVersionsSchema,
} from "../contracts/website-workspace";
import { usesDemoData } from "../services/data-source";
import { notImplementedYet } from "./not-implemented";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "website-workspace";
const read = organizationProcedure("sessions:read");
const write = organizationProcedure("sessions:write");
const publishing = write.use(
  rateLimitMiddleware({
    id: "website-publish",
    capacity: 10,
    refillPerMinute: 2,
    scope: "organization",
  }),
);

function demoChange(changeId: string) {
  const change = websiteWorkspaceDemo.changes.find(
    (candidate) => candidate.changeId === changeId,
  );
  if (!change) throw new TRPCError({ code: "NOT_FOUND" });
  return change;
}

function demoSite(siteId: string) {
  if (
    !websiteWorkspaceDemo.sites.sites.some((site) => site.siteId === siteId)
  ) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
}

const latestEvent = websiteWorkspaceDemo.versions.events[0]!;

export const websiteWorkspaceOperatorRouter = router({
  status: read
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** The club's sites ("Site 1 of 3") with live version and last publish. */
  sites: read.output(websiteWorkspaceSitesSchema).query(() => {
    if (usesDemoData()) return websiteWorkspaceDemo.sites;
    return notImplementedYet(DOMAIN, "sites");
  }),

  /** The page tree (WS-Review), with the open change's page tags. */
  pages: read
    .input(websiteWorkspaceSiteInputSchema)
    .output(websiteWorkspacePagesSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        demoSite(input.siteId);
        return input.siteId === websiteWorkspaceDemoIds.site
          ? websiteWorkspaceDemo.pages
          : { siteId: input.siteId, pages: [] };
      }
      return notImplementedYet(DOMAIN, "pages");
    }),

  /** Changes on a site (WS-Changes), optionally by status. */
  changes: read
    .input(websiteWorkspaceChangesInputSchema)
    .output(websiteWorkspaceChangesSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        demoSite(input.siteId);
        return {
          siteId: input.siteId,
          changes: websiteWorkspaceDemo.changes
            .filter(
              (change) =>
                change.siteId === input.siteId &&
                (!input.status || change.status === input.status),
            )
            .map((change) => websiteWorkspaceChangeSummarySchema.parse(change)),
        };
      }
      return notImplementedYet(DOMAIN, "changes");
    }),

  /** One change with jobs, checks, chat and preview. */
  change: read
    .input(websiteWorkspaceChangeInputSchema)
    .output(websiteWorkspaceChangeSchema)
    .query(({ input }) => {
      if (usesDemoData()) return demoChange(input.changeId);
      return notImplementedYet(DOMAIN, "change");
    }),

  /** Ask for a change; Duna picks the lane unless the person sets it. */
  createChange: write
    .input(websiteWorkspaceCreateChangeInputSchema)
    .output(websiteWorkspaceChangeSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        demoSite(input.siteId);
        const draft = demoChange(websiteWorkspaceDemo.changes[2]!.changeId);
        return {
          ...draft,
          siteId: input.siteId,
          requestText: input.requestText,
          title: input.requestText.slice(0, 80),
          lane: input.lane ?? draft.lane,
          ...(input.lane && input.lane !== draft.lane
            ? { laneOverriddenFrom: draft.lane }
            : {}),
        };
      }
      return notImplementedYet(DOMAIN, "createChange");
    }),

  /** Chat on a change. */
  sendMessage: write
    .input(websiteWorkspaceSendMessageInputSchema)
    .output(websiteWorkspaceMessageSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const message = demoChange(websiteWorkspaceDemoIds.reviewChange)
          .messages[0]!;
        return { ...message, body: input.body };
      }
      return notImplementedYet(DOMAIN, "sendMessage");
    }),

  /** Answer a helper job that needs the person. */
  answerJob: write
    .input(websiteWorkspaceAnswerJobInputSchema)
    .output(websiteWorkspaceChangeSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const change = demoChange(input.changeId);
        return {
          ...change,
          jobs: change.jobs.map((job) =>
            job.jobId === input.jobId && job.status === "needs-you"
              ? { ...job, status: "queued" as const, question: undefined }
              : job,
          ),
        };
      }
      return notImplementedYet(DOMAIN, "answerJob");
    }),

  /** Publish later; a person confirms now. */
  schedule: publishing
    .input(websiteWorkspaceScheduleInputSchema)
    .output(websiteWorkspaceChangeSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return {
          ...demoChange(input.changeId),
          status: "scheduled" as const,
          scheduledFor: input.scheduledFor,
        };
      }
      return notImplementedYet(DOMAIN, "schedule");
    }),

  /** A person publishes a reviewed change; refused when it is out of date. */
  publish: publishing
    .input(websiteWorkspacePublishInputSchema)
    .output(websiteWorkspacePublishResultSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const change = demoChange(input.changeId);
        if (change.behindLive || change.status === "out-of-date") {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "The live site changed since this preview. Rebuild it first.",
          });
        }
        if (
          change.status !== "ready-for-review" &&
          change.status !== "scheduled"
        ) {
          throw new TRPCError({ code: "PRECONDITION_FAILED" });
        }
        return {
          change: {
            ...change,
            status: "published" as const,
            publishedAt: "2026-11-28T16:00:00.000Z",
          },
          event: {
            ...latestEvent,
            kind: "publish" as const,
            version: latestEvent.version + 1,
            changeId: change.changeId,
            changeNumber: change.number,
            reversesEventId: undefined,
            occurredAt: "2026-11-28T16:00:00.000Z",
          },
        };
      }
      return notImplementedYet(DOMAIN, "publish");
    }),

  /** Publish history ("Versions"), newest first. */
  versions: read
    .input(websiteWorkspaceSiteInputSchema)
    .output(websiteWorkspaceVersionsSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        demoSite(input.siteId);
        return input.siteId === websiteWorkspaceDemoIds.site
          ? websiteWorkspaceDemo.versions
          : { siteId: input.siteId, events: [] };
      }
      return notImplementedYet(DOMAIN, "versions");
    }),

  /** Undo a publish. Data received since (form answers, sign-ups) is kept. */
  undo: publishing
    .input(websiteWorkspaceUndoInputSchema)
    .output(websiteWorkspacePublishEventSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        demoSite(input.siteId);
        return {
          ...latestEvent,
          kind: "undo" as const,
          version: latestEvent.version + 1,
          reversesEventId: input.eventId,
          occurredAt: "2026-11-28T16:05:00.000Z",
        };
      }
      return notImplementedYet(DOMAIN, "undo");
    }),

  /** Make an earlier version live again (a new version number). */
  restore: publishing
    .input(websiteWorkspaceRestoreInputSchema)
    .output(websiteWorkspacePublishEventSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        demoSite(input.siteId);
        const target = websiteWorkspaceDemo.versions.events.find(
          (event) => event.version === input.version,
        );
        if (!target) throw new TRPCError({ code: "NOT_FOUND" });
        return {
          ...latestEvent,
          kind: "restore" as const,
          version: latestEvent.version + 1,
          reversesEventId: target.eventId,
          occurredAt: "2026-11-28T16:06:00.000Z",
        };
      }
      return notImplementedYet(DOMAIN, "restore");
    }),

  /** Throw a change away; reserved credits are returned. */
  discard: write
    .input(websiteWorkspaceChangeInputSchema)
    .output(websiteWorkspaceChangeSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return {
          ...demoChange(input.changeId),
          status: "discarded" as const,
          creditsReserved: 0,
        };
      }
      return notImplementedYet(DOMAIN, "discard");
    }),
});
