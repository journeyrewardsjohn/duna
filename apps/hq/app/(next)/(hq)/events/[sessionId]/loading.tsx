import { SkeletonDetailHeader, SkeletonListRow } from "@duna/ui/tideline";

/** An event while it loads: its header and a list, as skeletons. */
export default function Loading() {
  return (
    <div aria-busy="true" className="ev">
      <SkeletonDetailHeader />
      <div aria-label="Loading" className="hqs-section" role="status">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonListRow avatar={false} key={index} lines={2} />
        ))}
      </div>
    </div>
  );
}
