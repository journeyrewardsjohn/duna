"use client";

import { report } from "@duna/observability";
import { Button, Notice, useAction, useOnline } from "@duna/ui/tideline";
import { Icon } from "@duna/ui/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { recordAttendanceAction } from "@/app/(next)/(hq)/offerings/actions";
import { unwrap } from "../money/money-action-result";
import type { SessionBooking, SessionView } from "./session-model";

type Mark = "attended" | "absent";

/**
 * Attendance as a fast checklist for the court (participation.md §6): one
 * large row per booking, tap to mark here or absent, "Everyone's here",
 * then one save. Marking never changes what anyone pays (decision 2).
 * Offline, marks stay on screen and Save waits for the connection.
 */
export function AttendanceList({ session }: { readonly session: SessionView }) {
  const router = useRouter();
  const online = useOnline();
  const bookings = session.bookings ?? [];
  const [marks, setMarks] = useState<Record<string, Mark | undefined>>(() =>
    Object.fromEntries(
      bookings.map((booking) => [booking.id, booking.attendance]),
    ),
  );
  const changed = bookings.filter(
    (booking) => marks[booking.id] && marks[booking.id] !== booking.attendance,
  );
  const save = useAction(
    async ({ idempotencyKey }) =>
      unwrap(
        await recordAttendanceAction({
          subjectType: session.subjectType,
          subjectId: session.id,
          marks: changed.map((booking) => ({
            bookingId: booking.id,
            status: marks[booking.id]!,
          })),
          idempotencyKey,
        }),
      ),
    {
      messages: {
        success: (result) =>
          `Attendance saved for ${result.recorded} booking${result.recorded === 1 ? "" : "s"}`,
        error: "Attendance wasn't saved. Your marks are still here; try again.",
      },
      report: (error) =>
        void report(error, { event: "hq.offerings.attendance_failed" }),
      onSuccess: () => router.refresh(),
    },
  );
  if (bookings.length === 0) {
    return (
      <p className="pt-quiet">Nobody is booked, so there is no one to mark.</p>
    );
  }
  const toggle = (booking: SessionBooking) =>
    setMarks((current) => ({
      ...current,
      [booking.id]: current[booking.id] === "attended" ? "absent" : "attended",
    }));
  const here = bookings.filter(
    (booking) => marks[booking.id] === "attended",
  ).length;
  return (
    <div className="pt-attendance">
      <ul aria-label="Attendance" className="pt-attendance__list">
        {bookings.map((booking) => {
          const mark = marks[booking.id];
          return (
            <li key={booking.id}>
              <button
                aria-pressed={mark === "attended"}
                className="pt-attendance__row"
                data-mark={mark ?? "unmarked"}
                onClick={() => toggle(booking)}
                type="button"
              >
                <span className="pt-attendance__box" aria-hidden="true">
                  {mark === "attended" ? (
                    <Icon name="check" size="inline" />
                  ) : null}
                </span>
                <span className="pt-attendance__name">
                  {booking.name}
                  {booking.quantity > 1 ? (
                    <span className="pt-quiet">{` · ${booking.quantity} places`}</span>
                  ) : null}
                </span>
                <span className="pt-attendance__state">
                  {mark === "attended"
                    ? "Here"
                    : mark === "absent"
                      ? "Absent"
                      : "Not marked"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="pt-quiet" aria-live="polite">
        {`${here} of ${bookings.length} marked here. Marking never changes what anyone pays.`}
      </p>
      {!online ? (
        <Notice tone="info" title="You're offline">
          Your marks stay on this screen. Save them when you're back online.
        </Notice>
      ) : null}
      <div className="pt-actions">
        <Button
          onClick={() =>
            setMarks(
              Object.fromEntries(
                bookings.map((booking) => [booking.id, "attended"]),
              ),
            )
          }
          variant="secondary"
        >
          Everyone&apos;s here
        </Button>
        <Button
          {...save.buttonProps}
          disabled={!online || changed.length === 0}
          variant="primary"
        >
          {changed.length > 0
            ? `Save ${changed.length} mark${changed.length === 1 ? "" : "s"}`
            : "Save attendance"}
        </Button>
      </div>
    </div>
  );
}
