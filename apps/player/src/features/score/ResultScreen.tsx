/**
 * The result (M-P4a, boards P-Result-Sent, P-Result-Confirm, P-MatchStatus,
 * P-Result-Rating): the match card, its state (awaiting confirmation,
 * confirmed, disputed, claim links expired), who still has to confirm,
 * "what this result would do" in the web's words, and after confirmation
 * the Sand Rating ring Rising to its new value (reduced motion: a fade).
 *
 * For the other side: Confirm, or "Something's wrong" with a reason. For
 * the side that added it: ask them to confirm with a message the person
 * reviews and sends through the system share sheet (nothing is sent for
 * them), or change it (remove and add again: the API has no edit). For a
 * confirmed result: share it, or flag it to Duna if it is wrong. The film,
 * private notes and comments stay in the match details sheet.
 */
import { Alert, ScrollView, Share, StyleSheet, View } from "react-native";
import type { MatchSummary } from "@duna/core";
import { demoMatches } from "@duna/core/demo";
import { report } from "@duna/observability";
import { formatSetList } from "@duna/tideline-core";
import {
  AdaptiveSheet,
  EmptyState,
  ErrorState,
  LoadingState,
  Rise,
  Text,
  Title,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { RatingRing } from "@duna/ui/native/score";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as Crypto from "expo-crypto";
import { dunaWebUrl } from "../../../mobile-api";
import { usePlayerRuntime } from "../../../runtime";
import { RouteEntryContext, useShell } from "../../app/ShellContext";
import { Card, IconButton, Row, StatusChip, usePaneEdges } from "../../app/ui";
import { ActionButton } from "../find/parts";
import { ratingRingProps } from "../rating/rating-model";
import { knownMatch, rememberSummary, type MatchScoring } from "./match-cache";
import { NetScoreCard } from "./NetScoreCard";
import { Field, Notice, Segmented, useReadableInset } from "./parts";
import { confirmationMessage } from "./result-rules";
import { resultModel, summaryFromScoring } from "./result-model";

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready" }
  | { readonly kind: "missing" }
  | { readonly kind: "error"; readonly reference: string };

const FLAG_REASONS = [
  { value: "wrong-score", label: "Wrong score" },
  { value: "wrong-opponents", label: "Wrong players" },
  { value: "not-me", label: "Not me" },
  { value: "duplicate", label: "Duplicate" },
  { value: "other", label: "Other" },
] as const;

const CHIP_TONE = {
  awaiting: { tone: "warning", wash: "warning-wash", icon: "clock" },
  confirmed: { tone: "positive", wash: "positive-wash", icon: "verified" },
  disputed: { tone: "danger", wash: "danger-wash", icon: "alert" },
  expired: { tone: "text-2", wash: "surface-sunken", icon: "clock" },
  history: { tone: "text-2", wash: "surface-sunken", icon: "check" },
} as const;

export function ResultScreen() {
  const entry = useContext(RouteEntryContext);
  const matchId = entry?.targetId;
  const runtime = usePlayerRuntime();
  const shell = useShell();
  const haptics = useHaptics();
  const edges = usePaneEdges();
  const inset = useReadableInset();
  const { tokens } = useTheme();
  const client = runtime.mode === "live" ? runtime.client : undefined;
  const known = matchId ? knownMatch(matchId) : {};
  const [summary, setSummary] = useState<MatchSummary | undefined>(
    () =>
      known.summary ??
      (matchId
        ? ((runtime.dashboard?.recentMatches ?? []).find(
            (m) => m.id === matchId,
          ) ??
          (runtime.mode === "preview"
            ? demoMatches.find((m) => m.id === matchId)
            : undefined))
        : undefined) ??
      (known.scoring
        ? summaryFromScoring(known.scoring, new Date().toISOString())
        : undefined),
  );
  const [scoring, setScoring] = useState<MatchScoring | undefined>(
    known.scoring,
  );
  const [load, setLoad] = useState<Load>(
    summary ? { kind: "ready" } : { kind: "loading" },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"ask" | "dispute" | "flag" | null>(null);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [flagReason, setFlagReason] =
    useState<(typeof FLAG_REASONS)[number]["value"]>("wrong-score");
  const [notice, setNotice] = useState<{
    tone: "positive" | "danger";
    text: string;
  }>();
  const [justConfirmed, setJustConfirmed] = useState(false);

  const refresh = useCallback(async () => {
    if (!matchId) return;
    if (!client) {
      setLoad(summary ? { kind: "ready" } : { kind: "missing" });
      return;
    }
    try {
      const [nextSummary, nextScoring] = await Promise.all([
        client.player.matchById.query({ matchId }).catch((reason: unknown) => {
          if (
            (reason as { data?: { code?: string } })?.data?.code === "NOT_FOUND"
          )
            return undefined;
          throw reason;
        }),
        client.player.matchScoringState
          .query({ matchId })
          .catch(() => undefined),
      ]);
      if (nextSummary) {
        rememberSummary(nextSummary);
        setSummary(nextSummary);
      }
      if (nextScoring) setScoring(nextScoring);
      setLoad(
        nextSummary || summary || nextScoring
          ? { kind: "ready" }
          : { kind: "missing" },
      );
      if (!nextSummary && nextScoring && !summary)
        setSummary(summaryFromScoring(nextScoring, new Date().toISOString()));
    } catch (reason) {
      setLoad(
        summary
          ? { kind: "ready" }
          : {
              kind: "error",
              reference: report(reason, { event: "player.result.load_failed" }),
            },
      );
    }
    // `summary` is the fallback only.
  }, [client, matchId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const myId = runtime.dashboard?.player.id;
  // Preview builds can show each state (`duna://dev/shell?route=result&id=…&step=disputed`).
  const previewStatus =
    runtime.mode === "preview" &&
    (entry?.prompt === "pending-verification" ||
      entry?.prompt === "disputed" ||
      entry?.prompt === "verified")
      ? entry.prompt
      : undefined;
  const model = useMemo(
    () =>
      summary
        ? resultModel({
            summary: previewStatus
              ? { ...summary, status: previewStatus, canRemove: true }
              : summary,
            scoring,
            myId,
            now: new Date(),
          })
        : null,
    [myId, previewStatus, scoring, summary],
  );

  if (!matchId) {
    return (
      <EmptyState
        action={{ label: "Add a result", onPress: () => shell.open("score") }}
        text="Open a match from your results, or add one."
        title="No match chosen"
      />
    );
  }
  if (load.kind === "loading" || !model || !summary) {
    if (load.kind === "error") {
      return (
        <ErrorState
          onRetry={() => {
            setLoad({ kind: "loading" });
            void refresh();
          }}
          reference={load.reference}
          text="The match could not load."
        />
      );
    }
    if (load.kind === "missing") {
      return (
        <EmptyState
          text="It may have been removed, or it belongs to someone else."
          title="Match not found"
        />
      );
    }
    return <LoadingState loading label="Loading the result" skeleton="card" />;
  }

  const confirmMatch = (decision: "confirmed" | "disputed") => {
    if (!client || busy) return;
    setBusy(decision);
    void client.player.confirmMatch
      .mutate({
        matchId,
        decision,
        ...(decision === "disputed" ? { reason: reason.trim() } : {}),
        idempotencyKey: Crypto.randomUUID(),
      })
      .then((result) => {
        haptics.confirmed(decision === "confirmed" ? 2 : 1);
        setSheet(null);
        setJustConfirmed(result.ratingApplied);
        setNotice({
          tone: "positive",
          text:
            decision === "disputed"
              ? "Sent. The result doesn’t count until you agree."
              : result.status === "verified"
                ? "Confirmed."
                : "Confirmed for your side. Waiting on the other side.",
        });
        void runtime.refresh().catch(() => undefined);
        void refresh();
      })
      .catch((reason: unknown) => {
        haptics.refused();
        setNotice({
          tone: "danger",
          text: `${reason instanceof Error ? reason.message : "Try again."} Reference ${report(reason, { event: "player.result.confirm_failed" })}.`,
        });
      })
      .finally(() => setBusy(null));
  };

  const removeAndEdit = (andEdit: boolean) =>
    Alert.alert(
      andEdit ? "Change this result?" : "Remove this result?",
      andEdit
        ? "It is removed and opened to change. Everyone is asked to confirm the new one."
        : "It is removed from everyone’s history. This can’t be undone.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: andEdit ? "Change it" : "Remove",
          style: "destructive",
          onPress: () => {
            if (!client) return;
            setBusy("remove");
            void client.player.removeSelfReportedMatch
              .mutate({ matchId, idempotencyKey: Crypto.randomUUID() })
              .then(() => {
                haptics.confirmed(2);
                void runtime.refresh().catch(() => undefined);
                if (andEdit) {
                  shell.addResult({
                    id: matchId,
                    source: "live",
                    playedAt: summary.playedAt,
                    sets: summary.score.map(([a, b]) => ({ a, b })),
                    ...(summary.matchType
                      ? { matchType: summary.matchType }
                      : {}),
                  });
                } else {
                  shell.back("play");
                }
              })
              .catch((reason: unknown) =>
                setNotice({
                  tone: "danger",
                  text: `${reason instanceof Error ? reason.message : "Try again."} Reference ${report(reason, { event: "player.result.remove_failed" })}.`,
                }),
              )
              .finally(() => setBusy(null));
          },
        },
      ],
    );

  const flag = () => {
    if (!client || busy) return;
    setBusy("flag");
    void client.player.flagMatchHistory
      .mutate({
        matchId,
        reasonCode: flagReason,
        ...(reason.trim() ? { details: reason.trim() } : {}),
        idempotencyKey: Crypto.randomUUID(),
      })
      .then(() => {
        haptics.confirmed(1);
        setSheet(null);
        setNotice({
          tone: "positive",
          text: "Sent to Duna. It doesn’t count toward a Sand Rating while it is reviewed.",
        });
        void refresh();
      })
      .catch((reason: unknown) =>
        setNotice({
          tone: "danger",
          text: `${reason instanceof Error ? reason.message : "Try again."} Reference ${report(reason, { event: "player.result.flag_failed" })}.`,
        }),
      )
      .finally(() => setBusy(null));
  };

  const link = model.shareUrl ?? `${dunaWebUrl}/matches/${matchId}`;
  const chipTone = CHIP_TONE[model.state];
  const myRating = runtime.dashboard?.player.rating;
  const when = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(summary.playedAt));

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: tokens.space["4"],
        paddingBottom: edges.bottom + tokens.space["8"],
        paddingLeft: edges.left + inset,
        paddingRight: edges.right + inset,
        gap: tokens.space["4"],
      }}
      testID="result"
    >
      <View style={{ gap: tokens.space["2"] }}>
        <Title size={26}>{model.title}</Title>
        <Text tone="text-2" variant="phone-meta">
          {[when, summary.venueName].filter(Boolean).join(" · ")}
        </Text>
        <StatusChip
          icon={chipTone.icon}
          label={model.chip}
          tone={chipTone.tone}
          wash={chipTone.wash}
        />
      </View>
      {notice ? (
        <Notice tone={notice.tone === "positive" ? "positive" : "danger"}>
          {notice.text}
        </Notice>
      ) : null}
      <Card>
        <NetScoreCard names={model.names} state={model.net} />
      </Card>
      <Text tone="text-2" variant="phone-meta">
        {model.line}
      </Text>

      {model.rating ? (
        <Rise mode="lift">
          <Card>
            <View style={styles.ratingRow}>
              <RatingRing
                animate
                size={120}
                {...ratingRingProps({
                  rating: myRating,
                  after: model.rating.after,
                  delta: model.rating.delta,
                })}
              />
              <View style={styles.flex}>
                <Text variant="phone-heading">Sand Rating</Text>
                <Text tone="text-2" variant="phone-meta">
                  {justConfirmed
                    ? "Moved with this match."
                    : "What this match did to your Sand Rating."}
                </Text>
              </View>
            </View>
          </Card>
        </Rise>
      ) : (
        <Card>
          <Text family="mono" tone="text-2" variant="phone-meta">
            WHAT THIS RESULT WOULD DO
          </Text>
          <Text variant="phone-body">{model.whatItWouldDo}</Text>
        </Card>
      )}

      {model.state === "awaiting" && model.needsMe ? (
        <View style={{ gap: tokens.space["2"] }}>
          <Text variant="phone-heading">Is this right?</Text>
          <ActionButton
            busy={busy === "confirmed"}
            label="Confirm result"
            onPress={() => confirmMatch("confirmed")}
            testID="confirm-result"
          />
          <ActionButton
            kind="secondary"
            label="Something’s wrong"
            onPress={() => {
              setReason("");
              setSheet("dispute");
            }}
            testID="dispute-result"
          />
        </View>
      ) : null}

      {model.state === "awaiting" && !model.needsMe ? (
        <View style={{ gap: tokens.space["2"] }}>
          {model.waiting ? (
            <Notice icon="clock" tone="warning" title={model.waiting}>
              Sand Ratings stay as they are until one of them confirms.
            </Notice>
          ) : null}
          {model.pendingClaims.length > 0 ? (
            <Notice tone="info" title="Played with someone not on Duna?">
              {`Share the claim link. ${model.pendingClaims.join(", ")} keep${model.pendingClaims.length === 1 ? "s" : ""} a place until they join and confirm.`}
            </Notice>
          ) : null}
          <ActionButton
            label="Ask them to confirm"
            onPress={() => {
              setMessage(
                confirmationMessage({ opponents: model.opponents, link }),
              );
              setSheet("ask");
            }}
            testID="ask-confirm"
          />
        </View>
      ) : null}

      {model.state === "expired" ? (
        <Notice tone="warning" title="Claim links expired">
          {model.line}
        </Notice>
      ) : null}

      {model.state === "disputed" ? (
        <Notice tone="danger" title="Disputed">
          {summary.dispute
            ? "Someone on court sees this result differently. It doesn’t count until you agree."
            : model.line}
        </Notice>
      ) : null}

      <View style={{ gap: tokens.space["1"] }}>
        {model.state === "confirmed" ? (
          <Row
            icon="send"
            onPress={() =>
              void Share.share({
                message: `${model.title} ${formatSetList(model.net.rows)} · ${summary.venueName} ${link}`,
              })
            }
            summary="Through your apps"
            title="Share the result"
          />
        ) : null}
        <Row
          icon="film"
          onPress={() => shell.openMatchDetails(summary)}
          summary="Film, private notes and the conversation"
          title="Match details"
        />
        {model.canRemove && model.state !== "confirmed" ? (
          <>
            <Row
              icon="score"
              onPress={() => removeAndEdit(true)}
              summary="Change the score or the players"
              title="Change this result"
            />
            <Row
              icon="close"
              onPress={() => removeAndEdit(false)}
              summary="Only before it is confirmed"
              title="Remove this result"
            />
          </>
        ) : null}
        {model.state === "confirmed" && model.mySide ? (
          <Row
            icon="alert"
            onPress={() => {
              setReason("");
              setSheet("flag");
            }}
            summary="Tell Duna what is wrong"
            title="Something wrong with this result?"
          />
        ) : null}
      </View>

      <AdaptiveSheet
        accessibilityLabel="Before you send"
        kind="dialog"
        onClose={() => setSheet(null)}
        visible={sheet !== null}
      >
        <View
          style={[styles.sheetHead, { paddingHorizontal: tokens.space["4"] }]}
        >
          <Text accessibilityRole="header" variant="phone-heading">
            {sheet === "ask"
              ? "Your message"
              : sheet === "dispute"
                ? "What’s wrong?"
                : "Tell Duna"}
          </Text>
          <IconButton
            icon="close"
            label="Close"
            onPress={() => setSheet(null)}
          />
        </View>
        <ScrollView
          contentContainerStyle={{
            padding: tokens.space["4"],
            gap: tokens.space["3"],
          }}
          keyboardShouldPersistTaps="handled"
        >
          {sheet === "ask" ? (
            <>
              <Text tone="text-2" variant="phone-meta">
                Read it, change it if you like, then choose how to send it. Duna
                doesn’t send anything for you.
              </Text>
              <Field
                label="Message"
                multiline
                onChange={setMessage}
                value={message}
              />
              <ActionButton
                disabled={!message.trim()}
                icon="send"
                label="Choose how to send"
                onPress={() => {
                  void Share.share({ message: message.trim() }).then(
                    (outcome) => {
                      if (outcome.action === Share.sharedAction) {
                        haptics.confirmed(1);
                        setSheet(null);
                      }
                    },
                  );
                }}
                testID="share-message"
              />
            </>
          ) : null}
          {sheet === "dispute" ? (
            <>
              <Text tone="text-2" variant="phone-meta">
                Say what the score should be. The result won’t count toward
                anyone’s Sand Rating until you agree.
              </Text>
              <Field
                error={
                  reason.trim().length > 0 && reason.trim().length < 5
                    ? "A few more words, please."
                    : undefined
                }
                label="What happened"
                multiline
                onChange={setReason}
                placeholder="Set 3 ended 15–13."
                value={reason}
              />
              <ActionButton
                busy={busy === "disputed"}
                disabled={reason.trim().length < 5}
                label="Send"
                onPress={() =>
                  Alert.alert(
                    "Send this to the other side?",
                    "The result stays out of everyone’s Sand Rating until you agree.",
                    [
                      { text: "Not yet", style: "cancel" },
                      { text: "Send", onPress: () => confirmMatch("disputed") },
                    ],
                  )
                }
                testID="send-dispute"
              />
            </>
          ) : null}
          {sheet === "flag" ? (
            <>
              <Segmented
                label="What is wrong"
                onChange={setFlagReason}
                options={FLAG_REASONS}
                value={flagReason}
              />
              <Field
                label="Anything else (optional)"
                multiline
                onChange={setReason}
                value={reason}
              />
              <ActionButton
                busy={busy === "flag"}
                label="Send to Duna"
                onPress={flag}
              />
            </>
          ) : null}
        </ScrollView>
      </AdaptiveSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 4 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
});
