"use client";

import type { SetupRun } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import {
  Button,
  Field,
  Icon,
  Notice,
  PaneTransition,
  Rise,
  Textarea,
  useAction,
} from "@duna/ui/tideline";
import { report } from "@duna/observability";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { startReadAction } from "./actions";
import { HandForm, type HandFacts } from "./hand-form";
import { RunOutcome } from "./run-outcome";
import { RunWatcher } from "./run-watcher";
import { isRunActive, runCopy } from "./setup-model";
import { unwrap } from "./setup-result";
import { WebsiteForm } from "./website-form";

export type FirstRunPath =
  "ask" | "website" | "no-website" | "describe" | "hand";

type View =
  | { readonly kind: "ask"; readonly path: FirstRunPath }
  | { readonly kind: "run"; readonly run: SetupRun }
  | { readonly kind: "hand" };

function DescribeForm({
  onStarted,
}: {
  readonly onStarted: (run: SetupRun) => void;
}) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string>();
  const start = useAction(
    async () =>
      unwrap(
        await startReadAction({ sourceKind: "description", text: text.trim() }),
      ),
    {
      onSuccess: onStarted,
      onError: (error) =>
        setProblem(
          (error as { userMessage?: string }).userMessage ??
            "Duna couldn't start. Try again.",
        ),
      report,
    },
  );
  return (
    <form
      className="setup-website"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim().length < 10) {
          setProblem(
            "A sentence or two is enough: where you play, what you run, who it's for.",
          );
          return;
        }
        void start.run();
      }}
    >
      <Field
        error={problem}
        hint="Where you play, what you run, prices if you have them. Duna proposes; you keep or skip."
        label="Tell Duna about your club"
      >
        <Textarea
          maxLength={8000}
          onChange={(event) => {
            setText(event.currentTarget.value);
            if (problem) setProblem(undefined);
          }}
          placeholder="We run beach volleyball on 6 courts at…"
          rows={5}
          value={text}
        />
      </Field>
      <Button loading={start.pending} type="submit" variant="primary">
        Propose my club
      </Button>
    </form>
  );
}

/**
 * The first run (CS-Start): one question first, "Do you have a website?".
 * With one, the read starts and the person watches it honestly, page by
 * page, with a way to stop; what it found opens in the review. Without
 * one, Duna can propose from a description, or the person fills the same
 * facts in by hand. Leaving and coming back continues the same read.
 */
