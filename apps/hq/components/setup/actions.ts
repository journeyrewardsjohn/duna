"use server";

import type { SetupProfile, SetupProposal, SetupRun } from "@duna/api";
import { log } from "@duna/observability";
import { revalidatePath } from "next/cache";
import { getServerCaller, getServerContext } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";
import {
  demoApply,
  demoCancelRun,
  demoDecide,
  demoProposals,
  demoRun,
  demoSaveBrand,
  demoStartRun,
  demoUpdateProfile,
  isDemoSetup,
} from "./setup-demo";
import { errorCode, isNotConfiguredAnswer } from "./setup-data";
import type { SetupResult } from "./setup-result";

/**
 * Club setup's changes (H-SETUP). Each is a person's own action from a
 * setup screen. None publishes, invites or changes a live price: applying a
 * read writes drafts only (docs/product/club-setup.md). Each answers a
 * result instead of throwing, so the screen can say what happened with the
 * reference support needs. Logs carry ids and outcomes, never values.
 */

/** Codes whose message the API writes for people. */
const plainCodes = new Set([
  "BAD_REQUEST",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "NOT_FOUND",
  "TOO_MANY_REQUESTS",
]);

async function run<T>(
  action: string,
  perform: () => Promise<T>,
  { revalidate = true }: { readonly revalidate?: boolean } = {},
): Promise<SetupResult<T>> {
  const { requestId } = await getServerContext();
  try {
    const data = await perform();
    if (revalidate) revalidatePath("/setup", "layout");
    log.info("hq.setup.action_succeeded", { action });
    return { ok: true, data };
  } catch (error) {
    const code = errorCode(error);
    if (isPermissionDenied(error)) {
      log.info("hq.setup.action_denied", { action });
      return {
        ok: false,
        code: "denied",
        message:
          "Only an owner or manager of the club can change its setup. Nothing was changed.",
        reference: requestId,
      };
    }
    if (isNotConfiguredAnswer(error)) {
      log.info("hq.setup.action_not_configured", { action });
      return {
        ok: false,
        code: "not-configured",
        message:
          "Duna's website reader isn't set up here yet. You can fill in your club by hand.",
        reference: requestId,
      };
    }
    log.warn("hq.setup.action_failed", { action, code: code ?? "unknown" });
    const plain =
      code && plainCodes.has(code) && error instanceof Error && error.message
        ? error.message
        : undefined;
    return {
      ok: false,
      code:
        code === "TOO_MANY_REQUESTS"
          ? "limit"
          : code === "CONFLICT"
            ? "conflict"
            : code === "BAD_REQUEST"
              ? "invalid"
              : "failed",
      message:
        plain ??
        "Something went wrong on our side. Nothing was changed; try again.",
      reference: requestId,
    };
  }
}

/** Starts a read of the club's website, or of a description of the club. */
export async function startReadAction(
  input:
    | {
        readonly sourceKind: "website";
        readonly url: string;
        readonly reread?: boolean;
      }
    | { readonly sourceKind: "description"; readonly text: string },
): Promise<SetupResult<SetupRun>> {
  return run(
    "startRun",
    async () => {
      if (isDemoSetup()) {
        return demoStartRun(
          input.sourceKind === "website"
            ? {
                sourceKind: "website",
                sourceUrl: input.url,
                reread: input.reread,
              }
            : { sourceKind: "description" },
        );
      }
      const caller = await getServerCaller();
      return caller.operator.setup.startRun(
        input.sourceKind === "website"
          ? { sourceKind: "website", sourceUrl: input.url }
          : { sourceKind: "description", sourceText: input.text },
      );
    },
    { revalidate: false },
  );
}

/** One poll of a run; polling also resumes a read that stalled. */
export async function pollRunAction(
  runId: string,
): Promise<SetupResult<SetupRun>> {
  return run(
    "run",
    async () => {
      if (isDemoSetup()) {
        const demo = await demoRun(runId);
        if (demo) return demo;
      }
      const caller = await getServerCaller();
      return caller.operator.setup.run({ runId });
    },
    { revalidate: false },
  );
}

export async function cancelRunAction(
  runId: string,
): Promise<SetupResult<SetupRun>> {
  return run("cancelRun", async () => {
    if (isDemoSetup()) return demoCancelRun(runId);
    const caller = await getServerCaller();
    return caller.operator.setup.cancelRun({ runId });
  });
}

