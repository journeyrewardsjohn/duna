import { MoneyPageContent } from "@/components/money-page";
import { TransactionTable } from "@/components/transaction-table";
import { getServerCaller } from "@/lib/api";
export default async function TransactionsPage() {
  const caller = await getServerCaller();
  const transactions = await caller.operator.transactions();
  return (
    <MoneyPageContent view="transactions">
      <TransactionTable transactions={transactions} />
    </MoneyPageContent>
  );
}
