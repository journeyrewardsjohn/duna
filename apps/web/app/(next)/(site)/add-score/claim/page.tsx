import "../../pages.css";
import "../add-score.css";

import { ADD_SCORE_DRAFT_COOKIE, type AddScoreReadResult } from "@duna/api";
import { log } from "@duna/observability";
import { Button } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerCaller, getServerContext } from "@/lib/api";
import { ClaimForm } from "./claim-form";

export const metadata: Metadata = {
  title: "Save your score",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const returnTo = encodeURIComponent("/add-score/claim");

async function readDraft(): Promise<AddScoreReadResult> {
  const token = (await cookies()).get(ADD_SCORE_DRAFT_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return { state: "none" };
  try {
    const caller = await getServerCaller();
    return await caller.public.addScore.read({ token });
  } catch (error) {
    log.warn("site.addScore.claimRead.unavailable", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return { state: "none" };
  }
}

/**
 * After sign-up or sign-in: complete the names, add contacts for the confirm
 * links if you have them, and save. Lands on the match in the app.
 */
export default async function ClaimPage() {
  const context = await getServerContext();
  if (!context.actor) redirect(`/sign-in?returnTo=${returnTo}`);
  const draft = await readDraft();
  if (draft.state === "claimed" && draft.matchId) {
    redirect(`/app/matches/${draft.matchId}`);
  }
  return (
    <main className="as-page" id="main" tabIndex={-1}>
      <section aria-labelledby="as-claim-title" className="site-wrap as-hero">
        <p className="site-label">Last step</p>
        <h1 className="site-display as-hero__title" id="as-claim-title">
          Save your score.
        </h1>
      </section>
      <section className="site-wrap as-body as-body--narrow">
        {draft.state === "active" && draft.draft.completed.length === 3 ? (
          <ClaimForm
            draft={draft.draft}
            under13={context.actor?.ageBand === "under-13"}
          />
        ) : (
          <div className="as-panel">
            <h2 className="as-panel__title">
              {draft.state === "expired"
                ? "That score was deleted after 7 days."
                : draft.state === "active"
                  ? "That score isn’t finished yet."
                  : "We couldn’t find a score from this browser."}
            </h2>
            <p className="as-hint">
              Scores you add without an account stay in the browser you used for
              7 days. Add it again here: it takes a minute.
            </p>
            <div className="as-actions as-actions--start">
              <Button href="/add-score" variant="primary">
                {draft.state === "active" ? "Finish the score" : "Add a score"}
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