export async function proposalsAction(
  runId: string,
): Promise<SetupResult<SetupProposal[]>> {
  return run(
    "proposals",
    async () => {
      if (isDemoSetup()) return demoProposals(runId);
      const caller = await getServerCaller();
      return (await caller.operator.setup.proposals({ runId })).proposals;
    },
    { revalidate: false },
  );
}

/** Keep, Edit or Skip one proposal. Nothing reaches the club until Apply. */
export async function decideAction(
  input:
    | { readonly proposalId: string; readonly decision: "kept" | "skipped" }
    | {
        readonly proposalId: string;
        readonly decision: "edited";
        readonly editedPayload: Record<string, unknown>;
      },
): Promise<SetupResult<SetupProposal>> {
  return run(
    "decideProposal",
    async () => {
      const caller = await getServerCaller();
      const decided = await caller.operator.setup.decideProposal(input);
      if (isDemoSetup()) {
        await demoDecide(
          input.proposalId,
          input.decision,
          input.decision === "edited" ? input.editedPayload : undefined,
        );
      }
      return decided;
    },
    { revalidate: false },
  );
}

/** Applies every kept or edited proposal of a run: drafts, audited, idempotent. */
export async function applyAction(input: {
  readonly runId: string;
  readonly idempotencyKey: string;
}): Promise<
  SetupResult<{
    readonly applied: number;
    readonly skipped: number;
    readonly proposals: SetupProposal[];
  }>
> {
  return run("applyProposals", async () => {
    if (isDemoSetup()) return demoApply(input.runId);
    const caller = await getServerCaller();
    return caller.operator.setup.applyProposals({
      runId: input.runId,
      idempotencyKey: input.idempotencyKey.padEnd(8, "-"),
    });
  });
}

export interface ProfileUpdate {
  readonly name?: string;
  readonly sports?: readonly ("beach" | "indoor")[];
  readonly phoneE164?: string;
  readonly email?: string;
  readonly websiteUrl?: string;
  readonly tagline?: string;
  readonly about?: string;
  readonly hours?: SetupProfile["hours"];
  readonly socials?: Record<string, string>;
  /** Fields the person confirmed as they are ("From your website" goes). */
  readonly confirmFields?: readonly string[];
}

/** Saves the club's facts typed by hand. */
export async function saveProfileAction(
  update: ProfileUpdate,
  idempotencyKey: string,
): Promise<SetupResult<SetupProfile>> {
  return run("updateProfile", async () => {
    const { name, sports, ...profile } = update;
    if (isDemoSetup()) return demoUpdateProfile(update);
    const caller = await getServerCaller();
    if (name !== undefined || sports !== undefined) {
      const workspace = await caller.operator.workspace();
      await caller.operator.updateOrganizationProfile({
        name: name ?? workspace.organization.name,
        timezone: workspace.organization.timezone,
        volleyballTypes:
          sports && sports.length > 0
            ? [...sports]
            : [...workspace.organization.volleyballTypes],
        idempotencyKey: /^[0-9a-f-]{36}$/i.test(idempotencyKey)
          ? idempotencyKey
          : crypto.randomUUID(),
      });
    }
    const hasProfileFields = Object.values(profile).some(
      (value) => value !== undefined,
    );
    if (!hasProfileFields) return caller.operator.setup.profile();
    return caller.operator.setup.updateProfile({
      ...profile,
      confirmFields: profile.confirmFields
        ? [...profile.confirmFields]
        : undefined,
    });
  });
}

export interface BrandUpdate {
  readonly brandDisplayName?: string;
  readonly membershipProgramName?: string;
  readonly primary?: string;
  readonly logoUrl?: string;
  readonly markUrl?: string;
  readonly logoLightUrl?: string;
  readonly logoDarkUrl?: string;
  readonly heroMediaUrl?: string;
  readonly heroMediaType?: "image" | "video";
  readonly heroPosterUrl?: string;
  readonly cardStyle?: "soft" | "crisp" | "borderless";
  readonly profileLayout?: "editorial" | "immersive" | "compact";
  readonly brandVoice?: string;
  readonly markForm?: string;
  /** Publish the brand to the club page (a person confirmed it). */
  readonly publish: boolean;
}

const optional = (value: string | undefined) =>
  value === undefined ? undefined : value.trim() || undefined;

