import type { MatchSummary } from "@duna/core";
import {
  mobileControl,
  mobileGrid,
  resolveDunaMobileTokens,
} from "@duna/ui/mobile";
import type { ResolvedDunaTokens } from "@duna/ui/tokens";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DunaIcon } from "./duna-icon";
import { dunaWebUrl, type DunaApiClient } from "./mobile-api";
import {
  DunaNumericText as Numeric,
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "./satoshi-text";
import { VideoPlayerModal } from "./video-studio";

type MatchJournal = Awaited<
  ReturnType<DunaApiClient["player"]["matchJournal"]["query"]>
>;
type CommunityComment = Awaited<
  ReturnType<DunaApiClient["public"]["communityComments"]["query"]>
>[number];
type MatchVideo = Awaited<
  ReturnType<DunaApiClient["player"]["matchVideos"]["query"]>
>[number];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function matchDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function teamName(team: MatchSummary["teamA"]) {
  return team.map((player) => player.displayName).join(" / ");
}

function weatherLine(match: MatchSummary) {
  if (!match.weather) return undefined;
  return [
    match.weather.temperatureC === undefined
      ? undefined
      : `${Math.round((match.weather.temperatureC * 9) / 5 + 32)}°F`,
    match.weather.condition,
    match.weather.windSpeedKph === undefined
      ? undefined
      : `${Math.round(match.weather.windSpeedKph * 0.621371)} mph wind`,
    match.weather.uvIndex === undefined
      ? undefined
      : `UV ${Math.round(match.weather.uvIndex)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function SectionHeader({
  detail,
  icon,
  styles,
  title,
}: {
  readonly detail?: string;
  readonly icon: "lock" | "message" | "video";
  readonly styles: ReturnType<typeof createStyles>;
  readonly title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <DunaIcon color={styles.iconColor.color} name={icon} size={20} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

function MatchFilmCard({
  onPress,
  styles,
  video,
}: {
  readonly onPress: () => void;
  readonly styles: ReturnType<typeof createStyles>;
  readonly video: MatchVideo;
}) {
  return (
    <Pressable
      accessibilityLabel={`Watch ${video.title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.videoCard, pressed && styles.pressed]}
    >
      {video.posterUrl ? (
        <Image source={{ uri: video.posterUrl }} style={styles.videoPoster} />
      ) : (
        <View style={[styles.videoPoster, styles.videoPosterEmpty]}>
          <DunaIcon color={styles.iconColor.color} name="video" size={30} />
        </View>
      )}
      <View style={styles.videoCopy}>
        <View style={styles.videoTitleRow}>
          <Text numberOfLines={1} style={styles.videoTitle}>
            {video.title}
          </Text>
          {video.status === "live" ? (
            <View style={styles.livePill}>
              <Text style={styles.livePillText}>LIVE</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.videoMeta}>
          {video.source === "live" ? "Livestream" : "Match recording"}
          {video.durationSeconds
            ? ` · ${Math.max(1, Math.round(video.durationSeconds / 60))} min`
            : ""}
        </Text>
      </View>
      <DunaIcon color={styles.iconColor.color} name="chevron-right" size={20} />
    </Pressable>
  );
}

function JournalNote({
  note,
  onRetry,
  retrying,
  styles,
}: {
  readonly note: MatchJournal["notes"][number];
  readonly onRetry?: () => void;
  readonly retrying?: boolean;
  readonly styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.savedNote}>
      <View style={styles.savedNoteHeader}>
        <Text style={styles.savedNoteSource}>
          {note.source === "voice" ? "VOICE NOTE" : "MATCH NOTE"}
        </Text>
        <Text style={styles.savedNoteDate}>
          {new Date(note.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </Text>
      </View>
      <Text style={styles.savedNoteBody}>{note.body}</Text>
      {note.aiSummary ? (
        <View style={styles.aiSummary}>
          <View style={styles.aiLabel}>
            <DunaIcon
              color={styles.aiIconColor.color}
              name="sparkles"
              size={15}
            />
            <Text style={styles.aiLabelText}>DUNA AI SUMMARY</Text>
          </View>
          <Text style={styles.aiSummaryText}>{note.aiSummary}</Text>
          {note.aiInsights?.playerInsights.map((insight, index) => (
            <View
              key={`${note.id}:${insight.personId ?? insight.name}:${index}`}
              style={styles.insightRow}
            >
              <Text style={styles.insightName}>{insight.name}</Text>
              <Text style={styles.insightBody}>{insight.observation}</Text>
            </View>
          ))}
          {note.aiInsights?.nextActions.length ? (
            <View style={styles.nextActions}>
              <Text style={styles.nextActionsTitle}>Carry forward</Text>
              {note.aiInsights.nextActions.map((action, index) => (
                <Text key={`${note.id}:action:${index}`} style={styles.action}>
                  {index + 1}. {action}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : note.aiStatus === "unavailable" ? (
        onRetry ? (
          <Pressable
            accessibilityRole="button"
            disabled={retrying}
            onPress={onRetry}
            style={styles.retrySummary}
          >
            <DunaIcon
              color={styles.iconColor.color}
              name="sparkles"
              size={16}
            />
            <Text style={styles.retrySummaryText}>
              {retrying ? "Organizing…" : "Organize with Duna AI"}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.aiPendingText}>
            This private note is saved; its AI summary is unavailable.
          </Text>
        )
      ) : (
        <View style={styles.aiPending}>
          <ActivityIndicator color={styles.iconColor.color} size="small" />
          <Text style={styles.aiPendingText}>Organizing your reflection…</Text>
        </View>
      )}
    </View>
  );
}

export function NativeMatchDetails({
  client,
  match,
  onClose,
  publicClient,
  shareToken,
  transcribeVoice,
  visible,
}: {
  readonly client?: DunaApiClient;
  readonly match?: MatchSummary;
  readonly onClose: () => void;
  readonly publicClient?: DunaApiClient;
  readonly shareToken?: string;
  readonly transcribeVoice?: (input: {
    readonly uri: string;
    readonly name?: string;
  }) => Promise<string>;
  readonly visible: boolean;
}) {
  const tokens = useMemo(
    () => resolveDunaMobileTokens("light", "athletic"),
    [],
  );
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [journal, setJournal] = useState<MatchJournal>();
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [videos, setVideos] = useState<MatchVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<MatchVideo>();
  const [draft, setDraft] = useState("");
  const [draftSource, setDraftSource] = useState<"typed" | "voice">("typed");
  const [commentDraft, setCommentDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [acceptingShare, setAcceptingShare] = useState(false);
  const [retryingNoteId, setRetryingNoteId] = useState<string>();
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!match) return;
    setLoading(true);
    const reader = client ?? publicClient;
    try {
      const [nextJournal, nextVideos, nextComments] = await Promise.all([
        client?.player.matchJournal.query({ matchId: match.id }),
        client
          ? client.player.matchVideos.query({ matchId: match.id })
          : reader?.public.videos.query({ matchId: match.id }),
        reader?.public.communityComments.query({
          subject: { type: "match", id: match.id },
        }),
      ]);
      setJournal(nextJournal);
      setVideos([...(nextVideos ?? [])]);
      setComments([...(nextComments ?? [])]);
    } catch (error) {
      setNotice(errorMessage(error, "This match could not refresh yet."));
    } finally {
      setLoading(false);
    }
  }, [client, match, publicClient, shareToken]);

  useEffect(() => {
    if (!visible || !match) return;
    setJournal(undefined);
    setComments([]);
    setVideos([]);
    setSelectedVideo(undefined);
    setDraft("");
    setDraftSource("typed");
    setCommentDraft("");
    setNotice("");
    void refresh();
  }, [match, refresh, visible]);

  const startVoice = async () => {
    if (!journal?.access.canUseAi) {
      setNotice("AI voice tools require an adult account.");
      return;
    }
    if (!transcribeVoice) {
      setNotice("Voice notes are available after signing in on this device.");
      return;
    }
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Microphone permission needed",
          "Allow microphone access to record a private match reflection.",
        );
        return;
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setNotice("Recording privately. Tap again when you are finished.");
    } catch (error) {
      setNotice(errorMessage(error, "Voice recording could not start."));
    }
  };

  const stopVoice = async () => {
    setTranscribing(true);
    setNotice("Transcribing your reflection…");
    try {
      await recorder.stop();
      if (!recorder.uri || !transcribeVoice) {
        throw new Error("The recording was not available.");
      }
      const transcript = await transcribeVoice({
        uri: recorder.uri,
        name: `duna-match-note-${Date.now()}.m4a`,
      });
      setDraft(transcript);
      setDraftSource("voice");
      setNotice("Transcript ready. Edit anything before saving.");
    } catch (error) {
      setNotice(errorMessage(error, "Duna could not transcribe that note."));
    } finally {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: false,
      }).catch(() => undefined);
      setTranscribing(false);
    }
  };

  const saveNote = async () => {
    if (!client || !match || !draft.trim() || saving) return;
    setSaving(true);
    setNotice("Saving privately and organizing your feedback…");
    try {
      await client.player.createMatchJournalNote.mutate({
        matchId: match.id,
        body: draft.trim(),
        source: draftSource,
        idempotencyKey: Crypto.randomUUID(),
      });
      setDraft("");
      setDraftSource("typed");
      setNotice("Saved to your private match journal.");
      await refresh();
    } catch (error) {
      setNotice(errorMessage(error, "Your note could not be saved yet."));
    } finally {
      setSaving(false);
    }
  };

  const retrySummary = async (noteId: string) => {
    if (!client) return;
    setRetryingNoteId(noteId);
    try {
      await client.player.refreshMatchJournalSummary.mutate({ noteId });
      await refresh();
    } catch (error) {
      setNotice(
        errorMessage(error, "Duna AI could not organize that note yet."),
      );
    } finally {
      setRetryingNoteId(undefined);
    }
  };

  const shareNotes = async () => {
    if (!client || !match || sharing) return;
    setSharing(true);
    let createdShareId: string | undefined;
    try {
      const share = await client.player.createMatchNoteShare.mutate({
        matchId: match.id,
      });
      createdShareId = share.id;
      const url = `${dunaWebUrl}${share.path}`;
      const result = await Share.share({
        title: "Private Duna match notes",
        message: `I invited you to see my private notes from ${teamName(match.teamA)} vs ${teamName(match.teamB)}. Sign in with your verified Duna account to accept: ${url}`,
        url,
      });
      if (result.action === Share.dismissedAction) {
        await client.player.revokeMatchNoteShare.mutate({ shareId: share.id });
        createdShareId = undefined;
        setNotice("Sharing canceled. No private access was granted.");
        await refresh();
        return;
      }
      setNotice(
        "Invite created. It can be accepted by one verified Duna member.",
      );
      await refresh();
    } catch (error) {
      if (createdShareId) {
        await client.player.revokeMatchNoteShare
          .mutate({ shareId: createdShareId })
          .catch(() => undefined);
      }
      setNotice(errorMessage(error, "Duna could not create that invite."));
    } finally {
      setSharing(false);
    }
  };

  const acceptSharedNotes = async () => {
    if (!client || !shareToken || acceptingShare) return;
    setAcceptingShare(true);
    try {
      await client.player.claimMatchNoteShare.mutate({ token: shareToken });
      setNotice(
        "Private notes accepted. Only you and the player can see them.",
      );
      await refresh();
    } catch (error) {
      setNotice(errorMessage(error, "That private invite is not available."));
    } finally {
      setAcceptingShare(false);
    }
  };

  const revokeShare = async (shareId: string) => {
    if (!client) return;
    try {
      await client.player.revokeMatchNoteShare.mutate({ shareId });
      setNotice("Private-note access revoked.");
      await refresh();
    } catch (error) {
      setNotice(errorMessage(error, "That invite could not be revoked."));
    }
  };

  const postComment = async () => {
    if (!client || !match || !commentDraft.trim() || commenting) return;
    setCommenting(true);
    try {
      const comment = await client.player.createCommunityComment.mutate({
        subject: { type: "match", id: match.id },
        body: commentDraft.trim(),
        idempotencyKey: Crypto.randomUUID(),
      });
      setCommentDraft("");
      if (comment.status === "visible") {
        setComments((current) => [...current, comment]);
        setNotice("Posted to the match conversation.");
      } else {
        setNotice("Your comment is being reviewed before it appears publicly.");
      }
    } catch (error) {
      setNotice(errorMessage(error, "Your comment could not be posted."));
    } finally {
      setCommenting(false);
    }
  };

  const removeComment = async (commentId: string) => {
    if (!client) return;
    try {
      await client.player.deleteCommunityComment.mutate({ commentId });
      setComments((current) =>
        current.filter((comment) => comment.id !== commentId),
      );
      setNotice("Comment removed.");
    } catch (error) {
      setNotice(errorMessage(error, "That comment could not be removed."));
    }
  };

  if (!match) return null;
  const recordedWeather = weatherLine(match);
  const canWrite = Boolean(journal?.access.canWriteNotes);
  const canComment = Boolean(journal?.access.canComment);
  const canUseAi = Boolean(journal?.access.canUseAi);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="Back"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.backButton}
            >
              <DunaIcon color={tokens.text1} name="arrow-left" size={20} />
              <Text style={styles.backText}>Recent matches</Text>
            </Pressable>
            <View style={styles.verifiedPill}>
              <DunaIcon color={styles.gainColor.color} name="check" size={14} />
              <Text style={styles.verifiedText}>
                {match.status === "pending-verification"
                  ? "PENDING"
                  : "VERIFIED"}
              </Text>
            </View>
          </View>

          <View style={styles.hero}>
            <Text style={styles.eyebrow}>
              {matchDate(match.playedAt).toUpperCase()} ·{" "}
              {match.venueName.toUpperCase()}
            </Text>
            <Text style={styles.heroTitle}>
              {match.eventName ?? "Beach volleyball match"}
            </Text>
            <View style={styles.scoreboard}>
              <View style={styles.scoreTeam}>
                <Text style={styles.teamName}>{teamName(match.teamA)}</Text>
                <View style={styles.sets}>
                  {match.score.map(([score], index) => (
                    <Numeric
                      key={`a:${index}`}
                      style={styles.setScore}
                      tier="block"
                    >
                      {score}
                    </Numeric>
                  ))}
                </View>
              </View>
              <Text style={styles.versus}>VS</Text>
              <View style={styles.scoreTeam}>
                <Text style={styles.teamName}>{teamName(match.teamB)}</Text>
                <View style={styles.sets}>
                  {match.score.map(([, score], index) => (
                    <Numeric
                      key={`b:${index}`}
                      style={styles.setScore}
                      tier="block"
                    >
                      {score}
                    </Numeric>
                  ))}
                </View>
              </View>
            </View>
            <View style={styles.matchMetaRow}>
              {match.formatSummary ? (
                <Text style={styles.matchMeta}>{match.formatSummary}</Text>
              ) : null}
              {match.roundLabel ? (
                <Text style={styles.matchMeta}>{match.roundLabel}</Text>
              ) : null}
              {recordedWeather ? (
                <Text style={styles.matchMeta}>{recordedWeather}</Text>
              ) : null}
            </View>
          </View>

          {notice ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}
          {loading ? <ActivityIndicator color={tokens.text2} /> : null}

          <View style={styles.section}>
            <SectionHeader
              detail="Uploads, recordings, and livestream replays connected to this match."
              icon="video"
              styles={styles}
              title="Match film"
            />
            {videos.length ? (
              videos.map((video) => (
                <MatchFilmCard
                  key={video.id}
                  onPress={() => setSelectedVideo(video)}
                  styles={styles}
                  video={video}
                />
              ))
            ) : (
              <Text style={styles.emptyCopy}>
                No video has been connected to this match yet.
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <SectionHeader
              detail="Only you can see this. Invite one verified member when you choose."
              icon="lock"
              styles={styles}
              title="Your match journal"
            />
            {shareToken && !journal?.sharedJournals.length ? (
              <View style={styles.shareInvite}>
                <View style={styles.premiumMark}>
                  <DunaIcon color={tokens.text1} name="eye" size={20} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.premiumTitle}>
                    A player shared private notes with you
                  </Text>
                  <Text style={styles.premiumBody}>
                    This invite binds to the first verified Duna member who
                    accepts it. The player can revoke access at any time.
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={!client || acceptingShare}
                  onPress={() => void acceptSharedNotes()}
                  style={[styles.premiumButton, !client && styles.disabled]}
                >
                  <Text style={styles.premiumButtonText}>
                    {acceptingShare ? "Accepting…" : "Accept private notes"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {journal?.access.participant ? (
              canWrite ? (
                <View style={styles.composer}>
                  <TextInput
                    accessibilityLabel="Private match note"
                    maxLength={5000}
                    multiline
                    onChangeText={setDraft}
                    placeholder="What worked? What did you notice about their tendencies? What changes next time?"
                    placeholderTextColor={tokens.text3}
                    style={styles.noteInput}
                    textAlignVertical="top"
                    value={draft}
                  />
                  <View style={styles.composerActions}>
                    <Pressable
                      accessibilityLabel={
                        recorderState.isRecording
                          ? "Stop voice note"
                          : "Record voice note"
                      }
                      accessibilityRole="button"
                      disabled={!canUseAi || transcribing || saving}
                      onPress={() =>
                        void (recorderState.isRecording
                          ? stopVoice()
                          : startVoice())
                      }
                      style={[
                        styles.voiceButton,
                        recorderState.isRecording && styles.voiceButtonActive,
                      ]}
                    >
                      <DunaIcon
                        color={
                          recorderState.isRecording
                            ? tokens.buttonPrimaryForeground
                            : tokens.text1
                        }
                        name="microphone"
                        size={19}
                      />
                      <Text
                        style={[
                          styles.voiceButtonText,
                          recorderState.isRecording &&
                            styles.voiceButtonTextActive,
                        ]}
                      >
                        {transcribing
                          ? "Transcribing…"
                          : recorderState.isRecording
                            ? `Finish ${Math.max(1, Math.round(recorderState.durationMillis / 1000))}s`
                            : "Speak"}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!draft.trim() || saving || transcribing}
                      onPress={() => void saveNote()}
                      style={[
                        styles.saveButton,
                        (!draft.trim() || saving || transcribing) &&
                          styles.disabled,
                      ]}
                    >
                      <Text style={styles.saveButtonText}>
                        {saving ? "Saving…" : "Save privately"}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.privacyCopy}>
                    {canUseAi
                      ? "Voice audio is sent for transcription, then discarded. You can edit the transcript before saving."
                      : "Typed reflections remain private. AI voice tools require an adult account."}
                  </Text>
                </View>
              ) : (
                <View style={styles.premiumGate}>
                  <View style={styles.premiumMark}>
                    <DunaIcon color={tokens.text1} name="star" size={20} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.premiumTitle}>Player Premium</Text>
                    <Text style={styles.premiumBody}>
                      Build a private journal, record voice reflections, and let
                      Duna AI organize self, teammate, and opponent feedback.
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() =>
                      void Linking.openURL(`${dunaWebUrl}/app/settings`)
                    }
                    style={styles.premiumButton}
                  >
                    <Text style={styles.premiumButtonText}>View Premium</Text>
                  </Pressable>
                </View>
              )
            ) : (
              <Text style={styles.emptyCopy}>
                Private journals are available to players listed in this match.
              </Text>
            )}

            {journal?.notes.map((note) => (
              <JournalNote
                key={note.id}
                note={note}
                onRetry={
                  canWrite && canUseAi
                    ? () => void retrySummary(note.id)
                    : undefined
                }
                retrying={retryingNoteId === note.id}
                styles={styles}
              />
            ))}
            {journal?.notes.length ? (
              <Pressable
                accessibilityRole="button"
                disabled={!canWrite || sharing}
                onPress={() => void shareNotes()}
                style={[
                  styles.shareButton,
                  (!canWrite || sharing) && styles.disabled,
                ]}
              >
                <DunaIcon color={tokens.text1} name="eye" size={19} />
                <Text style={styles.shareButtonText}>
                  {sharing
                    ? "Creating invite…"
                    : "Invite someone to these notes"}
                </Text>
              </Pressable>
            ) : null}
            {journal?.shares
              .filter((share) => share.status === "active")
              .map((share) => (
                <View key={share.id} style={styles.shareRow}>
                  <View style={styles.flex}>
                    <Text style={styles.shareName}>
                      {share.claimedBy?.displayName ??
                        "Invite waiting to be accepted"}
                    </Text>
                    <Text style={styles.shareMeta}>
                      {share.claimedBy
                        ? "Can view this match journal"
                        : "One verified member · expires in 30 days"}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void revokeShare(share.id)}
                  >
                    <Text style={styles.revokeText}>Revoke</Text>
                  </Pressable>
                </View>
              ))}
            {journal?.sharedJournals.map((shared) => (
              <View key={shared.owner.id} style={styles.sharedJournal}>
                <Text style={styles.sharedJournalTitle}>
                  {shared.owner.displayName} shared this journal with you
                </Text>
                {shared.notes.map((note) => (
                  <JournalNote key={note.id} note={note} styles={styles} />
                ))}
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <SectionHeader
              detail="Public, match-specific conversation from verified Duna members."
              icon="message"
              styles={styles}
              title="Match conversation"
            />
            {comments.length ? (
              comments.map((comment) => (
                <View key={comment.id} style={styles.comment}>
                  <Pressable
                    accessibilityLabel={`Open ${comment.author.displayName}'s profile`}
                    accessibilityRole="link"
                    onPress={() =>
                      void Linking.openURL(
                        `${dunaWebUrl}${comment.author.publicPath}`,
                      )
                    }
                    style={styles.commentAvatar}
                  >
                    {comment.author.avatarUrl ? (
                      <Image
                        source={{ uri: comment.author.avatarUrl }}
                        style={styles.commentAvatarImage}
                      />
                    ) : (
                      <Text style={styles.commentInitial}>
                        {comment.author.displayName.slice(0, 1).toUpperCase()}
                      </Text>
                    )}
                  </Pressable>
                  <View style={styles.flex}>
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentAuthor}>
                        {comment.author.displayName}
                      </Text>
                      <View style={styles.commentMeta}>
                        <Text style={styles.commentTime}>
                          {new Date(comment.createdAt).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                            },
                          )}
                        </Text>
                        {comment.viewerCanDelete ? (
                          <Pressable
                            accessibilityLabel="Remove your comment"
                            accessibilityRole="button"
                            hitSlop={8}
                            onPress={() => void removeComment(comment.id)}
                          >
                            <Text style={styles.commentRemove}>Remove</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                    <Text style={styles.commentBody}>{comment.body}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyCopy}>
                Start the conversation with a thoughtful match takeaway.
              </Text>
            )}
            {canComment ? (
              <View style={styles.commentComposer}>
                <TextInput
                  accessibilityLabel="Public match comment"
                  maxLength={1500}
                  multiline
                  onChangeText={setCommentDraft}
                  placeholder="Share encouragement, analysis, or a question…"
                  placeholderTextColor={tokens.text3}
                  style={styles.commentInput}
                  value={commentDraft}
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={!commentDraft.trim() || commenting}
                  onPress={() => void postComment()}
                  style={[
                    styles.commentButton,
                    (!commentDraft.trim() || commenting) && styles.disabled,
                  ]}
                >
                  <Text style={styles.commentButtonText}>
                    {commenting ? "Checking…" : "Post"}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.commentGate}>
                <DunaIcon color={tokens.text2} name="lock" size={17} />
                <Text style={styles.commentGateText}>
                  {journal?.access.reason ??
                    "Verified Player Premium members can comment."}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
      {selectedVideo && (client ?? publicClient) ? (
        <VideoPlayerModal
          client={(client ?? publicClient)!}
          onClose={() => setSelectedVideo(undefined)}
          video={selectedVideo}
        />
      ) : null}
    </Modal>
  );
}

function createStyles(token: ResolvedDunaTokens) {
  return StyleSheet.create({
    safe: { backgroundColor: token.ground, flex: 1 },
    content: {
      gap: mobileGrid[5],
      padding: mobileControl.pageInset,
      paddingBottom: mobileGrid[12],
    },
    flex: { flex: 1, minWidth: 0 },
    pressed: { opacity: 0.72 },
    disabled: { opacity: 0.45 },
    iconColor: { color: token.text2 },
    aiIconColor: { color: token.flare },
    gainColor: { color: token.gain },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    backButton: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileGrid[1],
      minHeight: mobileControl.minimumTarget,
      paddingRight: mobileGrid[3],
    },
    backText: { color: token.text1, fontSize: 16, fontWeight: "700" },
    verifiedPill: {
      alignItems: "center",
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: 999,
      borderWidth: mobileGrid.hairline,
      flexDirection: "row",
      gap: mobileGrid[1],
      minHeight: 34,
      paddingHorizontal: mobileGrid[3],
    },
    verifiedText: {
      color: token.text2,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.7,
    },
    hero: { gap: mobileGrid[3] },
    eyebrow: {
      color: token.text3,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.8,
      lineHeight: 17,
    },
    heroTitle: {
      color: token.text1,
      fontSize: 30,
      fontWeight: "800",
      letterSpacing: -0.7,
      lineHeight: 34,
    },
    scoreboard: {
      backgroundColor: token.surface1,
      borderColor: token.hairlineStrong,
      borderRadius: mobileControl.cardRadius,
      borderWidth: mobileGrid.hairline,
      gap: mobileGrid[2],
      padding: mobileGrid[4],
    },
    scoreTeam: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileGrid[3],
      justifyContent: "space-between",
      minHeight: 48,
    },
    teamName: {
      color: token.text1,
      flex: 1,
      fontSize: 17,
      fontWeight: "700",
      lineHeight: 22,
    },
    sets: { flexDirection: "row", gap: mobileGrid[3] },
    setScore: {
      color: token.text1,
      fontSize: 28,
      minWidth: 28,
      textAlign: "center",
    },
    versus: {
      color: token.text3,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1,
    },
    matchMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: mobileGrid[2],
    },
    matchMeta: {
      backgroundColor: token.surface2,
      borderRadius: 999,
      color: token.text2,
      fontSize: 12,
      lineHeight: 17,
      paddingHorizontal: mobileGrid[3],
      paddingVertical: mobileGrid[1],
    },
    notice: {
      backgroundColor: token.surface2,
      borderRadius: mobileControl.nestedRadius,
      padding: mobileGrid[3],
    },
    noticeText: { color: token.text2, fontSize: 14, lineHeight: 20 },
    section: { gap: mobileGrid[3] },
    sectionHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: mobileGrid[3],
    },
    sectionIcon: {
      alignItems: "center",
      backgroundColor: token.surface2,
      borderRadius: 14,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    sectionTitle: { color: token.text1, fontSize: 21, fontWeight: "800" },
    sectionDetail: {
      color: token.text2,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 2,
    },
    emptyCopy: {
      color: token.text3,
      fontSize: 15,
      lineHeight: 22,
      paddingVertical: mobileGrid[2],
    },
    videoCard: {
      alignItems: "center",
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: mobileControl.nestedRadius,
      borderWidth: mobileGrid.hairline,
      flexDirection: "row",
      gap: mobileGrid[3],
      overflow: "hidden",
      paddingRight: mobileGrid[3],
    },
    videoPoster: { height: 78, width: 118 },
    videoPosterEmpty: {
      alignItems: "center",
      backgroundColor: token.surface2,
      justifyContent: "center",
    },
    videoCopy: { flex: 1, gap: 3, minWidth: 0 },
    videoTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileGrid[2],
    },
    videoTitle: {
      color: token.text1,
      flex: 1,
      fontSize: 15,
      fontWeight: "700",
    },
    videoMeta: { color: token.text3, fontSize: 12 },
    livePill: {
      backgroundColor: token.flare,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    livePillText: {
      color: token.textOnAccent,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    composer: {
      backgroundColor: token.surface1,
      borderColor: token.hairlineStrong,
      borderRadius: mobileControl.cardRadius,
      borderWidth: mobileGrid.hairline,
      gap: mobileGrid[3],
      padding: mobileGrid[4],
    },
    noteInput: {
      color: token.text1,
      fontSize: 16,
      lineHeight: 23,
      minHeight: 116,
    },
    composerActions: { flexDirection: "row", gap: mobileGrid[2] },
    voiceButton: {
      alignItems: "center",
      borderColor: token.hairlineStrong,
      borderRadius: 999,
      borderWidth: mobileGrid.hairline,
      flexDirection: "row",
      gap: mobileGrid[2],
      minHeight: mobileControl.minimumTarget,
      paddingHorizontal: mobileGrid[3],
    },
    voiceButtonActive: {
      backgroundColor: token.flare,
      borderColor: token.flare,
    },
    voiceButtonText: { color: token.text1, fontSize: 14, fontWeight: "700" },
    voiceButtonTextActive: { color: token.textOnAccent },
    saveButton: {
      alignItems: "center",
      backgroundColor: token.buttonPrimaryBackground,
      borderRadius: 999,
      flex: 1,
      justifyContent: "center",
      minHeight: mobileControl.minimumTarget,
      paddingHorizontal: mobileGrid[3],
    },
    saveButtonText: {
      color: token.buttonPrimaryForeground,
      fontSize: 14,
      fontWeight: "800",
    },
    privacyCopy: { color: token.text3, fontSize: 12, lineHeight: 18 },
    premiumGate: {
      backgroundColor: token.surface1,
      borderColor: token.hairlineStrong,
      borderRadius: mobileControl.cardRadius,
      borderWidth: mobileGrid.hairline,
      gap: mobileGrid[3],
      padding: mobileGrid[4],
    },
    shareInvite: {
      backgroundColor: token.surface2,
      borderColor: token.hairlineStrong,
      borderRadius: mobileControl.cardRadius,
      borderWidth: mobileGrid.hairline,
      gap: mobileGrid[3],
      padding: mobileGrid[4],
    },
    premiumMark: {
      alignItems: "center",
      backgroundColor: token.surface2,
      borderRadius: 16,
      height: 46,
      justifyContent: "center",
      width: 46,
    },
    premiumTitle: { color: token.text1, fontSize: 18, fontWeight: "800" },
    premiumBody: {
      color: token.text2,
      fontSize: 14,
      lineHeight: 21,
      marginTop: 3,
    },
    premiumButton: {
      alignItems: "center",
      borderColor: token.hairlineStrong,
      borderRadius: 999,
      borderWidth: mobileGrid.hairline,
      justifyContent: "center",
      minHeight: mobileControl.minimumTarget,
    },
    premiumButtonText: { color: token.text1, fontSize: 14, fontWeight: "800" },
    savedNote: {
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: mobileControl.cardRadius,
      borderWidth: mobileGrid.hairline,
      gap: mobileGrid[3],
      padding: mobileGrid[4],
    },
    savedNoteHeader: { flexDirection: "row", justifyContent: "space-between" },
    savedNoteSource: {
      color: token.text3,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    savedNoteDate: { color: token.text3, fontSize: 12 },
    savedNoteBody: { color: token.text1, fontSize: 15, lineHeight: 23 },
    aiSummary: {
      backgroundColor: token.surface2,
      borderRadius: mobileControl.nestedRadius,
      gap: mobileGrid[2],
      padding: mobileGrid[3],
    },
    aiLabel: { alignItems: "center", flexDirection: "row", gap: mobileGrid[1] },
    aiLabelText: {
      color: token.flare,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    aiSummaryText: {
      color: token.text1,
      fontSize: 15,
      fontWeight: "600",
      lineHeight: 22,
    },
    insightRow: {
      borderTopColor: token.hairline,
      borderTopWidth: mobileGrid.hairline,
      gap: 2,
      paddingTop: mobileGrid[2],
    },
    insightName: { color: token.text1, fontSize: 13, fontWeight: "800" },
    insightBody: { color: token.text2, fontSize: 13, lineHeight: 19 },
    nextActions: { gap: mobileGrid[1], marginTop: mobileGrid[1] },
    nextActionsTitle: { color: token.text1, fontSize: 13, fontWeight: "800" },
    action: { color: token.text2, fontSize: 13, lineHeight: 19 },
    retrySummary: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileGrid[2],
      minHeight: 44,
    },
    retrySummaryText: { color: token.text1, fontSize: 14, fontWeight: "700" },
    aiPending: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileGrid[2],
    },
    aiPendingText: { color: token.text3, fontSize: 13 },
    shareButton: {
      alignItems: "center",
      borderColor: token.hairlineStrong,
      borderRadius: 999,
      borderWidth: mobileGrid.hairline,
      flexDirection: "row",
      gap: mobileGrid[2],
      justifyContent: "center",
      minHeight: mobileControl.minimumTarget,
    },
    shareButtonText: { color: token.text1, fontSize: 14, fontWeight: "800" },
    shareRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileGrid[3],
      paddingVertical: mobileGrid[2],
    },
    shareName: { color: token.text1, fontSize: 14, fontWeight: "700" },
    shareMeta: { color: token.text3, fontSize: 12, marginTop: 2 },
    revokeText: {
      color: token.flare,
      fontSize: 13,
      fontWeight: "800",
      padding: mobileGrid[2],
    },
    sharedJournal: {
      borderLeftColor: token.flare,
      borderLeftWidth: 3,
      gap: mobileGrid[3],
      paddingLeft: mobileGrid[3],
    },
    sharedJournalTitle: { color: token.text1, fontSize: 16, fontWeight: "800" },
    comment: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: mobileGrid[3],
      paddingVertical: mobileGrid[2],
    },
    commentAvatar: {
      alignItems: "center",
      backgroundColor: token.surface2,
      borderRadius: 19,
      height: 38,
      justifyContent: "center",
      overflow: "hidden",
      width: 38,
    },
    commentAvatarImage: { height: 38, width: 38 },
    commentInitial: { color: token.text1, fontSize: 14, fontWeight: "900" },
    commentHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    commentAuthor: { color: token.text1, fontSize: 14, fontWeight: "800" },
    commentMeta: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileGrid[2],
    },
    commentTime: { color: token.text3, fontSize: 12 },
    commentRemove: { color: token.loss, fontSize: 12, fontWeight: "700" },
    commentBody: {
      color: token.text2,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 3,
    },
    commentComposer: {
      alignItems: "flex-end",
      backgroundColor: token.surface1,
      borderColor: token.hairlineStrong,
      borderRadius: mobileControl.cardRadius,
      borderWidth: mobileGrid.hairline,
      flexDirection: "row",
      gap: mobileGrid[2],
      padding: mobileGrid[3],
    },
    commentInput: {
      color: token.text1,
      flex: 1,
      fontSize: 16,
      lineHeight: 22,
      maxHeight: 120,
      minHeight: 50,
      paddingVertical: mobileGrid[2],
    },
    commentButton: {
      alignItems: "center",
      backgroundColor: token.buttonPrimaryBackground,
      borderRadius: 999,
      justifyContent: "center",
      minHeight: mobileControl.minimumTarget,
      minWidth: 72,
      paddingHorizontal: mobileGrid[3],
    },
    commentButtonText: {
      color: token.buttonPrimaryForeground,
      fontSize: 14,
      fontWeight: "900",
    },
    commentGate: {
      alignItems: "center",
      backgroundColor: token.surface2,
      borderRadius: mobileControl.nestedRadius,
      flexDirection: "row",
      gap: mobileGrid[2],
      padding: mobileGrid[3],
    },
    commentGateText: {
      color: token.text2,
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
    },
  });
}
