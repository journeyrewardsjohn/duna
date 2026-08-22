export type OperatorEventPaymentTreatment = "complimentary" | "to-be-paid";

export function operatorEventPaymentTreatment(
  decision: unknown,
): OperatorEventPaymentTreatment | undefined {
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    return undefined;
  }
  const value = (decision as Record<string, unknown>).paymentTreatment;
  return value === "complimentary" || value === "to-be-paid"
    ? value
    : undefined;
}

export function eventCaptainPaymentComplete(input: {
  readonly eligibilityDecision: unknown;
  readonly orderStatus?: string | null;
  readonly registrationStatus: string;
}): boolean {
  if (
    input.orderStatus === "paid" ||
    input.orderStatus === "partially-refunded"
  ) {
    return true;
  }
  const treatment = operatorEventPaymentTreatment(input.eligibilityDecision);
  if (treatment === "complimentary") return true;
  if (treatment === "to-be-paid") return false;
  return (
    input.registrationStatus === "confirmed" ||
    input.registrationStatus === "checked-in"
  );
}
