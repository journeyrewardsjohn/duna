"use client";

import type { PublicCatalogItem, WaiverRequirement } from "@duna/api";
import { DUNA_SERVICE_FEE_BPS } from "@duna/core";
import {
  Banknote,
  Check,
  CreditCard,
  Minus,
  Plus,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  catalogOfferEligibilityAction,
  catalogCheckoutStatusAction,
  startCatalogCheckoutAction,
} from "@/app/clubs/[slug]/products/[productSlug]/actions";
import { WaiverSignaturePanel } from "./waiver-signature-panel";

function money(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

export function CatalogCheckoutPanel({
  item,
  organization,
  isMember,
  walletCredits,
  membershipIncluded,
  membershipRemainingBookings,
  dunaServiceFeeWaived,
  initialCheckoutSessionId,
  initialMembershipCheckoutSessionId,
  initialNotice,
  membershipOffers,
  itemWaiverRequirements,
  membershipWaiverRequirements = [],
}: {
  readonly item: PublicCatalogItem;
  readonly organization: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly currency: string;
    readonly paymentsReady: boolean;
  };
  readonly isMember: boolean;
  readonly walletCredits: number;
  readonly membershipIncluded?: boolean;
  readonly membershipRemainingBookings?: number;
  readonly dunaServiceFeeWaived: boolean;
  readonly initialCheckoutSessionId?: string;
  readonly initialMembershipCheckoutSessionId?: string;
  readonly initialNotice?: string;
  readonly membershipOffers: readonly PublicCatalogItem[];
  readonly itemWaiverRequirements: readonly WaiverRequirement[];
  readonly membershipWaiverRequirements?: readonly WaiverRequirement[];
}) {
  const router = useRouter();
  const [variantId, setVariantId] = useState(item.variants[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<
    "card" | "cash" | "credit"
  >(item.allowCard ? "card" : item.allowCredits ? "credit" : "cash");
  const [selectedPriceId, setSelectedPriceId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState(initialNotice);
  const [memberActive, setMemberActive] = useState(isMember);
  const [addMembership, setAddMembership] = useState(true);
  const [complete, setComplete] = useState(false);
  const [completionMode, setCompletionMode] = useState<
    "purchase" | "cash-reservation" | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const idempotencyKey = useRef(crypto.randomUUID());
  const membershipIdempotencyKey = useRef(crypto.randomUUID());
  const membershipOffer = membershipOffers[0];
  const membershipVariant = membershipOffer?.variants[0];
  const membershipPrice =
    membershipVariant?.prices.find(
      (candidate) =>
        candidate.paymentKind === "card" && candidate.audience === "non-member",
    ) ??
    membershipVariant?.prices.find(
      (candidate) =>
        candidate.paymentKind === "card" && candidate.audience === "everyone",
    );
  const variant =
    item.variants.find((candidate) => candidate.id === variantId) ??
    item.variants[0];
  const pricesFor = (method: "card" | "cash" | "credit") => {
    const audience = memberActive ? "member" : "non-member";
    const audiencePrices =
      variant?.prices.filter(
        (candidate) =>
          candidate.paymentKind === method && candidate.audience === audience,
      ) ?? [];
    return audiencePrices.length > 0
      ? audiencePrices
      : (variant?.prices.filter(
          (candidate) =>
            candidate.paymentKind === method &&
            candidate.audience === "everyone",
        ) ?? []);
  };
  const cardPrices = pricesFor("card");
  const cashPrices = pricesFor("cash");
  const creditPrices = pricesFor("credit");
  const cardPrice =
    cardPrices.find((candidate) => candidate.id === selectedPriceId) ??
    cardPrices[0];
  const cashPrice = cashPrices[0];
  const creditPrice = creditPrices[0];
  const price =
    paymentMethod === "card"
      ? cardPrice
      : paymentMethod === "credit"
        ? creditPrice
        : cashPrice;
  const monetaryTotal = membershipIncluded
    ? 0
    : (price?.amountMinor ?? 0) * quantity;
  const dunaServiceFeeEligible =
    paymentMethod === "card" && item.type !== "good" && monetaryTotal > 0;
  const dunaServiceFeeMinor =
    dunaServiceFeeEligible && !dunaServiceFeeWaived
      ? Math.round((monetaryTotal * DUNA_SERVICE_FEE_BPS) / 10_000)
      : 0;
  const checkoutTotal = monetaryTotal + dunaServiceFeeMinor;
  const creditTotal = membershipIncluded
    ? 0
    : (price?.creditAmount ?? 0) * quantity;
  const requiresMembership =
    item.membershipRequired || item.visibility === "members";
  const tracksInventory =
    item.type === "good" && item.configuration.inventoryTracked !== false;
  const available =
    !tracksInventory || (variant?.availableQuantity ?? 0) >= quantity;
  const canPurchase =
    Boolean(variant && price) &&
    available &&
    (!requiresMembership || memberActive) &&
    (paymentMethod !== "card" || organization.paymentsReady) &&
    (paymentMethod !== "credit" || walletCredits >= creditTotal) &&
    itemWaiverRequirements.every((requirement) => requirement.complete);
  const membershipStep = requiresMembership && !memberActive;
  const canStartMembership = Boolean(
    addMembership &&
    membershipOffer &&
    membershipVariant &&
    membershipPrice &&
    organization.paymentsReady &&
    membershipWaiverRequirements.every((requirement) => requirement.complete),
  );

  useEffect(() => {
    if (!initialCheckoutSessionId) return;
    let cancelled = false;
    startTransition(async () => {
      const response = await catalogCheckoutStatusAction(
        initialCheckoutSessionId,
      );
      if (cancelled) return;
      if (response.ok && response.status.complete) {
        setComplete(true);
        setCompletionMode("purchase");
        setNotice(
          "Purchase confirmed. It is now visible in your Duna account.",
        );
      } else if (response.ok) {
        setNotice("Payment received. Duna is finishing fulfillment.");
      } else {
        setNotice(response.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initialCheckoutSessionId]);

  useEffect(() => setMemberActive(isMember), [isMember]);

  useEffect(() => {
    if (!initialMembershipCheckoutSessionId) return;
    let cancelled = false;
    startTransition(async () => {
      const payment = await catalogCheckoutStatusAction(
        initialMembershipCheckoutSessionId,
      );
      if (cancelled) return;
      if (!payment.ok) {
        setNotice(payment.error);
        return;
      }
      setNotice("Membership paid. Activating your club access…");
      for (let attempt = 0; attempt < 18 && !cancelled; attempt += 1) {
        const response = await catalogOfferEligibilityAction(item.id);
        if (response.ok && response.eligibility.isMember) {
          setMemberActive(true);
          setNotice("Membership active. Choose your option below to continue.");
          return;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, attempt < 5 ? 650 : 1_100),
        );
      }
      if (!cancelled) {
        setNotice(
          "Your membership is paid and still activating. Refresh this page in a moment to continue.",
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initialMembershipCheckoutSessionId, item.id]);

  const startMembershipCheckout = () => {
    if (!membershipOffer || !membershipVariant || !membershipPrice) return;
    setNotice(undefined);
    startTransition(async () => {
      const response = await startCatalogCheckoutAction({
        organizationSlug: organization.slug,
        productSlug: membershipOffer.slug,
        returnProductSlug: item.slug,
        checkoutRole: "membership",
        catalogItemId: membershipOffer.id,
        catalogVariantId: membershipVariant.id,
        catalogPriceId: membershipPrice.id,
        paymentMethod: "card",
        quantity: 1,
        idempotencyKey: membershipIdempotencyKey.current,
      });
      if (!response.ok) {
        setNotice(response.error);
        membershipIdempotencyKey.current = crypto.randomUUID();
        return;
      }
      if (response.result.checkoutUrl) {
        window.location.assign(response.result.checkoutUrl);
        return;
      }
      setNotice("Membership added. You can continue with this purchase.");
      setMemberActive(true);
      membershipIdempotencyKey.current = crypto.randomUUID();
    });
  };

  const startCheckout = () => {
    if (!variant || !canPurchase) return;
    setNotice(undefined);
    startTransition(async () => {
      const response = await startCatalogCheckoutAction({
        organizationSlug: organization.slug,
        productSlug: item.slug,
        catalogItemId: item.id,
        catalogVariantId: variant.id,
        catalogPriceId: price?.id,
        paymentMethod,
        quantity,
        idempotencyKey: idempotencyKey.current,
      });
      if (!response.ok) {
        setNotice(response.error);
        idempotencyKey.current = crypto.randomUUID();
        return;
      }
      if (response.result.checkoutUrl) {
        window.location.assign(response.result.checkoutUrl);
        return;
      }
      setComplete(true);
      setCompletionMode(
        response.result.mode === "cash-reservation"
          ? "cash-reservation"
          : "purchase",
      );
      setNotice(
        response.result.mode === "organization-credit"
          ? `${response.result.creditsApplied} ${organization.name} credits applied.`
          : response.result.mode === "cash-reservation"
            ? `Reservation recorded. Pay ${organization.name} in person within 24 hours to keep it active.`
            : "Purchase confirmed.",
      );
      idempotencyKey.current = crypto.randomUUID();
    });
  };

  return (
    <aside className="catalog-checkout-panel">
      <header>
        <span>Choose your option</span>
        {(complete || membershipIncluded) && (
          <small className="catalog-checkout-state">
            {complete
              ? completionMode === "cash-reservation"
                ? "Reserved"
                : "Confirmed"
              : "Included"}
          </small>
        )}
      </header>
      {membershipIncluded && (
        <div className="catalog-membership-benefit">
          <Check size={18} />
          <span>
            <strong>No payment needed.</strong>
            <small>
              This booking is included in your active membership
              {membershipRemainingBookings !== undefined
                ? ` · ${membershipRemainingBookings} left this cycle`
                : ""}
              .
            </small>
          </span>
        </div>
      )}
      {(membershipStep
        ? membershipWaiverRequirements
        : itemWaiverRequirements
      ).some((requirement) => !requirement.complete) && (
        <WaiverSignaturePanel
          onSigned={() => router.refresh()}
          organizationId={organization.id}
          requirements={
            membershipStep
              ? membershipWaiverRequirements
              : itemWaiverRequirements
          }
        />
      )}
      {item.variants.length > 1 && (
        <label>
          <span>Choose an option</span>
          <select
            onChange={(event) => {
              setVariantId(event.target.value);
              setSelectedPriceId("");
            }}
            value={variant?.id}
          >
            {item.variants.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {!membershipIncluded &&
        paymentMethod === "card" &&
        cardPrices.length > 1 && (
          <div className="catalog-billing-options">
            <span>Choose billing</span>
            <div>
              {cardPrices.map((candidate) => {
                const active = candidate.id === cardPrice?.id;
                const interval =
                  candidate.recurringInterval === "year"
                    ? "Annual"
                    : candidate.recurringInterval === "month"
                      ? "Monthly"
                      : "Pay once";
                return (
                  <button
                    className={active ? "active" : ""}
                    key={candidate.id}
                    onClick={() => setSelectedPriceId(candidate.id)}
                    type="button"
                  >
                    <span>
                      <strong>{interval}</strong>
                      <small>
                        {money(
                          candidate.amountMinor ?? 0,
                          candidate.currency ?? organization.currency,
                        )}
                        {candidate.recurringInterval
                          ? ` / ${candidate.recurringInterval}`
                          : ""}
                      </small>
                    </span>
                    <i aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      {!membershipIncluded && (
        <div className="catalog-payment-methods">
          {item.allowCard && (
            <button
              className={paymentMethod === "card" ? "active" : ""}
              onClick={() => setPaymentMethod("card")}
              type="button"
            >
              <CreditCard size={18} />
              <span>
                <strong>Card</strong>
                <small>
                  {cardPrice?.amountMinor !== undefined
                    ? money(
                        cardPrice?.amountMinor ?? 0,
                        cardPrice?.currency ?? organization.currency,
                      )
                    : "Online"}
                </small>
              </span>
            </button>
          )}
          {item.allowCredits && (
            <button
              className={paymentMethod === "credit" ? "active" : ""}
              onClick={() => setPaymentMethod("credit")}
              type="button"
            >
              <WalletCards size={18} />
              <span>
                <strong>{organization.name} credits</strong>
                <small>{walletCredits} available</small>
              </span>
            </button>
          )}
          {item.allowCash && (
            <button
              className={paymentMethod === "cash" ? "active" : ""}
              onClick={() => setPaymentMethod("cash")}
              type="button"
            >
              <Banknote size={18} />
              <span>
                <strong>Cash</strong>
                <small>
                  {cashPrice?.amountMinor !== undefined
                    ? money(
                        cashPrice.amountMinor,
                        cashPrice.currency ?? organization.currency,
                      )
                    : "Pay in person"}
                </small>
              </span>
            </button>
          )}
        </div>
      )}
      {membershipStep && (
        <button
          aria-checked={addMembership}
          className={`catalog-membership-add ${addMembership ? "active" : ""}`}
          onClick={() => setAddMembership((current) => !current)}
          role="checkbox"
          type="button"
        >
          <span className="catalog-membership-check">
            {addMembership && <Check size={16} />}
          </span>
          <span>
            <strong>
              Add {membershipOffer?.title ?? `${organization.name} membership`}
            </strong>
            <small>
              Required for this purchase
              {membershipPrice?.amountMinor !== undefined
                ? ` · ${money(
                    membershipPrice.amountMinor,
                    membershipPrice.currency ?? organization.currency,
                  )}${
                    membershipPrice.recurringInterval
                      ? ` / ${membershipPrice.recurringInterval}`
                      : ""
                  }`
                : ""}
            </small>
          </span>
        </button>
      )}
      {item.type === "good" && (
        <div className="catalog-quantity">
          <span>
            <strong>Quantity</strong>
            <small>
              {tracksInventory
                ? `${variant?.availableQuantity ?? 0} available`
                : "Prepared after purchase"}
            </small>
          </span>
          <div>
            <button
              aria-label="Decrease quantity"
              disabled={quantity <= 1}
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              type="button"
            >
              <Minus size={15} />
            </button>
            <strong>{quantity}</strong>
            <button
              aria-label="Increase quantity"
              disabled={
                quantity >=
                (tracksInventory
                  ? Math.min(50, variant?.availableQuantity ?? 0)
                  : 50)
              }
              onClick={() => setQuantity((current) => current + 1)}
              type="button"
            >
              <Plus size={15} />
            </button>
          </div>
        </div>
      )}
      <div className="catalog-checkout-total">
        <span>
          {membershipIncluded
            ? "Member benefit"
            : dunaServiceFeeEligible
              ? dunaServiceFeeWaived
                ? "Total · Premium fee waiver"
                : "Total · includes 7.5% Duna fee"
              : "Total"}
        </span>
        <strong>
          {membershipIncluded
            ? "Included"
            : paymentMethod === "credit"
              ? `${creditTotal} credits`
              : money(checkoutTotal, price?.currency ?? organization.currency)}
        </strong>
      </div>
      {notice && (
        <p className={complete ? "catalog-checkout-success" : ""} role="status">
          {complete && <Check size={16} />}
          {notice}
        </p>
      )}
      <button
        className="catalog-checkout-button"
        disabled={
          (membershipStep ? !canStartMembership : !canPurchase) ||
          isPending ||
          complete
        }
        onClick={membershipStep ? startMembershipCheckout : startCheckout}
        type="button"
      >
        {isPending
          ? "Preparing…"
          : complete
            ? completionMode === "cash-reservation"
              ? "Reserved"
              : "Purchased"
            : membershipIncluded
              ? "Book with membership"
              : membershipStep
                ? "Add membership, then continue"
                : paymentMethod === "cash"
                  ? "Reserve · pay in person"
                  : paymentMethod === "credit"
                    ? `Use ${creditTotal} credits`
                    : "Continue to payment"}
      </button>
      {paymentMethod === "cash" && (
        <p>
          Duna records a 24-hour reservation. Pay {organization.name} directly
          in person; the organization confirms the payment.
        </p>
      )}
      {!canPurchase &&
        paymentMethod === "credit" &&
        walletCredits < creditTotal && (
          <p>
            You need {creditTotal - walletCredits} more {organization.name}{" "}
            credits.
          </p>
        )}
      {membershipStep && !membershipOffer && (
        <p>
          {organization.name} needs to publish a membership before this product
          can be purchased.
        </p>
      )}
      <p className="catalog-payment-expectation">
        {paymentMethod === "card"
          ? "Pay by card, Link, or a saved payment method."
          : paymentMethod === "credit"
            ? `${organization.name} credits stay with this club.`
            : `Reserve now; ${organization.name} collects payment in person.`}
      </p>
      <Link
        className="catalog-sign-in-link"
        href={`/sign-in?returnTo=${encodeURIComponent(
          `/clubs/${organization.slug}/products/${item.slug}`,
        )}`}
      >
        Sign in to keep this purchase with your Duna account
      </Link>
    </aside>
  );
}
