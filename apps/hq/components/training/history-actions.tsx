"use client";

import { Button, Chip, useConfirm } from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import {
  archivePlanAction,
  archiveProgramAction,
  restorePlanArchiveAction,
  restorePlanVersionAction,
  restoreProgramArchiveAction,
  restoreProgramVersionAction,
} from "@/app/(next)/(hq)/training/actions";
import { unwrap } from "../money/money-action-result";
import { reportFailure } from "../team/team-report";

type Kind = "program" | "plan";

export interface VersionRow {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly createdAt: string;
  readonly current: boolean;
  readonly changeNote?: string;
}

const noun: Record<Kind, string> = {
  program: "program",
  plan: "practice plan",
};

function dateWords(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/**
 * Archive and restore, through the training service's own procedures (the
 * ones the old Training pages used). Archiving keeps everything; restoring
 * brings it back as a draft.
 */
export function ArchiveControls({
  kind,
  id,
  title,
  archived,
}: {
  readonly kind: Kind;
  readonly id: string;
  readonly title: string;
  readonly archived: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const run = () =>
    void confirm
      .run({
        tier: "confirm",
        destructive: !archived,
        title: archived ? `Restore ${title}?` : `Archive ${title}?`,
        description: archived
          ? `The ${noun[kind]} comes back as a draft you can edit again.`
          : `The ${noun[kind]} leaves the active list. Nothing is deleted, and you can restore it.`,
        verb: archived ? "Restore to draft" : `Archive the ${noun[kind]}`,
        cancelLabel: "Not now",
        agentConfirm: `${archived ? "Restores" : "Archives"} the ${noun[kind]} ${title}`,
        perform: async ({ idempotencyKey }) =>
          unwrap<{ id: string; status: string }>(
            kind === "program"
              ? archived
                ? await restoreProgramArchiveAction({
                    programId: id,
                    idempotencyKey,
                  })
                : await archiveProgramAction({ programId: id, idempotencyKey })
              : archived
                ? await restorePlanArchiveAction({
                    practicePlanId: id,
                    idempotencyKey,
                  })
                : await archivePlanAction({
                    practicePlanId: id,
                    idempotencyKey,
                  }),
          ),
        success: archived ? `${title} restored to draft` : `${title} archived`,
        report: reportFailure("hq.training.archive_failed"),
      })
      .then((outcome) => {
        if (outcome.status === "done") router.refresh();
      });
  return (
    <>
      <Button
        onClick={run}
        size="sm"
        variant={archived ? "secondary" : "ghost"}
      >
        {archived ? "Restore to draft" : `Archive the ${noun[kind]}`}
      </Button>
      {confirm.dialog}
    </>
  );
}

/** The newest saved versions; restoring one saves it again as the newest. */
export function VersionHistory({
  kind,
  id,
  versions,
  canRestore,
}: {
  readonly kind: Kind;
  readonly id: string;
  readonly versions: readonly VersionRow[];
  readonly canRestore: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  if (versions.length === 0) {
    return <p className="tr-quiet">No saved versions yet.</p>;
  }
  const restore = (row: VersionRow) =>
    void confirm
      .run({
        tier: "confirm",
        title: `Restore version ${row.version}?`,
        description: `It is saved again as the newest version of this ${noun[kind]}. Later versions stay in the history.`,
        affected:
          kind === "plan"
            ? "Practices keep the version they were given."
            : "Practices someone relied on are never moved or removed.",
        verb: `Restore version ${row.version}`,
        cancelLabel: "Not now",
        agentConfirm: `Restores version ${row.version} of the ${noun[kind]} ${row.title}`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            kind === "program"
              ? await restoreProgramVersionAction({
                  programId: id,
                  versionId: row.id,
                  idempotencyKey,
                })
              : await restorePlanVersionAction({
                  practicePlanId: id,
                  versionId: row.id,
                  idempotencyKey,
                }),
          ),
        success: `Version ${row.version} restored`,
        report: reportFailure("hq.training.restore_version_failed"),
      })
      .then((outcome) => {
        if (outcome.status === "done") router.refresh();
      });
  return (
    <>
      <ol aria-label="Saved versions" className="tr-rows">
        {[...versions]
          .sort((a, b) => b.version - a.version)
          .slice(0, 5)
          .map((row) => (
            <li className="tr-row" key={row.id}>
              <div className="tr-row__main">
                <span className="tr-row__name">{`Version ${row.version}`}</span>
                <span className="tr-quiet">
                  {[row.changeNote, dateWords(row.createdAt)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              {row.current ? (
                <Chip tone="positive">Current</Chip>
              ) : canRestore ? (
                <Button onClick={() => restore(row)} size="sm" variant="ghost">
                  {`Restore version ${row.version}`}
                </Button>
              ) : null}
            </li>
          ))}
      </ol>
      {confirm.dialog}
    </>
  );
}
