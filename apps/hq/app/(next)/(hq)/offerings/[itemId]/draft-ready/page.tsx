import { hqHref } from "@duna/core/hq-routes";
import { redirect } from "next/navigation";

/** The old "draft saved" address opens the offering (Publish is in its header). */
export default async function OfferingDraftReadyPage({
  params,
}: {
  readonly params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  redirect(hqHref("offering", { itemId }));
}
