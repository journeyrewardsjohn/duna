"use client";

import {
  defaultEventMedia,
  formatVenueTime,
  type EventSummary,
} from "@duna/core";
import { DunaActionTrigger } from "@duna/ui";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  MessageCircle,
  MapPin,
  Search,
  Trophy,
  Users,
  Video,
  X,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";

const destinations = [
  {
    href: "/app/play",
    label: "Book a court",
    icon: CalendarDays,
    image: "/media/product-library/duna-product-member-courts.webp",
  },
  {
    href: "/app/video",
    label: "Watch & record",
    icon: Video,
    image: "/media/brand/duna-home-rally-v3.webp",
  },
  {
    href: "/discover",
    label: "Find a game",
    icon: Users,
    image: "/media/event-library/duna-event-coed-social.webp",
  },
  {
    href: "/app/pickup/new",
    label: "Host a game",
    icon: Trophy,
    image: "/media/product-library/duna-product-club-community.webp",
  },
];
const heroes = [
  {
    title: "Your place in the sand.",
    detail: "Good people. More play. A game that feels like you.",
    image: "/media/brand/duna-home-rally-v3.webp",
    href: "/discover",
  },
  {
    title: "Make time for your game.",
    detail: "Find a court, a coach, and your next favorite session.",
    image: "/media/product-library/duna-product-private-lesson.webp",
    href: "/app/play",
  },
  {
    title: "Every rally has a story.",
    detail: "Record your game. Revisit the moments that matter.",
    image: "/media/event-library/duna-event-oceanfront-finals.webp",
    href: "/app/video",
  },
];

