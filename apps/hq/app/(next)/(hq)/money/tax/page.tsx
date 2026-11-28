import type { Metadata } from "next";
import { Chip } from "@duna/ui/tideline";
import { loadTaxSettings } from "@/components/money/money-data";
import { MoneyScreen, moneyContext } from "@/components/money/money-screen";
import { BlockState } from "@/components/money/money-states";
import { Facts } from "@/components/money/money-parts";
import { PageSection } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Tax" };

const registration: Record<string, string> = {
  "not-configured": "Not set up",
  pending: "Being set up",
  active: "Collecting",
  restricted: "Paused",
};

/** Money › Tax: whether Duna collects sales tax at checkout for the club. */
export default async function MoneyTaxPage() {
  const context = await moneyContext();
  const tax =
    context.session.access === "operator" ? await loadTaxSettings() : undefined;
  return (
    <MoneyScreen
      askLabel="Tax"
      askStarters={[
        "Does Duna collect sales tax for us?",
        "What do we need for sales tax?",
      ]}
      description="Sales tax on what players buy"
      tab="tax"
      title="Tax"
    >
      <PageSection id="tax" title="Sales tax at checkout">
        {!tax ? null : tax.state !== "ok" ? (
          <BlockState
            canSetUp={context.canWrite}
            feature="Sales tax"
            loaded={tax}
            organization={context.organization}
            what="tax settings"
          />
        ) : (
          <>
            <p className="money-body">
              {tax.data.marketplaceTaxEnabled
                ? "Sales tax is worked out and collected at checkout where it applies, and shown to players before they pay."
                : "Sales tax isn't collected at checkout."}
            </p>
            <Facts
              items={[
                {
                  label: "Collection",
                  value: (
                    <Chip
                      tone={
                        tax.data.registrationStatus === "active"
                          ? "positive"
                          : "neutral"
                      }
                    >
                      {registration[tax.data.registrationStatus] ??
                        tax.data.registrationStatus}
                    </Chip>
                  ),
                },
                {
                  label: "Tax ID",
                  value: tax.data.taxIdVerified
                    ? "Verified"
                    : "Not verified yet",
                },
              ]}
            />
            <p className="money-quiet">
              To change how tax is collected, contact Duna support.
            </p>
          </>
        )}
      </PageSection>
    </MoneyScreen>
  );
}
