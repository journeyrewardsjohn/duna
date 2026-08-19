"use client";

import {
  Archive,
  Check,
  CircleAlert,
  Rocket,
  RotateCcw,
  ToggleLeft,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import {
  setCatalogItemStatusAction,
  type OperatorActionState,
} from "@/app/actions";

const initialState: OperatorActionState = { status: "idle", message: "" };

export function ProductLifecycleControls({
  item,
}: {
  readonly item: {
    readonly id: string;
    readonly status: "draft" | "active" | "archived";
    readonly title: string;
  };
}) {
  const [state, action, pending] = useActionState(
    setCatalogItemStatusAction,
    initialState,
  );
  const router = useRouter();
  const isArchived = item.status === "archived";
  const lifecycle =
    item.status === "active"
      ? {
          label: "Live at checkout",
          detail: "Players can currently discover and purchase this offer.",
        }
      : item.status === "draft"
        ? {
            label: "Private draft",
            detail:
              "This offer is off while you refine its customer experience.",
          }
        : {
            label: "Archived",
            detail:
              "It is kept for records, without appearing in checkout or discovery.",
          };

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return (
    <section
      className="hq-card product-detail-card product-lifecycle-controls"
      data-status={item.status}
    >
      <header className="product-detail-card__header">
        <span className="product-detail-card__icon" aria-hidden>
          <Archive size={19} />
        </span>
        <div>
          <span className="hq-eyebrow">Offer lifecycle</span>
          <h2>
            {isArchived ? "This offer is archived." : "Control availability."}
          </h2>
          <p>
            {isArchived
              ? "It is hidden from checkout and discovery. Its orders, fulfillment, and saved versions remain available."
              : "Turn an offer off while you refine it, or archive it when it should leave the catalog without losing history."}
          </p>
        </div>
      </header>
      <div className="product-lifecycle-controls__status">
        <span className="product-detail-status" data-status={item.status}>
          {lifecycle.label}
        </span>
        <p>{lifecycle.detail}</p>
      </div>
      <div className="product-lifecycle-controls__actions">
        {isArchived ? (
          <form action={action}>
            <input name="catalogItemId" type="hidden" value={item.id} />
            <input name="status" type="hidden" value="draft" />
            <input name="confirmed" type="hidden" value="true" />
            <button
              className="hq-button hq-button--secondary"
              disabled={pending}
              type="submit"
            >
              <RotateCcw aria-hidden size={16} /> Restore as draft
            </button>
          </form>
        ) : (
          <>
            {item.status === "draft" && (
              <form action={action}>
                <input name="catalogItemId" type="hidden" value={item.id} />
                <input name="status" type="hidden" value="active" />
                <input name="confirmed" type="hidden" value="true" />
                <button
                  className="hq-button hq-button--primary"
                  disabled={pending}
                  type="submit"
                >
                  <Rocket aria-hidden size={16} /> Publish Live
                </button>
              </form>
            )}
            {item.status === "active" && (
              <form action={action}>
                <input name="catalogItemId" type="hidden" value={item.id} />
                <input name="status" type="hidden" value="draft" />
                <input name="confirmed" type="hidden" value="true" />
                <button
                  className="hq-button hq-button--secondary"
                  disabled={pending}
                  type="submit"
                >
                  <ToggleLeft aria-hidden size={16} /> Turn off for now
                </button>
              </form>
            )}
            <form action={action}>
              <input name="catalogItemId" type="hidden" value={item.id} />
              <input name="status" type="hidden" value="archived" />
              <input name="confirmed" type="hidden" value="true" />
              <button
                className="product-lifecycle-controls__archive"
                disabled={pending}
                type="submit"
              >
                <Archive aria-hidden size={16} /> Archive offer
              </button>
            </form>
          </>
        )}
      </div>
      {state.status !== "idle" && (
        <p
          className={`operator-action-notice operator-action-notice--${state.status}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.status === "success" ? (
            <Check aria-hidden size={15} />
          ) : (
            <CircleAlert aria-hidden size={15} />
          )}
          {state.message}
        </p>
      )}
    </section>
  );
}
