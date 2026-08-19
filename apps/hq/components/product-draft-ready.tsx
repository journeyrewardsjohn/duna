"use client";

import type { OperatorWorkspace } from "@duna/api";
import {
  CalendarClock,
  Check,
  CircleAlert,
  CircleDollarSign,
  Eye,
  Image as ImageIcon,
  Pencil,
  Rocket,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import {
  setCatalogItemStatusAction,
  type OperatorActionState,
} from "@/app/actions";

const initialState: OperatorActionState = { status: "idle", message: "" };

function moneyLabel(amountMinor: number | undefined, currency: string): string {
  if (amountMinor === undefined) return "Price not set";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

function configurationString(
  configuration: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = configuration[key];
  return typeof value === "string" ? value : undefined;
}

function scheduleLabel(configuration: Record<string, unknown>): string {
  const schedule = configuration.sessionSchedule;
  if (!schedule || typeof schedule !== "object") return "Coach availability";
  const mode = (schedule as Record<string, unknown>).mode;
  if (mode === "recurring") return "Recurring sessions";
  if (mode === "one-off") return "Specific session dates";
  return "Coach availability";
}

export function ProductDraftReady({
  currency,
  currentVersion,
  item,
}: {
  readonly currency: string;
  readonly currentVersion?: number;
  readonly item: OperatorWorkspace["catalog"][number];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    setCatalogItemStatusAction,
    initialState,
  );
  const primaryPrice = item.variants
    .flatMap((variant) => variant.prices)
    .find(
      (price) =>
        price.active &&
        price.paymentKind === "card" &&
        price.amountMinor !== undefined,
    );
  const delivery =
    item.type === "service"
      ? configurationString(item.configuration, "deliveryMode") === "online"
        ? "Online / virtual"
        : "In person"
      : item.type === "plan"
        ? "Customer plan"
        : "Physical product";
  const coachCount = Array.isArray(item.configuration.coachPersonIds)
    ? item.configuration.coachPersonIds.filter(
        (coachId): coachId is string => typeof coachId === "string",
      ).length
    : 0;
  const cover = item.media[0];

  useEffect(() => {
    if (state.status === "success") {
      router.replace(`/products/${item.id}?published=1`);
    }
  }, [item.id, router, state.status]);

  return (
    <main className="hq-page product-draft-ready-page">
      <section className="hq-card product-draft-ready">
        <header className="product-draft-ready__header">
          <span className="product-draft-ready__success-icon" aria-hidden>
            <Check size={24} strokeWidth={2.5} />
          </span>
          <div>
            <span className="hq-eyebrow">Private draft saved</span>
            <h1>Your changes are saved.</h1>
            <p>
              {item.title} is private for now. Review the saved customer-facing
              details below, then publish only when it is ready to appear in
              your catalog.
            </p>
          </div>
        </header>

        <section
          aria-label="Saved draft overview"
          className="product-draft-ready__overview"
        >
          <div className="product-draft-ready__identity">
            <div className="product-draft-ready__media" aria-hidden>
              {cover?.kind === "image" ? (
                <img alt="" src={cover.url} />
              ) : (
                <ImageIcon size={26} />
              )}
            </div>
            <div>
              <span className="product-draft-ready__version">
                {currentVersion
                  ? `Saved version V${currentVersion}`
                  : "Saved private draft"}
              </span>
              <h2>{item.title}</h2>
              <p>{item.shortSummary || "Customer summary not added."}</p>
            </div>
          </div>

          <dl className="product-draft-ready__facts">
            <div>
              <dt>
                <CircleDollarSign aria-hidden size={16} /> Customer price
              </dt>
              <dd>{moneyLabel(primaryPrice?.amountMinor, currency)}</dd>
            </div>
            <div>
              <dt>
                <CalendarClock aria-hidden size={16} /> Delivery
              </dt>
              <dd>{delivery}</dd>
            </div>
            {item.type === "service" && (
              <>
                <div>
                  <dt>
                    <CalendarClock aria-hidden size={16} /> Booking
                  </dt>
                  <dd>{scheduleLabel(item.configuration)}</dd>
                </div>
                <div>
                  <dt>
                    <Users aria-hidden size={16} /> Coaching team
                  </dt>
                  <dd>
                    {coachCount > 0
                      ? `${coachCount} eligible coach${coachCount === 1 ? "" : "es"}`
                      : "All active coaches"}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </section>

        <footer className="product-draft-ready__actions">
          <form action={action}>
            <input name="catalogItemId" type="hidden" value={item.id} />
            <input name="status" type="hidden" value="active" />
            <input name="confirmed" type="hidden" value="true" />
            <button
              className="hq-button hq-button--primary"
              disabled={pending}
              type="submit"
            >
              <Rocket aria-hidden size={17} />
              {pending ? "Publishing…" : "Publish Live"}
            </button>
          </form>
          <Link
            className="hq-button hq-button--secondary"
            href={`/products/${item.id}`}
          >
            <Pencil aria-hidden size={16} /> Edit draft
          </Link>
          <Link className="product-draft-ready__all-products" href="/products">
            <Eye aria-hidden size={16} /> See all products
          </Link>
        </footer>

        {state.status === "error" && (
          <p
            className="operator-action-notice operator-action-notice--error"
            role="alert"
          >
            <CircleAlert aria-hidden size={15} />
            {state.message}
          </p>
        )}
      </section>
    </main>
  );
}
