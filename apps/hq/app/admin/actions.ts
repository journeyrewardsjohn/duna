"use server";

import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";

export interface GuardianReviewActionState {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
}

export type FeatureFlagActionState = GuardianReviewActionState;

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
