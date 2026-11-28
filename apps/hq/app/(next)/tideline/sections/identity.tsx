import {
  CLUB_MARK_SIZES,
  ClubLockup,
  ClubMark,
  MembershipCard,
  WindowAvatar,
} from "@duna/ui/tideline";
import { type GalleryExample, type GalleryGroup } from "../gallery";
import styles from "../gallery.module.css";
import { WalletDemo } from "./kit/wallet-demo";

const group: GalleryGroup = {
  id: "identity",
  title: "Club identity",
  order: 540,
};

/** Fictional demo clubs (contract step 3: board data is never real data). */
const sunset = {
  name: "Sunset Beach Club",
  color: "#1E5AA8",
  // A fictional mark drawn for the gallery: a sun over three lines.
  logo: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48' fill='white'%3E%3Cpath d='M8 26A16 16 0 0 1 40 26Z'/%3E%3Crect x='6' y='30' width='36' height='3.5'/%3E%3Crect x='11' y='36' width='26' height='3.5'/%3E%3Crect x='17' y='42' width='14' height='3.5'/%3E%3C/svg%3E",
  worksSmall: true,
};
const harbor = { name: "Harbor Sand Club", color: "#0F7A6B" };
const cove = { name: "Cove Volley", color: "#E9D8B4" };
const publicCourts = { name: "Public courts · north beach" };
const tileClub = {
  name: "Golden Hour Volleyball",
  color: "#24546B",
  tile: "/media/event-library/duna-event-golden-hour-pickup.webp",
};

