"use client";

import {
  AudioLines,
  CircleStop,
  LoaderCircle,
  Mic,
  RotateCcw,
} from "lucide-react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type TranscriptionSegment,
} from "livekit-client";
import { useEffect, useRef, useState } from "react";

type RecorderState = "ready" | "connecting" | "listening" | "review";

export function SessionNoteRecorder({
  configured,
  sessionId,
  transcript,
  onChange,
  onVoiceStarted,
}: {
  readonly configured: boolean;
  readonly sessionId: string;
  readonly transcript: string;
  readonly onChange: (value: string) => void;
  readonly onVoiceStarted?: () => void;
}) {
  const [state, setState] = useState<RecorderState>("ready");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string>();
  const roomRef = useRef<Room | undefined>(undefined);
  const segmentsRef = useRef(new Map<string, string>());
  const audioElementsRef = useRef<HTMLMediaElement[]>([]);

  useEffect(() => {
    if (state !== "listening") return;
    const interval = window.setInterval(
      () => setElapsed((value) => value + 1),
      1_000,
    );
    return () => window.clearInterval(interval);
  }, [state]);

  useEffect(
    () => () => {
      roomRef.current?.disconnect();
      for (const element of audioElementsRef.current) element.remove();
    },
    [],
  );

  async function begin() {
    if (!configured) return;
    onVoiceStarted?.();
    setState("connecting");
    setError(undefined);
    setElapsed(0);
    segmentsRef.current.clear();
    try {
      const response = await fetch("/api/livekit/session-notes/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const payload = (await response.json()) as {
        participantToken?: string;
        serverUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.participantToken || !payload.serverUrl) {
        throw new Error(payload.error ?? "Voice notes are unavailable.");
      }
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        element.dataset.dunaSessionScribe = "true";
        document.body.append(element);
        audioElementsRef.current.push(element);
      });
      room.on(
        RoomEvent.TranscriptionReceived,
        (segments: TranscriptionSegment[], participant) => {
          if (participant?.identity !== room.localParticipant.identity) return;
          for (const segment of segments) {
            if (segment.final) {
              segmentsRef.current.set(segment.id, segment.text.trim());
            }
          }
          const next = [...segmentsRef.current.values()]
            .filter(Boolean)
            .join(" ");
          if (next) onChange(next);
        },
      );
      room.on(RoomEvent.Disconnected, () => {
        setState((current) => (current === "review" ? "review" : "ready"));
      });
      await room.connect(payload.serverUrl, payload.participantToken);
      await room.localParticipant.setMicrophoneEnabled(true);
      setState("listening");
    } catch (caught) {
      roomRef.current?.disconnect();
      roomRef.current = undefined;
      setState("ready");
      setError(
        caught instanceof Error
          ? caught.message
          : "Voice notes could not be started.",
      );
    }
  }

  async function finish() {
    if (roomRef.current) {
      await roomRef.current.localParticipant.setMicrophoneEnabled(false);
      await roomRef.current.disconnect();
    }
    roomRef.current = undefined;
    setState("review");
  }

  const clock = `${Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0")}:${(elapsed % 60).toString().padStart(2, "0")}`;

  return (
    <section
      className={`session-note-recorder session-note-recorder--${state}`}
    >
      <div className="session-note-recorder__status">
        <span>
          {state === "listening" ? (
            <AudioLines aria-hidden size={18} />
          ) : state === "connecting" ? (
            <LoaderCircle aria-hidden className="spin" size={18} />
          ) : (
            <Mic aria-hidden size={18} />
          )}
          {state === "listening"
            ? "Listening"
            : state === "review"
              ? "Ready to review"
              : "LiveKit voice note"}
        </span>
        {state === "listening" && <time>{clock}</time>}
      </div>
      <div className="session-note-recorder__body">
        <div className="session-note-recorder__orb" aria-hidden>
          <Mic size={25} />
          {state === "listening" && <i />}
        </div>
        <span>
          <strong>
            {state === "listening"
              ? "Talk through the session."
              : "Capture it while it is fresh."}
          </strong>
          <small>
            Duna turns speech into an editable draft and detects roster names.
            Nothing is shared until you choose recipients and publish.
          </small>
        </span>
        {state === "listening" ? (
          <button onClick={() => void finish()} type="button">
            <CircleStop aria-hidden size={17} /> Finish
          </button>
        ) : (
          <button
            disabled={!configured || state === "connecting"}
            onClick={() => void begin()}
            type="button"
          >
            {state === "review" ? (
              <RotateCcw aria-hidden size={17} />
            ) : (
              <Mic aria-hidden size={17} />
            )}
            {state === "review" ? "Record again" : "Start recording"}
          </button>
        )}
      </div>
      {!configured && (
        <p>
          LiveKit keys are not connected in this environment. Type the same note
          below; the review and privacy flow stays identical.
        </p>
      )}
      {error && (
        <p className="operator-action-notice operator-action-notice--error">
          {error}
        </p>
      )}
      <label>
        <span>Editable transcript</span>
        <textarea
          name="transcript"
          onChange={(event) => onChange(event.target.value)}
          placeholder="Example: Maya’s platform work was much calmer today. The whole group needs another pass on serve-receive communication…"
          rows={5}
          value={transcript}
        />
      </label>
    </section>
  );
}
