import "server-only";

import { headers } from "next/headers";
import { getAppSession, loadDashboard } from "@/components/app-shell/session";
import type { AppSession } from "@/components/app-shell/session-types";
import { getServerCaller } from "@/lib/api";
import { settleServerRead, type ServerRead } from "@/lib/server-read";
import { buildAgenda, type Agenda } from "../agenda-model";
import type { CatalogBooking } from "../api-types";
import { demoPlans, demoPlansScope, demoWithoutDatabase } from "../demo";

export interface PlayData {
  readonly session: AppSession;
  readonly agenda: Agenda;
  /** Lessons and clinics could not be read: the rest still shows. */
  readonly catalogMissing?: { readonly reference: string };
  readonly viewerTimeZone: string;
}

/**
 * Everything Play shows, from the reads Home already makes (the dashboard's
 * bookings and the catalog session bookings, upcoming and past). The
 * dashboard is required; the catalog list is a part that can fail alone.
 */
export async function loadPlay(): Promise<ServerRead<PlayData>> {
  const session = await getAppSession();
  const caller = await getServerCaller();
  const viewerTimeZone =
    (await headers()).get("x-vercel-ip-timezone") ?? "America/Los_Angeles";
  return settleServerRead(async () => {
    const noDatabase = demoWithoutDatabase(session.demo);
    const [dashboard, catalog] = await Promise.all([
      loadDashboard(),
      noDatabase
        ? Promise.resolve<ServerRead<readonly CatalogBooking[]>>({
            ok: true,
            value: [],
          })
        : settleServerRead(
            async () => [
              ...(await caller.player.catalogSessionBookings({
                scope: "upcoming",
                includeDependents: true,
                limit: 100,
              })),
              ...(await caller.player.catalogSessionBookings({
                scope: "past",
                includeDependents: true,
                limit: 20,
              })),
            ],
            "web.play.catalog_failed",
          ),
    ]);
    const scope = await demoPlansScope();
    const sample =
      scope && noDatabase
        ? demoPlans({
            scope,
            now: Date.now(),
            juniors: session.dependents.map((dependent) => ({
              personId: dependent.personId,
              displayName: dependent.displayName,
            })),
          })
        : null;
    const person = session.person!;
    const agenda = buildAgenda({
      person: { id: dashboard.player.id, displayName: person.displayName },
      actingFor: session.actingFor,
      dependents: session.dependents,
      bookings: sample ? sample.bookings : dashboard.bookings,
      catalog: [
        ...(catalog.ok ? catalog.value : []),
        ...(sample?.catalog ?? []),
      ],
      now: Date.now(),
      viewerTimeZone,
      adult: !session.junior,
    });
    return {
      session,
      agenda,
      ...(catalog.ok
        ? {}
        : { catalogMissing: { reference: catalog.reference } }),
      viewerTimeZone,
    };
  }, "web.play.read_failed");
}
