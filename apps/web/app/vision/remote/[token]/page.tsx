import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VisionRemoteControl } from "@/components/vision-remote-control";
import { getServerCaller } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Duna Vision Remote",
  description: "Align and control a Duna Vision recording.",
  robots: { index: false, follow: false },
};

export default async function VisionRemotePage({
  params,
}: {
  readonly params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const caller = await getServerCaller();
  const session = await caller.public
    .visionRemoteSession({ token })
    .catch(() => undefined);
  if (!session) notFound();

  return <VisionRemoteControl initialSession={session} token={token} />;
}
