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
}: {
  readonly kind: ClubFeatureVisualKind;
}) {
  const isService = kind === "services";
  const isPlan = kind === "plans";
  const isInventory = kind === "inventory";
  return (
    <div className={styles.builderVisual} data-kind={kind}>
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
              <strong>Match balls · 12</strong>
              <small>Coach kit · Court 3</small>
            </span>
            <b>Checked out</b>
          </div>
          <div>
            <span>Received</span>
            <strong>+24</strong>
            <small>$31.50 each</small>
          </div>
          <div>
            <span>Coach checkout</span>
            <strong>−12</strong>
            <small>Jordan Cruz</small>
          </div>
          <div>
            <span>Available</span>
            <strong>12</strong>
            <small>2 reserved</small>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.builderProgress} aria-label="Builder progress">
            <i /> <i /> <i /> <i />
          </div>
          <div className={styles.builderColumns}>
            <section>
              <small>What are you crafting?</small>
              <h3>
                {isService
                  ? "First-ball assessment"
                  : isPlan
                    ? "Season training pass"
                    : "Complete club offer"}
              </h3>
              <div className={styles.builderChoiceRow}>
                {(isService
                  ? ["Outcome", "Coach", "Schedule"]
                  : isPlan
                    ? ["Access", "Credits", "Billing"]
                    : ["Story", "Pricing", "Delivery"]
                ).map((label, index) => (
                  <span data-active={index === 0} key={label}>
                    {label}
                  </span>
                ))}
              </div>
              <p>
                {isService
                  ? "See how a player moves, then leave with the next three priorities."
                  : isPlan
                    ? "Eight sessions, member booking access, and one assessment."
                    : "Build the value, rules, price, and customer experience together."}
              </p>
            </section>
            <aside>
              <small>Customer preview</small>
              <strong>
                {isService ? "$95" : isPlan ? "$420" : "Ready to publish"}
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

function PeopleTeamVisual({ kind }: { readonly kind: "team" | "people" }) {
  const people = kind === "people";
  const rows: readonly (readonly [string, string, string])[] = people
    ? [
        ["Maya Rivera", "Goal · stronger first contact", "Shared"],
        ["Mara Lewis", "Guardian connected", "Ready"],
        ["Theo Park", "Check-in · private", "Private"],
      ]
    : [
        ["Jordan Cruz", "Private lessons · 14h", "Available"],
        ["Maya Rivera", "Youth program · 8h", "Assigned"],
        ["Drew Park", "Open play · 6h", "Review"],
      ];
  return (
    <div className={styles.peopleVisual}>
      <header>
        <span>{people ? "People" : "Team"}</span>
        <small>{people ? "Relationship context" : "This week"}</small>
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
              ? "Sharing stays player-controlled"
              : "Duna Pro keeps the day in reach"}
          </strong>
          <small>
            {people
              ? "Health summaries can be revoked at any time."
              : "Check-in, payments, notes, and exceptions."}
          </small>
        </span>
      </footer>
    </div>
  );
}

