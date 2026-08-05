import { OperatorCreatePage } from "@/components/operator-create-page";

export const metadata = { title: "Create a product" };

export default function CreateProductPage() {
  return (
    <OperatorCreatePage
      description="Use a purpose-built path for a service, plan, or good. Events now stay in the dedicated event builder."
      eyebrow="Products · focused workspace"
      module="products"
      title="Add a service, plan, or good."
    />
  );
}
