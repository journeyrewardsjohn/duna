import { redirect } from "next/navigation";

/** The old "new message" address (other screens link here with a recipient). */
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
