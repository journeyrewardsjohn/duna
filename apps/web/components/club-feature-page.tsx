"use client";

import {
  ArrowRight,
  BellRing,
  Box,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Dumbbell,
  Film,
  HeartPulse,
  Layers3,
  LockKeyhole,
  Mail,
  MapPinned,
  Megaphone,
  MessageCircleMore,
  PackageOpen,
  Radio,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
  Trophy,
  UserRoundCheck,
  UsersRound,
  Watch,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type CSSProperties, useEffect, useRef } from "react";
import {
  clubFeatureByKey,
  clubFeatureGroups,
  clubFeatures,
  relatedClubFeatures,
  type ClubFeaturePageData,
  type ClubFeatureVisualKind,
} from "@/lib/club-features";
import { DUNA_HQ_URL } from "@/lib/site-urls";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import styles from "./club-feature-page.module.css";

const iconByKey: Readonly<Record<string, LucideIcon>> = {
  products: Store,
  "products/services": CalendarDays,
  "products/plans": Layers3,
  "products/goods-equipment": ShoppingBag,
  "team-management": UserRoundCheck,
  people: UsersRound,
  events: Trophy,
  leagues: Trophy,
  venues: MapPinned,
  training: Dumbbell,
  money: CircleDollarSign,
  marketing: Megaphone,
  messaging: MessageCircleMore,
  "safety-privacy": ShieldCheck,
  "coach-video": Film,
  "duna-pro-watch": Watch,
};

type FeatureSceneIndex = 0 | 1 | 2;

function featureSceneIndex(scene: number): FeatureSceneIndex {
  if (scene % 3 === 1) return 1;
  if (scene % 3 === 2) return 2;
  return 0;
}

