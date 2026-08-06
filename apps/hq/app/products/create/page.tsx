import { OperatorCreatePage } from "@/components/operator-create-page";

export const metadata = { title: "Create a product" };

export default function CreateProductPage() {
  return (
    <OperatorCreatePage
      description="Choose a guided path for a bookable service, customer plan, or physical good. Duna keeps the result private until you are ready to review it."
      eyebrow="Products · Offer studio"
      module="products"
      title="Create an offer."
    />
  );
}