function OperationsVisual({
  kind,
}: {
  readonly kind: "events" | "leagues" | "venues" | "training";
}) {
  if (kind === "venues") {
    return (
      <div className={styles.venueVisual}>
        <header>
          <span>South Bay Beach Club</span>
          <strong>68% utilized</strong>
        </header>
        <div className={styles.courtMap}>
          {["Court 1", "Court 2", "Court 3", "Court 4"].map((court, index) => (
            <article data-use={index} key={court}>
              <span>{court}</span>
              <small>
                {
                  [
                    "Lesson · 4 PM",
                    "Rental · 5 PM",
                    "League · 6 PM",
                    "Open · 6 PM",
                  ][index]
                }
              </small>
            </article>
          ))}
        </div>
        <footer>
          <MapPinned aria-hidden />
          <span>Rentals, services, and events share the same court truth.</span>
        </footer>
      </div>
    );
  }
  if (kind === "training") {
    return (
      <div className={styles.trainingVisual}>
        <header>
          <span>Fall Competition Build</span>
          <small>Week 4 of 8</small>
        </header>
        <div className={styles.weekStrip}>
          {[58, 68, 74, 61, 80, 72, 54, 40].map((load, index) => (
            <i
              data-current={index === 3}
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
            <strong>Sideout under pressure</strong>
            <small>90 min · 2 courts · load estimate visible</small>
          </span>
          <b>Tue</b>
        </article>
      </div>
    );
  }
  if (kind === "leagues") {
    return (
      <div className={styles.leagueVisual}>
        <header>
          <span>Tuesday Night League</span>
          <small>Week 6</small>
        </header>
        {["Sand Shift", "Net Results", "High Line", "Sideout Club"].map(
          (team, index) => (
            <article key={team}>
              <b>{index + 1}</b>
              <span>
                <strong>{team}</strong>
                <small>{["5–1", "4–2", "4–2", "3–3"][index]}</small>
              </span>
              <i
                style={
                  {
                    "--standing": `${[92, 78, 70, 56][index]}%`,
                  } as CSSProperties
                }
              />
            </article>
          ),
        )}
      </div>
    );
  }
  return (
    <div className={styles.eventVisual}>
      <header>
        <span>Junior Showcase</span>
        <b>42 / 48</b>
      </header>
      <div>
        <article>
          <small>Registration</small>
          <strong>6 spots</strong>
          <span>Waivers follow purchase</span>
        </article>
        <article>
          <small>Courts</small>
          <strong>4 ready</strong>
          <span>Staffing attached</span>
        </article>
      </div>
      <footer>
        {["Publish", "Register", "Check in", "Score"].map((label, index) => (
          <span data-active={index < 2} key={label}>
            <Check aria-hidden /> {label}
          </span>
        ))}
      </footer>
    </div>
  );
}

function GrowthVisual({
  kind,
}: {
  readonly kind: "money" | "marketing" | "messaging" | "safety";
}) {
  if (kind === "money") {
    return (
      <div className={styles.moneyVisual}>
        <header>
          <span>Today</span>
          <strong>$4,280</strong>
        </header>
        <div className={styles.moneyBars}>
          {[42, 64, 48, 78, 58, 91, 72].map((height, index) => (
            <i key={index} style={{ "--bar": `${height}%` } as CSSProperties} />
          ))}
        </div>
        <article>
          <CheckCircle2 aria-hidden />
          <span>
            <strong>Order → payment → fulfillment</strong>
            <small>Every state keeps its source.</small>
          </span>
        </article>
      </div>
    );
  }
  if (kind === "marketing") {
    return (
      <div className={styles.flowVisual}>
        <header>
          <Sparkles aria-hidden />
          <span>Duna AI · draft for review</span>
        </header>
        {["Audience", "Message", "Approval"].map((label, index) => (
          <article key={label}>
            <small>{label}</small>
            <strong>
              {
                [
                  "Members with credits expiring",
                  "Book your next court",
                  "Operator reviews and sends",
                ][index]
              }
            </strong>
            <i data-done={index < 2}>
              {index < 2 ? <Check aria-hidden /> : index + 1}
            </i>
          </article>
        ))}
      </div>
    );
  }
  if (kind === "messaging") {
    return (
      <div className={styles.messageVisual}>
        <header>
          <span>Tuesday Night League</span>
          <small>18 participants</small>
        </header>
        <article data-side="left">
          Court 3 is closed. Tonight’s first round moves to Court 1.
        </article>
        <article data-side="right">
          Got it. Does our 6:40 start stay the same?
        </article>
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
  return (
    <div className={styles.safetyVisual}>
      <header>
        <ShieldCheck aria-hidden />
        <span>Authority and consent</span>
      </header>
      {[
        "Guardian relationship",
        "Summer waiver · v3",
        "Profile visibility",
        "Health sharing",
      ].map((label, index) => (
        <article key={label}>
          <span>
            <strong>{label}</strong>
            <small>
              {
                [
                  "Verified adult",
                  "Signed by guardian",
                  "Player controlled",
                  "Revocable summary",
                ][index]
              }
            </small>
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

function VisionWatchVisual({ kind }: { readonly kind: "vision" | "watch" }) {
  if (kind === "watch") {
    return (
      <div className={styles.watchVisual}>
        <div className={styles.watchCase}>
          <div className={styles.watchFace}>
            <small>DRILL 03</small>
            <strong>02:18</strong>
            <span>
              <b>6</b>
              <i>Side score</i>
              <b>4</b>
            </span>
            <button type="button">
              <Radio aria-hidden /> Tag rally
            </button>
          </div>
        </div>
        <span className={styles.watchCue}>
          <Check aria-hidden /> Cue saved to session
        </span>
      </div>
    );
  }
  return (
    <div className={styles.visionVisual}>
      <header>
        <span>
          <Radio aria-hidden /> Duna Vision
        </span>
        <small>Practice · private</small>
      </header>
      <div className={styles.visionCourt}>
        <i />
        <i />
        <i />
        <i />
        <span>Visible court · calibrated</span>
      </div>
      <div className={styles.visionTimeline}>
        <b />
        <i style={{ left: "22%" }} />
        <i style={{ left: "48%" }} />
        <i style={{ left: "76%" }} />
      </div>
      <footer>
        <strong>Flagged rally · 14:32</strong>
        <span>Open source-linked review</span>
      </footer>
    </div>
  );
}

function FeatureVisual({ kind }: { readonly kind: ClubFeatureVisualKind }) {
  switch (kind) {
    case "products":
    case "services":
    case "plans":
    case "inventory":
      return <ProductBuilderVisual kind={kind} />;
    case "team":
    case "people":
      return <PeopleTeamVisual kind={kind} />;
    case "events":
    case "leagues":
    case "venues":
    case "training":
      return <OperationsVisual kind={kind} />;
    case "money":
    case "marketing":
    case "messaging":
    case "safety":
      return <GrowthVisual kind={kind} />;
    case "vision":
    case "watch":
      return <VisionWatchVisual kind={kind} />;
  }
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
        <div className={styles.journey}>
          {feature.journey.map((step, index) => (
            <article data-feature-reveal key={step.title}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <span>
                <small>
                  {index === 0
                    ? "Start"
                    : index === 1
                      ? "Connect"
                      : "Carry forward"}
                </small>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </span>
            </article>
          ))}
        </div>
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