export function SandPlayerHome({
  children,
  clubs,
  events,
  firstName,
  next,
  playerId,
}: {
  readonly children: ReactNode;
  readonly clubs: readonly { readonly id: string; readonly name: string }[];
  readonly events: readonly EventSummary[];
  readonly firstName: string;
  readonly playerId: string;
  readonly next?: {
    readonly title: string;
    readonly detail: string;
    readonly href: string;
    readonly needsAction: boolean;
  };
}) {
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [query, setQuery] = useState("");
  const [visited, setVisited] = useState<string[]>([]);
  const rail = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const club = clubs.find((item) => item.id === selected);
  const visibleEvents = selected
    ? events.filter((event) => event.organizationId === selected)
    : events;
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(`duna:recent:${playerId}`) ?? "[]",
      );
      if (Array.isArray(stored))
        setVisited(
          stored
            .filter((item): item is string => typeof item === "string")
            .slice(0, 4),
        );
    } catch {
      /* Storage can be unavailable in private mode. */
    }
  }, [playerId]);
  const record = (href: string) => {
    const updated = [href, ...visited.filter((item) => item !== href)].slice(
      0,
      4,
    );
    setVisited(updated);
    try {
      localStorage.setItem(`duna:recent:${playerId}`, JSON.stringify(updated));
    } catch {
      /* Navigation never depends on storage. */
    }
  };
  const recent = visited.flatMap((href) =>
    destinations.filter((item) => item.href === href),
  );
  const close = () => {
    dialog.current?.close();
    trigger.current?.focus();
  };
  const select = (id?: string) => {
    setSelected(id);
    close();
  };

  return (
    <main className="sand-home">
      <section className="sand-hero" aria-label="Discover Duna">
        <div
          className="sand-hero__rail"
          ref={rail}
          onScroll={() => {
            const element = rail.current;
            if (element)
              setActive(Math.round(element.scrollLeft / element.clientWidth));
          }}
        >
          {heroes.map((hero, index) => (
            <article
              className="sand-hero__slide"
              key={hero.title}
              aria-label={`${index + 1} of ${heroes.length}`}
            >
              <img
                alt=""
                src={hero.image}
                fetchPriority={index === 0 ? "high" : "auto"}
                loading={index === 0 ? "eager" : "lazy"}
              />
              <Link href={hero.href} className="sand-hero__copy">
                <h1>{hero.title}</h1>
                <p>{hero.detail}</p>
              </Link>
            </article>
          ))}
        </div>
        <div className="sand-hero__top">
          <span>Hello, {firstName}</span>
          <button
            ref={trigger}
            className="sand-club-trigger"
            aria-haspopup="dialog"
            onClick={() => dialog.current?.showModal()}
          >
            <MapPin size={16} aria-hidden />
            <span>{club?.name ?? "My Clubs"}</span>
            <ChevronDown size={16} aria-hidden />
          </button>
          <Link
            href="/app/messages"
            aria-label="Your messages"
            className="sand-hero__message"
          >
            <MessageCircle aria-hidden size={20} />
          </Link>
        </div>
        <div className="sand-hero__dots">
          {heroes.map((hero, index) => (
            <button
              key={hero.title}
              aria-label={`Show ${hero.title}`}
              aria-pressed={active === index}
              onClick={() =>
                rail.current?.scrollTo({
                  left: index * rail.current.clientWidth,
                  behavior: "instant",
                })
              }
            >
              <span />
            </button>
          ))}
        </div>
      </section>
      <div className="sand-home__sheet">
        <DunaActionTrigger panel="chat" className="sand-search">
          <Search size={21} aria-hidden />
          <span>Search with Duna</span>
          <ArrowRight size={20} aria-hidden />
        </DunaActionTrigger>
        <div className="sand-home__utility">
          <section className="sand-activities">
            <header>
              <h2>Up next</h2>
              <Link href="/app/play">
                My schedule <ArrowRight aria-hidden size={16} />
              </Link>
            </header>
            <div className="sand-activities__card">
              <h3>My activities</h3>
              {next ? (
                <Link className="sand-next" href={next.href}>
                  <CalendarDays aria-hidden size={23} />
                  <span>
                    <strong>{next.title}</strong>
                    <small>{next.detail}</small>
                  </span>
                  <span>{next.needsAction ? "Action needed" : "View"}</span>
                  <ArrowRight size={18} aria-hidden />
                </Link>
              ) : (
                <p>A little space for your next game.</p>
              )}
              <nav aria-label="Player quick actions">
                {destinations.slice(0, 3).map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} onClick={() => record(href)}>
                    <span>
                      <Icon size={23} strokeWidth={1.5} aria-hidden />
                    </span>
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          </section>
          <section className="sand-recent">
            <header>
              <h2>{recent.length ? "Recently visited" : "Explore Duna"}</h2>
            </header>
            <div>
              {(recent.length ? recent : destinations).map(
                ({ href, label, image }) => (
                  <Link href={href} key={href} onClick={() => record(href)}>
                    <img src={image} alt="" loading="lazy" />
                    <span>{label}</span>
                  </Link>
                ),
              )}
            </div>
          </section>
        </div>
        <section className="sand-discover">
          <header>
            <h2>{club ? `At ${club.name}` : "Find your next game"}</h2>
            <Link href="/discover" aria-label="Explore all games">
              <ArrowRight size={22} aria-hidden />
            </Link>
          </header>
          <div className="sand-photo-rail">
            {visibleEvents.slice(0, 8).map((event) => (
              <Link href={`/events/${event.slug}`} key={event.id}>
                <img
                  alt=""
                  src={
                    event.media?.find((item) => item.kind === "image")?.url ??
                    event.imageUrl ??
                    defaultEventMedia(event.kind, event.id).path
                  }
                  loading="lazy"
                />
                <h3>{event.title}</h3>
                <p>{event.venueName}</p>
                <p>{formatVenueTime(event.startsAt, event.timezone)}</p>
              </Link>
            ))}
            {visibleEvents.length === 0 ? (
              <div className="sand-empty">
                <h3>More play is on the way.</h3>
                <p>
                  {club
                    ? "No upcoming sessions from this club right now."
                    : "Find a court, explore nearby clubs, or host your own game."}
                </p>
                <Link href="/discover">
                  Explore Duna <ArrowRight size={16} aria-hidden />
                </Link>
              </div>
            ) : null}
          </div>
        </section>
        <section className="sand-discover">
          <header>
            <h2>Make it your game</h2>
          </header>
          <div className="sand-photo-rail sand-photo-rail--editorial">
            <Link href="/app/video">
              <img
                alt="Beach volleyball in motion"
                src="/media/brand/duna-home-rally-v3.webp"
                loading="lazy"
              />
              <h3>Every angle. Every rally.</h3>
              <p>
                Your recordings, live games, and moments worth watching again.
              </p>
            </Link>
            <Link href="/app/play">
              <img
                alt="A volleyball training session"
                src="/media/product-library/duna-product-private-lesson.webp"
                loading="lazy"
              />
              <h3>A little practice goes a long way.</h3>
              <p>Make room for your next session.</p>
            </Link>
          </div>
        </section>
        <div className="sand-home__existing">{children}</div>
      </div>
      <dialog
        ref={dialog}
        className="sand-club-sheet"
        aria-labelledby="sand-club-title"
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
        onClose={() => trigger.current?.focus()}
      >
        <div className="sand-club-sheet__handle" />
        <header>
          <button onClick={close} aria-label="Close My Clubs">
            <X aria-hidden size={23} />
          </button>
          <h2 id="sand-club-title">My Clubs</h2>
          <span />
        </header>
        <label className="sand-club-sheet__search">
          <Search size={20} aria-hidden />
          <input
            autoComplete="off"
            aria-label="Search your clubs"
            placeholder="Search your clubs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <p>Your connected clubs</p>
        <div className="sand-club-sheet__list">
          <button aria-pressed={!selected} onClick={() => select()}>
            <span className="sand-club-mark">
              <MapPin aria-hidden size={24} />
            </span>
            <span>
              <strong>All clubs</strong>
              <small>Explore every opportunity to play</small>
            </span>
            {!selected ? <Check aria-label="Selected" size={22} /> : null}
          </button>
          {clubs
            .filter((item) =>
              item.name.toLowerCase().includes(query.trim().toLowerCase()),
            )
            .map((item) => (
              <button
                key={item.id}
                aria-pressed={selected === item.id}
                onClick={() => select(item.id)}
              >
                <span className="sand-club-mark">
                  {item.name.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <small>Your club</small>
                </span>
                {selected === item.id ? (
                  <Check aria-label="Selected" size={22} />
                ) : null}
              </button>
            ))}
          {clubs.length === 0 ? (
            <p>Your clubs will appear here when connected to your account.</p>
          ) : clubs.every(
              (item) =>
                !item.name.toLowerCase().includes(query.trim().toLowerCase()),
            ) ? (
            <p>No clubs match your search.</p>
          ) : null}
        </div>
      </dialog>
    </main>
  );
}
