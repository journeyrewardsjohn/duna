import { DunaMark } from "@duna/ui";
import {
  ArrowRight,
  CalendarDays,
  ChartNoAxesCombined,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";

export function BrandedAuthEntry({
  mode,
  returnTo,
}: {
  readonly mode: "sign-in" | "sign-up";
  readonly returnTo: string;
}) {
  const signingUp = mode === "sign-up";
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
            {signingUp ? "WELCOME TO DUNA" : "WELCOME BACK"}
          </span>
          <h2>
            {signingUp
              ? "Start with your game."
              : "Pick up where you left off."}
          </h2>
          <p>
            {signingUp
              ? "Create one secure profile for play, bookings, ratings, and the people who make the game yours."
              : "Your bookings, profile, wallet, and match history are ready when you are."}
          </p>

          <Link className="auth-entry__primary" href={primaryHref}>
            {signingUp ? "Create my Duna account" : "Continue to Duna"}
            <ArrowRight aria-hidden size={18} />
          </Link>

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
