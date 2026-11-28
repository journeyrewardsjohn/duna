import { Skeleton, SkeletonListRow } from "@duna/ui/tideline";

/** Offerings while the first read lands: the title row and a list, as skeletons. */
export default function Loading() {
  return (
    <div aria-busy="true" className="of">
      <div className="hqs-page-head">
        <div className="hqs-page-head__row">
          <div className="hqs-page-head__text">
            <Skeleton kind="lines" label="Loading offerings" lines={2} />
          </div>
        </div>
      </div>
      <div className="hqs-section" role="status" aria-label="Loading">
        {Array.from({ length: 5 }, (_, index) => (
          <SkeletonListRow avatar={false} key={index} lines={2} />
        ))}
      </div>
    </div>
  );
}
