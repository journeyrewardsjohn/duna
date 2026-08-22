import { notFound } from "next/navigation";
import { MoneyPageContent } from "@/components/money-page";
import { TransactionDetail } from "@/components/transaction-detail";
import { getServerCaller } from "@/lib/api";
export default async function TransactionDetailPage({
  params,
}: {
  readonly params: Promise<{ transactionId: string }>;
}) {
  const { transactionId: routeTransactionId } = await params;
  let transactionId: string;
  try {
    transactionId = decodeURIComponent(routeTransactionId);
  } catch {
    notFound();
  }
  const caller = await getServerCaller();
  try {
    const transaction = await caller.operator.transaction({ transactionId });
    return (
      <MoneyPageContent view="transactions">
        <TransactionDetail transaction={transaction} />
      </MoneyPageContent>
    );
  } catch {
    notFound();
  }
}
