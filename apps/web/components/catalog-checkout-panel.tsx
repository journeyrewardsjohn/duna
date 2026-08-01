"use client";

import type { PublicCatalogItem } from "@duna/api";
import { Badge } from "@duna/ui";
import {
  Banknote,
  Check,
  CreditCard,
  Minus,
  Plus,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  catalogCheckoutStatusAction,
  startCatalogCheckoutAction,
} from "@/app/clubs/[slug]/products/[productSlug]/actions";

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
  initialCheckoutSessionId,
  initialNotice,
}: {
  readonly item: PublicCatalogItem;
  readonly organization: {
    readonly slug: string;
    readonly name: string;
    readonly currency: string;
    readonly paymentsReady: boolean;
  };
  readonly isMember: boolean;
  readonly walletCredits: number;
  readonly initialCheckoutSessionId?: string;
  readonly initialNotice?: string;
}) {
  const [variantId, setVariantId] = useState(item.variants[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState<
    "card" | "cash" | "credit"
  >(item.allowCard ? "card" : item.allowCredits ? "credit" : "cash");
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState(initialNotice);
  const [complete, setComplete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const idempotencyKey = useRef(crypto.randomUUID());
  const variant =
    item.variants.find((candidate) => candidate.id === variantId) ??
    item.variants[0];
  const priceFor = (method: "card" | "cash" | "credit") =>
    [isMember ? "member" : "non-member", "everyone"]
      .map((audience) =>
        variant?.prices.find(
          (candidate) =>
            candidate.paymentKind === method && candidate.audience === audience,
        ),
      )
      .find(Boolean);
  const cardPrice = priceFor("card");
  const cashPrice = priceFor("cash");
  const creditPrice = priceFor("credit");
  const price =
    paymentMethod === "card"
      ? cardPrice
      : paymentMethod === "credit"
        ? creditPrice
        : cashPrice;
  const monetaryTotal = (price?.amountMinor ?? 0) * quantity;
  const creditTotal = (price?.creditAmount ?? 0) * quantity;
  const requiresMembership =
    item.membershipRequired || item.visibility === "members";
  const available =
    item.type !== "good" || (variant?.availableQuantity ?? 0) >= quantity;
  const canPurchase =
    Boolean(variant && price) &&
    available &&
    (!requiresMembership || isMember) &&
    paymentMethod !== "cash" &&
    (paymentMethod !== "card" || organization.paymentsReady) &&
    (paymentMethod !== "credit" || walletCredits >= creditTotal);

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

  const startCheckout = () => {
    if (!variant || !canPurchase) return;
    setNotice(undefined);
    startTransition(async () => {
      const response = await startCatalogCheckoutAction({
        organizationSlug: organization.slug,
        productSlug: item.slug,
        catalogItemId: item.id,
        catalogVariantId: variant.id,
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
      setNotice(
        response.result.mode === "organization-credit"
          ? `${response.result.creditsApplied} ${organization.name} credits applied.`
          : "Purchase confirmed.",
      );
      idempotencyKey.current = crypto.randomUUID();
    });
  };

  return (
    <aside className="catalog-checkout-panel">
      <header>
        <span>Purchase options</span>
        <Badge tone={complete ? "positive" : "neutral"}>
          {complete ? "Confirmed" : "Secure checkout"}
        </Badge>
      </header>
      {item.variants.length > 1 && (
        <label>
          <span>Choose an option</span>
          <select
            onChange={(event) => setVariantId(event.target.value)}
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
      {item.type === "good" && (
        <div className="catalog-quantity">
          <span>
            <strong>Quantity</strong>
            <small>{variant?.availableQuantity ?? 0} available</small>
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
                quantity >= Math.min(50, variant?.availableQuantity ?? 0)
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
        <span>Total</span>
        <strong>
          {paymentMethod === "credit"
            ? `${creditTotal} credits`
            : money(monetaryTotal, price?.currency ?? organization.currency)}
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
        disabled={!canPurchase || isPending || complete}
        onClick={startCheckout}
        type="button"
      >
        {isPending
          ? "Preparing…"
          : complete
            ? "Purchased"
            : paymentMethod === "cash"
              ? "Pay in person"
              : paymentMethod === "credit"
                ? `Use ${creditTotal} credits`
                : "Continue to payment"}
      </button>
      {paymentMethod === "cash" && (
        <p>
          This offer is paid directly to {organization.name}. Contact the
          organization or visit the venue to reserve and pay.
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
      {requiresMembership && !isMember && (
        <p>
          An active {organization.name} membership is required for this product.
        </p>
      )}
      <div className="catalog-checkout-trust">
        <ShieldCheck size={17} />
        <span>
          Card payments stay with Stripe. Cash is recorded by the organization.
          Organization credits are closed-loop and valid only with{" "}
          {organization.name}.
        </span>
      </div>
      <Link
        className="catalog-sign-in-link"
        href={`/sign-in?returnTo=${encodeURIComponent(
          `/clubs/${organization.slug}/products/${item.slug}`,
        )}`}
      >
        Sign in if checkout asks for your Duna account
      </Link>
    </aside>
  );
}
