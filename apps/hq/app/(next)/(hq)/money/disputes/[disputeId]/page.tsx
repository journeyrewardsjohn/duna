import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DisputeDetail } from "@/components/money/disputes";
import { loadDispute, loadObligation } from "@/components/money/money-data";
import { formatAmount } from "@/components/money/money-model";
import { MoneyScreen, moneyContext } from "@/components/money/money-screen";
import { BlockState } from "@/components/money/money-states";

export const metadata: Metadata = { title: "Dispute" };

/** One dispute: timeline, what's held, the club's response, the outcome. */
export default async function MoneyDisputePage({
  params,
}: {
  readonly params: Promise<{ disputeId: string }>;
}) {
  const { disputeId } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      disputeId,
    )
  ) {
    notFound();
  }
  const context = await moneyContext();
  if (context.session.access !== "operator") return null;
  const dispute = await loadDispute(disputeId);
  if (dispute.state === "not-found") notFound();
  if (dispute.state !== "ok") {
    return (
      <MoneyScreen
        askLabel="A dispute"
        askStarters={[]}
        tab="disputes"
        title="Dispute"
      >
        <BlockState
          canSetUp={context.canWrite}
          loaded={dispute}
          organization={context.organization}
          retryHref={hqHref("moneyDisputes")}
          what="this dispute"
        />
      </MoneyScreen>
    );
  }
  const sale = dispute.data.obligationId
    ? await loadObligation(dispute.data.obligationId)
    : undefined;
  const saleTitle = sale?.state === "ok" ? sale.data.title : undefined;
  const buyer = dispute.data.buyer?.displayName;
  return (
    <MoneyScreen
      askLabel={`Dispute of ${formatAmount(dispute.data.amount)}${buyer ? ` from ${buyer}` : ""}${saleTitle ? ` on ${saleTitle}` : ""} (${dispute.data.id})`}
      askStarters={[
        "Help me write our response to this dispute",
        "What happens if we lose this dispute?",
      ]}
      crumb={buyer ? `Dispute from ${buyer}` : "Dispute"}
      header={
        <DisputeDetail
          context={context}
          dispute={dispute.data}
          saleTitle={saleTitle}
        />
      }
      parentHref={hqHref("moneyDisputes")}
      tab="disputes"
      title="Dispute"
    >
      {null}
    </MoneyScreen>
  );
}
