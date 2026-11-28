"use client";

import type { OperatorWorkspace } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import {
  Check,
  CircleAlert,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import {
  issueOrganizationCreditsAction,
  refundOrganizationOrderAction,
  updateCommerceSettingsAction,
  type OperatorActionState,
} from "@/app/actions";
import { AddressEntry } from "./place-address-fields";

const initialState: OperatorActionState = { status: "idle", message: "" };

function ActionNotice({ state }: { readonly state: OperatorActionState }) {
  if (state.status === "idle") return null;
  return (
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
  );
}

function SubmitButton({
  pending,
  children,
  secondary,
  disabled,
}: {
  readonly pending: boolean;
  readonly children: ReactNode;
  readonly secondary?: boolean;
  readonly disabled?: boolean;
}) {
  return (
    <button
      className={`hq-button ${
        secondary ? "hq-button--secondary" : "hq-button--primary"
      }`}
      disabled={pending || disabled}
      type="submit"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function MoneyField({
  label,
  name,
  placeholder,
  value,
  onChange,
  helper,
  required,
}: {
  readonly label: string;
  readonly name: string;
  readonly placeholder?: string;
  readonly value?: string;
  readonly onChange?: (value: string) => void;
  readonly helper?: string;
  readonly required?: boolean;
}) {
  return (
    <label>
      <span>{label}</span>
      <span className="operator-money-input">
        <small>$</small>
        <input
          inputMode="decimal"
          min="0"
          name={name}
          onChange={
            onChange ? (event) => onChange(event.target.value) : undefined
          }
          placeholder={placeholder}
          required={required}
          step="0.01"
          type="number"
          value={value}
        />
      </span>
      {helper && <small className="operator-field-helper">{helper}</small>}
    </label>
  );
}

export function PeopleWalletControls({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    issueOrganizationCreditsAction,
    initialState,
  );
  return (
    <section className="hq-card operator-control-card credit-adjustment-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Organization wallet</span>
          <h2>Issue credits</h2>
          <p>
            Credits are usable only with {workspace.organization.name}. Every
            adjustment posts an equal debit and credit to the organization
            subledger.
          </p>
        </div>
        <WalletCards aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Person</span>
            <select
              disabled={workspace.people.length === 0}
              name="personId"
              required
            >
              {workspace.people.map((person) => (
                <option key={person.personId} value={person.personId}>
                  {person.displayName} · {person.creditBalance} credits
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Credits</span>
            <input min="1" name="credits" required type="number" />
          </label>
          <label>
            <span>Expires · optional</span>
            <input name="expiresAt" type="datetime-local" />
          </label>
          <label>
            <span>Reason</span>
            <input
              name="reason"
              placeholder="Service recovery, refund, or manual adjustment"
              required
            />
          </label>
        </div>
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>Post this credit adjustment.</strong>
            This creates an auditable journal and cannot be silently edited.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton
            disabled={workspace.people.length === 0}
            pending={pending}
          >
            Issue credits
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

export function PeopleRefundControls({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const purchases = workspace.people.flatMap((person) =>
    person.recentPurchases
      .filter((purchase) =>
        ["paid", "partially-refunded"].includes(purchase.status),
      )
      .map((purchase) => ({
        ...purchase,
        personName: person.displayName,
      })),
  );
  const [orderId, setOrderId] = useState(purchases[0]?.orderId ?? "");
  const [disposition, setDisposition] = useState<
    "original-payment" | "organization-credit"
  >("original-payment");
  const selected =
    purchases.find((purchase) => purchase.orderId === orderId) ?? purchases[0];
  const [state, action, pending] = useActionState(
    refundOrganizationOrderAction,
    initialState,
  );
  return (
    <section className="hq-card operator-control-card refund-composer">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Purchase care</span>
          <h2>Refund a purchase</h2>
          <p>
            Return funds through the original payment method or issue
            closed-loop organization credits. Duna records the corresponding
            reversal journal.
          </p>
        </div>
        <ReceiptText aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form" key={selected?.orderId}>
        <div className="operator-form-grid operator-form-grid--two">
          <label className="operator-field--wide">
            <span>Purchase</span>
            <select
              disabled={purchases.length === 0}
              name="orderId"
              onChange={(event) => setOrderId(event.target.value)}
              required
              value={selected?.orderId ?? ""}
            >
              {purchases.map((purchase) => (
                <option key={purchase.orderId} value={purchase.orderId}>
                  {purchase.personName} · {purchase.description} ·{" "}
                  {(purchase.amountMinor / 100).toLocaleString("en-US", {
                    style: "currency",
                    currency: purchase.currency,
                  })}
                </option>
              ))}
            </select>
          </label>
          <MoneyField
            label="Refund amount"
            name="amount"
            placeholder={
              selected ? (selected.amountMinor / 100).toFixed(2) : "0.00"
            }
          />
          <label>
            <span>Return as</span>
            <select
              name="disposition"
              onChange={(event) =>
                setDisposition(
                  event.target.value as
                    "original-payment" | "organization-credit",
                )
              }
              value={disposition}
            >
              <option value="original-payment">Original payment</option>
              <option value="organization-credit">Organization credits</option>
            </select>
          </label>
          {disposition === "organization-credit" && (
            <label>
              <span>Credits to issue</span>
              <input min="1" name="credits" required type="number" />
            </label>
          )}
          <label className="operator-field--wide">
            <span>Reason</span>
            <input
              minLength={5}
              name="reason"
              placeholder="Cancellation, service recovery, duplicate charge…"
              required
            />
          </label>
        </div>
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>Review and confirm this refund.</strong>
            Original-payment refunds move real money and cannot be undone from
            Duna.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton disabled={!selected} pending={pending}>
            Submit refund
          </SubmitButton>
        </div>
      </form>
      {purchases.length === 0 && (
        <p className="hq-empty">
          Paid organization purchases will appear here.
        </p>
      )}
    </section>
  );
}

function TaxSettingsEditor({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    updateCommerceSettingsAction,
    initialState,
  );
  return (
    <section className="hq-card operator-control-card" id="tax">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Business + tax location</span>
          <h2>Organization address</h2>
          <p>
            Duna uses this as the fallback taxable location. In-person sales use
            the venue address, and shipped goods use the delivery address.
          </p>
        </div>
        <ShieldCheck aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label className="operator-field--wide">
            <span>Legal business name</span>
            <input
              defaultValue={workspace.organization.legalName}
              name="legalName"
            />
          </label>
          <AddressEntry
            initial={{
              googlePlaceId: workspace.organization.googlePlaceId,
              addressLine1: workspace.organization.addressLine1,
              addressLine2: workspace.organization.addressLine2,
              locality: workspace.organization.locality,
              administrativeArea: workspace.organization.administrativeArea,
              postalCode: workspace.organization.postalCode,
              countryCode: workspace.organization.countryCode,
              latitude: workspace.organization.latitude,
              longitude: workspace.organization.longitude,
            }}
            label="Business address"
            required
          />
        </div>
        <label className="operator-switch">
          <input
            defaultChecked={workspace.organization.stripeTaxEnabled}
            name="stripeTaxEnabled"
            type="checkbox"
            value="true"
          />
          <span>
            <strong>Calculate eligible tax automatically</strong>
            Requires completed payment onboarding and appropriate tax
            registrations.
          </span>
        </label>
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>I checked the legal address.</strong>
            Duna will not register the business for taxes or make legal
            attestations on its behalf.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton pending={pending}>Save business settings</SubmitButton>
        </div>
      </form>
    </section>
  );
}

export function CommerceSettingsControls({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  return (
    <div className="operator-controls-grid">
      <section className="hq-card operator-control-card">
        <span className="hq-eyebrow">Brand</span>
        <h2>Your mark, colours and club page</h2>
        <p>
          The club&apos;s brand and profile now live in Club setup, with
          previews in light and dark.
        </p>
        <a
          className="hq-button hq-button--secondary"
          href={hqHref("setupIdentity")}
        >
          Open club identity
        </a>
      </section>
      <TaxSettingsEditor workspace={workspace} />
    </div>
  );
}
