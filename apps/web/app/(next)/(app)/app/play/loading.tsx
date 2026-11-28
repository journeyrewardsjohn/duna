import "@/components/player/player.css";

import { SkeletonCard } from "@duna/ui/tideline";

/** Play loading: the head, the tabs and two plans, never a blank screen. */
export default function PlayLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading your plans"
      className="pp"
      role="status"
    >
      <div className="pp-head">
        <span className="td-skel pp-skel-title" />
        <span className="td-skel pp-skel-line" />
      </div>
      <span className="td-skel pp-skel-tabs" />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
