"use client";

import {
  Archive,
  Check,
  CircleAlert,
  RotateCcw,
  ToggleLeft,
} from "lucide-react";
import { useActionState } from "react";
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
  const isArchived = item.status === "archived";

  return (
    <section className="hq-card product-lifecycle-controls">
      <header className="hq-card-heading">
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
        <Archive aria-hidden size={24} />
      </header>
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
                className="catalog-archive-button"
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
