import type { Metadata } from "next";
import { BusinessForm } from "@/components/money/business-form";
import { DunaPayPage } from "@/components/money/duna-pay-page";
import { PageSection } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Business details · Duna Pay" };

/** DP-Business: who is getting paid and what they sell, as one sentence. */
export default function DunaPayBusinessPage() {
  return (
    <DunaPayPage
      askStarters={[
        "Which business type should we choose?",
        "Describe what we sell from our offerings",
      ]}
      step="business"
    >
      {(account, context) => (
        <PageSection id="duna-pay-business" title="About your business">
          <BusinessForm
            businessType={account.business.businessType}
            canWrite={context.canWrite}
            legalName={account.business.legalName}
            organization={context.organization}
            whatYouSell={account.business.whatYouSell}
          />
        </PageSection>
      )}
    </DunaPayPage>
  );
}
