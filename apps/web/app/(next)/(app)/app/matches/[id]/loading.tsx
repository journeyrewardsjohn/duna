import "@/components/player/player.css";

import { SkeletonCard, SkeletonDetailHeader } from "@duna/ui/tideline";

/** A result loading: its header and the score card. */
export default function MatchLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading the result"
      className="pp"
      role="status"
    >
      <SkeletonDetailHeader />
      <SkeletonCard />
    </div>
  );
}
