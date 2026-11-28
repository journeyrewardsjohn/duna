import type { Metadata } from "next";
import {
  ScheduleDenied,
  ScheduleFailed,
} from "@/components/schedule/schedule-states";
import { loadSchedule } from "@/components/schedule/schedule-data";
import {
  itemKey,
  parseScheduleQuery,
  placeToday,
} from "@/components/schedule/schedule-model";
import { localDateOf } from "@duna/scheduling";
import {
  ScheduleScreen,
  type ScheduleIntent,
} from "@/components/schedule/schedule-screen";
import { getHqSession, hasScope } from "@/components/shell/hq-session";
import { ShellPage } from "@/components/shell/shell-context";

export const metadata: Metadata = { title: "Schedule" };

const intents = new Set<ScheduleIntent>([
  "book",
  "who",
  "date",
  "close",
  "weather",
]);

type Params = Record<string, string | string[] | undefined>;

/**
 * Schedule (H-SCHEDULE): the one calendar a club owner and the front desk
 * keep open all day. Day or week, by court or by coach, the agenda on a
 * phone; create, move, close and check in without leaving it.
 */
export default async function SchedulePage({
  searchParams,
}: {
  readonly searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const session = await getHqSession();
  if (session.access !== "operator") return null; // the shell says why
  const organization = session.organization?.name ?? "your club";
  const ask = (
    <ShellPage
      askLabel="Schedule"
      askStarters={[
        "Who is free on Thursday at 5 PM?",
        "Which sessions still need players this week?",
        "Block Court 2 every Monday morning for maintenance",
      ]}
    />
  );
  if (!hasScope(session, "sessions:read")) {
    return (
      <div className="sch">
        {ask}
        <ScheduleDenied organization={organization} />
      </div>
    );
  }
  const query = parseScheduleQuery(
    params,
    placeToday(Date.now(), session.organization?.timezone ?? "UTC"),
  );
  const load = await loadSchedule(query);
  const intent = typeof params.intent === "string" ? params.intent : undefined;
  return (
    <div className="sch" data-auto-view={params.view ? undefined : ""}>
      {ask}
      {load.state === "ok" ? (
        <ScheduleScreen
          data={load.data}
          explicitView={params.view !== undefined}
          intent={
            intent && intents.has(intent as ScheduleIntent)
              ? (intent as ScheduleIntent)
              : undefined
          }
          query={
            params.date
              ? query
              : {
                  ...query,
                  // An item opened by address (an old booking link) shows its
                  // own day; otherwise "today" on the place's calendar.
                  date: openedDate(load.data, query.open) ?? load.data.today,
                }
          }
        />
      ) : load.state === "denied" ? (
        <ScheduleDenied organization={organization} />
      ) : (
        <ScheduleFailed reference={load.reference} />
      )}
    </div>
  );
}

function openedDate(
  data: {
    readonly items: readonly {
      source: string;
      id: string;
      startsAt: string;
      timeZone: string;
    }[];
  },
  open: string | undefined,
) {
  if (!open) return undefined;
  const item = data.items.find(
    (candidate) => itemKey(candidate as Parameters<typeof itemKey>[0]) === open,
  );
  return item
    ? localDateOf(Date.parse(item.startsAt), item.timeZone)
    : undefined;
}
