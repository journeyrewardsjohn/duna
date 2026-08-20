"use client";

import { Numeric } from "@duna/ui";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  CreditCard,
  Dumbbell,
  HeartPulse,
  LayoutDashboard,
  MapPinned,
  Megaphone,
  MessageSquareText,
  PackageOpen,
  Palette,
  Play,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trophy,
  UserRoundCheck,
  UsersRound,
  Video,
  WalletCards,
  WifiOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { ProfileAvatar, ProfileAvatarStack } from "./profile-avatar-stack";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { marketingPeople, marketingPlayerGroup } from "@/lib/marketing-people";
import styles from "./run-your-business-page.module.css";

export interface OrganizationMarketingPlan {
  readonly id: string;
  readonly name: string;
  readonly productName: string;
  readonly tagline: string;
  readonly monthlyPrice: string;
  readonly annualPrice: string;
  readonly organizationFeePercent: number;
  readonly monthlyUploadHours: number;
  readonly monthlyLiveHours: number;
  readonly features: readonly string[];
}

interface RunYourBusinessPageProps {
  readonly hqHref: string;
  readonly plans: readonly OrganizationMarketingPlan[];
}

const clubStories = [
  {
    id: "club-operations",
    eyebrow: "Courts + capacity",
    title: "See the whole day before it starts.",
    body: "Schedule courts, coaches, equipment, rentals, lessons, clinics, and open play in one operating view. Smart rules protect every booking window, waitlist, and cancellation.",
    proof: [
      "Multi-venue schedule",
      "Court and equipment inventory",
      "Availability, holds, and waitlists",
    ],
  },
  {
    id: "club-people",
    eyebrow: "Staff + families",
    title: "Give every person the right context.",
    body: "Coordinate coaches, operators, players, parents, and guardians without flattening them into one contact list. Roles stay scoped and family communication follows verified permissions.",
    proof: [
      "Coach roles and availability",
      "Member history and balances",
      "Guardian-safe communication",
    ],
  },
  {
    id: "club-commerce",
    eyebrow: "Memberships + money",
    title: "Sell the way your club actually works.",
    body: "Offer memberships, credit packs, lessons, leagues, rentals, events, goods, and equipment. Keep checkout, retries, refunds, credits, payouts, and the ledger connected.",
    proof: [
      "Memberships, packages, and bundles",
      "Payments, credits, and refunds",
      "Inventory cost and order history",
    ],
  },
  {
    id: "club-growth",
    eyebrow: "Reports + court intelligence",
    title: "Turn operating truth—and court evidence—into the next full court.",
    body: "Read utilization, revenue, retention, offer health, and permissioned Duna Vision review by court, coach, and program. Court maps, rallies, and video observations stay source-linked and confidence-labeled, so staff can see what is measured, what was reviewed, and what still needs a human call.",
    proof: [
      "Court, coach, and program reporting",
      "Consent-aware Duna Vision review",
      "Visible-court maps with confidence",
      "Consent-aware campaigns",
      "Reviewable operational and coaching suggestions",
    ],
  },
] as const;

const coachStories = [
  {
    id: "coach-day",
    eyebrow: "On the go",
    title: "Your day stays in your hand.",
    body: "See the next lesson, protect travel time, check players in, send an update, and capture a private coaching note without reopening the laptop between courts.",
    proof: ["Mobile calendar", "Arrival and check-in", "Private session notes"],
  },
  {
    id: "coach-commerce",
    eyebrow: "Offers + payments",
    title: "Sell more than one-off lessons.",
    body: "Publish private coaching, groups, clinics, memberships, credit packs, and bundles from the same catalog. Take payment through Duna and keep the connected order history close.",
    proof: [
      "Services and clinics",
      "Memberships and credit packs",
      "Connected payment history",
    ],
  },
  {
    id: "coach-discovery",
    eyebrow: "Distribution + marketing",
    title: "Be easier to find. Easier to book.",
    body: "Give players one public place to understand your services and upcoming sessions. Reach the right people through Duna discovery and consent-aware email, SMS, or push journeys.",
    proof: [
      "Public coach profile",
      "Player-network distribution",
      "Audience and lifecycle flows",
    ],
  },
  {
    id: "coach-performance",
    eyebrow: "Player care",
    title: "Coach the person, with the rally in context.",
    body: "Keep Duna Vision video, source-linked rally review, private notes, participation, memberships, and player-shared HealthKit summaries together. Recording can continue locally and sync when the player’s allowed connection returns. Players control what health data is shared; verified guardians stay connected for minors.",
    proof: [
      "Source-linked video and rally review",
      "Visible-court heatmaps with confidence",
      "Offline capture with Wi‑Fi or cellular controls",
      "Permissioned health summaries",
      "Player and guardian context",
    ],
  },
] as const;

