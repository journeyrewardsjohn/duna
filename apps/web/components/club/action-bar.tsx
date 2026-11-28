"use client";

import { buttonClassName } from "@duna/ui/tideline";
import { useEffect, useState } from "react";

export interface PageAction {
  readonly label: string;
  readonly href: string;
  /** A short line beside the button on wide screens ("$16.50 all-in"). */
  readonly note?: string;
}

/**
 * The page's one primary action, quiet and always in reach: a bar at the
 * thumb on phones, a slim strip at the bottom of the window on wide screens.
 * It follows what the visitor is reading: over the Join section it says
 * "Join", over Train "Book a session", and so on (`sections` maps a section
 * id to its action; the section nearest the middle of the window wins).
 * It comes up once the hero (which carries the same action) has scrolled
 * away, so only one primary action is ever in view. It never covers
 * content: the page leaves room for it, and the site's thumb bar steps aside.
 */
export function ActionBar({
  primary,
  sections = {},
  label,
}: {
  readonly primary: PageAction;
  readonly sections?: Readonly<Record<string, PageAction>>;
  /** The landmark's name ("Book at South Bay Volleyball Club"). */
  readonly label: string;
}) {
  const [current, setCurrent] = useState<PageAction>(primary);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const ids = Object.keys(sections);
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setShown(window.scrollY > 240);
        const middle = window.innerHeight / 2;
        const active = targets.find((element) => {
          const box = element.getBoundingClientRect();
          return box.top <= middle && box.bottom >= middle;
        });
        setCurrent((active && sections[active.id]) || primary);
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [primary, sections]);

  return (
    <aside
      aria-hidden={!shown}
      aria-label={label}
      className="club-action"
      data-shown={shown || undefined}
      inert={!shown}
    >
      <div className="club-action__inner site-wrap">
        {current.note ? (
          <p className="club-action__note">{current.note}</p>
        ) : null}
        <a
          className={buttonClassName(
            { variant: "primary", size: "lg" },
            "club-action__button",
          )}
          href={current.href}
        >
          <span className="td-btn__label">{current.label}</span>
        </a>
      </div>
    </aside>
  );
}
