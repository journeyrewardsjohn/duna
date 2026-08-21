type StripeObject = Readonly<Record<string, unknown>>;

function record(value: unknown): StripeObject | undefined {
  return typeof value === "object" && value !== null
    ? (value as StripeObject)
    : undefined;
}

function nestedRecord(
  value: StripeObject | undefined,
  key: string,
): StripeObject | undefined {
  return record(value?.[key]);
}

export function connectAccountMetadataEntityId(
  object: StripeObject,
): string | undefined {
  const value = nestedRecord(object, "metadata")?.dunaEntityId;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Accounts created through v2 still have a v1 projection, but v2 webhooks and
 * retrievals expose capability status under configuration.recipient. Accept
 * either representation so payment readiness cannot depend on payload style.
 */
export function connectAccountMoneyReady(object: StripeObject): boolean {
  if (object.charges_enabled === true && object.payouts_enabled === true) {
    return true;
  }

  const configuration = nestedRecord(object, "configuration");
  const merchant = nestedRecord(configuration, "merchant");
  const merchantCapabilities = nestedRecord(merchant, "capabilities");
  const cardPayments = nestedRecord(merchantCapabilities, "card_payments");
  const recipient = nestedRecord(configuration, "recipient");
  const capabilities = nestedRecord(recipient, "capabilities");
  const stripeBalance = nestedRecord(capabilities, "stripe_balance");
  const transfers = nestedRecord(stripeBalance, "stripe_transfers");
  const payouts = nestedRecord(stripeBalance, "payouts");

  return (
    merchant?.applied === true &&
    cardPayments?.status === "active" &&
    recipient?.applied === true &&
    transfers?.status === "active" &&
    payouts?.status === "active"
  );
}
