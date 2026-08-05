"use client";

import { Bell, BellRing, Check, LoaderCircle, Star } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { updatePlayerFollowAction } from "@/app/players/actions";

type FollowState = {
  readonly following: boolean;
  readonly notifyRegistrations: boolean;
  readonly notifyWatch: boolean;
  readonly notifyResults: boolean;
};

export function PlayerFollowButton({
  handle,
  initialState,
  playerPersonId,
}: {
  readonly handle: string;
  readonly initialState?: FollowState;
  readonly playerPersonId: string;
}) {
  const [state, setState] = useState(initialState);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!state) {
    return (
      <Link
        className="player-follow player-follow--signed-out"
        href={`/sign-in?returnTo=${encodeURIComponent(`/players/${handle}`)}`}
      >
        <Star aria-hidden size={18} /> Follow player
      </Link>
    );
  }

  function save(next: FollowState) {
    setError(undefined);
    startTransition(async () => {
      const response = await updatePlayerFollowAction({
        handle,
        playerPersonId,
        ...next,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setState(response.state);
      if (!response.state.following) setOpen(false);
    });
  }

  return (
    <div className="player-follow-wrap">
      <button
        aria-expanded={open}
        className="player-follow"
        data-following={state.following}
        disabled={pending}
        onClick={() => {
          if (!state.following) {
            save({ ...state, following: true });
            return;
          }
          setOpen((value) => !value);
        }}
        type="button"
      >
        {pending ? (
          <LoaderCircle aria-hidden className="spin" size={18} />
        ) : state.following ? (
          <BellRing aria-hidden size={18} />
        ) : (
          <Star aria-hidden size={18} />
        )}
        {state.following ? "Following" : "Follow player"}
        {state.following && <Check aria-hidden size={15} />}
      </button>
      {open && (
        <div className="player-follow-menu">
          <strong>Player alerts</strong>
          <p>Choose what Duna should tell you about.</p>
          {[
            {
              key: "notifyRegistrations" as const,
              label: "New event registrations",
            },
            {
              key: "notifyWatch" as const,
              label: "Where and when to watch",
            },
            {
              key: "notifyResults" as const,
              label: "New match results",
            },
          ].map((option) => (
            <label key={option.key}>
              <span>
                <Bell aria-hidden size={15} /> {option.label}
              </span>
              <input
                checked={state[option.key]}
                disabled={pending}
                onChange={(event) =>
                  save({ ...state, [option.key]: event.target.checked })
                }
                type="checkbox"
              />
            </label>
          ))}
          <button
            className="player-follow-menu__remove"
            disabled={pending}
            onClick={() => save({ ...state, following: false })}
            type="button"
          >
            Unfollow player
          </button>
          {error && <small role="alert">{error}</small>}
        </div>
      )}
    </div>
  );
}
