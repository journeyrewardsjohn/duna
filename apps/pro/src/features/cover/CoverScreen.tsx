/**
 * Cover (M-R5): covering for each other.
 *
 * - Ask for cover for one of my sessions (reason optional, reviewed before
 *   it is posted: `AskCoverSheet`).
 * - My sessions that need cover, with their state (needs cover, asked,
 *   covered, nobody free) and who the club has asked.
 * - Colleagues' open needs I could cover, by the shared rule against MY
 *   availability, time away and bookings; and needs where the club already
 *   named me (asked, said yes, assigned, no longer needed).
 * - A manager (who may arrange cover) can take a session the club
 *   suggested them for: `coverageAction` assign, reviewed first. A coach
 *   cannot answer or offer through Duna yet (Needs API: a member's
 *   `respond` / `offer` action), so the phone opens Messages for them to
 *   tell a manager themselves; nothing is sent for them.
 *
 * What happens to pay for a covered session is not stated by the backend,
 * so this screen does not say it.
 */
import { StyleSheet, View } from "react-native";
import {
  EmptyState,
  LoadingState,
  PermissionDeniedState,
  Text,
  useTheme,
} from "@duna/ui/native";
import { useRegionLayout } from "@duna/ui/native/layout";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useProRuntime } from "../../../runtime";
import { Card, SectionHead } from "../../app/ui";
import { useShell } from "../../app/ShellContext";
import { teamAvailabilityDemoCoverageRequests } from "@duna/core/demo/team-availability";
import { NotOnTeam } from "../availability/AvailabilityScreen";
import {
  FailureView,
  FreshLine,
  PaneScroll,
  ToneChip,
  UndoToast,
} from "../availability/parts";
import { toRuleSchedule, type ScheduleRow } from "../availability/team-words";
import {
  useAvailability,
  type AvailabilityData,
} from "../availability/use-availability";
import {
  MyTeamGate,
  keptKey,
  useCachedLoad,
  useMySessions,
  type MyTeam,
} from "../availability/use-my-team";
import { sessionWhenWords, type MySession } from "../availability/week-model";
import { ConfirmSheet } from "../session/ConfirmSheet";
import { ActionButton, Notice } from "../session/parts";
import { AskCoverSheet } from "./AskCoverSheet";
import {
  askedLine,
  coverLists,
  coverReasonLine,
  coverStateCopy,
  myOffer,
  type CoverageRequest,
} from "./cover-model";

export function CoverScreen() {
  return (
    <MyTeamGate>
      {(state) =>
        state.status === "ready" ? (
          <CoverLoader team={state.team} />
        ) : (
          <NotOnTeam />
        )
      }
    </MyTeamGate>
  );
}

function useCoverage(team: MyTeam) {
  const runtime = useProRuntime();
  const client = runtime.client;
  const fetcher = useCallback(async () => {
    if (team.preview || !client) {
      return { requests: [...teamAvailabilityDemoCoverageRequests] };
    }
    return client.operator.teamAvailability.coverageRequests.query({
      from: new Date(Date.now() - 6 * 60 * 60_000).toISOString(),
    });
  }, [client, team.preview]);
  return useCachedLoad(
    keptKey(team, team.preview ? "coverage-preview" : "coverage"),
    fetcher,
    "pro.cover.load_failed",
  );
}

function CoverLoader({ team }: { readonly team: MyTeam }) {
  const availability = useAvailability(team);
  const coverage = useCoverage(team);
  const sessions = useMySessions(team);
  if (coverage.status === "loading" && !coverage.data) {
    return (
      <PaneScroll testID="cover-loading">
        <LoadingState count={3} label="Loading cover" loading skeleton="row" />
      </PaneScroll>
    );
  }
  if (!coverage.data) {
    return (
      <PaneScroll testID="cover-failed">
        <FailureView
          failure={coverage.failure ?? { kind: "error" }}
          onRetry={() => void coverage.reload()}
          what="cover at your club"
        />
      </PaneScroll>
    );
  }
  return (
    <CoverReady
      availability={availability}
      coverage={coverage}
      requests={coverage.data.requests}
      sessions={sessions}
      team={team}
    />
  );
}

