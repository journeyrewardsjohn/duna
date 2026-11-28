import type { MatchSummary, PersonSummary } from "@duna/core";
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  MembershipCard,
  RatingRing,
  assignWalletArt,
  clubSummaryCard,
} from "@duna/ui/tideline";
import { AppLink } from "@/components/app-shell/navigation";
import type { AppSession } from "@/components/app-shell/session-types";
import type { PlayerSettingsData } from "../api-types";
import { historyModel } from "../matches/history-model";
import { ringProps } from "../result-copy";
import { PrivacyChoice } from "../settings/privacy-choice";

export interface ProfileClubWallet {
  readonly organizationId: string;
  readonly organizationSlug: string;
  readonly organizationName: string;
  readonly credits: number;
  readonly status: "active" | "frozen" | "closed";
  readonly membershipName?: string;
  readonly membershipStatus?: string;
  readonly membershipCurrentPeriodEndsAt?: string;
}

const RELATION_STATE = (member: PlayerSettingsData["household"][number]) =>
  member.verified
    ? { label: "Verified", tone: "positive" as const }
    : { label: "Pending review", tone: "warning" as const };

/** Who I am as other players see me, and what is public (P-WEB-1). */
export function ProfileView({
  session,
  me,
  settings,
  wallets,
  matches,
  timeZone,
}: {
  readonly session: AppSession;
  readonly me: PersonSummary;
  readonly settings: PlayerSettingsData;
  readonly wallets: readonly ProfileClubWallet[] | null;
  readonly matches: readonly MatchSummary[];
  readonly timeZone: string;
}) {
  const ring = ringProps({ rating: me.rating });
  const provisional = me.rating.confidence === "Provisional";
  const profile = settings.profile;
  const recent = historyModel({
    matches: matches.slice(0, 5),
    myId: me.id,
    now: new Date(),
    timeZone,
  });
  const art = assignWalletArt(
    (wallets ?? []).map((wallet) => ({ id: wallet.organizationId })),
  );
  return (
    <>
      <header className="pp-head pp-identity">
        <Avatar
          name={me.displayName}
          size="lg"
          {...(me.avatarUrl ? { src: me.avatarUrl } : {})}
        />
        <div className="pp-head__text">
          <h1 className="td-display pp-title">{me.displayName}</h1>
          <p className="td-lead">
            @{me.handle}
            {me.homeMarket ? ` · ${me.homeMarket}` : ""}
          </p>
          <p className="pp-chips">
            <Chip kind="status" tone="neutral">
              {settings.publicIdentity.tier === "verified-pro"
                ? "Verified pro"
                : "Claimed profile"}
            </Chip>
            {profile.person.isMinor ? (
              <Chip kind="status" tone="info">
                Junior account
              </Chip>
            ) : null}
          </p>
        </div>
        <div className="pp-head__actions">
          <Button href="/app/settings#profile" variant="secondary">
            Edit profile
          </Button>
        </div>
      </header>

      <section aria-labelledby="pp-rating" className="pp-split">
        <Card className="pp-rating">
          <RatingRing
            label="Sand Rating"
            reliability={ring.reliability}
            size="card"
            value={ring.value}
            {...(ring.delta !== undefined ? { delta: ring.delta } : {})}
          />
          <div className="pp-rating__text">
            <h2 className="pp-h2" id="pp-rating">
              Sand Rating
            </h2>
            <p className="td-meta">
              {provisional
                ? "Provisional: it shows as a number once a few more confirmed results settle it."
                : `${me.rating.confidence} · ${me.rating.discipline === "beach-2s" ? "beach doubles" : me.rating.discipline.replace("-", " ")}`}
            </p>
            <AppLink className="pp-link" href="/app/matches">
              Your results
            </AppLink>
          </div>
        </Card>
        <Card className="pp-form">
          <h2 className="pp-h2">Recent results</h2>
          {recent.count === 0 ? (
            <p className="td-meta">
              Results you add or confirm show here.{" "}
              <AppLink href="/app/score">Add a result</AppLink>
            </p>
          ) : (
            <ul className="pp-mini">
              {recent.months.flatMap((month) =>
                month.rows.slice(0, 3).map((row) => (
                  <li key={row.id}>
                    <AppLink href={row.href}>
                      {row.won === null ? "" : row.won ? "Won" : "Lost"}
                      {row.opponents ? ` v ${row.opponents}` : ""}
                    </AppLink>
                    <span className="td-meta td-num">
                      {row.day} ·{" "}
                      {row.sets.map(([a, b]) => `${a}–${b}`).join(", ")}
                    </span>
                  </li>
                )),
              )}
            </ul>
          )}
        </Card>
      </section>

      <section aria-labelledby="pp-public" className="pp-section">
        <h2 className="pp-h2" id="pp-public">
          Who can see you
        </h2>
        <PrivacyChoice
          displayName={me.displayName}
          handle={me.handle}
          homeArea={me.homeMarket}
          isMinor={Boolean(profile.person.isMinor)}
          ratingProvisional={provisional}
          visibility={profile.visibility}
        />
      </section>

      <section aria-labelledby="pp-clubs" className="pp-section">
        <div className="pp-section__head">
          <h2 className="pp-h2" id="pp-clubs">
            Clubs and cards
          </h2>
          <AppLink href="/app/wallet">Open wallet</AppLink>
        </div>
        {wallets === null ? (
          <p className="td-meta">
            Your club cards didn’t load. They’re safe in your wallet.
          </p>
        ) : wallets.length === 0 ? (
          <EmptyState
            actions={
              <Button href="/app/discover" size="sm" variant="secondary">
                Find a club
              </Button>
            }
            description="Join a club and its card and credits live in your wallet."
            icon="member-card"
            title="No club cards yet"
          />
        ) : (
          <ul className="pp-cards">
            {wallets.slice(0, 4).map((wallet, index) => (
              <li key={wallet.organizationId}>
                <a
                  className="pp-card-link"
                  href={`/app/wallet?card=${encodeURIComponent(wallet.organizationId)}`}
                >
                  <MembershipCard
                    {...clubSummaryCard(wallet)}
                    art={art[index]!}
                    club={{ name: wallet.organizationName }}
                    label={`Open ${wallet.organizationName} card in your wallet`}
                    member={me.displayName}
                    size="strip"
                  />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pp-family" className="pp-section">
        <div className="pp-section__head">
          <h2 className="pp-h2" id="pp-family">
            Family
          </h2>
          <AppLink href="/app/settings#household">Manage family</AppLink>
        </div>
        {settings.household.length === 0 ? (
          <p className="td-meta">
            {session.junior
              ? "A parent or guardian links to your account to book and pay for you."
              : "Add a junior to book and pay for them from your account. Juniors are private by rule."}
          </p>
        ) : (
          <ul className="pp-team">
            {settings.household.map((member) => {
              const state = RELATION_STATE(member);
              return (
                <li className="pp-team__row" key={member.person.id}>
                  <span>
                    {member.person.displayName}
                    <span className="td-meta">
                      {" "}
                      · {member.role === "guardian"
                        ? "Guardian"
                        : "Junior"} · {member.relationship}
                    </span>
                  </span>
                  <Chip kind="status" tone={state.tone}>
                    {state.label}
                  </Chip>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
