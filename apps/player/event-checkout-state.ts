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

export async function presentThenPollCheckout<T>(input: {
  readonly present: () => Promise<"cancelled" | "completed">;
  readonly readStatus: () => Promise<T>;
  readonly isComplete: (status: T) => boolean;
  readonly maxPolls: number;
  readonly delayMs: (attempt: number) => number;
  readonly sleep?: (delayMs: number) => Promise<void>;
}): Promise<
  | { readonly cancelled: true }
  | { readonly cancelled: false; readonly status: T }
> {
  const paymentResult = await input.present();
  if (paymentResult === "cancelled") return { cancelled: true };

  const sleep =
    input.sleep ??
    ((delayMs: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  let status = await input.readStatus();
  for (
    let attempt = 0;
    attempt < input.maxPolls && !input.isComplete(status);
    attempt += 1
  ) {
    await sleep(input.delayMs(attempt));
    status = await input.readStatus();
  }
  return { cancelled: false, status };
}
