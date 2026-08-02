"use server";

import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";

export interface SandActionState {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
}

function refreshSandAdmin(): void {
  for (const path of [
    "/admin/sand-data",
    "/admin/player-mapping",
    "/admin/ratings-lab",
    "/admin/profile-merge",
  ]) {
    revalidatePath(path);
  }
}

function failure(error: unknown, fallback: string): SandActionState {
  return {
    status: "error",
    message: error instanceof Error ? error.message : fallback,
  };
}

export async function importSandSourceAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const source = String(formData.get("source") ?? "");
  const externalId = String(formData.get("externalId") ?? "").trim();
  if (
    !["bvbinfo", "volleyball-life", "fivb-12ndr"].includes(source) ||
    !externalId
  ) {
    return {
      status: "error",
      message: "Choose a source and add an ID or URL.",
    };
  }
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.importSandSource({
      source: source as "bvbinfo" | "volleyball-life" | "fivb-12ndr",
      externalId,
    });
    refreshSandAdmin();
    return {
      status: "success",
      message: `Import complete: ${result.counters.matches} matches and ${result.counters.players} players processed.`,
    };
  } catch (error) {
    return failure(error, "The source import could not be completed.");
  }
}

export async function refreshFivbIndexAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const seasonValue = String(formData.get("season") ?? "").trim();
  const season = seasonValue ? Number.parseInt(seasonValue, 10) : undefined;
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.refreshFivbIndex({ season });
    refreshSandAdmin();
    return {
      status: "success",
      message: `${result.events} professional events refreshed.`,
    };
  } catch (error) {
    return failure(error, "The FIVB index could not be refreshed.");
  }
}

export async function refreshWorldRankingsAction(
  _previous: SandActionState,
): Promise<SandActionState> {
  void _previous;
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.refreshWorldRankings();
    refreshSandAdmin();
    return {
      status: "success",
      message: `${result.counters.rankings} ranking records refreshed.`,
    };
  } catch (error) {
    return failure(error, "World rankings could not be refreshed.");
  }
}

export async function linkSandPlayerAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const externalProfileId = String(
    formData.get("externalProfileId") ?? "",
  ).trim();
  const personId = String(formData.get("personId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!externalProfileId || !personId || reason.length < 10) {
    return {
      status: "error",
      message: "Choose a Duna player and add a review reason.",
    };
  }
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.linkSandPlayer({
      externalProfileId,
      personId,
      reason,
    });
    refreshSandAdmin();
    return {
      status: "success",
      message: `${result.displayName} is now linked to this source profile.`,
    };
  } catch (error) {
    return failure(error, "The player mapping could not be saved.");
  }
}

export async function approveSandMatchAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const importedMatchId = String(formData.get("importedMatchId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!importedMatchId || reason.length < 10) {
    return { status: "error", message: "Add an approval reason." };
  }
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.approveSandMatch({
      importedMatchId,
      reason,
    });
    refreshSandAdmin();
    return {
      status: "success",
      message: `Canonical match ${result.canonicalMatchId} was rated.`,
    };
  } catch (error) {
    return failure(error, "The match could not be approved.");
  }
}

export async function reviewSandMatchAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const importedMatchId = String(formData.get("importedMatchId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (
    !importedMatchId ||
    !["rejected", "excluded", "duplicate"].includes(decision) ||
    reason.length < 10
  ) {
    return { status: "error", message: "Choose a decision and add a reason." };
  }
  try {
    const caller = await getServerCaller();
    await caller.admin.reviewSandMatch({
      importedMatchId,
      decision: decision as "rejected" | "excluded" | "duplicate",
      reason,
    });
    refreshSandAdmin();
    return { status: "success", message: `Match marked ${decision}.` };
  } catch (error) {
    return failure(error, "The match review could not be saved.");
  }
}

export async function reviewMatchHistoryDisputeAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const disputeId = String(formData.get("disputeId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "");
  const resolutionNotes = String(formData.get("resolutionNotes") ?? "").trim();
  if (
    !disputeId ||
    !["upheld", "rejected"].includes(decision) ||
    resolutionNotes.length < 8
  ) {
    return {
      status: "error",
      message: "Choose a decision and document the evidence reviewed.",
    };
  }
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.reviewMatchHistoryDispute({
      disputeId,
      decision: decision as "upheld" | "rejected",
      resolutionNotes,
    });
    refreshSandAdmin();
    return {
      status: "success",
      message: `Review ${result.status}. ${result.replay.players} player projections rebuilt.`,
    };
  } catch (error) {
    return failure(error, "The evidence review could not be completed.");
  }
}

export async function evaluateRatingAction(
  _previous: SandActionState,
): Promise<SandActionState> {
  void _previous;
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.evaluateRating();
    refreshSandAdmin();
    return {
      status: "success",
      message: `${result.sampleSize} outcomes evaluated · ${(result.accuracy * 100).toFixed(1)}% prediction accuracy.`,
    };
  } catch (error) {
    return failure(error, "The evaluation could not be completed.");
  }
}

export async function saveRatingConfigurationAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || undefined;
  const activate = formData.get("activate") === "true";
  let parameters: Record<string, number | boolean | string>;
  try {
    const parsed = JSON.parse(
      String(formData.get("parameters") ?? "{}"),
    ) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Parameters must be a JSON object.");
    }
    parameters = parsed as Record<string, number | boolean | string>;
    if (
      Object.values(parameters).some(
        (value) => !["number", "boolean", "string"].includes(typeof value),
      )
    ) {
      throw new Error(
        "Parameter values must be numbers, booleans, or strings.",
      );
    }
  } catch (error) {
    return failure(error, "Parameters must be valid JSON.");
  }
  if (name.length < 3 || reason.length < 10) {
    return { status: "error", message: "Add a name and review reason." };
  }
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.createRatingConfiguration({
      name,
      parameters,
      notes,
      activate,
      reason,
    });
    refreshSandAdmin();
    return {
      status: "success",
      message: `${result.name} v${result.version} was saved${result.active ? " and activated" : ""}.`,
    };
  } catch (error) {
    return failure(error, "The rating configuration could not be saved.");
  }
}

export async function mergeSandProfilesAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const sourcePersonId = String(formData.get("sourcePersonId") ?? "").trim();
  const targetPersonId = String(formData.get("targetPersonId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!sourcePersonId || !targetPersonId || reason.length < 10) {
    return {
      status: "error",
      message: "Add both profile IDs and a merge reason.",
    };
  }
  try {
    const caller = await getServerCaller();
    await caller.admin.mergeSandProfiles({
      sourcePersonId,
      targetPersonId,
      reason,
    });
    refreshSandAdmin();
    return {
      status: "success",
      message: "The unclaimed profile was merged into the canonical identity.",
    };
  } catch (error) {
    return failure(error, "The profiles could not be merged.");
  }
}
