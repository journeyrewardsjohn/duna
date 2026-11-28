"use client";

import { Button, Notice, useAction } from "@duna/ui/tideline";
import { useState } from "react";
import { startOnboardingAction } from "@/app/(next)/(hq)/money/actions";
import { unwrap } from "./money-action-result";

/**
 * Opens identity verification. The backend returns a hosted link (opened
 * at once, it expires in minutes) or says it is not configured / not
 * enabled; HQ asks for the hosted flow, which needs no extra script on the
 * page. Single flight: a double click opens one session.
 */
export function StartVerificationButton({ label }: { readonly label: string }) {
  const [answer, setAnswer] = useState<"not-configured" | "not-enabled" | null>(
    null,
  );
  const start = useAction(
    async () => {
      const session = unwrap(await startOnboardingAction());
      if (session.state === "hosted") {
        window.location.assign(session.url);
        return session;
      }
      if (session.state === "embedded") {
        // HQ requests the hosted flow; an embedded answer means the server
        // chose it, so fall back to asking again later rather than guessing.
        setAnswer("not-enabled");
        return session;
      }
      setAnswer(session.state);
      return session;
    },
    { messages: { error: "Verification didn't open. Nothing was changed." } },
  );
  return (
    <div className="money-verify-start">
      <Button {...start.buttonProps} variant="primary">
        {label}
      </Button>
      {answer === "not-configured" ? (
        <Notice role="status" title="Not switched on here yet" tone="info">
          Duna Pay isn't connected in this environment yet, so verification
          can't open. Nothing was changed.
        </Notice>
      ) : answer === "not-enabled" ? (
        <Notice
          role="status"
          title="Verification isn't available right now"
          tone="info"
        >
          Duna Pay verification isn't turned on for your club yet. Contact Duna
          support.
        </Notice>
      ) : null}
    </div>
  );
}
