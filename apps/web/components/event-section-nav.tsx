"use client";

import { ArrowDown } from "lucide-react";
import { useEffect, useState } from "react";

export type EventSectionNavItem = {
  readonly id: string;
  readonly label: string;
};

export function EventSectionNav({
  items,
}: {
  readonly items: readonly EventSectionNavItem[];
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const ids = new Set(items.map((item) => item.id));
    let animationFrame = 0;
    let settleTimer = 0;
    let alignInitialHash = false;
    const alignmentTimers: number[] = [];

    const syncScroll = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const navBottom =
          document
            .querySelector<HTMLElement>(".event-section-nav")
            ?.getBoundingClientRect().bottom ?? 80;
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
      ".pro-event-content, .event-detail-page",
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
  }, [items]);

  useEffect(() => {
    const active = document.querySelector<HTMLElement>(
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
    <nav aria-label="On this event page" className="event-section-nav">
      <div className="event-section-nav__inner">
        <span className="event-section-nav__label">
          Explore event <ArrowDown aria-hidden size={14} />
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
