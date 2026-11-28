"use client";

import type { SetupRun } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { Button, Icon, Rise } from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { startReadAction } from "./actions";
import { runCopy, runNextLabels } from "./setup-model";
import { WebsiteForm } from "./website-form";

/**
 * Where a read ended when it did not end in review: every failure reason
 * and a stopped read, each in plain words with a way forward (try again,
 * try another address, continue by hand).
 */
export function RunOutcome({
  run,
  reader,
  onStarted,
}: {
  readonly run: SetupRun;
  readonly reader: "ready" | "not-configured";
  /** A new read started from here; without it the page moves to the review. */
  readonly onStarted?: (run: SetupRun) => void;
}) {
  const router = useRouter();
  const copy = runCopy(run);
  const [another, setAnother] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const started = (next: SetupRun) => {
    if (onStarted) onStarted(next);
    else router.push(`${hqHref("setupReview")}?run=${next.id}`);
  };

  const again = async () => {
    if (busy || !run.sourceUrl) return;
    setBusy(true);
    setError(undefined);
    const result = await startReadAction({
      sourceKind: "website",
      url: run.sourceUrl,
    });
    setBusy(false);
    if (result.ok) started(result.data);
    else setError(result.message);
  };

  return (
    <Rise className="setup-outcome" from="bottom" role="status">
      <div className="setup-outcome__head">
        <Icon
          name={copy.tone === "warning" ? "alert" : "info"}
          size="control"
        />
        <div>
          <h2 className="setup-outcome__title">{copy.title}</h2>
          <p className="setup-outcome__body">{copy.body}</p>
          {run.sourceUrl ? (
            <p className="setup-quiet">Address: {run.sourceUrl}</p>
          ) : null}
        </div>
      </div>
      {another ? (
        <WebsiteForm
          autoFocus
          initial=""
          onStarted={started}
          reader={reader}
          submitLabel="Read this address"
        />
      ) : null}
      {error ? (
        <p className="setup-editor__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="setup-outcome__actions">
        {copy.next.map((step, index) => {
          const variant = index === 0 ? "primary" : "secondary";
          switch (step) {
            case "try-again":
              return run.sourceUrl && reader === "ready" ? (
                <Button
                  key={step}
                  loading={busy}
                  onClick={again}
                  variant={variant}
                >
                  {runNextLabels[step]}
                </Button>
              ) : null;
            case "try-another-address":
              return reader === "ready" && !another ? (
                <Button
                  key={step}
                  onClick={() => setAnother(true)}
                  variant={variant}
                >
                  {runNextLabels[step]}
                </Button>
              ) : null;
            case "by-hand":
              return (
                <Button
                  href={`${hqHref("setupStart")}?path=hand`}
                  key={step}
                  variant={variant}
                >
                  {runNextLabels[step]}
                </Button>
              );
            case "setup-home":
              return (
                <Button href={hqHref("setup")} key={step} variant={variant}>
                  {runNextLabels[step]}
                </Button>
              );
            case "review":
              return (
                <Button
                  href={`${hqHref("setupReview")}?run=${run.id}`}
                  key={step}
                  variant={variant}
                >
                  {runNextLabels[step]}
                </Button>
              );
            default:
              return null;
          }
        })}
      </div>
    </Rise>
  );
}
