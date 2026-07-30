import { notFound } from "next/navigation";
import { PublicLiveScore } from "@/components/public-live-score";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Live match" };

export default async function PublicLiveMatchPage({
  params,
}: {
  readonly params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const caller = await getServerCaller();
  const match = await caller.public
    .liveMatch({ matchId })
    .catch(() => undefined);
  if (!match) notFound();
  return <PublicLiveScore initialMatch={match} />;
}
