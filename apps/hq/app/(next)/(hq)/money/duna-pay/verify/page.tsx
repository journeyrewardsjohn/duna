import { NotConfigured } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { Requirements } from "@/components/money/duna-pay";
import { DunaPayPage } from "@/components/money/duna-pay-page";
import { payProcessorConfigured } from "@/components/money/money-data";
import {
  accountStatusCopy,
  verificationNote,
  whatYouNeed,
} from "@/components/money/money-model";
import { StateChip } from "@/components/money/money-parts";
import { StartVerificationButton } from "@/components/money/start-verification";
import { PageSection } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Verify your identity · Duna Pay" };

/**
 * DP-Verify: the identity check, done on the payment partner's secure
 * pages (the one place product copy names them). Shows what is still
 * needed, in the backend's words, and opens the hosted flow.
 */
export default function DunaPayVerifyPage() {
  const configured = payProcessorConfigured();
  return (
    <DunaPayPage
      askStarters={[
        "What does verification need from us?",
        "Who should verify for the club?",
      ]}
      step="verify"
    >
      {(account, context) => {
        const copy = accountStatusCopy(account.status);
        const verified =
          account.status === "ready" || account.status === "verifying";
        return (
          <PageSection
            aside={<StateChip copy={copy} />}
            id="duna-pay-verify"
            title="Identity check"
          >
            <p className="money-body">
              {verified
                ? account.status === "verifying"
                  ? "Your details are with the identity check now. There is nothing to do; this page updates when it finishes."
                  : "Your identity is verified. If anything changes, what's needed shows here."
                : "Before players can pay you, the person who runs the club confirms who they are. It takes a few minutes with an ID to hand."}
            </p>
            <Requirements account={account} context={context} />
            {!verified ? (
              <ul className="money-checklist">
                {whatYouNeed.map((line) => (
                  <li key={line}>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="money-quiet">{verificationNote}</p>
            {configured ? (
              context.canWrite &&
              account.status !== "ready" &&
              account.status !== "verifying" ? (
                <div className="money-form-actions">
                  <StartVerificationButton
                    label={copy.next ?? "Start verification"}
                  />
                </div>
              ) : null
            ) : (
              <NotConfigured
                canSetUp={false}
                compact
                feature="Identity verification"
                needs="Duna Pay"
                owner="Duna, which switches Duna Pay on for this environment"
              />
            )}
          </PageSection>
        );
      }}
    </DunaPayPage>
  );
}
