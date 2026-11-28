"use client";

import { DunaMark } from "@duna/ui";
import { Icon } from "@duna/ui/icons";
import {
  CommandPalette,
  IconButton,
  PageTransition,
  Sheet,
  SheetContent,
  Toaster,
} from "@duna/ui/tideline";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { operatorModules } from "../navigation";
import {
  AskDunaPanel,
  defaultAskStarters,
  type AskRequest,
} from "./ask-duna-panel";
import {
  activeModuleForPath,
  isPhoneBarModule,
  moduleLabel,
  phoneBarModules,
  SIDEBAR_STORAGE_KEY,
  type SidebarMode,
} from "./nav-state";
import type { ShellSession } from "./session-types";
import {
  ShellContext,
  type ShellApi,
  type ShellPageInfo,
} from "./shell-context";
import { parseShellCommand, shellCommandsFor } from "./shell-commands";
import { Sidebar, type NavCounts } from "./sidebar";
import { applyThemePreference } from "./theme";

/** The width from which the sidebar is expanded unless the person chose. */
const WIDE_QUERY = "(min-width: 1200px)";

function rememberSidebar(mode: SidebarMode) {
  // A cookie, so the server renders the person's choice: no jump on load.
  document.cookie = `${SIDEBAR_STORAGE_KEY}=${mode}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * The HQ shell (Tideline 4.1.1 `HQShell`): sidebar, top bar with the command
 * palette and the Ask Duna button, the page, and the docked Ask Duna panel.
 * Phone: a bottom bar with four areas and "More" (everything else).
 */
export function ShellFrame({
  session,
  sidebar: initialSidebar,
  counts,
  peopleCommands,
  children,
}: {
  readonly session: ShellSession;
  /** People's switched palette commands that are on for this person. */
  readonly peopleCommands?: {
    readonly import: boolean;
    readonly merge: boolean;
  };
  /** The remembered choice, or undefined for the width's default. */
  readonly sidebar?: SidebarMode;
  readonly counts?: NavCounts;
  readonly children: ReactNode;
}) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const active = activeModuleForPath(pathname);
  const [sidebar, setSidebar] = useState<SidebarMode | undefined>(
    initialSidebar,
  );
  const [collapsedNow, setCollapsedNow] = useState(
    initialSidebar === "collapsed",
  );
  const [askOpen, setAskOpen] = useState(false);
  const [askRequest, setAskRequest] = useState<AskRequest>();
  const [moreOpen, setMoreOpen] = useState(false);
  const [page, setPageState] = useState<ShellPageInfo>({});
  const requestSequence = useRef(0);
  const askButton = useRef<HTMLButtonElement>(null);

  // Track whether the sidebar is drawn collapsed (choice or tablet width).
  useEffect(() => {
    const wide = window.matchMedia(WIDE_QUERY);
    const update = () =>
      setCollapsedNow(
        sidebar === "collapsed" || (sidebar === undefined && !wide.matches),
      );
    update();
    wide.addEventListener("change", update);
    return () => wide.removeEventListener("change", update);
  }, [sidebar]);

  const toggleSidebar = useCallback(() => {
    const next: SidebarMode = collapsedNow ? "expanded" : "collapsed";
    setSidebar(next);
    rememberSidebar(next);
  }, [collapsedNow]);

  const openAsk = useCallback((prompt?: string) => {
    setAskOpen(true);
    setMoreOpen(false);
    if (prompt) {
      setAskRequest({ id: ++requestSequence.current, prompt });
    }
  }, []);
  const closeAsk = useCallback(() => {
    setAskOpen(false);
    // Focus returns to the button that opened it.
    window.requestAnimationFrame(() => askButton.current?.focus());
  }, []);
  const handled = useCallback((id: number) => {
    setAskRequest((current) => (current?.id === id ? undefined : current));
  }, []);

  // Cmd/Ctrl J opens and closes Ask Duna from anywhere in the shell.
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "j"
      ) {
        event.preventDefault();
        if (askOpen) closeAsk();
        else openAsk();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [askOpen, closeAsk, openAsk]);

  // A link with ?duna=ask (from Ask Duna's own links and older bookmarks)
  // opens the panel.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("duna") === "ask") {
      setAskOpen(true);
    }
  }, [pathname]);

  // Close the phone menu when the page changes.
  useEffect(() => setMoreOpen(false), [pathname]);

  const setPage = useCallback((next: ShellPageInfo) => setPageState(next), []);
  const api = useMemo<ShellApi>(
    () => ({ session, openAsk, closeAsk, askOpen, page, setPage }),
    [session, openAsk, closeAsk, askOpen, page, setPage],
  );

  const areaLabel = moduleLabel(active);
  const areaHref =
    operatorModules.find((item) => item.slug === active)?.href ?? "/";
  const pageLabel = page.askLabel ?? page.crumb ?? areaLabel;
  const starters = page.askStarters?.length
    ? page.askStarters
    : defaultAskStarters;

  return (
    <ShellContext.Provider value={api}>
      <a className="hqs-skip" href="#hqs-main">
        Skip to content
      </a>
      <div
        className="hqs"
        data-ask={askOpen || undefined}
        data-sidebar={sidebar ?? "auto"}
      >
        <nav aria-label="Duna HQ" className="hqs-side" id="hqs-side">
          <Sidebar
            active={active}
            collapsed={collapsedNow}
            counts={counts}
            session={session}
          />
        </nav>
        <div className="hqs-work">
          <header className="hqs-top">
            <IconButton
              aria-controls="hqs-side"
              aria-expanded={!collapsedNow}
              className="hqs-top__collapse"
              label={collapsedNow ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleSidebar}
            >
              <Icon name="sidebar" size="control" />
            </IconButton>
            <Link
              aria-label="Duna HQ, go to Today"
              className="hqs-top__brand"
              href="/"
            >
              <DunaMark decorative size={20} />
            </Link>
            <nav aria-label="Breadcrumb" className="hqs-crumbs">
              <ol>
                <li>
                  <Link
                    aria-current={page.crumb ? undefined : "page"}
                    href={page.parentHref ?? areaHref}
                  >
                    {areaLabel}
                  </Link>
                </li>
                {page.crumb ? (
                  <li>
                    <span aria-hidden="true" className="hqs-crumbs__sep">
                      /
                    </span>
                    <span aria-current="page">{page.crumb}</span>
                  </li>
                ) : null}
              </ol>
            </nav>
            <div className="hqs-top__actions">
              <CommandPalette
                className="hqs-search"
                commands={shellCommandsFor(peopleCommands)}
                emptyText="Nothing matches. Try a page name, like Money."
                onAction={(value) => {
                  const command = parseShellCommand(value);
                  if (command.kind === "go") router.push(command.href);
                  if (command.kind === "do") {
                    if (command.action === "ask") openAsk();
                    if (command.action === "theme-light")
                      applyThemePreference("light");
                    if (command.action === "theme-dark")
                      applyThemePreference("dark");
                    if (command.action === "theme-system")
                      applyThemePreference("system");
                  }
                }}
                placeholder="Go to a page or run a command"
                title="Search Duna HQ"
                triggerLabel="Search"
              />
              <button
                aria-controls="hqs-ask"
                aria-expanded={askOpen}
                aria-keyshortcuts="Meta+J Control+J"
                className="hqs-askbtn"
                onClick={() => (askOpen ? closeAsk() : openAsk())}
                ref={askButton}
                type="button"
              >
                <DunaMark decorative micro size={16} />
                <span className="hqs-askbtn__label">Ask Duna</span>
                <span aria-hidden="true" className="hqs-askbtn__keys">
                  <kbd className="td-kbd">⌘</kbd>
                  <kbd className="td-kbd">J</kbd>
                </span>
              </button>
            </div>
          </header>
          <div className="hqs-workarea">
            <main className="hqs-main" id="hqs-main" tabIndex={-1}>
              <PageTransition routeKey={pathname}>{children}</PageTransition>
            </main>
            <AskDunaPanel
              onClose={closeAsk}
              onRequestHandled={handled}
              open={askOpen}
              pageLabel={pageLabel}
              pathname={pathname}
              request={askRequest}
              session={session}
              starters={starters}
            />
          </div>
        </div>
        <nav aria-label="Quick navigation" className="hqs-phonebar">
          {phoneBarModules.map((slug) => {
            const item = operatorModules.find(
              (module) => module.slug === slug,
            )!;
            return (
              <Link
                aria-current={active === slug ? "page" : undefined}
                className="hqs-phonebar__item"
                href={item.href}
                key={slug}
              >
                <Icon name={item.icon} size="control" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button
            aria-expanded={moreOpen}
            className="hqs-phonebar__item"
            data-active={(!isPhoneBarModule(active) && active) || undefined}
            onClick={() => setMoreOpen(true)}
            type="button"
          >
            <Icon name="more" size="control" />
            <span>More</span>
          </button>
        </nav>
        <Sheet onOpenChange={setMoreOpen} open={moreOpen}>
          <SheetContent className="hqs-more" title="Duna HQ">
            <div className="hqs-more__ask">
              <button
                className="hqs-askbtn"
                onClick={() => openAsk()}
                type="button"
              >
                <DunaMark decorative micro size={16} />
                <span className="hqs-askbtn__label">Ask Duna</span>
              </button>
            </div>
            <Sidebar
              active={active}
              collapsed={false}
              counts={counts}
              onNavigate={() => setMoreOpen(false)}
              session={session}
            />
          </SheetContent>
        </Sheet>
      </div>
      <Toaster />
    </ShellContext.Provider>
  );
}
