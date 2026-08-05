"use server";

import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";

export interface PlayerIntelligenceActionState {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
}

function value(formData: FormData, key: string): string | undefined {
  const result = String(formData.get(key) ?? "").trim();
  return result || undefined;
}

function integer(formData: FormData, key: string): number | undefined {
  const source = value(formData, key);
  if (!source) return undefined;
  const result = Number.parseInt(source, 10);
  return Number.isInteger(result) && result >= 0 ? result : undefined;
}

function heightMillimeters(formData: FormData): number | undefined {
  const source = value(formData, "heightCentimeters");
  if (!source) return undefined;
  const centimeters = Number(source);
  if (!Number.isFinite(centimeters) || centimeters < 60 || centimeters > 260) {
    throw new Error("Height must be between 60 and 260 centimeters.");
  }
  return Math.round(centimeters * 10);
}

function links(source: string | undefined) {
  return (source ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, url, rawKind] = line.split("|").map((part) => part.trim());
      const kind = ["website", "instagram", "youtube", "news"].includes(
        rawKind ?? "",
      )
        ? (rawKind as "website" | "instagram" | "youtube" | "news")
        : "website";
      if (!label || !url) {
        throw new Error(
          "Each player link must use: Label | https://example.com | website.",
        );
      }
      return { label, url, kind };
    });
}

function news(source: string | undefined) {
  return (source ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, url, publisher, publishedAt] = line
        .split("|")
        .map((part) => part.trim());
      if (!title || !url) {
        throw new Error(
          "Each news item must use: Headline | https://article.com | Publisher | YYYY-MM-DD.",
        );
      }
      return {
        title,
        url,
        ...(publisher ? { publisher } : {}),
        ...(publishedAt ? { publishedAt } : {}),
      };
    });
}

function refreshPlayerIntelligence(personId?: string) {
  revalidatePath("/admin/player-intelligence");
  revalidatePath("/rankings");
  revalidatePath("/players/[handle]", "page");
  if (personId) revalidatePath(`/admin/player-intelligence?player=${personId}`);
}

function failure(
  error: unknown,
  fallback: string,
): PlayerIntelligenceActionState {
  return {
    status: "error",
    message: error instanceof Error ? error.message : fallback,
  };
}

export async function researchPlayerProfileAction(
  _previous: PlayerIntelligenceActionState,
  formData: FormData,
): Promise<PlayerIntelligenceActionState> {
  const personId = value(formData, "personId");
  if (!personId) return { status: "error", message: "Choose a mapped player." };
  try {
    const caller = await getServerCaller();
    const proposal = await caller.admin.researchPlayerProfile({
      personId,
      idempotencyKey: crypto.randomUUID(),
    });
    refreshPlayerIntelligence(personId);
    return {
      status: "success",
      message: `Research proposal prepared with ${proposal.evidence.length} evidence sources. Review it before publishing.`,
    };
  } catch (error) {
    return failure(error, "Duna could not research this player.");
  }
}

export async function researchRankedPlayersAction(
  _previous: PlayerIntelligenceActionState,
  formData: FormData,
): Promise<PlayerIntelligenceActionState> {
  const limit = Math.min(10, Math.max(1, integer(formData, "limit") ?? 4));
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.researchRankedPlayers({
      limit,
      idempotencyKey: crypto.randomUUID(),
    });
    refreshPlayerIntelligence();
    const verificationBlock = result.results.find(
      (item) =>
        item.status === "failed" &&
        item.message?.includes("customer verification"),
    );
    return {
      status: result.succeeded === result.attempted ? "success" : "error",
      message:
        verificationBlock?.message ??
        `${result.succeeded} of ${result.attempted} ranked-player proposals completed. Every result remains in review.`,
    };
  } catch (error) {
    return failure(error, "The ranked-player research batch could not run.");
  }
}

