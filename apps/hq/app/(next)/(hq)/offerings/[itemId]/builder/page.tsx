import { hqHref } from "@duna/core/hq-routes";
import { redirect } from "next/navigation";

/** The old builder address opens the offering, where every section edits in place. */
export default async function OfferingBuilderPage({
  params,
}: {
  readonly params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  redirect(hqHref("offering", { itemId }));
}
