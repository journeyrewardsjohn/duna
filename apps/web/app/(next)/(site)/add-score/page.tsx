import "../pages.css";
import "./add-score.css";

import { ADD_SCORE_DRAFT_COOKIE, type AddScoreReadResult } from "@duna/api";
import { log } from "@duna/observability";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { siteOgImage } from "@/components/site/og";
import { getServerCaller, getServerContext } from "@/lib/api";
import { AddScoreFlow } from "./add-score-flow";

const title = "Add a score and see your Sand Rating";
const description =
  "Add a match and where you played, no account needed. See what the result would do for your Sand Rating, then save it to your name.";
const ogImage = siteOgImage({
  title: "Played somewhere? Add the court and your score.",
  eyebrow: "No account needed",
  concept: "rating",
});

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/add-score",
    types: { "text/markdown": "/add-score.md" },
  },
  openGraph: {
    title: `${title} · Duna`,
    description,
    url: "/add-score",
    siteName: "Duna",
    type: "website",
    images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} · Duna`,
    description,
    images: [ogImage],
  },
};

/** Reads the visitor's own draft: never cached, never shared. */
export const dynamic = "force-dynamic";

async function readDraft(): Promise<AddScoreReadResult> {
  const token = (await cookies()).get(ADD_SCORE_DRAFT_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return { state: "none" };
  try {
    const caller = await getServerCaller();
    return await caller.public.addScore.read({ token });
  } catch (error) {
    // Too many reads or a fault: start fresh; the next save says why.
    log.warn("site.addScore.read.unavailable", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return { state: "none" };
  }
}

export default async function AddScorePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly where?: string | string[] }>;
}) {
  const [{ where }, draft, context] = await Promise.all([
    searchParams,
    readDraft(),
    getServerContext(),
  ]);
  if (draft.state === "claimed" && draft.matchId) {
    redirect(`/app/matches/${draft.matchId}`);
  }
  const prefill =
    typeof where === "string" ? where.trim().slice(0, 80) : undefined;
  return (
    <main className="as-page" id="main" tabIndex={-1}>
      <section aria-labelledby="as-title" className="site-wrap as-hero">
        <p className="site-label">No account needed</p>
        <h1 className="site-display as-hero__title" id="as-title">
          Add a score. See where you start.
        </h1>
        <p className="site-lead as-hero__lead">
          Tell us where you played and how it went. See what the result would do
          for your Sand Rating, then save it to your name.
        </p>
      </section>
      <section aria-label="Add a score" className="site-wrap as-body">
        <AddScoreFlow
          arrivedExpired={draft.state === "expired"}
          initial={draft.state === "active" ? draft.draft : undefined}
          prefillWhere={prefill}
          signedIn={Boolean(context.actor)}
        />
      </section>
    </main>
  );
}
