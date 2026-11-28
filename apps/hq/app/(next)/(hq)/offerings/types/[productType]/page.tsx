import { hqHref } from "@duna/core/hq-routes";
import { redirect } from "next/navigation";

/** The old type pages are in-page filters now (`/offerings?kind=…`). */
export default async function OfferingTypePage({
  params,
}: {
  readonly params: Promise<{ productType: string }>;
}) {
  const { productType } = await params;
  const kind = ["services", "plans", "goods"].includes(productType)
    ? productType
    : undefined;
  redirect(kind ? `${hqHref("offerings")}?kind=${kind}` : hqHref("offerings"));
}
