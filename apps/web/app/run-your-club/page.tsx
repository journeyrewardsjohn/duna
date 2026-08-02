import { Badge } from "@duna/ui";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarDays,
  Check,
  CreditCard,
  Layers3,
  Megaphone,
  Palette,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  WandSparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

const hqHref = process.env.NEXT_PUBLIC_HQ_URL ?? "http://localhost:3001";

function SmartRulesPreview() {
  return (
    <div
      className="club-marketing-smart-rules"
      aria-label="Smart Rules preview"
    >
      {[
        ["Waitlist", true],
        ["Free cancellation", true],
        ["Advance booking window", true],
        ["Auto-cancel low attendance", false],
      ].map(([label, active]) => (
        <div key={String(label)}>
          <span>{label}</span>
          <i className={active ? "active" : ""} aria-hidden />
        </div>
      ))}
    </div>
  );
}

function CalendarPreview() {
  return (
    <div className="club-marketing-calendar" aria-label="Calendar preview">
      {["Mon", "Tue", "Wed", "Thu"].map((day, index) => (
        <div key={day}>
          <span>{day}</span>
          {index !== 1 && (
            <article>
              <small>{index === 2 ? "5:30 PM" : "9:00 AM"}</small>
              <strong>
                {index === 0
                  ? "Private lesson"
                  : index === 2
                    ? "Open play"
                    : "Youth clinic"}
              </strong>
            </article>
          )}
        </div>
      ))}
    </div>
  );
}

function MarketingFlowPreview() {
  return (
    <div className="club-marketing-flow" aria-label="Marketing flow preview">
      <article>
        <small>Segment</small>
        <strong>Members at risk</strong>
      </article>
      <span aria-hidden />
      <article>
        <small>Trigger</small>
        <strong>No booking in 21 days</strong>
      </article>
      <span aria-hidden />
      <article>
        <small>Action</small>
        <strong>Send a personal reminder</strong>
      </article>
    </div>
  );
}

