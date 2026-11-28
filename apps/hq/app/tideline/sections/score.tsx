import { NetScore, type NetScoreProps, RatingRing } from "@duna/ui/tideline";
import { type GalleryExample, type GalleryGroup } from "../gallery";
import styles from "../gallery.module.css";
import { LiveScoreDemo } from "./kit/live-score-demo";

const group: GalleryGroup = {
  id: "score",
  title: "Score and rating",
  order: 520,
};

const pair = ["Williams / Lewis", "Park / Stone"] as const;
const longPair = [
  { players: ["A. Featherstonehaugh", "B. Vanderhoeven-Smythe"] },
  { players: ["C. Montgomery-Clarke", "D. Abernathy"] },
] as const;
const three: NetScoreProps["sets"] = [
  [21, 18],
  [19, 21],
  [15, 12],
];

/** One example per state; the status strings are what the gallery test checks. */
const states: Array<{
  title: string;
  props: Partial<NetScoreProps> & Pick<NetScoreProps, "status">;
}> = [
  {
    title: "Scheduled",
    props: {
      status: "scheduled",
      start: "Sat, Nov 28 · 9:00 AM",
      court: "Court 3",
    },
  },
  {
    title: "Warm-up",
    props: {
      status: "warmup",
      start: "Sat, Nov 28 · 9:00 AM",
      court: "Court 3",
    },
  },
  {
    title: "Live · set 3 · Park / Stone serving",
    props: {
      status: "live",
      sets: [
        [21, 18],
        [19, 21],
        [9, 11],
      ],
      serving: 1,
      announce: false,
    },
  },
  {
    title: "Pending verification (hollow check)",
    props: { status: "pending-verification", sets: three },
  },
  { title: "Verified", props: { status: "verified", sets: three } },
  { title: "Complete", props: { status: "complete", sets: three } },
  {
    title: "Disputed (no winner, numbers muted)",
    props: { status: "disputed", sets: three },
  },
  {
    title: "Forfeit after one set",
    props: {
      status: "forfeit",
      sets: [[21, 18]],
      winner: 0,
      reason: "Park / Stone retired: injury",
    },
  },
  {
    title: "Forfeit, nothing played",
    props: {
      status: "forfeit",
      sets: [],
      forfeitedBy: 0,
      reason: "Williams / Lewis did not show",
    },
  },
  {
    title: "Cancelled",
    props: {
      status: "cancelled",
      start: "Sat, Nov 28 · 9:00 AM",
      reason: "High surf warning",
    },
  },
  {
    title: "Not finished (retired mid-set)",
    props: {
      status: "not-finished",
      sets: [
        [21, 18],
        [9, 7],
      ],
      reason: "Lost the light at 4:52 PM",
    },
  },
];

const examples: GalleryExample[] = [
  ...states.map((state, index): GalleryExample => ({
    group,
    order: 10 + index,
    title: `NetScore · ${state.title}`,
    content: (
      <div className={styles.stack}>
        <NetScore bestOf={3} layout="net" teams={pair} {...state.props} />
        <NetScore bestOf={3} layout="rows" teams={pair} {...state.props} />
        <NetScore bestOf={3} layout="compact" teams={pair} {...state.props} />
      </div>
    ),
  })),
  {
    group,
    order: 40,
    title: "NetScore · live, score it",
    content: <LiveScoreDemo />,
  },
  {
    group,
    order: 41,
    title: "NetScore · title match (trophy)",
    content: (
      <NetScore
        sets={[
          [21, 17],
          [21, 19],
        ]}
        status="verified"
        teams={pair}
        title="King of the Beach final"
      />
    ),
  },
  {
    group,
    order: 42,
    title: "NetScore · single set",
    content: (
      <NetScore bestOf={1} sets={[[21, 16]]} status="complete" teams={pair} />
    ),
  },
  {
    group,
    order: 43,
    title: "NetScore · five sets, 31–29, long doubles names",
    wide: true,
    content: (
      <div className={styles.stack}>
        <NetScore
          bestOf={5}
          sets={[
            [21, 19],
            [29, 31],
            [21, 18],
            [17, 21],
            [15, 13],
          ]}
          status="complete"
          teams={longPair}
        />
        <NetScore
          bestOf={5}
          layout="rows"
          sets={[
            [21, 19],
            [29, 31],
            [21, 18],
            [17, 21],
            [15, 13],
          ]}
          status="complete"
          teams={longPair}
        />
      </div>
    ),
  },
  {
    group,
    order: 44,
    title: "NetScore · sizes (sm, md, lg: 2 px net only at lg)",
    wide: true,
    content: (
      <div className={styles.row}>
        {(["sm", "md", "lg"] as const).map((size) => (
          <div
            key={size}
            style={{ flex: "1 1 240px", maxWidth: size === "lg" ? 460 : size === "md" ? 340 : 260 }}
          >
            <NetScore
              layout="net"
              sets={three}
              size={size}
              status="verified"
              teams={pair}
            />
          </div>
        ))}
      </div>
    ),
  },
  {
    group,
    order: 45,
    title: "NetScore · auto switches to rows under 320 px",
    wide: true,
    content: (
      <div className={styles.row}>
        {[260, 300, 360].map((width) => (
          <div key={width} style={{ flex: `0 1 ${width}px`, minWidth: 0 }}>
            <NetScore sets={three} status="complete" teams={longPair} />
          </div>
        ))}
      </div>
    ),
  },
  {
    group,
    order: 60,
    title: "RatingRing · profile hero",
    content: (
      <RatingRing delta={0.08} reliability={3} size="hero" value={3.42} />
    ),
  },
  {
    group,
    order: 61,
    title: "RatingRing · states (card size)",
    content: (
      <div className={styles.row}>
        <RatingRing delta={0.08} reliability={3} size="card" value={3.42} />
        <RatingRing delta={-0.04} reliability={2} size="card" value={3.38} />
        <RatingRing matchesLeft={3} reliability={0} size="card" value={null} />
        <RatingRing delta={0.1} reliability={3} size="card" value={3.5} />
      </div>
    ),
  },
  {
    group,
    order: 62,
    title: "RatingRing · compact and inline",
    content: (
      <div className={styles.row}>
        <RatingRing delta={0.08} reliability={3} size={84} value={3.42} />
        <RatingRing delta={0.08} reliability={3} size="inline" value={3.42} />
        <RatingRing
          matchesLeft={1}
          reliability={0}
          size="inline"
          value={null}
        />
      </div>
    ),
  },
];

export default examples;
