"use client";

import { Button, Checkbox, Field, Icon, NumberInput } from "@duna/ui/tideline";
import { useFormStatus } from "react-dom";

function Submit({
  price,
  interval,
}: {
  readonly price: string;
  readonly interval: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button loading={pending} type="submit" variant="primary">
      Continue to secure checkout ({price} a {interval})
    </Button>
  );
}

/** The paid plan's last step: optional video packs, then checkout. Card details never touch Duna. */
export function CheckoutForm({
  action,
  plan,
  planName,
  price,
  interval,
  checkoutId,
  website,
  features,
  uploadPack,
  livePack,
}: {
  readonly action: (formData: FormData) => Promise<void>;
  readonly plan: string;
  readonly planName: string;
  readonly price: string;
  readonly interval: "month" | "year";
  readonly checkoutId: string;
  readonly website: string;
  readonly features: readonly string[];
  readonly uploadPack: string;
  readonly livePack: string;
}) {
  return (
    <form action={action} className="setup-create">
      <input name="plan" type="hidden" value={plan} />
      <input name="checkoutId" type="hidden" value={checkoutId} />
      <input name="interval" type="hidden" value={interval} />
      <input name="website" type="hidden" value={website} />
      <section aria-labelledby="plan-title" className="setup-plan-card">
        <h2 className="setup-plan-card__title" id="plan-title">
          {planName}
        </h2>
        <p className="td-num">
          {price} a {interval}
        </p>
        <ul>
          {features.map((feature) => (
            <li key={feature}>
              <Icon name="check" size="inline" />
              {feature}
            </li>
          ))}
        </ul>
      </section>
      <fieldset className="setup-create__group">
        <legend className="setup-create__legend">
          More video, if you want it
        </legend>
        <Field
          hint={`${uploadPack} a month each`}
          label="10 upload-hour packs"
          optional
        >
          <NumberInput
            defaultValue={0}
            max={100}
            min={0}
            name="uploadPackQuantity"
          />
        </Field>
        <Field
          hint={`${livePack} a month each`}
          label="2 live-hour packs"
          optional
        >
          <NumberInput
            defaultValue={0}
            max={100}
            min={0}
            name="livePackQuantity"
          />
        </Field>
        <Checkbox
          label="Keep recording after the allowance and bill the exact extra"
          name="payAsYouGo"
          value="on"
        />
      </fieldset>
      <Submit interval={interval} price={price} />
      <p className="setup-quiet">Duna never sees your card details.</p>
    </form>
  );
}
