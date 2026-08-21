import { MoneyPageContent } from "@/components/money-page";

export const metadata = { title: "Money" };

export default async function MoneyPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ stripe?: string }>;
}) {
  const { stripe } = await searchParams;
  return <MoneyPageContent stripe={stripe} view="balance" />;
}
