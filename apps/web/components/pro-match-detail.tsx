import type {
  CommunityCommentSummary,
  PredictionMarketView,
  PredictionWallet,
  PublicProMatchDetail,
  VideoSummary,
} from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  History,
  MapPin,
  Radio,
  Sparkles,
  Tv,
  Video,
} from "lucide-react";
import Link from "next/link";
import { DunaVideoGallery } from "@/components/duna-video-gallery";
import { CommunityThread } from "@/components/community-thread";
import { ProLiveMatchScoreboard } from "@/components/pro-live-match-scoreboard";
import { PredictionMarketDetail } from "@/components/prediction-market";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { professionalMatchJsonLd, serializeJsonLd } from "@/lib/pro-seo";

export function ProMatchDetail({
  communityAccess,
  comments = [],
  detail,
  predictionComments = [],
  predictionMarket,
  predictionWallet,
  videos = [],
}: {
  readonly communityAccess?: {
    readonly verified: boolean;
    readonly paidPremium: boolean;
    readonly canComment: boolean;
    readonly reason?: string;
  };
  readonly comments?: readonly CommunityCommentSummary[];
  readonly detail: PublicProMatchDetail;
  readonly predictionComments?: readonly CommunityCommentSummary[];
  readonly predictionMarket?: PredictionMarketView;
  readonly predictionWallet?: PredictionWallet;
  readonly videos?: readonly VideoSummary[];
}) {
  const { event, match } = detail;
  const matchStatus = match.liveScore?.status ?? match.status;
  const isLive = matchStatus === "live";
  const structuredData = professionalMatchJsonLd(detail);
  const eventReturnLabel =
    event.name.replace(/^BPT\s+(?:Elite16|Challenge|Futures)\s+/i, "").trim() ||
    event.name;
  return (
    <main className="pro-match-page" data-zone="athletic">
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        type="application/ld+json"
      />
      <section
        className="pro-match-hero"
        data-zone={isLive ? "live" : "athletic"}
      >
        <div className="pro-match-hero__intro">
          <div className="pro-match-hero__status-row">
            <Link
              aria-label={`Back to ${eventReturnLabel}`}
              className="pro-match-hero__back"
              href={`/events/${event.slug}`}
              title={`Back to ${eventReturnLabel}`}
            >
              <ArrowLeft aria-hidden size={18} strokeWidth={2} />
            </Link>
            <Badge tone={isLive ? "danger" : "neutral"}>
              {isLive && <Radio aria-hidden size={11} />}
              {matchStatus}
            </Badge>
            <Badge>{match.roundLabel}</Badge>
            {match.leagueTeamAName && match.leagueTeamBName && (
              <Badge>
                {match.leagueTeamAName} vs. {match.leagueTeamBName}
              </Badge>
            )}
          </div>
          <h1>
            {match.teamA.label} <span>vs</span> {match.teamB.label}
          </h1>
          <p>
            Official set-by-set scoring, player performance, and Sand Rating
            context for {event.name}.
          </p>
          <div className="pro-match-hero__facts">
            <span>
              <CalendarDays aria-hidden size={16} />
              {match.playedAt
                ? new Intl.DateTimeFormat("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    timeZone: match.timezone ?? "UTC",
                  }).format(new Date(match.playedAt))
                : (event.startsOn ?? "Date pending")}
              {match.time ? ` · ${match.time}` : ""}
            </span>
            <span>
              <MapPin aria-hidden size={16} />
              {match.court ?? event.location ?? "Court pending"}
            </span>
          </div>
        </div>
        <ProLiveMatchScoreboard
          eventName={event.name}
          genderCategory={event.genderCategory}
          initialLive={match.liveScore}
          match={match}
        />
      </section>

      <div className="pro-match-content">
        <section className="pro-match-panel pro-match-prediction">
          <header>
            <div>
              <span className="page-eyebrow">Pre-match model</span>
              <h2>Winner prediction</h2>
            </div>
            <Sparkles aria-hidden size={22} />
          </header>
          <div className="pro-match-prediction__labels">
            <span>
              <Numeric tier="hero">
                {match.prediction.teamA.toFixed(0)}%
              </Numeric>
              {match.teamA.label}
            </span>
            <span>
              <Numeric tier="hero">
                {match.prediction.teamB.toFixed(0)}%
              </Numeric>
              {match.teamB.label}
            </span>
          </div>
          <div className="pro-match-prediction__meter">
            <span style={{ width: `${match.prediction.teamA}%` }} />
          </div>
          <p>
            {match.prediction.outcome === "upset"
              ? "Upset: the result went against the pre-match Sand Rating favorite."
              : match.prediction.outcome === "predicted"
                ? "The result matched the pre-match Sand Rating favorite."
                : match.prediction.basis === "SandRating"
                  ? "Probability is derived from the latest mapped Duna Sand Ratings. It is a forecast, not a guarantee."
                  : "Both teams currently have an even prior because mapped rating data is incomplete."}
          </p>
        </section>

        {predictionMarket && (
          <PredictionMarketDetail
            conversation={{
              access: communityAccess,
              comments: predictionComments,
            }}
            market={predictionMarket}
            returnTo={match.canonicalPath}
            target={{
              kind: "pro-match",
              eventSlug: event.slug,
              matchId: match.id,
            }}
            wallet={predictionWallet}
          />
        )}

        <section className="pro-match-panel pro-head-to-head">
          <header>
            <div>
              <span className="page-eyebrow">Historical matchup</span>
              <h2>Head-to-head</h2>
            </div>
            <History aria-hidden size={22} />
          </header>
          {detail.headToHead.total > 0 ? (
            <>
              <div className="pro-head-to-head__score">
                <div>
                  <Numeric tier="block">{detail.headToHead.teamAWins}</Numeric>
                  <span>{match.teamA.label} wins</span>
                </div>
                <i>vs</i>
                <div>
                  <Numeric tier="block">{detail.headToHead.teamBWins}</Numeric>
                  <span>{match.teamB.label} wins</span>
                </div>
              </div>
              <div className="pro-head-to-head__meetings">
                {detail.headToHead.meetings.map((meeting) => {
                  const content = (
                    <>
                      <div>
                        <small>
                          {meeting.eventName}
                          {meeting.roundLabel ? ` · ${meeting.roundLabel}` : ""}
                          {meeting.playedAt
                            ? ` · ${new Intl.DateTimeFormat("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                timeZone: "UTC",
                              }).format(new Date(meeting.playedAt))}`
                            : ""}
                        </small>
                        <strong>
                          <span
                            className={
                              meeting.winnerSide === "A"
                                ? "is-winner"
                                : undefined
                            }
                          >
                            {meeting.teamALabel}
                          </span>
                          <i>vs</i>
                          <span
                            className={
                              meeting.winnerSide === "B"
                                ? "is-winner"
                                : undefined
                            }
                          >
                            {meeting.teamBLabel}
                          </span>
                        </strong>
                      </div>
                      <span className="pro-head-to-head__sets">
                        {meeting.sets.length > 0
                          ? meeting.sets
                              .map((set) => `${set.a}–${set.b}`)
                              .join(", ")
                          : "Result recorded"}
                      </span>
                      <ExternalLink aria-hidden size={13} />
                    </>
                  );
                  return meeting.canonicalPath ? (
                    <Link href={meeting.canonicalPath} key={meeting.id}>
                      {content}
                    </Link>
                  ) : meeting.sourceUrl ? (
                    <a
                      href={meeting.sourceUrl}
                      key={meeting.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {content}
                    </a>
                  ) : (
                    <article key={meeting.id}>{content}</article>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="pro-head-to-head__empty">
              No prior verified meetings between these exact teams yet.
            </p>
          )}
        </section>

        <section className="pro-match-panel pro-watch">
          <header>
            <div>
              <span className="page-eyebrow">Match broadcast</span>
              <h2>How to watch</h2>
            </div>
            <Tv aria-hidden size={22} />
          </header>
          {match.watchOptions.length > 0 ? (
            <div>
              {match.watchOptions.map((option) => {
                const content = (
                  <>
                    {option.kind === "youtube" ? (
                      <Video aria-hidden size={19} />
                    ) : (
                      <Tv aria-hidden size={19} />
                    )}
                    <span>
                      <strong>{option.label}</strong>
                      <small>
                        {option.channelName ??
                          (option.url
                            ? "Open stream"
                            : option.kind === "youtube"
                              ? "Direct link coming soon"
                              : option.kind === "vbtv"
                                ? "VBTV subscription"
                                : "Live TV")}
                      </small>
                    </span>
                    {option.url && <ExternalLink aria-hidden size={14} />}
                  </>
                );
                return option.url ? (
                  <a
                    href={option.url}
                    key={option.id}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {content}
                  </a>
                ) : (
                  <article key={option.id}>{content}</article>
                );
              })}
            </div>
          ) : (
            <p>
              This match uses the event broadcast guide. A match-specific link
              or TV channel will appear here when configured.
            </p>
          )}
        </section>

        {videos.length > 0 && (
          <DunaVideoGallery
            description="Choose a player-streamed angle or published replay from this match."
            title={
              videos.some((video) => video.status === "live")
                ? "Watch this match live."
                : "Match replays."
            }
            videos={videos}
          />
        )}

        <CommunityThread
          access={communityAccess}
          comments={comments}
          returnTo={match.canonicalPath}
          subject={{ type: "match", id: match.id }}
          title={isLive ? "Live match conversation" : "Match conversation"}
        />

        <nav className="pro-match-source">
          <Link href={`/events/${event.slug}`}>
            <ArrowLeft aria-hidden size={14} />
            All event results
          </Link>
          {match.sourceUrl && (
            <a href={match.sourceUrl} rel="noreferrer" target="_blank">
              Official match source
              <ExternalLink aria-hidden size={14} />
            </a>
          )}
        </nav>
      </div>
      <SiteFooter />
    </main>
  );
}
