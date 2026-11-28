import { randomUUID } from "node:crypto";
import {
  ORGANIZATION_PLANS,
  ORGANIZATION_VIDEO_ADD_ONS,
  formatMoney,
  type PaidOrganizationPlanId,
} from "@duna/core";
import { Notice } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/setup/checkout-form";
import { normaliseWebsiteInput } from "@/components/setup/setup-model";
import { getServerCaller } from "@/lib/api";

export const metadata: Metadata = { title: "Finish your plan" };

const paidPlans = new Set<PaidOrganizationPlanId>(["small-club", "club"]);

function hqUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_HQ_URL?.replace(/\/$/, "") ??
    "https://hq.duna.coach";
  return `${base}${path}`;
}

/** Goes to secure checkout for the paid plan; returns to the first run. */
async function continueToCheckout(formData: FormData) {
  "use server";
  const plan = String(formData.get("plan") ?? "") as PaidOrganizationPlanId;
  const idempotencyKey = String(formData.get("checkoutId") ?? "");
  const interval = formData.get("interval") === "year" ? "year" : "month";
  const website = String(formData.get("website") ?? "");
  if (!paidPlans.has(plan)) redirect("/setup/start");
  const caller = await getServerCaller();
  const next = website ? `&website=${encodeURIComponent(website)}` : "";
  const checkout = await caller.operator.startPlanCheckout({
    plan,
    interval,
    uploadPackQuantity: Number(formData.get("uploadPackQuantity") ?? 0),
    livePackQuantity: Number(formData.get("livePackQuantity") ?? 0),
    payAsYouGo: formData.get("payAsYouGo") === "on",
    successUrl: hqUrl(`/setup/start/complete?billing=success${next}`),
    cancelUrl: hqUrl(
      `/setup/start/complete?billing=cancelled&plan=${plan}&interval=${interval}&checkoutId=${idempotencyKey}${next}`,
    ),
    idempotencyKey,
  });
  if (!checkout.url) throw new Error("Checkout did not return an address.");
  redirect(checkout.url);
}

/**
 * After creating a club on a paid plan: optional video capacity, then secure
 * checkout. The club already exists and runs on the free plan's terms until
 * checkout succeeds; then the first run continues.
 */
export default async function FinishPlanPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    billing?: string;
    checkoutId?: string;
    plan?: string;
    interval?: string;
    website?: string;
  }>;
}) {
  const query = await searchParams;
  const website = query.website
    ? normaliseWebsiteInput(query.website)
    : undefined;
  const firstRun = `/setup/start${website ? `?website=${encodeURIComponent(website)}` : ""}`;
  if (query.billing === "success") redirect(firstRun);
  const plan = query.plan as PaidOrganizationPlanId;
  if (!paidPlans.has(plan) || !query.checkoutId) redirect(firstRun);
  const definition = ORGANIZATION_PLANS[plan];
  const checkoutId =
    query.billing === "cancelled" ? randomUUID() : query.checkoutId;
  const interval = query.interval === "year" ? "year" : "month";
  return (
    <div className="setup-first">
      <header className="setup-first__head">
        <h1 className="td-display setup-first__title">
          Finish {definition.productName}
        </h1>
        <p className="setup-first__lead">
          Your club is ready. Checkout turns on the lower fee and the larger
          video allowance.
        </p>
      </header>
      {query.billing === "cancelled" ? (
        <Notice role="alert" title="Checkout was cancelled" tone="warning">
          Your club is safe and runs on the free plan&apos;s terms until
          checkout succeeds.
        </Notice>
      ) : null}
      <CheckoutForm
        action={continueToCheckout}
        checkoutId={checkoutId}
        interval={interval}
        livePack={formatMoney(
          ORGANIZATION_VIDEO_ADD_ONS.live.monthlyPriceMinor,
          "USD",
        )}
        plan={plan}
        planName={definition.name}
        price={formatMoney(
          interval === "year"
            ? definition.annualPriceMinor
            : definition.monthlyPriceMinor,
          "USD",
        )}
        uploadPack={formatMoney(
          ORGANIZATION_VIDEO_ADD_ONS.upload.monthlyPriceMinor,
          "USD",
        )}
        website={website ?? ""}
        features={definition.features.slice(0, 4)}
      />
    </div>
  );
}
