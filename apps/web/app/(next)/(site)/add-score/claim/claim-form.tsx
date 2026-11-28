"use client";

import type { AddScoreClaimPlayer, AddScoreDraftView } from "@duna/api";
import {
  Button,
  Field,
  Input,
  NetScore,
  Notice,
  OfflineBanner,
  ReferenceLine,
  useAction,
  useOnline,
} from "@duna/ui/tideline";
import { useEffect, useRef, useState } from "react";
import { type AddScoreFailure, claimAddScore } from "../actions";
import { focusFirstProblem, formatDay, nameRows } from "../flow-model";
import { contactFrom, type ClaimRow } from "./claim-model";

function rowsFor(
  players: AddScoreDraftView["data"]["teammates"],
  count: number,
): ClaimRow[] {
  return nameRows(players, count).map((row) => ({
    firstName: row.firstName,
    lastName: row.lastInitial,
    contact: "",
  }));
}

/**
 * Complete the names (a last name or an initial each), add a phone or email
 * for anyone who should get the confirm link, and save. One match is
 * created; the other side confirms; then the rating moves.
 */
export function ClaimForm({
  draft,
  under13,
}: {
  readonly draft: AddScoreDraftView;
  readonly under13: boolean;
}) {
  const online = useOnline();
  const format = draft.data.format ?? 2;
  const [teammates, setTeammates] = useState(() =>
    rowsFor(draft.data.teammates, format - 1),
  );
  const [opponents, setOpponents] = useState(() =>
    rowsFor(draft.data.opponents, format),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<AddScoreFailure>();
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (Object.keys(errors).length > 0) focusFirstProblem(formRef.current);
  }, [errors]);

  /** Checks that need no server, then the single-flight save. */
  function submit() {
    const found: Record<string, string> = {};
    const players = (
      side: "teammates" | "opponents",
      rows: ClaimRow[],
    ): AddScoreClaimPlayer[] =>
      rows.map((row, index) => {
        const key = `${side}.${index}`;
        if (!row.firstName.trim())
          found[`${key}.firstName`] = "Add their first name.";
        if (!row.lastName.trim())
          found[`${key}.lastName`] = "Add a last name or an initial.";
        const contact = contactFrom(row.contact);
        if (contact.error) found[`${key}.contact`] = contact.error;
        return {
          firstName: row.firstName.trim(),
          lastName: row.lastName.trim(),
          email: contact.email,
          phoneE164: contact.phoneE164,
        };
      });
    const input = {
      teammates: players("teammates", teammates),
      opponents: players("opponents", opponents),
    };
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    void save.run(input);
  }

  const save = useAction(
    async (
      { idempotencyKey },
      input: {
        readonly teammates: AddScoreClaimPlayer[];
        readonly opponents: AddScoreClaimPlayer[];
      },
    ) => {
      setFailure(undefined);
      const answer = await claimAddScore({ ...input, idempotencyKey });
      if (!answer.ok) {
        setFailure(answer);
        if (answer.fieldErrors) setErrors({ ...answer.fieldErrors });
        return;
      }
      // The signed-in app is its own document: a full page load.
      window.location.assign(`/app/matches/${answer.matchId}`);
    },
  );

  if (under13) {
    return (
      <Notice
        role="status"
        title="A parent or guardian needs to add this"
        tone="info"
      >
        Scores for players under 13 are added from a parent’s or guardian’s
        account. Your score stays in this browser until{" "}
        {formatDay(draft.expiresAt)}.
      </Notice>
    );
  }

  const sides: readonly {
    readonly key: "teammates" | "opponents";
    readonly legend: string;
    readonly rows: ClaimRow[];
    readonly set: (rows: ClaimRow[]) => void;
  }[] = [
    {
      key: "teammates",
      legend: format === 2 ? "Your partner" : "Your teammates",
      rows: teammates,
      set: setTeammates,
    },
    {
      key: "opponents",
      legend: "The other side",
      rows: opponents,
      set: setOpponents,
    },
  ];

  return (
    <div className="as-panel" ref={formRef}>
      <OfflineBanner writes="refused" />
      <div className="as-claim-summary">
        <NetScore
          announce={false}
          layout="auto"
          sets={(draft.data.sets ?? []).map(
            (set) => [set.you, set.them] as const,
          )}
          size="sm"
          status="pending-verification"
          teams={[
            [
              "You",
              ...teammates.map((row) => row.firstName).filter(Boolean),
            ].join(" / "),
            opponents
              .map((row) => row.firstName)
              .filter(Boolean)
              .join(" / ") || "Them",
          ]}
        />
        <p className="as-hint">
          {draft.place?.label}
          {draft.data.playedOn ? ` · ${formatDay(draft.data.playedOn)}` : ""}
        </p>
      </div>
      <h2 className="as-panel__title">Who played</h2>
      <p className="as-hint">
        A last name or an initial for everyone, so they can find the match when
        they join. Add a phone or email for anyone who should confirm it: we
        send one link, once. Nothing else.
      </p>
      {sides.map((side) =>
        side.rows.length === 0 ? null : (
          <fieldset className="as-side" key={side.key}>
            <legend className="as-control__label">{side.legend}</legend>
            {side.rows.map((row, index) => {
              const key = `${side.key}.${index}`;
              const update = (patch: Partial<ClaimRow>) =>
                side.set(
                  side.rows.map((item, at) =>
                    at === index ? { ...item, ...patch } : item,
                  ),
                );
              return (
                <div className="as-claim-row" key={key}>
                  {side.rows.length > 1 ? (
                    <p className="as-claim-row__who">
                      {side.key === "opponents" ? "Player" : "Teammate"}{" "}
                      {index + 1}
                    </p>
                  ) : null}
                  <Field error={errors[`${key}.firstName`]} label="First name">
                    <Input
                      autoComplete="off"
                      maxLength={40}
                      onValueChange={(value) =>
                        update({ firstName: String(value ?? "") })
                      }
                      value={row.firstName}
                    />
                  </Field>
                  <Field
                    error={errors[`${key}.lastName`]}
                    label="Last name or initial"
                  >
                    <Input
                      autoComplete="off"
                      maxLength={40}
                      onValueChange={(value) =>
                        update({ lastName: String(value ?? "") })
                      }
                      value={row.lastName}
                    />
                  </Field>
                  <Field
                    error={errors[`${key}.contact`]}
                    hint="For the confirm link only. A phone needs its country code (+1 …)."
                    label="Phone or email"
                    optional
                  >
                    <Input
                      autoComplete="off"
                      inputMode="email"
                      maxLength={320}
                      onValueChange={(value) =>
                        update({ contact: String(value ?? "") })
                      }
                      placeholder="name@example.com"
                      value={row.contact}
                    />
                  </Field>
                </div>
              );
            })}
          </fieldset>
        ),
      )}
      {failure ? (
        <Notice
          role={failure.kind === "error" ? "alert" : "status"}
          tone={
            failure.kind === "error"
              ? "danger"
              : failure.kind === "rate-limited"
                ? "warning"
                : "info"
          }
        >
          {failure.message}
          {failure.reference ? (
            <ReferenceLine reference={failure.reference} />
          ) : null}
          {failure.kind === "expired" ? (
            <>
              {" "}
              <a href="/add-score">Add a score</a>
            </>
          ) : null}
        </Notice>
      ) : null}
      <ol className="as-claim__steps">
        <li>We save the match to your account, waiting for confirmation.</li>
        <li>Anyone you gave a phone or email gets one link to confirm it.</li>
        <li>When someone on the other side confirms, your rating moves.</li>
      </ol>
      <div className="as-actions as-actions--start">
        <Button
          disabled={!online}
          loading={save.showPending}
          onClick={submit}
          size="lg"
          variant="primary"
        >
          Save to my account
        </Button>
      </div>
    </div>
  );
}