const examples: GalleryExample[] = [
  {
    group,
    order: 10,
    title: "ClubMark · logo, tile, monogram",
    content: (
      <div className={styles.row}>
        <ClubMark {...sunset} size="2xl" />
        <ClubMark {...tileClub} size="2xl" />
        <ClubMark {...harbor} size="2xl" />
        <ClubMark {...cove} size="2xl" />
        <ClubMark {...publicCourts} size="2xl" />
      </div>
    ),
  },
  {
    group,
    order: 11,
    title:
      "ClubMark · sizes 20 to 160 (logo works small; the others turn to the monogram under 28)",
    wide: true,
    content: (
      <div className={styles.row} style={{ alignItems: "end" }}>
        {Object.entries(CLUB_MARK_SIZES).map(([name, px]) => (
          <span
            className={styles.stack}
            key={name}
            style={{ justifyItems: "center" }}
          >
            <span className={styles.row} style={{ alignItems: "end" }}>
              <ClubMark {...sunset} size={px} />
              <ClubMark {...tileClub} size={px} />
              <ClubMark {...harbor} size={px} />
            </span>
            <span className="td-meta td-num">{px}</span>
          </span>
        ))}
      </div>
    ),
  },
  {
    group,
    order: 12,
    title: "ClubMark · broken image, no colour, numerals, no name",
    content: (
      <div className={styles.row}>
        <ClubMark
          color="#7A2E8F"
          logo="/media/missing-club-logo.svg"
          name="Broken Logo Club"
          size="xl"
        />
        <ClubMark name="Dunes" size="xl" />
        <ClubMark name="24 Beach" size="xl" />
        <ClubMark name="🏐" size="xl" />
      </div>
    ),
  },
  {
    group,
    order: 13,
    title:
      "ClubMark · pending and archived keep the brand; a chip says the state",
    content: (
      <div className={styles.stack}>
        <ClubLockup
          {...harbor}
          location="Long Beach, CA"
          size="lg"
          state="pending"
        />
        <ClubLockup
          {...sunset}
          location="Santa Monica, CA"
          size="lg"
          state="archived"
        />
      </div>
    ),
  },
  {
    group,
    order: 14,
    title: "ClubLockup · multi-facility and a long name",
    content: (
      <div className={styles.stack}>
        <ClubLockup
          {...sunset}
          facility="North courts"
          location="Santa Monica, CA"
          size="lg"
        />
        <ClubLockup
          color="#5B3A8C"
          facility="Featherstonehaugh Memorial Sand Courts, East Lawn"
          location="Manhattan Beach, CA"
          name="Montgomery-Clarke Beach Volleyball Association"
          size="lg"
        />
      </div>
    ),
  },
  {
    group,
    order: 15,
    title: "ClubMark · on a photograph",
    content: (
      <div
        style={{
          position: "relative",
          display: "grid",
          placeItems: "center",
          minHeight: 160,
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <img
          alt=""
          src="/media/event-library/duna-event-court-rental.webp"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        <span style={{ position: "relative" }}>
          <ClubMark {...sunset} onPhoto size="xl" />
        </span>
      </div>
    ),
  },
  {
    group,
    order: 20,
    title: "MembershipCard · active with a code",
    content: (
      <MembershipCard
        club={sunset}
        code="SBC-0148-NW"
        image="/media/event-library/duna-event-golden-hour-pickup.webp"
        kind="Club member"
        member="Noa Williams"
        plan="Annual member"
        since="Member since Mar 2024"
        status="active"
        validThrough="Mar 31, 2027"
      />
    ),
  },
  {
    group,
    order: 21,
    title: "MembershipCard · active, no pass issued",
    content: (
      <MembershipCard
        club={harbor}
        member="Noa Williams"
        plan="Drop-in member"
        status="active"
        validThrough="[date]"
      />
    ),
  },
  {
    group,
    order: 22,
    title: "MembershipCard · pending (brand at full strength)",
    content: (
      <MembershipCard
        club={publicCourts}
        kind="Approved player · public beach"
        member="Noa Williams"
        plan="Approved player"
        since="Applied Nov 24"
        status="pending"
      />
    ),
  },
  {
    group,
    order: 23,
    title: "MembershipCard · paused and expired",
    content: (
      <div className={styles.stack}>
        <MembershipCard
          club={cove}
          member="Mara Lewis"
          plan="Monthly member"
          status="paused"
        />
        <MembershipCard
          club={tileClub}
          member="Bartholomew Featherstonehaugh-Montgomery"
          plan="Season pass"
          status="expired"
          validThrough="Oct 31, 2026"
        />
      </div>
    ),
  },
  {
    group,
    order: 24,
    title: "MembershipCard · compact strips",
    content: (
      <div className={styles.stack}>
        <MembershipCard
          club={sunset}
          compact
          member="Noa Williams"
          plan="Annual member"
          status="active"
        />
        <MembershipCard
          club={harbor}
          compact
          member="Noa Williams"
          plan="Drop-in member"
          status="paused"
        />
        <MembershipCard
          club={publicCourts}
          compact
          member="Noa Williams"
          plan="Approved player"
          status="pending"
        />
        <MembershipCard
          club={cove}
          compact
          member="Noa Williams"
          plan="Monthly member"
          status="expired"
          validThrough="Oct 31"
        />
      </div>
    ),
  },
  {
    group,
    order: 30,
    title: "WalletStack · tap a strip to open that card",
    content: <WalletDemo />,
  },
  {
    group,
    order: 40,
    title: "WindowAvatar · places through the mark (people stay in circles)",
    content: (
      <div className={styles.row}>
        <WindowAvatar
          kind="Venue"
          meta="Santa Monica"
          name="North beach courts"
          size={48}
          src="/media/event-library/duna-event-court-rental.webp"
        />
        <WindowAvatar
          drift
          ground="night-court"
          kind="Tournament"
          name="King of the Beach"
          size={72}
          src="/media/event-library/duna-event-king-of-the-beach.webp"
        />
        <WindowAvatar
          ground="dune"
          kind="Event"
          name="Golden hour pickup"
          size={120}
          src="/media/event-library/duna-event-golden-hour-pickup.webp"
        />
        <WindowAvatar kind="Venue" name="No photo yet" size={48} />
      </div>
    ),
  },
];

export default examples;
