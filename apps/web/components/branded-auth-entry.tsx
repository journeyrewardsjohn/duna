import { DunaMark } from "@duna/ui";
import {
  ArrowRight,
  CalendarDays,
  ChartNoAxesCombined,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";

type AuthContext = {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
};

function contextFor(returnTo: string): AuthContext | undefined {
  if (returnTo.startsWith("/app/checkout/")) {
    return {
      eyebrow: "YOUR SPOT IS WAITING",
      title: "Finish your registration.",
      description:
        "A free Duna account keeps your place, payment, and team details together from the first serve onward.",
    };
  }

  if (returnTo.startsWith("/app/venues/")) {
    return {
      eyebrow: "YOUR COURT IS READY",
      title: "Reserve your time on sand.",
      description:
        "Create a free Duna account to book this court, keep the details handy, and manage the people playing with you.",
    };
  }

  if (returnTo.startsWith("/events/")) {
    return {
      eyebrow: "KEEP THE EVENT IN PLAY",
      title: "Make this event yours.",
      description:
        "A free Duna account saves your place, keeps event details close, and connects your schedule to your team.",
    };
  }

  if (returnTo.startsWith("/players/")) {
    return {
      eyebrow: "STAY CONNECTED",
      title: "Follow the game from here.",
      description:
        "Create a free Duna account to follow this player and keep the matches, results, and community you care about close.",
    };
  }

  if (returnTo.startsWith("/clubs/")) {
    return {
      eyebrow: "KEEP THIS WITH YOUR CLUB",
      title: "Make this purchase yours.",
      description:
        "A free Duna account keeps your club purchases, credits, bookings, and upcoming play together in one place.",
    };
  }
}

export function BrandedAuthEntry({
  mode,
  returnTo,
}: {
  readonly mode: "sign-in" | "sign-up";
  readonly returnTo: string;
}) {
  const signingUp = mode === "sign-up";
  const context = contextFor(returnTo);
  const primaryHref = `/${mode}/start?returnTo=${encodeURIComponent(returnTo)}`;
  const alternateHref = `${
    signingUp ? "/sign-in" : "/sign-up"
  }?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <main className="auth-entry" data-zone="editorial">
      <div className="auth-entry__media" aria-hidden>
        <video
          autoPlay
          loop
          muted
          playsInline
          poster="/media/duna-hero-poster.webp"
          preload="metadata"
        >
          <source src="/media/duna-hero.mp4" type="video/mp4" />
        </video>
        <div className="auth-entry__wash" />
        <div className="auth-entry__grain" />
      </div>

      <div className="auth-entry__shell">
        <Link aria-label="Duna home" className="auth-entry__brand" href="/">
          <DunaMark />
        </Link>

        <section className="auth-entry__story">
          <span className="auth-entry__eyebrow">ONE IDENTITY · EVERY GAME</span>
          <h1>
            Your game,
            <br />
            <em>stays with you.</em>
          </h1>
          <p>
            Find your people, book the court, and build a verified history of
            every match that matters.
          </p>

          <div className="auth-entry__benefits">
            <span>
              <CalendarDays aria-hidden size={18} />
              Courts + events
            </span>
            <span>
              <ChartNoAxesCombined aria-hidden size={18} />
              Sand Rating
            </span>
            <span>
              <Users aria-hidden size={18} />
              Your community
            </span>
          </div>
        </section>

        <section className="auth-entry__card">
          <span className="auth-entry__card-kicker">
            {context?.eyebrow ??
              (signingUp ? "WELCOME TO DUNA" : "WELCOME BACK")}
          </span>
          <h2>
            {context?.title ??
              (signingUp
                ? "Start with your game."
                : "Pick up where you left off.")}
          </h2>
          <p>
            {context?.description ??
              (signingUp
                ? "Create one secure profile for play, bookings, ratings, and the people who make the game yours."
                : "Your bookings, profile, wallet, and match history are ready when you are.")}
          </p>

          <a className="auth-entry__primary" href={primaryHref}>
            {signingUp
              ? "Create my Duna account"
              : context
                ? "Continue to your next step"
                : "Continue to Duna"}
            <ArrowRight aria-hidden size={18} />
          </a>

          <div className="auth-entry__secure">
            <ShieldCheck aria-hidden size={16} />
            <span>Secure authentication · Duna never sees your password</span>
          </div>

          <p className="auth-entry__alternate">
            {signingUp ? "Already have an account?" : "New to Duna?"}{" "}
            <Link href={alternateHref}>
              {signingUp ? "Sign in" : "Create one"}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
