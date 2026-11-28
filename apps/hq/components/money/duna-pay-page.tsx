import type { PayAccount } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import type { ReactNode } from "react";
import { DunaPayFrame } from "./duna-pay";
import { loadAccount } from "./money-data";
import { MoneyScreen, moneyContext, type MoneyContext } from "./money-screen";
import type { SetupStepKey } from "./money-setup";
import { BlockState } from "./money-states";

const titles: Record<SetupStepKey | "status", string> = {
  status: "Duna Pay",
  business: "Business details",
  verify: "Verify your identity",
  payouts: "Payout bank and schedule",
};

/** A Duna Pay setup page: the Money tabs, the steps beside, the step's content. */
export async function DunaPayPage({
  step,
  askStarters,
  children,
}: {
  readonly step: SetupStepKey | "status";
  readonly askStarters: readonly string[];
  readonly children: (account: PayAccount, context: MoneyContext) => ReactNode;
}) {
  const context = await moneyContext();
  const account =
    context.session.access === "operator" ? await loadAccount() : undefined;
  return (
    <MoneyScreen
      askLabel={
        step === "status" ? "Duna Pay setup" : `Duna Pay setup: ${titles[step]}`
      }
      askStarters={askStarters}
      crumb={step === "status" ? undefined : titles[step]}
      description={
        step === "status"
          ? `How players pay ${context.organization}, and how the money reaches your bank`
          : undefined
      }
      parentHref={step === "status" ? undefined : hqHref("moneyDunaPay")}
      tab="duna-pay"
      title={titles[step]}
    >
      {!account ? null : account.state !== "ok" ? (
        <BlockState
          canSetUp={context.canWrite}
          feature="Duna Pay"
          loaded={account}
          organization={context.organization}
          retryHref={hqHref("moneyDunaPay")}
          what="Duna Pay"
        />
      ) : (
        <DunaPayFrame account={account.data} current={step}>
          {children(account.data, context)}
        </DunaPayFrame>
      )}
    </MoneyScreen>
  );
}
