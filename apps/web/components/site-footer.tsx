import { DunaMark } from "@duna/ui";
import Link from "next/link";
import { DUNA_HQ_URL } from "@/lib/site-urls";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__top">
        <div>
          <DunaMark />
          <p>The operating system for sand.</p>
        </div>
        <div className="site-footer__links">
          <div>
            <strong>Play</strong>
            <Link href="/app/discover">Discover</Link>
            <Link href="/app/play">Pickup</Link>
            <Link href="/app/matches">Record a match</Link>
          </div>
          <div>
            <strong>Run</strong>
            <a href={DUNA_HQ_URL}>Duna HQ</a>
            <Link href="/clubs/south-bay-volleyball">Clubs</Link>
            <Link href="/app/discover">Coaches</Link>
          </div>
          <div>
            <strong>Duna</strong>
            <Link href="/about">About</Link>
            <Link href="/safety">Safety</Link>
            <Link href="/rankings">World rankings</Link>
            <Link href="/methodology">Rating methodology</Link>
          </div>
          <div>
            <strong>Legal</strong>
            <Link href="/legal/terms">Terms</Link>
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal/eula">Mobile EULA</Link>
            <Link href="/legal/hq-terms">HQ terms</Link>
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
