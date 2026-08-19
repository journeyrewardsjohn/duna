"use client";

import type { OperatorWorkspace } from "@duna/api";
import { Badge } from "@duna/ui";
import { Boxes, Check, CircleAlert, PackagePlus } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
  createInventoryStockAction,
  type OperatorActionState,
} from "@/app/actions";

const initialState: OperatorActionState = { status: "idle", message: "" };

function variantLabel(
  variant: OperatorWorkspace["catalog"][number]["variants"][number],
): string {
  const choices = Object.entries(variant.optionCoordinates).map(
    ([name, value]) => `${name.replaceAll("_", " ")}: ${value}`,
  );
  return choices.length > 0 ? choices.join(" · ") : variant.title;
}

export function ProductInventoryReceiver({
  item,
  workspace,
}: {
  readonly item: OperatorWorkspace["catalog"][number];
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    createInventoryStockAction,
    initialState,
  );
  const [variantId, setVariantId] = useState(item.variants[0]?.id ?? "");
  const selectedVariant = item.variants.find(
    (variant) => variant.id === variantId,
  );
  const receipts = useMemo(
    () =>
      workspace.inventory
        .filter((receipt) => receipt.catalogItemId === item.id)
        .toSorted(
          (left, right) =>
            new Date(right.receivedAt).getTime() -
            new Date(left.receivedAt).getTime(),
        ),
    [item.id, workspace.inventory],
  );

  return (
    <section className="hq-card product-detail-card product-inventory-receiver">
      <header className="product-detail-card__header">
        <span className="product-detail-card__icon" aria-hidden>
          <Boxes size={19} />
        </span>
        <div>
          <span className="hq-eyebrow">Inventory · Receive stock</span>
          <h2>Add the exact option that arrived.</h2>
          <p>
            Choose the size, color, style, or other variant first. Each receipt
            remains its own append-only quantity and cost layer.
          </p>
        </div>
      </header>
      <form action={action}>
        <input name="purpose" type="hidden" value="sale" />
        <input name="trackingMode" type="hidden" value="quantity" />
        <input name="reorderPoint" type="hidden" value="0" />
        <input name="condition" type="hidden" value="new" />
        <input name="depreciationMethod" type="hidden" value="none" />
        <div className="product-inventory-receiver__primary">
          <label>
            <span>Which option arrived?</span>
            <select
              name="catalogVariantId"
              onChange={(event) => setVariantId(event.target.value)}
              required
              value={variantId}
            >
              {item.variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variantLabel(variant)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Quantity received</span>
            <input
              defaultValue="1"
              min="1"
              name="quantity"
              required
              type="number"
            />
          </label>
          <label>
            <span>Total receipt cost</span>
            <span className="operator-money-input">
              <small>{workspace.organization.currency}</small>
              <input
                inputMode="decimal"
                min="0"
                name="totalCost"
                placeholder="250.00"
                step="0.01"
                type="number"
              />
            </span>
          </label>
          <label>
            <span>Inventory location</span>
            <select name="inventoryLocationId">
              <option value="">Main inventory</option>
              {workspace.inventoryLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selectedVariant && (
          <p className="product-inventory-receiver__selection">
            <PackagePlus aria-hidden size={17} />
            Receiving <strong>{variantLabel(selectedVariant)}</strong>
          </p>
        )}
        <details className="product-inventory-receiver__details">
          <summary>Add vendor, date, receipt, or notes</summary>
          <div>
            <label>
              <span>Received or purchased</span>
              <input name="acquiredAt" type="date" />
            </label>
            <label>
              <span>Vendor or source</span>
              <input
                name="vendorName"
                placeholder="Wilson, donor, or retailer"
              />
            </label>
            <label>
              <span>Receipt or invoice URL</span>
              <input name="receiptUrl" type="url" />
            </label>
            <label>
              <span>Notes</span>
              <input name="notes" placeholder="Optional receiving note" />
            </label>
          </div>
        </details>
        <div className="product-inventory-receiver__footer">
          <label className="operator-confirmation">
            <input name="confirmed" required type="checkbox" value="true" />
            <span>
              <strong>I checked the option, quantity, and cost.</strong>
              This receipt cannot rewrite an earlier inventory movement.
            </span>
          </label>
          <button
            className="hq-button hq-button--primary"
            disabled={!variantId || pending}
            type="submit"
          >
            <PackagePlus aria-hidden size={16} />
            {pending ? "Receiving…" : "Receive inventory"}
          </button>
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
      </form>
      {receipts.length > 0 && (
        <div className="product-inventory-receiver__history">
          <header>
            <strong>Recent receipts</strong>
            <Badge>{receipts.length} layers</Badge>
          </header>
          {receipts.slice(0, 5).map((receipt) => (
            <article key={receipt.id}>
              <span>
                <strong>{receipt.variantTitle}</strong>
                <small>{receipt.locationName}</small>
              </span>
              <span>
                <small>Received</small>
                <strong>{receipt.quantityReceived}</strong>
              </span>
              <span>
                <small>On hand</small>
                <strong>{receipt.quantityOnHand}</strong>
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
