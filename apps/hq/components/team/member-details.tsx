"use client";

import {
  Button,
  Field,
  Input,
  RadioGroup,
  RadioOption,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateMemberAction } from "@/app/(next)/(hq)/team/actions";
import { unwrap } from "../money/money-action-result";
import {
  type Classification,
  classificationLabel,
  classificationNote,
  firstName,
} from "./team-model";
import { reportFailure } from "./team-report";

interface Address {
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly locality?: string;
  readonly administrativeArea?: string;
  readonly postalCode?: string;
  readonly countryCode: string;
}

/**
 * A member's details on Overview (managers and the owner): the name players
 * see, their classification, pausing and reactivating, and the home address
 * payroll needs. Each change is its own confirmed step.
 */
export function MemberDetails({
  personId,
  displayName,
  classification,
  active,
  isOwner,
  address,
}: {
  readonly personId: string;
  readonly displayName: string;
  readonly classification: Classification;
  readonly active: boolean;
  readonly isOwner: boolean;
  readonly address: Address;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [name, setName] = useState(displayName);
  const [worker, setWorker] = useState<Classification>(classification);
  const [place, setPlace] = useState<Address>(address);
  const first = firstName(displayName);

  const saveName = useAction(
    async ({ idempotencyKey }) =>
      unwrap(
        await updateMemberAction({
          personId,
          displayName: name,
          idempotencyKey,
        }),
      ),
    {
      messages: {
        success: "Name saved",
        error: "The name wasn't saved. Nothing changed.",
      },
      report: reportFailure("hq.team.rename_failed"),
      onSuccess: () => router.refresh(),
    },
  );
  const saveAddress = useAction(
    async ({ idempotencyKey }) =>
      unwrap(
        await updateMemberAction({ personId, address: place, idempotencyKey }),
      ),
    {
      messages: {
        success: "Home address saved",
        error: "The address wasn't saved. Nothing changed.",
      },
      report: reportFailure("hq.team.address_failed"),
      onSuccess: () => router.refresh(),
    },
  );

  const changeClassification = () =>
    void confirm
      .run({
        tier: "confirm",
        title: `Record ${first} as ${classificationLabel(worker).toLocaleLowerCase()}?`,
        description: `Duna records ${first} as ${classificationLabel(worker)}. Pay runs and the payroll file show it from now on.`,
        affected: classificationNote,
        verb: `Record as ${classificationLabel(worker)}`,
        cancelLabel: "Keep as it is",
        agentConfirm: `Records ${displayName} as ${classificationLabel(worker)}`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await updateMemberAction({
              personId,
              workerClassification: worker,
              idempotencyKey,
            }),
          ),
        success: `${first} is recorded as ${classificationLabel(worker)}`,
      })
      .then((outcome) => {
        if (outcome.status === "done") router.refresh();
      });

  const toggleActive = () =>
    void confirm
      .run({
        tier: "confirm",
        destructive: active,
        title: active ? `Pause ${first}?` : `Bring ${first} back?`,
        description: active
          ? `${first} can no longer open Duna HQ for this club, isn't suggested as a substitute, and new sessions can't be given to them.`
          : `${first} can open Duna HQ again with the access their role gives.`,
        affected: active
          ? "Their history, pay and sessions already run stay as they are. You can bring them back at any time."
          : undefined,
        verb: active ? `Pause ${first}` : `Bring ${first} back`,
        cancelLabel: "Not now",
        agentConfirm: active
          ? `Pauses ${displayName} on the team`
          : `Reactivates ${displayName} on the team`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await updateMemberAction({
              personId,
              active: !active,
              idempotencyKey,
            }),
          ),
        success: active ? `${first} is paused` : `${first} is active again`,
      })
      .then((outcome) => {
        if (outcome.status === "done") router.refresh();
      });

  const field = (key: keyof Address) => ({
    value: place[key] ?? "",
    onChange: (event: { currentTarget: { value: string } }) =>
      setPlace((current) => ({ ...current, [key]: event.currentTarget.value })),
  });

  return (
    <div className="team-details">
      <form
        aria-label="Name"
        className="team-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim().length >= 2 && name.trim() !== displayName) {
            void saveName.run();
          }
        }}
      >
        <Field
          hint="Players see this on sessions and the club page."
          label="Name"
        >
          <Input
            maxLength={80}
            minLength={2}
            onChange={(event) => setName(event.currentTarget.value)}
            value={name}
          />
        </Field>
        <Button
          disabled={name.trim().length < 2 || name.trim() === displayName}
          loading={saveName.showPending}
          type="submit"
          variant="secondary"
        >
          Save name
        </Button>
      </form>

      <div className="team-inline-form">
        <Field label="Worker classification">
          <RadioGroup
            inline
            onValueChange={(value) => setWorker(value as Classification)}
            value={worker}
          >
            <RadioOption label="Contractor (1099)" value="1099-contractor" />
            <RadioOption label="Employee (W-2)" value="w2-employee" />
            {classification === "not-set" ? (
              <RadioOption label="Not set" value="not-set" />
            ) : null}
          </RadioGroup>
        </Field>
        <Button
          disabled={worker === classification || worker === "not-set"}
          onClick={changeClassification}
          variant="secondary"
        >
          Save classification
        </Button>
      </div>
      <p className="team-note">{classificationNote}</p>

      <form
        aria-label="Home address"
        className="team-address"
        onSubmit={(event) => {
          event.preventDefault();
          void saveAddress.run();
        }}
      >
        <Field label="Street address">
          <Input autoComplete="address-line1" {...field("addressLine1")} />
        </Field>
        <Field label="Apartment, suite" optional>
          <Input autoComplete="address-line2" {...field("addressLine2")} />
        </Field>
        <Field label="City">
          <Input autoComplete="address-level2" {...field("locality")} />
        </Field>
        <Field label="State or region">
          <Input
            autoComplete="address-level1"
            {...field("administrativeArea")}
          />
        </Field>
        <Field label="Postal code">
          <Input autoComplete="postal-code" {...field("postalCode")} />
        </Field>
        <Field hint="Two letters, like US." label="Country">
          <Input
            autoComplete="country"
            maxLength={2}
            {...field("countryCode")}
          />
        </Field>
        <div className="team-form__actions">
          <Button
            loading={saveAddress.showPending}
            type="submit"
            variant="secondary"
          >
            Save address
          </Button>
        </div>
      </form>

      {isOwner ? (
        <p className="team-note">
          The owner can&apos;t be paused. Make another director the owner first
          (Access).
        </p>
      ) : (
        <div className="team-form__actions team-form__actions--start">
          <Button
            onClick={toggleActive}
            variant={active ? "ghost" : "secondary"}
          >
            {active ? `Pause ${first}` : `Bring ${first} back`}
          </Button>
        </div>
      )}
      {confirm.dialog}
    </div>
  );
}
