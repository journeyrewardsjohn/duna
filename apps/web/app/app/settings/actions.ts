"use server";

import { processWorkflowJobById } from "@duna/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { getServerCaller } from "@/lib/api";

function applicationOrigin(headersValue: Headers): string {
  const protocol = headersValue.get("x-forwarded-proto") ?? "https";
  const host =
    headersValue.get("x-forwarded-host") ??
    headersValue.get("host") ??
    "localhost:3000";
  return `${protocol}://${host}`;
}

async function origin(): Promise<string> {
  const incoming = await headers();
  const requestHeaders = new Headers();
  incoming.forEach((value, key) => requestHeaders.set(key, value));
  return applicationOrigin(requestHeaders);
}

export async function startDunaPlusAction(interval: "month" | "year") {
  try {
    const baseUrl = await origin();
    const caller = await getServerCaller();
    const checkout = await caller.player.startDunaPlusCheckout({
      interval,
      successUrl: `${baseUrl}/app/settings?membership=success`,
      cancelUrl: `${baseUrl}/app/settings?membership=cancelled`,
      idempotencyKey: crypto.randomUUID(),
    });
    if (!checkout.url) throw new Error("Secure checkout did not return a URL.");
    return { ok: true as const, url: checkout.url };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Duna+ checkout could not start.",
    };
  }
}

export async function openDunaPlusPortalAction() {
  try {
    const baseUrl = await origin();
    const caller = await getServerCaller();
    const portal = await caller.player.openDunaPlusPortal({
      returnUrl: `${baseUrl}/app/settings`,
    });
    return { ok: true as const, url: portal.url };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Billing management is unavailable.",
    };
  }
}

export async function changeDunaPlusAction(
  action: "cancel" | "pause" | "resume",
) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.changeDunaPlusMembership({
      action,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/app/settings");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The membership change could not be completed.",
    };
  }
}

export async function requestAccountDeletionAction(input: {
  readonly reason?: string;
  readonly forfeitOrganizationCredits: boolean;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.requestAccountDeletion({
      reason: input.reason?.trim() || undefined,
      forfeitOrganizationCredits: input.forfeitOrganizationCredits,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/app/settings");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The deletion request could not be queued.",
    };
  }
}

export async function cancelAccountDeletionAction() {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.cancelAccountDeletion({
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/app/settings");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The deletion request could not be cancelled.",
    };
  }
}

export async function updateProfileAction(input: {
  displayName: string;
  handle: string;
  email?: string;
  phoneE164?: string;
  homeMarket?: string;
  visibility: "public" | "members" | "private";
  locale: string;
  measurementSystem: "imperial" | "metric";
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.updateProfile({
      displayName: input.displayName,
      handle: input.handle,
      email: input.email?.trim() || null,
      phoneE164: input.phoneE164?.trim() || null,
      homeMarket: input.homeMarket?.trim() || null,
      visibility: input.visibility,
      locale: input.locale,
      measurementSystem: input.measurementSystem,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/app", "layout");
    revalidatePath(`/players/${result.handle}`);
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Your profile could not be updated.",
    };
  }
}

export async function recordBirthDateAction(birthDate: string) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.recordBirthDate({
      birthDate,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/app", "layout");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Your birth date could not be recorded.",
    };
  }
}

export async function addDependentAction(input: {
  displayName: string;
  birthDate: string;
  relationship: string;
  emergencyContact: boolean;
  canApproveSpending: boolean;
  consentConfirmed: true;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.addDependent({
      ...input,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/app", "layout");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The dependent profile could not be created.",
    };
  }
}

export async function inferPlayingExperienceAction(narrative: string) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.inferPlayingExperience({ narrative });
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Duna could not structure that playing history.",
    };
  }
}

export async function updatePlayingProfileAction(input: {
  subjectPersonId?: string;
  legalGivenName: string;
  legalMiddleName?: string;
  legalFamilyName: string;
  heightMillimeters?: number;
  playingExperience: "amateur" | "high-school" | "collegiate" | "professional";
  playedIndoorPrior: boolean;
  yearsPlaying: number;
  collegeName?: string;
  experienceSummary?: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.updatePlayingProfile({
      ...input,
      legalMiddleName: input.legalMiddleName?.trim() || null,
      heightMillimeters: input.heightMillimeters ?? null,
      collegeName: input.collegeName?.trim() || null,
      experienceSummary: input.experienceSummary?.trim() || null,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/app", "layout");
    revalidatePath("/app/onboarding");
    revalidatePath("/app/settings");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The playing profile could not be saved.",
    };
  }
}

export async function createGuardianInvitationAction(input: {
  subjectPersonId?: string;
  relationship: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.createGuardianInvitation({
      ...input,
      applicationOrigin: await origin(),
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/app", "layout");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The guardian invitation could not be created.",
    };
  }
}

export async function startIdentityVerificationAction() {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.startIdentityVerification({
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/app/settings");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Identity verification could not be started.",
    };
  }
}

export async function connectPlayerSourceAction(input: {
  subjectPersonId?: string;
  source: "volleyball-life" | "bvbinfo";
  profileUrl: string;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.connectPlayerSource({
      ...input,
      idempotencyKey: crypto.randomUUID(),
    });
    after(async () => {
      try {
        await processWorkflowJobById(result.jobId);
      } catch (error) {
        console.error("Player source import failed after queueing", {
          jobId: result.jobId,
          error,
        });
      }
    });
    revalidatePath("/app/onboarding");
    revalidatePath("/app/settings");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The match-history import could not be queued.",
    };
  }
}

export async function reviewPlayerSourceAction(input: {
  connectionId: string;
  decision: "confirmed" | "rejected";
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.reviewPlayerSource({
      ...input,
      idempotencyKey: crypto.randomUUID(),
    });
    if (result.jobId) {
      after(async () => {
        try {
          await processWorkflowJobById(result.jobId!);
        } catch (error) {
          console.error("Confirmed player source import failed", {
            jobId: result.jobId,
            error,
          });
        }
      });
    }
    revalidatePath("/app", "layout");
    revalidatePath("/app/onboarding");
    revalidatePath("/app/settings");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The source profile could not be reviewed.",
    };
  }
}

export async function transferFamilyCreditsAction(input: {
  dependentPersonId: string;
  organizationId: string;
  credits: number;
}) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.transferFamilyCredits({
      ...input,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/app/wallet");
    revalidatePath("/app/settings");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The child wallet could not be funded.",
    };
  }
}

const consentDisclosures = {
  "marketing-email":
    "Duna may send optional email updates about nearby play, programs, product news, and offers. You can turn these emails off at any time.",
  "marketing-sms":
    "Duna may send optional text messages about nearby play, programs, product news, and offers. Message and data rates may apply. Reply STOP to opt out.",
  "marketing-push":
    "Duna may send optional device notifications about nearby play, programs, product news, and offers. You can disable these notifications at any time.",
} as const;

export async function recordMarketingConsentAction(
  scope: keyof typeof consentDisclosures,
  granted: boolean,
) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.recordConsent({
      scope,
      granted,
      disclosureText: consentDisclosures[scope],
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/app/settings");
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The communication preference could not be saved.",
    };
  }
}
