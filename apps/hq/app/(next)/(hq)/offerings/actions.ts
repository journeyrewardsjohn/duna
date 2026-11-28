"use server";

import { usesDemoData } from "@duna/api";
import { log } from "@duna/observability";
import { revalidatePath } from "next/cache";
import { getServerCaller, getServerContext } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";
import { isNotConfiguredAnswer } from "@/components/money/money-data";
import type { MoneyActionResult as ActionResult } from "@/components/money/money-action-result";
import {
  DemoStoreFullError,
  newDemoOfferingId,
  writeDemoStore,
  type DemoPatch,
  type DemoSessionChange,
} from "@/components/offerings/demo-store";
import {
  saveInputFromItem,
  templateConfiguration,
  templateCover,
  templateFor,
  type OfferingItem,
} from "@/components/offerings/offering-model";
import {
  loadOffering,
  loadWorkspace,
} from "@/components/offerings/offerings-data";
import { participationPreset, validateParticipationRuleV2 } from "@duna/core";
import { storedRule } from "@/components/participation/rule-model";

/**
 * Offerings' changes (H-OFFER). Each one is a person's confirmed action on
 * an offerings screen; every call carries the idempotency key the
 * confirming control created (reused on retry), and answers a result
 * instead of throwing, so the screen can say what happened with the
 * reference support needs. In demo mode (no Duna Database) catalog changes
 * are kept in the person's own browser (see demo-store.ts); participation
 * actions answer from the API's demo fixtures.
 */

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

const plainCodes = new Set([
  "BAD_REQUEST",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "NOT_FOUND",
  "TOO_MANY_REQUESTS",
  "INTERNAL_SERVER_ERROR",
]);

async function run<T>(
  action: string,
  perform: () => Promise<T>,
): Promise<ActionResult<T>> {
  const { requestId } = await getServerContext();
  try {
    const data = await perform();
    revalidatePath("/offerings", "layout");
    log.info("hq.offerings.action_succeeded", { action });
    return { ok: true, data };
  } catch (error) {
    const code = codeOf(error);
    if (isPermissionDenied(error)) {
      log.info("hq.offerings.action_denied", { action });
      return {
        ok: false,
        code: "denied",
        message:
          "You don't have permission to do this. An owner of the club can. Nothing was changed.",
        reference: requestId,
      };
    }
    if (isNotConfiguredAnswer(error)) {
      log.info("hq.offerings.action_not_configured", { action });
      return {
        ok: false,
        code: "not-configured",
        message:
          "This isn't set up in this environment yet. Nothing was changed.",
        reference: requestId,
      };
    }
    if (error instanceof DemoStoreFullError) {
      return {
        ok: false,
        code: "failed",
        message: error.message,
        reference: requestId,
      };
    }
    log.warn("hq.offerings.action_failed", {
      action,
      code: code ?? "unknown",
    });
    // Catalog services answer plain sentences ("Add at least one image…").
    const message =
      error instanceof Error &&
      error.message &&
      (!code || plainCodes.has(code)) &&
      error.message.length < 300 &&
      !/database|sql|neon|vercel|stripe/i.test(error.message)
        ? `${error.message} Nothing was changed.`
        : "Something went wrong on our side. Nothing was changed; try again.";
    return { ok: false, code: "failed", message, reference: requestId };
  }
}

const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : crypto.randomUUID();

async function offering(itemId: string): Promise<OfferingItem> {
  const loaded = await loadOffering(itemId);
  if (loaded.state === "ok") return loaded.data;
  const error = new Error("This offering was not found.");
  (error as Error & { code: string }).code =
    loaded.state === "denied" ? "FORBIDDEN" : "NOT_FOUND";
  throw error;
}

function demoPatch(itemId: string, patch: DemoPatch) {
  return writeDemoStore((store) => ({
    ...store,
    patches: {
      ...store.patches,
      [itemId]: {
        ...store.patches[itemId],
        ...patch,
        configuration: {
          ...(store.patches[itemId]?.configuration ?? {}),
          ...(patch.configuration ?? {}),
        },
      },
    },
  }));
}

