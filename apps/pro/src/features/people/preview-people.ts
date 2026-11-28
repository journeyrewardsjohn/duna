/**
 * The preview build's roster (credential-free demo mode only): the boards'
 * example club, with a junior, a player who needs a follow-up, a pending
 * invitation and the longest name the roster has to fit. Nothing here is a
 * real person. Live builds never read it.
 */
import { demoPeople } from "@duna/core/demo";
import type {
  CalendarEntryInput,
  MemberInput,
  RelationshipInput,
} from "./people-model";

const extra: readonly MemberInput[] = [
  {
    id: "10000000-0000-4000-8000-000000000021",
    displayName: "Riley Moss",
    handle: "rileymoss",
    initials: "RM",
    roles: ["player"],
    isMinor: true,
    guardianIds: ["10000000-0000-4000-8000-000000000022"],
    rating: { display: 2.4, confidence: "Provisional" },
  },
  {
    id: "10000000-0000-4000-8000-000000000022",
    displayName: "Dana Moss",
    handle: "danamoss",
    initials: "DM",
    roles: ["guardian"],
    rating: { display: 0, confidence: "Provisional" },
  },
  {
    id: "10000000-0000-4000-8000-000000000023",
    displayName: "Maximiliana Castellanos-Oyelaran",
    handle: "maxi-co",
    initials: "MC",
    roles: ["player"],
    rating: { display: 3.12, confidence: "Developing" },
  },
  {
    id: "10000000-0000-4000-8000-000000000024",
    displayName: "Jordan Cruz",
    handle: "jordancruz",
    initials: "JC",
    roles: ["coach", "player"],
    rating: { display: 4.05, confidence: "Locked" },
  },
];

export const previewMembers: readonly MemberInput[] = [...demoPeople, ...extra];

const base = (
  personId: string,
  patch: Partial<RelationshipInput>,
): RelationshipInput => ({
  personId,
  isMinor: false,
  roles: ["player"],
  status: "active",
  creditBalance: 0,
  upcomingCount: 0,
  churnRisk: { level: "low", reasons: [] },
  ...patch,
});

export const previewRelationships: readonly RelationshipInput[] = [
  base(demoPeople[0]!.id, {
    membershipName: "Performance membership",
    creditBalance: 4,
    upcomingCount: 1,
  }),
  base(demoPeople[1]!.id, { roles: ["player", "coach"], creditBalance: 2 }),
  base(demoPeople[3]!.id, {
    churnRisk: {
      level: "high",
      reasons: ["No visit in 34 days after coming twice a week."],
      daysSinceActivity: 34,
    },
  }),
  base(demoPeople[4]!.id, { status: "pending" }),
  base(extra[0]!.id, { isMinor: true, upcomingCount: 1 }),
  base(extra[1]!.id, { roles: ["guardian"] }),
  base(extra[2]!.id, {
    membershipName: "Unlimited Sunset Doubles Development Membership",
    creditBalance: 12,
  }),
  base(extra[3]!.id, { roles: ["coach", "player"] }),
];

export function previewRosterEntries(
  now: number,
): readonly CalendarEntryInput[] {
  const at = (hours: number) => new Date(now + hours * 3_600_000).toISOString();
  return [
    {
      id: "preview-clinic",
      sourceType: "session",
      title: "Sunset doubles clinic",
      startsAt: at(26),
      status: "scheduled",
      attendees: [{ personId: demoPeople[0]!.id }, { personId: extra[0]!.id }],
    },
  ];
}
