import { Icon } from "@duna/ui/icons";
import {
  Avatar,
  Button,
  Card,
  Chip,
  ConditionsLine,
  EmptyState,
  ErrorState,
  MembershipCard,
  NotConfigured,
  Notice,
  RatingRing,
  Rise,
  WalletStack,
  type WalletCard,
} from "@duna/ui/tideline";
import type { ReactNode } from "react";
import { APP_ROUTES } from "@/lib/app-routes";
import { AppLink } from "../navigation";
import type { HomeData } from "./home-data";
import type { HomeClubWallet, HomeItem, HomeModel } from "./home-model";
import { AskDunaPrompt } from "./home-ask";

/** The four primary actions, in the board's order (P-Home). */
const HOME_ACTIONS = [
  {
    key: "find-game",
    title: "Find a game",
    hint: "Open matches and events near you",
    icon: "ball",
    href: APP_ROUTES.search.path,
  },
  {
    key: "book-court",
    title: "Book a court",
    hint: "Open times at your clubs and beaches",
    icon: "court",
    href: APP_ROUTES.plans.path,
  },
  {
    key: "find-coach",
    title: "Find a coach",
    hint: "Lessons, clinics and coaches",
    icon: "coach",
    href: APP_ROUTES.coaches.path,
  },
  {
    key: "add-score",
    title: "Add a score",
    hint: "Your opponents confirm it",
    icon: "trophy",
    href: APP_ROUTES.score.path,
  },
] as const;

