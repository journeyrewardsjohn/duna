"use client";

import type { PeopleMergePreview, PeopleMergeResult } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import {
  Button,
  Combobox,
  Field,
  Notice,
  RadioGroup,
  RadioOption,
  riseClassName,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  mergePeopleAction,
  mergePreviewAction,
} from "@/app/(next)/(hq)/people/actions";
import { type MergeSide, mergeBlock, mergeMoves } from "./people-model";
import { PeopleActionError, reportFailure, unwrap } from "./people-result";

/**
 * Merge two records of one person: both side by side and the record to
 * keep; then Duna's own check (`mergePreview`): what stays, how many of each
 * kind move across, and every reason it can't happen, each in its own
 * sentence. Merging is one strong confirmation that restates it. A junior
 * and an adult are never offered at all.
 */
export function MergeFlow({
  people,
  initialA,
  initialB,
}: {
  readonly people: readonly MergeSide[];
  readonly initialA?: string;
  readonly initialB?: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [aId, setAId] = useState<string | null>(initialA ?? null);
  const [bId, setBId] = useState<string | null>(initialB ?? null);
  const [keep, setKeep] = useState<"a" | "b">("a");
  const [preview, setPreview] = useState<PeopleMergePreview>();
  const [stale, setStale] = useState<string>();
  const [merged, setMerged] = useState<{
    readonly result: PeopleMergeResult;
    readonly keptName: string;
    readonly mergedName: string;
  }>();
  const options = useMemo(
    () => people.map((person) => ({ value: person.id, label: person.name })),
    [people],
  );
  const a = people.find((person) => person.id === aId);
  const b = people.find((person) => person.id === bId);
  const kept = keep === "a" ? a : b;
  const other = keep === "a" ? b : a;
  const blocked = kept && other ? mergeBlock(kept, other) : undefined;

  const forget = () => {
    setPreview(undefined);
    setStale(undefined);
  };

  const check = useAction(
    async () => {
      if (!kept || !other)
        throw new PeopleActionError("Choose two people.", "invalid");
      return unwrap(
        await mergePreviewAction({ keepId: kept.id, mergeId: other.id }),
      );
    },
    {
      report: reportFailure("hq.people.merge_preview_failed"),
      onSuccess: (next) => {
        setPreview(next);
        setStale(undefined);
      },
    },
  );

  const choose = (side: "a" | "b", value: string | null) => {
    forget();
    check.reset();
    setMerged(undefined);
    if (side === "a") setAId(value);
    else setBId(value);
    const next = new URLSearchParams();
    const nextA = side === "a" ? value : aId;
    const nextB = side === "b" ? value : bId;
    if (nextA) next.set("a", nextA);
    if (nextB) next.set("b", nextB);
    const query = next.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${hqHref("peopleMerge")}${query ? `?${query}` : ""}`,
    );
  };

  const run = () => {
    if (!preview || !preview.canMerge || !kept || !other) return;
    const moves = mergeMoves(preview.moves);
    // The names on screen (the same two records the preview checked).
    const keptName = kept.name;
    const mergedName = other.name;
    void confirm
      .run({
        tier: "strong",
        destructive: true,
        title: `Merge ${mergedName} into ${keptName}?`,
        description: `${keptName}'s record stays. ${mergedName}'s record is marked merged and everything below joins ${keptName}.`,
        scope: (
          <ul className="people-plain-list">
            {preview.kept.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ),
        recipients: `${keptName} (kept) and ${mergedName} (merged in)`,
        consequence: `${moves.length > 0 ? `${moves.join(", ")} move to ${keptName}. ` : ""}No payment or waiver record is deleted, and no one is messaged. A merge can't be undone.`,
        reference: `Merge ${preview.previewId.slice(0, 8)}`,
        verb: `Merge into ${keptName}`,
        cancelLabel: "Keep both",
        agentConfirm: `Merges ${mergedName}'s record into ${keptName}'s as previewed`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await mergePeopleAction({
              previewId: preview.previewId,
              idempotencyKey,
            }),
          ),
        success: `${mergedName} merged into ${keptName}`,
        errorMessage: "Nothing was merged.",
        report: reportFailure("hq.people.merge_failed"),
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          setMerged({ result: outcome.result, keptName, mergedName });
          setPreview(undefined);
          router.refresh();
        }
        if (
          outcome.status === "failed" &&
          outcome.error instanceof PeopleActionError &&
          outcome.error.code === "stale"
        ) {
          setStale(outcome.error.userMessage);
        }
      });
  };

  const column = (person: MergeSide | undefined, label: string) => (
    <div className="people-merge__side" data-kept={person && person === kept}>
      <p className="people-eyebrow">{label}</p>
      {person ? (
        <dl className="people-facts">
          <div>
            <dt>Name</dt>
            <dd>{person.name}</dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd>
              {person.isJunior
                ? "Through the guardian"
                : [person.email, person.phone].filter(Boolean).join(" · ") ||
                  "None"}
            </dd>
          </div>
          <div>
            <dt>Plan</dt>
            <dd>{person.plan ?? "No plan"}</dd>
          </div>
          <div>
            <dt>Credits</dt>
            <dd className="people-num">{person.credits}</dd>
          </div>
          <div>
            <dt>Joined</dt>
            <dd>{person.memberSince.slice(0, 10)}</dd>
          </div>
          <div>
            <dt>Coming up</dt>
            <dd className="people-num">{person.upcoming}</dd>
          </div>
        </dl>
      ) : (
        <p className="people-quiet">Choose a person.</p>
      )}
    </div>
  );

  const moves = preview ? mergeMoves(preview.moves) : [];

  return (
    <div className="people-merge">
      <div className="people-form people-form--grid">
        <Field label="First record">
          <Combobox
            emptyText="No one by that name"
            onValueChange={(value) => choose("a", value)}
            options={options}
            placeholder="Search by name"
            value={aId}
          />
        </Field>
        <Field label="Second record">
          <Combobox
            emptyText="No one by that name"
            onValueChange={(value) => choose("b", value)}
            options={options}
            placeholder="Search by name"
            value={bId}
          />
        </Field>
      </div>

      <section aria-label="Side by side" className="people-merge__compare">
        {column(a, "First record")}
        {column(b, "Second record")}
      </section>

      {merged ? (
        <Notice
          action={
            <Button
              href={hqHref("member", { personId: merged.result.personId })}
              size="sm"
              variant="secondary"
            >
              {`Open ${merged.keptName}`}
            </Button>
          }
          className={riseClassName()}
          role="status"
          title="Merged"
          tone="positive"
        >
          {`${merged.mergedName} is now part of ${merged.keptName}. ${
            mergeMoves(merged.result.moved).join(", ") ||
            "Nothing needed to move"
          }. No one was messaged.`}
        </Notice>
      ) : null}

      {a && b ? (
        <>
          <Field label="Keep">
            <RadioGroup
              inline
              onValueChange={(value) => {
                forget();
                check.reset();
                setKeep(value as "a" | "b");
              }}
              value={keep}
            >
              <RadioOption label={`${a.name}'s record`} value="a" />
              <RadioOption label={`${b.name}'s record`} value="b" />
            </RadioGroup>
          </Field>
          {blocked ? (
            <Notice role="alert" title="These can't be merged" tone="warning">
              {blocked}
            </Notice>
          ) : null}
          {check.error ? (
            <Notice
              role="alert"
              title="Duna couldn't check this merge"
              tone="danger"
            >
              {(check.error as { userMessage?: string }).userMessage ??
                "Something went wrong on our side. Nothing was changed; try again."}
            </Notice>
          ) : null}
          {preview ? (
            <section
              aria-label="What is kept"
              className={`people-merge__plan ${riseClassName()}`}
            >
              {preview.canMerge ? null : (
                <Notice
                  role="alert"
                  title="These can't be merged"
                  tone="warning"
                >
                  <ul className="people-plain-list">
                    {preview.blockers.map((blocker) => (
                      <li key={blocker.code}>{blocker.message}</li>
                    ))}
                  </ul>
                </Notice>
              )}
              <p className="people-eyebrow">{`What ${kept?.name ?? preview.keep.displayName} keeps`}</p>
              <ul className="people-plain-list">
                {preview.kept.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="people-eyebrow">{`What moves from ${other?.name ?? preview.merge.displayName}`}</p>
              <p className="people-body">
                {moves.length > 0
                  ? `${moves.join(", ")}.`
                  : "Nothing else to move: only the record itself is merged."}
              </p>
              {stale ? (
                <Notice
                  role="alert"
                  title="The check is out of date"
                  tone="warning"
                >
                  {stale}
                </Notice>
              ) : null}
            </section>
          ) : null}
          <div className="people-actions">
            {preview && preview.canMerge && !stale ? (
              <Button onClick={run} variant="primary">
                {`Merge into ${kept?.name ?? preview.keep.displayName}`}
              </Button>
            ) : (
              <Button
                {...check.buttonProps}
                disabled={Boolean(blocked) || check.pending}
                variant={preview ? "secondary" : "primary"}
              >
                {preview ? "Check again" : "Review the merge"}
              </Button>
            )}
          </div>
        </>
      ) : null}
      {confirm.dialog}
    </div>
  );
}
