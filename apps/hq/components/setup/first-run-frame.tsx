import { hqHref } from "@duna/core/hq-routes";
import { CrestMark } from "@duna/ui/tideline";
import Link from "next/link";
import type { ReactNode } from "react";
import { getHqSession } from "../shell/hq-session";

/** The first run's frame: the Duna mark, a way out to Club setup, and the page. */
export async function FirstRunFrame({
  children,
}: {
  readonly children: ReactNode;
}) {
  const session = await getHqSession();
  return (
    <div className="setup-frame">
      <a className="hqs-skip" href="#first-run">
        Skip to content
      </a>
      <header className="setup-frame__top">
        <Link aria-label="Duna HQ" className="setup-frame__brand" href="/">
          <CrestMark className="setup-frame__mark" />
          <span>Duna HQ</span>
        </Link>
        {session.access === "operator" ? (
          <Link className="setup-link" href={hqHref("setup")}>
            Go to Club setup
          </Link>
        ) : null}
      </header>
      <main className="setup-frame__main" id="first-run">
        {children}
      </main>
    </div>
  );
}