function Section({
  id,
  title,
  action,
  children,
  className,
}: {
  readonly id: string;
  readonly title: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section aria-labelledby={id} className={className ?? "aph-section"}>
      <div className="aph-section__head">
        <h2 className="aph-h2" id={id}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ForChip({ name }: { readonly name?: string }) {
  if (!name) return null;
  return (
    <Chip kind="identity" tone="neutral">
      For {name}
    </Chip>
  );
}

function stateTone(item: HomeItem) {
  return item.tone === "info" ? "neutral" : item.tone;
}

function NextUpCard({ item }: { readonly item: HomeItem }) {
  const forecast = item.event?.weather?.hourly
    .slice()
    .sort(
      (left, right) =>
        Math.abs(Date.parse(left.startsAt) - Date.parse(item.startsAt)) -
        Math.abs(Date.parse(right.startsAt) - Date.parse(item.startsAt)),
    )[0];
  const usable =
    forecast &&
    Math.abs(Date.parse(forecast.startsAt) - Date.parse(item.startsAt)) <=
      3 * 3_600_000
      ? forecast
      : undefined;
  const conditions = usable
    ? {
        at: Date.parse(item.startsAt),
        ...(usable.temperatureC !== undefined
          ? { temperatureC: usable.temperatureC }
          : {}),
        ...(usable.windSpeedKph !== undefined
          ? { windSpeedKph: usable.windSpeedKph }
          : {}),
        ...(usable.windGustKph !== undefined
          ? { windGustKph: usable.windGustKph }
          : {}),
        ...(usable.precipitationProbability !== undefined
          ? { precipChancePct: usable.precipitationProbability }
          : {}),
      }
    : null;
  return (
    <Rise>
      <Card className="aph-next">
        <div className="aph-next__top">
          <Chip kind="status" tone={stateTone(item)}>
            {item.stateLabel}
          </Chip>
          <ForChip name={item.forName} />
          <span className="aph-next__countdown td-num">{item.countdown}</span>
        </div>
        <p className="aph-next__day">{item.day}</p>
        <p className="aph-next__time td-num">{item.timeRange}</p>
        <h3 className="aph-next__title">
          <AppLink className="aph-next__link" href={item.href}>
            {item.title}
          </AppLink>
        </h3>
        {item.place ? <p className="td-meta">{item.place}</p> : null}
        {item.participation ? (
          <p className="aph-next__group">
            <Chip
              kind="status"
              tone={
                item.participation.status.startsWith("Needs")
                  ? "attention"
                  : item.participation.status.startsWith("Cancelled")
                    ? "danger"
                    : "positive"
              }
            >
              {item.participation.status}
            </Chip>
            {item.participation.line ? (
              <span className="td-meta">{item.participation.line}</span>
            ) : null}
          </p>
        ) : null}
        <div className="aph-next__conditions">
          <ConditionsLine
            conditions={conditions}
            status={conditions ? "ready" : "no-data"}
            timeZone={item.timeZone}
            {...(item.event?.weather
              ? { readAt: Date.parse(item.event.weather.fetchedAt) }
              : {})}
          />
        </div>
        {item.people.length ? (
          <p className="td-meta">With {item.people.slice(0, 4).join(", ")}</p>
        ) : null}
      </Card>
    </Rise>
  );
}

function NextUp({ data }: { readonly data: HomeData }) {
  const { model } = data;
  return (
    <Section
      action={
        <a className="aph-more" href={APP_ROUTES.plans.path}>
          All plans
        </a>
      }
      id="aph-next"
      title="Next up"
    >
      {data.catalog.state === "error" ? (
        <Notice tone="warning">
          Club sessions didn&rsquo;t load, so this may be missing one. Reference{" "}
          {data.catalog.reference}.
        </Notice>
      ) : null}
      {model.nextUp ? (
        <NextUpCard item={model.nextUp} />
      ) : model.actingFor ? (
        <EmptyState
          actions={
            <Button href={APP_ROUTES.search.path} variant="primary">
              Find a session for {model.subject.firstName}
            </Button>
          }
          description={`Book ${model.subject.firstName} into a clinic or a game and it shows up here.`}
          icon="schedule"
          title={`Nothing booked for ${model.subject.firstName} yet`}
        />
      ) : (
        <EmptyState
          actions={
            <>
              <Button href={APP_ROUTES.search.path} variant="primary">
                Find a game
              </Button>
              <Button href={APP_ROUTES.plans.path} variant="secondary">
                Book a court
              </Button>
            </>
          }
          description="Book a court or join a match and it shows up here, with the time, the place and the conditions."
          icon="schedule"
          title="Nothing booked yet"
        />
      )}
    </Section>
  );
}

function Actions() {
  return (
    <nav aria-label="Primary actions" className="aph-actions">
      {HOME_ACTIONS.map((action) => (
        <AppLink className="aph-action" href={action.href} key={action.key}>
          <span className="aph-action__icon">
            <Icon name={action.icon} size="nav" />
          </span>
          <span className="aph-action__text">
            <span className="aph-action__title">{action.title}</span>
            <span className="td-meta">{action.hint}</span>
          </span>
        </AppLink>
      ))}
    </nav>
  );
}

function YourGame({ model }: { readonly model: HomeModel }) {
  const rating = model.rating;
  if (!rating) {
    return (
      <Section id="aph-game" title={`${model.subject.firstName}'s game`}>
        <Card className="aph-game">
          <p className="td-body">
            Juniors&rsquo; Sand Ratings show on their own profile. Switch back
            to your account to see yours.
          </p>
        </Card>
      </Section>
    );
  }
  return (
    <Section
      action={
        <a className="aph-more" href={APP_ROUTES.performance.path}>
          Results
        </a>
      }
      id="aph-game"
      title="Your game"
    >
      <Card className="aph-game">
        <RatingRing
          delta={rating.delta}
          label="Sand Rating"
          matchesLeft={
            rating.value === null ? Math.max(1, 5 - rating.matchesPlayed) : 0
          }
          reliability={rating.reliability}
          size="card"
          value={rating.value}
        />
        <div className="aph-game__text">
          <p className="aph-game__summary">{rating.summary}</p>
          {rating.form.length ? (
            <p
              aria-label={`Last ${rating.form.length}: ${rating.form
                .map((result) => (result === "W" ? "won" : "lost"))
                .join(", ")}`}
              className="aph-form"
              role="img"
            >
              {rating.form.map((result, index) => (
                <span
                  className="aph-form__result"
                  data-result={result}
                  key={index}
                >
                  {result}
                </span>
              ))}
            </p>
          ) : (
            <p className="td-meta">
              Confirmed results build your rating. Add your first score.
            </p>
          )}
          <Button
            href={
              rating.matchesPlayed
                ? APP_ROUTES.performance.path
                : APP_ROUTES.score.path
            }
            size="sm"
            variant="secondary"
          >
            {rating.matchesPlayed ? "See matches" : "Add a score"}
          </Button>
        </div>
      </Card>
    </Section>
  );
}

function NeedsYou({ model }: { readonly model: HomeModel }) {
  if (model.needsYou.length === 0) return null;
  return (
    <Section id="aph-needs" title={`Needs you · ${model.needsYou.length}`}>
      <ul className="aph-needs">
        {model.needsYou.map((need) => (
          <li key={need.id}>
            <Card className="aph-need">
              <ForChip name={need.forName} />
              <p className="aph-need__title">{need.title}</p>
              <p className="td-meta">{need.detail}</p>
              <Button
                block
                href={need.href}
                size="sm"
                variant={need.kind === "payment" ? "primary" : "secondary"}
              >
                {need.action}
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ThisWeek({ model }: { readonly model: HomeModel }) {
  const quiet = model.actingFor
    ? `${model.subject.firstName}'s clinics, leagues and events show up here.`
    : "Clinics, leagues and events from your clubs show up here.";
  return (
    <Section
      action={
        <a className="aph-more" href={APP_ROUTES.plans.path}>
          Calendar
        </a>
      }
      id="aph-week"
      title="This week"
    >
      {model.week.length ? (
        <ul className="aph-list">
          {model.week.map((item) => (
            <li key={item.id}>
              <AppLink className="aph-row" href={item.href}>
                <span className="aph-row__when">
                  <span className="aph-row__day">{item.day}</span>
                  <span className="td-meta td-num">{item.timeRange}</span>
                </span>
                <span className="aph-row__what">
                  <span className="aph-row__title">{item.title}</span>
                  <span className="td-meta">{item.place}</span>
                </span>
                <span className="aph-row__chips">
                  <ForChip name={item.forName} />
                  <Chip kind="status" tone={stateTone(item)}>
                    {item.participation?.status ?? item.stateLabel}
                  </Chip>
                </span>
              </AppLink>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState description={quiet} icon="league" title="A quiet week" />
      )}
    </Section>
  );
}

function membershipStatus(
  wallet: HomeClubWallet,
): "active" | "paused" | "expired" | "pending" {
  const status = wallet.membershipStatus?.toLowerCase() ?? "";
  if (wallet.status === "frozen" || status.includes("pause")) return "paused";
  if (wallet.status === "closed" || /cancel|expire|ended/.test(status))
    return "expired";
  if (/pending|incomplete|trial|past/.test(status)) return "pending";
  return "active";
}

function Clubs({
  data,
  memberName,
}: {
  readonly data: HomeData;
  readonly memberName: string;
}) {
  const wallets = data.wallets;
  return (
    <Section
      action={
        <a className="aph-more" href={APP_ROUTES.wallet.path}>
          Open wallet
        </a>
      }
      id="aph-clubs"
      title="Your clubs"
    >
      {wallets.state === "error" ? (
        <ErrorState
          message="Your club cards didn't load. Your memberships are safe."
          reference={wallets.reference}
          title="Clubs didn't load"
        />
      ) : wallets.state === "not-configured" ? (
        <NotConfigured compact feature="Club cards" />
      ) : wallets.data.length === 0 ? (
        <EmptyState
          actions={
            <Button href={APP_ROUTES.search.path} size="sm" variant="secondary">
              Find a club
            </Button>
          }
          description="Join a club and its membership card and credits live here."
          icon="member-card"
          title="No club cards yet"
        />
      ) : wallets.data.length === 1 ? (
        <a className="aph-card-link" href={APP_ROUTES.wallet.path}>
          <MembershipCard
            club={{ name: wallets.data[0]!.organizationName }}
            kind="Club member"
            line={`${wallets.data[0]!.credits} credits`}
            member={memberName}
            status={membershipStatus(wallets.data[0]!)}
            {...(wallets.data[0]!.membershipName
              ? { plan: wallets.data[0]!.membershipName }
              : {})}
          />
        </a>
      ) : (
        <WalletStack
          cards={wallets.data.map((wallet): WalletCard => ({
            id: wallet.organizationId,
            club: { name: wallet.organizationName },
            member: memberName,
            kind: "Club member",
            status: membershipStatus(wallet),
            line: `${wallet.credits} credits`,
            ...(wallet.membershipName ? { plan: wallet.membershipName } : {}),
          }))}
          className="aph-wallet"
          label="Your club cards"
        />
      )}
    </Section>
  );
}

function Household({ model }: { readonly model: HomeModel }) {
  if (model.household.length === 0) return null;
  return (
    <Section
      action={
        <a className="aph-more" href={`${APP_ROUTES.settings.path}#household`}>
          Household
        </a>
      }
      id="aph-household"
      title="Your household"
    >
      <ul className="aph-household">
        {model.household.map(({ dependent, next }) => (
          <li key={dependent.personId}>
            <Card className="aph-kid">
              <span className="aph-kid__who">
                <Avatar decorative name={dependent.displayName} size="sm" />
                <span className="aph-row__title">{dependent.displayName}</span>
              </span>
              {next ? (
                <AppLink className="aph-kid__next" href={next.href}>
                  <span className="td-meta">
                    {next.day} ·{" "}
                    <span className="td-num">{next.timeRange}</span>
                  </span>
                  <span>{next.title}</span>
                </AppLink>
              ) : (
                <p className="td-meta">Nothing booked yet.</p>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function WhoIsDunaFor({ hqCreate }: { readonly hqCreate: string }) {
  return (
    <Section id="aph-who" title="Who is Duna for?">
      <p className="td-body">
        Tell us who you&rsquo;re here for and Duna sets up the right things.
      </p>
      <ul className="aph-who">
        <li>
          <Card className="aph-who__card" href={APP_ROUTES.onboarding.path}>
            <Icon name="player" size="nav" />
            <span className="aph-action__title">Me</span>
            <span className="td-meta">
              Your level, where you play, your rating
            </span>
          </Card>
        </li>
        <li>
          <Card
            className="aph-who__card"
            href={`${APP_ROUTES.settings.path}#household`}
          >
            <Icon name="junior-guardian" size="nav" />
            <span className="aph-action__title">My junior</span>
            <span className="td-meta">Add a child you book and pay for</span>
          </Card>
        </li>
        <li>
          <Card className="aph-who__card" href={hqCreate}>
            <Icon name="layout" size="nav" />
            <span className="aph-action__title">My club</span>
            <span className="td-meta">
              Run courts, sessions and members in Duna HQ
            </span>
          </Card>
        </li>
      </ul>
    </Section>
  );
}

/** Player web Home (board P-Home / M-Home-390), mirroring the Player app's Home. */
export function HomeView({ data }: { readonly data: HomeData }) {
  const { model, session } = data;
  const person = session.person!;
  const underThirteen = session.ageBand === "under-13";
  const hqCreate = `${session.hqUrl}/setup/start?mode=create`;
  const lead = model.actingFor
    ? `You're seeing ${model.subject.firstName}'s plans as their guardian.`
    : model.needsYou.length
      ? `${model.needsYou.length === 1 ? "One thing needs" : `${model.needsYou.length} things need`} you.`
      : model.nextUp
        ? `${model.nextUp.title} is ${model.nextUp.day.toLowerCase() === "today" ? "today" : model.nextUp.day === "Tomorrow" ? "tomorrow" : `on ${model.nextUp.day}`}.`
        : model.firstUse
          ? "Welcome to Duna. Here's where your games, courts and clubs will live."
          : "Nothing on your calendar. A good day to find a game.";
  return (
    <div className="aph" data-acting={model.actingFor || undefined}>
      <header className="aph-head">
        <p className="aph-eyebrow">{model.dateLine}</p>
        <h1 className="td-display aph-title">{model.greeting}</h1>
        <p className="td-lead">{lead}</p>
      </header>

      {underThirteen ? (
        <Notice
          tone="info"
          title="Your parent or guardian manages this account"
        >
          They book and pay for your sessions. You can see your plans and
          results here.
        </Notice>
      ) : null}
      {data.onboarding === "guardian-required" ? (
        <Notice tone="attention" title="Waiting for a parent or guardian">
          A parent or guardian needs to approve this account before you can
          book. <a href={APP_ROUTES.settings.path}>See what&rsquo;s needed</a>
        </Notice>
      ) : null}

      <div className="aph-top">
        <div className="aph-top__next">
          <NextUp data={data} />
        </div>
        {model.actingFor || underThirteen ? null : (
          <div className="aph-top__actions">
            <Actions />
          </div>
        )}
        <div className="aph-top__game">
          <YourGame model={model} />
        </div>
      </div>

      {!model.actingFor &&
      (data.onboarding === "not-started" ||
        data.onboarding === "in-progress") ? (
        <WhoIsDunaFor hqCreate={hqCreate} />
      ) : null}

      <NeedsYou model={model} />
      <Household model={model} />
      <ThisWeek model={model} />
      {model.actingFor ? null : (
        <Clubs data={data} memberName={person.displayName} />
      )}
      {model.actingFor ? null : <AskDunaPrompt firstName={person.firstName} />}
    </div>
  );
}
