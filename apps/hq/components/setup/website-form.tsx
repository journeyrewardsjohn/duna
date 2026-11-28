"use client";

import type { SetupRun } from "@duna/api";
import { Button, Field, Input, useAction } from "@duna/ui/tideline";
import { report } from "@duna/observability";
import { useState } from "react";
import { startReadAction } from "./actions";
import { normaliseWebsiteInput } from "./setup-model";
import { unwrap } from "./setup-result";

/**
 * "Your club's website": the address, checked as it is typed, then the read
 * starts (single flight: a double press starts one read). Without the
 * website reader it says so and offers nothing it cannot do.
 */
export function WebsiteForm({
  initial,
  reader,
  onStarted,
  submitLabel = "Read my website",
  reread = false,
  autoFocus = false,
}: {
  readonly initial: string;
  readonly reader: "ready" | "not-configured";
  readonly onStarted: (run: SetupRun) => void;
  readonly submitLabel?: string;
  readonly reread?: boolean;
  readonly autoFocus?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [problem, setProblem] = useState<string>();
  const start = useAction(
    async (_context, url: string) =>
      unwrap(await startReadAction({ sourceKind: "website", url, reread })),
    {
      onSuccess: (run) => onStarted(run),
      onError: (error) =>
        setProblem(
          (error as { userMessage?: string }).userMessage ??
            "Duna couldn't start reading. Try again.",
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
        const url = normaliseWebsiteInput(value);
        if (!url) {
          setProblem("Write your website's address, like yourclub.com.");
          return;
        }
        setProblem(undefined);
        void start.run(url);
      }}
    >
      <Field
        error={problem}
        hint="Duna reads your home page and up to seven more. Nothing is added until you keep it."
        label="Your club's website"
      >
        <Input
          autoComplete="url"
          autoFocus={autoFocus}
          disabled={reader === "not-configured"}
          inputMode="url"
          name="website"
          onChange={(event) => {
            setValue(event.currentTarget.value);
            if (problem) setProblem(undefined);
          }}
          placeholder="yourclub.com"
          value={value}
        />
      </Field>
      <Button
        disabled={reader === "not-configured"}
        loading={start.pending}
        type="submit"
        variant="primary"
      >
        {submitLabel}
      </Button>
    </form>
  );
}