function useFeaturePageMotion() {
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const reveals = page.querySelectorAll<HTMLElement>("[data-feature-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.visible = "true";
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8%", threshold: 0.08 },
    );
    reveals.forEach((element) => observer.observe(element));

    if (reducedMotion) {
      page.dataset.reducedMotion = "true";
      return () => observer.disconnect();
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const hero = page.querySelector<HTMLElement>("[data-feature-hero]");
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      const progress = Math.min(
        1,
        Math.max(0, -rect.top / Math.max(1, rect.height)),
      );
      page.style.setProperty("--feature-scroll", progress.toFixed(4));
      page.dataset.scrolled = window.scrollY > 72 ? "true" : "false";
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return pageRef;
}

function ProductBuilderVisual({
  kind,
  scene = 0,
}: {
  readonly kind: ClubFeatureVisualKind;
  readonly scene?: number;
}) {
  const isService = kind === "services";
  const isPlan = kind === "plans";
  const isInventory = kind === "inventory";
  const sceneIndex = featureSceneIndex(scene);
  const productTitles = isService
    ? ["First-ball assessment", "Tuesday private lesson", "Player follow-up"]
    : isPlan
      ? ["Season training pass", "Member access rules", "8 credits available"]
      : ["Complete club offer", "Customer-facing story", "Fulfillment ready"];
  const productChoices = isService
    ? [
        ["Outcome", "Coach", "Schedule"],
        ["Availability", "Court", "Intake"],
        ["Check-in", "Notes", "Next step"],
      ]
    : isPlan
      ? [
          ["Access", "Credits", "Billing"],
          ["Benefits", "Priority", "Eligibility"],
          ["Balance", "Renewal", "History"],
        ]
      : [
          ["Story", "Pricing", "Delivery"],
          ["Outcomes", "Media", "Proof"],
          ["Order", "Inventory", "Access"],
        ];
  const productDetails = isService
    ? [
        "See how a player moves, then leave with the next three priorities.",
        "Jordan is available, Court 2 is attached, and intake is complete.",
        "Check-in, private notes, and the next recommendation share the booking.",
      ]
    : isPlan
      ? [
          "Eight sessions, member booking access, and one assessment.",
          "Member pricing and priority windows now follow the player.",
          "Every redemption, grant, renewal, and adjustment stays visible.",
        ]
      : [
          "Build the value, rules, price, and customer experience together.",
          "Outcomes, media, proof, and clear terms appear before checkout.",
          "The purchase now knows what should be booked, granted, or moved.",
        ];
  const inventoryScenes = [
    {
      title: "Match balls · 24",
      detail: "Received · South Bay",
      state: "Counted",
      rows: [
        ["Unit cost", "$31.50", "24 received"],
        ["Tax context", "Sporting goods", "Ready"],
        ["Available", "24", "2 reserved"],
      ],
    },
    {
      title: "Coach kit · 12",
      detail: "Court 3 · Jordan Cruz",
      state: "Checked out",
      rows: [
        ["Coach checkout", "−12", "Jordan Cruz"],
        ["Due back", "Friday", "After practice"],
        ["Available", "12", "2 reserved"],
      ],
    },
    {
      title: "Inventory close",
      detail: "Movement and cost history",
      state: "Export ready",
      rows: [
        ["On hand", "$4,862", "Recorded cost"],
        ["Sold", "$1,240", "Tax attached"],
        ["In custody", "18 assets", "Named owners"],
      ],
    },
  ] as const;
  const inventoryScene = inventoryScenes[sceneIndex];
  return (
    <div
      className={styles.builderVisual}
      data-kind={kind}
      data-scene={sceneIndex}
    >
      <header>
        <span>
          <Sparkles aria-hidden size={15} /> Duna HQ
        </span>
        <small>
          {isService
            ? "Service builder"
            : isPlan
              ? "Plan builder"
              : isInventory
                ? "Inventory"
                : "Product builder"}
        </small>
      </header>
      {isInventory ? (
        <div className={styles.inventoryVisual}>
          <div>
            <Box aria-hidden />
            <span>
              <strong>{inventoryScene.title}</strong>
              <small>{inventoryScene.detail}</small>
            </span>
            <b>{inventoryScene.state}</b>
          </div>
          {inventoryScene.rows.map(([label, value, detail]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className={styles.builderProgress} aria-label="Builder progress">
            <i /> <i /> <i /> <i />
          </div>
          <div className={styles.builderColumns}>
            <section>
              <small>What are you crafting?</small>
              <h3>{productTitles[sceneIndex]}</h3>
              <div className={styles.builderChoiceRow}>
                {productChoices[sceneIndex]!.map((label, index) => (
                  <span data-active={index === 0} key={label}>
                    {label}
                  </span>
                ))}
              </div>
              <p>{productDetails[sceneIndex]}</p>
            </section>
            <aside>
              <small>
                {sceneIndex === 0
                  ? "Customer preview"
                  : sceneIndex === 1
                    ? "Connected state"
                    : "Ready for the day"}
              </small>
              <strong>
                {sceneIndex === 2
                  ? isService
                    ? "Checked in"
                    : isPlan
                      ? "8 credits"
                      : "Fulfillment live"
                  : isService
                    ? "$95"
                    : isPlan
                      ? "$420"
                      : "Ready to publish"}
              </strong>
              <p>
                {isPlan
                  ? "6 monthly payments or save with upfront"
                  : "Clear terms before checkout"}
              </p>
              <button type="button">Review offer</button>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function PeopleTeamVisual({
  kind,
  scene = 0,
}: {
  readonly kind: "team" | "people";
  readonly scene?: number;
}) {
  const people = kind === "people";
  const sceneIndex = featureSceneIndex(scene);
  const peopleRows = [
    [
      ["Maya Rivera", "Goal · stronger first contact", "Shared"],
      ["Mara Lewis", "Guardian connected", "Ready"],
      ["Theo Park", "Check-in · private", "Private"],
    ],
    [
      ["Maya Rivera", "Training pass · 5 credits", "Active"],
      ["Mara Lewis", "Waiver · guardian signed", "Current"],
      ["Theo Park", "Tuesday lesson · checked in", "Here"],
    ],
    [
      ["Maya Rivera", "Health summary · shared", "Revocable"],
      ["Mara Lewis", "Video review · granted", "Private"],
      ["Theo Park", "Next goal · coach review", "Open"],
    ],
  ] as const;
  const teamRows = [
    [
      ["Jordan Cruz", "Private lessons · 14h", "Available"],
      ["Maya Rivera", "Youth program · 8h", "Assigned"],
      ["Drew Park", "Open play · 6h", "Review"],
    ],
    [
      ["Jordan Cruz", "Court 2 · 4:00 PM", "Checked in"],
      ["Maya Rivera", "Court 1 · 4:30 PM", "Taking payment"],
      ["Drew Park", "Court 4 · 6:00 PM", "Notes due"],
    ],
    [
      ["Jordan Cruz", "14h · private lessons", "Approved"],
      ["Maya Rivera", "8h · youth program", "Profit share"],
      ["Drew Park", "6h · open play", "Review"],
    ],
  ] as const;
  const rows = (people ? peopleRows : teamRows)[sceneIndex];
  return (
    <div className={styles.peopleVisual} data-scene={sceneIndex}>
      <header>
        <span>{people ? "People" : "Team"}</span>
        <small>
          {people
            ? ["Relationship context", "Current activity", "Sharing controls"][
                sceneIndex
              ]
            : ["This week", "Today in Duna Pro", "Hours and compensation"][
                sceneIndex
              ]}
        </small>
      </header>
      {rows.map(([name, detail, state], index) => (
        <article key={name}>
          <i>
            {name
              .split(" ")
              .map((part) => part[0])
              .join("")}
          </i>
          <span>
            <strong>{name}</strong>
            <small>{detail}</small>
          </span>
          <b data-state={index}>{state}</b>
        </article>
      ))}
      <footer>
        {people ? <HeartPulse aria-hidden /> : <Smartphone aria-hidden />}
        <span>
          <strong>
            {people
              ? [
                  "One relationship, every useful signal",
                  "Activity stays attached to the person",
                  "Sharing stays player-controlled",
                ][sceneIndex]
              : [
                  "Availability meets scheduled work",
                  "Duna Pro keeps the day in reach",
                  "Every hour keeps its source",
                ][sceneIndex]}
          </strong>
          <small>
            {people
              ? [
                  "Players, parents, goals, and participation in context.",
                  "Plans, attendance, notes, and purchases move together.",
                  "Health summaries can be revoked at any time.",
                ][sceneIndex]
              : [
                  "Profiles, roles, availability, and assignments.",
                  "Check-in, payments, notes, and exceptions.",
                  "Administrative models remain reviewable before payroll.",
                ][sceneIndex]}
          </small>
        </span>
      </footer>
    </div>
  );
}

function OperationsVisual({
  kind,
  scene = 0,
}: {
  readonly kind: "events" | "leagues" | "venues" | "training";
  readonly scene?: number;
}) {
  const sceneIndex = featureSceneIndex(scene);
  if (kind === "venues") {
    const venueScenes = [
      {
        utilization: "68% utilized",
        courts: [
          "Lesson · 4 PM",
          "Rental · 5 PM",
          "League · 6 PM",
          "Open · 6 PM",
        ],
        footer: "Rentals, services, and events share the same court truth.",
      },
      {
        utilization: "4 settings live",
        courts: [
          "Lights · 9 PM",
          "Member priority",
          "Blocked · repair",
          "Public rental",
        ],
        footer: "Court rules stay visible wherever someone books the place.",
      },
      {
        utilization: "$1,840 this week",
        courts: [
          "82% utilized",
          "74% utilized",
          "61% utilized",
          "48% utilized",
        ],
        footer: "Utilization connects time, product, revenue, and demand.",
      },
    ] as const;
    const venueScene = venueScenes[sceneIndex];
    return (
      <div className={styles.venueVisual} data-scene={sceneIndex}>
        <header>
          <span>South Bay Beach Club</span>
          <strong>{venueScene.utilization}</strong>
        </header>
        <div className={styles.courtMap}>
          {["Court 1", "Court 2", "Court 3", "Court 4"].map((court, index) => (
            <article data-use={index} key={court}>
              <span>{court}</span>
              <small>{venueScene.courts[index]}</small>
            </article>
          ))}
        </div>
        <footer>
          <MapPinned aria-hidden />
          <span>{venueScene.footer}</span>
        </footer>
      </div>
    );
  }
  if (kind === "training") {
    const trainingTitles = [
      "Sideout under pressure",
      "First-ball Sideout Lab",
      "Atlantic Coast Open taper",
    ];
    return (
      <div className={styles.trainingVisual} data-scene={sceneIndex}>
        <header>
          <span>
            {
              ["Fall Competition Build", "Tuesday practice", "Load view"][
                sceneIndex
              ]
            }
          </span>
          <small>
            {
              ["Week 4 of 8", "90 min · 2 courts", "Tournament in 12 days"][
                sceneIndex
              ]
            }
          </small>
        </header>
        <div className={styles.weekStrip}>
          {[58, 68, 74, 61, 80, 72, 54, 40].map((load, index) => (
            <i
              data-current={index === [3, 4, 6][sceneIndex]}
              key={index}
              style={{ "--load": `${load}%` } as CSSProperties}
            >
              <span>{index + 1}</span>
            </i>
          ))}
        </div>
        <article>
          <Dumbbell aria-hidden />
          <span>
            <strong>{trainingTitles[sceneIndex]}</strong>
            <small>
              {
                [
                  "90 min · 2 courts · load estimate visible",
                  "6 drills · animation and coaching cues attached",
                  "Volume steps down while intensity stays specific",
                ][sceneIndex]
              }
            </small>
          </span>
          <b>{["Tue", "Run", "Ready"][sceneIndex]}</b>
        </article>
      </div>
    );
  }
  if (kind === "leagues") {
    const leagueScenes = [
      {
        title: "Tuesday Night League",
        detail: "Week 6",
        teams: ["Sand Shift", "Net Results", "High Line", "Sideout Club"],
        records: ["5–1", "4–2", "4–2", "3–3"],
      },
      {
        title: "Tonight's schedule",
        detail: "4 courts · 6:00 PM",
        teams: ["Court 1", "Court 2", "Court 3", "Court 4"],
        records: ["Ready", "Ready", "Moved", "Warmup"],
      },
      {
        title: "Season standings",
        detail: "Playoffs in 2 weeks",
        teams: ["Sand Shift", "Net Results", "High Line", "Sideout Club"],
        records: ["Clinched", "+18 pts", "+12 pts", "In chase"],
      },
    ] as const;
    const leagueScene = leagueScenes[sceneIndex];
    return (
      <div className={styles.leagueVisual} data-scene={sceneIndex}>
        <header>
          <span>{leagueScene.title}</span>
          <small>{leagueScene.detail}</small>
        </header>
        {leagueScene.teams.map((team, index) => (
          <article key={team}>
            <b>{index + 1}</b>
            <span>
              <strong>{team}</strong>
              <small>{leagueScene.records[index]}</small>
            </span>
            <i
              style={
                {
                  "--standing": `${[92, 78, 70, 56][index]}%`,
                } as CSSProperties
              }
            />
          </article>
        ))}
      </div>
    );
  }
  const eventScenes = [
    {
      title: "Junior Showcase",
      count: "42 / 48",
      cards: [
        ["Registration", "6 spots", "Waivers follow purchase"],
        ["Courts", "4 ready", "Staffing attached"],
      ],
      active: 2,
    },
    {
      title: "Event day",
      count: "38 here",
      cards: [
        ["Check-in", "38 players", "4 arrivals pending"],
        ["Draw", "12 matches", "Courts assigned"],
      ],
      active: 3,
    },
    {
      title: "Results published",
      count: "12 final",
      cards: [
        ["Champion", "Rivera / Park", "Podium and rating linked"],
        ["Follow-up", "42 players", "Media and next event ready"],
      ],
      active: 4,
    },
  ] as const;
  const eventScene = eventScenes[sceneIndex];
  return (
    <div className={styles.eventVisual} data-scene={sceneIndex}>
      <header>
        <span>{eventScene.title}</span>
        <b>{eventScene.count}</b>
      </header>
      <div>
        {eventScene.cards.map(([label, value, detail]) => (
          <article key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
            <span>{detail}</span>
          </article>
        ))}
      </div>
      <footer>
        {["Publish", "Register", "Check in", "Score"].map((label, index) => (
          <span data-active={index < eventScene.active} key={label}>
            <Check aria-hidden /> {label}
          </span>
        ))}
      </footer>
    </div>
  );
}

function GrowthVisual({
  kind,
  scene = 0,
}: {
  readonly kind: "money" | "marketing" | "messaging" | "safety";
  readonly scene?: number;
}) {
  const sceneIndex = featureSceneIndex(scene);
  if (kind === "money") {
    const moneyScenes = [
      {
        label: "Today",
        value: "$4,280",
        title: "Order → payment → fulfillment",
        detail: "Every state keeps its source.",
      },
      {
        label: "Private lesson · #1842",
        value: "$95.00",
        title: "Payment traced to the session",
        detail: "Fee, refund, coach, and venue context remain attached.",
      },
      {
        label: "Ready to reconcile",
        value: "$18,420",
        title: "The report explains the total",
        detail: "Products, tax, credits, fees, payouts, and cost are visible.",
      },
    ] as const;
    const moneyScene = moneyScenes[sceneIndex];
    return (
      <div className={styles.moneyVisual} data-scene={sceneIndex}>
        <header>
          <span>{moneyScene.label}</span>
          <strong>{moneyScene.value}</strong>
        </header>
        <div className={styles.moneyBars}>
          {[42, 64, 48, 78, 58, 91, 72].map((height, index) => (
            <i key={index} style={{ "--bar": `${height}%` } as CSSProperties} />
          ))}
        </div>
        <article>
          <CheckCircle2 aria-hidden />
          <span>
            <strong>{moneyScene.title}</strong>
            <small>{moneyScene.detail}</small>
          </span>
        </article>
      </div>
    );
  }
  if (kind === "marketing") {
    const marketingScenes = [
      [
        ["Audience", "Members with credits expiring"],
        ["Reason", "Balance reaches zero in 14 days"],
        ["Review", "Operator confirms the audience"],
      ],
      [
        ["Message", "Book your next court"],
        ["Channels", "Email · SMS · Duna Player"],
        ["Approval", "Operator reviews and sends"],
      ],
      [
        ["Journey", "Return to training"],
        ["Response", "12 bookings connected"],
        ["Next step", "Audience updates from activity"],
      ],
    ] as const;
    return (
      <div className={styles.flowVisual} data-scene={sceneIndex}>
        <header>
          <Sparkles aria-hidden />
          <span>
            {
              [
                "Build the audience",
                "Duna AI · draft for review",
                "See the response",
              ][sceneIndex]
            }
          </span>
        </header>
        {marketingScenes[sceneIndex].map(([label, value], index) => (
          <article key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
            <i data-done={index < 2}>
              {index < 2 ? <Check aria-hidden /> : index + 1}
            </i>
          </article>
        ))}
      </div>
    );
  }
  if (kind === "messaging") {
    const messageScenes = [
      {
        title: "Tuesday Night League",
        count: "18 participants",
        left: "Court 3 is closed. Tonight's first round moves to Court 1.",
        right: "Got it. Does our 6:40 start stay the same?",
      },
      {
        title: "Maya Rivera · private lesson",
        count: "Guardian covered",
        left: "I added the three first-contact clips from today's session.",
        right: "Thanks. Mara can see them too.",
      },
      {
        title: "Delivery review",
        count: "18 of 18 reached",
        left: "League update delivered with the schedule context attached.",
        right: "Email, push, and in-app state agree.",
      },
    ] as const;
    const messageScene = messageScenes[sceneIndex];
    return (
      <div className={styles.messageVisual} data-scene={sceneIndex}>
        <header>
          <span>{messageScene.title}</span>
          <small>{messageScene.count}</small>
        </header>
        <article data-side="left">{messageScene.left}</article>
        <article data-side="right">{messageScene.right}</article>
        <footer>
          {[
            [Mail, "Email"],
            [MessageCircleMore, "In-app"],
            [BellRing, "Push"],
          ].map(([Icon, label]) => {
            const ChannelIcon = Icon as LucideIcon;
            return (
              <span key={label as string}>
                <ChannelIcon aria-hidden /> {label as string}
              </span>
            );
          })}
        </footer>
      </div>
    );
  }
  const safetyScenes = [
    [
      ["Guardian relationship", "Verified adult"],
      ["Youth messaging", "Coverage confirmed"],
      ["Pickup authority", "Named people only"],
      ["Emergency context", "Scoped to the event"],
    ],
    [
      ["Summer waiver · v3", "Exact text preserved"],
      ["Guardian signature", "Receipt attached"],
      ["Teen acknowledgement", "Complete"],
      ["Renewal rule", "Re-consent required"],
    ],
    [
      ["Profile visibility", "Player controlled"],
      ["Health sharing", "Revocable summary"],
      ["Video access", "Named viewers"],
      ["Guest access", "Expires after event"],
    ],
  ] as const;
  return (
    <div className={styles.safetyVisual} data-scene={sceneIndex}>
      <header>
        <ShieldCheck aria-hidden />
        <span>
          {
            ["Guardian authority", "Waiver evidence", "Privacy in use"][
              sceneIndex
            ]
          }
        </span>
      </header>
      {safetyScenes[sceneIndex].map(([label, detail], index) => (
        <article key={label}>
          <span>
            <strong>{label}</strong>
            <small>{detail}</small>
          </span>
          {index === 3 ? (
            <LockKeyhole aria-hidden />
          ) : (
            <CheckCircle2 aria-hidden />
          )}
        </article>
      ))}
    </div>
  );
}

function VisionWatchVisual({
  kind,
  scene = 0,
}: {
  readonly kind: "vision" | "watch";
  readonly scene?: number;
}) {
  const sceneIndex = featureSceneIndex(scene);
  if (kind === "watch") {
    const watchScenes = [
      {
        label: "DRILL 03",
        value: "02:18",
        center: "Side score",
        action: "Tag rally",
        cue: "Cue saved to session",
      },
      {
        label: "COURT 2",
        value: "6  ·  4",
        center: "Set 1",
        action: "Point +",
        cue: "Score synced to Duna Pro",
      },
      {
        label: "RALLY 14",
        value: "00:42",
        center: "Review cue",
        action: "Favorite",
        cue: "Moment linked to Duna Vision",
      },
    ] as const;
    const watchScene = watchScenes[sceneIndex];
    return (
      <div className={styles.watchVisual} data-scene={sceneIndex}>
        <div className={styles.watchCase}>
          <div className={styles.watchFace}>
            <small>{watchScene.label}</small>
            <strong>{watchScene.value}</strong>
            <span>
              <b>6</b>
              <i>{watchScene.center}</i>
              <b>4</b>
            </span>
            <button type="button">
              <Radio aria-hidden /> {watchScene.action}
            </button>
          </div>
        </div>
        <span className={styles.watchCue}>
          <Check aria-hidden /> {watchScene.cue}
        </span>
      </div>
    );
  }
  return (
    <div className={styles.visionVisual} data-scene={sceneIndex}>
      <header>
        <span>
          <Radio aria-hidden /> Duna Vision
        </span>
        <small>
          {["Practice · private", "Timeline review", "Share grant"][sceneIndex]}
        </small>
      </header>
      <div className={styles.visionCourt}>
        <i />
        <i />
        <i />
        <i />
        <span>
          {
            [
              "Visible court · calibrated",
              "Rally boundaries · reviewed",
              "Private clip · player granted",
            ][sceneIndex]
          }
        </span>
      </div>
      <div className={styles.visionTimeline}>
        <b />
        <i style={{ left: "22%" }} />
        <i style={{ left: "48%" }} />
        <i style={{ left: "76%" }} />
      </div>
      <footer>
        <strong>
          {
            [
              "Court calibration ready",
              "Flagged rally · 14:32",
              "Maya Rivera · private review",
            ][sceneIndex]
          }
        </strong>
        <span>
          {
            [
              "Start source-linked capture",
              "Open source-linked review",
              "Access expires with the grant",
            ][sceneIndex]
          }
        </span>
      </footer>
    </div>
  );
}

function FeatureVisual({
  kind,
  scene = 0,
}: {
  readonly kind: ClubFeatureVisualKind;
  readonly scene?: number;
}) {
  switch (kind) {
    case "products":
    case "services":
    case "plans":
    case "inventory":
      return <ProductBuilderVisual kind={kind} scene={scene} />;
    case "team":
    case "people":
      return <PeopleTeamVisual kind={kind} scene={scene} />;
    case "events":
    case "leagues":
    case "venues":
    case "training":
      return <OperationsVisual kind={kind} scene={scene} />;
    case "money":
    case "marketing":
    case "messaging":
    case "safety":
      return <GrowthVisual kind={kind} scene={scene} />;
    case "vision":
    case "watch":
      return <VisionWatchVisual kind={kind} scene={scene} />;
  }
}

function FeatureProductStory({
  feature,
  Icon,
}: {
  readonly feature: ClubFeaturePageData;
  readonly Icon: LucideIcon;
}) {
  return (
    <div className={styles.productStories} id="product-tour">
      {feature.journey.map((step, index) => {
        const supportingCapabilities = feature.capabilities.slice(
          index * 2,
          index * 2 + 2,
        );
        return (
          <article
            className={styles.productStory}
            data-feature-reveal
            data-scene={index}
            key={step.title}
          >
            <div
              aria-label={`${feature.navLabel}: ${step.title} product view`}
              className={styles.productStoryStage}
            >
              {index === 1 ? (
                <Image
                  alt=""
                  fill
                  sizes="(max-width: 900px) 100vw, 58vw"
                  src={feature.image}
                />
              ) : null}
              <div className={styles.productStoryWash} />
              <div className={styles.productStoryChrome}>
                <header>
                  <span>
                    <i /> <i /> <i />
                  </span>
                  <strong>Duna HQ</strong>
                  <small>{feature.navLabel}</small>
                </header>
                <FeatureVisual kind={feature.visual} scene={index} />
              </div>
              <div className={styles.productStorySignal}>
                <CheckCircle2 aria-hidden size={17} />
                <span>
                  <small>
                    {index === 0
                      ? "Built with context"
                      : index === 1
                        ? "Connected to the day"
                        : "History carried forward"}
                  </small>
                  <strong>{supportingCapabilities[0]?.title}</strong>
                </span>
              </div>
              <i className={styles.productStoryTrace} />
            </div>
            <div className={styles.productStoryCopy}>
              <span>
                <Icon aria-hidden size={18} />
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <ul>
                {supportingCapabilities.map((capability) => (
                  <li key={capability.title}>
                    <Check aria-hidden size={16} />
                    <span>
                      <strong>{capability.title}</strong>
                      <small>{capability.description}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function FeatureProductNav() {
  return (
    <nav aria-label="Duna HQ features" className={styles.productNav}>
      <Link className={styles.productIdentity} href="/run-your-club/features">
        <span>Duna</span>
        <strong>HQ Features</strong>
      </Link>
      <div>
        <Link href="#problem">The problem</Link>
        <Link href="#solution">The solution</Link>
        <Link href="#product-tour">Product tour</Link>
        <Link href="#capabilities">Capabilities</Link>
      </div>
      <a className={styles.productCta} href={DUNA_HQ_URL}>
        Start for $0
      </a>
    </nav>
  );
}

export function ClubFeaturePage({
  feature,
}: {
  readonly feature: ClubFeaturePageData;
}) {
  const pageRef = useFeaturePageMotion();
  const related = relatedClubFeatures(feature);
  const Icon = iconByKey[feature.key] ?? PackageOpen;

  return (
    <main
      className={styles.page}
      data-accent={feature.accent}
      data-zone="editorial"
      ref={pageRef}
    >
      <SiteHeader />
      <FeatureProductNav />

      <section className={styles.hero} data-feature-hero>
        <div className={styles.heroImage}>
          <Image
            alt={feature.imageAlt}
            fill
            loading="eager"
            priority
            sizes="(max-width: 900px) 100vw, 58vw"
            src={feature.image}
          />
          <div className={styles.heroImageVeil} />
        </div>
        <div className={styles.heroCopy}>
          <div className={styles.breadcrumb}>
            <Link href="/run-your-club">Run your club</Link>
            <span>/</span>
            <Link href="/run-your-club/features">Features</Link>
            <span>/</span>
            <b>{feature.navLabel}</b>
          </div>
          <span className={styles.eyebrow}>
            <Icon aria-hidden size={15} /> {feature.eyebrow}
          </span>
          <h1>{feature.title}</h1>
          <p>{feature.summary}</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href={DUNA_HQ_URL}>
              Start for $0 <ArrowRight aria-hidden />
            </a>
            <a className={styles.secondaryAction} href="#problem">
              See how it works <ChevronDown aria-hidden />
            </a>
          </div>
        </div>
        <div
          className={styles.heroProduct}
          aria-label={`${feature.navLabel} product preview`}
        >
          <FeatureVisual kind={feature.visual} />
        </div>
        <dl className={styles.outcomeShelf}>
          {feature.outcomes.map((outcome) => (
            <div key={outcome.label}>
              <dt>{outcome.value}</dt>
              <dd>{outcome.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.problem} id="problem">
        <div data-feature-reveal>
          <span className={styles.eyebrow}>The problem</span>
          <h2>{feature.problemTitle}</h2>
        </div>
        <div data-feature-reveal>
          <p>{feature.problem}</p>
          <ul>
            {feature.problemSignals.map((signal) => (
              <li key={signal}>
                <span />
                <strong>{signal}</strong>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.solution} id="solution">
        <div className={styles.solutionHeading} data-feature-reveal>
          <span className={styles.eyebrow}>The Duna difference</span>
          <h2>{feature.solutionTitle}</h2>
          <p>{feature.solution}</p>
        </div>
        <FeatureProductStory Icon={Icon} feature={feature} />
      </section>

      <section className={styles.capabilities} id="capabilities">
        <header data-feature-reveal>
          <span className={styles.eyebrow}>Capabilities</span>
          <h2>Deep enough for the operation. Clear enough for the day.</h2>
        </header>
        <div>
          {feature.capabilities.map((capability, index) => (
            <article data-feature-reveal key={capability.title}>
              <span>
                <Icon aria-hidden />
                <b>{String(index + 1).padStart(2, "0")}</b>
              </span>
              <h3>{capability.title}</h3>
              <p>{capability.description}</p>
            </article>
          ))}
        </div>
      </section>

      {feature.statusNote ? (
        <aside className={styles.statusNote} data-feature-reveal>
          <Watch aria-hidden />
          <span>
            <strong>Release note</strong>
            <p>{feature.statusNote}</p>
          </span>
          <Link href="/apps/apple-watch">
            See Duna on Apple Watch <ArrowRight aria-hidden />
          </Link>
        </aside>
      ) : null}

      <section className={styles.related}>
        <header data-feature-reveal>
          <span className={styles.eyebrow}>Connected by design</span>
          <h2>The next feature already has the context.</h2>
        </header>
        <div>
          {related.map((item) => {
            const RelatedIcon = iconByKey[item.key] ?? PackageOpen;
            return (
              <Link data-feature-reveal href={item.href} key={item.key}>
                <RelatedIcon aria-hidden />
                <span>
                  <small>{item.category}</small>
                  <h3>{item.navLabel}</h3>
                  <p>{item.navDescription}</p>
                </span>
                <ArrowRight aria-hidden />
              </Link>
            );
          })}
        </div>
      </section>

      <section className={styles.closing}>
        <div data-feature-reveal>
          <span className={styles.eyebrow}>Duna HQ</span>
          <h2>Run the operation without losing the human story.</h2>
          <p>
            Start with one coach, one venue, one product, or one event. Keep the
            same people, places, permissions, and history as the club grows.
          </p>
          <div>
            <a className={styles.primaryAction} href={DUNA_HQ_URL}>
              Start for $0 <ArrowRight aria-hidden />
            </a>
            <Link
              className={styles.secondaryAction}
              href="/run-your-club/features"
            >
              Explore all features
            </Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

export function ClubFeaturesHub() {
  const pageRef = useFeaturePageMotion();
  return (
    <main
      className={`${styles.page} ${styles.hub}`}
      data-accent="signal"
      data-zone="editorial"
      ref={pageRef}
    >
      <SiteHeader />
      <nav aria-label="Duna HQ features" className={styles.productNav}>
        <Link className={styles.productIdentity} href="/run-your-club">
          <span>Duna</span>
          <strong>HQ</strong>
        </Link>
        <div>
          {clubFeatureGroups.map((group) => (
            <a
              href={`#${group.label.toLowerCase().replaceAll(" ", "-")}`}
              key={group.label}
            >
              {group.label}
            </a>
          ))}
        </div>
        <a className={styles.productCta} href={DUNA_HQ_URL}>
          Start for $0
        </a>
      </nav>

      <section className={styles.hubHero} data-feature-hero>
        <div className={styles.hubHeroMedia}>
          <Image
            alt="Volleyball courts prepared before a club day begins"
            fill
            loading="eager"
            priority
            sizes="100vw"
            src="/media/brand/duna-club-hero-v1.webp"
          />
          <div />
        </div>
        <div className={styles.hubHeroCopy}>
          <span className={styles.eyebrow}>Duna HQ features</span>
          <h1>The whole club. One connected operating story.</h1>
          <p>
            Build what you sell. Run the day. Know your people. Grow with
            control. Every feature shares the same products, places,
            relationships, permissions, and evidence.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href={DUNA_HQ_URL}>
              Start for $0 <ArrowRight aria-hidden />
            </a>
            <a className={styles.secondaryAction} href="#build-the-offer">
              Explore the system <ChevronDown aria-hidden />
            </a>
          </div>
        </div>
        <div className={styles.hubOrbit} aria-hidden>
          {clubFeatures.slice(0, 8).map((item) => {
            const ItemIcon = iconByKey[item.key] ?? PackageOpen;
            return (
              <span key={item.key}>
                <ItemIcon />
                <b>{item.navLabel}</b>
              </span>
            );
          })}
          <i>
            <Store />
            <strong>Duna HQ</strong>
            <small>Everything connected</small>
          </i>
        </div>
      </section>

      <section className={styles.hubStatement}>
        <p>Most software starts with modules.</p>
        <h2>Duna starts with the work, then keeps the context moving.</h2>
      </section>

      {clubFeatureGroups.map((group, groupIndex) => {
        const groupFeatures = group.keys.flatMap((key) => {
          const item = clubFeatureByKey.get(key);
          return item ? [item] : [];
        });
        return (
          <section
            className={styles.featureGroup}
            data-group={groupIndex}
            id={group.label.toLowerCase().replaceAll(" ", "-")}
            key={group.label}
          >
            <header data-feature-reveal>
              <span className={styles.eyebrow}>{group.label}</span>
              <h2>{group.description}</h2>
            </header>
            <div>
              {groupFeatures.map((item, index) => {
                const ItemIcon = iconByKey[item.key] ?? PackageOpen;
                return (
                  <Link
                    className={styles.featureCard}
                    data-feature-reveal
                    data-wide={index === 0 && groupIndex === 0}
                    href={item.href}
                    key={item.key}
                  >
                    <div className={styles.featureCardImage}>
                      <Image
                        alt=""
                        fill
                        sizes="(max-width: 760px) 100vw, 38vw"
                        src={item.image}
                      />
                      <span />
                    </div>
                    <div>
                      <span>
                        <ItemIcon aria-hidden />
                        <small>{item.eyebrow}</small>
                      </span>
                      <h3>{item.title}</h3>
                      <p>{item.navDescription}</p>
                      <strong>
                        Explore feature <ArrowRight aria-hidden />
                      </strong>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className={styles.hubConnection}>
        <div data-feature-reveal>
          <span className={styles.eyebrow}>One operating model</span>
          <h2>
            A booking can become a relationship, payment, session, video,
            result, and next decision without being entered again.
          </h2>
        </div>
        <div
          aria-label="Connected Duna workflow"
          className={styles.connectionRail}
        >
          {[
            "Product",
            "Booking",
            "Person",
            "Session",
            "Money",
            "Next step",
          ].map((label, index) => (
            <span key={label}>
              <b>{index + 1}</b>
              <strong>{label}</strong>
              {index < 5 ? (
                <ArrowRight aria-hidden />
              ) : (
                <CheckCircle2 aria-hidden />
              )}
            </span>
          ))}
        </div>
      </section>

      <section className={styles.closing}>
        <div data-feature-reveal>
          <span className={styles.eyebrow}>Duna HQ</span>
          <h2>Start where the pressure is today.</h2>
          <p>
            Add the next part when it helps. The people, places, permissions,
            and history are already there.
          </p>
          <div>
            <a className={styles.primaryAction} href={DUNA_HQ_URL}>
              Start for $0 <ArrowRight aria-hidden />
            </a>
            <Link className={styles.secondaryAction} href="/run-your-club">
              See Duna for clubs
            </Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
