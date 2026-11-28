"use client";

import type { OperatorWorkspace } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { Check, CircleAlert, ShieldCheck } from "lucide-react";
import { useActionState, type ReactNode } from "react";
import {
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
