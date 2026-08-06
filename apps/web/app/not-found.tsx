import { ArrowRight, Compass } from "lucide-react";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <main className="not-found-v3" data-zone="editorial">
      <SiteHeader />
      <section className="not-found-v3__stage">
        <div className="not-found-v3__copy">
          <span className="not-found-v3__eyebrow">Out of bounds</span>
          <h1>Nothing here. The next game is.</h1>
          <p>
            This page may have moved, but the beach is still connected. Head
            back home or find a court, event, or player near you.
          </p>
          <div className="not-found-v3__actions">
            <Link href="/app/discover">
              Find what is next <Compass aria-hidden size={17} />
            </Link>
            <Link href="/">
              Duna home <ArrowRight aria-hidden size={17} />
            </Link>
          </div>
        </div>
        <div aria-hidden className="not-found-v3__mark">
          404
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
