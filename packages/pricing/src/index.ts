export type CurrencyCode = "USD" | "CAD" | "AUD" | "BRL" | "EUR";

export type OrderItemKind =
  | "booking"
  | "registration"
  | "membership"
  | "package"
  | "ticket"
  | "merchandise"
  | "wallet-load";

export interface PricedOrderItem {
  readonly id: string;
  readonly kind: OrderItemKind;
  readonly description: string;
  readonly quantity: number;
  readonly unitAmountMinor: number;
}

export interface AppliedFee {
  readonly id:
    | "consumer-platform-v2"
    | "registration-service-v2"
    | "operator-online-v2"
    | "operator-present-v2"
    | "operator-ach-v2"
    | "coach-marketplace-v2";
  readonly label: string;
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly payer: "consumer" | "operator" | "coach";
  readonly ruleInputs: Readonly<Record<string, string | number | boolean>>;
}

export interface OrderPricing {
  readonly subtotalMinor: number;
  readonly fees: readonly AppliedFee[];
  readonly totalMinor: number;
  readonly currency: CurrencyCode;
  readonly dunaPlusSavingsMinor: number;
}

const PLATFORM_RATE = 0.03;
const PLATFORM_FLOOR_MINOR = 49;
const PLATFORM_CAP_MINOR = 499;

function assertMinorAmount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `${field} must be a non-negative integer minor-unit amount`,
    );
  }
}

export function calculateConsumerPlatformFee(input: {
  readonly bookingSubtotalMinor: number;
  readonly currency: CurrencyCode;
  readonly isDunaPlus: boolean;
  readonly hasRegistrationServiceFee: boolean;
}): AppliedFee {
  assertMinorAmount(input.bookingSubtotalMinor, "bookingSubtotalMinor");
  const rawAmount =
    input.bookingSubtotalMinor === 0
      ? 0
      : Math.min(
          PLATFORM_CAP_MINOR,
          Math.max(
            PLATFORM_FLOOR_MINOR,
            Math.round(input.bookingSubtotalMinor * PLATFORM_RATE),
          ),
        );
  const amountMinor =
    input.isDunaPlus || input.hasRegistrationServiceFee ? 0 : rawAmount;
  return {
    id: "consumer-platform-v2",
    label: "Duna platform fee",
    amountMinor,
    currency: input.currency,
    payer: "consumer",
    ruleInputs: {
      bookingSubtotalMinor: input.bookingSubtotalMinor,
      rateBps: 300,
      floorMinor: PLATFORM_FLOOR_MINOR,
      capMinor: PLATFORM_CAP_MINOR,
      isDunaPlus: input.isDunaPlus,
      noDoubleFeeApplied: input.hasRegistrationServiceFee,
    },
  };
}

export function calculateRegistrationServiceFee(input: {
  readonly registrations: number;
  readonly feePerRegistrationMinor: number;
  readonly currency: CurrencyCode;
}): AppliedFee {
  if (!Number.isSafeInteger(input.registrations) || input.registrations < 0) {
    throw new Error("registrations must be a non-negative integer");
  }
  assertMinorAmount(input.feePerRegistrationMinor, "feePerRegistrationMinor");
  if (
    input.feePerRegistrationMinor !== 0 &&
    (input.feePerRegistrationMinor < 200 || input.feePerRegistrationMinor > 400)
  ) {
    throw new Error("registration service fee must be between $2 and $4");
  }
  return {
    id: "registration-service-v2",
    label: "Registration service fee",
    amountMinor: input.registrations * input.feePerRegistrationMinor,
    currency: input.currency,
    payer: "consumer",
    ruleInputs: {
      registrations: input.registrations,
      feePerRegistrationMinor: input.feePerRegistrationMinor,
    },
  };
}

