"use client";

import { formatMoney, formatVenueTime } from "@duna/core";
import {
  demoEvents,
  demoOrganization,
  demoPeople,
  demoVenues,
} from "@duna/core/demo";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Download,
  Filter,
  Grid2X2,
  MapPin,
  MoreHorizontal,
  PackageOpen,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  Trophy,
  UserRoundPlus,
  UsersRound,
  WandSparkles,
  Zap,
} from "lucide-react";
import { useState } from "react";
import type { OperatorModule } from "./navigation";

const moduleCopy: Record<
  Exclude<OperatorModule, "overview">,
  { eyebrow: string; title: string; description: string; action: string }
> = {
  calendar: {
    eyebrow: "Courts + coaches + sessions",
    title: "Calendar",
    description: "One operational view across every venue and program.",
    action: "New session",
  },
  members: {
    eyebrow: "People + households",
    title: "People",
    description: "CRM, eligibility, waivers, notes, balances, and history.",
    action: "Add person",
  },
  programs: {
    eyebrow: "Products + delivery",
    title: "Programs",
    description:
      "Training, camps, clinics, memberships, packages, and rentals.",
    action: "New program",
  },
  events: {
    eyebrow: "Tournaments + open play",
    title: "Events",
    description: "Registration, check-in, brackets, scoring, and payouts.",
    action: "New event",
  },
  leagues: {
    eyebrow: "Competition engine",
    title: "Leagues",
    description: "Build formats, teams, schedules, standings, and playoffs.",
    action: "Build league",
  },
  payments: {
    eyebrow: "Stripe-connected money",
    title: "Money",
    description:
      "Sales, payouts, refunds, credits, subscriptions, and reconciliation.",
    action: "Take payment",
  },
  messages: {
    eyebrow: "Email + SMS + in-app",
    title: "Messages",
    description: "One guardian-aware inbox for every relationship.",
    action: "New message",
  },
  reports: {
    eyebrow: "Live operating intelligence",
    title: "Reports",
    description:
      "Revenue, retention, utilization, programs, and coaching capacity.",
    action: "Export",
  },
  ai: {
    eyebrow: "Grounded operator copilot",
    title: "Duna AI",
    description:
      "Ask, analyze, and propose—with confirmation before anything changes.",
    action: "New thread",
  },
  settings: {
    eyebrow: "Organization configuration",
    title: "Settings",
    description:
      "Brand, venues, roles, policies, integrations, tax, and billing.",
    action: "Save changes",
  },
};

function PageHeading({
  module,
  onAction,
}: {
  readonly module: Exclude<OperatorModule, "overview">;
  readonly onAction?: () => void;
}) {
  const copy = moduleCopy[module];
  return (
    <header className="hq-page-heading">
      <div>
        <span className="hq-eyebrow">{copy.eyebrow}</span>
        <h1>{copy.title}.</h1>
        <p>{copy.description}</p>
      </div>
      <div>
        <button className="hq-button hq-button--secondary">
          <Filter aria-hidden size={16} /> Filter
        </button>
        <button className="hq-button hq-button--primary" onClick={onAction}>
          <Plus aria-hidden size={17} /> {copy.action}
        </button>
      </div>
    </header>
  );
}

export function ModulePanel({ module }: { readonly module: OperatorModule }) {
  if (module === "overview") return null;
  return (
    <main className="hq-page module-page">
      <PageHeading module={module} />
      {module === "calendar" && <CalendarPanel />}
      {module === "members" && <PeoplePanel />}
      {module === "programs" && <ProgramsPanel />}
      {module === "events" && <EventsPanel />}
      {module === "leagues" && <LeaguesPanel />}
      {module === "payments" && <MoneyPanel />}
      {module === "messages" && <MessagesPanel />}
      {module === "reports" && <ReportsPanel />}
      {module === "ai" && <AiPanel />}
      {module === "settings" && <SettingsPanel />}
    </main>
  );
}

const calendarDays = [
  { day: "Mon", date: 27 },
  { day: "Tue", date: 28 },
  { day: "Wed", date: 29 },
  { day: "Thu", date: 30 },
  { day: "Fri", date: 31 },
  { day: "Sat", date: 1 },
  { day: "Sun", date: 2 },
] as const;

