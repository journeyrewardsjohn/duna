"use client";

import type { SetupProposal, SetupRun } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import {
  Button,
  Chip,
  ErrorState,
  Icon,
  Notice,
  Rise,
  RallyLoader,
  riseClassName,
  rallyStyle,
  useConfirm,
} from "@duna/ui/tideline";
import { report } from "@duna/observability";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { applyAction, decideAction, proposalsAction } from "./actions";
import { type Decide, FactCard } from "./fact-card";
import { RunOutcome } from "./run-outcome";
import { RunWatcher } from "./run-watcher";
import {
  appliedEntityLink,
  applyLine,
  applySummary,
  groupCountText,
  groupProposals,
  isRunActive,
  type MarkForm,
  proposalValue,
  reviewGroupLabels,
  reviewGroupOf,
  runCopy,
  siteName,
} from "./setup-model";
import { unwrap } from "./setup-result";

export interface ReviewBrand {
  readonly color: string;
  readonly logo?: string | null;
  readonly tile?: string | null;
}

/**
 * The review (CS-Found): everything a read found, grouped, each a card with
 * Keep / Edit / Skip, a running summary of exactly what Apply will write,
 * and Apply through the kit's confirmation (strong when it touches prices or
 * policies). Apply writes drafts only: nothing is published, nobody is
 * invited, no live price changes. The result says what was created, with
 * links. A read still going shows its progress first.
 */
