import { demoEvents } from "@duna/core/demo";
import { notFound } from "next/navigation";
import { CheckoutPanel } from "@/components/checkout-panel";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = demoEvents.find((item) => item.slug === slug);
  if (!event) notFound();
  return (
    <main className="standard-page">
      <CheckoutPanel event={event} />
    </main>
  );
}
