/**
 * Demo fixtures: invitations by text message (owner: INVITE-SMS). In demo
 * mode the preview is computed from these facts (any subject id of a kind
 * resolves to that kind's demo subject) so the invite sheet can be built and
 * tested without a database; sending answers "not configured". Shaped by
 * `contracts/invites.ts`. Illustrative only: no real people or venues.
 */
import { demoId } from "./ids";

export const invitesDemo = {
  /** The demo sender, as the text names them. */
  inviter: {
    givenName: "Alex",
    familyName: "Rivera",
    displayName: "Alex Rivera",
  },
  /** The number on the demo suppression list (it said STOP); demo only. */
  optedOutE164: "+13104820123",
  subjects: {
    "court-booking": {
      place: "Demo Beach Courts",
      startsAt: "2026-12-06T17:00:00.000Z",
      timeZone: "America/Los_Angeles",
      path: "/app/booking-invite/00000000-0000-4000-8000-00000000d3e0",
    },
    session: {
      title: "Intermediate clinic",
      place: "Demo Beach Club",
      startsAt: "2026-12-07T16:30:00.000Z",
      timeZone: "America/Los_Angeles",
      path: "/i/demoShareLink1",
    },
    pickup: {
      place: "Demo Beach Courts",
      startsAt: "2026-12-06T23:00:00.000Z",
      timeZone: "America/Los_Angeles",
      path: `/events/pickup-${demoId("invites", 1)}`,
    },
    match: {
      place: "Demo Beach Courts",
      startsAt: "2026-11-27T18:00:00.000Z",
      timeZone: "America/Los_Angeles",
      path: "/join/match/demo-match-invitation-token-00000000000000",
    },
    club: {
      place: "Demo Beach Club",
      startsAt: undefined,
      timeZone: undefined,
      path: "/join/organization/demo-club-invitation-token-000000000000",
    },
  },
  status: {
    recipients: [
      {
        id: demoId("invites", 11),
        name: "Sam",
        maskedNumber: "•••• 0142",
        state: "delivered" as const,
        sentAt: "2026-11-28T17:02:00.000Z",
        deliveredAt: "2026-11-28T17:02:09.000Z",
      },
      {
        id: demoId("invites", 12),
        name: "Jordan",
        maskedNumber: "•••• 0177",
        state: "sent" as const,
        sentAt: "2026-11-28T17:02:01.000Z",
      },
      {
        id: demoId("invites", 13),
        name: "Casey",
        maskedNumber: "•••• 0199",
        state: "failed" as const,
        failureCode: "carrier_rejected",
        sentAt: "2026-11-28T17:02:01.000Z",
      },
    ],
  },
} as const;