// ---------------------------------------------------------------------------
// Create, duplicate, status
// ---------------------------------------------------------------------------

/** Creates a draft from a kind and a template: a name and a price. */
export async function createOfferingAction(input: {
  readonly templateId: string;
  readonly title: string;
  readonly priceMinor: number;
  readonly idempotencyKey: string;
}) {
  return run("create", async () => {
    const template = templateFor(input.templateId);
    if (!template) throw new Error("Choose what kind of offering this is.");
    const title = input.title.trim();
    if (title.length < 2) throw new Error("Give it a name players recognise.");
    if (usesDemoData()) {
      let id = "";
      await writeDemoStore((store) => {
        id = newDemoOfferingId(store);
        return {
          ...store,
          created: [
            ...store.created,
            {
              id,
              templateId: template.id,
              title,
              priceMinor: input.priceMinor,
            },
          ],
        };
      });
      return { id };
    }
    const [workspace, context] = await Promise.all([
      loadWorkspace(),
      getServerContext(),
    ]);
    const venueId =
      workspace.state === "ok" ? workspace.data.venues[0]?.id : undefined;
    const timeZone =
      workspace.state === "ok"
        ? workspace.data.organization.timezone
        : "America/Los_Angeles";
    const configuration = templateConfiguration(template, {
      now: context.now,
      timeZone,
      venueId,
    });
    if (template.preset && template.preset !== "private") {
      const preset = participationPreset(template.preset);
      const { maxParticipants: _max, ...rule } = preset.rule;
      void _max;
      configuration.participation = storedRule(rule);
    }
    const cover = templateCover(template);
    const caller = await getServerCaller();
    const saved = await caller.operator.createCatalogItem({
      type: template.type,
      subtype: template.subtype,
      title,
      visibility: "public",
      taxable: template.type === "good",
      allowCard: true,
      allowCash: false,
      allowCredits: false,
      membershipRequired: false,
      priceMinor: input.priceMinor,
      ...(template.recurring
        ? { recurringInterval: template.recurring, recurringIntervalCount: 1 }
        : {}),
      options: [],
      media: cover ? [cover] : [],
      configuration,
      confirmed: true,
      idempotencyKey: uuid(input.idempotencyKey),
    });
    return { id: saved.id };
  });
}

/** A private draft copy of an offering, everything included. */
export async function duplicateOfferingAction(input: {
  readonly itemId: string;
  readonly idempotencyKey: string;
}) {
  return run("duplicate", async () => {
    const item = await offering(input.itemId);
    const title = `${item.title} (copy)`.slice(0, 140);
    if (usesDemoData()) {
      let id = "";
      await writeDemoStore((store) => {
        id = newDemoOfferingId(store);
        return {
          ...store,
          created: [
            ...store.created,
            { id, templateId: "copy", copyOf: item.id, title },
          ],
        };
      });
      return { id };
    }
    const caller = await getServerCaller();
    const saved = await caller.operator.createCatalogItem({
      ...saveInputFromItem(item),
      type: item.type,
      title,
      options: saveInputFromItem(item).options.map((option) => ({
        name: option.name,
        values: [...option.values],
      })),
      media: [...saveInputFromItem(item).media],
      confirmed: true,
      idempotencyKey: uuid(input.idempotencyKey),
    });
    return { id: saved.id };
  });
}

/** Draft → Live → Archived (Publish, Take offline, Archive, Restore). */
export async function setOfferingStatusAction(input: {
  readonly itemId: string;
  readonly status: "draft" | "active" | "archived";
  readonly idempotencyKey: string;
}) {
  return run(`status.${input.status}`, async () => {
    if (usesDemoData()) {
      await offering(input.itemId);
      await demoPatch(input.itemId, { status: input.status });
      return { status: input.status };
    }
    const caller = await getServerCaller();
    await caller.operator.setCatalogItemStatus({
      catalogItemId: input.itemId,
      status: input.status,
      confirmed: true,
      idempotencyKey: uuid(input.idempotencyKey),
    });
    return { status: input.status };
  });
}

