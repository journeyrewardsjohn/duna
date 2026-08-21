"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { DunaMark } from "@duna/ui";
import { ThemeToggle } from "@duna/ui/theme-toggle";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  LogOut,
  Menu,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SiteNavigationQuickAction } from "@/lib/site-navigation";
import { clubFeatureByKey, clubFeatureGroups } from "@/lib/club-features";

const mainNavigation = [
  {
    href: "/discover",
    label: "Play",
    detail: "Games, sessions, and courts",
  },
  { href: "/pro", label: "Watch", detail: "The pro tour and live matches" },
  {
    href: "/rankings",
    label: "Sand Rating",
    detail: "Rankings and the rating system",
  },
  {
    href: "/run-your-club",
    label: "Clubs + coaches",
    detail: "Run the business behind the game",
  },
] as const;

interface NavigationUser {
  readonly avatarUrl?: string;
  readonly email: string;
  readonly initials: string;
  readonly name: string;
}

function initialsFor(input: {
  readonly email: string;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
}): string {
  return (
    `${input.firstName?.[0] ?? ""}${input.lastName?.[0] ?? ""}` ||
    input.email[0]?.toUpperCase() ||
    "D"
  );
}

function quickActionTime(startsAt: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

function UserAvatar({ user }: { readonly user: NavigationUser }) {
  return (
    <span className="site-mobile-sheet__avatar">
      {user.avatarUrl ? <img alt="" src={user.avatarUrl} /> : user.initials}
    </span>
  );
}

export function SiteMobileMenu({
  configured,
  hqUrl,
}: {
  readonly configured: boolean;
  readonly hqUrl: string;
}) {
  return configured ? (
    <ConfiguredSiteMobileMenu hqUrl={hqUrl} />
  ) : (
    <SiteMobileMenuView hqUrl={hqUrl} />
  );
}

function ConfiguredSiteMobileMenu({ hqUrl }: { readonly hqUrl: string }) {
  const { loading, signOut, user } = useAuth();
  const navigationUser = user
    ? {
        avatarUrl: user.profilePictureUrl ?? undefined,
        email: user.email,
        initials: initialsFor(user),
        name:
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          "Your Duna",
      }
    : undefined;

  return (
    <SiteMobileMenuView
      authLoading={loading}
      hqUrl={hqUrl}
      onSignOut={() => {
        void signOut({ returnTo: window.location.origin });
      }}
      user={navigationUser}
    />
  );
}

function SiteMobileMenuView({
  authLoading = false,
  hqUrl,
  onSignOut,
  user,
}: {
  readonly authLoading?: boolean;
  readonly hqUrl: string;
  readonly onSignOut?: () => void;
  readonly user?: NavigationUser;
}) {
  const [open, setOpen] = useState(false);
  const [quickActions, setQuickActions] = useState<
    readonly SiteNavigationQuickAction[]
  >([]);
  const [quickActionsLoading, setQuickActionsLoading] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !user) return;
    const controller = new AbortController();
    setQuickActionsLoading(true);
    void fetch("/api/site-navigation", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return { quickActions: [] };
        return (await response.json()) as {
          readonly quickActions?: readonly SiteNavigationQuickAction[];
        };
      })
      .then((payload) => {
        if (!controller.signal.aborted) {
          setQuickActions(payload.quickActions ?? []);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setQuickActionsLoading(false);
      });
    return () => controller.abort();
  }, [open, user]);

  const handleSheetKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="site-header__mobile">
      <button
        aria-controls="site-mobile-navigation"
        aria-expanded={open}
        aria-label="Open navigation menu"
        className="site-header__menu"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <Menu aria-hidden size={21} />
      </button>

      {open
        ? createPortal(
            <div
              aria-labelledby="site-mobile-navigation-title"
              aria-modal="true"
              className="site-mobile-sheet"
              data-zone="editorial"
              id="site-mobile-navigation"
              onKeyDown={handleSheetKeyDown}
              ref={sheetRef}
              role="dialog"
            >
              <header className="site-mobile-sheet__header">
                <Link
                  aria-label="Duna home"
                  className="site-mobile-sheet__brand"
                  href="/"
                  onClick={close}
                >
                  <DunaMark />
                </Link>
                <div>
                  <ThemeToggle label="Color theme" />
                  <button
                    aria-label="Close navigation menu"
                    className="site-mobile-sheet__close"
                    onClick={close}
                    ref={closeRef}
                    type="button"
                  >
                    <X aria-hidden size={23} />
                  </button>
                </div>
              </header>

              <div className="site-mobile-sheet__scroll">
                <div className="site-mobile-sheet__content">
                  <h2
                    className="site-mobile-sheet__title"
                    id="site-mobile-navigation-title"
                  >
                    Where do you want to go?
                  </h2>

                  <section
                    aria-label="Duna product sign in"
                    className="site-mobile-sheet__products"
                  >
                    <Link
                      className="site-mobile-product site-mobile-product--player"
                      href={user || authLoading ? "/app" : "/sign-in"}
                      onClick={close}
                    >
                      {user ? (
                        <UserAvatar user={user} />
                      ) : (
                        <span className="site-mobile-product__icon">
                          <UserRound aria-hidden size={21} />
                        </span>
                      )}
                      <span>
                        <small>Player app</small>
                        <strong>Duna Player</strong>
                        <em>
                          {user
                            ? `Signed in as ${user.name}`
                            : "Sign in or create an account"}
                        </em>
                      </span>
                      <ArrowRight aria-hidden size={19} />
                    </Link>

                    <a
                      className="site-mobile-product site-mobile-product--hq"
                      href={hqUrl}
                      onClick={close}
                    >
                      <span className="site-mobile-product__icon">
                        <Building2 aria-hidden size={20} />
                      </span>
                      <span>
                        <small>For business</small>
                        <strong>Duna HQ</strong>
                        <em>Clubs, coaches, and operations</em>
                      </span>
                      <ArrowRight aria-hidden size={19} />
                    </a>
                  </section>

                  {user && (quickActionsLoading || quickActions.length > 0) ? (
                    <section
                      aria-label="Upcoming Duna events"
                      className="site-mobile-sheet__upcoming"
                    >
                      <div className="site-mobile-sheet__section-heading">
                        <span>Up next</span>
                        <CalendarDays aria-hidden size={18} />
                      </div>
                      {quickActionsLoading ? (
                        <p
                          aria-live="polite"
                          className="site-mobile-sheet__loading"
                        >
                          Checking your next events…
                        </p>
                      ) : (
                        <div className="site-mobile-sheet__quick-actions">
                          {quickActions.map((action) => {
                            const content = (
                              <>
                                <span>
                                  <small>{action.product}</small>
                                  <strong>{action.title}</strong>
                                  <time dateTime={action.startsAt}>
                                    {quickActionTime(action.startsAt)}
                                  </time>
                                  <em>{action.detail}</em>
                                </span>
                                <ArrowRight aria-hidden size={19} />
                              </>
                            );
                            return action.surface === "hq" ? (
                              <a
                                href={action.href}
                                key={action.surface}
                                onClick={close}
                              >
                                {content}
                              </a>
                            ) : (
                              <Link
                                href={action.href}
                                key={action.surface}
                                onClick={close}
                              >
                                {content}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  ) : null}

                  <nav
                    aria-label="Mobile navigation"
                    className="site-mobile-sheet__nav"
                  >
                    <span className="site-mobile-sheet__section-heading">
                      Explore Duna
                    </span>
                    {mainNavigation.map((item) => (
                      <Link href={item.href} key={item.href} onClick={close}>
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.detail}</small>
                        </span>
                        <ArrowRight aria-hidden size={20} />
                      </Link>
                    ))}
                    <Link
                      className="site-mobile-sheet__create"
                      href="/create"
                      onClick={close}
                    >
                      Create an event <ArrowRight aria-hidden size={18} />
                    </Link>
                  </nav>

                  <section
                    aria-label="Duna HQ features"
                    className="site-mobile-sheet__features"
                  >
                    <div className="site-mobile-sheet__section-heading">
                      <span>Run your club</span>
                      <Link href="/run-your-club/features" onClick={close}>
                        All features
                      </Link>
                    </div>
                    {clubFeatureGroups.map((group) => (
                      <div key={group.label}>
                        <header>
                          <strong>{group.label}</strong>
                          <small>{group.description}</small>
                        </header>
                        <nav aria-label={group.label}>
                          {group.keys.map((key) => {
                            const item = clubFeatureByKey.get(key);
                            return item ? (
                              <Link
                                href={item.href}
                                key={item.key}
                                onClick={close}
                              >
                                {item.navLabel}
                                <ArrowRight aria-hidden size={16} />
                              </Link>
                            ) : null;
                          })}
                        </nav>
                      </div>
                    ))}
                  </section>

                  {user ? (
                    <footer className="site-mobile-sheet__account">
                      <div>
                        <UserAvatar user={user} />
                        <span>
                          <strong>{user.name}</strong>
                          <small>{user.email}</small>
                        </span>
                      </div>
                      <nav aria-label="Account navigation">
                        <Link href="/app/profile" onClick={close}>
                          <UserRound aria-hidden size={17} /> Profile
                        </Link>
                        <Link href="/app/settings" onClick={close}>
                          <Settings aria-hidden size={17} /> Settings
                        </Link>
                        <button
                          onClick={() => {
                            close();
                            onSignOut?.();
                          }}
                          type="button"
                        >
                          <LogOut aria-hidden size={17} /> Sign out
                        </button>
                      </nav>
                    </footer>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
