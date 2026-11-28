"use client";

import type { TrainingDrillsDetail } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { trainingSceneExamples } from "@duna/core/training-scene";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  Field,
  Input,
  Notice,
  NumberInput,
  PaneTransition,
  Segmented,
  Select,
  Textarea,
  useAction,
  useLeaveGuard,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { saveDrillAction } from "@/app/(next)/(hq)/training/actions";
import { unwrap } from "../money/money-action-result";
import { reportFailure } from "../team/team-report";
import { parseSceneText, readScene, sceneIssueWords } from "./drill-model";
import { SceneSlot } from "./scene-slot";

type SceneSource = "keep" | "example" | "paste" | "none";

function exampleTitle(example: Record<string, unknown>): string {
  return typeof example.title === "string" ? example.title : "Example";
}

function exampleMeta(example: Record<string, unknown>) {
  const meta = (example.meta ?? {}) as {
    durationMinutes?: number;
    focus?: string;
    level?: string;
    players?: { min?: number; max?: number; recommended?: number };
  };
  return meta;
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * A new drill, or a new version of one. The drawing is chosen here, not
 * drawn: start from one of Duna's example scenes, or paste a scene
 * document; it is validated with readable problems before it can be saved.
 * Every save is a new version; plans keep the version they use.
 */
export function DrillForm({
  drill,
}: {
  readonly drill?: TrainingDrillsDetail;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(drill?.title ?? "");
  const [focus, setFocus] = useState(drill?.focus ?? "");
  const [summary, setSummary] = useState(drill?.summary ?? "");
  const [purpose, setPurpose] = useState(drill?.purpose ?? "");
  const [audience, setAudience] = useState(drill?.targetAudience ?? "");
  const [description, setDescription] = useState(
    drill?.descriptionMarkdown ?? "",
  );
  const [minPlayers, setMinPlayers] = useState<number | null>(
    drill?.players.min ?? 4,
  );
  const [maxPlayers, setMaxPlayers] = useState<number | null>(
    drill?.players.max ?? 6,
  );
  const [recommended, setRecommended] = useState<number | null>(
    drill?.players.recommended ?? 4,
  );
  const [minutes, setMinutes] = useState<number | null>(
    drill?.durationMinutes ?? 15,
  );
  const [level, setLevel] = useState(drill?.level ?? "Intermediate");
  const [equipment, setEquipment] = useState(
    (drill?.equipment ?? ["Balls"]).join(", "),
  );
  const [cues, setCues] = useState((drill?.coachingCues ?? []).join("\n"));
  const [rotation, setRotation] = useState(drill?.rotationRule ?? "");
  const [success, setSuccess] = useState(drill?.successCriteria ?? "");
  const [scope, setScope] = useState<"personal" | "club">(
    drill?.scope === "club" ? "club" : "personal",
  );
  const [changeNote, setChangeNote] = useState("");
  const [source, setSource] = useState<SceneSource>(
    drill?.scene ? "keep" : "example",
  );
  const [exampleIndex, setExampleIndex] = useState(0);
  const [pasted, setPasted] = useState("");
  const [touched, setTouched] = useState(false);

  const scene = useMemo((): {
    document?: Record<string, unknown>;
    problem?: string;
  } => {
    switch (source) {
      case "keep":
        return {};
      case "none":
        return {};
      case "example":
        return {
          document: trainingSceneExamples[exampleIndex] as Record<
            string,
            unknown
          >,
        };
      case "paste": {
        const parsed = parseSceneText(pasted);
        return parsed.ok
          ? { document: parsed.document }
          : { problem: parsed.message };
      }
    }
  }, [source, exampleIndex, pasted]);
  const validation = scene.document
    ? readScene(scene.document).validation
    : undefined;
  const issues = validation ? sceneIssueWords(validation) : [];
  const sceneBlocks =
    source === "paste" &&
    (Boolean(scene.problem) || (validation !== undefined && !validation.ok));
  const leave = useLeaveGuard(Boolean(title.trim()) && !touched);

  const problems = [
    !title.trim() ? "Name the drill." : undefined,
    !focus.trim() ? "Give it a focus." : undefined,
    minPlayers && maxPlayers && minPlayers > maxPlayers
      ? "The fewest players is more than the most."
      : undefined,
    sceneBlocks ? "Fix the pasted scene, or choose an example." : undefined,
  ].filter((row): row is string => Boolean(row));

  const save = useAction(
    async ({ idempotencyKey }) =>
      unwrap(
        await saveDrillAction({
          ...(drill ? { drillId: drill.id } : {}),
          title: title.trim(),
          scope,
          focus: focus.trim(),
          summary: summary.trim(),
          purpose: purpose.trim(),
          targetAudience: audience.trim(),
          descriptionMarkdown: description,
          players: {
            min: Math.max(1, minPlayers ?? 1),
            max: Math.max(1, maxPlayers ?? minPlayers ?? 1),
            recommended: Math.max(1, recommended ?? minPlayers ?? 1),
          },
          durationMinutes: Math.max(1, minutes ?? 10),
          level: level.trim() || "All levels",
          equipment: equipment
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 20),
          coachingCues: lines(cues).slice(0, 20),
          ...(rotation.trim() ? { rotationRule: rotation.trim() } : {}),
          ...(success.trim() ? { successCriteria: success.trim() } : {}),
          ...(scene.document ? { scene: scene.document } : {}),
          ...(changeNote.trim() ? { changeNote: changeNote.trim() } : {}),
          idempotencyKey,
        }),
      ),
    {
      report: reportFailure("hq.training.save_drill_failed"),
      messages: {
        success: (result) =>
          drill
            ? `Saved as version ${result.version}`
            : `${result.title} saved`,
      },
      onSuccess: (result) => {
        setTouched(true);
        router.push(hqHref("trainingDrill", { drillId: result.id }));
      },
    },
  );

  const chooseExample = (index: number) => {
    setExampleIndex(index);
    const example = trainingSceneExamples[index] as Record<string, unknown>;
    const meta = exampleMeta(example);
    if (!title.trim()) setTitle(exampleTitle(example));
    if (!focus.trim() && meta.focus)
      setFocus(
        meta.focus.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      );
    if (!drill && meta.durationMinutes) setMinutes(meta.durationMinutes);
    if (!drill && meta.players?.min) setMinPlayers(meta.players.min);
    if (!drill && meta.players?.max) setMaxPlayers(meta.players.max);
    if (!drill && meta.players?.recommended)
      setRecommended(meta.players.recommended);
  };

  return (
    <form
      aria-label={drill ? `Edit ${drill.title}` : "New drill"}
      className="tr-stack"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (problems.length === 0) void save.run();
      }}
    >
      <section aria-labelledby="df-drawing" className="tr-card">
        <h2 className="tr-h2" id="df-drawing">
          The drawing
        </h2>
        <p className="tr-quiet">
          Drawing on the court by hand isn&apos;t here yet. Start from one of
          Duna&apos;s example scenes, or paste a scene document; Duna checks it
          before it is saved.
        </p>
        <Segmented
          aria-label="Where the drawing comes from"
          onValueChange={(value) => setSource(value as SceneSource)}
          options={[
            ...(drill?.scene ? [{ value: "keep", label: "Keep it" }] : []),
            { value: "example", label: "An example" },
            { value: "paste", label: "Paste" },
            ...(drill?.scene ? [] : [{ value: "none", label: "None yet" }]),
          ]}
          value={source}
        />
        <PaneTransition direction="forward" transitionKey={source}>
          {source === "example" ? (
            <Field label="Example">
              <Select
                onValueChange={(value) =>
                  value !== null && chooseExample(Number(value))
                }
                options={trainingSceneExamples.map((example, index) => ({
                  value: String(index),
                  label: exampleTitle(example as Record<string, unknown>),
                }))}
                value={String(exampleIndex)}
              />
            </Field>
          ) : source === "paste" ? (
            <Field
              hint="A Duna scene document (JSON, up to 64 KB). It is read, never run."
              label="Scene document"
            >
              <Textarea
                className="tr-code"
                maxLength={65_536}
                onChange={(event) => setPasted(event.currentTarget.value)}
                rows={8}
                spellCheck={false}
                value={pasted}
              />
            </Field>
          ) : null}
        </PaneTransition>
        {scene.problem && pasted.trim() ? (
          <p className="tr-problem" role="alert">
            <Icon name="alert" size="inline" />
            {scene.problem}
          </p>
        ) : null}
        {validation && !validation.ok ? (
          <Notice
            title={`The scene has ${issues.length} ${issues.length === 1 ? "problem" : "problems"}`}
            tone="attention"
          >
            <ul className="tr-list">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        {source === "keep" && drill?.scene ? (
          <SceneSlot
            label={`${drill.title}: the current drawing`}
            mode="diagram"
            scene={drill.scene.document}
          />
        ) : scene.document && validation?.ok ? (
          <SceneSlot
            label={`${title || "New drill"}: the drawing`}
            mode="diagram"
            scene={scene.document}
          />
        ) : null}
      </section>

      <section aria-labelledby="df-about" className="tr-card">
        <h2 className="tr-h2" id="df-about">
          About the drill
        </h2>
        <div className="tr-grid2">
          <Field
            error={touched && !title.trim() ? "Name the drill." : undefined}
            label="Name"
          >
            <Input
              maxLength={160}
              onChange={(event) => setTitle(event.currentTarget.value)}
              value={title}
            />
          </Field>
          <Field
            error={touched && !focus.trim() ? "Give it a focus." : undefined}
            label="Focus"
          >
            <Input
              maxLength={80}
              onChange={(event) => setFocus(event.currentTarget.value)}
              placeholder="Serve-receive"
              value={focus}
            />
          </Field>
          <Field label="Level">
            <Input
              maxLength={80}
              onChange={(event) => setLevel(event.currentTarget.value)}
              value={level}
            />
          </Field>
          <Field label="Minutes">
            <NumberInput
              max={480}
              min={1}
              onValueChange={setMinutes}
              value={minutes}
            />
          </Field>
          <Field label="Fewest players">
            <NumberInput
              min={1}
              onValueChange={setMinPlayers}
              value={minPlayers}
            />
          </Field>
          <Field label="Most players">
            <NumberInput
              min={1}
              onValueChange={setMaxPlayers}
              value={maxPlayers}
            />
          </Field>
          <Field label="Best with">
            <NumberInput
              min={1}
              onValueChange={setRecommended}
              value={recommended}
            />
          </Field>
          <Field hint="Separated by commas" label="Equipment">
            <Input
              maxLength={400}
              onChange={(event) => setEquipment(event.currentTarget.value)}
              value={equipment}
            />
          </Field>
        </div>
        <Field label="In one line" optional>
          <Input
            maxLength={500}
            onChange={(event) => setSummary(event.currentTarget.value)}
            value={summary}
          />
        </Field>
        <Field label="Purpose" optional>
          <Textarea
            autoResize
            maxLength={2000}
            onChange={(event) => setPurpose(event.currentTarget.value)}
            rows={2}
            value={purpose}
          />
        </Field>
        <Field label="Who it's for" optional>
          <Input
            maxLength={500}
            onChange={(event) => setAudience(event.currentTarget.value)}
            value={audience}
          />
        </Field>
        <Field hint="One per line" label="Coaching points" optional>
          <Textarea
            autoResize
            maxLength={6000}
            onChange={(event) => setCues(event.currentTarget.value)}
            rows={3}
            value={cues}
          />
        </Field>
        <div className="tr-grid2">
          <Field label="Rotation" optional>
            <Input
              maxLength={500}
              onChange={(event) => setRotation(event.currentTarget.value)}
              value={rotation}
            />
          </Field>
          <Field label="Success looks like" optional>
            <Input
              maxLength={500}
              onChange={(event) => setSuccess(event.currentTarget.value)}
              value={success}
            />
          </Field>
        </div>
        <Field label="Variations and notes" optional>
          <Textarea
            autoResize
            maxLength={20_000}
            onChange={(event) => setDescription(event.currentTarget.value)}
            rows={3}
            value={description}
          />
        </Field>
      </section>

      <section aria-label="Save" className="tr-card">
        {drill ? null : (
          <Segmented
            aria-label="Who sees it"
            onValueChange={(value) => setScope(value as "personal" | "club")}
            options={[
              { value: "personal", label: "Only me for now" },
              { value: "club", label: "Share with my club" },
            ]}
            value={scope}
          />
        )}
        {drill ? (
          <Field label="What changed" optional>
            <Input
              maxLength={500}
              onChange={(event) => setChangeNote(event.currentTarget.value)}
              value={changeNote}
            />
          </Field>
        ) : null}
        {touched
          ? problems.map((problem) => (
              <p className="tr-problem" key={problem} role="alert">
                <Icon name="alert" size="inline" />
                {problem}
              </p>
            ))
          : null}
        <div className="tr-actions">
          <Button loading={save.showPending} type="submit" variant="primary">
            {drill ? `Save as version ${drill.version + 1}` : "Save the drill"}
          </Button>
          <Button
            onClick={() =>
              void leave.guard(() =>
                router.push(
                  drill
                    ? hqHref("trainingDrill", { drillId: drill.id })
                    : hqHref("trainingDrills"),
                ),
              )
            }
            variant="ghost"
          >
            Cancel
          </Button>
        </div>
        {save.status === "error" ? (
          <p className="tr-problem" role="alert">
            <Icon name="alert" size="inline" />
            {save.error instanceof Error ? save.error.message : "Not saved."}
          </p>
        ) : null}
      </section>
    </form>
  );
}
