"use client";

import { Icon } from "@duna/ui/icons";
import { CrestMark, Wordmark } from "@duna/ui/tideline";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import {
  APP_ROUTES,
  APP_VERBS,
  NEW_ACTIONS,
  isShellRoute,
  routeForPath,
  routesForVerb,
  verbForPath,
  type AppVerb,
} from "@/lib/app-routes";
import type { AppSession } from "./session-types";

/**
 * A link inside the app. Pages rebuilt in `app/(next)/(app)` share the
 * shell's document, so they get client navigation; everything else (pages
 * still in `(legacy)`, the public site) is a full page load.
 */
export function AppLink({
  href,
  children,
  ...props
}: Omit<ComponentProps<"a">, "href"> & {
  readonly href: string;
  readonly children: ReactNode;
}) {
  if (isShellRoute(href.split(/[?#]/)[0] ?? href)) {
    return (
      <Link href={href} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

/** The Crest and the drawn wordmark, as the link to Home. */
export function AppBrand({ compact = false }: { readonly compact?: boolean }) {
  return (
    <Link
      aria-label="Duna Player, Home"
      className="aps-brand"
      href={APP_ROUTES.home.path}
    >
      <CrestMark className="aps-brand__mark" />
      {compact ? null : (
        <>
          <Wordmark
            className="aps-brand__word"
            strokeClassName="aps-brand__stroke"
          />
          <span className="aps-brand__product">Player</span>
        </>
      )}
    </Link>
  );
}

function verbHref(verb: AppVerb): string {
  const definition = APP_VERBS.find((candidate) => candidate.key === verb)!;
  return APP_ROUTES[definition.root].path;
}

function countFor(verb: AppVerb, session: AppSession): number | null {
  return verb === "connect" && session.unreadMessages
    ? session.unreadMessages
    : null;
}

/**
 * The side rail on wide screens (board P-Shell-Sidebar): the four verbs, each
 * with the pages it holds, the create action, and the person at the foot.
 */
export function Rail({
  pathname,
  session,
  newControl,
  foot,
}: {
  readonly pathname: string;
  readonly session: AppSession;
  /** The create action: a menu anchored to the rail's New button. */
  readonly newControl: ReactNode;
  readonly foot: ReactNode;
}) {
  const verb = verbForPath(pathname);
  const current = routeForPath(pathname);
  return (
    <>
      <div className="aps-rail__brand">
        <AppBrand />
      </div>
      <ul className="aps-rail__verbs">
        {APP_VERBS.map((definition) => {
          const count = countFor(definition.key, session);
          return (
            <li key={definition.key}>
              <AppLink
                aria-current={verb === definition.key ? "true" : undefined}
                className="aps-verb"
                href={verbHref(definition.key)}
              >
                <Icon name={definition.icon} size="nav" />
                <span className="aps-verb__label">{definition.title}</span>
                {count ? (
                  <span className="aps-count td-num">
                    {count}
                    <span className="td-sr"> unread</span>
                  </span>
                ) : null}
              </AppLink>
              <ul className="aps-rail__pages">
                {routesForVerb(definition.key, {
                  junior: session.junior,
                }).map((route) => (
                  <li key={route.path}>
                    <AppLink
                      aria-current={
                        current?.path === route.path ? "page" : undefined
                      }
                      className="aps-page-link"
                      href={route.path}
                    >
                      {route.title}
                    </AppLink>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      <div className="aps-rail__new">{newControl}</div>
      <div className="aps-rail__foot">{foot}</div>
    </>
  );
}

/**
 * The phone bar (board P-Shell-MobileBar, contract R15): Find, Play, the
 * centre create action, Improve, Connect. 56 px targets above the home
 * indicator.
 */
export function Dock({
  pathname,
  session,
  onNew,
}: {
  readonly pathname: string;
  readonly session: AppSession;
  readonly onNew: () => void;
}) {
  const verb = verbForPath(pathname);
  const item = (definition: (typeof APP_VERBS)[number]) => {
    const count = countFor(definition.key, session);
    return (
      <AppLink
        aria-current={verb === definition.key ? "true" : undefined}
        className="aps-dock__item"
        href={verbHref(definition.key)}
        key={definition.key}
      >
        <span className="aps-dock__icon">
          <Icon name={definition.icon} size="nav" />
          {count ? <span aria-hidden="true" className="aps-dot" /> : null}
        </span>
        <span>{definition.title}</span>
        {count ? <span className="td-sr">, {count} unread</span> : null}
      </AppLink>
    );
  };
  return (
    <>
      {APP_VERBS.slice(0, 2).map(item)}
      <button
        aria-label="New: book, match or result"
        className="aps-dock__new"
        onClick={onNew}
        type="button"
      >
        <span className="aps-dock__plus">
          <Icon name="plus" size="nav" />
        </span>
      </button>
      {APP_VERBS.slice(2).map(item)}
    </>
  );
}

/** Every way to start something (the create action). */
export function NewActions({
  junior,
  onChoose,
}: {
  readonly junior: boolean;
  readonly onChoose?: () => void;
}) {
  return (
    <ul className="aps-new">
      {NEW_ACTIONS.filter((action) => !(junior && action.adultOnly)).map(
        (action) => (
          <li key={action.key}>
            <AppLink
              className="aps-new__item"
              href={action.href}
              onClick={onChoose}
            >
              <span className="aps-new__icon">
                <Icon name={action.icon} size="control" />
              </span>
              <span className="aps-new__text">
                <span className="aps-new__title">{action.title}</span>
                <span className="td-meta">{action.summary}</span>
              </span>
              <Icon
                className="aps-new__go"
                name="chevron-right"
                size="inline"
              />
            </AppLink>
          </li>
        ),
      )}
    </ul>
  );
}
