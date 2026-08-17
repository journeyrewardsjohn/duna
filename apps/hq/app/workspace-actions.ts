"use server";

import { switchToOrganization, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { canAccessWorkspace } from "@/lib/workspace-options";

function localReturnTo(value: FormDataEntryValue | null): string {
  const candidate = typeof value === "string" ? value : "/";
  return candidate.startsWith("/") && !candidate.startsWith("//")
    ? candidate
    : "/";
}

export async function switchWorkspaceAction(formData: FormData) {
  const { user } = await withAuth();
  if (!user) redirect("/sign-in?returnTo=/");

  const organizationId = String(formData.get("organizationId") ?? "");
  if (!organizationId || !(await canAccessWorkspace(organizationId))) {
    redirect("/onboarding?error=workspace");
  }

  await switchToOrganization(organizationId, {
    returnTo: localReturnTo(formData.get("returnTo")),
  });
}
