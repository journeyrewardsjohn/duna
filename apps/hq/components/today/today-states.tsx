import {
  Button,
  ErrorState,
  Skeleton,
  SkeletonListRow,
} from "@duna/ui/tideline";
import { AccessDeniedState } from "@/lib/access-state";

/**
 * Loading and failure states for Today's blocks, shaped like what they
 * replace (W-Today-Loading). Skeletons stay unseen for 250 ms (the kit's
 * LOADING_DELAY_MS, applied in today.css) so a fast load never flashes.
 */

export function BlockSkeleton({
  label,
  rows = 3,
  avatar = true,
}: {
  readonly label: string;
  readonly rows?: number;
  readonly avatar?: boolean;
}) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="today-skeleton"
      role="status"
    >
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonListRow avatar={avatar} key={index} lines={2} />
      ))}
    </div>
  );
}

export function GlanceSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading today's numbers"
      className="today-glance today-skeleton"
      role="status"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div className="today-kpi" key={index}>
          <Skeleton kind="lines" lines={3} />
        </div>
      ))}
    </div>
  );
}

/** The whole screen while it loads (route-level `loading.tsx`). */
export function TodayLoading() {
  return (
    <div className="today" aria-busy="true">
      <div className="hqs-page-head">
        <div className="hqs-page-head__row">
          <div className="hqs-page-head__text">
            <Skeleton kind="lines" label="Loading Today" lines={2} />
          </div>
        </div>
      </div>
      <GlanceSkeleton />
      <div className="today-cols">
        <div className="today-col today-col--main">
          <div className="hqs-section">
            <BlockSkeleton label="Loading the schedule" rows={4} />
          </div>
        </div>
        <div className="today-col">
          <div className="hqs-section">
            <BlockSkeleton label="Loading what needs you" rows={3} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** A block that failed: what happened, the reference, a way to try again. */
export function BlockError({
  what,
  reference,
}: {
  readonly what: string;
  readonly reference: string;
}) {
  return (
    <ErrorState
      action={
        <Button href="/" size="sm" variant="secondary">
          Reload Today
        </Button>
      }
      compact
      message="Something went wrong on our side. Reload to try again; the rest of Today still works."
      reference={reference}
      title={`Could not load ${what}`}
    />
  );
}

/** A block this person's role cannot see. */
export function BlockDenied({
  area,
  organization,
}: {
  readonly area: string;
  readonly organization: string;
}) {
  return (
    <AccessDeniedState
      area={area}
      compact
      grantedBy={`an owner of ${organization}`}
    />
  );
}
