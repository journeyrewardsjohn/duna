"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { openDunaAi } from "./duna-action-center";

/** A shared entry to the existing governed assistant, with a full manual fallback. */
export function HqCreationFlow({
  title,
  noun,
  backHref,
  backLabel,
  examples,
  initialManual = false,
  children,
}: {
  readonly title: string;
  readonly noun: string;
  readonly backHref: string;
  readonly backLabel: string;
  readonly examples: readonly string[];
  readonly initialManual?: boolean;
  readonly children: ReactNode;
}) {
  const [manual, setManual] = useState(initialManual);
  const [brief, setBrief] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const manualRoot = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const hintId = useId();

  useEffect(() => {
    if (!manual || initialManual) return;
    const heading = manualRoot.current?.querySelector("h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus();
    }
  }, [manual, initialManual]);

  if (manual) return <div ref={manualRoot}>{children}</div>;

  return (
    <main className="hq-creation" aria-labelledby={titleId}>
      <header className="hq-creation__header">
        <a href={backHref}>← {backLabel}</a>
        <h1 id={titleId}>{title}</h1>
      </header>
      <section className="hq-creation__start" aria-label={`Create ${noun}`}>
        <div>
          <h2>Describe your {noun}</h2>
          <p>Duna can help prepare it using your club’s setup.</p>
        </div>
        <form
          className="hq-creation__composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (!brief.trim()) return;
            openDunaAi(
              `Help me create a ${noun} for this organization. Use the configured offerings, staff and venues where relevant. Ask for missing details and prepare a draft for my review. Do not publish, charge or message anyone without my explicit approval. My brief: ${brief.trim()}`,
            );
          }}
        >
          <label htmlFor={`${titleId}-brief`}>
            What would you like to create?
          </label>
          <textarea
            id={`${titleId}-brief`}
            ref={input}
            aria-describedby={hintId}
            placeholder={`Describe your ${noun}, including any dates, prices or requirements…`}
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            maxLength={4000}
            rows={5}
          />
          <div className="hq-creation__submit">
            <span id={hintId}>Review changes before they’re applied.</span>
            <button type="submit" disabled={!brief.trim()}>
              Continue with Duna
            </button>
          </div>
        </form>
        <div className="hq-creation__examples" aria-label="Example briefs">
          <span>Try an example</span>
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setBrief(example);
                input.current?.focus();
              }}
            >
              {example}
            </button>
          ))}
        </div>
        <div className="hq-creation__manual">
          <span>Prefer to fill in the details?</span>
          <button type="button" onClick={() => setManual(true)}>
            Create manually →
          </button>
        </div>
      </section>
    </main>
  );
}
