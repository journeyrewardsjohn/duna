import { log } from "@duna/observability";
import type { Metadata } from "next";
import {
  BankLine,
  DunaPayExplainer,
  DunaPayStatus,
  PublishGateExplainer,
  ReadyUnlocks,
} from "@/components/money/duna-pay";
import { DunaPayPage } from "@/components/money/duna-pay-page";
import { payProcessorConfigured } from "@/components/money/money-data";
import { getServerCaller } from "@/lib/api";

export const metadata: Metadata = { title: "Duna Pay" };

/**
 * Duna Pay setup (DP-Status): where the club stands in one sentence, the
 * ONE next thing to do, what is wrong when something is, what ready
 * unlocks, and why paid offerings wait. Without payment keys in this
 * environment it explains Duna Pay instead of offering a link that can't
 * open.
 */
export default async function DunaPayStatusPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ stripe?: string }>;
}) {
  const { stripe } = await searchParams;
  const configured = payProcessorConfigured();
  if (stripe === "return" && configured) {
    // Back from verification: ask for the latest status once.
    try {
      const caller = await getServerCaller();
      await caller.operator.refreshStripeOnboarding({
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      log.warn("hq.money.onboarding_refresh_failed", {
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  }
  return (
    <DunaPayPage
      askStarters={[
        "What does Duna Pay still need from us?",
        "When will our first payout arrive?",
        "Why can't I publish a paid offering yet?",
      ]}
      step="status"
    >
      {(account, context) => (
        <>
          <DunaPayStatus account={account} context={context} />
          {configured ? <BankLine account={account} /> : null}
          {!configured ? (
            <DunaPayExplainer account={account} context={context} />
          ) : null}
          <PublishGateExplainer context={context} />
          <ReadyUnlocks ready={account.status === "ready"} />
        </>
      )}
    </DunaPayPage>
  );
}
