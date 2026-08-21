const CATALOG_CHECKOUT_RESUME_KEY = "duna.catalog-checkout-resume.v1";
const CATALOG_CHECKOUT_RESUME_TTL_MS = 15 * 60 * 1_000;

export type CatalogCheckoutResumeIntent = {
  readonly version: 1;
  readonly expiresAt: number;
  readonly organizationSlug: string;
  readonly productSlug: string;
  readonly checkoutRole: "product" | "membership";
  readonly variantId: string;
  readonly selectedPriceId: string;
  readonly paymentMethod: "card" | "cash" | "credit";
  readonly paymentOption: "upfront" | "installments";
  readonly quantity: number;
  readonly occurrenceId: string;
  readonly recordingConsentAccepted: boolean;
  readonly membershipPolicyAccepted: boolean;
  readonly addMembership: boolean;
  readonly idempotencyKey: string;
  readonly membershipIdempotencyKey: string;
};

export type CatalogCheckoutResumeInput = Omit<
  CatalogCheckoutResumeIntent,
  "version" | "expiresAt"
>;

type CheckoutResumeStorage = Pick<
  Storage,
  "getItem" | "removeItem" | "setItem"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isShortString(
  value: unknown,
  { allowEmpty = false, maximumLength = 300 } = {},
): value is string {
  return (
    typeof value === "string" &&
    value.length <= maximumLength &&
    (allowEmpty || value.length > 0)
  );
}

function isCatalogCheckoutResumeIntent(
  value: unknown,
  now: number,
): value is CatalogCheckoutResumeIntent {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    typeof value.expiresAt === "number" &&
    Number.isFinite(value.expiresAt) &&
    value.expiresAt > now &&
    isShortString(value.organizationSlug, { maximumLength: 160 }) &&
    isShortString(value.productSlug, { maximumLength: 160 }) &&
    (value.checkoutRole === "product" || value.checkoutRole === "membership") &&
    isShortString(value.variantId) &&
    isShortString(value.selectedPriceId, { allowEmpty: true }) &&
    (value.paymentMethod === "card" ||
      value.paymentMethod === "cash" ||
      value.paymentMethod === "credit") &&
    (value.paymentOption === "upfront" ||
      value.paymentOption === "installments") &&
    typeof value.quantity === "number" &&
    Number.isInteger(value.quantity) &&
    value.quantity >= 1 &&
    value.quantity <= 50 &&
    isShortString(value.occurrenceId, { allowEmpty: true }) &&
    typeof value.recordingConsentAccepted === "boolean" &&
    typeof value.membershipPolicyAccepted === "boolean" &&
    typeof value.addMembership === "boolean" &&
    isShortString(value.idempotencyKey, { maximumLength: 160 }) &&
    isShortString(value.membershipIdempotencyKey, { maximumLength: 160 })
  );
}

export function catalogCheckoutResumeReturnPath(input: {
  readonly organizationSlug: string;
  readonly productSlug: string;
}): string {
  return `/clubs/${input.organizationSlug}/products/${input.productSlug}?resume_checkout=1#purchase`;
}

export function saveCatalogCheckoutResumeIntent(
  storage: CheckoutResumeStorage,
  input: CatalogCheckoutResumeInput,
  now = Date.now(),
): boolean {
  try {
    storage.setItem(
      CATALOG_CHECKOUT_RESUME_KEY,
      JSON.stringify({
        ...input,
        version: 1,
        expiresAt: now + CATALOG_CHECKOUT_RESUME_TTL_MS,
      } satisfies CatalogCheckoutResumeIntent),
    );
    return true;
  } catch {
    return false;
  }
}

export function consumeCatalogCheckoutResumeIntent(
  storage: CheckoutResumeStorage,
  expected: {
    readonly organizationSlug: string;
    readonly productSlug: string;
  },
  now = Date.now(),
): CatalogCheckoutResumeIntent | undefined {
  let stored: string | null;
  try {
    stored = storage.getItem(CATALOG_CHECKOUT_RESUME_KEY);
    storage.removeItem(CATALOG_CHECKOUT_RESUME_KEY);
  } catch {
    return undefined;
  }
  if (!stored) return undefined;

  try {
    const value: unknown = JSON.parse(stored);
    if (
      !isCatalogCheckoutResumeIntent(value, now) ||
      value.organizationSlug !== expected.organizationSlug ||
      value.productSlug !== expected.productSlug
    ) {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}
