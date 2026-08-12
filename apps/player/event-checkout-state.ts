export function checkoutRosterComplete(input: {
  readonly purchaseKind: "entry" | "ticket";
  readonly eventKind: string;
  readonly selectedTeamSize: number;
  readonly teammateCount: number;
}) {
  if (input.purchaseKind === "ticket") return true;
  return (
    input.eventKind === "pickup" ||
    input.selectedTeamSize <= 1 ||
    input.teammateCount >= input.selectedTeamSize - 1
  );
}

export function initialPurchaseKind(input: {
  readonly hasDivisions: boolean;
  readonly hasTickets: boolean;
}): "entry" | "ticket" {
  return input.hasDivisions || !input.hasTickets ? "entry" : "ticket";
}

export function admissionPassReady(input: {
  readonly eventKind: string;
  readonly purchaseKind: "entry" | "ticket";
  readonly checkoutComplete: boolean;
  readonly registrationStatus?: string;
  readonly fulfillmentStatus?: string;
}): boolean {
  if (input.eventKind !== "tournament" || !input.checkoutComplete) return false;
  return input.purchaseKind === "ticket"
    ? input.fulfillmentStatus === "confirmed"
    : input.registrationStatus === "confirmed" ||
        input.registrationStatus === "checked-in";
}
