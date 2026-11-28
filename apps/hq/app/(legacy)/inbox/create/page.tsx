import { redirect } from "next/navigation";

export default async function CreateMessagePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ recipient?: string }>;
}) {
  const { recipient } = await searchParams;
  redirect(
    `/inbox?compose=new${recipient ? `&recipient=${encodeURIComponent(recipient)}` : ""}`,
  );
}
