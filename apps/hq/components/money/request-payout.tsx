"use client";

import { Button, useConfirm } from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { requestPayoutAction } from "@/app/(next)/(hq)/money/actions";
import { unwrap } from "./money-action-result";

/**
 * "Request a payout" (the existing manual payout) behind the strong
 * confirmation: it restates the amount ready now and the bank. Duna pays out
 * only money that has cleared and been delivered, so the payout may be less
 * than the figure if something changed since the page loaded.
 */
export function RequestPayoutButton({
  available,
  bank,
}: {
  /** The amount ready now, formatted from the backend's figure. */
  readonly available: string;
  /** "First Sand Bank ending 1842" or "your payout bank". */
  readonly bank: string;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  return (
    <>
      <Button
        onClick={() =>
          void confirm
            .run({
              tier: "strong",
              title: "Pay out now?",
              description:
                "Duna sends everything that is ready to pay out to your bank now, instead of waiting for your schedule.",
              amount: `Up to ${available}`,
              recipients: bank,
              consequence:
                "Money already sent to a bank can't be recalled. Only money that has cleared and been delivered is included.",
              verb: `Pay out ${available}`,
              cancelLabel: "Keep my schedule",
              agentConfirm: `Pays out up to ${available} to ${bank} now`,
              perform: async ({ idempotencyKey }) =>
                unwrap(await requestPayoutAction({ idempotencyKey })),
              success:
                "Payout requested. It shows in Payouts once the bank has it.",
            })
            .then((outcome) => {
              if (outcome.status === "done") router.refresh();
            })
        }
        variant="secondary"
      >
        Request a payout
      </Button>
      {confirm.dialog}
    </>
  );
}
