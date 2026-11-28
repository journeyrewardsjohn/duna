import { DunaLogo } from "@duna/ui";
import Link from "next/link";
import { DUNA_HQ_URL } from "@/lib/site-urls";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__top">
        <div>
          <DunaLogo size={28} />
          <p>The operating system for sand.</p>
        </div>
        <div className="site-footer__links">
          <div>
            <strong>For Players</strong>
            <Link href="/players">Player overview</Link>
            <Link href="/discover">Discover</Link>
            <Link href="/discover">Events</Link>
            <Link href="/app/matches">Record a match</Link>
          </div>
          <div>
            <strong>Watch</strong>
            <Link href="/pro">Pro tour</Link>
            <Link href="/pro#latest-match-updates">Live</Link>
            <Link href="/rankings">World rankings</Link>
          </div>
          <div>
            <strong>For Clubs</strong>
            <Link href="/">Club overview</Link>
            <a href={DUNA_HQ_URL}>Duna HQ</a>
            <Link href="/run-your-club">For clubs + coaches</Link>
            <Link href="/run-your-club#features">All features</Link>
            <Link href="/run-your-club/features/products">Products</Link>
            <Link href="/run-your-club/features/team-management">Team</Link>
            <Link href="/create">Create an event</Link>
          </div>
          <div>
            <strong>Duna</strong>
            <Link href="/about">About</Link>
            <Link href="/apps#watch">Duna for Apple Watch</Link>
            <Link href="/run-your-club/features/coach-video">Coach video</Link>
            <Link href="/run-your-club/features/safety-privacy">
              Safety + privacy
            </Link>
            <Link href="/sand-rating">Rating methodology</Link>
            <Link href="/safety">Safety</Link>
          </div>
          <div>
            <strong>Legal</strong>
            <Link href="/legal">Legal center</Link>
            <Link href="/legal/terms">Terms of Service</Link>
            <Link href="/legal/hq-terms">Duna HQ Terms</Link>
            <Link href="/legal/privacy">Privacy Policy</Link>
            <Link href="/legal/cookies">Cookie Policy</Link>
            <Link href="/legal/booking-and-refunds">Booking and refunds</Link>
          </div>
        </div>
      </div>
      <div className="site-footer__bottom">
        <span>© 2026 Duna</span>
        <span>Built for every court, from first serve to center court.</span>
      </div>
    </footer>
  );
}
