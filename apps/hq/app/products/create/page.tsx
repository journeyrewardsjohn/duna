import { OperatorCreatePage } from "@/components/operator-create-page";

export const metadata = { title: "Create a product" };

export default function CreateProductPage() {
  return (
    <OperatorCreatePage
      description="Choose the product family first. Duna only shows the pricing, access, inventory, and fulfillment fields that belong to it."
      eyebrow="Products · focused workspace"
      module="products"
      title="Create something people can book or buy."
    />
  );
}
