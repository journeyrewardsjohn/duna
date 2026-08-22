import { Badge } from "@duna/ui";
import Link from "next/link";
import { MoneyPageContent } from "@/components/money-page";
import { getServerCaller } from "@/lib/api";

function money(value: number | undefined, currency: string) {
  if (value === undefined) return "Not available";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    value / 100,
  );
}
function tone(status: string) {
  return /failed|declined|overdue|disputed|cancelled/i.test(status)
    ? "danger"
    : /pending|processing|scheduled/i.test(status)
      ? "warning"
      : /paid|succeeded|complete|available|recovered/i.test(status)
        ? "positive"
        : "neutral";
}
export default async function TransactionsPage() {
  const caller = await getServerCaller();
  const transactions = await caller.operator.transactions();
  return (
    <MoneyPageContent view="transactions">
      <section className="module-card">
        <table className="transaction-table">
          <caption className="sr-only">
            Read-only organization transactions
          </caption>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Status</th>
              <th>Source</th>
              <th>Gross</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((item) => (
              <tr key={item.id}>
                <td data-label="Customer">
                  <Link href={`/payments/transactions/${item.id}`}>
                    {item.buyerName}
                    <br />
                    <small>{item.description}</small>
                  </Link>
                </td>
                <td data-label="Status">
                  <Badge tone={tone(item.status)}>{item.status}</Badge>
                </td>
                <td data-label="Source">{item.source}</td>
                <td data-label="Gross">
                  {money(item.grossMinor, item.currency)}
                </td>
                <td data-label="Net">{money(item.netMinor, item.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </MoneyPageContent>
  );
}
