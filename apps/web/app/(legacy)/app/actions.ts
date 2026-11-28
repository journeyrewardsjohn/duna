"use server";

import { DUNA_ORGANIZATION_CONTEXT_COOKIE } from "@duna/api";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getServerCaller } from "@/lib/api";

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
