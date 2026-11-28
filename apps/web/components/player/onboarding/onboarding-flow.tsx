"use client";

/**
 * Set up your profile (`/app/onboarding`): the same three short steps as
 * before (who it is for, the playing story told by voice or typed, the
 * details to check and save), then what comes next. Every step can be left
 * ("Do this later" goes to Home), as before.
 */
import { report } from "@duna/observability";
import {
  Button,
  Card,
  Field,
  Notice,
  PaneTransition,
  RadioGroup,
  RadioOption,
  Stepper,
  Textarea,
} from "@duna/ui/tideline";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type TranscriptionSegment,
} from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { AppLink } from "@/components/app-shell/navigation";
import type { PlayerSettingsData } from "../api-types";
import { PlayingProfileForm } from "../settings/playing-profile";

interface Subject {
  readonly personId: string;
  readonly displayName: string;
  readonly self: boolean;
}

/** Talk instead of typing: a private voice room that writes down what you say. */
function VoiceStory({
  subject,
  configured,
  onStory,
}: {
  readonly subject: Subject;
  readonly configured: boolean;
  readonly onStory: (text: string) => void;
}) {
  const [state, setState] = useState<
    "ready" | "connecting" | "listening" | "done"
  >("ready");
  const [error, setError] = useState<string>();
  const room = useRef<Room | undefined>(undefined);
  const audio = useRef<HTMLMediaElement[]>([]);
  const segments = useRef(new Map<string, string>());
  useEffect(
    () => () => {
      room.current?.disconnect();
      for (const element of audio.current) element.remove();
    },
    [],
  );
  if (!configured) return null;
  const begin = async () => {
    setState("connecting");
    setError(undefined);
    try {
      const response = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectPersonId: subject.personId }),
      });
      const payload = (await response.json()) as {
        participantToken?: string;
        serverUrl?: string;
        error?: string;
      };
      if (!response.ok || !payload.participantToken || !payload.serverUrl) {
        throw new Error(
          payload.error ?? "Talking it through isn’t available just now.",
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
        (parts: TranscriptionSegment[], who) => {
          if (who?.identity !== next.localParticipant.identity) return;
          for (const part of parts) {
            if (part.final) segments.current.set(part.id, part.text.trim());
          }
          const text = [...segments.current.values()].filter(Boolean).join(" ");
          if (text) onStory(text);
        },
      );
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
          : "Talking it through didn’t start.",
      );
      report(caught, { event: "web.onboarding.voice_failed" });
    }
  };
  const finish = async () => {
    await room.current?.localParticipant.setMicrophoneEnabled(false);
    await room.current?.disconnect();
    room.current = undefined;
    setState("done");
  };
  return (
    <Card className="pp-stack" variant="flat">
      <p className="pp-label">Or talk it through</p>
      <p className="td-meta">
        {state === "listening"
          ? "Take your time. Duna is listening and writing it down below."
          : "A short private conversation. What you say is written into the story; nothing is kept as audio."}
      </p>
      {error ? (
        <p className="pp-error" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        {state === "listening" ? (
          <Button onClick={() => void finish()} variant="secondary">
            I’m done talking
          </Button>
        ) : (
          <Button
            loading={state === "connecting"}
            onClick={() => void begin()}
            variant="secondary"
          >
            {state === "done" ? "Talk again" : "Start talking"}
          </Button>
        )}
      </div>
    </Card>
  );
}

export function OnboardingFlow({
  settings,
  claimHandle,
}: {
  readonly settings: PlayerSettingsData;
  readonly claimHandle?: string;
}) {
  const me: Subject = {
    personId: settings.profile.person.id,
    displayName: settings.profile.person.displayName,
    self: true,
  };
  const juniors: Subject[] = settings.household
    .filter((member) => member.role === "dependent")
    .map((member) => ({
      personId: member.person.id,
      displayName: member.person.displayName,
      self: false,
    }));
  const subjects = [me, ...juniors];
  const [step, setStep] = useState(0);
  const [subject, setSubject] = useState<Subject>(me);
  const [story, setStory] = useState(settings.profile.experienceSummary ?? "");
  const [done, setDone] = useState(false);
  const steps = ["Who it’s for", "Your story", "The details"];

  if (done) {
    return (
      <Card className="pp-done">
        <h2 className="pp-h2">
          {subject.self
            ? "Your profile is ready."
            : `${subject.displayName}’s profile is ready.`}
        </h2>
        <p className="td-lead">
          Match history imports carry on in the background. Duna keeps where
          each result came from, so every change to a Sand Rating can be
          checked.
        </p>
        <div className="pp-row-actions">
          <AppLink className="td-btn td-btn--primary" href="/app/profile">
            View profile
          </AppLink>
          <AppLink className="td-btn td-btn--secondary" href="/app">
            Go to Home
          </AppLink>
        </div>
      </Card>
    );
  }

  return (
    <div className="pp-form">
      <Stepper
        aria-label="Setting up your profile"
        current={step}
        steps={steps.map((title) => ({ title }))}
      />
      <PaneTransition direction="forward" transitionKey={String(step)}>
        {step === 0 ? (
          <section aria-labelledby="pp-ob-who" className="pp-step">
            <h2 className="pp-h2" id="pp-ob-who">
              Who is this profile for?
            </h2>
            <RadioGroup
              aria-labelledby="pp-ob-who"
              onValueChange={(value) => {
                const next = subjects.find(
                  (candidate) => candidate.personId === value,
                );
                if (next) setSubject(next);
              }}
              value={subject.personId}
            >
              {subjects.map((candidate) => (
                <RadioOption
                  description={
                    candidate.self
                      ? candidate.displayName
                      : "A junior in your family"
                  }
                  key={candidate.personId}
                  label={candidate.self ? "Me" : candidate.displayName}
                  value={candidate.personId}
                />
              ))}
            </RadioGroup>
            {juniors.length === 0 && settings.profile.ageBand === "adult" ? (
              <p className="td-meta">
                Setting up a child?{" "}
                <AppLink href="/app/settings#household">
                  Add them to your family first
                </AppLink>
                .
              </p>
            ) : null}
            <div className="pp-submit">
              <AppLink className="td-btn td-btn--ghost" href="/app">
                Do this later
              </AppLink>
              <Button onClick={() => setStep(1)} variant="primary">
                Continue
              </Button>
            </div>
          </section>
        ) : null}
        {step === 1 ? (
          <section aria-labelledby="pp-ob-story" className="pp-step">
            <h2 className="pp-h2" id="pp-ob-story">
              {subject.self
                ? "Tell us how you play."
                : `Tell us how ${subject.displayName.split(" ")[0]} plays.`}
            </h2>
            <p className="td-meta">
              Where, how long, the level reached, indoor or beach. Type it or
              talk it through; you check every answer next.
            </p>
            <Field label="The playing story" optional>
              <Textarea
                maxLength={2000}
                onChange={(event) => setStory(event.currentTarget.value)}
                rows={5}
                value={story}
              />
            </Field>
            <VoiceStory
              configured={settings.voiceOnboarding.configured}
              onStory={setStory}
              subject={subject}
            />
            <div className="pp-submit">
              <Button onClick={() => setStep(0)} variant="ghost">
                Back
              </Button>
              <AppLink className="td-btn td-btn--ghost" href="/app">
                Do this later
              </AppLink>
              <Button onClick={() => setStep(2)} variant="primary">
                Check the details
              </Button>
            </div>
          </section>
        ) : null}
        {step === 2 ? (
          <section aria-labelledby="pp-ob-details" className="pp-step">
            <h2 className="pp-h2" id="pp-ob-details">
              Check the details.
            </h2>
            {claimHandle ? (
              <Notice tone="info" title={`Claiming @${claimHandle}`}>
                Saving asks Duna to make this existing profile yours. Its match
                history is kept while Duna checks it.
              </Notice>
            ) : null}
            <PlayingProfileForm
              {...(claimHandle ? { initialClaimHandle: claimHandle } : {})}
              initialStory={story}
              onSaved={() => setDone(true)}
              saveLabel="Save and finish"
              settings={settings}
              {...(subject.self
                ? {}
                : {
                    subject: {
                      personId: subject.personId,
                      displayName: subject.displayName,
                    },
                  })}
            />
            <div className="pp-submit">
              <Button onClick={() => setStep(1)} variant="ghost">
                Back
              </Button>
              <AppLink className="td-btn td-btn--ghost" href="/app">
                Do this later
              </AppLink>
            </div>
          </section>
        ) : null}
      </PaneTransition>
    </div>
  );
}