export async function savePlayerIdentityAction(
  _previous: PlayerIntelligenceActionState,
  formData: FormData,
): Promise<PlayerIntelligenceActionState> {
  const personId = value(formData, "personId");
  const displayName = value(formData, "displayName");
  const handle = value(formData, "handle");
  const reason = value(formData, "reason");
  if (!personId || !displayName || !handle || !reason || reason.length < 10) {
    return {
      status: "error",
      message:
        "Add the player name, handle, and a verification note of at least 10 characters.",
    };
  }
  try {
    const caller = await getServerCaller();
    await caller.admin.updatePlayerIdentity({
      personId,
      displayName,
      handle,
      givenName: value(formData, "givenName"),
      familyName: value(formData, "familyName"),
      homeMarket: value(formData, "homeMarket"),
      heightMillimeters: heightMillimeters(formData),
      reason,
      idempotencyKey: crypto.randomUUID(),
    });
    refreshPlayerIntelligence(personId);
    return {
      status: "success",
      message:
        "Canonical player identity saved across rankings, research, and the public profile.",
    };
  } catch (error) {
    return failure(error, "The canonical player identity could not be saved.");
  }
}

export async function savePlayerPublicProfileAction(
  _previous: PlayerIntelligenceActionState,
  formData: FormData,
): Promise<PlayerIntelligenceActionState> {
  const personId = value(formData, "personId");
  const publicationStatus =
    value(formData, "publicationStatus") === "published"
      ? "published"
      : "draft";
  const reason = value(formData, "reason");
  if (!personId || !reason || reason.length < 10) {
    return {
      status: "error",
      message: "Add a review reason of at least 10 characters.",
    };
  }
  try {
    const caller = await getServerCaller();
    await caller.admin.savePlayerPublicProfile({
      personId,
      publicationStatus,
      shortBio: value(formData, "shortBio"),
      biography: value(formData, "biography"),
      countryCode: value(formData, "countryCode"),
      hometown: value(formData, "hometown"),
      collegeName: value(formData, "collegeName"),
      collegeLogoUrl: value(formData, "collegeLogoUrl"),
      playingRole: value(formData, "playingRole"),
      cutoutImageUrl: value(formData, "cutoutImageUrl"),
      heroImageUrl: value(formData, "heroImageUrl"),
      heroVideoUrl: value(formData, "heroVideoUrl"),
      imageAlt: value(formData, "imageAlt"),
      careerStats: {
        events: integer(formData, "events"),
        wins: integer(formData, "wins"),
        podiums: integer(formData, "podiums"),
        gold: integer(formData, "gold"),
        silver: integer(formData, "silver"),
        bronze: integer(formData, "bronze"),
        earningsMinor: integer(formData, "earningsMinor"),
        earningsCurrency: value(formData, "earningsCurrency")?.toUpperCase(),
      },
      links: links(value(formData, "links")),
      news: news(value(formData, "news")),
      reason,
      idempotencyKey: crypto.randomUUID(),
    });
    refreshPlayerIntelligence(personId);
    return {
      status: "success",
      message:
        publicationStatus === "published"
          ? "The reviewed player story is now public."
          : "The editorial draft was saved without changing the public page.",
    };
  } catch (error) {
    return failure(error, "The player profile could not be saved.");
  }
}

export async function reviewPlayerMediaWorkflowAction(
  _previous: PlayerIntelligenceActionState,
  formData: FormData,
): Promise<PlayerIntelligenceActionState> {
  const workflowId = value(formData, "workflowId");
  const personId = value(formData, "personId");
  const rawDecision = value(formData, "decision");
  const decision = ["review", "published", "rejected"].includes(
    rawDecision ?? "",
  )
    ? (rawDecision as "review" | "published" | "rejected")
    : undefined;
  const reason = value(formData, "reason");
  if (!workflowId || !decision || !reason || reason.length < 10) {
    return {
      status: "error",
      message: "Choose a decision and add a review reason.",
    };
  }
  const outputs = [
    { kind: "cutout" as const, url: value(formData, "cutoutUrl") },
    { kind: "poster" as const, url: value(formData, "posterUrl") },
    { kind: "background" as const, url: value(formData, "backgroundUrl") },
  ].flatMap((output) => (output.url ? [{ ...output, url: output.url }] : []));
  try {
    const caller = await getServerCaller();
    await caller.admin.reviewPlayerMediaWorkflow({
      workflowId,
      decision,
      outputs,
      reason,
      idempotencyKey: crypto.randomUUID(),
    });
    refreshPlayerIntelligence(personId);
    return {
      status: "success",
      message: `Artwork workflow marked ${decision}.`,
    };
  } catch (error) {
    return failure(error, "The artwork workflow could not be updated.");
  }
}