function CoverReady({
  team,
  requests,
  coverage,
  availability,
  sessions,
}: {
  readonly team: MyTeam;
  readonly requests: readonly CoverageRequest[];
  readonly coverage: ReturnType<typeof useCoverage>;
  readonly availability: AvailabilityData;
  readonly sessions: readonly MySession[];
}) {
  const { colors } = useTheme();
  const shell = useShell();
  const runtime = useProRuntime();
  const region = useRegionLayout();
  const [asking, setAsking] = useState<MySession | null>(null);
  const [taking, setTaking] = useState<CoverageRequest | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const page = availability.load.data;
  const now = new Date().toISOString();
  const offline =
    (coverage.stale && coverage.failure?.kind === "offline") ||
    (availability.load.stale && availability.load.failure?.kind === "offline");

  const lists = useMemo(
    () =>
      coverLists({
        requests,
        staffProfileId: team.me.staffProfileId,
        myInputs: {
          schedules: (page?.schedules ?? []).map((row) =>
            toRuleSchedule(row as ScheduleRow),
          ),
          blackouts: page?.blackouts ?? [],
          timeOff: page?.timeOff ?? [],
          commitments: sessions.map((session) => ({
            id: session.id,
            kind: "session" as const,
            startsAt: session.startsAt,
            endsAt: session.endsAt,
          })),
        },
        now,
      }),
    [page, requests, sessions, team.me.staffProfileId],
  );

  // My next two weeks, minus sessions already listed for cover.
  const listed = new Set(
    lists.mine.flatMap((request) =>
      request.target.kind === "session" ? [request.target.sessionId] : [],
    ),
  );
  const askable = sessions
    .filter(
      (session) =>
        Date.parse(session.startsAt) > Date.now() &&
        Date.parse(session.startsAt) < Date.now() + 14 * 86_400_000 &&
        !listed.has(session.id),
    )
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));

  const requestCard = (request: CoverageRequest, actions?: ReactNode) => (
    <Card key={request.id} testID={`cover-request-${request.id}`}>
      <View style={styles.rowHead}>
        <View accessible style={styles.flex}>
          <Text variant="phone-body" weight={600}>
            {request.title}
          </Text>
          <Text tone="text-2" variant="phone-meta">
            {sessionWhenWords(request, team.timeZone)}
          </Text>
          <Text tone="text-2" variant="phone-meta">
            {coverReasonLine(request, team.me.staffProfileId)}
          </Text>
          {request.originalStaff?.staffProfileId === team.me.staffProfileId &&
          askedLine(request) ? (
            <Text tone="text-2" variant="phone-meta">
              {askedLine(request)}
            </Text>
          ) : null}
        </View>
        <ToneChip copy={coverStateCopy(request, team.me.staffProfileId)} />
      </View>
      {actions}
    </Card>
  );

  const mine = (
    <View style={styles.block} testID="cover-mine">
      <SectionHead title="Your sessions" />
      {lists.mine.length === 0 ? (
        <Text tone="text-2" variant="phone-body">
          None of your sessions needs cover.
        </Text>
      ) : (
        lists.mine.map((request) => requestCard(request))
      )}
      <SectionHead title="Ask for cover" />
      {askable.length === 0 ? (
        <Text tone="text-2" variant="phone-body">
          No sessions of yours in the next two weeks.
        </Text>
      ) : (
        askable.slice(0, 12).map((session) => (
          <Card key={session.id} testID={`cover-askable-${session.id}`}>
            <View accessible style={styles.flex}>
              <Text variant="phone-body" weight={600}>
                {session.title}
              </Text>
              <Text tone="text-2" variant="phone-meta">
                {[sessionWhenWords(session, team.timeZone), session.venueName]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
            <ActionButton
              disabled={offline}
              hint="Reviews the ask before it is posted"
              icon="users"
              label="Ask for cover"
              onPress={() => setAsking(session)}
              testID={`cover-ask-${session.id}`}
            />
          </Card>
        ))
      )}
    </View>
  );

  const tellManager = () => shell.open("messages");
  const others = team.coaches ? (
    <View style={styles.block} testID="cover-others">
      {lists.offered.length > 0 ? (
        <>
          <SectionHead title="Your club asked you" />
          {lists.offered.map((request) => {
            const offer = myOffer(request, team.me.staffProfileId)!;
            const open =
              (request.status === "open" ||
                request.status === "asking" ||
                request.status === "nobody-free") &&
              (offer.status === "suggested" ||
                offer.status === "asked" ||
                offer.status === "accepted");
            return requestCard(
              request,
              open ? (
                team.manages ? (
                  <ActionButton
                    disabled={offline}
                    hint="Reviews it before the session moves to you"
                    icon="check"
                    kind="primary"
                    label="Take this session"
                    onPress={() => setTaking(request)}
                    testID={`cover-take-${request.id}`}
                  />
                ) : (
                  <ActionButton
                    hint="Opens Messages; you write and send it"
                    icon="message"
                    label="Tell a manager you can"
                    onPress={tellManager}
                    testID={`cover-tell-${request.id}`}
                  />
                )
              ) : undefined,
            );
          })}
        </>
      ) : null}
      <SectionHead title="You could cover" />
      {lists.couldCover.length === 0 ? (
        <EmptyState
          compact
          text="Open sessions show here when you're free for the whole session, by your hours, time away and bookings."
          title="Nothing you're free for"
        />
      ) : (
        lists.couldCover.map((request) =>
          requestCard(
            request,
            <ActionButton
              hint="Opens Messages; you write and send it"
              icon="message"
              label="Tell a manager you can"
              onPress={tellManager}
              testID={`cover-tell-${request.id}`}
            />,
          ),
        )
      )}
      <Text tone="text-2" variant="phone-meta">
        A manager assigns cover. Offering from the phone is coming; for now,
        tell a manager and they can assign you in Duna.
      </Text>
    </View>
  ) : (
    <PermissionDeniedState
      compact
      what="covering sessions"
      who="the owner or a manager if you coach, to give you a coaching role"
    />
  );

  const fresh = (
    <FreshLine
      failure={coverage.failure}
      lastFreshAt={coverage.lastFreshAt}
      onRetry={() => void coverage.reload()}
      stale={coverage.stale}
    />
  );
  const twoColumns =
    region.layout.paneCount >= 2 && region.layout.mode !== "tabletop";

  return (
    <View
      onLayout={region.onLayout}
      ref={region.ref}
      style={[styles.fill, { backgroundColor: colors.ground }]}
      testID="cover-screen"
    >
      {twoColumns ? (
        <View style={styles.columns}>
          <View style={styles.fill}>
            <PaneScroll testID="cover-mine-column">
              {fresh}
              {mine}
            </PaneScroll>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.line }]} />
          <View style={styles.fill}>
            <PaneScroll testID="cover-others-column">{others}</PaneScroll>
          </View>
        </View>
      ) : (
        <PaneScroll testID="cover-scroll">
          {fresh}
          {offline ? (
            <Notice
              text="Asking for cover needs a connection."
              title="You're offline"
              tone="warning"
            />
          ) : null}
          {mine}
          {others}
        </PaneScroll>
      )}
      <AskCoverSheet
        onClose={() => setAsking(null)}
        onDone={(text) => {
          setToast(text);
          void coverage.reload();
        }}
        session={asking}
        timeZone={team.timeZone}
        writes={availability.writes}
      />
      <ConfirmSheet
        description="The session moves to you once Duna checks you're still free. The other people asked are told it's no longer needed."
        event="pro.cover.assign_failed"
        onClose={() => setTaking(null)}
        onDone={() => {
          setToast("It's yours. The session is on your schedule.");
          void coverage.reload();
          void runtime.refresh();
        }}
        perform={async () => {
          if (!taking) return;
          const offer = myOffer(taking, team.me.staffProfileId);
          if (!offer) throw new Error("You're not suggested for this session.");
          if (team.preview || !runtime.client) {
            coverage.replace({
              requests: requests.map((request) =>
                request.id === taking.id
                  ? {
                      ...request,
                      status: "covered" as const,
                      coveredBy: offer.staff,
                      offers: request.offers.map((row) =>
                        row.id === offer.id
                          ? { ...row, status: "assigned" as const }
                          : row,
                      ),
                    }
                  : request,
              ),
            });
            return;
          }
          await runtime.client.operator.teamAvailability.coverageAction.mutate({
            action: "assign",
            requestId: taking.id,
            offerId: offer.id,
          });
        }}
        rows={
          taking
            ? [
                { label: "Session", value: taking.title },
                {
                  label: "When",
                  value: sessionWhenWords(taking, team.timeZone),
                },
                {
                  label: "From",
                  value: taking.originalStaff?.displayName ?? "No coach",
                },
              ]
            : []
        }
        testID="cover-take-sheet"
        tier={2}
        title="Take this session?"
        verb="Take it"
        visible={taking !== null}
      />
      <UndoToast onDismiss={() => setToast(null)} text={toast} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1, gap: 2 },
  columns: { flex: 1, flexDirection: "row" },
  divider: { width: StyleSheet.hairlineWidth },
  block: { gap: 10 },
  rowHead: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
});
