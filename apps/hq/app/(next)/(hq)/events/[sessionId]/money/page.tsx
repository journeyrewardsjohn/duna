import { AccessDeniedState } from "@/lib/access-state";
import { EventMoney } from "@/components/events/event-money";
import { EventScreen, eventPage } from "@/components/events/event-screen";

/**
 * An event › Money: collected, refunded and kept, each order and its
 * refund. Only for roles that see payments (as in Schedule and People);
 * anyone else reaching the address gets "You need access".
 */
export default async function EventMoneyPage({
  params,
}: {
  readonly params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const found = await eventPage(sessionId);
  if (found.kind === "state") return found.node;
  const { loaded } = found;
  return (
    <EventScreen
      askStarters={
        loaded.context.permissions.money
          ? ["How much has this event made?", "Who was refunded?"]
          : []
      }
      loaded={loaded}
      tab="money"
    >
      {loaded.context.permissions.money ? (
        <EventMoney
          approvals={loaded.approvals}
          capabilities={loaded.context.capabilities}
          permissions={loaded.context.permissions}
          view={loaded.view}
        />
      ) : (
        <div className="hqs-state">
          <AccessDeniedState
            area="Event money"
            grantedBy={`an owner of ${loaded.context.organization}`}
          />
        </div>
      )}
    </EventScreen>
  );
}
