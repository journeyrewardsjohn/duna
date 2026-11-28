import { notFound } from "next/navigation";
import { MoneyPageContent } from "@/components/money-page";
import { TransactionDetail } from "@/components/transaction-detail";
import { orAccessDenied } from "@/lib/access";
import { getServerCaller } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";
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
  const loaded = await orAccessDenied("Money", async () => {
    try {
      return await caller.operator.transaction({ transactionId });
    } catch (error) {
      // A missing transaction is a 404; a refusal is the access page.
      if (isPermissionDenied(error)) throw error;
      return null;
    }
  });
  if ("denied" in loaded) return loaded.denied;
  if (!loaded.value) notFound();
  return (
    <MoneyPageContent view="transactions">
      <TransactionDetail transaction={loaded.value} />
    </MoneyPageContent>
  );
}
