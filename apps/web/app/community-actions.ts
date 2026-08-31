"use server";

import type { CommunitySubjectSummary } from "@duna/api";
import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";

function failure(error: unknown, fallback: string) {
  return {
    ok: false as const,
    error: error instanceof Error && error.message ? error.message : fallback,
  };
}

function subjectPath(subject: CommunitySubjectSummary, returnTo?: string) {
  const requested = returnTo?.split("?")[0];
  if (requested?.startsWith("/") && !requested.startsWith("//")) {
    return requested;
  }
  if (subject.type === "match") return `/matches/${subject.id}`;
  if (subject.type === "live-stream") return `/watch/${subject.id}`;
  return "/pro";
}

function matchPath(matchId: string, returnTo?: string) {
  return subjectPath({ type: "match", id: matchId }, returnTo);
}

export async function createCommunityCommentAction(input: {
  readonly subject: CommunitySubjectSummary;
  readonly body: string;
  readonly idempotencyKey: string;
  readonly returnTo?: string;
}) {
  try {
    const caller = await getServerCaller();
    const comment = await caller.player.createCommunityComment({
      subject: input.subject,
      body: input.body,
      idempotencyKey: input.idempotencyKey,
    });
    revalidatePath(subjectPath(input.subject, input.returnTo));
    return { ok: true as const, comment };
  } catch (error) {
    return failure(error, "Your comment could not be posted.");
  }
}

export async function deleteCommunityCommentAction(input: {
  readonly subject: CommunitySubjectSummary;
  readonly commentId: string;
  readonly returnTo?: string;
}) {
  try {
    const caller = await getServerCaller();
    await caller.player.deleteCommunityComment({ commentId: input.commentId });
    revalidatePath(subjectPath(input.subject, input.returnTo));
    return { ok: true as const };
  } catch (error) {
    return failure(error, "That comment could not be removed.");
  }
}

export async function createMatchJournalNoteAction(input: {
  readonly matchId: string;
  readonly body: string;
  readonly idempotencyKey: string;
  readonly returnTo?: string;
}) {
  try {
    const caller = await getServerCaller();
    const note = await caller.player.createMatchJournalNote({
      matchId: input.matchId,
      body: input.body,
      idempotencyKey: input.idempotencyKey,
      source: "typed",
    });
    revalidatePath(matchPath(input.matchId, input.returnTo));
    return { ok: true as const, note };
  } catch (error) {
    return failure(error, "Your private note could not be saved.");
  }
}

export async function createMatchNoteShareAction(input: {
  readonly matchId: string;
  readonly returnTo?: string;
}) {
  try {
    const caller = await getServerCaller();
    const share = await caller.player.createMatchNoteShare({
      matchId: input.matchId,
    });
    revalidatePath(matchPath(input.matchId, input.returnTo));
    return { ok: true as const, share };
  } catch (error) {
    return failure(error, "Duna could not create that private invite.");
  }
}

export async function revokeMatchNoteShareAction(input: {
  readonly matchId: string;
  readonly returnTo?: string;
  readonly shareId: string;
}) {
  try {
    const caller = await getServerCaller();
    await caller.player.revokeMatchNoteShare({ shareId: input.shareId });
    revalidatePath(matchPath(input.matchId, input.returnTo));
    return { ok: true as const };
  } catch (error) {
    return failure(error, "That private invite could not be revoked.");
  }
}

export async function claimMatchNoteShareAction(input: {
  readonly token: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.claimMatchNoteShare(input);
    revalidatePath(`/matches/${result.matchId}`);
    return { ok: true as const, result };
  } catch (error) {
    return failure(error, "This private notes invite could not be accepted.");
  }
}
