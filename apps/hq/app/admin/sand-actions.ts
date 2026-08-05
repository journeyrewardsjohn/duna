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
    "/admin/pro-tour",
    "/admin/player-mapping",
    "/admin/ratings-lab",
    "/admin/profile-merge",
  ]) {
    revalidatePath(path);
  }
  revalidatePath("/pro");
  revalidatePath("/events/[slug]", "page");
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
    !["bvbinfo", "volleyball-life", "fivb-12ndr", "avp-league"].includes(
      source,
    ) ||
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
      source: source as
        "bvbinfo" | "volleyball-life" | "fivb-12ndr" | "avp-league",
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
      message: `${result.events} events indexed; ${result.details.succeeded} upcoming event details hydrated.`,
    };
  } catch (error) {
    return failure(error, "The FIVB schedule could not be refreshed.");
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

export async function refreshSandRatingNetworkAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const maxDepth = Number.parseInt(String(formData.get("maxDepth") ?? "4"), 10);
  const topPlayersPerGender = Number.parseInt(
    String(formData.get("topPlayersPerGender") ?? "200"),
    10,
  );
  if (
    !Number.isInteger(maxDepth) ||
    maxDepth < 1 ||
    maxDepth > 4 ||
    !Number.isInteger(topPlayersPerGender) ||
    topPlayersPerGender < 50 ||
    topPlayersPerGender > 500
  ) {
    return {
      status: "error",
      message:
        "Choose 1–4 graph degrees and 50–500 ranked players per division.",
    };
  }
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.refreshSandRatingNetwork({
      maxDepth,
      topPlayersPerGender,
    });
    refreshSandAdmin();
    return {
      status: "success",
      message: `SandRating network staged: ${result.counters.players} profiles and ${result.counters.matches} matches across ${maxDepth} degrees.`,
    };
  } catch (error) {
    return failure(error, "The SandRating network could not be refreshed.");
  }
}

export async function approveSandRatingBackfillAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const reason = String(formData.get("reason") ?? "").trim();
  const limit = Number.parseInt(String(formData.get("limit") ?? "5000"), 10);
  if (reason.length < 10 || !Number.isInteger(limit) || limit < 1) {
    return {
      status: "error",
      message: "Document the approval basis and choose a valid match limit.",
    };
  }
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.approveReadySandRatingMatches({
      limit: Math.min(5_000, limit),
      reason,
    });
    refreshSandAdmin();
    return {
      status: "success",
      message: `${result.approved} partner matches approved; ${result.replay.players} Duna SandRatings rebuilt from ${result.replay.matches} matches.`,
    };
  } catch (error) {
    return failure(error, "The SandRating backfill could not be approved.");
  }
}

export async function refreshAvpLeagueAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const seasonValue = String(formData.get("season") ?? "").trim();
  const season = seasonValue ? Number.parseInt(seasonValue, 10) : undefined;
  if (season !== undefined && !Number.isInteger(season)) {
    return { status: "error", message: "Enter a valid AVP season." };
  }
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.refreshAvpLeague({ season });
    refreshSandAdmin();
    return {
      status: "success",
      message: `AVP ${season ?? "current"} refreshed: ${result.counters.matches} matches and ${result.counters.players} player identities processed.`,
    };
  } catch (error) {
    return failure(error, "The AVP League season could not be refreshed.");
  }
}

export async function saveProfessionalWatchOptionAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  let professionalEventId = String(
    formData.get("professionalEventId") ?? "",
  ).trim();
  const matchSelection = String(formData.get("importedMatchId") ?? "").trim();
  let importedMatchId: string | undefined;
  if (matchSelection.includes(":")) {
    const [selectedEventId, selectedMatchId] = matchSelection.split(":");
    professionalEventId = selectedEventId ?? professionalEventId;
    importedMatchId = selectedMatchId || undefined;
  } else {
    importedMatchId = matchSelection || undefined;
  }
  const kind = String(formData.get("kind") ?? "");
  const label = String(formData.get("label") ?? "").trim() || undefined;
  const url = String(formData.get("url") ?? "").trim() || undefined;
  const channelName =
    String(formData.get("channelName") ?? "").trim() || undefined;
  const reason = String(formData.get("reason") ?? "").trim();
  if (
    !professionalEventId ||
    !["vbtv", "youtube", "live-tv"].includes(kind) ||
    reason.length < 10
  ) {
    return {
      status: "error",
      message: "Choose a destination and document the broadcast update.",
    };
  }
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.saveProfessionalWatchOption({
      professionalEventId,
      importedMatchId,
      kind: kind as "vbtv" | "youtube" | "live-tv",
      label,
      url,
      channelName,
      reason,
    });
    refreshSandAdmin();
    return {
      status: "success",
      message: `${result.label} was added to the broadcast guide.`,
    };
  } catch (error) {
    return failure(error, "The broadcast option could not be saved.");
  }
}

export async function saveProfessionalEventEditorialAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const professionalEventId = String(
    formData.get("professionalEventId") ?? "",
  ).trim();
  const enabled = (name: string) => formData.get(name) === "on";
  const field = (name: string) =>
    String(formData.get(name) ?? "").trim() || undefined;
  const numberField = (name: string) => {
    const raw = field(name);
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const reason = field("reason") ?? "";
  if (!professionalEventId || reason.length < 10) {
    return {
      status: "error",
      message: "Choose an event and document the editorial update.",
    };
  }
  try {
    const caller = await getServerCaller();
    await caller.admin.saveProfessionalEventEditorial({
      professionalEventId,
      overrides: {
        ...(enabled("overrideName") && field("name")
          ? { name: field("name") }
          : {}),
        ...(enabled("overrideLocation") && field("location")
          ? { location: field("location") }
          : {}),
        ...(enabled("overrideCategory") && field("category")
          ? { category: field("category") }
          : {}),
        ...(enabled("overrideStartsOn") && field("startsOn")
          ? { startsOn: field("startsOn") }
          : {}),
        ...(enabled("overrideEndsOn") && field("endsOn")
          ? { endsOn: field("endsOn") }
          : {}),
      },
      summary: field("summary"),
      venueName: field("venueName"),
      venueAddress: field("formattedAddress") ?? field("venueAddress"),
      venue:
        field("googlePlaceId") || field("addressLine1")
          ? {
              googlePlaceId: field("googlePlaceId"),
              googleMapsUri: field("googleMapsUri"),
              formattedAddress: field("formattedAddress"),
              addressLine1: field("addressLine1"),
              addressLine2: field("addressLine2"),
              locality: field("locality"),
              administrativeArea: field("administrativeArea"),
              postalCode: field("postalCode"),
              countryCode: field("countryCode"),
              latitude: numberField("latitude"),
              longitude: numberField("longitude"),
            }
          : undefined,
      timezone: field("timezone"),
      ticketUrl: field("ticketUrl"),
      reason,
    });
    refreshSandAdmin();
    return {
      status: "success",
      message: "Duna editorial details now take priority where enabled.",
    };
  } catch (error) {
    return failure(error, "The event details could not be saved.");
  }
}

export async function researchProfessionalEventAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const professionalEventId = String(
    formData.get("professionalEventId") ?? "",
  ).trim();
  if (!professionalEventId) {
    return { status: "error", message: "Choose an event to research." };
  }
  try {
    const caller = await getServerCaller();
    const proposal = await caller.admin.researchProfessionalEvent({
      professionalEventId,
    });
    refreshSandAdmin();
    return {
      status: "success",
      message: `Research ready for review with ${proposal.evidence.length} cited sources.`,
    };
  } catch (error) {
    return failure(error, "Event research could not be completed.");
  }
}

export async function applyProfessionalEventResearchAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const professionalEventId = String(
    formData.get("professionalEventId") ?? "",
  ).trim();
  const proposalId = String(formData.get("proposalId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!professionalEventId || !proposalId || reason.length < 10) {
    return {
      status: "error",
      message: "Review the proposal and add a meaningful approval note.",
    };
  }
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.applyProfessionalEventResearch({
      professionalEventId,
      proposalId,
      reason,
    });
    refreshSandAdmin();
    return {
      status: "success",
      message: `Verified research applied; ${result.addedWatchOptions} broadcast option${result.addedWatchOptions === 1 ? "" : "s"} added.`,
    };
  } catch (error) {
    return failure(error, "The research proposal could not be applied.");
  }
}

export async function saveProfessionalEventMediaAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const professionalEventId = String(
    formData.get("professionalEventId") ?? "",
  ).trim();
  const kind = String(formData.get("kind") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  const posterUrl = String(formData.get("posterUrl") ?? "").trim() || undefined;
  const alt = String(formData.get("alt") ?? "").trim();
  const caption = String(formData.get("caption") ?? "").trim() || undefined;
  const reason = String(formData.get("reason") ?? "").trim();
  if (
    !professionalEventId ||
    !["poster", "hero-image", "hero-video"].includes(kind) ||
    !url ||
    !alt ||
    reason.length < 10
  ) {
    return {
      status: "error",
      message: "Add the media, accessible description, and review note.",
    };
  }
  try {
    const caller = await getServerCaller();
    await caller.admin.saveProfessionalEventMedia({
      professionalEventId,
      kind: kind as "poster" | "hero-image" | "hero-video",
      url,
      posterUrl,
      alt,
      caption,
      featured: formData.get("featured") === "on",
      reason,
    });
    refreshSandAdmin();
    return { status: "success", message: "Event media published." };
  } catch (error) {
    return failure(error, "The event media could not be saved.");
  }
}

export async function removeProfessionalEventMediaAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const professionalEventId = String(
    formData.get("professionalEventId") ?? "",
  ).trim();
  const mediaId = String(formData.get("mediaId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!professionalEventId || !mediaId || reason.length < 10) {
    return { status: "error", message: "Document why media is removed." };
  }
  try {
    const caller = await getServerCaller();
    await caller.admin.removeProfessionalEventMedia({
      professionalEventId,
      mediaId,
      reason,
    });
    refreshSandAdmin();
    return { status: "success", message: "Event media removed." };
  } catch (error) {
    return failure(error, "The event media could not be removed.");
  }
}

export async function saveProfessionalMatchScheduleAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const value = (name: string) =>
    String(formData.get(name) ?? "").trim() || undefined;
  const professionalEventId = value("professionalEventId") ?? "";
  const importedMatchId = value("importedMatchId");
  const gender = value("gender");
  const teamAName = value("teamAName") ?? "";
  const teamBName = value("teamBName") ?? "";
  const localStartsAt = value("localStartsAt") ?? "";
  const timezone = value("timezone") ?? "";
  const reason = value("reason") ?? "";
  if (
    !professionalEventId ||
    !["men", "women"].includes(gender ?? "") ||
    !teamAName ||
    !teamBName ||
    !localStartsAt ||
    !timezone ||
    reason.length < 10
  ) {
    return {
      status: "error",
      message: "Complete both teams, local start time, timezone, and note.",
    };
  }
  try {
    const caller = await getServerCaller();
    await caller.admin.saveProfessionalMatchSchedule({
      professionalEventId,
      importedMatchId,
      gender: gender as "men" | "women",
      teamAName,
      teamBName,
      localStartsAt,
      timezone,
      roundLabel: value("roundLabel"),
      court: value("court"),
      reason,
    });
    refreshSandAdmin();
    return {
      status: "success",
      message: importedMatchId ? "Match schedule updated." : "Match added.",
    };
  } catch (error) {
    return failure(error, "The AVP League match could not be saved.");
  }
}

export async function removeProfessionalWatchOptionAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const professionalEventId = String(
    formData.get("professionalEventId") ?? "",
  ).trim();
  const importedMatchId =
    String(formData.get("importedMatchId") ?? "").trim() || undefined;
  const optionId = String(formData.get("optionId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!professionalEventId || !optionId || reason.length < 10) {
    return {
      status: "error",
      message: "Document why this broadcast option is being removed.",
    };
  }
  try {
    const caller = await getServerCaller();
    await caller.admin.removeProfessionalWatchOption({
      professionalEventId,
      importedMatchId,
      optionId,
      reason,
    });
    refreshSandAdmin();
    return { status: "success", message: "Broadcast option removed." };
  } catch (error) {
    return failure(error, "The broadcast option could not be removed.");
  }
}

export async function saveAvpRosterAssignmentAction(
  _previous: SandActionState,
  formData: FormData,
): Promise<SandActionState> {
  const teamSelection = String(formData.get("team") ?? "");
  const [seasonValue, genderValue, ...teamParts] = teamSelection.split("|");
  const season = Number.parseInt(seasonValue ?? "", 10);
  const teamName = teamParts.join("|").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const personId = String(formData.get("personId") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  const effectiveFrom =
    String(formData.get("effectiveFrom") ?? "").trim() || undefined;
  const effectiveTo =
    String(formData.get("effectiveTo") ?? "").trim() || undefined;
  const replacesExternalPersonId =
    String(formData.get("replacesExternalPersonId") ?? "").trim() || undefined;
  const reason = String(formData.get("reason") ?? "").trim();
  if (
    !Number.isInteger(season) ||
    !teamName ||
    !["men", "women"].includes(genderValue ?? "") ||
    !displayName ||
    !personId ||
    !["starter", "substitute"].includes(role) ||
    reason.length < 10
  ) {
    return {
      status: "error",
      message: "Complete the AVP team, Duna player, role, and review note.",
    };
  }
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.saveAvpRosterAssignment({
      season,
      teamName,
      gender: genderValue as "men" | "women",
      displayName,
      personId,
      role: role as "starter" | "substitute",
      effectiveFrom,
      effectiveTo,
      replacesExternalPersonId,
      reason,
    });
    refreshSandAdmin();
    return {
      status: "success",
      message: `${result.displayName} is assigned to ${result.teamName} for ${result.season}.`,
    };
  } catch (error) {
    return failure(error, "The AVP roster assignment could not be saved.");
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
