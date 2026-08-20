"use client";

import {
  TRAINING_FOCUS_AREAS,
  type TrainingDrill,
  type TrainingFocusArea,
} from "@duna/api/training-contracts";
import {
  BookOpenCheck,
  Check,
  CircleAlert,
  Dumbbell,
  Eye,
  Gauge,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  UsersRound,
  WandSparkles,
} from "lucide-react";
import { useState, useTransition } from "react";
import {
  generateTrainingDrillAction,
  saveTrainingDrillAction,
} from "@/app/training/actions";
import { TrainingCourtAnimation } from "./training-court-animation";

const examples = [
  "Three pairs. A server targets the seam, the receiving pair must side out, then immediately solve a coach-entered transition ball. Win both to score a wash point. Rotate after four starts.",
  "Setters begin in four defensive positions, release when the passer contacts the ball, and deliver a hittable set to a target. Cooperative streak, then finish with a pressure round.",
  "Blocker calls line or angle from the hitter's approach while the defender adjusts. Play one transition after a dig. Defense scores two for converting the rally.",
] as const;

type Notice = {
  readonly status: "success" | "error";
  readonly message: string;
};

export function TrainingDrillStudio() {
  const [description, setDescription] = useState<string>(examples[0]);
  const [titleHint, setTitleHint] = useState("");
  const [mode, setMode] = useState<
    "cooperative" | "competitive" | "hybrid" | "individual"
  >("hybrid");
  const [skillLevel, setSkillLevel] = useState("Intermediate–Advanced");
  const [playerCount, setPlayerCount] = useState(8);
  const [minPlayers, setMinPlayers] = useState(4);
  const [maxPlayers, setMaxPlayers] = useState(12);
  const [durationMinutes, setDurationMinutes] = useState(14);
  const [ballCount, setBallCount] = useState(3);
  const [intensity, setIntensity] = useState(7);
  const [focusArea, setFocusArea] = useState<TrainingFocusArea | "auto">(
    "auto",
  );
  const [usesSource, setUsesSource] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceLicense, setSourceLicense] = useState("");
  const [sourceAttribution, setSourceAttribution] = useState("");
  const [sourceRightsConfirmed, setSourceRightsConfirmed] = useState(false);
  const [draft, setDraft] = useState<TrainingDrill>();
  const [notice, setNotice] = useState<Notice>();
  const [pending, startTransition] = useTransition();
  const [saving, startSaving] = useTransition();

  const sourceUrlIsValid = (() => {
    if (!sourceUrl.trim()) return false;
    try {
      return ["http:", "https:"].includes(new URL(sourceUrl).protocol);
    } catch {
      return false;
    }
  })();
  const sourceIsReady =
    !usesSource ||
    (sourceName.trim().length > 1 &&
      sourceUrlIsValid &&
      sourceLicense.trim().length > 1 &&
      sourceRightsConfirmed);

  const generate = () => {
    setNotice(undefined);
    startTransition(async () => {
      const result = await generateTrainingDrillAction({
        description,
        titleHint: titleHint || undefined,
        discipline: "beach-2s",
        skillLevel,
        mode,
        playerCount,
        minPlayers,
        maxPlayers,
        durationMinutes,
        ballCount,
        intensity,
        focusArea: focusArea === "auto" ? undefined : focusArea,
      });
      setNotice(result);
      if (result.status === "success") {
        setDraft({
          ...result.value,
          ...(usesSource
            ? {
                source: {
                  name: sourceName.trim(),
                  url: sourceUrl.trim(),
                  license: sourceLicense.trim(),
                  rightsConfirmed: true,
                  ...(sourceAttribution.trim()
                    ? { attribution: sourceAttribution.trim() }
                    : {}),
                },
              }
            : {}),
        });
      }
    });
  };

  const save = () => {
    if (!draft) return;
    setNotice(undefined);
    startSaving(async () => {
      const result = await saveTrainingDrillAction(draft);
      setNotice(result);
    });
  };

  return (
    <div className="training-drill-studio">
      <section className="training-studio-controls">
        <div className="training-studio-controls__intro">
          <span>
            <Sparkles aria-hidden size={16} /> Coach brief
          </span>
          <h2>How does the drill work?</h2>
          <p>
            Describe the motion, rotation, scoring, and what good looks like.
            Plain language is better than filling out a database.
          </p>
        </div>
        <label className="training-prompt-field">
          <span>Tell Duna in your own words</span>
          <textarea
            maxLength={6_000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Players begin… The coach enters… Rotate when… Score by…"
            rows={9}
            value={description}
          />
          <small>{description.length.toLocaleString()} / 6,000</small>
        </label>
        <div className="training-example-prompts">
          <span>Try an example</span>
          <div>
            {examples.map((example, index) => (
              <button
                key={example}
                onClick={() => setDescription(example)}
                type="button"
              >
                0{index + 1}
              </button>
            ))}
          </div>
        </div>
        <div className="training-studio-fields">
          <label>
            <span>Name · optional</span>
            <input
              onChange={(event) => setTitleHint(event.target.value)}
              placeholder="Duna can name it"
              value={titleHint}
            />
          </label>
          <label>
            <span>Focus</span>
            <select
              onChange={(event) =>
                setFocusArea(event.target.value as TrainingFocusArea | "auto")
              }
              value={focusArea}
            >
              <option value="auto">Let Duna identify it</option>
              {TRAINING_FOCUS_AREAS.map((focus) => (
                <option key={focus} value={focus}>
                  {focus}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>How it feels</span>
            <select
              onChange={(event) => setMode(event.target.value as typeof mode)}
              value={mode}
            >
              <option value="cooperative">Cooperative</option>
              <option value="competitive">Competitive</option>
              <option value="hybrid">Build, then compete</option>
              <option value="individual">Individual reps</option>
            </select>
          </label>
          <label>
            <span>Athlete level</span>
            <input
              onChange={(event) => setSkillLevel(event.target.value)}
              value={skillLevel}
            />
          </label>
        </div>
        <div className="training-studio-number-grid">
          <label>
            <span>Players</span>
            <input
              min="1"
              onChange={(event) => setPlayerCount(Number(event.target.value))}
              type="number"
              value={playerCount}
            />
          </label>
          <label>
            <span>Minimum</span>
            <input
              min="1"
              onChange={(event) => setMinPlayers(Number(event.target.value))}
              type="number"
              value={minPlayers}
            />
          </label>
          <label>
            <span>Maximum</span>
            <input
              min={minPlayers}
              onChange={(event) => setMaxPlayers(Number(event.target.value))}
              type="number"
              value={maxPlayers}
            />
          </label>
          <label>
            <span>Minutes</span>
            <input
              min="1"
              onChange={(event) =>
                setDurationMinutes(Number(event.target.value))
              }
              type="number"
              value={durationMinutes}
            />
          </label>
          <label>
            <span>Balls</span>
            <input
              min="0"
              onChange={(event) => setBallCount(Number(event.target.value))}
              type="number"
              value={ballCount}
            />
          </label>
        </div>
        <label className="training-intensity-field">
          <span>
            <b>Estimated intensity</b>
            <strong>{intensity} / 10</strong>
          </span>
          <input
            max="10"
            min="1"
            onChange={(event) => setIntensity(Number(event.target.value))}
            type="range"
            value={intensity}
          />
          <small>Coach planning context—not a player health prediction.</small>
        </label>
        <section className="training-source-intake">
          <label className="training-source-intake__toggle">
            <span>
              <BookOpenCheck aria-hidden size={17} />
              <span>
                <strong>Adapting a source?</strong>
                <small>Preserve its origin and reuse rights.</small>
              </span>
            </span>
            <input
              checked={usesSource}
              onChange={(event) => setUsesSource(event.target.checked)}
              type="checkbox"
            />
          </label>
          {usesSource && (
            <div className="training-source-intake__fields">
              <p>
                Describe or paste the permitted material in your coach brief.
                Duna records provenance; a web address alone does not grant
                permission to copy it.
              </p>
              <label>
                <span>Source or organization</span>
                <input
                  onChange={(event) => setSourceName(event.target.value)}
                  placeholder="Example: club coaching manual"
                  value={sourceName}
                />
              </label>
              <label>
                <span>Original URL</span>
                <input
                  aria-invalid={Boolean(sourceUrl) && !sourceUrlIsValid}
                  inputMode="url"
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://…"
                  type="url"
                  value={sourceUrl}
                />
                {sourceUrl && !sourceUrlIsValid && (
                  <small>Enter a complete http or https address.</small>
                )}
              </label>
              <label>
                <span>License or permission basis</span>
                <input
                  onChange={(event) => setSourceLicense(event.target.value)}
                  placeholder="Owned by our club, CC BY 4.0, written permission…"
                  value={sourceLicense}
                />
              </label>
              <label>
                <span>Attribution · optional</span>
                <input
                  onChange={(event) => setSourceAttribution(event.target.value)}
                  placeholder="How the source asks to be credited"
                  value={sourceAttribution}
                />
              </label>
              <label className="training-source-intake__confirmation">
                <input
                  checked={sourceRightsConfirmed}
                  onChange={(event) =>
                    setSourceRightsConfirmed(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  <ShieldCheck aria-hidden size={17} /> I confirm this
                  organization may adapt and store this material.
                </span>
              </label>
            </div>
          )}
        </section>
        <button
          className="training-ai-generate"
          disabled={pending || description.trim().length < 20 || !sourceIsReady}
          onClick={generate}
          type="button"
        >
          {pending ? (
            <>
              <RotateCcw aria-hidden className="training-spin" size={19} />{" "}
              Designing the drill…
            </>
          ) : (
            <>
              <WandSparkles aria-hidden size={19} /> Build my drill
            </>
          )}
        </button>
        {notice && (
          <p
            className={`training-studio-notice training-studio-notice--${notice.status}`}
            role={notice.status === "error" ? "alert" : "status"}
          >
            {notice.status === "success" ? (
              <Check aria-hidden size={15} />
            ) : (
              <CircleAlert aria-hidden size={15} />
            )}
            {notice.message}
          </p>
        )}
        <aside className="training-ai-boundary">
          <Eye aria-hidden size={17} />
          <p>
            <strong>You stay the coach.</strong> Duna makes a reviewable draft.
            Public drills enter shared-library review; nothing is silently
            published.
          </p>
        </aside>
      </section>

      <section
        className={`training-drill-preview${draft ? " training-drill-preview--ready" : ""}`}
      >
        {!draft ? (
          <div className="training-drill-preview__empty">
            <div>
              <Dumbbell aria-hidden size={27} />
            </div>
            <span className="hq-eyebrow">Your drill will take shape here</span>
            <h2>Court motion, not another wall of fields.</h2>
            <p>
              Duna will show the roles, movement, rotation, scoring, coaching
              cues, tags, intensity, and explainable contact estimate together.
            </p>
          </div>
        ) : (
          <>
            <TrainingCourtAnimation drill={draft} />
            <header className="training-drill-preview__heading">
              <div>
                <span>{draft.focusArea}</span>
                <small>
                  {draft.mode} · {draft.skillLevel}
                </small>
              </div>
              <input
                aria-label="Drill title"
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
                value={draft.title}
              />
              <textarea
                aria-label="Drill summary"
                onChange={(event) =>
                  setDraft({ ...draft, summary: event.target.value })
                }
                rows={2}
                value={draft.summary}
              />
            </header>
            <div className="training-drill-preview__signals">
              <article>
                <UsersRound aria-hidden size={18} />
                <span>Group</span>
                <strong>
                  {draft.minPlayers}–{draft.maxPlayers}
                </strong>
                <small>{draft.recommendedPlayers} recommended</small>
              </article>
              <article>
                <Gauge aria-hidden size={18} />
                <span>Intensity</span>
                <strong>{draft.intensity} / 10</strong>
                <small>{draft.durationMinutes} minutes</small>
              </article>
              <article>
                <Target aria-hidden size={18} />
                <span>Typical opportunity</span>
                <strong>~{draft.estimate.touchesTypical}</strong>
                <small>
                  {draft.estimate.touchesLow}–{draft.estimate.touchesHigh}{" "}
                  touches
                </small>
              </article>
            </div>
            <div className="training-drill-preview__content">
              <section>
                <span className="hq-eyebrow">Run it</span>
                <ol>
                  {draft.steps.map((step, index) => (
                    <li key={`${step}-${index}`}>
                      <span>{index + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </section>
              <section>
                <span className="hq-eyebrow">Coach it</span>
                <ul>
                  {draft.coachingCues.map((cue) => (
                    <li key={cue}>{cue}</li>
                  ))}
                </ul>
                <strong>Scoring</strong>
                <p>{draft.scoring}</p>
              </section>
            </div>
            <div className="training-drill-preview__tags">
              {draft.tags.map((tag) => (
                <span key={tag.id}>{tag.label}</span>
              ))}
            </div>
            <div className="training-drill-preview__estimate">
              <div>
                <span>Estimate basis</span>
                <b>{draft.estimate.confidence} confidence</b>
              </div>
              <p>{draft.estimate.basis.join(" · ")}</p>
              <small>{draft.estimate.assumptions[0]}</small>
            </div>
            <footer>
              <div role="group" aria-label="Drill visibility">
                <button
                  className={
                    draft.visibility === "organization" ? "active" : undefined
                  }
                  onClick={() =>
                    setDraft({ ...draft, visibility: "organization" })
                  }
                  type="button"
                >
                  Private to organization
                </button>
                <button
                  className={
                    draft.visibility === "public" ? "active" : undefined
                  }
                  onClick={() => setDraft({ ...draft, visibility: "public" })}
                  type="button"
                >
                  Submit to public library
                </button>
              </div>
              <button
                className="hq-button hq-button--primary"
                disabled={saving}
                onClick={save}
                type="button"
              >
                <Save aria-hidden size={17} />{" "}
                {saving
                  ? "Saving…"
                  : draft.visibility === "public"
                    ? "Save + submit"
                    : "Save private drill"}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
