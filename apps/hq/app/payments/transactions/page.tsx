import { MoneyPageContent } from "@/components/money-page";
import { TransactionTable } from "@/components/transaction-table";
import { orAccessDenied } from "@/lib/access";
import { getServerCaller } from "@/lib/api";
export default async function TransactionsPage() {
  const caller = await getServerCaller();
  const loaded = await orAccessDenied("Money", () =>
    caller.operator.transactions(),
  );
  if ("denied" in loaded) return loaded.denied;
  return (
    <MoneyPageContent view="transactions">
      <TransactionTable transactions={loaded.value} />
    </MoneyPageContent>
  );
}
