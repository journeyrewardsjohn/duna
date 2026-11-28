/**
 * A person's page (M-R4): one open object, read from the procedures HQ's
 * People area uses: `operator.memberProfile` (plan, credits, bookings,
 * purchases, `healthAccess.canView` and never a health value),
 * `operator.people.household` (guardians and juniors, the guardian rule)
 * and `operator.people.notes` (notes not tied to a session).
 *
 * Order: who they are (avatar, roles, Sand Rating), the next best action,
 * then plan and credits, bookings, family and notes. Message, collect a
 * payment for them and add a note are one tap away. Each section has its
 * own loading, empty and error state; a failed section never hides the rest.
 */
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  AdaptiveSheet,
  EmptyState,
  ErrorState,
  LoadingState,
  Numerals,
  Rise,
  Text,
  ThemeOverride,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { RatingRing } from "@duna/ui/native/score";
import { useProRuntime } from "../../../runtime";
import { useShell } from "../../app/ShellContext";
import { IconButton, SectionHead, usePaneEdges } from "../../app/ui";
import { Avatar } from "../../shared/Avatar";
import { formatCredits, formatMoney } from "../../shared/money-format";
import { DunaTextInput } from "../session/duna-text";
import { classifyFailure, type Failure } from "../session/failure";
import { ActionButton, Notice } from "../session/parts";
import {
  guardianRule,
  nextBestAction,
  roleWord,
  shortWhen,
  type HouseholdInput,
  type ProfileInput,
} from "./people-model";
import { useRoster } from "./use-roster";

type Load<T> =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: T }
  | { readonly status: "failed"; readonly failure: Failure };

interface ProfileData extends ProfileInput {
  readonly plans: readonly (ProfileInput["plans"][number] & {
    readonly id: string;
    readonly interval: string;
    readonly priceMinor: number;
    readonly currency: string;
    readonly currentPeriodEndsAt?: string;
  })[];
  readonly creditGrants: readonly (ProfileInput["creditGrants"][number] & {
    readonly id: string;
    readonly expiresAt?: string;
  })[];
  readonly sessions: readonly (ProfileInput["sessions"][number] & {
    readonly id: string;
    readonly venueName?: string;
    readonly attendanceStatus?: string;
  })[];
  readonly healthAccess: { readonly canView: boolean };
}

interface NoteData {
  readonly id: string;
  readonly body: string;
  readonly author: { readonly displayName: string };
  readonly createdAt: string;
}

interface HouseholdData extends HouseholdInput {
  readonly guardians: readonly (HouseholdInput["guardians"][number] & {
    readonly personId: string;
    readonly relationship: string;
  })[];
  readonly juniors: readonly {
    readonly personId: string;
    readonly displayName: string;
  }[];
}