/** Saves the club's brand: its mark, colour and voice. Publishing is a separate, confirmed choice. */
export async function saveBrandAction(
  update: BrandUpdate,
  idempotencyKey: string,
): Promise<SetupResult<{ readonly published: boolean }>> {
  return run("updateTheme", async () => {
    if (isDemoSetup()) {
      await demoSaveBrand({
        primary: update.primary,
        markForm: update.markForm,
      });
      return { published: update.publish };
    }
    const caller = await getServerCaller();
    const { theme } = await caller.operator.workspace();
    const pick = (next: string | undefined, current: string | undefined) =>
      next === undefined ? current : optional(next);
    await caller.operator.updateTheme({
      brandDisplayName: pick(update.brandDisplayName, theme.brandDisplayName),
      membershipProgramName: pick(
        update.membershipProgramName,
        theme.membershipProgramName,
      ),
      logoUrl: pick(update.logoUrl, theme.logoUrl),
      markUrl: pick(update.markUrl, theme.markUrl),
      logoLightUrl: pick(update.logoLightUrl, theme.logoLightUrl),
      logoDarkUrl: pick(update.logoDarkUrl, theme.logoDarkUrl),
      heroMediaType: update.heroMediaType ?? theme.heroMediaType,
      heroMediaUrl: pick(update.heroMediaUrl, theme.heroMediaUrl),
      heroPosterUrl: pick(update.heroPosterUrl, theme.heroPosterUrl),
      tagline: theme.tagline,
      profileSummary: theme.profileSummary,
      brandVoice: pick(update.brandVoice, theme.brandVoice),
      palette: {
        ...theme.palette,
        primary: update.primary ?? theme.palette.primary,
      },
      typography: { heading: "Satoshi", body: "Satoshi" },
      fontLicenseConfirmed: theme.fontLicenseConfirmed,
      safeFallbackFont:
        theme.safeFallbackFont || "Arial, Helvetica, sans-serif",
      cardStyle: update.cardStyle ?? theme.cardStyle,
      profileLayout:
        update.profileLayout ??
        (theme.profileLayout === "immersive" ||
        theme.profileLayout === "compact"
          ? theme.profileLayout
          : "editorial"),
      publish: update.publish,
      confirmed: true,
      idempotencyKey: /^[0-9a-f-]{36}$/i.test(idempotencyKey)
        ? idempotencyKey
        : crypto.randomUUID(),
    });
    return { published: update.publish };
  });
}

/** Teaches Duna one thing about the club: a note or a link a person approved. */
export async function addKnowledgeAction(input: {
  readonly kind: "note" | "link" | "document";
  readonly scope: "brand" | "organization" | "venue" | "service" | "product";
  readonly title: string;
  readonly text: string;
  readonly url?: string;
  readonly fileName?: string;
  readonly idempotencyKey: string;
}): Promise<SetupResult<{ readonly id: string }>> {
  return run("addBrandKnowledgeSource", async () => {
    const caller = await getServerCaller();
    const created = await caller.operator.addBrandKnowledgeSource({
      scope: input.scope,
      kind: input.kind,
      title: input.title,
      sourceUrl: input.kind === "link" ? input.url : undefined,
      storageUrl: input.kind === "document" ? input.url : undefined,
      originalFilename: input.kind === "document" ? input.fileName : undefined,
      contentText: input.text,
      confirmed: true,
      idempotencyKey: /^[0-9a-f-]{36}$/i.test(input.idempotencyKey)
        ? input.idempotencyKey
        : crypto.randomUUID(),
    });
    return { id: created.id };
  });
}

export async function archiveKnowledgeAction(input: {
  readonly sourceId: string;
  readonly idempotencyKey: string;
}): Promise<SetupResult<{ readonly id: string }>> {
  return run("archiveBrandKnowledgeSource", async () => {
    const caller = await getServerCaller();
    await caller.operator.archiveBrandKnowledgeSource({
      sourceId: input.sourceId,
      confirmed: true,
      idempotencyKey: /^[0-9a-f-]{36}$/i.test(input.idempotencyKey)
        ? input.idempotencyKey
        : crypto.randomUUID(),
    });
    return { id: input.sourceId };
  });
}

/** Publishes a draft place to players (the existing venue publish). */
export async function publishPlaceAction(input: {
  readonly venueId: string;
  readonly idempotencyKey: string;
}): Promise<SetupResult<{ readonly id: string }>> {
  return run("publishVenue", async () => {
    const caller = await getServerCaller();
    await caller.operator.publishVenue({
      venueId: input.venueId,
      confirmed: true,
      idempotencyKey: /^[0-9a-f-]{36}$/i.test(input.idempotencyKey)
        ? input.idempotencyKey
        : crypto.randomUUID(),
    });
    return { id: input.venueId };
  });
}
