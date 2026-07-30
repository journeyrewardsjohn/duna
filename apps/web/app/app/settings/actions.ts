"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
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
    if (!checkout.url) throw new Error("Stripe did not return a checkout URL.");
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

export async function requestAccountDeletionAction(reason?: string) {
  try {
    const caller = await getServerCaller();
    const result = await caller.player.requestAccountDeletion({
      reason: reason?.trim() || undefined,
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
