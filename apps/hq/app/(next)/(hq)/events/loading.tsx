import { Skeleton, SkeletonListRow } from "@duna/ui/tideline";

/** Events while the first read lands: the title row and a list, as skeletons. */
export default function Loading() {
  return (
    <div aria-busy="true" className="ev">
      <div className="hqs-page-head">
        <div className="hqs-page-head__row">
          <div className="hqs-page-head__text">
            <Skeleton kind="lines" label="Loading events" lines={2} />
          </div>
        </div>
      </div>
      <div aria-label="Loading" className="hqs-section" role="status">
        {Array.from({ length: 5 }, (_, index) => (
          <SkeletonListRow avatar={false} key={index} lines={2} />
        ))}
      </div>
    </div>
  );
}
