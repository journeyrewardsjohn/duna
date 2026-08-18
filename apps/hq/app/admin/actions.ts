"use server";

import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";

export interface GuardianReviewActionState {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
}

export type FeatureFlagActionState = GuardianReviewActionState;
export type VideoAdminActionState = GuardianReviewActionState;
export type VisionAdminActionState = GuardianReviewActionState;
export type OrganizationCommissionActionState = GuardianReviewActionState;
export type PredictionAdminActionState = GuardianReviewActionState;

function parseConfiguration(
  value: FormDataEntryValue | null,
): Readonly<Record<string, unknown>> | undefined {
  const source = String(value ?? "{}").trim() || "{}";
  try {
    const parsed: unknown = JSON.parse(source);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return undefined;
    }
    return parsed as Readonly<Record<string, unknown>>;
  } catch {
    return undefined;
  }
}

export async function createFeatureFlagAction(
  _previous: FeatureFlagActionState,
  formData: FormData,
): Promise<FeatureFlagActionState> {
  const key = String(formData.get("key") ?? "").trim();
  const organizationId =
    String(formData.get("organizationId") ?? "").trim() || undefined;
  const market = String(formData.get("market") ?? "").trim() || undefined;
  const enabled = formData.get("enabled") === "true";
  const reason = String(formData.get("reason") ?? "").trim();
  const confirmed = formData.get("confirmed") === "true";
  const configuration = parseConfiguration(formData.get("configuration"));
  if (!key || reason.length < 10 || !confirmed || configuration === undefined) {
    return {
      status: "error",
      message:
        "Add a valid JSON object, a review reason of at least 10 characters, and confirm the exact rollout.",
    };
  }

  try {
    const caller = await getServerCaller();
    const result = await caller.admin.createFeatureFlag({
      key,
      organizationId,
      market,
      enabled,
      configuration,
      reason,
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/admin");
    revalidatePath("/admin/flags");
    return {
      status: "success",
      message: `${result.key} was created ${result.enabled ? "enabled" : "disabled"} for the selected scope.`,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "The feature flag could not be created.",
    };
  }
}

export async function updateFeatureFlagAction(
  _previous: FeatureFlagActionState,
  formData: FormData,
): Promise<FeatureFlagActionState> {
  const flagId = String(formData.get("flagId") ?? "");
  const enabled = formData.get("enabled") === "true";
  const reason = String(formData.get("reason") ?? "").trim();
  const confirmed = formData.get("confirmed") === "true";
  const configuration = parseConfiguration(formData.get("configuration"));
  if (
    !flagId ||
    reason.length < 10 ||
    !confirmed ||
    configuration === undefined
  ) {
    return {
      status: "error",
      message:
        "Add a valid JSON object, a review reason of at least 10 characters, and confirm the exact rollout.",
    };
  }

  try {
    const caller = await getServerCaller();
    const result = await caller.admin.updateFeatureFlag({
      flagId,
      enabled,
      configuration,
      reason,
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/admin");
    revalidatePath("/admin/flags");
    return {
      status: "success",
      message: `${result.key} is now ${result.enabled ? "enabled" : "disabled"}.`,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "The feature flag could not be updated.",
    };
  }
}

export async function reviewGuardianshipAction(
  _previous: GuardianReviewActionState,
  formData: FormData,
): Promise<GuardianReviewActionState> {
  const guardianId = String(formData.get("guardianId") ?? "");
  const minorId = String(formData.get("minorId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (
    !guardianId ||
    !minorId ||
    !["verified", "rejected"].includes(decision) ||
    reason.length < 10
  ) {
    return {
      status: "error",
      message: "Add a review reason of at least 10 characters.",
    };
  }

  try {
    const caller = await getServerCaller();
    const result = await caller.admin.reviewGuardianship({
      guardianId,
      minorId,
      decision: decision as "verified" | "rejected",
      reason,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/admin");
    revalidatePath("/admin/trust");
    return {
      status: "success",
      message:
        result.status === "verified"
          ? "Relationship verified. Guardian-gated flows are now available."
          : "Relationship rejected and retained in the audit record.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Review could not be saved.",
    };
  }
}

function videoActionError(
  error: unknown,
  fallback: string,
): VideoAdminActionState {
  return {
    status: "error",
    message: error instanceof Error ? error.message : fallback,
  };
}

function visionActionError(
  error: unknown,
  fallback: string,
): VisionAdminActionState {
  return {
    status: "error",
    message: error instanceof Error ? error.message : fallback,
  };
}

export async function registerVisionModelAction(
  _previous: VisionAdminActionState,
  formData: FormData,
): Promise<VisionAdminActionState> {
  const version = String(formData.get("version") ?? "").trim();
  const bundleSha256 = String(formData.get("bundleSha256") ?? "").trim();
  const bundleR2Prefix = String(formData.get("bundleR2Prefix") ?? "").trim();
  const detectorFamily = String(formData.get("detectorFamily") ?? "").trim();
  const sourceLicense = String(formData.get("sourceLicense") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const manifest = parseConfiguration(formData.get("manifest"));
  const confirmed = formData.get("confirmed") === "true";
  if (
    version.length < 3 ||
    !/^[a-f0-9]{64}$/.test(bundleSha256) ||
    !/^vision-models\/[a-zA-Z0-9_./-]+\/$/.test(bundleR2Prefix) ||
    !detectorFamily ||
    !sourceLicense ||
    !manifest ||
    reason.length < 8 ||
    !confirmed
  ) {
    return {
      status: "error",
      message:
        "Complete the immutable bundle details, valid manifest, audit reason, and confirmation.",
    };
  }
  try {
    const caller = await getServerCaller();
    const model = await caller.admin.registerVisionModel({
      version,
      bundleSha256,
      bundleR2Prefix,
      detectorFamily,
      sourceLicense,
      manifest,
      reason,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/admin/vision");
    return {
      status: "success",
      message: `${model.version} is registered as a candidate. No traffic was changed.`,
    };
  } catch (error) {
    return visionActionError(
      error,
      "The model bundle could not be registered.",
    );
  }
}

export async function requestVisionTrainingAction(
  _previous: VisionAdminActionState,
  formData: FormData,
): Promise<VisionAdminActionState> {
  const requestedModelVersion = String(
    formData.get("requestedModelVersion") ?? "",
  ).trim();
  const datasetR2Key = String(formData.get("datasetR2Key") ?? "").trim();
  const baseModelVersion =
    String(formData.get("baseModelVersion") ?? "").trim() || undefined;
  const codeCommitSha = String(formData.get("codeCommitSha") ?? "").trim();
  const budgetCents = Math.round(Number(formData.get("budgetDollars")) * 100);
  const reason = String(formData.get("reason") ?? "").trim();
  const confirmed = formData.get("confirmed") === "true";
  if (
    requestedModelVersion.length < 3 ||
    !/^vision-training\/datasets\/[a-zA-Z0-9_./-]+\.zip$/.test(datasetR2Key) ||
    !/^[a-f0-9]{7,64}$/.test(codeCommitSha) ||
    !Number.isInteger(budgetCents) ||
    budgetCents < 100 ||
    budgetCents > 100_000 ||
    reason.length < 8 ||
    !confirmed
  ) {
    return {
      status: "error",
      message:
        "Use an approved dataset ZIP, immutable code commit, budget from $1 to $1,000, audit reason, and confirmation.",
    };
  }
  try {
    const caller = await getServerCaller();
    const run = await caller.admin.requestVisionTraining({
      requestedModelVersion,
      datasetR2Key,
      baseModelVersion,
      codeCommitSha,
      budgetCents,
      reason,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/admin/vision");
    return {
      status: "success",
      message: `Modal L4 training ${run.id} is running inside the approved budget ceiling.`,
    };
  } catch (error) {
    return visionActionError(error, "The L4 training run could not start.");
  }
}

export async function requestVisionBenchmarkAction(
  _previous: VisionAdminActionState,
  formData: FormData,
): Promise<VisionAdminActionState> {
  const modelId = String(formData.get("modelId") ?? "");
  const benchmarkId = String(formData.get("benchmarkId") ?? "").trim();
  const datasetManifestR2Key = String(
    formData.get("datasetManifestR2Key") ?? "",
  ).trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const confirmed = formData.get("confirmed") === "true";
  if (
    !modelId ||
    benchmarkId.length < 3 ||
    !/^vision-benchmarks\/[a-zA-Z0-9_./-]+\.json$/.test(datasetManifestR2Key) ||
    reason.length < 8 ||
    !confirmed
  ) {
    return {
      status: "error",
      message:
        "Choose a model and immutable benchmark manifest, add an audit reason, and confirm the run.",
    };
  }
  try {
    const caller = await getServerCaller();
    const run = await caller.admin.requestVisionBenchmark({
      modelId,
      benchmarkId,
      datasetManifestR2Key,
      reason,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/admin/vision");
    return {
      status: "success",
      message: `Signed benchmark ${run.id} is running on Modal L4.`,
    };
  } catch (error) {
    return visionActionError(error, "The benchmark could not start.");
  }
}

export async function reviewVisionModelAction(
  _previous: VisionAdminActionState,
  formData: FormData,
): Promise<VisionAdminActionState> {
  const modelId = String(formData.get("modelId") ?? "");
  const stage = String(formData.get("stage") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const confirmed = formData.get("confirmed") === "true";
  if (
    !modelId ||
    !["shadow", "production", "rollback"].includes(stage) ||
    !["approved", "rejected"].includes(decision) ||
    notes.length < 8 ||
    !confirmed
  ) {
    return {
      status: "error",
      message:
        "Choose a bounded decision, add review notes, and confirm the exact model stage.",
    };
  }
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.reviewVisionModel({
      modelId,
      stage: stage as "shadow" | "production" | "rollback",
      decision: decision as "approved" | "rejected",
      notes,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/admin/vision");
    return {
      status: "success",
      message:
        result.approvalsNeeded > 0
          ? `Review recorded. ${result.approvalsNeeded} independent production approval remains.`
          : `Review recorded. Model status is now ${result.status}.`,
    };
  } catch (error) {
    return visionActionError(error, "The model review could not be saved.");
  }
}

export async function grantComplimentaryDunaPlusAction(
  _previous: VideoAdminActionState,
  formData: FormData,
): Promise<VideoAdminActionState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const confirmed = formData.get("confirmed") === "true";
  const endsAt = endDate ? new Date(`${endDate}T23:59:59.999Z`) : undefined;

  if (
    !email.includes("@") ||
    reason.length < 8 ||
    !confirmed ||
    (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= new Date()))
  ) {
    return {
      status: "error",
      message:
        "Add a valid email, a future end date or leave it indefinite, an audit reason of at least 8 characters, and confirm the grant.",
    };
  }

  try {
    const caller = await getServerCaller();
    const grant = await caller.admin.grantComplimentaryDunaPlus({
      email,
      startsAt: new Date().toISOString(),
      endsAt: endsAt?.toISOString(),
      reason,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/admin/video");
    return {
      status: "success",
      message: `${grant.displayName ?? grant.email} now has Complimentary Premium+${grant.endsAt ? ` through ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(grant.endsAt))}` : " indefinitely"}.`,
    };
  } catch (error) {
    return videoActionError(
      error,
      "The complimentary Premium+ grant could not be saved.",
    );
  }
}

export async function revokeComplimentaryDunaPlusAction(
  _previous: VideoAdminActionState,
  formData: FormData,
): Promise<VideoAdminActionState> {
  const grantId = String(formData.get("grantId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const confirmed = formData.get("confirmed") === "true";
  if (!grantId || reason.length < 8 || !confirmed) {
    return {
      status: "error",
      message:
        "Add a revocation reason of at least 8 characters and confirm the change.",
    };
  }

  try {
    const caller = await getServerCaller();
    const grant = await caller.admin.revokeComplimentaryDunaPlus({
      grantId,
      reason,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/admin/video");
    return {
      status: "success",
      message: `Complimentary Premium+ was revoked for ${grant.displayName ?? grant.email}.`,
    };
  } catch (error) {
    return videoActionError(
      error,
      "The complimentary Premium+ grant could not be revoked.",
    );
  }
}

export async function updateVideoQuotaPolicyAction(
  _previous: VideoAdminActionState,
  formData: FormData,
): Promise<VideoAdminActionState> {
  const liveHours = Number(formData.get("liveHours"));
  const uploadHours = Number(formData.get("uploadHours"));
  const reason = String(formData.get("reason") ?? "").trim();
  const confirmed = formData.get("confirmed") === "true";
  if (
    !Number.isFinite(liveHours) ||
    !Number.isFinite(uploadHours) ||
    liveHours < 0 ||
    uploadHours < 0 ||
    liveHours > 744 ||
    uploadHours > 744 ||
    reason.length < 8 ||
    !confirmed
  ) {
    return {
      status: "error",
      message:
        "Use limits between 0 and 744 hours, add an audit reason of at least 8 characters, and confirm the policy.",
    };
  }

  try {
    const caller = await getServerCaller();
    const policy = await caller.admin.updateVideoQuotaPolicy({
      monthlyLiveSeconds: Math.round(liveHours * 60 * 60),
      monthlyUploadSeconds: Math.round(uploadHours * 60 * 60),
      enforceLiveLimit: formData.get("enforceLiveLimit") === "true",
      enforceUploadLimit: formData.get("enforceUploadLimit") === "true",
      reason,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/admin/video");
    return {
      status: "success",
      message: `Video policy saved: ${policy.monthlyLiveSeconds / 3600} live hours and ${policy.monthlyUploadSeconds / 3600} upload hours per month.`,
    };
  } catch (error) {
    return videoActionError(
      error,
      "The video quota policy could not be saved.",
    );
  }
}

export async function reviewVisionCalibrationSampleAction(
  _previous: VideoAdminActionState,
  formData: FormData,
): Promise<VideoAdminActionState> {
  const sampleId = String(formData.get("sampleId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const confirmed = formData.get("confirmed") === "true";
  if (
    !sampleId ||
    !["approved", "rejected"].includes(decision) ||
    notes.length < 8 ||
    !confirmed
  ) {
    return {
      status: "error",
      message:
        "Choose approve or reject, add review notes of at least 8 characters, and confirm the decision.",
    };
  }

  try {
    const caller = await getServerCaller();
    const sample = await caller.admin.reviewVisionCalibrationSample({
      sampleId,
      decision: decision as "approved" | "rejected",
      notes,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/admin/video");
    return {
      status: "success",
      message:
        sample.status === "approved"
          ? "Calibration approved for a future, separately controlled training set. No training started automatically."
          : "Calibration rejected and retained in the review audit trail.",
    };
  } catch (error) {
    return videoActionError(
      error,
      "The calibration review could not be saved.",
    );
  }
}

export async function updateOrganizationCommissionAction(
  _previous: OrganizationCommissionActionState,
  formData: FormData,
): Promise<OrganizationCommissionActionState> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const usePlanDefault = formData.get("usePlanDefault") === "true";
  const percent = Number(formData.get("overridePercent"));
  const reason = String(formData.get("reason") ?? "").trim();
  const confirmed = formData.get("confirmed") === "true";
  if (
    !organizationId ||
    (!usePlanDefault &&
      (!Number.isFinite(percent) || percent < 0 || percent > 25)) ||
    reason.length < 10 ||
    !confirmed
  ) {
    return {
      status: "error",
      message:
        "Choose the plan default or a rate from 0% to 25%, add a reason of at least 10 characters, and confirm the change.",
    };
  }
  try {
    const caller = await getServerCaller();
    const policy = await caller.admin.updateOrganizationCommission({
      organizationId,
      usePlanDefault,
      overrideRateBps: usePlanDefault ? undefined : Math.round(percent * 100),
      reason,
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath(`/admin/organizations/${organizationId}`);
    revalidatePath("/admin/organizations");
    return {
      status: "success",
      message: `Organization fee is now ${policy.rateBps / 100}% (${policy.source.replace("-", " ")}). Stripe metadata is ${policy.stripeSyncStatus}.`,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "The organization fee could not be updated.",
    };
  }
}

export async function updatePredictionMarketRulesAction(
  _previous: PredictionAdminActionState,
  formData: FormData,
): Promise<PredictionAdminActionState> {
  const marketId = String(formData.get("marketId") ?? "");
  const resolutionCriteria = String(
    formData.get("resolutionCriteria") ?? "",
  ).trim();
  const resolutionSource = String(
    formData.get("resolutionSource") ?? "",
  ).trim();
  const closePolicy = String(formData.get("closePolicy") ?? "").trim();
  const publicNote = String(formData.get("publicNote") ?? "").trim();
  const locksAtSource = String(formData.get("locksAt") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const confirmed = formData.get("confirmed") === "true";
  const locksAt = locksAtSource ? new Date(locksAtSource) : null;
  if (
    !marketId ||
    resolutionCriteria.length < 12 ||
    resolutionSource.length < 5 ||
    closePolicy.length < 12 ||
    reason.length < 5 ||
    !confirmed ||
    (locksAt && Number.isNaN(locksAt.getTime()))
  ) {
    return {
      status: "error",
      message:
        "Complete the resolution, source, close policy, change reason, and confirmation.",
    };
  }
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.updatePredictionMarketRules({
      marketId,
      resolutionCriteria,
      resolutionSource,
      closePolicy,
      publicNote: publicNote || undefined,
      locksAt: locksAt?.toISOString() ?? null,
      reason,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/admin/predictions");
    return {
      status: "success",
      message: `Rule version ${result.version} is now active and audit-recorded.`,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Market rules were not saved.",
    };
  }
}

export async function setPredictionMarketTradingStatusAction(
  _previous: PredictionAdminActionState,
  formData: FormData,
): Promise<PredictionAdminActionState> {
  const marketId = String(formData.get("marketId") ?? "");
  const action = String(formData.get("action") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const confirmed = formData.get("confirmed") === "true";
  if (
    !marketId ||
    !["lock", "reopen"].includes(action) ||
    reason.length < 5 ||
    !confirmed
  ) {
    return {
      status: "error",
      message:
        "Add an operator reason and confirm the exact trading-state change.",
    };
  }
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.setPredictionMarketTradingStatus({
      marketId,
      action: action as "lock" | "reopen",
      reason,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/admin/predictions");
    return {
      status: "success",
      message: `Market is now ${result.status}.`,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "The market status could not be changed.",
    };
  }
}

export async function determinePredictionMarketAction(
  _previous: PredictionAdminActionState,
  formData: FormData,
): Promise<PredictionAdminActionState> {
  const marketId = String(formData.get("marketId") ?? "");
  const resolvedSide = String(formData.get("resolvedSide") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const confirmed = formData.get("confirmed") === "true";
  if (
    !marketId ||
    !["yes", "no"].includes(resolvedSide) ||
    reason.length < 5 ||
    !confirmed
  ) {
    return {
      status: "error",
      message:
        "Choose the verified outcome, document the source, and confirm settlement.",
    };
  }
  try {
    const caller = await getServerCaller();
    const result = await caller.admin.settlePredictionMarket({
      marketId,
      resolvedSide: resolvedSide as "yes" | "no",
      reason,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/admin/predictions");
    return {
      status: "success",
      message: result.settled
        ? "Market is Determined. Orders closed and positions settled."
        : "Market was already determined to this outcome.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "The market could not be determined.",
    };
  }
}
