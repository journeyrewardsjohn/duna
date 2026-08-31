"use client";

import type {
  CommunityCommentSummary,
  CommunitySubjectSummary,
} from "@duna/api";
import { Lock, MessageCircle, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  createCommunityCommentAction,
  deleteCommunityCommentAction,
} from "@/app/community-actions";

interface CommunityThreadAccess {
  readonly verified: boolean;
  readonly paidPremium: boolean;
  readonly canComment: boolean;
  readonly reason?: string;
}

function commentDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function CommunityThread({
  access,
  comments: initialComments,
  description,
  returnTo,
  subject,
  title = "Match conversation",
}: {
  readonly access?: CommunityThreadAccess;
  readonly comments: readonly CommunityCommentSummary[];
  readonly description?: string;
  readonly returnTo: string;
  readonly subject: CommunitySubjectSummary;
  readonly title?: string;
}) {
  const [comments, setComments] = useState([...initialComments]);
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const subjectDescription =
    description ??
    (subject.type === "match"
      ? "Public conversation from verified Duna members, grounded in this exact match."
      : subject.type === "live-stream"
        ? "Public conversation from verified Duna members watching this live stream."
        : subject.type === "pro-event"
          ? "Public conversation from verified Duna members following this event."
          : "Public conversation from verified Duna members following this prediction market.");
  const emptyPrompt =
    subject.type === "match"
      ? "Encouragement, questions, and match analysis belong here."
      : subject.type === "live-stream"
        ? "React to the action, ask a question, or add thoughtful analysis."
        : subject.type === "pro-event"
          ? "Share an event takeaway, question, or moment worth following."
          : "Discuss the matchup and your reasoning without trying to manipulate the market.";

  return (
    <section className="community-thread">
      <header className="community-thread__header">
        <span>
          <MessageCircle aria-hidden size={20} />
        </span>
        <div>
          <h2>{title}</h2>
          <p>{subjectDescription}</p>
        </div>
      </header>

      <div className="community-thread__comments">
        {comments.length ? (
          comments.map((comment) => (
            <article key={comment.id}>
              <Link
                aria-label={`View ${comment.author.displayName}'s profile`}
                className="community-thread__avatar"
                href={comment.author.publicPath}
              >
                {comment.author.avatarUrl ? (
                  <img alt="" src={comment.author.avatarUrl} />
                ) : (
                  comment.author.displayName.slice(0, 1).toUpperCase()
                )}
              </Link>
              <div>
                <header>
                  <Link href={comment.author.publicPath}>
                    {comment.author.displayName}
                  </Link>
                  <time dateTime={comment.createdAt}>
                    {commentDate(comment.createdAt)}
                  </time>
                </header>
                <p>{comment.body}</p>
              </div>
              {comment.viewerCanDelete ? (
                <button
                  aria-label="Remove your comment"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteCommunityCommentAction({
                        subject,
                        commentId: comment.id,
                        returnTo,
                      });
                      if (result.ok) {
                        setComments((current) =>
                          current.filter((item) => item.id !== comment.id),
                        );
                      } else {
                        setMessage(result.error);
                      }
                    })
                  }
                  type="button"
                >
                  <Trash2 aria-hidden size={15} />
                </button>
              ) : null}
            </article>
          ))
        ) : (
          <div className="community-thread__empty">
            <strong>Start with a thoughtful takeaway.</strong>
            <span>{emptyPrompt}</span>
          </div>
        )}
      </div>

      {access?.canComment ? (
        <div className="community-thread__composer">
          <textarea
            aria-label={`Public ${subject.type} comment`}
            maxLength={1500}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Share encouragement, analysis, or a question…"
            value={body}
          />
          <button
            disabled={pending || !body.trim()}
            onClick={() =>
              startTransition(async () => {
                setMessage("");
                const result = await createCommunityCommentAction({
                  subject,
                  body: body.trim(),
                  idempotencyKey: crypto.randomUUID(),
                  returnTo,
                });
                if (!result.ok) {
                  setMessage(result.error);
                  return;
                }
                setBody("");
                if (result.comment.status === "visible") {
                  setComments((current) => [...current, result.comment]);
                  setMessage("Posted publicly.");
                } else {
                  setMessage(
                    "Your comment is being reviewed before it appears publicly.",
                  );
                }
              })
            }
            type="button"
          >
            <Send aria-hidden size={16} /> {pending ? "Checking…" : "Post"}
          </button>
        </div>
      ) : (
        <div className="community-thread__gate">
          <Lock aria-hidden size={17} />
          <span>
            {access?.reason ?? (
              <>
                <Link
                  href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
                >
                  Sign in
                </Link>{" "}
                with a verified Player Premium account to comment.
              </>
            )}
          </span>
        </div>
      )}
      {message ? <small role="status">{message}</small> : null}
    </section>
  );
}