const sharedCapabilities: readonly [LucideIcon, string, string][] = [
  [CalendarDays, "Calendar", "Sessions, courts, coaches, holds, and capacity"],
  [MapPinned, "Venues", "Court inventory, rentals, media, and booking rules"],
  [UsersRound, "People", "Players, parents, guardians, balances, and history"],
  [
    UserRoundCheck,
    "Team",
    "Roles, availability, assignments, and compensation setup",
  ],
  [PackageOpen, "Products", "Lessons, plans, goods, equipment, and bundles"],
  [WalletCards, "Money", "Orders, credits, refunds, payouts, and ledger state"],
  [
    Dumbbell,
    "Training",
    "Season programs, practice plans, and drills you describe in your own words",
  ],
  [
    Megaphone,
    "Marketing",
    "Audiences, triggers, consent, and reviewable sends",
  ],
  [BarChart3, "Reports", "Utilization, retention, revenue, and offer health"],
  [
    Video,
    "Duna Vision",
    "Per-recording consent, real-court framing, source-linked rallies, and private sharing",
  ],
  [
    WifiOff,
    "Offline field capture",
    "Record locally and automatically resume upload when the allowed connection returns",
  ],
  [
    HeartPulse,
    "Health sharing",
    "Player-controlled summaries and scoped access",
  ],
  [
    Trophy,
    "Events + leagues",
    "Registration, eligibility, scoring, and results",
  ],
  [
    Palette,
    "Theme Kit",
    "Normalized club identity with preview before publish",
  ],
];

const heroSchedule = [
  {
    time: "9:00",
    title: "Private lessons",
    place: "Court 1 · Jordan",
    attendance: "2 confirmed",
    people: [marketingPeople.maya, marketingPeople.mara],
  },
  {
    time: "11:30",
    title: "Youth clinic",
    place: "Courts 2–3 · Drew",
    attendance: "8 of 10",
    people: marketingPlayerGroup,
  },
  {
    time: "3:00",
    title: "Open play",
    place: "Four courts",
    attendance: "18 going",
    people: [
      marketingPeople.theo,
      marketingPeople.jamie,
      marketingPeople.noa,
      marketingPeople.maya,
      marketingPeople.mara,
    ],
  },
  {
    time: "6:30",
    title: "League night",
    place: "Center courts",
    attendance: "24 checked in",
    people: [
      marketingPeople.mara,
      marketingPeople.theo,
      marketingPeople.noa,
      marketingPeople.jamie,
      marketingPeople.maya,
      marketingPeople.drew,
    ],
  },
] as const;

const clubCalendarColumns = [
  {
    court: "Court 1",
    items: [
      {
        time: "9:00",
        title: "Private lesson",
        detail: "Jordan · 1 player",
        people: [marketingPeople.maya],
      },
      { time: "2:00", title: "Open play", detail: "Available", people: [] },
      {
        time: "6:00",
        title: "League",
        detail: "6 checked in",
        people: marketingPlayerGroup,
      },
    ],
  },
  {
    court: "Court 2",
    items: [
      {
        time: "9:00",
        title: "Youth clinic",
        detail: "Drew · 7 of 8",
        people: marketingPlayerGroup,
      },
      {
        time: "2:00",
        title: "Court rental",
        detail: "No players yet",
        people: [],
      },
      {
        time: "6:00",
        title: "League",
        detail: "8 going",
        people: [
          marketingPeople.theo,
          marketingPeople.noa,
          marketingPeople.jamie,
          marketingPeople.mara,
          marketingPeople.maya,
        ],
      },
    ],
  },
  {
    court: "Court 3",
    items: [
      {
        time: "9:00",
        title: "Training",
        detail: "Maya + 3 players",
        people: marketingPlayerGroup,
      },
      { time: "2:00", title: "Open", detail: "Available", people: [] },
      {
        time: "6:00",
        title: "Tournament prep",
        detail: "Drew · 4 players",
        people: [
          marketingPeople.maya,
          marketingPeople.jamie,
          marketingPeople.noa,
          marketingPeople.theo,
        ],
      },
    ],
  },
  {
    court: "Court 4",
    items: [
      {
        time: "9:00",
        title: "Group lesson",
        detail: "Jordan · 6 of 8",
        people: [
          marketingPeople.mara,
          marketingPeople.noa,
          marketingPeople.jamie,
          marketingPeople.maya,
        ],
      },
      { time: "2:00", title: "Open", detail: "Available", people: [] },
      {
        time: "6:00",
        title: "League",
        detail: "Waitlist · 2",
        people: [
          marketingPeople.theo,
          marketingPeople.mara,
          marketingPeople.noa,
          marketingPeople.jamie,
          marketingPeople.maya,
          marketingPeople.drew,
        ],
      },
    ],
  },
] as const;