// ---------------------------------------------------------------------------
// Sections: details, schedule, people, settings, group size (stay live)
// ---------------------------------------------------------------------------

/**
 * Saves words and settings that keep a live offering live: the name and
 * description, the configuration a section owns (merged with the rest, so
 * nothing else resets), visibility and members-only.
 */
export async function saveOfferingAction(input: {
  readonly itemId: string;
  readonly title?: string;
  readonly shortSummary?: string;
  readonly description?: string;
  readonly visibility?: "public" | "members" | "private";
  readonly membershipRequired?: boolean;
  readonly configuration?: Record<string, unknown>;
  readonly idempotencyKey: string;
}) {
  return run("save", async () => {
    const item = await offering(input.itemId);
    if (usesDemoData()) {
      await demoPatch(item.id, {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.shortSummary !== undefined
          ? { shortSummary: input.shortSummary.trim() }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description.slice(0, 600) }
          : {}),
        ...(input.visibility ? { visibility: input.visibility } : {}),
        ...(input.membershipRequired !== undefined
          ? { membershipRequired: input.membershipRequired }
          : {}),
        ...(input.configuration ? { configuration: input.configuration } : {}),
      });
      return { id: item.id };
    }
    const caller = await getServerCaller();
    return caller.operator.updateCatalogItem({
      catalogItemId: item.id,
      title: (input.title ?? item.title).trim(),
      shortSummary: input.shortSummary ?? item.shortSummary,
      description: input.description ?? item.description,
      visibility: input.visibility ?? item.visibility,
      membershipRequired: input.membershipRequired ?? item.membershipRequired,
      configuration: input.configuration ?? {},
      confirmed: true,
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}

/**
 * Saves the group rule (`null`: use the club default) with the session's
 * capacity. Validated with the shared core first, so the words are the
 * same here and on the server.
 */
export async function saveGroupRuleAction(input: {
  readonly itemId: string;
  readonly rule: Record<string, unknown> | null;
  readonly capacity: number;
  readonly idempotencyKey: string;
}) {
  return run("groupRule", async () => {
    const item = await offering(input.itemId);
    if (input.rule) {
      const check = validateParticipationRuleV2(input.rule, {
        capacity: input.capacity,
      });
      if (!check.rule) {
        const error = new Error(check.issues.join(" "));
        (error as Error & { code: string }).code = "BAD_REQUEST";
        throw error;
      }
    }
    const service =
      item.configuration.service &&
      typeof item.configuration.service === "object"
        ? (item.configuration.service as Record<string, unknown>)
        : {};
    const configuration = {
      capacity: input.capacity,
      service: { ...service, capacity: input.capacity },
      participation: input.rule,
    };
    if (usesDemoData()) {
      await demoPatch(item.id, { configuration });
      return { id: item.id };
    }
    const caller = await getServerCaller();
    return caller.operator.updateCatalogItem({
      catalogItemId: item.id,
      title: item.title,
      shortSummary: item.shortSummary,
      description: item.description,
      visibility: item.visibility,
      membershipRequired: item.membershipRequired,
      configuration,
      confirmed: true,
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}

// ---------------------------------------------------------------------------
// Price, options and photos (a new version: re-published when it was live)
// ---------------------------------------------------------------------------

export interface PriceChange {
  readonly allowCard?: boolean;
  readonly allowCash?: boolean;
  readonly allowCredits?: boolean;
  readonly priceMinor?: number | null;
  readonly annualPriceMinor?: number | null;
  readonly creditCost?: number | null;
  readonly taxable?: boolean;
  readonly options?: readonly {
    readonly name: string;
    readonly values: readonly string[];
  }[];
  readonly media?: readonly {
    readonly kind: "image" | "video";
    readonly url: string;
    readonly alt?: string;
    readonly variantIndex?: number;
  }[];
  readonly configuration?: Record<string, unknown>;
}

/**
 * Changes what an offering costs, its options or its photos. The catalog
 * saves these as a new version, which is a draft; when the offering was
 * live, the person confirmed keeping it live, so it is published again.
 */
export async function savePriceAction(input: {
  readonly itemId: string;
  readonly change: PriceChange;
  readonly idempotencyKey: string;
}) {
  return run("price", async () => {
    const item = await offering(input.itemId);
    const wasLive = item.status === "active";
    if (usesDemoData()) {
      await demoPatch(item.id, {
        ...(input.change.allowCard !== undefined
          ? { allowCard: input.change.allowCard }
          : {}),
        ...(input.change.allowCash !== undefined
          ? { allowCash: input.change.allowCash }
          : {}),
        ...(input.change.allowCredits !== undefined
          ? { allowCredits: input.change.allowCredits }
          : {}),
        ...(input.change.taxable !== undefined
          ? { taxable: input.change.taxable }
          : {}),
        ...(input.change.priceMinor !== undefined
          ? { priceMinor: input.change.priceMinor }
          : {}),
        ...(input.change.creditCost !== undefined
          ? { creditCost: input.change.creditCost }
          : {}),
        ...(input.change.configuration
          ? { configuration: input.change.configuration }
          : {}),
        ...(input.change.media
          ? {
              media: input.change.media
                .slice(0, 6)
                .map(({ kind, url, alt }) => ({ kind, url, alt })),
            }
          : {}),
      });
      return { id: item.id, live: wasLive };
    }
    const current = saveInputFromItem(item);
    const next = {
      ...current,
      ...(input.change.allowCard !== undefined
        ? { allowCard: input.change.allowCard }
        : {}),
      ...(input.change.allowCash !== undefined
        ? { allowCash: input.change.allowCash }
        : {}),
      ...(input.change.allowCredits !== undefined
        ? { allowCredits: input.change.allowCredits }
        : {}),
      ...(input.change.taxable !== undefined
        ? { taxable: input.change.taxable }
        : {}),
      priceMinor:
        input.change.priceMinor === undefined
          ? current.priceMinor
          : (input.change.priceMinor ?? undefined),
      annualPriceMinor:
        input.change.annualPriceMinor === undefined
          ? current.annualPriceMinor
          : (input.change.annualPriceMinor ?? undefined),
      creditCost:
        input.change.creditCost === undefined
          ? current.creditCost
          : (input.change.creditCost ?? undefined),
      options: (input.change.options ?? current.options).map((option) => ({
        name: option.name,
        values: [...option.values],
      })),
      media: [...(input.change.media ?? current.media)],
      configuration: {
        ...current.configuration,
        ...(input.change.configuration ?? {}),
      },
    };
    const caller = await getServerCaller();
    const saved = await caller.operator.replaceCatalogItem({
      catalogItemId: item.id,
      ...next,
      type: item.type as "service" | "plan" | "good",
      confirmed: true,
      idempotencyKey: uuid(input.idempotencyKey),
    });
    if (wasLive) {
      await caller.operator.setCatalogItemStatus({
        catalogItemId: item.id,
        status: "active",
        confirmed: true,
        idempotencyKey: crypto.randomUUID(),
      });
    }
    return { id: saved.id, live: wasLive };
  });
}

/** Restores an earlier version as a new draft (the catalog's version history). */
export async function revertVersionAction(input: {
  readonly itemId: string;
  readonly versionId: string;
  readonly idempotencyKey: string;
}) {
  return run("revert", async () => {
    const caller = await getServerCaller();
    return caller.operator.revertCatalogItemVersion({
      catalogItemId: input.itemId,
      versionId: input.versionId,
      confirmed: true,
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}

/** Records stock that arrived (goods). The movement history stays append-only. */
export async function receiveStockAction(input: {
  readonly catalogVariantId: string;
  readonly quantity: number;
  readonly totalCostMinor?: number;
  readonly inventoryLocationId?: string;
  readonly locationName?: string;
  readonly vendorName?: string;
  readonly idempotencyKey: string;
}) {
  return run("receiveStock", async () => {
    if (usesDemoData()) {
      const error = new Error(
        "Stock is kept in Duna Database, which the demo club doesn't have.",
      );
      (error as Error & { code: string }).code = "PRECONDITION_FAILED";
      throw error;
    }
    const caller = await getServerCaller();
    return caller.operator.createInventoryStock({
      catalogVariantId: input.catalogVariantId,
      ...(input.inventoryLocationId
        ? { inventoryLocationId: input.inventoryLocationId }
        : { locationName: input.locationName ?? "Main stock" }),
      purpose: "sale",
      trackingMode: "quantity",
      quantity: input.quantity,
      reorderPoint: 0,
      condition: "new",
      ...(input.totalCostMinor !== undefined
        ? { totalCostMinor: input.totalCostMinor }
        : {}),
      ...(input.vendorName ? { vendorName: input.vendorName } : {}),
      confirmed: true,
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}

// ---------------------------------------------------------------------------
// Group rules: club default, previews, rules to review
// ---------------------------------------------------------------------------

export async function setDefaultsAction(input: {
  readonly rules: Record<string, unknown>;
  readonly appliesTo: readonly ("service" | "open-play" | "pickup")[];
  readonly idempotencyKey: string;
}) {
  return run("setDefaults", async () => {
    const caller = await getServerCaller();
    const result = await caller.operator.participation.setDefaults({
      rules: input.rules,
      appliesTo: [...input.appliesTo],
      idempotencyKey: input.idempotencyKey,
    });
    if (result.issues.length > 0) {
      const error = new Error(result.issues.join(" "));
      (error as Error & { code: string }).code = "BAD_REQUEST";
      throw error;
    }
    if (usesDemoData()) {
      await writeDemoStore((store) => ({
        ...store,
        defaults: { rules: input.rules, appliesTo: input.appliesTo },
      }));
    }
    return result;
  });
}

/** What saving a rule would do to sessions people already booked. */
export async function previewRuleChangeAction(input: {
  readonly itemId: string;
  readonly rules: Record<string, unknown>;
}) {
  return run("previewRuleChange", async () => {
    const caller = await getServerCaller();
    return caller.operator.participation.previewRuleChange({
      catalogItemId: input.itemId,
      rules: input.rules,
    });
  });
}

export async function applyRuleToBookedAction(input: {
  readonly itemId: string;
  readonly occurrenceIds: readonly string[];
  readonly idempotencyKey: string;
}) {
  return run("applyRuleToBooked", async () => {
    const caller = await getServerCaller();
    return caller.operator.participation.applyRuleToBooked({
      catalogItemId: input.itemId,
      occurrenceIds: [...input.occurrenceIds],
      confirmed: true,
      idempotencyKey: input.idempotencyKey,
    });
  });
}

export async function keepRuleAction(input: {
  readonly subjectType: "session" | "pickup-session";
  readonly subjectId: string;
  readonly idempotencyKey: string;
}) {
  return run("keepRule", async () => {
    const caller = await getServerCaller();
    const result = await caller.operator.participation.keepRule(input);
    if (usesDemoData()) {
      await writeDemoStore((store) => ({
        ...store,
        kept: [...new Set([...store.kept, input.subjectId])],
      }));
    }
    return result;
  });
}

/** "Turn on cancel" for a legacy rule: the same rule with cancel. */
export async function turnOnCancelAction(input: {
  readonly subjectType: "session" | "pickup-session";
  readonly subjectId: string;
  readonly minParticipants: number;
  readonly idempotencyKey: string;
}) {
  return run("turnOnCancel", async () => {
    const caller = await getServerCaller();
    const result = await caller.operator.participation.setSubjectRule({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      rules: {
        version: 2,
        unit: "player",
        minParticipants: input.minParticipants,
        minimumPolicy: "cancel",
        waitlist: false,
        tiers: [],
      },
      idempotencyKey: input.idempotencyKey,
    });
    if (usesDemoData()) {
      await writeDemoStore((store) => ({
        ...store,
        kept: [...new Set([...store.kept, input.subjectId])],
      }));
    }
    return result;
  });
}

// ---------------------------------------------------------------------------
// Sessions: extend, run anyway, cancel, merge, request, attendance
// ---------------------------------------------------------------------------

type Subject = {
  readonly subjectType: "catalog-session-occurrence";
  readonly subjectId: string;
};

function demoSession(subjectId: string, change: DemoSessionChange) {
  return writeDemoStore((store) => ({
    ...store,
    sessions: {
      ...store.sessions,
      [subjectId]: { ...store.sessions[subjectId], ...change },
    },
  }));
}

export async function extendLockAction(
  input: Subject & { readonly lockAt: string; readonly idempotencyKey: string },
) {
  return run("extendLock", async () => {
    const caller = await getServerCaller();
    const result = await caller.operator.participation.extendLock({
      ...input,
      confirmed: true,
    });
    if (usesDemoData()) {
      await demoSession(input.subjectId, { lockAt: input.lockAt });
      return { ...result, lockAt: input.lockAt };
    }
    return result;
  });
}

export async function runAnywayAction(
  input: Subject & { readonly idempotencyKey: string },
) {
  return run("runAnyway", async () => {
    const caller = await getServerCaller();
    const result = await caller.operator.participation.runAnyway({
      ...input,
      confirmed: true,
    });
    if (usesDemoData()) await demoSession(input.subjectId, { runAnyway: true });
    return result;
  });
}

export async function cancelSessionAction(
  input: Subject & {
    readonly reason: "coach" | "weather" | "venue" | "other";
    readonly idempotencyKey: string;
  },
) {
  return run("cancelSession", async () => {
    const caller = await getServerCaller();
    const result = await caller.operator.participation.cancelSession({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      reason: input.reason,
      confirmed: true,
      idempotencyKey: input.idempotencyKey,
    });
    if (usesDemoData()) await demoSession(input.subjectId, { cancelled: true });
    return result;
  });
}

export async function requestCancelAction(
  input: Subject & {
    readonly reason: "coach" | "weather" | "venue" | "other";
    readonly idempotencyKey: string;
  },
) {
  return run("requestCancel", async () => {
    const caller = await getServerCaller();
    return caller.operator.participation.requestCancel(input);
  });
}

export async function mergeSessionsAction(input: {
  readonly fromOccurrenceId: string;
  readonly intoOccurrenceId: string;
  readonly idempotencyKey: string;
}) {
  return run("mergeSessions", async () => {
    const caller = await getServerCaller();
    const result = await caller.operator.participation.mergeSessions({
      ...input,
      confirmed: true,
    });
    if (usesDemoData()) {
      await demoSession(input.fromOccurrenceId, { cancelled: true });
    }
    return result;
  });
}

export async function recordAttendanceAction(
  input: Subject & {
    readonly marks: readonly {
      readonly bookingId: string;
      readonly status: "attended" | "absent";
    }[];
    readonly idempotencyKey: string;
  },
) {
  return run("recordAttendance", async () => {
    const caller = await getServerCaller();
    const deviceMarkedAt = new Date().toISOString();
    const result = await caller.operator.participation.recordAttendance({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      marks: input.marks.map((mark) => ({ ...mark, deviceMarkedAt })),
      idempotencyKey: input.idempotencyKey,
    });
    if (usesDemoData()) {
      await writeDemoStore((store) => ({
        ...store,
        sessions: {
          ...store.sessions,
          [input.subjectId]: {
            ...store.sessions[input.subjectId],
            attendance: {
              ...(store.sessions[input.subjectId]?.attendance ?? {}),
              ...Object.fromEntries(
                input.marks.map((mark) => [mark.bookingId, mark.status]),
              ),
            },
          },
        },
      }));
      return { recorded: input.marks.length, ignored: [] };
    }
    return result;
  });
}
