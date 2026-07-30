import { demoOrganization, demoPeople } from "@duna/core/demo";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  CalendarPlus,
  Check,
  ChevronRight,
  CircleAlert,
  CreditCard,
  MessageSquareText,
  MoreHorizontal,
  Sparkles,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { quickActions } from "./navigation";

const schedule = [
  {
    time: "8:00",
    suffix: "AM",
    title: "U14 Summer Training",
    place: "Manhattan Beach · Courts 1–3",
    coach: "Sam Rivera",
    count: "18 / 20",
    status: "Checked in",
  },
  {
    time: "10:00",
    suffix: "AM",
    title: "Serve + Receive Lab",
    place: "Manhattan Beach · Court 4",
    coach: "Theo Park",
    count: "8 / 8",
    status: "Full",
  },
  {
    time: "4:30",
    suffix: "PM",
    title: "High Performance 2s",
    place: "Hermosa Beach · Courts 5–6",
    coach: "Sam Rivera",
    count: "11 / 12",
    status: "Ready",
  },
  {
    time: "6:00",
    suffix: "PM",
    title: "South Bay Summer Series",
    place: "Hermosa Beach · Courts 1–8",
    coach: "League operations",
    count: "24 / 24",
    status: "Week 5",
  },
] as const;

const attention = [
  {
    icon: CircleAlert,
    tone: "warning" as const,
    title: "2 waivers expire before Saturday",
    detail: "U14 roster · guardians can renew in one tap",
    action: "Review",
  },
  {
    icon: CreditCard,
    tone: "danger" as const,
    title: "3 failed membership renewals",
    detail: "$474.00 at risk · automatic recovery is running",
    action: "Open",
  },
  {
    icon: MessageSquareText,
    tone: "neutral" as const,
    title: "4 conversations need a reply",
    detail: "Oldest waiting 2h 18m",
    action: "Reply",
  },
] as const;