const coachAgenda = [
  {
    time: "8:30",
    title: "Private lesson",
    detail: "Maya · Pier courts",
    people: [marketingPeople.maya],
  },
  {
    time: "11:00",
    title: "Group training",
    detail: "6 players · Main courts",
    people: marketingPlayerGroup,
  },
  {
    time: "4:30",
    title: "Video review",
    detail: "Drew · Remote",
    people: [marketingPeople.drew],
  },
] as const;

const contextPeople = [
  {
    person: marketingPeople.maya,
    role: "Member · Youth performance",
    state: "Guardian connected",
  },
  {
    person: marketingPeople.drew,
    role: "Coach · Beach director",
    state: "Available today",
  },
  {
    person: marketingPeople.jamie,
    role: "Member · Credit pack",
    state: "2 credits left",
  },
  {
    person: marketingPeople.alex,
    role: "Parent + guardian",
    state: "Verified permissions",
  },
] as const;

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function useBusinessPageMotion() {
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    page.dataset.reducedMotion = reducedMotion ? "true" : "false";

    const reveals = page.querySelectorAll<HTMLElement>("[data-reveal]");
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.visible = "true";
          revealObserver.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8%", threshold: 0.08 },
    );
    reveals.forEach((element) => revealObserver.observe(element));

    const storyObservers: IntersectionObserver[] = [];
    page.querySelectorAll<HTMLElement>("[data-story]").forEach((story) => {
      const steps = story.querySelectorAll<HTMLElement>("[data-story-step]");
      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort(
              (left, right) => right.intersectionRatio - left.intersectionRatio,
            )[0];
          const screen = (visible?.target as HTMLElement | undefined)?.dataset
            .storyStep;
          if (screen) story.dataset.activeScreen = screen;
        },
        { rootMargin: "-28% 0px -48% 0px", threshold: [0.05, 0.2, 0.5] },
      );
      steps.forEach((step) => observer.observe(step));
      storyObservers.push(observer);
    });

    let frame = 0;
    const update = () => {
      frame = 0;
      if (reducedMotion) return;
      const hero = page.querySelector<HTMLElement>("[data-business-hero]");
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      const progress = clamp(
        -rect.top / Math.max(1, rect.height - innerHeight),
      );
      page.style.setProperty("--hero-progress", progress.toFixed(4));
      page.dataset.scrolled = scrollY > 48 ? "true" : "false";
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);

    return () => {
      revealObserver.disconnect();
      storyObservers.forEach((observer) => observer.disconnect());
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return pageRef;
}

