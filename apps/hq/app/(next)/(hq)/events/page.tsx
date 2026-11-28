import { ErrorState } from "@duna/ui/tideline";
import { Suspense } from "react";
import { AccessDeniedState } from "@/lib/access-state";
import { loadEventList } from "@/components/events/events-data";
import { EventsList } from "@/components/events/events-list";
import { getHqSession, hasScope } from "@/components/shell/hq-session";
import { ShellPage } from "@/components/shell/shell-context";

/**
 * Events (H-EVENTS): what is live now, what is coming, what has finished
 * and the drafts. Tournaments, leagues, clinics and open play are in-page
 * filters (`?type=`); Leagues is `/events?type=league`.
 */
export default async function EventsPage() {
  const session = await getHqSession();
  if (session.access !== "operator") return null; // the shell says why
  const ask = (
    <ShellPage
      askLabel="Events"
      askStarters={[
        "Which events still have places?",
        "Who is on the waitlist for Saturday's tournament?",
        "Draft a reminder for this weekend's entrants",
      ]}
    />
  );
  if (!hasScope(session, "sessions:read")) {
    return (
      <div className="ev">
        {ask}
        <AccessDeniedState area="Events" />
      </div>
    );
  }
  const load = await loadEventList();
  return (
    <div className="ev">
      {ask}
      {load.state === "ok" ? (
        // useSearchParams in the list: the filters read the address.
        <Suspense>
          <EventsList
            approvals={load.approvals}
            canCreate={load.context.permissions.change}
            organization={load.context.organization}
            rows={load.rows}
          />
        </Suspense>
      ) : load.state === "denied" ? (
        <AccessDeniedState area="Events" />
      ) : (
        <ErrorState
          message="Your events didn't load. Nothing was changed."
          reference={load.reference}
          title="Events are unavailable"
        />
      )}
    </div>
  );
}