export function ReviewScreen({
  initialRun,
  initialProposals,
  currency,
  clubName,
  brand,
  reader,
}: {
  readonly initialRun: SetupRun;
  readonly initialProposals: readonly SetupProposal[] | null;
  readonly currency: string;
  readonly clubName: string;
  readonly brand: ReviewBrand;
  readonly reader: "ready" | "not-configured";
}) {
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [proposals, setProposals] = useState<SetupProposal[] | null>(
    initialProposals ? [...initialProposals] : null,
  );
  const [loadFailure, setLoadFailure] = useState<{ reference?: string } | null>(
    null,
  );
  const [held, setHeld] = useState<Record<string, string>>({});
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [applied, setApplied] = useState<SetupProposal[] | null>(null);
  const [form, setForm] = useState<MarkForm>(
    brand.logo ? "logo" : brand.tile ? "tile" : "monogram",
  );
  const confirm = useConfirm();

  const loadProposals = async (runId: string) => {
    setLoadFailure(null);
    const result = await proposalsAction(runId);
    if (result.ok) setProposals(result.data);
    else setLoadFailure({ reference: result.reference });
  };

  const replace = (next: SetupProposal) =>
    setProposals((current) =>
      current
        ? current.map((p) => (p.id === next.id ? { ...p, ...next } : p))
        : current,
    );

  const onDecide: Decide = async (proposal, decision, editedPayload) => {
    const result = await decideAction(
      decision === "edited"
        ? {
            proposalId: proposal.id,
            decision,
            editedPayload: editedPayload ?? {},
          }
        : { proposalId: proposal.id, decision },
    );
    if (!result.ok) return { ok: false, message: result.message };
    replace({
      ...result.data,
      decision,
      ...(decision === "edited" ? { editedPayload } : {}),
    });
    setHeld((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => id !== proposal.id),
      ),
    );
    return { ok: true };
  };

  const keepAll = async (groupKey: string) => {
    if (!proposals || bulkBusy) return;
    setBulkBusy(groupKey);
    const reasons: Record<string, string> = {};
    for (const proposal of proposals) {
      if (
        reviewGroupOf(proposal) !== groupKey ||
        proposal.decision !== "pending"
      )
        continue;
      if (proposal.candidates.length > 1) {
        reasons[proposal.id] =
          "Your website shows more than one value: pick one yourself.";
        continue;
      }
      const result = await onDecide(proposal, "kept");
      if (!result.ok) reasons[proposal.id] = result.message;
    }
    setHeld((current) => ({ ...current, ...reasons }));
    setBulkBusy(null);
  };

  const groups = useMemo(
    () => (proposals ? groupProposals(proposals) : []),
    [proposals],
  );
  const summary = useMemo(() => applySummary(proposals ?? []), [proposals]);

  // The brand as it would look with this read's values.
  const colours = proposals?.find((p) => p.fieldKey === "identity.colors");
  const logo = proposals?.find((p) => p.fieldKey === "identity.logo");
  const previewBrand = {
    color: String((colours && proposalValue(colours).primary) ?? brand.color),
    logo: (logo && String(proposalValue(logo).url ?? "")) || brand.logo,
    tile: brand.tile,
    form,
    onFormChange: setForm,
  };

  const apply = () =>
    confirm
      .run({
        tier: summary.strong ? "strong" : "confirm",
        title: `Add ${summary.count} thing${summary.count === 1 ? "" : "s"} to ${clubName}?`,
        description: (
          <span className="setup-confirm-list">
            {summary.lines.map((line) => (
              <span key={line.id}>{line.text}</span>
            ))}
          </span>
        ),
        scope: summary.strong
          ? `${summary.count} item${summary.count === 1 ? "" : "s"} in ${summary.groups.map((g) => reviewGroupLabels[g].toLowerCase()).join(", ")}`
          : undefined,
        consequence: summary.strong
          ? "Offerings and policies are saved as private drafts: nothing goes on sale, no live price changes, and nobody is invited or told."
          : undefined,
        affected: summary.strong
          ? undefined
          : "Nothing is published and nobody is invited or told.",
        verb: `Add ${summary.count} to my club`,
        cancelLabel: "Keep reviewing",
        agentConfirm: `Applies ${summary.count} kept setup proposals as drafts to the club`,
        perform: async ({ idempotencyKey }) =>
          unwrap(await applyAction({ runId: run.id, idempotencyKey })),
        success: (result) =>
          `${result.applied} thing${result.applied === 1 ? "" : "s"} added to ${clubName}.`,
        errorMessage: "Nothing was added. Try again; it is safe to repeat.",
        report,
      })
      .then((outcome) => {
        if (outcome.status !== "done") return;
        const before = new Set(summary.lines.map((line) => line.id));
        setProposals(outcome.result.proposals);
        setApplied(
          outcome.result.proposals.filter(
            (p) => p.decision === "applied" && before.has(p.id),
          ),
        );
        setRun((current) => ({ ...current, status: "applied" }));
        router.refresh();
      });

  if (isRunActive(run)) {
    return (
      <RunWatcher
        initial={run}
        onSettled={(settled) => {
          setRun(settled);
          if (settled.status === "review" || settled.status === "applied") {
            void loadProposals(settled.id);
          }
        }}
      />
    );
  }

  if (run.status === "failed" || run.status === "cancelled") {
    return <RunOutcome reader={reader} run={run} />;
  }

  if (!proposals) {
    return loadFailure ? (
      <ErrorState
        message="Your read is safe. Try again to load what Duna found."
        onRetry={() => loadProposals(run.id)}
        reference={loadFailure.reference}
        title="Couldn't load what Duna found"
      />
    ) : (
      <div className="setup-run__head" role="status">
        <RallyLoader label="Loading what Duna found" size="md" />
      </div>
    );
  }

  const pending = groups.reduce((total, group) => total + group.pending, 0);
  const copy = runCopy(
    run.status === "applied" && pending > 0
      ? { ...run, status: "review" }
      : run,
  );

  return (
    <div className="setup-review">
      {confirm.dialog}
      <div className="setup-review__main">
        <Notice
          className="setup-review__intro"
          title={copy.title}
          tone={copy.tone === "warning" ? "warning" : "info"}
        >
          {run.outcome === "found-very-little"
            ? copy.body
            : `${pending} waiting for you. Stated means the words are on your site; inferred means Duna read between the lines, so check those. ${copy.body}`}
          {run.outcome === "found-very-little" ? (
            <>
              {" "}
              <Link
                className="setup-link"
                href={`${hqHref("setupStart")}?path=hand`}
              >
                Fill in the rest by hand
              </Link>
            </>
          ) : null}
        </Notice>

        {applied ? (
          <Rise className="setup-result" from="top" role="status">
            <h2 className="setup-result__title">
              <Icon name="success" size="control" />
              {applied.length} thing{applied.length === 1 ? "" : "s"} added to{" "}
              {clubName}
            </h2>
            <ul className="setup-result__list">
              {applied.map((proposal, index) => {
                const link = appliedEntityLink(proposal.appliedEntity);
                return (
                  <li
                    className={riseClassName({ short: true })}
                    key={proposal.id}
                    style={rallyStyle(index)}
                  >
                    <span>{applyLine(proposal)}</span>
                    {link ? (
                      <Link className="setup-link" href={link.href}>
                        {link.label}
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className="setup-quiet">
              Offerings and policies are private drafts. Nothing was published
              and nobody was invited.
            </p>
            <Button
              href={`${hqHref("setup")}?welcome=applied`}
              variant="primary"
            >
              See what&apos;s next
            </Button>
          </Rise>
        ) : null}

        {groups.length === 0 ? (
          <Notice title="Nothing new on your website" tone="info">
            Everything Duna found already matches your club.
          </Notice>
        ) : null}

        {groups.map((group) => (
          <section
            aria-labelledby={`group-${group.key}`}
            className="setup-group"
            key={group.key}
          >
            <header className="setup-group__head">
              <h2 className="setup-group__title" id={`group-${group.key}`}>
                {group.label}
              </h2>
              <span className="setup-group__count td-num">
                {groupCountText(group)}
              </span>
              {group.pending > 0 ? (
                <Button
                  loading={bulkBusy === group.key}
                  onClick={() => keepAll(group.key)}
                  size="sm"
                  variant="ghost"
                >
                  Keep all in this group
                </Button>
              ) : null}
            </header>
            <div className="setup-group__cards">
              {group.proposals.map((proposal, index) => (
                <FactCard
                  brand={group.key === "identity" ? previewBrand : undefined}
                  clubName={clubName}
                  currency={currency}
                  held={held[proposal.id]}
                  index={index}
                  key={proposal.id}
                  onDecide={onDecide}
                  proposal={proposal}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <aside aria-labelledby="apply-title" className="setup-apply">
        <h2 className="setup-apply__title" id="apply-title">
          What Apply will do
        </h2>
        {summary.count === 0 ? (
          <p className="setup-quiet">
            Nothing yet. Keep or edit the things you want in your club; skipped
            ones are left out.
          </p>
        ) : (
          <ul className="setup-apply__list">
            {summary.groups.map((group) => (
              <li key={group}>
                <span className="setup-apply__group">
                  {reviewGroupLabels[group]}
                </span>
                <ul>
                  {summary.lines
                    .filter((line) => line.group === group)
                    .map((line) => (
                      <li key={line.id}>{line.text}</li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        <p className="setup-apply__rules">
          <Icon name="verified" size="inline" />
          Drafts only. Nothing is published, nobody is invited, no live price
          changes.
        </p>
        <Button
          disabled={summary.count === 0 || confirm.open}
          onClick={() => void apply()}
          variant="primary"
        >
          {summary.count === 0 ? "Apply" : `Apply ${summary.count}`}
        </Button>
        {summary.strong ? (
          <Chip kind="status" tone="attention">
            Includes prices or policies
          </Chip>
        ) : null}
        <p className="setup-quiet">
          From{" "}
          {run.sourceKind === "description"
            ? "your description"
            : siteName(run.sourceUrl)}
        </p>
      </aside>
    </div>
  );
}
