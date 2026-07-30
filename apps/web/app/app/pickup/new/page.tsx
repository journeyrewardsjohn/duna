import { PickupForm } from "@/components/pickup-form";

export const metadata = { title: "Host pickup" };

export default function NewPickupPage() {
  return (
    <main className="standard-page">
      <PickupForm />
    </main>
  );
}
