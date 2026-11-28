"use server";

/**
 * Who can see me, saved in place (Profile and Settings): the person's other
 * profile fields are read on the server and sent unchanged with the new
 * visibility (`updateProfile` takes the whole profile). Juniors stay private
 * by rule (the API refuses anything else for them).
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getAppSession, loadSettings } from "@/components/app-shell/session";
import { getServerCaller } from "@/lib/api";
import type { ActionResult } from "../action-result";
import { demoWithoutDatabase } from "../demo";
import type { Visibility } from "../privacy-model";
import { runAction } from "../server-action";
import { DEMO_VISIBILITY_COOKIE } from "./settings-data";

export async function saveVisibilityAction(
  visibility: Visibility,
): Promise<ActionResult<{ readonly visibility: Visibility }>> {
  return runAction("web.settings.visibility_failed", async () => {
    const session = await getAppSession();
    if (session.junior && visibility !== "private") {
      throw Object.assign(new Error("Players under 18 are private by rule."), {
        code: "FORBIDDEN",
      });
    }
    if (demoWithoutDatabase(session.demo)) {
      (await cookies()).set(DEMO_VISIBILITY_COOKIE, visibility, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
      revalidatePath("/app/profile");
      revalidatePath("/app/settings");
      return { visibility };
    }
    const settings = await loadSettings();
    const profile = settings.profile;
    const caller = await getServerCaller();
    const result = await caller.player.updateProfile({
      displayName: profile.person.displayName,
      handle: profile.person.handle,
      email: profile.email ?? null,
      phoneE164: profile.phoneE164 ?? null,
      homeMarket: profile.person.homeMarket || null,
      visibility,
      locale: profile.locale,
      measurementSystem: profile.measurementSystem,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/app", "layout");
    revalidatePath(`/players/${result.handle}`);
    return { visibility };
  });
}
