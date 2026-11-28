"use client";

import { Icon } from "@duna/ui/icons";
import {
  Button,
  Chip,
  Field,
  Input,
  NotConfigured,
  RadioGroup,
  RadioOption,
  Textarea,
  useConfirm,
} from "@duna/ui/tideline";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type TranscriptionSegment,
} from "livekit-client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  addNoteAction,
  shareNoteAction,
} from "@/app/(next)/(hq)/events/actions";
import { unwrap } from "../money/money-action-result";
import { PageSection } from "../shell/page-header";
import { failed } from "./event-actions";
import type { EventPermissions, EventView } from "./events-model";

/**
 * Notes and video for an event: what coaches and staff wrote or said about
 * it, kept private or shared with the players; sharing is confirmed. A
 * voice note is transcribed into an editable draft when voice is set up.
 */
export function EventNotes({
  view,
  permissions,
  voiceConfigured,
}: {
  readonly view: EventView;
  readonly permissions: EventPermissions;
  readonly voiceConfigured: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<"private" | "player">("private");
  const [usedVoice, setUsedVoice] = useState(false);
  const canWrite = permissions.change || permissions.checkIn;
  const save = () =>
    void confirm
      .run({
        tier: "undo",
        title: "Note saved as a draft",
        undoneMessage: "Kept as you left it",
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await addNoteAction({
              sessionId: view.id,
              subject,
              text,
              visibility,
              source: usedVoice ? "livekit-voice" : "typed",
              idempotencyKey,
            }),
          ),
        reverse: async () => undefined,
        report: failed("hq.events.note_failed"),
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          setSubject("");
          setText("");
          setUsedVoice(false);
          router.refresh();
        }
      });
  return (
    <div className="ev-grid">
      <div className="ev-stack">
        <PageSection flush id="notes" title={`Notes · ${view.notes.length}`}>
          {view.notes.length === 0 ? (
            <p className="ev-quiet ev-pad">No notes yet.</p>
          ) : (
            <ul className="ev-list">
              {view.notes.map((note) => (
                <li className="ev-note" key={note.id}>
                  <span className="ev-item__title">
                    {note.subject ?? "Note"}
                    <Chip kind="taxonomy">
                      {note.visibility === "player"
                        ? "For players"
                        : "Staff only"}
                    </Chip>
                    <Chip
                      tone={
                        note.status === "published" ? "positive" : "neutral"
                      }
                    >
                      {note.status === "published"
                        ? "Shared"
                        : note.status === "archived"
                          ? "Archived"
                          : "Draft"}
                    </Chip>
                  </span>
                  <p>{note.summary}</p>
                  <span className="ev-quiet">
                    {note.authorName}
                    {note.recipients.length
                      ? ` · for ${note.recipients.map((r) => r.displayName).join(", ")}`
                      : ""}
                  </span>
                  {permissions.change &&
                  note.status === "draft" &&
                  note.visibility === "player" ? (
                    <span className="ev-actions">
                      <Button
                        onClick={() =>
                          void confirm
                            .run({
                              tier: "confirm",
                              title: "Share this note with the players?",
                              description: note.summary,
                              affected: note.recipients.length
                                ? note.recipients
                                    .map((r) => r.displayName)
                                    .join(", ")
                                : "The players named in it, in their Duna app.",
                              verb: "Share note",
                              cancelLabel: "Keep as draft",
                              agentConfirm: `Shares a note about ${view.title} with players`,
                              perform: async ({ idempotencyKey }) =>
                                unwrap(
                                  await shareNoteAction({
                                    sessionId: view.id,
                                    noteId: note.id,
                                    idempotencyKey,
                                  }),
                                ),
                              success: "Note shared",
                              report: failed("hq.events.share_note_failed"),
                            })
                            .then((outcome) => {
                              if (outcome.status === "done") router.refresh();
                            })
                        }
                        size="sm"
                        variant="secondary"
                      >
                        Share with players
                      </Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </PageSection>
        <PageSection flush id="videos" title={`Video · ${view.videos.length}`}>
          {view.videos.length === 0 ? (
            <p className="ev-quiet ev-pad">No video from this event yet.</p>
          ) : (
            <ul className="ev-list">
              {view.videos.map((video) => (
                <li className="ev-item" key={video.id}>
                  <span className="ev-item__main">
                    <span className="ev-item__title">{video.title}</span>
                    <span className="ev-quiet">
                      {video.ownerName}
                      {video.durationSeconds
                        ? ` · ${Math.round(video.durationSeconds / 60)} min`
                        : ""}
                    </span>
                  </span>
                  <Chip tone="neutral">
                    {video.status.replaceAll("-", " ")}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </PageSection>
      </div>
      {canWrite ? (
        <div className="ev-stack">
          <PageSection id="write" title="Write a note">
            <div className="ev-form">
              <VoiceNote
                configured={voiceConfigured}
                eventId={view.id}
                onText={(value) => {
                  setText(value);
                  setUsedVoice(true);
                }}
              />
              <Field label="Subject" optional>
                <Input
                  maxLength={160}
                  onChange={(event) => setSubject(event.target.value)}
                  value={subject}
                />
              </Field>
              <Field label="Note">
                <Textarea
                  maxLength={5_000}
                  onChange={(event) => setText(event.target.value)}
                  rows={6}
                  value={text}
                />
              </Field>
              <RadioGroup
                aria-label="Who sees it"
                onValueChange={(value) =>
                  setVisibility(value as typeof visibility)
                }
                value={visibility}
              >
                <RadioOption
                  description="The club's staff only."
                  label="Staff only"
                  value="private"
                />
                <RadioOption
                  description="Saved as a draft; share it when it reads right."
                  label="For the players"
                  value="player"
                />
              </RadioGroup>
              <Button disabled={!text.trim()} onClick={save} variant="primary">
                Save note
              </Button>
            </div>
          </PageSection>
        </div>
      ) : null}
      {confirm.dialog}
    </div>
  );
}

type RecorderState = "ready" | "connecting" | "listening" | "review";

/** A voice note: talk, and the words arrive as an editable draft. */
function VoiceNote({
  configured,
  eventId,
  onText,
}: {
  readonly configured: boolean;
  readonly eventId: string;
  readonly onText: (value: string) => void;
}) {
  const [state, setState] = useState<RecorderState>("ready");
  const [error, setError] = useState<string>();
  const [elapsed, setElapsed] = useState(0);
  const room = useRef<Room | undefined>(undefined);
  const segments = useRef(new Map<string, string>());
  const audio = useRef<HTMLMediaElement[]>([]);

  useEffect(() => {
    if (state !== "listening") return;
    const timer = window.setInterval(
      () => setElapsed((value) => value + 1),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(
    () => () => {
      room.current?.disconnect();
      for (const element of audio.current) element.remove();
    },
    [],
  );

  if (!configured) {
    return (
      <NotConfigured
        compact
        feature="Voice notes"
        needs="voice transcription for this environment"
        owner="the club's owner"
      />
    );
  }

  const begin = async () => {
    setState("connecting");
    setError(undefined);
    setElapsed(0);
    segments.current.clear();
    try {
      const response = await fetch("/api/livekit/session-notes/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: eventId }),
      });
      const payload = (await response.json()) as {
        participantToken?: string;
        serverUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.participantToken || !payload.serverUrl) {
        throw new Error(
          payload.error ?? "Voice notes are unavailable right now.",
        );
      }
      const next = new Room({ adaptiveStream: true, dynacast: true });
      room.current = next;
      next.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        document.body.append(element);
        audio.current.push(element);
      });
      next.on(
        RoomEvent.TranscriptionReceived,
        (received: TranscriptionSegment[], participant) => {
          if (participant?.identity !== next.localParticipant.identity) return;
          for (const segment of received) {
            if (segment.final)
              segments.current.set(segment.id, segment.text.trim());
          }
          const words = [...segments.current.values()]
            .filter(Boolean)
            .join(" ");
          if (words) onText(words);
        },
      );
      next.on(RoomEvent.Disconnected, () => {
        setState((current) => (current === "review" ? "review" : "ready"));
      });
      await next.connect(payload.serverUrl, payload.participantToken);
      await next.localParticipant.setMicrophoneEnabled(true);
      setState("listening");
    } catch (caught) {
      room.current?.disconnect();
      room.current = undefined;
      setState("ready");
      setError(
        caught instanceof Error
          ? caught.message
          : "Voice notes couldn't start.",
      );
    }
  };

  const finish = async () => {
    if (room.current) {
      await room.current.localParticipant.setMicrophoneEnabled(false);
      await room.current.disconnect();
    }
    room.current = undefined;
    setState("review");
  };

  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  return (
    <div className="ev-recorder">
      {state === "listening" ? (
        <>
          <span aria-live="polite" className="ev-quiet">
            <Icon name="signal-line" size="inline" /> Listening ·{" "}
            <span className="ev-num">{clock}</span>
          </span>
          <Button onClick={() => void finish()} size="sm" variant="secondary">
            Finish
          </Button>
        </>
      ) : (
        <Button
          icon={<Icon name="message" size="control" />}
          loading={state === "connecting"}
          onClick={() => void begin()}
          size="sm"
          variant="secondary"
        >
          {state === "review" ? "Record again" : "Record a voice note"}
        </Button>
      )}
      {error ? <span className="ev-quiet">{error}</span> : null}
    </div>
  );
}