function usePersonData(personId: string | undefined) {
  const runtime = useProRuntime();
  const roster = useRoster();
  const [profile, setProfile] = useState<Load<ProfileData>>({
    status: "loading",
  });
  const [household, setHousehold] = useState<Load<HouseholdData>>({
    status: "loading",
  });
  const [notes, setNotes] = useState<Load<readonly NoteData[]>>({
    status: "loading",
  });
  const generation = useRef(0);
  const client = runtime.client;
  const live = runtime.mode === "live" && Boolean(client);

  const load = useCallback(async () => {
    if (!personId) return;
    const current = ++generation.current;
    if (!live || !client) {
      const relationship = roster.relationship(personId);
      const member = roster.member(personId);
      setProfile({
        status: "ready",
        data: {
          relationship: {
            personId,
            displayName: member?.displayName ?? "Player",
            isMinor: Boolean(member?.isMinor),
            roles: member?.roles ?? ["player"],
            status: relationship?.status ?? "active",
            creditBalance: relationship?.creditBalance ?? 0,
            upcomingCount: relationship?.upcomingCount ?? 0,
            churnRisk: relationship?.churnRisk ?? { level: "low", reasons: [] },
            ...(relationship?.membershipName
              ? { membershipName: relationship.membershipName }
              : {}),
          },
          plans: relationship?.membershipName
            ? [
                {
                  id: "preview-plan",
                  name: relationship.membershipName,
                  status: "active",
                  cancelAtPeriodEnd: false,
                  interval: "month",
                  priceMinor: 12_900,
                  currency: "USD",
                },
              ]
            : [],
          creditGrants: relationship?.creditBalance
            ? [
                {
                  id: "preview-credits",
                  remainingCredits: relationship.creditBalance,
                  status: "active",
                },
              ]
            : [],
          sessions: [],
          healthAccess: { canView: false },
        },
      });
      setHousehold({
        status: "ready",
        data: {
          guardians: member?.isMinor
            ? [
                {
                  personId: "preview-guardian",
                  displayName: "Dana Moss",
                  relationship: "Parent",
                  reviewStatus: "verified",
                  contacted: true,
                },
              ]
            : [],
          juniors: [],
        },
      });
      setNotes({ status: "ready", data: [] });
      return;
    }
    const settle = async <T,>(
      call: () => Promise<T>,
      set: (value: Load<T>) => void,
      event: string,
    ) => {
      try {
        const data = await call();
        if (current === generation.current) set({ status: "ready", data });
      } catch (error) {
        if (current === generation.current)
          set({ status: "failed", failure: classifyFailure(error, event) });
      }
    };
    await Promise.all([
      settle(
        () =>
          client.operator.memberProfile.query({
            personId,
          }) as Promise<ProfileData>,
        setProfile,
        "pro.people.profile_failed",
      ),
      settle(
        () =>
          client.operator.people.household.query({
            personId,
          }) as Promise<HouseholdData>,
        setHousehold,
        "pro.people.household_failed",
      ),
      settle(
        async () =>
          (await client.operator.people.notes.list.query({ personId })).notes,
        setNotes,
        "pro.people.notes_failed",
      ),
    ]);
  }, [client, live, personId, roster]);

  useEffect(() => {
    setProfile({ status: "loading" });
    setHousehold({ status: "loading" });
    setNotes({ status: "loading" });
    void load();
    // The roster changes identity on refresh; reload only for a new person.
  }, [personId, live]);

  return { profile, household, notes, reload: load, live, setNotes };
}

