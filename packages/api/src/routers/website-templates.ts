/**
 * Router seam: website-templates (owner: B8b). The five site templates and
 * site onboarding (from a template or an existing site). Shapes are frozen in
 * ../contracts/website-templates.ts (W3-0).
 *
 * Mounted once in ../router.ts:
 *   operator.websiteTemplates  organizationProcedure: read "sessions:read",
 *                              start / answers "sessions:write"
 *   public.websiteTemplates    publicProcedure: the available templates only
 *
 * Every procedure returns its fixture from @duna/core/demo/website-templates
 * in demo mode and throws `notImplementedYet` otherwise until B8b lands the
 * service in ../services/website-templates/. Read ./README.md first.
 */
import {
  websiteTemplatesDemo,
  websiteTemplatesDemoSiteStarts,
  websiteTemplatesDemoTemplates,
} from "@duna/core/demo/website-templates";
import { TRPCError } from "@trpc/server";
import { organizationProcedure, publicProcedure, router } from "../auth";
import {
  websiteTemplatesListInputSchema,
  websiteTemplatesListSchema,
  websiteTemplatesSaveAnswersInputSchema,
  websiteTemplatesSiteInputSchema,
  websiteTemplatesSiteStartSchema,
  websiteTemplatesStartInputSchema,
} from "../contracts/website-templates";
import { usesDemoData } from "../services/data-source";
import { notImplementedYet } from "./not-implemented";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "website-templates";
const read = organizationProcedure("sessions:read");
const write = organizationProcedure("sessions:write");

function demoStart(siteId: string) {
  const start = websiteTemplatesDemoSiteStarts.find((s) => s.siteId === siteId);
  if (!start) throw new TRPCError({ code: "NOT_FOUND" });
  return start;
}

const available = () =>
  websiteTemplatesDemoTemplates.filter((t) => t.status === "available");

export const websiteTemplatesOperatorRouter = router({
  status: read
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** WT-Templates: the templates a club can start from. */
  templates: read
    .input(websiteTemplatesListInputSchema)
    .output(websiteTemplatesListSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        return {
          templates: input.includeUnavailable
            ? websiteTemplatesDemo.templates
            : available(),
        };
      }
      return notImplementedYet(DOMAIN, "templates");
    }),

  /** How a site started, and the onboarding questions still open. */
  siteStart: read
    .input(websiteTemplatesSiteInputSchema)
    .output(websiteTemplatesSiteStartSchema)
    .query(({ input }) => {
      if (usesDemoData()) return demoStart(input.siteId);
      return notImplementedYet(DOMAIN, "siteStart");
    }),

  /** Start a new site from a template or an existing site (WN-1, WO-1). */
  start: write
    .input(websiteTemplatesStartInputSchema)
    .output(websiteTemplatesSiteStartSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const base = websiteTemplatesDemoSiteStarts[1]!;
        if (input.origin === "template") {
          const template = available().find(
            (t) => t.templateId === input.templateId,
          );
          if (!template) throw new TRPCError({ code: "NOT_FOUND" });
          return {
            ...base,
            templateId: template.templateId,
            templateName: template.name,
          };
        }
        return {
          siteId: base.siteId,
          origin: "existing-site" as const,
          existingSiteUrl: input.existingSiteUrl,
          answers: {},
          remainingQuestions: base.remainingQuestions,
        };
      }
      return notImplementedYet(DOMAIN, "start");
    }),

  /** Save onboarding answers (chat-first questions). */
  saveAnswers: write
    .input(websiteTemplatesSaveAnswersInputSchema)
    .output(websiteTemplatesSiteStartSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const start = demoStart(input.siteId);
        const answers = { ...start.answers, ...input.answers };
        return {
          ...start,
          answers,
          remainingQuestions: start.remainingQuestions.filter(
            (question) => !(question.key in answers),
          ),
        };
      }
      return notImplementedYet(DOMAIN, "saveAnswers");
    }),
});

export const websiteTemplatesPublicRouter = router({
  status: publicProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** The available templates, for the public "Run your club" pages. */
  templates: publicProcedure.output(websiteTemplatesListSchema).query(() => {
    if (usesDemoData()) return { templates: available() };
    return notImplementedYet(DOMAIN, "templates");
  }),
});