function HeroConsole() {
  return (
    <div
      aria-label="Duna HQ overview showing a connected club day"
      className={styles.heroConsole}
      role="img"
    >
      <div className={styles.desktopTopbar}>
        <span className={styles.hqWordmark}>DUNA HQ</span>
        <div className={styles.desktopSearch}>Search your organization</div>
        <span className={styles.operatorAvatar}>BH</span>
      </div>
      <div className={styles.desktopBody}>
        <aside className={styles.desktopSidebar}>
          <span className={styles.activeNav}>
            <LayoutDashboard /> Overview
          </span>
          <span>
            <CalendarDays /> Calendar
          </span>
          <span>
            <MapPinned /> Venues
          </span>
          <span>
            <UsersRound /> People
          </span>
          <span>
            <CreditCard /> Money
          </span>
          <span>
            <BarChart3 /> Reports
          </span>
        </aside>
        <div className={styles.overviewScreen}>
          <header>
            <span>FRIDAY · TODAY</span>
            <h2>Seven sessions. One clear day.</h2>
          </header>
          <div className={styles.overviewMetrics}>
            <article>
              <small>Bookings today</small>
              <Numeric tier="hero">84</Numeric>
              <span>Across four courts</span>
            </article>
            <article>
              <small>Expected revenue</small>
              <Numeric tier="block">$4,280</Numeric>
              <span>Connected orders</span>
            </article>
            <article className={styles.aiCard}>
              <Sparkles />
              <small>DUNA AI · REVIEW</small>
              <strong>Two courts are quiet after 4 PM.</strong>
              <span>Publish a level-matched pickup?</span>
            </article>
          </div>
          <div className={styles.heroSchedule}>
            {heroSchedule.map((session, index) => (
              <article
                key={session.time}
                style={{ "--item": index } as CSSProperties}
              >
                <Numeric tier="table">{session.time}</Numeric>
                <strong>{session.title}</strong>
                <small>{session.place}</small>
                <div className={styles.schedulePeople}>
                  <ProfileAvatarStack
                    label={`${session.attendance} for ${session.title}`}
                    people={session.people}
                    size="xs"
                  />
                  <em>{session.attendance}</em>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClubDeviceStage() {
  return (
    <div aria-hidden className={styles.clubDeviceStage}>
      <div className={styles.deviceHalo} />
      <div className={styles.clubDevice}>
        <div className={styles.desktopTopbar}>
          <span className={styles.hqWordmark}>DUNA HQ</span>
          <span className={styles.deviceContext}>
            South Bay · Main location
          </span>
          <span className={styles.operatorAvatar}>SB</span>
        </div>
        <div className={styles.deviceScreenStack}>
          <div className={styles.clubScreen} data-screen="club-operations">
            <div className={styles.mockHeading}>
              <span>CALENDAR · THIS WEEK</span>
              <strong>Every resource. One plan.</strong>
            </div>
            <div className={styles.calendarBoard}>
              {clubCalendarColumns.map((column) => (
                <div key={column.court}>
                  <strong>{column.court}</strong>
                  {column.items.map((item, index) => (
                    <span
                      className={
                        index === 1 && item.people.length === 0
                          ? styles.openSlot
                          : ""
                      }
                      key={`${item.time}-${item.title}`}
                    >
                      <small>{item.time}</small>
                      <strong>{item.title}</strong>
                      <span className={styles.calendarItemMeta}>
                        {item.people.length > 0 && (
                          <ProfileAvatarStack
                            label={`${item.detail} in ${column.court}`}
                            max={3}
                            people={item.people}
                            size="xs"
                          />
                        )}
                        <em>{item.detail}</em>
                      </span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className={styles.clubScreen} data-screen="club-people">
            <div className={styles.mockHeading}>
              <span>PEOPLE · CONNECTED RELATIONSHIPS</span>
              <strong>Context follows the person.</strong>
            </div>
            <div className={styles.peopleBoard}>
              {contextPeople.map(({ person, role, state }) => (
                <article key={person.displayName}>
                  <ProfileAvatar
                    className={styles.peopleAvatar}
                    person={person}
                    size="md"
                  />
                  <span>
                    <strong>{person.displayName}</strong>
                    <small>{role}</small>
                  </span>
                  <em>{state}</em>
                </article>
              ))}
            </div>
            <div className={styles.peopleFooter}>
              <ShieldCheck /> Verified guardian updates follow the player
              automatically.
            </div>
          </div>

          <div className={styles.clubScreen} data-screen="club-commerce">
            <div className={styles.mockHeading}>
              <span>MONEY · CONNECTED ORDERS</span>
              <strong>From membership to ledger.</strong>
            </div>
            <div className={styles.moneyMetrics}>
              <article>
                <small>Gross booked</small>
                <Numeric tier="hero">$38.4K</Numeric>
                <span>This month</span>
              </article>
              <article>
                <small>Active memberships</small>
                <Numeric tier="block">214</Numeric>
                <span>Across all plans</span>
              </article>
              <article>
                <small>Credits outstanding</small>
                <Numeric tier="block">486</Numeric>
                <span>Player balances</span>
              </article>
            </div>
            <div className={styles.orderRows}>
              {[
                ["Monthly club membership", "$149.00", "Paid"],
                ["Ten-session credit pack", "$320.00", "Paid"],
                ["League team registration", "$480.00", "Processing"],
              ].map(([item, amount, state]) => (
                <article key={item}>
                  <strong>{item}</strong>
                  <Numeric tier="table">{amount}</Numeric>
                  <span>{state}</span>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.clubScreen} data-screen="club-growth">
            <div className={styles.mockHeading}>
              <span>REPORTS · OPERATING TRUTH</span>
              <strong>Know what fills the courts.</strong>
            </div>
            <div className={styles.reportBoard}>
              <div className={styles.reportChart}>
                {[42, 66, 54, 82, 74, 91, 78].map((height, index) => (
                  <i
                    key={index}
                    style={{ "--bar": `${height}%` } as CSSProperties}
                  />
                ))}
              </div>
              <div className={styles.reportList}>
                <article>
                  <span>League night</span>
                  <Numeric tier="table">92%</Numeric>
                </article>
                <article>
                  <span>Youth clinics</span>
                  <Numeric tier="table">84%</Numeric>
                </article>
                <article>
                  <span>Private coaching</span>
                  <Numeric tier="table">76%</Numeric>
                </article>
                <article>
                  <span>Court rentals</span>
                  <Numeric tier="table">61%</Numeric>
                </article>
              </div>
            </div>
            <div className={styles.growthSuggestion}>
              <Sparkles />
              <span>
                <small>REVIEW BEFORE SEND</small>
                <strong>Thirty-two members have not booked in 21 days.</strong>
              </span>
              <b>Open audience</b>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoachDeviceStage() {
  return (
    <div aria-hidden className={styles.coachDeviceStage}>
      <div className={styles.coachTablet}>
        <div className={styles.tabletCamera} />
        <div className={styles.coachScreenStack}>
          <div className={styles.coachScreen} data-screen="coach-day">
            <div className={styles.mobileHeading}>
              <span>TODAY</span>
              <strong>Good morning, Jordan.</strong>
              <small>Three sessions · two locations</small>
            </div>
            <div className={styles.mobileAgenda}>
              {coachAgenda.map((session, index) => (
                <article key={session.time}>
                  <Numeric tier="table">{session.time}</Numeric>
                  <ProfileAvatarStack
                    className={styles.agendaPeople}
                    label={`${session.detail} attending ${session.title}`}
                    max={4}
                    people={session.people}
                    size="xs"
                  />
                  <span className={styles.agendaCopy}>
                    <strong>{session.title}</strong>
                    <small>{session.detail}</small>
                  </span>
                  <i className={index === 0 ? styles.nowDot : ""} />
                </article>
              ))}
            </div>
            <div className={styles.quickActionRow}>
              <span>
                <ClipboardCheck /> Check in
              </span>
              <span>
                <MessageSquareText /> Update
              </span>
              <span>
                <Clock3 /> Block time
              </span>
            </div>
          </div>

          <div className={styles.coachScreen} data-screen="coach-commerce">
            <div className={styles.mobileHeading}>
              <span>YOUR OFFERS</span>
              <strong>Sell the way you coach.</strong>
              <small>Published through your Duna profile</small>
            </div>
            <div className={styles.offerGrid}>
              <article>
                <Play />
                <strong>Private coaching</strong>
                <small>60 minutes · From $120</small>
              </article>
              <article>
                <UsersRound />
                <strong>Small group</strong>
                <small>90 minutes · 8 spots</small>
              </article>
              <article>
                <CreditCard />
                <strong>Monthly membership</strong>
                <small>4 sessions · $349</small>
              </article>
              <article>
                <WalletCards />
                <strong>Ten-session pack</strong>
                <small>Credits never lose context</small>
              </article>
            </div>
          </div>

          <div className={styles.coachScreen} data-screen="coach-discovery">
            <div className={styles.coachProfileMock}>
              <div className={styles.profilePhoto}>
                <ProfileAvatar person={marketingPeople.jordan} size="lg" />
              </div>
              <span>COACH PROFILE</span>
              <strong>Jordan Cruz</strong>
              <small>Beach volleyball coach · South Bay</small>
              <div>
                <b>Private lessons</b>
                <b>Groups</b>
                <b>Clinics</b>
              </div>
            </div>
            <div className={styles.discoveryProof}>
              <Megaphone />
              <span>
                <small>DUNA DISTRIBUTION</small>
                <strong>
                  Your next clinic appears where players already look for a
                  game.
                </strong>
              </span>
            </div>
          </div>

          <div className={styles.coachScreen} data-screen="coach-performance">
            <div className={styles.playerContextHeader}>
              <ProfileAvatar person={marketingPeople.maya} size="md" />
              <div className={styles.mobileHeading}>
                <span>PLAYER CONTEXT</span>
                <strong>Maya Rivera</strong>
                <small>Shared with your coaching organization</small>
              </div>
            </div>
            <div className={styles.playerContextGrid}>
              <article>
                <Video />
                <span>
                  <strong>Rally review</strong>
                  <small>Source-linked Vision cues</small>
                </span>
              </article>
              <article>
                <HeartPulse />
                <span>
                  <strong>Health summary</strong>
                  <small>Player permission active</small>
                </span>
              </article>
              <article>
                <MessageSquareText />
                <span>
                  <strong>Private notes</strong>
                  <small>Visible to coaching staff</small>
                </span>
              </article>
              <article>
                <ShieldCheck />
                <span>
                  <strong>Guardian</strong>
                  <small>Verified for updates</small>
                </span>
              </article>
            </div>
            <div className={styles.videoTimeline}>
              <div className={styles.videoThumbnail}>
                <Image
                  alt="Maya practicing serve receive on a beach volleyball court"
                  fill
                  sizes="(max-width: 700px) 70vw, 360px"
                  src="/media/brand/people/duna-video-maya-practice-v1.webp"
                />
                <b aria-hidden>
                  <Play />
                </b>
                <Numeric tier="chip">00:42</Numeric>
              </div>
              <span className={styles.videoDetail}>
                <Video />
                <span>
                  <strong>Serve receive</strong>
                  <small>Today · verified review cue</small>
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.coachPhone}>
        <div className={styles.phoneSpeaker} />
        <div className={styles.phoneScreen}>
          <span>UP NEXT</span>
          <strong>Private lesson</strong>
          <small>Pier courts · Court 2</small>
          <Numeric tier="block">8:30</Numeric>
          <b>Open session</b>
        </div>
      </div>
    </div>
  );
}

function StoryCopy({
  stories,
}: {
  readonly stories: readonly {
    readonly id: string;
    readonly eyebrow: string;
    readonly title: string;
    readonly body: string;
    readonly proof: readonly string[];
  }[];
}) {
  return (
    <div className={styles.storyCopy}>
      {stories.map((story) => (
        <article data-reveal data-story-step={story.id} key={story.id}>
          <span className={styles.eyebrow}>{story.eyebrow}</span>
          <h3>{story.title}</h3>
          <p>{story.body}</p>
          <ul>
            {story.proof.map((item) => (
              <li key={item}>
                <Check /> {item}
              </li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

function Pricing({
  plans,
}: {
  readonly plans: readonly OrganizationMarketingPlan[];
}) {
  return (
    <section className={styles.pricing} id="plans">
      <div className={styles.sectionIntro} data-reveal>
        <span className={styles.eyebrow}>Plans</span>
        <h2>Start free. Add operating depth when you need it.</h2>
        <p>
          Solo coaches can begin without a monthly subscription. Paid plans add
          the club, facility, and network controls that growing organizations
          need, with no Duna organization transaction fee.
        </p>
      </div>
      <div className={styles.planGrid}>
        {plans.map((plan) => (
          <article data-reveal key={plan.id}>
            <header>
              <span>{plan.name}</span>
              <h3>{plan.productName}</h3>
              <p>{plan.tagline}</p>
            </header>
            <div className={styles.priceLine}>
              <Numeric tier="hero">{plan.monthlyPrice}</Numeric>
              {plan.monthlyPrice !== "$0.00" && <span>/ month</span>}
            </div>
            <span className={styles.feeLine}>
              <Numeric tier="chip">{plan.organizationFeePercent}%</Numeric>{" "}
              organization transaction fee
            </span>
            <ul>
              {plan.features.slice(0, 4).map((feature) => (
                <li key={feature}>
                  <Check /> {feature}
                </li>
              ))}
            </ul>
            <footer>
              <span>
                <Video />{" "}
                <Numeric tier="chip">{plan.monthlyUploadHours}</Numeric>{" "}
                uploaded-video hours
              </span>
              <span>
                <Smartphone />{" "}
                <Numeric tier="chip">{plan.monthlyLiveHours}</Numeric> live
                hours monthly
              </span>
              {plan.monthlyPrice !== "$0.00" && (
                <small>{plan.annualPrice} annually</small>
              )}
            </footer>
          </article>
        ))}
      </div>
      <p className={styles.pricingNote}>
        Payment processing is separate. Current eligibility and checkout terms
        appear in Duna HQ before purchase.
      </p>
    </section>
  );
}

export function RunYourBusinessPage({
  hqHref,
  plans,
}: RunYourBusinessPageProps) {
  const pageRef = useBusinessPageMotion();

  return (
    <main className={styles.page} data-zone="editorial" ref={pageRef}>
      <SiteHeader />

      <nav
        aria-label="Duna HQ product navigation"
        className={styles.productNav}
      >
        <Link className={styles.productIdentity} href="#top">
          <span>Duna</span>
          <strong>HQ</strong>
        </Link>
        <div>
          <Link href="#club-owner">Club owners</Link>
          <Link href="#solo-coach">Solo coaches</Link>
          <Link href="#platform">Platform</Link>
          <Link href="#plans">Plans</Link>
        </div>
        <a className={styles.productCta} href={hqHref}>
          Open Duna HQ
        </a>
      </nav>

      <section className={styles.hero} data-business-hero id="top">
        <div className={styles.heroSticky}>
          <div className={styles.heroMedia} aria-hidden>
            <Image
              alt=""
              fill
              priority
              sizes="100vw"
              src="/media/brand/duna-club-hero-v1.webp"
            />
          </div>
          <div className={styles.heroTexture} aria-hidden />
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <span className={styles.eyebrow}>Duna HQ · clubs + coaches</span>
              <h1>Run the business. Keep the game human.</h1>
              <p>
                One operating system for the independent coach with a packed
                calendar and the club coordinating courts, staff, parents,
                memberships, payments, Duna Vision review, offline field
                capture, and growth.
              </p>
              <div className={styles.heroActions}>
                <a className={styles.primaryButton} href={hqHref}>
                  Open Duna HQ <ArrowRight />
                </a>
                <Link
                  className={styles.secondaryButton}
                  href="#choose-your-path"
                >
                  Find your path
                </Link>
              </div>
              <small>
                Start solo. Add courts, locations, and a team when the business
                asks for them.
              </small>
            </div>
            <div className={styles.heroStage}>
              <HeroConsole />
            </div>
          </div>
          <a className={styles.scrollCue} href="#choose-your-path">
            <span>See the two paths</span>
            <ChevronDown />
          </a>
        </div>
      </section>

      <section className={styles.pathChooser} id="choose-your-path">
        <div className={styles.sectionIntro} data-reveal>
          <span className={styles.eyebrow}>Choose your start</span>
          <h2>One platform. Two operating realities.</h2>
          <p>
            The underlying jobs overlap. The order does not. Duna starts with
            the pressure you feel today, then keeps the same data and identity
            intact as the business changes shape.
          </p>
        </div>
        <div className={styles.pathGrid}>
          <Link data-reveal href="#solo-coach">
            <span>
              <Smartphone /> Solo coach
            </span>
            <h3>Your business lives between courts.</h3>
            <p>
              Keep the next session, player context, offers, payments,
              marketing, and notes in reach.
            </p>
            <strong>
              Follow the coach path <ArrowRight />
            </strong>
          </Link>
          <Link data-reveal href="#club-owner">
            <span>
              <LayoutDashboard /> Club owner
            </span>
            <h3>Your business moves through people and places.</h3>
            <p>
              Coordinate courts, staff, families, inventory, memberships, money,
              and demand as one operation.
            </p>
            <strong>
              Follow the club path <ArrowRight />
            </strong>
          </Link>
        </div>
      </section>

      <section className={styles.clubStory} id="club-owner">
        <div className={styles.storyIntro} data-reveal>
          <span className={styles.eyebrow}>For club owners</span>
          <h2>Run every court like one connected club.</h2>
          <p>
            Duna HQ makes a busy organization legible without reducing the day
            to a dashboard. The calendar, the people, the money, and the growth
            story remain connected to the same real activity.
          </p>
        </div>
        <div
          className={styles.storyLayout}
          data-active-screen="club-operations"
          data-story="club"
        >
          <div className={styles.stickyVisual}>
            <ClubDeviceStage />
          </div>
          <StoryCopy stories={clubStories} />
        </div>
      </section>

      <section className={styles.coachStory} id="solo-coach">
        <div className={styles.storyIntro} data-reveal>
          <span className={styles.eyebrow}>For solo coaches</span>
          <h2>Your coaching business. In your hand.</h2>
          <p>
            Duna Pro handles the live work while Duna HQ keeps the business
            organized. Start with your calendar and clients, then add products,
            distribution, payments, Duna Vision review, offline field capture,
            and reporting without rebuilding the foundation.
          </p>
        </div>
        <div
          className={styles.storyLayoutReversed}
          data-active-screen="coach-day"
          data-story="coach"
        >
          <StoryCopy stories={coachStories} />
          <div className={styles.stickyVisual}>
            <CoachDeviceStage />
          </div>
        </div>
      </section>

      <section className={styles.platform} id="platform">
        <div className={styles.sectionIntro} data-reveal>
          <span className={styles.eyebrow}>One connected system</span>
          <h2>Start with the job. Keep the context.</h2>
          <p>
            Every module shares the same people, places, products, permissions,
            and evidence. A booking can become a relationship, an order, a
            video, a result, and a useful report without being entered five
            times.
          </p>
        </div>
        <div className={styles.capabilityGrid}>
          {sharedCapabilities.map(([Icon, title, description]) => (
            <article data-reveal key={title}>
              <Icon />
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
            </article>
          ))}
        </div>
        <div className={styles.connectedFlow} data-reveal>
          {["Publish", "Discover", "Book", "Serve", "Learn", "Return"].map(
            (label, index) => (
              <span key={label}>
                <Numeric tier="chip">
                  {String(index + 1).padStart(2, "0")}
                </Numeric>
                {label}
              </span>
            ),
          )}
        </div>
      </section>

      <section className={styles.trainingPromo}>
        <div className={styles.trainingPromoInner} data-reveal>
          <div className={styles.trainingPromoContent}>
            <Dumbbell aria-hidden size={24} />
            <span className={styles.eyebrow}>Training</span>
            <h2>Write the week. Run the court.</h2>
            <p>
              Describe a drill the way you&rsquo;d explain it to another coach
              and Duna drafts the steps, cues, and scoring for you to correct.
              Build the session around it, then set the season it belongs to.
            </p>
            <Link
              className={styles.secondaryButton}
              href="/run-your-club/training"
            >
              See training planning <ArrowRight />
            </Link>
          </div>
          <div className={styles.trainingPromoVisual}>
            <div className={styles.trainingPromoDrill}>
              <header>
                <span>Ball Control</span>
                <small>Build, then compete</small>
              </header>
              <strong>Seam Serve to Transition</strong>
              <div>
                <span>14 min</span>
                <span>6 to 12 players</span>
              </div>
            </div>
            <div className={styles.trainingPromoPractice}>
              <span>Tuesday</span>
              <div>
                <Numeric tier="table">90</Numeric>
                <small>min</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.assurance}>
        <div data-reveal>
          <ShieldCheck />
          <span className={styles.eyebrow}>Control stays explicit</span>
          <h2>Assistance proposes. Operators decide.</h2>
          <p>
            Duna AI can surface quiet courts, at-risk relationships, and missing
            operating context. Publishing, sending, refunding, and changing
            access remain reviewable actions owned by your team.
          </p>
        </div>
        <div className={styles.assuranceMock} data-reveal>
          <span>
            <Sparkles /> DUNA AI · READY FOR REVIEW
          </span>
          <h3>Wednesday open play has room for 12 more players.</h3>
          <p>Invite nearby members rated for the published level?</p>
          <div>
            <b>Review audience</b>
            <strong>Keep as draft</strong>
          </div>
        </div>
      </section>

      <Pricing plans={plans} />

      <section className={styles.closing}>
        <div className={styles.closingTexture} aria-hidden />
        <div data-reveal>
          <span className={styles.eyebrow}>Start at your size</span>
          <h2>One lesson, one event, or the whole club.</h2>
          <p>
            Begin with the job you need done today. Duna keeps the foundation
            ready for what comes next.
          </p>
          <div>
            <a className={styles.primaryButton} href={hqHref}>
              Run your business on Duna <ArrowRight />
            </a>
            <Link className={styles.secondaryButton} href="/create">
              Create an event first
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