export default function RunYourClubPage() {
  const capabilities: readonly [LucideIcon, string, string][] = [
    [CalendarDays, "Booking + calendar", "Court and coach availability"],
    [CreditCard, "Commerce", "Events, services, plans, and goods"],
    [WalletCards, "Wallet + ledger", "Credits, refunds, and audit trail"],
    [Users, "Team", "Roles, availability, goals, and compensation"],
    [Megaphone, "Marketing", "Campaigns, automations, and consent"],
    [Palette, "Theme Kit", "Your colors, media, type, and layout"],
    [BarChart3, "Performance", "Bookings, retention, and offer health"],
    [ShieldCheck, "Operations", "Scoped access and reviewable changes"],
  ];
  return (
    <main className="club-marketing-page">
      <SiteHeader />
      <section className="club-marketing-hero">
        <div className="club-marketing-hero__copy">
          <Badge tone="positive">
            <Sparkles size={13} /> Built for clubs and independent coaches
          </Badge>
          <h1>
            Run the business.
            <br />
            Keep the game human.
          </h1>
          <p>
            Duna HQ brings scheduling, memberships, court inventory, payments,
            staff, events, and member communication into one calm operating
            system.
          </p>
          <div>
            <a className="club-marketing-primary" href={hqHref}>
              Open Duna HQ <ArrowRight size={17} />
            </a>
            <Link className="club-marketing-secondary" href="/create">
              Start with one event
            </Link>
          </div>
          <small>
            Start as one coach. Add locations, courts, and a team when you are
            ready.
          </small>
        </div>
        <div className="club-marketing-hero__product">
          <div className="club-marketing-product-bar">
            <span>DUNA HQ</span>
            <Badge>Today</Badge>
          </div>
          <div className="club-marketing-product-grid">
            <section>
              <span>Today at a glance</span>
              <h2>Seven sessions. One clear day.</h2>
              <CalendarPreview />
            </section>
            <aside>
              <WandSparkles size={19} />
              <small>Duna AI</small>
              <h3>Two courts are quiet after 4 PM.</h3>
              <p>Publish a level-matched pickup and invite nearby regulars?</p>
              <button type="button">Review suggestion</button>
            </aside>
          </div>
        </div>
      </section>

      <section className="club-marketing-audience">
        <div>
          <span className="section__eyebrow">One system, your shape</span>
          <h2>Useful on day one. Still coherent when you grow.</h2>
        </div>
        <div>
          <article>
            <span>
              <Users size={20} />
            </span>
            <h3>For a single coach</h3>
            <p>
              Sell lessons, publish availability, collect payment, understand
              income, and keep every player relationship in one place.
            </p>
          </article>
          <article>
            <span>
              <Layers3 size={20} />
            </span>
            <h3>For a club or facility</h3>
            <p>
              Coordinate staff, courts, leagues, memberships, goods, taxes,
              calendars, and the customer experience without stitching tools
              together.
            </p>
          </article>
        </div>
      </section>

      <section className="club-marketing-feature-grid">
        <article className="club-marketing-feature club-marketing-feature--rules">
          <div className="club-marketing-feature__visual">
            <SmartRulesPreview />
          </div>
          <span className="section__eyebrow">Smart Rules</span>
          <h2>Easy controls, enforced consistently.</h2>
          <p>
            Set booking windows, approvals, cancellation terms, waitlists, and
            minimum attendance once. Duna applies the rule during discovery,
            checkout, reminders, and changes.
          </p>
        </article>

        <article className="club-marketing-feature">
          <div className="club-marketing-feature__visual">
            <CalendarPreview />
          </div>
          <span className="section__eyebrow">One synced schedule</span>
          <h2>Courts, coaches, equipment, and players stay aligned.</h2>
          <p>
            View by day, week, month, coach, or court. Duna checks conflicts
            before a change and prepares the notifications before anything
            moves.
          </p>
        </article>

        <article className="club-marketing-feature club-marketing-feature--plans">
          <div className="club-marketing-plan-cards">
            <span>Access membership</span>
            <span>10-credit pack</span>
            <span>Annual training tier</span>
          </div>
          <span className="section__eyebrow">Plans + memberships</span>
          <h2>Flexible value without a rigid pricing model.</h2>
          <p>
            Offer memberships, credits, included sessions, member pricing,
            monthly or annual billing, and limited access—all scoped to your
            organization.
          </p>
        </article>

        <article className="club-marketing-feature club-marketing-feature--payments">
          <div className="club-marketing-payment-state">
            <BellRing size={20} />
            <span>
              <small>Payment recovery</small>
              <strong>Retry scheduled automatically</strong>
            </span>
            <Badge tone="positive">Protected</Badge>
          </div>
          <span className="section__eyebrow">Payments that recover</span>
          <h2>Less chasing. More recurring revenue kept.</h2>
          <p>
            Secure checkout, automatic retries, member reminders, connected
            refunds, organization credits, and a balanced ledger keep money
            movement understandable.
          </p>
        </article>

        <article className="club-marketing-feature club-marketing-feature--marketing">
          <div className="club-marketing-feature__visual">
            <MarketingFlowPreview />
          </div>
          <span className="section__eyebrow">Simple marketing</span>
          <h2>Segment. Trigger. Act.</h2>
          <p>
            Reach the right members by email, SMS, RCS, WhatsApp, or push.
            Consent and guardian routing stay attached to the audience, while
            Duna does the complex work underneath.
          </p>
        </article>

        <article className="club-marketing-feature club-marketing-feature--people">
          <div className="club-marketing-risk-card">
            <span className="avatar">MS</span>
            <span>
              <strong>Member needs attention</strong>
              <small>No connected booking in 24 days</small>
            </span>
            <Badge tone="warning">Watch</Badge>
          </div>
          <span className="section__eyebrow">Community intelligence</span>
          <h2>Know who is thriving—and who may drift away.</h2>
          <p>
            Explainable retention signals use real bookings, participation,
            membership state, and cancellations. Every reason is visible; no
            mystery score pretends to know more than the data.
          </p>
        </article>
      </section>

      <section className="club-marketing-capabilities">
        <div>
          <span className="section__eyebrow">Everything connected</span>
          <h2>A full operating system that still feels simple.</h2>
          <p>
            Each overview shows what exists and how it performs. Focused create
            and edit workspaces appear only when you need to build.
          </p>
        </div>
        <ul>
          {capabilities.map(([Icon, title, detail]) => (
            <li key={title}>
              <Icon size={19} />
              <span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
              <Check size={16} />
            </li>
          ))}
        </ul>
      </section>

      <section className="club-marketing-theme-story">
        <div>
          <Palette size={22} />
          <span className="section__eyebrow">
            Your club, presented as yours
          </span>
          <h2>Duna underneath. Your identity out front.</h2>
          <p>
            Choose a palette, typography, card style, logo, media, and profile
            layout. Preview every change before publishing to web and app.
          </p>
        </div>
        <div className="club-marketing-theme-preview">
          <span className="club-marketing-theme-chip">Palette</span>
          <span className="club-marketing-theme-chip">Typography</span>
          <span className="club-marketing-theme-chip">Layout</span>
          <article>
            <small>Welcome back</small>
            <h3>Find your next session.</h3>
            <button type="button">Book now</button>
          </article>
        </div>
      </section>

      <section className="club-marketing-cta">
        <span className="section__eyebrow">Start at your size</span>
        <h2>One lesson, one event, or the whole club.</h2>
        <p>
          Begin with the job you need done today. Duna keeps the foundation
          ready for everything that comes next.
        </p>
        <div>
          <a className="club-marketing-primary" href={hqHref}>
            Run your business on Duna <ArrowRight size={17} />
          </a>
          <Link className="club-marketing-secondary" href="/create">
            Create an event first
          </Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
