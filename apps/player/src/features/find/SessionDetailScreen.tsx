/**
 * A group session (M-P1, PART-11): one Jost title, the club mark, the time
 * in the club's zone (with the person's own time when it differs), where
 * and who coaches, how many are coming, then the participation block — the
 * state, "needs N more", the decision time (also the free-cancellation
 * deadline) and what you pay at each group size — and the one main action:
 * Book, Join the waitlist, or (booked) Invite a friend and Cancel.
 *
 * Signed in, everything about the group comes from `player.participation
 * .quote` (it knows your booking, your waitlist place and how you pay);
 * otherwise from the same core display function over the club's numbers.
 */
import { Alert, ScrollView, Share, StyleSheet, View } from "react-native";
import { renderParticipationCopy } from "@duna/core";
import { report } from "@duna/observability";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Text,
  Title,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import {
  ParticipationChip,
  ParticipationLine,
  PriceLadder,
  participationView,
  type ParticipationViewInput,
} from "@duna/ui/native/participation";
import { ClubMark } from "@duna/ui/native/search";
import { useCallback, useContext, useEffect, useState } from "react";
import * as Crypto from "expo-crypto";
import { usePlayerRuntime } from "../../../runtime";
import { RouteEntryContext } from "../../app/ShellContext";
import { usePaneEdges } from "../../app/ui";
import { BookingSheet, type BookingSheetMode } from "../booking/BookingSheet";
import { primaryAction } from "../booking/booking-machine";
import { useFind } from "./FindContext";
import {
  quoteParticipation,
  type FindSession,
  type ParticipationQuote,
} from "./find-sessions";
import { ActionButton } from "./parts";

function sessionWhen(session: FindSession, locale = "en-US") {
  const start = new Date(session.startsAt);
  const end = new Date(session.endsAt);
  const day = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: session.timeZone,
  }).format(start);
  const time = (value: Date, zone: string) =>
    new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: zone,
    }).format(value);
  const club = `${day} · ${time(start, session.timeZone)} – ${time(end, session.timeZone)}`;
  const viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const differs =
    viewerZone &&
    viewerZone !== session.timeZone &&
    time(start, viewerZone) !== time(start, session.timeZone);
  return {
    club,
    yours: differs ? `${time(start, viewerZone)} your time` : null,
  };
}

interface MyBooking {
  readonly bookingId: string;
}

