"use client";

import { Button, ProposalCard } from "@duna/ui/tideline";
import { useState } from "react";

type Answer = "proposed" | "applied" | "dismissed";

const outcome: Record<Exclude<Answer, "proposed">, string> = {
  applied:
    "Approved in this example. A real approval tells the 8 players booked.",
  dismissed: "Kept as is. Nothing changed.",
};

/**
 * An Ask Duna proposal: the kit's ProposalCard with its before and after.
 * Approve and Not now answer in place; this is an example, so nothing is
 * sent anywhere. Static: no motion beyond the kit's own.
 */
export function ConceptAskDuna({ className }: { readonly className?: string }) {
  const [answer, setAnswer] = useState<Answer>("proposed");
  return (
    <div
      className={
        className
          ? `td site-glass site-concept-ask ${className}`
          : "td site-glass site-concept-ask"
      }
      data-theme="dark"
    >
      <div className="site-glass__head">
        <span className="site-label">Ask Duna suggests</span>
        <span className="site-example">Example</span>
      </div>
      <ProposalCard
        actions={
          <>
            <Button
              onClick={() => setAnswer("applied")}
              size="sm"
              variant="primary"
            >
              Approve
            </Button>
            <Button
              onClick={() => setAnswer("dismissed")}
              size="sm"
              variant="ghost"
            >
              Not now
            </Button>
          </>
        }
        affected="Tells the 8 players booked. Nothing changes until you approve."
        changes={[
          { label: "Court", before: "Court 1", after: "Court 4 (sheltered)" },
          { label: "Time", before: "5:30 PM", after: "5:30 PM" },
        ]}
        reason="Wind reaches 16 mph on Court 1 at 5 PM Thursday."
        status={answer}
        title="Move Thursday's clinic to Court 4"
      />
      {answer === "proposed" ? null : (
        <p className="site-meta site-concept-ask__outcome" role="status">
          {outcome[answer]}
        </p>
      )}
    </div>
  );
}
