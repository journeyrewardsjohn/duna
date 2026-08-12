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