function CalendarPanel() {
  const [view, setView] = useState<"week" | "day">("week");
  const sessions = [
    {
      day: 1,
      start: 1,
      span: 2,
      title: "U14 Training",
      venue: "Pier · 1–3",
      tone: "aqua",
    },
    {
      day: 2,
      start: 4,
      span: 2,
      title: "Adult 2s",
      venue: "Hermosa · 5–6",
      tone: "sand",
    },
    {
      day: 3,
      start: 1,
      span: 2,
      title: "U14 Training",
      venue: "Pier · 1–3",
      tone: "aqua",
    },
    {
      day: 3,
      start: 5,
      span: 3,
      title: "Summer Series",
      venue: "Hermosa · 1–8",
      tone: "flare",
    },
    {
      day: 4,
      start: 2,
      span: 2,
      title: "Serve + Receive",
      venue: "Pier · 4",
      tone: "navy",
    },
    {
      day: 5,
      start: 1,
      span: 4,
      title: "Sunset Open",
      venue: "Pier · 1–12",
      tone: "flare",
    },
    {
      day: 6,
      start: 3,
      span: 3,
      title: "Friday Lights",
      venue: "Duna House",
      tone: "sand",
    },
  ] as const;
  return (
    <>
      <section className="calendar-toolbar">
        <div>
          <button aria-label="Previous week">
            <ChevronLeft size={17} />
          </button>
          <button>Today</button>
          <button aria-label="Next week">
            <ChevronRight size={17} />
          </button>
          <strong>July 27 – August 2, 2026</strong>
        </div>
        <div className="segmented">
          <button
            className={view === "day" ? "active" : undefined}
            onClick={() => setView("day")}
          >
            Day
          </button>
          <button
            className={view === "week" ? "active" : undefined}
            onClick={() => setView("week")}
          >
            Week
          </button>
        </div>
      </section>
      <section className="calendar-layout">
        <div className="calendar-board">
          <header>
            <span />
            {calendarDays.map((item) => (
              <div
                className={item.date === 30 ? "today" : undefined}
                key={item.day}
              >
                <small>{item.day}</small>
                <Numeric>{item.date}</Numeric>
              </div>
            ))}
          </header>
          <div className="calendar-board__body">
            <div className="calendar-times">
              {[
                "7 AM",
                "9 AM",
                "11 AM",
                "1 PM",
                "3 PM",
                "5 PM",
                "7 PM",
                "9 PM",
              ].map((time) => (
                <span key={time}>{time}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {sessions.map((session) => (
                <article
                  className={`calendar-session calendar-session--${session.tone}`}
                  key={session.title + session.day}
                  style={{
                    gridColumn: session.day + 1,
                    gridRow: `${session.start} / span ${session.span}`,
                  }}
                >
                  <strong>{session.title}</strong>
                  <small>{session.venue}</small>
                </article>
              ))}
              <i className="calendar-now" />
            </div>
          </div>
        </div>
        <aside className="calendar-side">
          <div className="hq-card">
            <span className="hq-eyebrow">Utilization today</span>
            <Numeric>74%</Numeric>
            <div className="meter">
              <i style={{ width: "74%" }} />
            </div>
            <p>31 of 42 court-hours booked</p>
          </div>
          <div className="hq-card">
            <span className="hq-eyebrow">Resource conflicts</span>
            <h3>Nothing overlaps.</h3>
            <p>Duna checked coaches, courts, travel buffers, and capacity.</p>
            <Badge tone="positive">
              <Check size={12} /> Clear
            </Badge>
          </div>
        </aside>
      </section>
    </>
  );
}

function PeoplePanel() {
  const rows = [
    ...demoPeople.map((person, index) => ({
      initials: person.initials,
      name: person.displayName,
      relationship: index === 3 ? "Coach + member" : "Member",
      email: `${person.handle}@example.com`,
      rating: person.rating.display,
      status: index === 2 ? "Needs waiver" : "Active",
      balance: index === 4 ? "$48 due" : "Current",
    })),
    {
      initials: "PL",
      name: "Priya Lewis",
      relationship: "Guardian",
      email: "priya@example.com",
      rating: null,
      status: "Verified",
      balance: "Current",
    },
  ];
  return (
    <>
      <section className="entity-toolbar">
        <label>
          <Search size={16} />
          <input placeholder="Search 918 people…" />
        </label>
        <div className="segmented">
          <button className="active">All people</button>
          <button>Members</button>
          <button>Coaches</button>
          <button>Minors</button>
        </div>
        <button>
          <Download size={16} /> Export
        </button>
      </section>
      <section className="table-card people-table">
        <header>
          <span>Person</span>
          <span>Relationship</span>
          <span>Sand Rating</span>
          <span>Eligibility</span>
          <span>Account</span>
          <span />
        </header>
        {rows.map((row) => (
          <article key={row.email}>
            <div>
              <span className="table-avatar">{row.initials}</span>
              <span>
                <strong>{row.name}</strong>
                <small>{row.email}</small>
              </span>
            </div>
            <span>{row.relationship}</span>
            <span>
              {row.rating ? <Numeric>{row.rating.toFixed(2)}</Numeric> : "—"}
            </span>
            <span>
              <Badge
                tone={row.status === "Needs waiver" ? "warning" : "positive"}
              >
                {row.status}
              </Badge>
            </span>
            <span
              className={row.balance.includes("due") ? "negative" : undefined}
            >
              {row.balance}
            </span>
            <button aria-label={`More options for ${row.name}`}>
              <MoreHorizontal size={17} />
            </button>
          </article>
        ))}
        <footer>
          <span>Showing 1–6 of 918</span>
          <div>
            <button disabled>Previous</button>
            <button>Next</button>
          </div>
        </footer>
      </section>
      <section className="people-insights">
        <article className="hq-card">
          <UserRoundPlus size={19} />
          <span>
            <Numeric>46</Numeric>
            <small>new this month</small>
          </span>
          <strong>+21% vs June</strong>
        </article>
        <article className="hq-card">
          <ShieldCheck size={19} />
          <span>
            <Numeric>97.8%</Numeric>
            <small>eligibility ready</small>
          </span>
          <strong>20 need action</strong>
        </article>
        <article className="hq-card">
          <UsersRound size={19} />
          <span>
            <Numeric>184</Numeric>
            <small>households</small>
          </span>
          <strong>62 with minors</strong>
        </article>
      </section>
    </>
  );
}

function ProgramsPanel() {
  const programs = [
    {
      name: "High Performance 2s",
      type: "Recurring training",
      revenue: 1848000,
      enrolled: "48 / 52",
      fill: 92,
      status: "Published",
      accent: "aqua",
    },
    {
      name: "U14 Summer Training",
      type: "Season program",
      revenue: 1424000,
      enrolled: "74 / 80",
      fill: 93,
      status: "Published",
      accent: "sand",
    },
    {
      name: "Adult Foundations",
      type: "6-week series",
      revenue: 684000,
      enrolled: "31 / 40",
      fill: 78,
      status: "Published",
      accent: "navy",
    },
    {
      name: "Serve + Receive Lab",
      type: "Clinic template",
      revenue: 336000,
      enrolled: "7 avg.",
      fill: 88,
      status: "Published",
      accent: "flare",
    },
    {
      name: "Private Coaching",
      type: "Appointment service",
      revenue: 558000,
      enrolled: "64 slots",
      fill: 71,
      status: "Published",
      accent: "aqua",
    },
    {
      name: "Fall College Prep",
      type: "Season program",
      revenue: 0,
      enrolled: "—",
      fill: 0,
      status: "Draft",
      accent: "sand",
    },
  ] as const;
  return (
    <>
      <section className="program-metrics">
        <article>
          <small>Active products</small>
          <Numeric>17</Numeric>
          <Badge tone="positive">14 selling</Badge>
        </article>
        <article>
          <small>Program revenue · July</small>
          <Numeric>$48,320</Numeric>
          <span>57% of club sales</span>
        </article>
        <article>
          <small>Weighted fill</small>
          <Numeric>86.2%</Numeric>
          <div className="meter">
            <i style={{ width: "86%" }} />
          </div>
        </article>
        <article>
          <small>Waitlisted demand</small>
          <Numeric>38</Numeric>
          <span>players across 4 programs</span>
        </article>
      </section>
      <section className="program-grid">
        {programs.map((program) => (
          <article className="program-card" key={program.name}>
            <header
              className={`program-card__art program-card__art--${program.accent}`}
            >
              <Badge tone={program.status === "Draft" ? "warning" : "positive"}>
                {program.status}
              </Badge>
              <PackageOpen aria-hidden size={30} />
            </header>
            <div>
              <small>{program.type}</small>
              <h2>{program.name}</h2>
              <div className="program-card__data">
                <span>
                  <small>July revenue</small>
                  <Numeric>{formatMoney(program.revenue, "USD")}</Numeric>
                </span>
                <span>
                  <small>Enrolled</small>
                  <Numeric>{program.enrolled}</Numeric>
                </span>
              </div>
              <div className="meter">
                <i style={{ width: `${program.fill}%` }} />
              </div>
              <footer>
                <span>{program.fill}% filled</span>
                <button>
                  <MoreHorizontal size={17} />
                </button>
              </footer>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

function EventsPanel() {
  return (
    <>
      <section className="event-ops-feature">
        <div>
          <Badge tone="live">Live now</Badge>
          <span className="hq-eyebrow">Sunset Open · Qualifier</span>
          <h2>Thirty teams. Twelve courts. One clean control room.</h2>
          <div>
            <span>
              <Numeric>28 / 30</Numeric>
              <small>checked in</small>
            </span>
            <span>
              <Numeric>16 / 28</Numeric>
              <small>matches final</small>
            </span>
            <span>
              <Numeric>2</Numeric>
              <small>courts open</small>
            </span>
            <span>
              <Numeric>$1,500</Numeric>
              <small>purse held by Stripe</small>
            </span>
          </div>
          <button>
            Open live control room <ArrowRight size={16} />
          </button>
        </div>
        <div className="mini-bracket" aria-label="Live bracket preview">
          <div>
            <span>
              Mara / Theo <Numeric>21</Numeric>
            </span>
            <span>
              Noa / Elena <Numeric>17</Numeric>
            </span>
          </div>
          <i />
          <div>
            <span>
              Rivera / Cole <Numeric>18</Numeric>
            </span>
            <span>
              Park / Kim <Numeric>15</Numeric>
            </span>
          </div>
          <i />
          <div className="winner">
            <Trophy size={15} /> Semifinal 1
          </div>
        </div>
      </section>
      <section className="table-card event-table">
        <header>
          <span>Event</span>
          <span>Starts</span>
          <span>Registration</span>
          <span>Gross</span>
          <span>Status</span>
          <span />
        </header>
        {demoEvents.map((event) => (
          <article key={event.id}>
            <div>
              <span className="event-table__icon">
                <Trophy size={16} />
              </span>
              <span>
                <strong>{event.title}</strong>
                <small>{event.venueName}</small>
              </span>
            </div>
            <span>
              {formatVenueTime(event.startsAt, event.timezone, "en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
            <span>
              <Numeric>
                {event.capacity - event.spotsRemaining} / {event.capacity}
              </Numeric>
            </span>
            <span>
              <Numeric>
                {formatMoney(
                  (event.capacity - event.spotsRemaining) *
                    event.price.amountMinor,
                  "USD",
                )}
              </Numeric>
            </span>
            <span>
              <Badge tone={event.live ? "live" : "positive"}>
                {event.live ? "Live" : "On sale"}
              </Badge>
            </span>
            <button>
              <MoreHorizontal size={17} />
            </button>
          </article>
        ))}
      </section>
    </>
  );
}

function LeaguesPanel() {
  const [proposed, setProposed] = useState(false);
  return (
    <section className="league-builder">
      <div className="league-builder__main">
        <header>
          <div>
            <Badge>Draft</Badge>
            <span>Autosaved just now</span>
          </div>
          <h2>South Bay Fall League</h2>
          <p>Co-ed 4s · 8 weeks · Monday nights</p>
        </header>
        <div className="builder-steps">
          {[
            ["01", "Shape", "8 teams · round robin"],
            ["02", "Field", "41 players · balanced"],
            ["03", "Schedule", "7 rounds + playoffs"],
            ["04", "Publish", "Review policies + pricing"],
          ].map((step, index) => (
            <article
              className={index === (proposed ? 2 : 1) ? "active" : undefined}
              key={step[0]}
            >
              <Numeric>{step[0]}</Numeric>
              <span>
                <strong>{step[1]}</strong>
                <small>{step[2]}</small>
              </span>
              {index < 3 && <Check size={16} />}
            </article>
          ))}
        </div>
        <div className="roster-balance">
          <div className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Team balance</span>
              <h2>Competitive by design</h2>
            </div>
            <Badge tone="positive">3.1% spread</Badge>
          </div>
          {[4.48, 4.43, 4.41, 4.38, 4.36, 4.33, 4.31, 4.27].map(
            (value, index) => (
              <article key={value}>
                <span>Team {index + 1}</span>
                <div>
                  <i style={{ width: `${65 + (value - 4.2) * 100}%` }} />
                </div>
                <Numeric>{value.toFixed(2)}</Numeric>
              </article>
            ),
          )}
        </div>
      </div>
      <aside className="league-ai">
        <span>
          <WandSparkles size={18} />
        </span>
        <Badge>Duna AI · propose only</Badge>
        <h2>Build the fairest schedule.</h2>
        <p>
          I can balance team strength, repeat partners, coach availability,
          court capacity, travel buffers, and requested conflicts.
        </p>
        <div className="league-ai__constraints">
          <span>
            <Check size={14} /> No team sits twice
          </span>
          <span>
            <Check size={14} /> 2 matches per night
          </span>
          <span>
            <Check size={14} /> 15-minute transitions
          </span>
          <span>
            <Check size={14} /> Avoid repeat opponents
          </span>
        </div>
        {proposed ? (
          <div className="proposal-ready">
            <Badge tone="positive">Proposal ready</Badge>
            <strong>56 matches · 0 conflicts</strong>
            <small>No changes have been made.</small>
            <button onClick={() => setProposed(false)}>Review + confirm</button>
          </div>
        ) : (
          <button onClick={() => setProposed(true)}>
            <Sparkles size={16} /> Generate proposal
          </button>
        )}
        <small>
          AI can never publish, charge, message, or change eligibility without
          an explicit confirmation.
        </small>
      </aside>
    </section>
  );
}

function MoneyPanel() {
  const ledger = [
    {
      id: "PAY-93842",
      person: "Mara Lewis",
      type: "Tournament registration",
      gross: 9600,
      net: 8943,
      status: "Succeeded",
      direction: "in",
    },
    {
      id: "PAY-93841",
      person: "Theo Park",
      type: "Private coaching",
      gross: 12000,
      net: 11582,
      status: "Succeeded",
      direction: "in",
    },
    {
      id: "REF-10082",
      person: "Priya Lewis",
      type: "Weather refund",
      gross: -4800,
      net: -4800,
      status: "Wallet credit",
      direction: "out",
    },
    {
      id: "PAY-93840",
      person: "Elena Torres",
      type: "Membership renewal",
      gross: 15900,
      net: 15349,
      status: "Recovered",
      direction: "in",
    },
    {
      id: "PAY-93839",
      person: "Noa Williams",
      type: "Friday Lights",
      gross: 1800,
      net: 1692,
      status: "Succeeded",
      direction: "in",
    },
  ] as const;
  return (
    <>
      <section className="money-balance">
        <div>
          <Badge tone="positive">Stripe connected</Badge>
          <span className="hq-eyebrow">Available to pay out</span>
          <Numeric>$61,884.22</Numeric>
          <p>Estimated arrival Friday, July 31 · •••• 8842</p>
          <div>
            <button>
              View in Stripe <ArrowUpRight size={15} />
            </button>
            <button>Reconcile July</button>
          </div>
        </div>
        <div>
          <article>
            <small>Gross volume · July</small>
            <Numeric>$84,260</Numeric>
            <span className="positive">+18.4%</span>
          </article>
          <article>
            <small>Refunds + credits</small>
            <Numeric>$2,184</Numeric>
            <span>2.59% of gross</span>
          </article>
          <article>
            <small>Processor + Duna fees</small>
            <Numeric>$3,944</Numeric>
            <span>4.68% blended</span>
          </article>
          <article>
            <small>Net sales</small>
            <Numeric>$78,132</Numeric>
            <span className="positive">92.7% retained</span>
          </article>
        </div>
      </section>
      <section className="table-card money-table">
        <header>
          <span>Transaction</span>
          <span>Customer</span>
          <span>Gross</span>
          <span>Net</span>
          <span>Status</span>
          <span />
        </header>
        {ledger.map((entry) => (
          <article key={entry.id}>
            <div>
              <span
                className={
                  entry.direction === "in"
                    ? "money-icon money-icon--in"
                    : "money-icon money-icon--out"
                }
              >
                {entry.direction === "in" ? (
                  <ArrowDownRight size={16} />
                ) : (
                  <ArrowUpRight size={16} />
                )}
              </span>
              <span>
                <strong>{entry.type}</strong>
                <small>{entry.id}</small>
              </span>
            </div>
            <span>{entry.person}</span>
            <span>
              <Numeric>{formatMoney(entry.gross, "USD")}</Numeric>
            </span>
            <span>
              <Numeric>{formatMoney(entry.net, "USD")}</Numeric>
            </span>
            <span>
              <Badge
                tone={entry.status === "Wallet credit" ? "warning" : "positive"}
              >
                {entry.status}
              </Badge>
            </span>
            <button>
              <MoreHorizontal size={17} />
            </button>
          </article>
        ))}
      </section>
      <section className="reconciliation-note">
        <ShieldCheck size={19} />
        <div>
          <strong>Ledger and Stripe agree through 10:42 AM.</strong>
          <span>
            Every displayed total is completeness-aware; three payments still
            processing are excluded.
          </span>
        </div>
        <Badge tone="positive">Reconciled</Badge>
      </section>
    </>
  );
}

function MessagesPanel() {
  const [selected, setSelected] = useState(0);
  const threads = [
    {
      initials: "PL",
      name: "Priya Lewis",
      subject: "Weather plan for Saturday?",
      preview: "If the wind picks up, will we move…",
      time: "9m",
      unread: 2,
      minor: true,
    },
    {
      initials: "DT",
      name: "David Tan",
      subject: "Private lesson availability",
      preview: "Tuesday morning could work for us.",
      time: "48m",
      unread: 1,
      minor: false,
    },
    {
      initials: "CO",
      name: "College Prep · Fall",
      subject: "Program announcement",
      preview: "Sent to 28 eligible players",
      time: "2h",
      unread: 0,
      minor: false,
    },
    {
      initials: "ET",
      name: "Elena Torres",
      subject: "Membership payment",
      preview: "Thank you — updated the card.",
      time: "3h",
      unread: 1,
      minor: false,
    },
  ] as const;
  const active = threads[selected] ?? threads[0]!;
  return (
    <section className="inbox">
      <aside className="inbox-list">
        <label>
          <Search size={16} />
          <input placeholder="Search messages…" />
        </label>
        <div className="inbox-filters">
          <button className="active">
            Open <Numeric>4</Numeric>
          </button>
          <button>All</button>
          <button>Broadcasts</button>
        </div>
        {threads.map((thread, index) => (
          <button
            className={selected === index ? "active" : undefined}
            key={thread.name}
            onClick={() => setSelected(index)}
          >
            <span className="table-avatar">{thread.initials}</span>
            <span>
              <strong>{thread.name}</strong>
              <small>{thread.subject}</small>
              <i>{thread.preview}</i>
            </span>
            <time>{thread.time}</time>
            {thread.unread > 0 && <b>{thread.unread}</b>}
          </button>
        ))}
      </aside>
      <article className="conversation">
        <header>
          <div>
            <span className="table-avatar">{active.initials}</span>
            <span>
              <strong>{active.name}</strong>
              <small>{active.subject}</small>
            </span>
          </div>
          <div>
            <button>
              <UsersRound size={16} /> Details
            </button>
            <button>
              <MoreHorizontal size={17} />
            </button>
          </div>
        </header>
        {active.minor && (
          <div className="guardian-banner">
            <ShieldCheck size={16} />
            <span>
              Guardian-visible thread. Messages involving a minor always include
              their verified guardian.
            </span>
          </div>
        )}
        <div className="conversation-body">
          <time>Today · 9:17 AM</time>
          <div className="message-bubble inbound">
            Hi Sam — if the wind picks up Saturday morning, will the U14 session
            move indoors or be credited?
          </div>
          <div className="message-bubble outbound">
            We’ll make the call by 6:30 AM. If outdoor play isn’t safe, we have
            Duna House held from 8–10. If we cancel instead, Duna will offer
            wallet credit or the original payment method.
          </div>
          <div className="message-bubble inbound">
            Perfect, thank you. Duna House works for us.
          </div>
        </div>
        <footer>
          <div>
            <button>
              <Sparkles size={16} /> Draft with Duna
            </button>
            <Badge>Quiet hours start 8 PM</Badge>
          </div>
          <textarea
            defaultValue="Glad to hear it — we’ll send the final venue update in this thread by 6:30 AM."
            aria-label="Reply"
            rows={3}
          />
          <div>
            <span>Email + in-app · guardian included</span>
            <button>
              <Send size={16} /> Send
            </button>
          </div>
        </footer>
      </article>
    </section>
  );
}

function ReportsPanel() {
  const [metric, setMetric] = useState("Revenue");
  const reportCards = [
    {
      title: "Monthly recurring revenue",
      value: "$31,482",
      delta: "+12.6%",
      tone: "positive",
    },
    {
      title: "Revenue per active player",
      value: "$91.79",
      delta: "+$8.22",
      tone: "positive",
    },
    {
      title: "90-day retention",
      value: "84.3%",
      delta: "+3.1 pts",
      tone: "positive",
    },
    {
      title: "Coach utilization",
      value: "72.8%",
      delta: "6.4 hrs open",
      tone: "neutral",
    },
  ];
  return (
    <>
      <section className="report-controls">
        <div className="segmented">
          {["Revenue", "Retention", "Capacity", "Coaching"].map((item) => (
            <button
              className={metric === item ? "active" : undefined}
              key={item}
              onClick={() => setMetric(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <button>
          <CalendarDays size={16} /> Jul 1 – Jul 30 <ChevronDown size={14} />
        </button>
      </section>
      <section className="report-metrics">
        {reportCards.map((card) => (
          <article key={card.title}>
            <small>{card.title}</small>
            <Numeric>{card.value}</Numeric>
            <span className={card.tone}>{card.delta}</span>
          </article>
        ))}
      </section>
      <section className="reports-grid">
        <article className="hq-card report-main-chart">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">{metric}</span>
              <h2>Earned, deferred, and projected</h2>
            </div>
            <Badge>Accrual-aware</Badge>
          </header>
          <div className="stacked-bars">
            {[48, 55, 51, 62, 58, 70, 68, 74, 81, 79, 88, 92].map(
              (height, index) => (
                <div key={height + index}>
                  <i style={{ height: `${height}%` }} />
                  <b style={{ height: `${Math.max(10, height * 0.22)}%` }} />
                </div>
              ),
            )}
          </div>
          <div className="chart-axis">
            <span>May 8</span>
            <span>May 22</span>
            <span>Jun 5</span>
            <span>Jun 19</span>
            <span>Jul 3</span>
            <span>Jul 17</span>
            <span>Jul 30</span>
          </div>
          <footer>
            <span>
              <i /> Earned revenue <Numeric>$72.8k</Numeric>
            </span>
            <span>
              <i /> Deferred revenue <Numeric>$41.2k</Numeric>
            </span>
          </footer>
        </article>
        <article className="hq-card product-performance">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Product mix</span>
              <h2>What’s working</h2>
            </div>
          </header>
          {[
            ["High Performance 2s", "$18.5k", 94],
            ["U14 Summer", "$14.2k", 82],
            ["Memberships", "$12.9k", 71],
            ["Private coaching", "$5.6k", 48],
            ["Facility + retail", "$5.1k", 44],
          ].map((row) => (
            <div key={row[0]}>
              <span>
                <strong>{row[0]}</strong>
                <Numeric>{row[1]}</Numeric>
              </span>
              <div>
                <i style={{ width: `${row[2]}%` }} />
              </div>
            </div>
          ))}
        </article>
      </section>
      <section className="report-library">
        <div>
          <span className="hq-eyebrow">Saved views</span>
          <h2>Report library</h2>
        </div>
        <div>
          {[
            "Board operating summary",
            "Coach payroll support",
            "Program profitability",
            "Monthly Stripe reconciliation",
            "Membership cohort retention",
            "Facility utilization",
          ].map((name) => (
            <button key={name}>
              <Grid2X2 size={17} />
              <span>{name}</span>
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function AiPanel() {
  const [sent, setSent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <section className="ai-workspace">
      <aside className="ai-threads">
        <button>
          <Plus size={16} /> New conversation
        </button>
        <span className="hq-eyebrow">Today</span>
        <a className="active">Balance Fall League teams</a>
        <a>Why did July revenue rise?</a>
        <span className="hq-eyebrow">Yesterday</span>
        <a>Draft weather update</a>
        <a>Find unused court hours</a>
        <footer>
          <ShieldCheck size={16} /> Organization data only
        </footer>
      </aside>
      <div className="ai-conversation">
        <header>
          <span>
            <Bot size={19} />
          </span>
          <div>
            <strong>Duna AI</strong>
            <small>Grounded in current HQ data · citations included</small>
          </div>
          <Badge tone="positive">Ready</Badge>
        </header>
        <div className="ai-chat">
          <div className="ai-user-message">
            Build eight balanced teams for the Fall League. Keep household
            members apart and honor every availability request.
          </div>
          <div className="ai-answer">
            <span>
              <Sparkles size={17} />
            </span>
            <div>
              <p>
                I found <strong>41 eligible players</strong>. I can form eight
                teams with a <strong>3.1% strength spread</strong>; one player
                would be a rotating substitute.
              </p>
              <div className="ai-citations">
                <button>41 eligible players</button>
                <button>12 constraints</button>
                <button>Rating snapshot · Jul 30</button>
              </div>
              <article className="ai-proposal-card">
                <header>
                  <Badge>Proposed roster</Badge>
                  <span>No changes made</span>
                </header>
                <div>
                  {[4.48, 4.43, 4.41, 4.38, 4.36, 4.33, 4.31, 4.27].map(
                    (rating, index) => (
                      <span key={rating}>
                        <strong>Team {index + 1}</strong>
                        <Numeric>{rating.toFixed(2)}</Numeric>
                      </span>
                    ),
                  )}
                </div>
                <footer>
                  <span>
                    <Check size={14} /> 0 household conflicts
                  </span>
                  <span>
                    <Check size={14} /> 0 availability conflicts
                  </span>
                </footer>
              </article>
              {confirmed ? (
                <div className="ai-confirmed">
                  <Check size={17} /> Draft roster saved. Nothing was published
                  or messaged.
                </div>
              ) : (
                <div className="ai-action-gate">
                  <CircleAlert size={17} />
                  <span>
                    <strong>Confirmation required</strong>
                    <small>
                      This will save a draft roster. It will not publish or
                      message players.
                    </small>
                  </span>
                  <button onClick={() => setConfirmed(true)}>
                    Confirm draft
                  </button>
                </div>
              )}
            </div>
          </div>
          {sent && (
            <div className="ai-user-message">
              Now identify the three most fragile teams and explain why.
            </div>
          )}
        </div>
        <footer className="ai-composer">
          <textarea
            defaultValue={
              sent
                ? ""
                : "Now identify the three most fragile teams and explain why."
            }
            placeholder="Ask about your business…"
            rows={3}
          />
          <div>
            <span>
              Read, analyze, and propose. Changes always require confirmation.
            </span>
            <button onClick={() => setSent(true)}>
              <Send size={16} />
            </button>
          </div>
        </footer>
      </div>
      <aside className="ai-context">
        <span className="hq-eyebrow">Context used</span>
        <h3>Live sources</h3>
        {[
          ["People + eligibility", "41 rows"],
          ["Sand Ratings", "Jul 30 snapshot"],
          ["Availability", "12 constraints"],
          ["League rules", "Fall League draft"],
        ].map((source) => (
          <article key={source[0]}>
            <span>
              <Zap size={14} />
            </span>
            <div>
              <strong>{source[0]}</strong>
              <small>{source[1]}</small>
            </div>
            <Check size={14} />
          </article>
        ))}
        <div className="ai-risk-note">
          <ShieldCheck size={17} />
          <p>
            Money, eligibility, public publishing, and outbound messaging are
            high-risk actions. Duna AI cannot perform them without a fresh human
            confirmation.
          </p>
        </div>
      </aside>
    </section>
  );
}

function SettingsPanel() {
  const [section, setSection] = useState("Organization");
  const sections = [
    "Organization",
    "Brand",
    "Venues",
    "Team + roles",
    "Policies",
    "Payments + tax",
    "Integrations",
    "Billing",
  ];
  return (
    <section className="settings-admin">
      <nav>
        {sections.map((item) => (
          <button
            className={section === item ? "active" : undefined}
            key={item}
            onClick={() => setSection(item)}
          >
            {item}
            <ChevronRight size={15} />
          </button>
        ))}
      </nav>
      <div>
        <section className="settings-form-card">
          <header>
            <div>
              <span className="hq-eyebrow">{section}</span>
              <h2>
                {section === "Organization" ? "Business identity" : section}
              </h2>
            </div>
            <Badge tone="positive">Saved</Badge>
          </header>
          {section === "Organization" ? (
            <div className="form-layout">
              <label>
                <span>Public name</span>
                <input defaultValue={demoOrganization.name} />
              </label>
              <label>
                <span>Legal entity</span>
                <input defaultValue={demoOrganization.legalName} />
              </label>
              <label>
                <span>Primary timezone</span>
                <select defaultValue="America/Los_Angeles">
                  <option>America/Los_Angeles</option>
                </select>
              </label>
              <label>
                <span>Default currency</span>
                <select defaultValue="USD">
                  <option>USD — US Dollar</option>
                </select>
              </label>
              <label className="full">
                <span>Public description</span>
                <textarea
                  defaultValue="Structured training, serious competition, and easy ways into the South Bay beach community."
                  rows={4}
                />
              </label>
            </div>
          ) : section === "Venues" ? (
            <div className="venue-settings">
              {demoVenues.map((venue) => (
                <article key={venue.id}>
                  <span>
                    <MapPin size={17} />
                  </span>
                  <div>
                    <strong>{venue.name}</strong>
                    <small>
                      {venue.city}, {venue.region} · {venue.courtCount} courts
                    </small>
                  </div>
                  <Badge tone={venue.openNow ? "positive" : "neutral"}>
                    {venue.openNow ? "Open" : "Closed"}
                  </Badge>
                  <button>
                    <Settings2 size={16} />
                  </button>
                </article>
              ))}
            </div>
          ) : section === "Payments + tax" ? (
            <div className="integration-list">
              <article>
                <span>
                  <CreditCard size={20} />
                </span>
                <div>
                  <strong>Stripe Connect</strong>
                  <small>
                    Payments, payouts, Terminal, Tax, subscriptions, and 1099
                    support.
                  </small>
                </div>
                <Badge tone="positive">Connected</Badge>
                <button>Manage</button>
              </article>
              <article>
                <span>
                  <Store size={20} />
                </span>
                <div>
                  <strong>Point of sale</strong>
                  <small>Terminal reader pairing and retail catalog.</small>
                </div>
                <Badge tone="positive">Ready</Badge>
                <button>Configure</button>
              </article>
            </div>
          ) : (
            <div className="settings-placeholder">
              <span>
                <Settings2 size={24} />
              </span>
              <h3>{section} controls are ready.</h3>
              <p>
                Typed organization configuration keeps this one shared Duna
                platform—never a bespoke fork.
              </p>
              <button>
                Open {section.toLowerCase()} setup <ArrowRight size={15} />
              </button>
            </div>
          )}
          <footer>
            <span>Last changed by Sam Rivera · 18 minutes ago</span>
            <button>Save changes</button>
          </footer>
        </section>
        <aside className="settings-audit-note">
          <ShieldCheck size={18} />
          <p>
            <strong>Changes are versioned.</strong> Policies, pricing, roles,
            and financial configuration keep before-and-after values in the
            audit log.
          </p>
        </aside>
      </div>
    </section>
  );
}