export function calculateOperatorProcessingFee(input: {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly method: "online-card" | "card-present" | "ach";
}): AppliedFee {
  assertMinorAmount(input.amountMinor, "amountMinor");
  if (input.method === "ach") {
    return {
      id: "operator-ach-v2",
      label: "ACH processing",
      amountMinor: Math.min(600, Math.round(input.amountMinor * 0.01)),
      currency: input.currency,
      payer: "operator",
      ruleInputs: {
        amountMinor: input.amountMinor,
        rateBps: 100,
        capMinor: 600,
      },
    };
  }
  const cardPresent = input.method === "card-present";
  const rate = cardPresent ? 0.028 : 0.03;
  const fixedMinor = cardPresent ? 15 : 35;
  return {
    id: cardPresent ? "operator-present-v2" : "operator-online-v2",
    label: cardPresent ? "Card-present processing" : "Online processing",
    amountMinor:
      input.amountMinor === 0
        ? 0
        : Math.round(input.amountMinor * rate) + fixedMinor,
    currency: input.currency,
    payer: "operator",
    ruleInputs: {
      amountMinor: input.amountMinor,
      rateBps: Math.round(rate * 10_000),
      fixedMinor,
    },
  };
}

export function calculateCoachMarketplaceFee(input: {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
  readonly originatedByDuna: boolean;
  readonly relationshipAgeDays: number;
  readonly takeRateBps?: number;
}): AppliedFee {
  assertMinorAmount(input.amountMinor, "amountMinor");
  const takeRateBps = input.takeRateBps ?? 1_500;
  if (takeRateBps < 1_200 || takeRateBps > 1_500) {
    throw new Error("marketplace take must be between 12% and 15%");
  }
  const applies =
    input.originatedByDuna &&
    input.relationshipAgeDays >= 0 &&
    input.relationshipAgeDays <= 365;
  return {
    id: "coach-marketplace-v2",
    label: "Duna marketplace lead fee",
    amountMinor: applies
      ? Math.round((input.amountMinor * takeRateBps) / 10_000)
      : 0,
    currency: input.currency,
    payer: "coach",
    ruleInputs: {
      amountMinor: input.amountMinor,
      originatedByDuna: input.originatedByDuna,
      relationshipAgeDays: input.relationshipAgeDays,
      takeRateBps,
    },
  };
}

export function priceConsumerOrder(input: {
  readonly items: readonly PricedOrderItem[];
  readonly currency: CurrencyCode;
  readonly isDunaPlus: boolean;
  readonly registrationFeePerEntryMinor?: number;
}): OrderPricing {
  for (const item of input.items) {
    assertMinorAmount(item.unitAmountMinor, `${item.id}.unitAmountMinor`);
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new Error(`${item.id}.quantity must be a positive integer`);
    }
  }
  const subtotalMinor = input.items.reduce(
    (sum, item) => sum + item.quantity * item.unitAmountMinor,
    0,
  );
  const bookingSubtotalMinor = input.items
    .filter((item) => item.kind === "booking")
    .reduce((sum, item) => sum + item.quantity * item.unitAmountMinor, 0);
  const registrations = input.items
    .filter((item) => item.kind === "registration")
    .reduce((sum, item) => sum + item.quantity, 0);
  const registrationFee = calculateRegistrationServiceFee({
    registrations,
    feePerRegistrationMinor:
      registrations === 0 ? 0 : (input.registrationFeePerEntryMinor ?? 300),
    currency: input.currency,
  });
  const platformFee = calculateConsumerPlatformFee({
    bookingSubtotalMinor,
    currency: input.currency,
    isDunaPlus: input.isDunaPlus,
    hasRegistrationServiceFee: registrationFee.amountMinor > 0,
  });
  const fees = [registrationFee, platformFee].filter(
    (fee) => fee.amountMinor > 0,
  );
  const dunaPlusSavingsMinor = input.isDunaPlus
    ? calculateConsumerPlatformFee({
        bookingSubtotalMinor,
        currency: input.currency,
        isDunaPlus: false,
        hasRegistrationServiceFee: registrationFee.amountMinor > 0,
      }).amountMinor
    : 0;
  return {
    subtotalMinor,
    fees,
    totalMinor:
      subtotalMinor + fees.reduce((sum, fee) => sum + fee.amountMinor, 0),
    currency: input.currency,
    dunaPlusSavingsMinor,
  };
}
