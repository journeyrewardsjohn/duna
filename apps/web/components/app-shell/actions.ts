"use server";

import { DUNA_ORGANIZATION_CONTEXT_COOKIE } from "@duna/api";
import { log } from "@duna/observability";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getServerCaller } from "@/lib/api";
import { ACTING_FOR_COOKIE, ACTING_FOR_MAX_AGE } from "./acting-for";
import { getAppSession } from "./session";

/** Makes one of the person's clubs the active one (the club switcher). */
export async function switchPlayerOrganization(
  organizationId: string,
): Promise<{ readonly organizationId: string }> {
  const caller = await getServerCaller();
  const selection = await caller.player.validateOrganizationSelection({
    organizationId,
  });
  const cookieStore = await cookies();
  cookieStore.set(DUNA_ORGANIZATION_CONTEXT_COOKIE, selection.organizationId, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/app", "layout");
  return selection;
}

export async function selfEnrollPlayerStaff(
  staffRole: "coach" | "director",
): Promise<{ readonly status: string }> {
  const caller = await getServerCaller();
  const result = await caller.player.selfEnrollOrganizationStaff({
    staffRole,
    idempotencyKey: crypto.randomUUID(),
  });
  revalidatePath("/app", "layout");
  return { status: result.status };
}

/**
 * A guardian switches whose account the rebuilt screens show: one of their
 * juniors, or `null` for their own. The junior must be one the guardian
 * manages today (re-read from the guardianship links); anything else is
 * refused and the cookie is cleared.
 */
export async function switchActingFor(
  personId: string | null,
): Promise<{ readonly actingFor: string | null }> {
  const session = await getAppSession();
  const cookieStore = await cookies();
  if (session.state !== "signed-in") {
    throw new Error("Sign in to switch accounts.");
  }
  const dependent = personId
    ? session.dependents.find((candidate) => candidate.personId === personId)
    : undefined;
  if (personId && !dependent) {
    cookieStore.delete(ACTING_FOR_COOKIE);
    log.warn("web.app_shell.acting_for_refused", { outcome: "not-a-junior" });
    throw new Error("You can only act for a junior you are a guardian of.");
  }
  if (dependent) {
    cookieStore.set(ACTING_FOR_COOKIE, dependent.personId, {
      httpOnly: true,
      maxAge: ACTING_FOR_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  } else {
    cookieStore.delete(ACTING_FOR_COOKIE);
  }
  log.info("web.app_shell.acting_for_changed", {
    outcome: dependent ? "junior" : "self",
  });
  revalidatePath("/app", "layout");
  return { actingFor: dependent?.personId ?? null };
}
