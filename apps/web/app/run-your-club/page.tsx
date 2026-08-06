import { formatMoney, ORGANIZATION_PLANS } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarDays,
  Check,
  CreditCard,
  Megaphone,
  Palette,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  WandSparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { DUNA_HQ_URL } from "@/lib/site-urls";

const hqHref = DUNA_HQ_URL;

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
    <main className="club-marketing-page" data-zone="editorial">
      <SiteHeader />
      <section className="club-marketing-hero">
        <div className="club-marketing-hero__media" aria-hidden>
          <Image
            alt=""
            fill
            priority
            sizes="(max-width: 820px) 100vw, 58vw"
            src="/media/brand/duna-club-hero-v1.webp"
          />
        </div>
        <div className="club-marketing-hero__copy">
          <Badge tone="positive">
            <Sparkles size={13} /> Built for clubs and independent coaches
          </Badge>
          <h1>Run the business. Keep the game human.</h1>
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
        <div className="club-marketing-hero__product" data-zone="athletic">
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

      <div className="club-marketing-chapters">
        <section className="club-marketing-chapter club-marketing-chapter--command">
          <header>
            <span className="section__eyebrow">Daily operations</span>
            <h2>One calm plan for every moving part.</h2>
            <p>
              Schedule courts, coaches, equipment, and players together. Smart
              rules protect every booking window, approval, cancellation, and
              waitlist without turning the day into settings work.
            </p>
          </header>
          <div className="club-marketing-chapter__split">
            <div>
              <span className="club-marketing-hq-chip">For one coach</span>
              <span className="club-marketing-hq-chip">For every location</span>
              <CalendarPreview />
            </div>
            <div>
              <small>Rules that travel</small>
              <SmartRulesPreview />
            </div>
          </div>
        </section>

        <section className="club-marketing-chapter club-marketing-chapter--commerce">
          <header>
            <span className="section__eyebrow">Commerce + ledger</span>
            <h2>Revenue, recovery, and the ledger in one line of sight.</h2>
            <p>
              Sell events, services, memberships, credits, and goods. Duna keeps
              checkout, retries, refunds, and the balanced ledger connected so
              operators always know what happened.
            </p>
          </header>
          <div className="club-marketing-pricing" aria-label="Duna HQ pricing">
            {Object.values(ORGANIZATION_PLANS).map((plan) => (
              <article key={plan.id}>
                <small>{plan.productName}</small>
                <strong>
                  {plan.monthlyPriceMinor === 0 ? (
                    "Free"
                  ) : (
                    <>
                      <Numeric tier="block">
                        {formatMoney(plan.monthlyPriceMinor, "USD")}
                      </Numeric>
                      /mo
                    </>
                  )}
                </strong>
                <span>
                  {plan.defaultCommissionBps === 0 ? (
                    <>
                      <Numeric tier="chip">0%</Numeric> organization fee
                    </>
                  ) : (
                    <>
                      <Numeric tier="chip">
                        {plan.defaultCommissionBps / 100}%
                      </Numeric>{" "}
                      organization fee
                    </>
                  )}
                </span>
              </article>
            ))}
          </div>
          <div className="club-marketing-proof">
            <span>
              <strong>Unlimited</strong>
              staff + player records on paid plans
            </span>
            <span>
              <strong>10 months</strong>
              annual price for 12 months of access
            </span>
            <span>
              <strong>Reviewable</strong>
              refunds, retries, and AI suggestions
            </span>
          </div>
          <div className="club-marketing-payment-state">
            <BellRing size={20} />
            <span>
              <small>Payment recovery</small>
              <strong>Retry scheduled automatically</strong>
            </span>
            <Badge tone="positive">Protected</Badge>
          </div>
        </section>

        <section className="club-marketing-chapter club-marketing-chapter--relationships">
          <header>
            <span className="section__eyebrow">Member intelligence</span>
            <h2>Know who is thriving—and who needs a reason to return.</h2>
            <p>
              Explainable retention signals connect bookings, participation,
              membership state, and cancellations. Campaigns stay consent-aware
              and every outbound message remains reviewable.
            </p>
          </header>
          <div className="club-marketing-chapter__split">
            <MarketingFlowPreview />
            <div className="club-marketing-risk-card">
              <span className="avatar">MS</span>
              <span>
                <strong>Member needs attention</strong>
                <small>No connected booking in 24 days</small>
              </span>
              <Badge tone="warning">Watch</Badge>
            </div>
          </div>
        </section>

        <section className="club-marketing-chapter club-marketing-chapter--identity">
          <header>
            <span className="section__eyebrow">Brand system</span>
            <h2>Duna underneath. Your identity out front.</h2>
            <p>
              Supply one club color, approved marks, media, and voice. Duna
              normalizes the hue for readability and previews the identity
              before anything becomes player-facing.
            </p>
          </header>
          <div className="club-marketing-theme-story">
            <div className="club-marketing-theme-preview">
              <span className="club-marketing-theme-chip">One club color</span>
              <span className="club-marketing-theme-chip">Live preview</span>
              <span className="club-marketing-theme-chip">Private draft</span>
              <article>
                <small>Welcome back</small>
                <h3>Find your next session.</h3>
                <button type="button">Book now</button>
              </article>
            </div>
            <ul className="club-marketing-capability-list">
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
          </div>
        </section>
      </div>

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
