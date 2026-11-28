import "@/components/player/player.css";

import { SkeletonCard, SkeletonListRow } from "@duna/ui/tideline";

/** Results loading: the rating, the form and a few rows. */
export default function MatchesLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading your results"
      className="pp"
      role="status"
    >
      <div className="pp-head">
        <span className="td-skel pp-skel-title" />
        <span className="td-skel pp-skel-line" />
      </div>
      <div className="pp-split">
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonListRow />
      <SkeletonListRow />
      <SkeletonListRow />
    </div>
  );
}
