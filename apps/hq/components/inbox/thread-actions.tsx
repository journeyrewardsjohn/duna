"use client";

import { Button, Select, useAction } from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  assignThreadAction,
  markDoneAction,
  markReadAction,
  muteThreadAction,
} from "@/app/(next)/(hq)/inbox/actions";
import { reportFailure, unwrap } from "./inbox-result";

const NOBODY = "nobody";

/**
 * A thread's own actions: who looks after it (assign to yourself or hand it
 * to a teammate), and mute or mark done where the backend has them. Opening
 * an unread thread marks it read for the club's staff.
 */
export function ThreadActions({
  conversationId,
  lastSequence,
  unread,
  canAssign,
  canMute,
  canMarkDone,
  canMarkRead,
  staff,
  me,
  assignedToMe,
}: {
  readonly conversationId: string;
  readonly lastSequence: number;
  readonly unread: boolean;
  readonly canAssign: boolean;
  readonly canMute: boolean;
  readonly canMarkDone: boolean;
  readonly canMarkRead: boolean;
  readonly staff: readonly {
    readonly personId: string;
    readonly name: string;
    readonly role: string;
  }[];
  readonly me?: string;
  /** The list is "Mine", so this thread is assigned to the viewer. */
  readonly assignedToMe: boolean;
}) {
  const router = useRouter();
  const [assignee, setAssignee] = useState<string | null>(
    assignedToMe && me ? me : null,
  );
  useEffect(
    () => setAssignee(assignedToMe && me ? me : null),
    [conversationId, assignedToMe, me],
  );

  const marked = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!canMarkRead || !unread || lastSequence < 1) return;
    if (marked.current === `${conversationId}:${lastSequence}`) return;
    marked.current = `${conversationId}:${lastSequence}`;
    void markReadAction({ conversationId, sequence: lastSequence }).then(
      (result) => {
        if (result.ok) router.refresh();
      },
    );
  }, [canMarkRead, conversationId, lastSequence, router, unread]);

  const nameOf = (personId: string | null) =>
    personId === null
      ? "nobody"
      : personId === me
        ? "you"
        : (staff.find((member) => member.personId === personId)?.name ??
          "a teammate");

  const assign = useAction(
    async (_context, personId: string | null) =>
      unwrap(
        await assignThreadAction({
          conversationId,
          assigneePersonId: personId,
        }),
      ),
    {
      messages: {
        success: (result) =>
          result.assigneePersonId === null
            ? "Back in Unassigned"
            : result.assigneePersonId === me
              ? "Assigned to you"
              : `Handed to ${nameOf(result.assigneePersonId)}`,
        error: "The conversation wasn't reassigned.",
      },
      report: reportFailure("hq.inbox.assignFailed"),
      onSuccess: (result) => {
        setAssignee(result.assigneePersonId);
        router.refresh();
      },
    },
  );

  const mute = useAction(
    async () => unwrap(await muteThreadAction({ conversationId, muted: true })),
    { report: reportFailure("hq.inbox.muteFailed") },
  );
  const done = useAction(
    async () => unwrap(await markDoneAction({ conversationId, done: true })),
    { report: reportFailure("hq.inbox.doneFailed") },
  );

  if (!canAssign && !canMute && !canMarkDone) return null;
  const options = [
    { value: NOBODY, label: "Unassigned" },
    ...(me ? [{ value: me, label: "Assigned to me" }] : []),
    ...staff
      .filter((member) => member.personId !== me)
      .map((member) => ({
        value: member.personId,
        label: `Handed to ${member.name}`,
      })),
  ];
  return (
    <div className="inbox-thread-actions">
      {canAssign ? (
        <Select
          aria-label="Who is looking after it"
          className="inbox-assign"
          disabled={assign.pending}
          onValueChange={(value) => {
            const next = value === NOBODY || !value ? null : value;
            if (next !== assignee) void assign.run(next);
          }}
          options={options}
          value={assignee ?? NOBODY}
        />
      ) : null}
      {canMute ? (
        <Button {...mute.buttonProps} size="sm" variant="ghost">
          Mute
        </Button>
      ) : null}
      {canMarkDone ? (
        <Button {...done.buttonProps} size="sm" variant="secondary">
          Mark done
        </Button>
      ) : null}
    </div>
  );
}
