"use client";

import type { MatchJournalWorkspace } from "@duna/api";
import { Eye, Lock, Send, Share2, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  claimMatchNoteShareAction,
  createMatchJournalNoteAction,
  createMatchNoteShareAction,
  revokeMatchNoteShareAction,
} from "@/app/community-actions";

function JournalEntries({
  notes,
}: {
  readonly notes: MatchJournalWorkspace["notes"];
}) {
  return (
    <div className="match-journal__entries">
      {notes.map((note) => (
        <article key={note.id}>
          <header>
            <span>{note.source === "voice" ? "Voice note" : "Match note"}</span>
            <time dateTime={note.createdAt}>
              {new Intl.DateTimeFormat("en-US", {
                day: "numeric",
                month: "short",
              }).format(new Date(note.createdAt))}
            </time>
          </header>
          <p>{note.body}</p>
          {note.aiSummary ? (
            <section>
              <strong>
                <Sparkles aria-hidden size={14} /> Duna AI summary
              </strong>
              <p>{note.aiSummary}</p>
              {note.aiInsights?.playerInsights.map((insight, index) => (
                <dl
                  key={`${note.id}:${insight.personId ?? insight.name}:${index}`}
                >
                  <dt>{insight.name}</dt>
                  <dd>{insight.observation}</dd>
                </dl>
              ))}
              {note.aiInsights?.nextActions.length ? (
                <ol>
                  {note.aiInsights.nextActions.map((action, index) => (
                    <li key={`${note.id}:action:${index}`}>{action}</li>
                  ))}
                </ol>
              ) : null}
            </section>
          ) : (
            <small>
              {note.aiStatus === "pending"
                ? "Duna AI is organizing this reflection."
                : "Your note is saved. AI organization can be retried in the Duna app."}
            </small>
          )}
        </article>
      ))}
    </div>
  );
}

