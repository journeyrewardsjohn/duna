import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import { BankLine } from "@/components/money/duna-pay";
import { DunaPayPage } from "@/components/money/duna-pay-page";
import { payProcessorConfigured } from "@/components/money/money-data";
import { PayoutSchedule } from "@/components/money/payouts";
import { StartVerificationButton } from "@/components/money/start-verification";
import { PageSection } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Payout bank · Duna Pay" };

/** DP-Payouts: the bank payouts go to, and the schedule. */
export default function DunaPayPayoutsPage() {
  const configured = payProcessorConfigured();
  return (
    <DunaPayPage
      askStarters={[
        "Which payout schedule suits a club like ours?",
        "When will our first payout arrive?",
      ]}
      step="payouts"
    >
      {(account, context) => (
        <>
          <PageSection id="duna-pay-bank" title="Payout bank">
            <BankLine account={account} />
            <p className="money-quiet">
              Your bank details are entered on the secure verification pages,
              never typed into Duna.
            </p>
            {configured && context.canWrite ? (
              <div className="money-form-actions">
                <StartVerificationButton
                  label={
                    account.bank.status === "missing"
                      ? "Add a payout bank"
                      : "Change the payout bank"
                  }
                />
              </div>
            ) : null}
          </PageSection>
          <PayoutSchedule
            context={context}
            returnHref={hqHref("moneyDunaPayPayouts")}
          />
        </>
      )}
    </DunaPayPage>
  );
}
