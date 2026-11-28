import { Button, ErrorState, Skeleton } from "@duna/ui/tideline";
import { AccessDeniedState } from "@/lib/access-state";
import { PageHeader } from "../shell/page-header";

/**
 * Schedule's honest states: loading (the real frame, so nothing shifts when
 * the day arrives), you need access, and a failure with its reference.
 */
export function ScheduleLoading() {
  return (
    <div aria-busy="true" className="sch">
      <PageHeader description="Loading the day" title="Schedule" />
      <Skeleton kind="lines" label="Loading the schedule" lines={2} />
      <div className="sch-grid sch-skeleton" />
    </div>
  );
}

export function ScheduleDenied({
  organization,
}: {
  readonly organization: string;
}) {
  return (
    <>
      <PageHeader title="Schedule" />
      <div className="hqs-state">
        <AccessDeniedState
          action={
            <Button href="/" variant="secondary">
              Back to Today
            </Button>
          }
          area="Schedule"
          grantedBy={`an owner of ${organization}`}
        />
      </div>
    </>
  );
}

export function ScheduleFailed({ reference }: { readonly reference: string }) {
  return (
    <>
      <PageHeader title="Schedule" />
      <div className="hqs-state">
        <ErrorState
          message="Your bookings are safe. Try again in a moment; if it keeps happening, give support the reference."
          reference={reference}
          title="The schedule didn't load"
        />
      </div>
    </>
  );
}