export function PersonScreen({ personId }: { readonly personId?: string }) {
  const shell = useShell();
  const roster = useRoster();
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  const { profile, household, notes, reload, live, setNotes } =
    usePersonData(personId);
  const [noting, setNoting] = useState(false);
  const row = personId
    ? roster.rows.find((candidate) => candidate.id === personId)
    : undefined;

  if (!personId || (!row && profile.status === "failed")) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.ground }]}>
        <EmptyState
          text="They may have left the club, or the link is out of date."
          title="Person not found"
        />
      </View>
    );
  }

  const name =
    profile.status === "ready"
      ? profile.data.relationship.displayName
      : (row?.name ?? "");
  const first = name.split(/\s+/)[0] ?? name;
  const isMinor =
    profile.status === "ready"
      ? profile.data.relationship.isMinor
      : row?.chip?.label === "Junior";
  const roles =
    profile.status === "ready" ? profile.data.relationship.roles : [];
  const action =
    profile.status === "ready"
      ? nextBestAction(
          profile.data,
          household.status === "ready" ? household.data : null,
          Date.now(),
        )
      : null;

  const runAction = (kind: "message" | "collect" | "note") => {
    if (kind === "message") shell.open("messages", { personId });
    else if (kind === "collect") shell.open("getPaid", { personId });
    else setNoting(true);
  };

  return (
    <View
      style={[styles.fill, { backgroundColor: colors.ground }]}
      testID="person-screen"
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: tokens.space["4"],
          paddingBottom: edges.bottom + tokens.space["8"],
          paddingLeft: edges.left + tokens.space["4"],
          paddingRight: edges.right + tokens.space["4"],
          gap: tokens.space["5"],
        }}
      >
        <View style={styles.hero}>
          <Avatar
            id={personId}
            initials={row?.initials ?? "·"}
            size={72}
            url={row?.avatarUrl}
          />
          <View style={styles.heroText}>
            <Text accessibilityRole="header" variant="phone-heading">
              {name}
            </Text>
            <Text tone="text-2" variant="phone-meta">
              {[
                ...(roles.length ? roles : ["player"]).map(roleWord),
                isMinor ? "Junior" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
          {row ? (
            <RatingRing
              reliability={row.rating.reliability}
              size={64}
              value={row.rating.value}
            />
          ) : null}
        </View>

        <View style={styles.quick}>
          <ActionButton
            icon="message"
            label="Message"
            onPress={() => runAction("message")}
            style={styles.grow}
            testID="person-message"
          />
          <ActionButton
            icon="tap-to-pay"
            label="Collect"
            onPress={() => runAction("collect")}
            style={styles.grow}
            testID="person-collect"
          />
          <ActionButton
            icon="lesson"
            label="Note"
            onPress={() => runAction("note")}
            style={styles.grow}
            testID="person-note"
          />
        </View>

        {profile.status === "loading" ? (
          <LoadingState
            count={3}
            label={`Loading ${first}'s page`}
            loading
            skeleton="card"
          />
        ) : profile.status === "failed" ? (
          <ErrorState
            compact
            onRetry={() => void reload()}
            reference={profile.failure.reference}
            text={
              profile.failure.kind === "denied"
                ? "You don't have permission to see this person's details."
                : "Their plan and bookings didn't load. Nothing was changed."
            }
            title="Couldn't load this page"
          />
        ) : (
          <>
            {action ? (
              <Rise trigger={action.title}>
                <ThemeOverride theme="dark">
                  <NextAction action={action} onAction={runAction} />
                </ThemeOverride>
              </Rise>
            ) : null}
            <PlanSection data={profile.data} />
            <BookingsSection data={profile.data} timeZone={roster.timeZone} />
          </>
        )}

        <View style={styles.section}>
          <SectionHead title="Family" />
          {household.status === "loading" ? (
            <LoadingState
              count={1}
              label="Loading family"
              loading
              skeleton="row"
            />
          ) : household.status === "failed" ? (
            <Notice
              text={
                household.failure.reference
                  ? `Reference ${household.failure.reference}`
                  : undefined
              }
              title="Family didn't load"
              tone="warning"
            />
          ) : (
            <>
              <Text tone="text-2" variant="phone-body">
                {guardianRule(name, Boolean(isMinor), household.data)}
              </Text>
              {[
                ...household.data.guardians.map((guardian) => ({
                  id: guardian.personId,
                  name: guardian.displayName,
                  meta: `${guardian.relationship} · ${guardian.reviewStatus === "verified" ? "verified guardian" : guardian.reviewStatus === "pending" ? "waiting to be verified" : "not approved"}`,
                })),
                ...household.data.juniors.map((junior) => ({
                  id: junior.personId,
                  name: junior.displayName,
                  meta: "Junior in their care",
                })),
              ].map((person) => (
                <View key={person.id} style={styles.familyRow}>
                  <Avatar
                    id={person.id}
                    initials={person.name
                      .split(/\s+/)
                      .map((part) => part[0])
                      .join("")}
                    size={36}
                  />
                  <View style={styles.grow}>
                    <Text numberOfLines={1} variant="phone-body" weight={600}>
                      {person.name}
                    </Text>
                    <Text numberOfLines={1} tone="text-2" variant="phone-meta">
                      {person.meta}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </View>

        <View style={styles.section}>
          <SectionHead
            action="Add note"
            onAction={() => setNoting(true)}
            title="Notes"
          />
          {notes.status === "loading" ? (
            <LoadingState
              count={2}
              label="Loading notes"
              loading
              skeleton="row"
            />
          ) : notes.status === "failed" ? (
            <Notice
              text={
                notes.failure.reference
                  ? `Reference ${notes.failure.reference}`
                  : undefined
              }
              title="Notes didn't load"
              tone="warning"
            />
          ) : notes.data.length ? (
            notes.data.map((note) => (
              <View
                key={note.id}
                style={[
                  styles.note,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.line,
                    borderRadius: tokens.radius.lg,
                  },
                ]}
              >
                <Text variant="phone-body">{note.body}</Text>
                <Text tone="text-2" variant="phone-meta">
                  {`${note.author.displayName} · ${shortWhen(note.createdAt, roster.timeZone)}`}
                </Text>
              </View>
            ))
          ) : (
            <Text tone="text-2" variant="phone-meta">
              No notes yet. Notes are for your club's staff; {first} doesn't see
              them.
            </Text>
          )}
        </View>

        {profile.status === "ready" && profile.data.healthAccess.canView ? (
          <Notice
            text={`${first} shares health information with you. Open it in HQ People; each view is recorded.`}
            title="Health is shared with you"
            tone="info"
          />
        ) : null}
      </ScrollView>
      <NoteSheet
        live={live}
        onClose={() => setNoting(false)}
        onSaved={(note) =>
          setNotes((current) =>
            current.status === "ready"
              ? { status: "ready", data: [note, ...current.data] }
              : current,
          )
        }
        personId={personId}
        personName={first}
        visible={noting}
      />
    </View>
  );
}

function NextAction({
  action,
  onAction,
}: {
  readonly action: ReturnType<typeof nextBestAction>;
  readonly onAction: (kind: "message" | "collect" | "note") => void;
}) {
  const { colors, tokens } = useTheme();
  return (
    <View
      accessibilityLabel={`Next best action: ${action.title}. ${action.text}`}
      style={[
        styles.next,
        { backgroundColor: colors.ground, borderRadius: tokens.radius.xl },
      ]}
      testID="person-next-action"
    >
      <Text
        family="mono"
        style={{ color: tokens.brand.dune }}
        variant="micro"
        weight={600}
      >
        NEXT BEST ACTION
      </Text>
      <Text variant="phone-heading">{action.title}</Text>
      <Text tone="text-2" variant="phone-body">
        {action.text}
      </Text>
      {action.action && action.actionLabel ? (
        <ActionButton
          kind="primary"
          label={action.actionLabel}
          onPress={() => onAction(action.action!)}
          testID="person-next-action-button"
        />
      ) : null}
    </View>
  );
}

function PlanSection({ data }: { readonly data: ProfileData }) {
  const { colors, tokens } = useTheme();
  const credits = data.creditGrants
    .filter((grant) => grant.status === "active")
    .reduce((sum, grant) => sum + grant.remainingCredits, 0);
  const plans = data.plans.filter(
    (plan) => plan.status !== "canceled" && plan.status !== "cancelled",
  );
  return (
    <View style={styles.section}>
      <SectionHead title="Plan and credits" />
      <View
        style={[
          styles.figures,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            borderRadius: tokens.radius.xl,
          },
        ]}
      >
        <View style={styles.figure}>
          <Numerals variant="figure-sm">{String(credits)}</Numerals>
          <Text tone="text-2" variant="phone-meta">
            credits left
          </Text>
        </View>
        <View style={styles.figure}>
          <Numerals variant="figure-sm">
            {String(data.relationship.upcomingCount)}
          </Numerals>
          <Text tone="text-2" variant="phone-meta">
            upcoming
          </Text>
        </View>
      </View>
      {plans.length ? (
        plans.map((plan) => (
          <View key={plan.id} style={styles.line}>
            <View style={styles.grow}>
              <Text numberOfLines={1} variant="phone-body" weight={600}>
                {plan.name}
              </Text>
              <Text numberOfLines={1} tone="text-2" variant="phone-meta">
                {plan.cancelAtPeriodEnd
                  ? "Ends at the end of this period"
                  : plan.status === "active"
                    ? "Active"
                    : plan.status}
              </Text>
            </View>
            <Text tabular variant="phone-body" weight={600}>
              {`${formatMoney(plan.priceMinor, plan.currency)} / ${plan.interval}`}
            </Text>
          </View>
        ))
      ) : (
        <Text tone="text-2" variant="phone-meta">
          No plan.{" "}
          {credits
            ? `${formatCredits(credits)} to book with.`
            : "Nothing to book with yet."}
        </Text>
      )}
    </View>
  );
}

function BookingsSection({
  data,
  timeZone,
}: {
  readonly data: ProfileData;
  readonly timeZone: string;
}) {
  const now = Date.now();
  const upcoming = data.sessions
    .filter(
      (session) =>
        session.status !== "cancelled" && Date.parse(session.startsAt) > now,
    )
    .toSorted((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 5);
  const past = data.sessions
    .filter((session) => Date.parse(session.startsAt) <= now)
    .toSorted((a, b) => b.startsAt.localeCompare(a.startsAt))
    .slice(0, 3);
  const line = (session: ProfileData["sessions"][number], label: string) => (
    <View key={session.id} style={styles.line}>
      <View style={styles.grow}>
        <Text numberOfLines={1} variant="phone-body" weight={600}>
          {session.title}
        </Text>
        <Text numberOfLines={1} tone="text-2" variant="phone-meta">
          {[shortWhen(session.startsAt, timeZone), session.venueName]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <Text numberOfLines={1} tone="text-2" variant="phone-meta">
        {label}
      </Text>
    </View>
  );
  return (
    <View style={styles.section}>
      <SectionHead title="Bookings" />
      {upcoming.length || past.length ? (
        <>
          {upcoming.map((session) => line(session, "Booked"))}
          {past.map((session) =>
            line(
              session,
              session.attendanceStatus === "attended"
                ? "Came"
                : session.attendanceStatus === "no-show"
                  ? "Missed"
                  : "Past",
            ),
          )}
        </>
      ) : (
        <Text tone="text-2" variant="phone-meta">
          No sessions booked yet.
        </Text>
      )}
    </View>
  );
}

function NoteSheet({
  visible,
  onClose,
  personId,
  personName,
  live,
  onSaved,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly personId: string;
  readonly personName: string;
  readonly live: boolean;
  readonly onSaved: (note: NoteData) => void;
}) {
  const { client } = useProRuntime();
  const haptics = useHaptics();
  const { tokens } = useTheme();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const key = useRef<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    setBody("");
    setFailure(null);
    key.current = null;
  }, [visible]);
  const save = async () => {
    if (busy || !body.trim()) return;
    if (!live || !client) {
      onSaved({
        id: `preview-${Date.now()}`,
        body: body.trim(),
        author: { displayName: "You" },
        createdAt: new Date().toISOString(),
      });
      onClose();
      return;
    }
    key.current ??= Crypto.randomUUID();
    setBusy(true);
    setFailure(null);
    try {
      const note = await client.operator.people.notes.add.mutate({
        personId,
        body: body.trim(),
        idempotencyKey: key.current,
      });
      haptics.confirmed(1);
      onSaved(note);
      onClose();
    } catch (error) {
      haptics.refused();
      setFailure(classifyFailure(error, "pro.people.note_failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AdaptiveSheet
      accessibilityLabel={`Note about ${personName}`}
      kind="dialog"
      onClose={busy ? () => undefined : onClose}
      visible={visible}
    >
      <View
        style={[styles.sheetHead, { paddingHorizontal: tokens.space["4"] }]}
      >
        <Text
          accessibilityRole="header"
          style={styles.grow}
          variant="phone-heading"
        >
          {`Note about ${personName}`}
        </Text>
        <IconButton
          icon="close"
          label="Close"
          onPress={busy ? () => undefined : onClose}
        />
      </View>
      <View
        style={{
          paddingHorizontal: tokens.space["4"],
          paddingBottom: tokens.space["6"],
          gap: tokens.space["3"],
        }}
      >
        <DunaTextInput
          accessibilityLabel="Note"
          autoFocus
          maxLength={2000}
          multiline
          onChangeText={setBody}
          placeholder="What the next coach should know"
          value={body}
        />
        <Text tone="text-2" variant="phone-meta">
          Only your club's staff see notes.
        </Text>
        {failure ? (
          <Notice
            text={[
              failure.message ?? "The note wasn't saved.",
              failure.reference ? `Reference ${failure.reference}` : undefined,
            ]
              .filter(Boolean)
              .join(" ")}
            title={failure.kind === "offline" ? "No connection" : "Not saved"}
            tone="danger"
          />
        ) : null}
        <ActionButton
          busy={busy}
          disabled={!body.trim()}
          kind="primary"
          label="Save note"
          onPress={() => void save()}
          testID="note-save"
        />
      </View>
    </AdaptiveSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  hero: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroText: { flex: 1, minWidth: 0, gap: 2 },
  quick: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  next: { padding: 18, gap: 8 },
  section: { gap: 10 },
  figures: {
    flexDirection: "row",
    padding: 16,
    gap: 24,
    borderWidth: StyleSheet.hairlineWidth,
  },
  figure: { gap: 2 },
  line: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 },
  familyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
  },
  note: { padding: 14, gap: 6, borderWidth: StyleSheet.hairlineWidth },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
});
