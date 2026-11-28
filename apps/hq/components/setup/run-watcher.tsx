"use client";

import type { SetupRun } from "@duna/api";
import {
  Button,
  Chip,
  ErrorState,
  Icon,
  Progress,
  RallyLoader,
  riseClassName,
  useConfirm,
  useOnline,
} from "@duna/ui/tideline";
import { report } from "@duna/observability";
import { useEffect, useRef, useState } from "react";
import { cancelRunAction, pollRunAction } from "./actions";
import {
  isRunActive,
  pageName,
  pagePath,
  pageStatusLabels,
  runCopy,
} from "./setup-model";
import { unwrap } from "./setup-result";

/** How often a read that is still going is asked for its progress. */
export const RUN_POLL_MS = 1_500;

const pageTone = {
  read: "positive",
  reading: "info",
  queued: undefined,
  failed: "warning",
  skipped: undefined,
} as const;

/**
 * A read in progress, honestly: which pages are being read, by name, and
 * what each found. It asks for progress every 1.5 s while the read is
 * going (asking also resumes a read that stalled), pauses offline, and
 * hands the settled run back. Leaving the page is safe: coming back
 * continues from the same run.
 */
export function RunWatcher({
  initial,
  onSettled,
}: {
  readonly initial: SetupRun;
  readonly onSettled: (run: SetupRun) => void;
}) {
  const [run, setRun] = useState(initial);
  const [failure, setFailure] = useState<{ reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const online = useOnline();
  const confirm = useConfirm();
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  });

  useEffect(() => {
    if (!isRunActive(run)) {
      settled.current(run);
      return;
    }
    if (!online || failure) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await pollRunAction(run.id);
      if (cancelled) return;
      if (result.ok) setRun(result.data);
      else setFailure({ reference: result.reference });
    }, RUN_POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [run, online, failure, attempt]);

  const copy = runCopy(run);
  const total = Math.max(run.pagesTotal, run.pages.length, 1);
  const stop = () =>
    confirm
      .run({
        tier: "confirm",
        destructive: true,
        title: "Stop reading your website?",
        description: "Duna stops now and nothing it found so far is kept.",
        verb: "Stop the read",
        cancelLabel: "Keep reading",
        agentConfirm: "Stops the website read and discards what it found",
        perform: async () => unwrap(await cancelRunAction(run.id)),
        success: "Read stopped. Nothing it found was kept.",
        report,
      })
      .then((outcome) => {
        if (outcome.status === "done") setRun(outcome.result);
      });

  return (
    <section
      aria-labelledby="run-title"
      aria-live="polite"
      className="setup-run"
    >
      {confirm.dialog}
      <div className="setup-run__head">
        <RallyLoader size="md" />
        <div>
          <h2 className="setup-run__title" id="run-title">
            {copy.title}
          </h2>
          <p className="setup-run__body">{copy.body}</p>
        </div>
      </div>
      {run.sourceKind === "website" ? (
        <Progress
          label="Pages read"
          max={total}
          showValue
          value={run.pagesRead}
        />
      ) : null}
      {!online ? (
        <p className="setup-quiet">
          You&apos;re offline. The read carries on; progress shows again when
          you&apos;re back.
        </p>
      ) : null}
      {failure ? (
        <ErrorState
          compact
          message="Duna could not check on the read just now. It is still going; try again."
          onRetry={() => {
            setFailure(null);
            setAttempt((n) => n + 1);
          }}
          reference={failure.reference}
          title="Couldn't load the progress"
        />
      ) : null}
      {run.pages.length > 0 ? (
        <ol className="setup-pages" aria-label="Pages">
          {run.pages.map((page) => (
            <li
              className={`setup-page ${riseClassName({ short: true })}`}
              data-status={page.status}
              key={page.id}
            >
              <Icon
                name={
                  page.status === "read"
                    ? "success"
                    : page.status === "failed"
                      ? "alert"
                      : page.status === "reading"
                        ? "find"
                        : "minus"
                }
                size="inline"
              />
              <span className="setup-page__name">
                {page.title && page.title !== "Home"
                  ? page.title
                  : pageName(pagePath(page.url))}
                <span className="setup-page__path">{pagePath(page.url)}</span>
              </span>
              <Chip kind="status" tone={pageTone[page.status]}>
                {page.status === "read" && page.itemsFound > 0
                  ? `${page.itemsFound} found`
                  : pageStatusLabels[page.status]}
              </Chip>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="setup-run__actions">
        <Button onClick={stop} variant="secondary">
          Stop reading
        </Button>
      </div>
    </section>
  );
}