export function FirstRunFlow({
  clubName,
  reader,
  describe,
  initialRun,
  initialPath,
  defaultWebsite,
  autoStartUrl,
  handInitial,
}: {
  readonly clubName: string;
  readonly reader: "ready" | "not-configured";
  readonly describe: "ready" | "not-configured";
  /** The latest read, to resume it. */
  readonly initialRun: SetupRun | null;
  readonly initialPath: FirstRunPath;
  readonly defaultWebsite: string;
  /** The address given when the club was created: the read starts on arrival. */
  readonly autoStartUrl?: string;
  readonly handInitial: HandFacts;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(() => {
    if (initialPath === "hand") return { kind: "hand" };
    if (initialRun && isRunActive(initialRun))
      return { kind: "run", run: initialRun };
    return {
      kind: "ask",
      path:
        initialPath === "ask"
          ? reader === "ready"
            ? "ask"
            : "no-website"
          : initialPath,
    };
  });
  const [autoError, setAutoError] = useState<string>();
  const autoStarted = useRef(false);

  useEffect(() => {
    if (!autoStartUrl || autoStarted.current || reader !== "ready") return;
    if (initialRun && isRunActive(initialRun)) return;
    autoStarted.current = true;
    void startReadAction({ sourceKind: "website", url: autoStartUrl }).then(
      (result) => {
        if (result.ok) setView({ kind: "run", run: result.data });
        else setAutoError(result.message);
      },
    );
  }, [autoStartUrl, initialRun, reader]);

  const started = (run: SetupRun) => setView({ kind: "run", run });

  const pendingReview =
    initialRun && initialRun.status === "review" && view.kind === "ask"
      ? initialRun
      : null;

  return (
    <div className="setup-first">
      {pendingReview ? (
        <Notice
          action={
            <Button
              href={`${hqHref("setupReview")}?run=${pendingReview.id}`}
              size="sm"
              variant="secondary"
            >
              Continue reviewing
            </Button>
          }
          title={runCopy(pendingReview).title}
          tone="info"
        >
          Pick up where you left off, or start a new read below.
        </Notice>
      ) : null}
      {autoError ? (
        <Notice title="Duna couldn't start reading your website" tone="warning">
          {autoError}
        </Notice>
      ) : null}

      <PaneTransition
        transitionKey={view.kind === "ask" ? `ask-${view.path}` : view.kind}
      >
        {view.kind === "run" ? (
          view.run.status === "review" || view.run.status === "applied" ? (
            <Rise className="setup-found" from="bottom" role="status">
              <Icon name="success" size="control" />
              <h2 className="setup-found__title">{runCopy(view.run).title}</h2>
              <p>{runCopy(view.run).body}</p>
              <Button
                onClick={() =>
                  router.push(`${hqHref("setupReview")}?run=${view.run.id}`)
                }
                variant="primary"
              >
                Review what Duna found
              </Button>
            </Rise>
          ) : isRunActive(view.run) ? (
            <RunWatcher
              initial={view.run}
              onSettled={(run) => setView({ kind: "run", run })}
            />
          ) : (
            <RunOutcome onStarted={started} reader={reader} run={view.run} />
          )
        ) : view.kind === "hand" ? (
          <div>
            <HandForm initial={handInitial} />
            <p className="setup-quiet setup-first__switch">
              {reader === "ready" ? (
                <Button
                  onClick={() => setView({ kind: "ask", path: "website" })}
                  size="sm"
                  variant="ghost"
                >
                  I have a website after all
                </Button>
              ) : null}
            </p>
          </div>
        ) : (
          <section aria-labelledby="first-question" className="setup-ask">
            <h2 className="setup-ask__question" id="first-question">
              Do you have a website?
            </h2>
            <p className="setup-quiet">
              Duna reads it and proposes what it finds about {clubName}: places,
              hours, prices and people. You decide what goes in.
            </p>
            {reader === "not-configured" ? (
              <Notice
                title="Duna's website reader isn't set up here yet"
                tone="info"
              >
                Everything can still be filled in by hand, and nothing is lost:
                you can have Duna read your website later.
              </Notice>
            ) : null}
            <div
              className="setup-ask__choices"
              role="group"
              aria-label="Do you have a website?"
            >
              <Button
                aria-pressed={view.path === "website" || view.path === "ask"}
                disabled={reader === "not-configured"}
                onClick={() => setView({ kind: "ask", path: "website" })}
                variant={view.path === "website" ? "primary" : "secondary"}
              >
                Yes, read it
              </Button>
              <Button
                aria-pressed={
                  view.path === "no-website" || view.path === "describe"
                }
                onClick={() => setView({ kind: "ask", path: "no-website" })}
                variant={
                  view.path === "no-website" || view.path === "describe"
                    ? "primary"
                    : "secondary"
                }
              >
                No website
              </Button>
            </div>
            {view.path === "website" || view.path === "ask" ? (
              <WebsiteForm
                autoFocus={view.path === "website"}
                initial={defaultWebsite}
                onStarted={started}
                reader={reader}
              />
            ) : null}
            {view.path === "no-website" ? (
              <div className="setup-ask__paths">
                {describe === "ready" ? (
                  <button
                    className="setup-path"
                    onClick={() => setView({ kind: "ask", path: "describe" })}
                    type="button"
                  >
                    <Icon name="find" size="control" />
                    <span>
                      <strong>Tell Duna about your club</strong>
                      <span>
                        A few sentences; Duna proposes the rest for you to
                        check.
                      </span>
                    </span>
                  </button>
                ) : null}
                <button
                  className="setup-path"
                  onClick={() => setView({ kind: "hand" })}
                  type="button"
                >
                  <Icon name="you" size="control" />
                  <span>
                    <strong>Fill it in step by step</strong>
                    <span>
                      Six short questions. Works without a website or
                      Duna&apos;s help.
                    </span>
                  </span>
                </button>
              </div>
            ) : null}
            {view.path === "describe" ? (
              <DescribeForm onStarted={started} />
            ) : null}
          </section>
        )}
      </PaneTransition>
    </div>
  );
}
