"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { activeSectionId, type DocumentSectionLink } from "./document-core";

export interface DocumentSectionListProps {
  /** Names the navigation landmark, like "Sections of the Privacy Policy". */
  label: string;
  /** The heading over the list and the phone disclosure. */
  title?: string;
  sections: readonly DocumentSectionLink[];
  /**
   * Distance from the top of the viewport at which a heading counts as the
   * one being read, when the headings have no scroll margin of their own
   * (a `SectionHeading` has one, and that wins).
   */
  offset?: number;
  className?: string;
}

function flatten(sections: readonly DocumentSectionLink[]): string[] {
  return sections.flatMap((section) => [
    section.id,
    ...flatten(section.children ?? []),
  ]);
}

function Links({
  sections,
  active,
  onNavigate,
}: {
  sections: readonly DocumentSectionLink[];
  active: string | undefined;
  onNavigate?: () => void;
}) {
  return (
    <ol className="td-doc-toc__list">
      {sections.map((section) => (
        <li key={section.id}>
          <a
            aria-current={active === section.id ? "location" : undefined}
            className="td-doc-toc__link"
            href={`#${section.id}`}
            onClick={onNavigate}
          >
            {section.title}
          </a>
          {section.children?.length ? (
            <Links
              active={active}
              onNavigate={onNavigate}
              sections={section.children}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * The section list of a long document: a sticky list beside the text on wide
 * screens and a collapsible "On this page" on phones. It marks the section
 * being read (`aria-current="location"`), measured once per animation frame
 * while scrolling, and keeps that entry in view inside the list without
 * moving the page.
 */
export function DocumentSectionList({
  label,
  title = "On this page",
  sections,
  offset = 96,
  className,
}: DocumentSectionListProps) {
  const [active, setActive] = useState<string | undefined>(undefined);
  const wideList = useRef<HTMLDivElement>(null);
  const disclosure = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const ids = flatten(sections);
    let frame = 0;
    const measure = () => {
      frame = 0;
      // Read the headings' own scroll margin, so "the section being read"
      // is the one an anchor link would land on.
      const first = ids.length ? document.getElementById(ids[0] ?? "") : null;
      const margin = first
        ? Number.parseFloat(getComputedStyle(first).scrollMarginTop)
        : Number.NaN;
      const line = Number.isFinite(margin) && margin > 0 ? margin + 8 : offset;
      const tops = ids.flatMap((id) => {
        const element = document.getElementById(id);
        return element
          ? [{ id, top: element.getBoundingClientRect().top }]
          : [];
      });
      const atEnd =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      const next = atEnd ? tops.at(-1)?.id : activeSectionId(tops, line);
      setActive((current) => (current === next ? current : next));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
    };
  }, [sections, offset]);

  // Keep the current entry visible inside the sticky list (never the page).
  useEffect(() => {
    const list = wideList.current;
    if (!list || !active) return;
    const link = list.querySelector<HTMLElement>('[aria-current="location"]');
    if (!link) return;
    const top = link.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top > list.scrollTop + list.clientHeight - 40) {
      list.scrollTop = Math.max(0, top - list.clientHeight / 3);
    }
  }, [active]);

  return (
    <div className={cx("td-doc-toc", className)}>
      <nav aria-label={label} className="td-doc-toc__wide">
        <p className="td-doc-toc__title">{title}</p>
        <div className="td-doc-toc__scroll" ref={wideList}>
          <Links active={active} sections={sections} />
        </div>
      </nav>
      <details className="td-doc-toc__phone" ref={disclosure}>
        <summary className="td-doc-toc__summary">
          <span>{title}</span>
          <Icon
            className="td-doc-toc__chevron"
            name="chevron-down"
            size="inline"
          />
        </summary>
        <nav aria-label={label}>
          <Links
            active={active}
            onNavigate={() => {
              if (disclosure.current) disclosure.current.open = false;
            }}
            sections={sections}
          />
        </nav>
      </details>
    </div>
  );
}
