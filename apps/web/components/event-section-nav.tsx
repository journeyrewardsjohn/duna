"use client";

import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type PublicSectionNavItem = {
  readonly id: string;
  readonly label: string;
};

export type EventSectionNavItem = PublicSectionNavItem;

export function PublicSectionNav({
  items,
  label,
  ariaLabel,
  className,
  observedContentSelector,
}: {
  readonly items: readonly PublicSectionNavItem[];
  readonly label: string;
  readonly ariaLabel: string;
  readonly className?: string;
  readonly observedContentSelector: string;
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ids = new Set(items.map((item) => item.id));
    let animationFrame = 0;
    let settleTimer = 0;
    let alignInitialHash = false;
    const alignmentTimers: number[] = [];

    const syncScroll = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const navBottom = navRef.current?.getBoundingClientRect().bottom ?? 80;
        const marker = navBottom + 48;
        const positions = items
          .map((item) => {
            const element = document.getElementById(item.id);
            return element
              ? { id: item.id, top: element.getBoundingClientRect().top }
              : undefined;
          })
          .filter((position) => position !== undefined);
        let current =
          positions
            .filter((position) => position.top <= marker)
            .sort((left, right) => right.top - left.top)[0]?.id ??
          positions.sort((left, right) => left.top - right.top)[0]?.id ??
          items[0]?.id ??
          "";
        const atPageEnd =
          window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 4;
        if (atPageEnd) {
          current =
            positions.sort((left, right) => right.top - left.top)[0]?.id ??
            current;
        }
        setActiveId(current);
      });
    };

    const syncHash = () => {
      const hash = window.location.hash.slice(1);
      if (ids.has(hash)) setActiveId(hash);
      if (hash !== initialHash) alignInitialHash = false;
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(syncScroll, 220);
    };
    const initialHash = window.location.hash.slice(1);
    alignInitialHash = ids.has(initialHash);
    const alignToInitialTarget = () => {
      if (!alignInitialHash || window.location.hash.slice(1) !== initialHash) {
        return;
      }
      document
        .getElementById(initialHash)
        ?.scrollIntoView({ behavior: "auto", block: "start" });
      syncScroll();
    };
    const cancelInitialAlignment = () => {
      alignInitialHash = false;
      for (const timer of alignmentTimers) window.clearTimeout(timer);
    };
    const layoutObserver = new ResizeObserver(() => {
      syncScroll();
      alignToInitialTarget();
    });
    const eventContent = document.querySelector<HTMLElement>(
      observedContentSelector,
    );
    if (eventContent) layoutObserver.observe(eventContent);
    if (alignInitialHash) {
      for (const delay of [0, 300, 1200, 3200, 6000]) {
        alignmentTimers.push(window.setTimeout(alignToInitialTarget, delay));
      }
    }
    window.addEventListener("pointerdown", cancelInitialAlignment, {
      once: true,
      passive: true,
    });
    window.addEventListener("touchstart", cancelInitialAlignment, {
      once: true,
      passive: true,
    });
    window.addEventListener("wheel", cancelInitialAlignment, {
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", cancelInitialAlignment, { once: true });
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("resize", syncScroll);
    window.addEventListener("scroll", syncScroll, { passive: true });
    if (!ids.has(initialHash)) syncScroll();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(settleTimer);
      for (const timer of alignmentTimers) window.clearTimeout(timer);
      layoutObserver.disconnect();
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("resize", syncScroll);
      window.removeEventListener("scroll", syncScroll);
      window.removeEventListener("pointerdown", cancelInitialAlignment);
      window.removeEventListener("touchstart", cancelInitialAlignment);
      window.removeEventListener("wheel", cancelInitialAlignment);
      window.removeEventListener("keydown", cancelInitialAlignment);
    };
  }, [items, observedContentSelector]);

  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>(
      `.event-section-nav__links a[href="#${CSS.escape(activeId)}"]`,
    );
    active?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeId]);

  if (items.length < 2) return null;

  return (
    <nav
      aria-label={ariaLabel}
      className={`event-section-nav${className ? ` ${className}` : ""}`}
      ref={navRef}
    >
      <div className="event-section-nav__inner">
        <span className="event-section-nav__label">
          {label} <ArrowDown aria-hidden size={14} />
        </span>
        <div className="event-section-nav__links">
          {items.map((item) => (
            <a
              aria-current={activeId === item.id ? "location" : undefined}
              href={`#${item.id}`}
              key={item.id}
              onClick={() => setActiveId(item.id)}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}

export function EventSectionNav({
  items,
}: {
  readonly items: readonly EventSectionNavItem[];
}) {
  return (
    <PublicSectionNav
      ariaLabel="On this event page"
      items={items}
      label="Explore event"
      observedContentSelector=".pro-event-content, .event-detail-page"
    />
  );
}