export function MatchJournalPanel({
  accessKnown,
  matchId,
  returnTo,
  shareToken,
  workspace,
}: {
  readonly accessKnown: boolean;
  readonly matchId: string;
  readonly returnTo: string;
  readonly shareToken?: string;
  readonly workspace?: MatchJournalWorkspace;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const shareJournal = () =>
    startTransition(async () => {
      const result = await createMatchNoteShareAction({ matchId, returnTo });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      const url = `${window.location.origin}${result.share.path}`;
      try {
        if (navigator.share) {
          await navigator.share({
            title: "Private Duna match notes",
            text: "I invited you to see my private notes from this match.",
            url,
          });
          setMessage(
            "Private invite shared. It can be accepted by one verified member.",
          );
        } else {
          await navigator.clipboard.writeText(url);
          setMessage(
            "Private invite copied. It can be accepted by one verified member.",
          );
        }
      } catch (error) {
        await revokeMatchNoteShareAction({
          matchId,
          returnTo,
          shareId: result.share.id,
        });
        setMessage(
          error instanceof DOMException && error.name === "AbortError"
            ? "Sharing canceled. No private access was granted."
            : "Sharing could not open. No private access was granted.",
        );
      } finally {
        router.refresh();
      }
    });

  return (
    <section className="match-journal">
      <header className="match-journal__header">
        <span>
          <Lock aria-hidden size={20} />
        </span>
        <div>
          <h2>Your match journal</h2>
          <p>
            Private learning notes. A host, club, opponent, and the public never
            inherit access.
          </p>
        </div>
      </header>

      {shareToken ? (
        <div className="match-journal__invite">
          <Eye aria-hidden size={20} />
          <div>
            <strong>A player shared private match notes with you.</strong>
            <p>
              The invite is bound to the first verified Duna member who accepts
              it and can be revoked by its owner.
            </p>
          </div>
          {accessKnown ? (
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await claimMatchNoteShareAction({
                    token: shareToken,
                  });
                  if (result.ok) {
                    setMessage("Private notes accepted.");
                    router.replace(`/matches/${result.result.matchId}`);
                    router.refresh();
                  } else {
                    setMessage(result.error);
                  }
                })
              }
              type="button"
            >
              {pending ? "Accepting…" : "Accept private notes"}
            </button>
          ) : (
            <Link href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
              Sign in to accept
            </Link>
          )}
        </div>
      ) : null}

      {workspace?.access.participant ? (
        workspace.access.canWriteNotes ? (
          <div className="match-journal__composer">
            <textarea
              maxLength={5000}
              onChange={(event) => setBody(event.target.value)}
              placeholder="What worked? What did you notice about their tendencies? What changes next time?"
              value={body}
            />
            <div>
              <small>
                {workspace.access.canUseAi
                  ? "Voice reflection and editable transcription are available in the Duna app."
                  : "Typed reflections remain private; AI voice tools require an adult account."}
              </small>
              <button
                disabled={pending || !body.trim()}
                onClick={() =>
                  startTransition(async () => {
                    const result = await createMatchJournalNoteAction({
                      matchId,
                      body: body.trim(),
                      idempotencyKey: crypto.randomUUID(),
                      returnTo,
                    });
                    if (result.ok) {
                      setBody("");
                      setMessage("Saved privately.");
                      router.refresh();
                    } else {
                      setMessage(result.error);
                    }
                  })
                }
                type="button"
              >
                <Send aria-hidden size={15} />{" "}
                {pending ? "Saving…" : "Save privately"}
              </button>
            </div>
          </div>
        ) : (
          <div className="match-journal__premium">
            <Star aria-hidden size={20} />
            <div>
              <strong>
                Build your private match memory with Player Premium.
              </strong>
              <p>
                Capture typed or spoken feedback and organize it into your play,
                partner coordination, opponent tendencies, and next actions.
              </p>
            </div>
            <Link href="/app/settings">View Premium</Link>
          </div>
        )
      ) : null}

      {workspace?.notes.length ? (
        <>
          <JournalEntries notes={workspace.notes} />
          <button
            className="match-journal__share"
            disabled={!workspace.access.canWriteNotes || pending}
            onClick={shareJournal}
            type="button"
          >
            <Share2 aria-hidden size={16} /> Invite one Duna member
          </button>
        </>
      ) : workspace?.access.participant ? (
        <p className="match-journal__empty">
          Your first reflection will live here, alongside the film and result.
        </p>
      ) : workspace && !shareToken && !workspace.sharedJournals.length ? (
        <p className="match-journal__empty">
          Private journals appear for players listed in this match. Public match
          conversation stays separate below.
        </p>
      ) : null}

      {workspace?.shares
        .filter((share) => share.status === "active")
        .map((share) => (
          <div className="match-journal__share-row" key={share.id}>
            <span>
              <strong>
                {share.claimedBy?.displayName ??
                  "Invite waiting to be accepted"}
              </strong>
              <small>
                {share.claimedBy
                  ? "Can view this match journal"
                  : "One verified member · expires after 30 days"}
              </small>
            </span>
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await revokeMatchNoteShareAction({
                    matchId,
                    returnTo,
                    shareId: share.id,
                  });
                  setMessage(result.ok ? "Access revoked." : result.error);
                  if (result.ok) router.refresh();
                })
              }
              type="button"
            >
              Revoke
            </button>
          </div>
        ))}

      {workspace?.sharedJournals.map((journal) => (
        <div className="match-journal__shared" key={journal.owner.id}>
          <strong>
            {journal.owner.displayName} shared this journal with you
          </strong>
          <JournalEntries notes={journal.notes} />
        </div>
      ))}

      {!accessKnown && !shareToken ? (
        <div className="match-journal__signed-out">
          <Lock aria-hidden size={17} />
          <span>
            <Link href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
              Sign in
            </Link>{" "}
            to open your private journal for this match.
          </span>
        </div>
      ) : null}
      {message ? <small role="status">{message}</small> : null}
    </section>
  );
}
