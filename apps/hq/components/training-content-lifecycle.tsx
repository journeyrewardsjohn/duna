"use client";

import type { TrainingVersionHistoryEntry } from "@duna/api/training-contracts";
import {
  Archive,
  ArchiveRestore,
  Check,
  CircleAlert,
  History,
  RotateCcw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  archiveTrainingPracticePlanAction,
  archiveTrainingProgramAction,
  restoreTrainingPracticePlanArchiveAction,
  restoreTrainingPracticePlanVersionAction,
  restoreTrainingProgramArchiveAction,
  restoreTrainingProgramVersionAction,
} from "@/app/training/actions";

type ContentKind = "program" | "practice-plan";

function formatVersionDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date(value));
}

export function TrainingContentLifecycle({
  contentId,
  kind,
  status,
  timezone = "UTC",
  versions,
}: {
  readonly contentId: string;
  readonly kind: ContentKind;
  readonly status: string;
  readonly timezone?: string;
  readonly versions: readonly TrainingVersionHistoryEntry[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{
    readonly status: "success" | "error";
    readonly message: string;
  }>();
  const archived = status === "archived";
  const label = kind === "program" ? "program" : "practice plan";

  const run = (
    task: () => Promise<{
      readonly status: "success" | "error";
      readonly message: string;
    }>,
  ) => {
    setNotice(undefined);
    startTransition(async () => {
      const result = await task();
      setNotice(result);
      if (result.status === "success") router.refresh();
    });
  };

  const archive = () => {
    if (
      !window.confirm(
        `Archive this ${label}? It will leave active coaching views, but its history stays recoverable.`,
      )
    ) {
      return;
    }
    run(() =>
      kind === "program"
        ? archiveTrainingProgramAction(contentId)
        : archiveTrainingPracticePlanAction(contentId),
    );
  };

  const restoreArchive = () => {
    run(() =>
      kind === "program"
        ? restoreTrainingProgramArchiveAction(contentId)
        : restoreTrainingPracticePlanArchiveAction(contentId),
    );
  };

  const restoreVersion = (version: TrainingVersionHistoryEntry) => {
    if (
      !window.confirm(
        `Restore version ${version.version}? Duna will make it a new current version so the existing history remains intact.`,
      )
    ) {
      return;
    }
    run(() =>
      kind === "program"
        ? restoreTrainingProgramVersionAction({
            programId: contentId,
            versionId: version.id,
          })
        : restoreTrainingPracticePlanVersionAction({
            practicePlanId: contentId,
            versionId: version.id,
          }),
    );
  };

  return (
    <section className="training-lifecycle">
      <header>
        <div>
          <span className="hq-eyebrow">
            <History aria-hidden size={14} /> Restore points
          </span>
          <h3>{archived ? "Archived, not gone." : "Safe revisions."}</h3>
          <p>
            Duna keeps the five newest recoverable versions. Restoring one
            creates a fresh current version instead of overwriting history.
          </p>
        </div>
        {archived ? (
          <button
            className="hq-button hq-button--primary"
            disabled={pending}
            onClick={restoreArchive}
            type="button"
          >
            <ArchiveRestore aria-hidden size={16} /> Restore to draft
          </button>
        ) : (
          <button
            className="hq-button hq-button--secondary"
            disabled={pending}
            onClick={archive}
            type="button"
          >
            <Archive aria-hidden size={16} /> Archive {label}
          </button>
        )}
      </header>
      <div className="training-lifecycle__history">
        {versions.length ? (
          versions.map((version) => (
            <article key={version.id}>
              <div>
                <strong>Version {version.version}</strong>
                {version.current && <span>Current</span>}
                <small>
                  {formatVersionDate(version.createdAt, timezone)}
                  {version.changeNote ? ` · ${version.changeNote}` : ""}
                </small>
              </div>
              <button
                aria-label={`Restore version ${version.version}`}
                className="hq-button hq-button--secondary"
                disabled={pending || version.current}
                onClick={() => restoreVersion(version)}
                type="button"
              >
                <RotateCcw aria-hidden size={15} /> Restore
              </button>
            </article>
          ))
        ) : (
          <p className="training-lifecycle__empty">
            The next coaching change will create the first restore point.
          </p>
        )}
      </div>
      {notice && (
        <p
          className={`training-lifecycle__notice training-lifecycle__notice--${notice.status}`}
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
    </section>
  );
}
