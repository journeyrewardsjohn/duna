"use client";

import { Chip } from "@duna/ui/tideline";
import { useState } from "react";
import {
  bookingInviteUrl,
  contactFromName,
  inviteMessage,
  inviteStateWords,
  type InviteOpened,
  type InviteServerStatus,
} from "./invite-links";
import { InviteShare } from "./invite-share";

export interface BookingInviteSeat {
  readonly id: string;
  readonly personId?: string;
  readonly displayName: string;
  readonly role: string;
  readonly status: InviteServerStatus;
  readonly inviteToken?: string;
}

/**
 * The invitations a booker sends themselves, one row per seat. Each row
 * shows the state the server reports (link ready, joined) and, until it
 * joins, the person's own Share, Text message, WhatsApp and Copy link.
 * Duna sends nothing for these, so no row ever says "sent".
 */
export function BookingInvites({
  seats,
  organizerName,
  what,
  place,
  when,
  origin,
}: {
  readonly seats: readonly BookingInviteSeat[];
  readonly organizerName: string;
  readonly what: string;
  readonly place: string;
  readonly when?: string;
  readonly origin: string;
}) {
  const [opened, setOpened] = useState<Readonly<Record<string, InviteOpened>>>(
    {},
  );
  // Members already on Duna have no link to send; only guests do.
  const rows = seats.filter(
    (seat) => seat.role !== "organizer" && !seat.personId && seat.inviteToken,
  );
  if (rows.length === 0) return null;
  return (
    <section aria-label="Invitations to send" className="pp-stack">
      <p className="site-meta">
        Each link opens in your own Messages or WhatsApp. Press Send there: Duna
        doesn’t text or email anyone for you.
      </p>
      <ul className="iv-list">
        {rows.map((seat) => {
          const url = bookingInviteUrl(origin, seat.inviteToken!);
          const state = inviteStateWords(seat.status, opened[seat.id]);
          const closed =
            state.tone === "positive" ||
            seat.status === "declined" ||
            seat.status === "cancelled";
          return (
            <li className="iv-row" key={seat.id}>
              <div className="iv-row__top">
                <span className="iv-row__name">{seat.displayName}</span>
                <Chip kind="status" tone={state.tone}>
                  {state.label}
                </Chip>
              </div>
              {closed ? null : (
                <InviteShare
                  message={inviteMessage({
                    organizerName,
                    what,
                    place,
                    ...(when ? { when } : {}),
                    url,
                  })}
                  onOpened={(how) =>
                    setOpened((current) => ({ ...current, [seat.id]: how }))
                  }
                  phone={contactFromName(seat.displayName).phone}
                  title={`the invitation for ${seat.displayName}`}
                  url={url}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
