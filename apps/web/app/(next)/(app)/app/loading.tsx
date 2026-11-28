import { SkeletonCard } from "@duna/ui/tideline";

/** While a page loads: its shape inside the shell, never a blank screen. */
export default function PlayerAppLoading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="aph" role="status">
      <div className="aph-head">
        <span className="td-skel aph-skel-line" />
        <span className="td-skel aph-skel-title" />
      </div>
      <div className="aph-split">
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonCard />
    </div>
  );
}