export function SessionDetailScreen() {
  const entry = useContext(RouteEntryContext);
  const find = useFind();
  const runtime = usePlayerRuntime();
  const haptics = useHaptics();
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  const session = entry?.targetId
    ? find.sessionById(entry.targetId)
    : undefined;
  const [quote, setQuote] = useState<ParticipationQuote>();
  const [quoteError, setQuoteError] = useState<string>();
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [booking, setBooking] = useState<MyBooking>();
  const [dependents, setDependents] = useState<
    readonly { readonly personId: string; readonly name: string }[]
  >([]);
  const [sheet, setSheet] = useState<BookingSheetMode | null>(null);
  const [inviting, setInviting] = useState(false);
  const [reload, setReload] = useState(0);
  const client = runtime.client;

  useEffect(() => {
    if (!session || !client || session.demo) return;
    let active = true;
    setLoadingQuote(true);
    setQuoteError(undefined);
    void client.player.participation.quote
      .query({
        catalogItemId: session.catalogItemId,
        catalogSessionOccurrenceId: session.id,
        viewerTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      .then((next) => {
        if (active) setQuote(next);
      })
      .catch((reason: unknown) => {
        if (active)
          setQuoteError(
            report(reason, { event: "player.session.quote_failed" }),
          );
      })
      .finally(() => {
        if (active) setLoadingQuote(false);
      });
    void client.player.catalogSessionBookings
      .query({ scope: "upcoming", includeDependents: true, limit: 200 })
      .then((bookings) => {
        if (!active) return;
        const mine = bookings.find(
          (candidate) =>
            candidate.catalogItemId === session.catalogItemId &&
            candidate.startsAt === session.startsAt &&
            (candidate.status === "confirmed" ||
              candidate.status === "pending-payment"),
        );
        setBooking(mine ? { bookingId: mine.bookingId } : undefined);
      })
      .catch(() => undefined);
    void client.player.familyWallets
      .query()
      .then((wallets) => {
        if (!active) return;
        setDependents(
          wallets
            .filter(
              (wallet) =>
                wallet.relationshipStatus === "verified" &&
                wallet.organizationId === session.club.id,
            )
            .map((wallet) => ({
              personId: wallet.dependentPersonId,
              name: wallet.dependentName,
            })),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, reload, session]);

  const invite = useCallback(async () => {
    if (!client || !session) return;
    setInviting(true);
    try {
      const link = await client.player.participation.createInvite.mutate({
        subjectType: "catalog-session-occurrence",
        subjectId: session.id,
      });
      haptics.selection();
      await Share.share({
        url: link.url,
        message: `${session.title} at ${session.club.name}: ${link.url}`,
      });
    } catch (reason) {
      haptics.refused();
      const reference = report(reason, {
        event: "player.session.invite_failed",
      });
      Alert.alert(
        "Couldn't make an invite link",
        `${reason instanceof Error ? reason.message : "Try again."} (Reference ${reference})`,
      );
    } finally {
      setInviting(false);
    }
  }, [client, haptics, session]);

  if (!session) {
    return (
      <View
        style={[
          styles.fill,
          { backgroundColor: colors.ground, padding: tokens.space["4"] },
        ]}
      >
        {find.sessionsStatus === "loading" ? (
          <LoadingState label="Loading the session" loading skeleton="card" />
        ) : (
          <EmptyState
            text="It may have been moved or filled. Search again to see what's open."
            title="This session isn't available"
          />
        )}
      </View>
    );
  }

  const participation: ParticipationViewInput | undefined = quote
    ? quoteParticipation(quote)
    : session.participation;
  const view = participation ? participationView(participation) : undefined;
  const when = sessionWhen(session);
  const action = primaryAction({
    displayState: participation?.displayState ?? "open",
    alreadyBooked: Boolean(quote?.alreadyBooked || booking),
    waitlisted: Boolean(quote?.waitlist),
    waitlist: undefined,
    demo: Boolean(session.demo),
  });
  const live =
    Date.parse(session.startsAt) <= Date.now() &&
    Date.parse(session.endsAt) > Date.now();
  // "Now (3 booked)": the backend's token for the current ladder row.
  const currentRowToken = (
    participation?.display as
      | {
          readonly price?: {
            readonly currentRow?: Parameters<typeof renderParticipationCopy>[0];
          };
        }
      | undefined
  )?.price?.currentRow;
  const currentRow = currentRowToken
    ? renderParticipationCopy(currentRowToken)
    : undefined;
  const numbers = participation?.display.numbers;
  const canInvite =
    action === "already-booked" &&
    (participation?.displayState === "needs-players" ||
      participation?.displayState === "minimum-reached");

  return (
    <View
      style={[styles.fill, { backgroundColor: colors.ground }]}
      testID="session-detail"
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: tokens.space["4"],
          paddingBottom: edges.bottom + tokens.space["8"],
          paddingLeft: edges.left + tokens.space["4"],
          paddingRight: edges.right + tokens.space["4"],
          gap: tokens.space["4"],
        }}
      >
        <View style={{ gap: tokens.space["2"] }}>
          <View style={styles.clubRow}>
            <ClubMark
              color={session.club.color}
              initials={session.club.name
                .split(/\s+/)
                .slice(0, 2)
                .map((word) => word[0] ?? "")
                .join("")
                .toUpperCase()}
              title={session.club.name}
            />
            <Text tone="text-2" variant="phone-meta" weight={600}>
              {session.club.name}
            </Text>
          </View>
          <Title>{session.title}</Title>
          {view ? (
            <ParticipationChip
              label={view.chip.label}
              live={live}
              tone={view.chip.tone}
            />
          ) : null}
        </View>

        <View style={{ gap: tokens.space["1"] }}>
          <Text variant="phone-body" weight={600}>
            {when.club}
          </Text>
          {when.yours ? (
            <Text tone="text-2" variant="phone-meta">
              {when.yours}
            </Text>
          ) : null}
          {session.place ? (
            <Text tone="text-2" variant="phone-meta">
              {session.place.name}
            </Text>
          ) : null}
          {session.coachNames.length > 0 ? (
            <Text tone="text-2" variant="phone-meta">
              {`With ${session.coachNames.join(", ")}`}
            </Text>
          ) : null}
          {session.level ? (
            <Text tone="text-2" variant="phone-meta">
              {session.level}
            </Text>
          ) : null}
        </View>

        {session.summary ? (
          <Text variant="phone-body">{session.summary}</Text>
        ) : null}

        {numbers ? (
          <View style={{ gap: tokens.space["1"] }}>
            <Text accessibilityRole="header" variant="phone-heading">
              Who's coming
            </Text>
            <Text tone="text-2" variant="phone-body">
              {`${numbers.booked} of ${numbers.capacity} places booked`}
              {numbers.waiting > 0 ? ` · ${numbers.waiting} waiting` : ""}
            </Text>
          </View>
        ) : null}

        {view && participation ? (
          <View
            accessibilityLabel={view.a11y}
            style={{
              gap: tokens.space["3"],
              padding: tokens.space["4"],
              borderRadius: tokens.radius.xl,
              backgroundColor: colors.surface,
              borderColor: colors.line,
              borderWidth: StyleSheet.hairlineWidth,
            }}
            testID="session-participation"
          >
            <ParticipationLine
              line={view.line}
              status={view.chip.label}
              tone={view.chip.tone}
            />
            {view.cancelLine ? (
              <Text tone="text-2" variant="phone-meta">
                {view.cancelLine}
              </Text>
            ) : null}
            {view.showLadder ? (
              <PriceLadder
                currentLabel={currentRow}
                maxLine={view.priceLine}
                rows={view.ladder}
              />
            ) : null}
          </View>
        ) : null}

        {loadingQuote ? (
          <Text tone="text-3" variant="phone-meta">
            Checking places…
          </Text>
        ) : null}
        {quoteError ? (
          <ErrorState
            onRetry={() => setReload((count) => count + 1)}
            reference={quoteError}
            text="These numbers are from the club's schedule; your own booking details didn't load."
            title="Couldn't check your place"
          />
        ) : null}

        <View style={{ gap: tokens.space["2"] }}>
          {action === "book" ? (
            <ActionButton
              label="Book"
              onPress={() => setSheet("book")}
              testID="session-book"
            />
          ) : action === "join-waitlist" ? (
            <ActionButton
              label="Join the waitlist"
              onPress={() => setSheet("waitlist")}
              testID="session-waitlist"
            />
          ) : action === "on-waitlist" && quote?.waitlist ? (
            <>
              <Text variant="phone-body" weight={600}>
                {quote.waitlist.status === "offered"
                  ? "A place is held for you"
                  : `You're number ${quote.waitlist.position} on the waitlist`}
              </Text>
              <ActionButton
                kind="secondary"
                label="Leave the waitlist"
                onPress={() =>
                  Alert.alert(
                    "Leave the waitlist?",
                    "You'll lose your place in line.",
                    [
                      { text: "Stay", style: "cancel" },
                      {
                        text: "Leave",
                        style: "destructive",
                        onPress: () => {
                          if (!client || !quote.waitlist) return;
                          void client.player.participation.leaveWaitlist
                            .mutate({
                              entryId: quote.waitlist.entryId,
                              idempotencyKey: Crypto.randomUUID(),
                            })
                            .then(() => {
                              haptics.confirmed(1);
                              setReload((count) => count + 1);
                            })
                            .catch((reason: unknown) => {
                              haptics.refused();
                              Alert.alert(
                                "Couldn't leave the waitlist",
                                `Reference ${report(reason, { event: "player.session.leave_waitlist_failed" })}`,
                              );
                            });
                        },
                      },
                    ],
                  )
                }
              />
            </>
          ) : action === "already-booked" ? (
            <>
              <Text variant="phone-body" weight={600}>
                You're booked for this session
              </Text>
              {canInvite ? (
                <ActionButton
                  busy={inviting}
                  icon="user-plus"
                  label="Invite a friend"
                  onPress={() => void invite()}
                  testID="session-invite"
                />
              ) : null}
              <ActionButton
                kind="secondary"
                label="Cancel booking"
                onPress={() => setSheet("cancel")}
                testID="session-cancel"
              />
            </>
          ) : action === "preview" ? (
            <Text tone="text-2" variant="phone-meta">
              Preview build: sign in to the full app to book.
            </Text>
          ) : (
            <Text tone="text-2" variant="phone-body">
              This session can't be booked.
            </Text>
          )}
        </View>
      </ScrollView>
      <BookingSheet
        bookingId={booking?.bookingId}
        dependents={dependents}
        mode={sheet ?? "book"}
        onClose={() => setSheet(null)}
        onDone={() => {
          setReload((count) => count + 1);
          void runtime.refresh().catch(() => undefined);
        }}
        onInvite={() => void invite()}
        participation={participation}
        session={session}
        visible={sheet !== null}
        whenText={when.club}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  clubRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
