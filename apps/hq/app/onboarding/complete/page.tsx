import { randomUUID } from "node:crypto";
import {
  ORGANIZATION_PLANS,
  ORGANIZATION_VIDEO_ADD_ONS,
  type PaidOrganizationPlanId,
} from "@duna/core";
import { ArrowRight, Check, CreditCard, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { getServerCaller } from "@/lib/api";

const paidPlans = new Set<PaidOrganizationPlanId>(["small-club", "club"]);

function hqUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_HQ_URL?.replace(/\/$/, "") ??
    "https://hq.duna.coach";
  return `${base}${path}`;
}

async function continueToStripe(formData: FormData) {
  "use server";

  const plan = String(formData.get("plan") ?? "") as PaidOrganizationPlanId;
  const idempotencyKey = String(formData.get("checkoutId") ?? "");
  if (!paidPlans.has(plan)) redirect("/");
  const caller = await getServerCaller();
  const checkout = await caller.operator.startPlanCheckout({
    plan,
    interval: "month",
    uploadPackQuantity: Number(formData.get("uploadPackQuantity") ?? 0),
    livePackQuantity: Number(formData.get("livePackQuantity") ?? 0),
    payAsYouGo: formData.get("payAsYouGo") === "on",
    successUrl: hqUrl("/onboarding/complete?billing=success"),
    cancelUrl: hqUrl(
      `/onboarding/complete?billing=cancelled&plan=${plan}&checkoutId=${idempotencyKey}`,
    ),
    idempotencyKey,
  });
  if (!checkout.url) throw new Error("Stripe did not return a checkout URL.");
  redirect(checkout.url);
}

export default async function CompleteOnboardingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    billing?: string;
    checkoutId?: string;
    plan?: string;
  }>;
}) {
  const query = await searchParams;
  if (query.billing === "success") redirect("/");
  const plan = query.plan as PaidOrganizationPlanId;
  if (!paidPlans.has(plan) || !query.checkoutId) redirect("/");
  const definition = ORGANIZATION_PLANS[plan];
  const checkoutId =
    query.billing === "cancelled" ? randomUUID() : query.checkoutId;

  return (
    <main className="auth-page">
      <section className="organization-onboarding onboarding-checkout-card">
        <span className="onboarding-checkout-card__icon">
          <Check aria-hidden size={26} />
        </span>
        <div>
          <span className="hq-eyebrow">Workspace created</span>
          <h1>Finish {definition.productName}.</h1>
          <p>
            Your organization and owner account are ready. Complete secure
            Stripe checkout to activate the lower organization transaction fee
            and expanded video allowance.
          </p>
        </div>
        <article>
          <span>{definition.name}</span>
          <strong>
            ${(definition.monthlyPriceMinor / 100).toLocaleString("en-US")}
            <small> / month</small>
          </strong>
          <ul>
            {definition.features.slice(0, 4).map((feature) => (
              <li key={feature}>
                <Check aria-hidden size={14} /> {feature}
              </li>
            ))}
          </ul>
        </article>
        {query.billing === "cancelled" && (
          <p className="workspace-onboarding-error" role="alert">
            Checkout was cancelled. Your workspace is safe and still uses Free
            plan economics until billing succeeds.
          </p>
        )}
        <form action={continueToStripe}>
          <input name="plan" type="hidden" value={plan} />
          <input name="checkoutId" type="hidden" value={checkoutId} />
          <fieldset className="onboarding-video-options">
            <legend>Optional video capacity</legend>
            <label>
              <span>10 upload-hour packs</span>
              <input
                defaultValue="0"
                max="100"
                min="0"
                name="uploadPackQuantity"
                type="number"
              />
              <small>
                ${ORGANIZATION_VIDEO_ADD_ONS.upload.monthlyPriceMinor / 100}
                /month each
              </small>
            </label>
            <label>
              <span>2 live-hour packs</span>
              <input
                defaultValue="0"
                max="100"
                min="0"
                name="livePackQuantity"
                type="number"
              />
              <small>
                ${ORGANIZATION_VIDEO_ADD_ONS.live.monthlyPriceMinor / 100}/month
                each
              </small>
            </label>
            <label className="onboarding-video-options__payg">
              <input name="payAsYouGo" type="checkbox" />
              <span>
                Keep recording after the allowance and bill exact overage.
              </span>
            </label>
          </fieldset>
          <button className="hq-button hq-button--primary" type="submit">
            <CreditCard aria-hidden size={17} /> Continue securely with Stripe
            <ArrowRight aria-hidden size={16} />
          </button>
        </form>
        <small className="onboarding-checkout-card__security">
          <ShieldCheck aria-hidden size={15} /> Duna never handles your card
          details directly.
        </small>
      </section>
    </main>
  );
}