export function OperatorOverview() {
  return (
    <main className="hq-page">
      <header className="hq-page-heading">
        <div>
          <span className="hq-eyebrow">Thursday · July 30</span>
          <h1>Good morning, Sam.</h1>
          <p>
            {demoOrganization.name} has <strong>61 players</strong> on sand
            today.
          </p>
        </div>
        <div>
          <button className="hq-button hq-button--secondary">
            <CalendarPlus aria-hidden size={17} /> Add to calendar
          </button>
          <Link className="hq-button hq-button--primary" href="/programs">
            Create <ChevronRight aria-hidden size={17} />
          </Link>
        </div>
      </header>

      <section className="metric-grid">
        <article>
          <span>
            <small>Gross sales · July</small>
            <TrendingUp aria-hidden size={17} />
          </span>
          <Numeric>$84,260</Numeric>
          <p>
            <strong>+18.4%</strong> from June
          </p>
          <div className="spark-bars" aria-hidden>
            {[31, 42, 37, 50, 44, 58, 62, 54, 69, 78, 73, 86].map((value) => (
              <i key={value} style={{ height: `${value}%` }} />
            ))}
          </div>
        </article>
        <article>
          <span>
            <small>Active people</small>
            <UsersRound aria-hidden size={17} />
          </span>
          <Numeric>{demoOrganization.memberCount}</Numeric>
          <p>
            <strong>+46</strong> this month
          </p>
          <div className="metric-avatars">
            {demoPeople.slice(0, 4).map((person) => (
              <span key={person.id}>{person.initials}</span>
            ))}
            <small>+914</small>
          </div>
        </article>
        <article>
          <span>
            <small>Fill rate</small>
            <Check aria-hidden size={17} />
          </span>
          <Numeric>87.4%</Numeric>
          <p>
            <strong>+5.2 pts</strong> vs. target
          </p>
          <div className="meter">
            <i style={{ width: "87.4%" }} />
          </div>
        </article>
        <article>
          <span>
            <small>Projected payout</small>
            <CreditCard aria-hidden size={17} />
          </span>
          <Numeric>$61,884</Numeric>
          <p>
            Arrives <strong>Friday</strong>
          </p>
          <Badge tone="positive">Stripe connected</Badge>
        </article>
      </section>

      <section className="overview-grid">
        <article className="hq-card today-card">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Live operations</span>
              <h2>Today on sand</h2>
            </div>
            <Link href="/calendar">
              Full calendar <ArrowRight size={15} />
            </Link>
          </header>
          <div className="today-list">
            {schedule.map((item, index) => (
              <article key={item.title}>
                <time>
                  <Numeric>{item.time}</Numeric>
                  <small>{item.suffix}</small>
                </time>
                <i className={index === 0 ? "live" : undefined} />
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.place}</span>
                </div>
                <div>
                  <small>Lead</small>
                  <span>{item.coach}</span>
                </div>
                <div>
                  <small>Roster</small>
                  <Numeric>{item.count}</Numeric>
                </div>
                <Badge tone={index === 0 ? "live" : "neutral"}>
                  {item.status}
                </Badge>
                <button aria-label={`More options for ${item.title}`}>
                  <MoreHorizontal size={18} />
                </button>
              </article>
            ))}
          </div>
        </article>

        <aside className="hq-card attention-card">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Action queue</span>
              <h2>Needs attention</h2>
            </div>
            <Badge tone="warning">9</Badge>
          </header>
          <div>
            {attention.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title}>
                  <span>
                    <Icon aria-hidden size={18} />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </div>
                  <button>{item.action}</button>
                </article>
              );
            })}
          </div>
          <Link href="/messages">
            Open full queue <ArrowRight size={15} />
          </Link>
        </aside>
      </section>

      <section className="lower-overview-grid">
        <article className="hq-card revenue-card">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Net operating view</span>
              <h2>Revenue pulse</h2>
            </div>
            <div className="segmented">
              <button className="active">30 days</button>
              <button>Quarter</button>
            </div>
          </header>
          <div className="revenue-chart">
            <div className="revenue-chart__labels">
              <span>$100k</span>
              <span>$75k</span>
              <span>$50k</span>
              <span>$25k</span>
              <span>$0</span>
            </div>
            <svg
              aria-label="Revenue increased steadily through July"
              preserveAspectRatio="none"
              viewBox="0 0 760 240"
            >
              <defs>
                <linearGradient id="revenue-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#63e3db" stopOpacity=".22" />
                  <stop offset="1" stopColor="#63e3db" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 210 C70 195 90 188 145 192 S220 140 280 151 S365 128 420 122 S510 84 570 102 S660 65 760 45 L760 240 L0 240Z"
                fill="url(#revenue-fill)"
              />
              <path
                d="M0 210 C70 195 90 188 145 192 S220 140 280 151 S365 128 420 122 S510 84 570 102 S660 65 760 45"
                fill="none"
                stroke="#63e3db"
                strokeLinecap="round"
                strokeWidth="3"
              />
            </svg>
            <div className="revenue-chart__months">
              <span>Jul 1</span>
              <span>Jul 8</span>
              <span>Jul 15</span>
              <span>Jul 22</span>
              <span>Jul 30</span>
            </div>
          </div>
          <div className="revenue-legend">
            <span>
              <i /> Program + event revenue <Numeric>$72.8k</Numeric>
            </span>
            <span>
              <i /> Facility + retail <Numeric>$11.5k</Numeric>
            </span>
          </div>
        </article>

        <article className="hq-card ai-brief-card">
          <header>
            <span>
              <Sparkles aria-hidden size={17} />
            </span>
            <Badge>Duna AI · read only</Badge>
          </header>
          <h2>Three useful things to know.</h2>
          <ol>
            <li>
              <Numeric>01</Numeric>
              <p>
                Friday Lights will likely sell out by 2 PM tomorrow. Four
                waitlisted 4.0+ players fit the open spots.
              </p>
            </li>
            <li>
              <Numeric>02</Numeric>
              <p>
                The U14 program’s Tuesday session is under capacity while
                Thursday has a waitlist of six.
              </p>
            </li>
            <li>
              <Numeric>03</Numeric>
              <p>
                Membership recovery recovered $1,104 this week. Three renewals
                still need a personal note.
              </p>
            </li>
          </ol>
          <Link href="/ai">
            Explore with Duna AI <ArrowRight size={15} />
          </Link>
        </article>
      </section>

      <section className="quick-action-strip">
        <div>
          <span className="hq-eyebrow">Quick actions</span>
          <h2>Keep moving.</h2>
        </div>
        <div>
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button key={action.label}>
                <Icon aria-hidden size={18} />
                <span>{action.label}</span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
