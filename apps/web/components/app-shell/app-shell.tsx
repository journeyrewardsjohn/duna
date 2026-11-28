"use client";

import { report } from "@duna/observability";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  CommandPalette,
  CrestMark,
  OfflineBanner,
  PageTransition,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  Toaster,
  errorToast,
} from "@duna/ui/tideline";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  APP_ROUTES,
  isShellRoute,
  routeForPath,
  signInHref,
  signUpHref,
} from "@/lib/app-routes";
import { switchActingFor } from "./actions";
import { AskDunaSheet } from "./ask-duna";
import { parseShellCommand, shellCommands } from "./commands";
import { AppBrand, AppLink, Dock, NewActions, Rail } from "./navigation";
import { PersonMenu } from "./person-menu";
import type { AppSession } from "./session-types";
import { AppShellContext, type AppShellApi } from "./shell-context";
import { applyThemePreference } from "./theme";

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

/** "Showing Remy's account": on every screen while a guardian acts for a junior. */
function ActingForBand({ session }: { readonly session: AppSession }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const junior = session.actingFor;
  if (!junior) return null;
  return (
    <div className="aps-acting" role="status">
      <Icon name="junior-guardian" size="control" />
      <p className="aps-acting__text">
        <strong>You&rsquo;re acting for {junior.displayName}.</strong>{" "}
        <span>
          Home shows {junior.firstName}&rsquo;s plans. Pages not on the new
          design yet still show your own account.
        </span>
      </p>
      <Button
        loading={pending}
        onClick={async () => {
          setPending(true);
          try {
            await switchActingFor(null);
            router.refresh();
          } catch (error) {
            errorToast("Duna couldn't switch accounts. Try again.", {
              reference: report(error, {
                event: "web.app_shell.acting_for_failed",
              }),
            });
          } finally {
            setPending(false);
          }
        }}
        size="sm"
        variant="secondary"
      >
        Back to my account
      </Button>
    </div>
  );
}

/**
 * The Player web shell (board P-Shell-Sidebar / Topbar / MobileBar): a side
 * rail with the four verbs on wide screens, a top bar with the page, search
 * (Cmd/Ctrl K), messages, Ask Duna and the person; on phones a top bar and a
 * bottom bar with the centre create action. Pages Cross in. Signed out, only
 * the brand and sign-in show.
 */
export function AppShell({
  session,
  children,
}: {
  readonly session: AppSession;
  readonly children: ReactNode;
}) {
  const pathname = usePathname() || "/app";
  const router = useRouter();
  const online = useOnline();
  const [askOpen, setAskOpen] = useState(false);
  const [askRequest, setAskRequest] = useState<{
    id: number;
    prompt: string;
  }>();
  const [newOpen, setNewOpen] = useState(false);
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const sequence = useRef(0);
  const signedIn = session.state === "signed-in";
  const route = routeForPath(pathname);

  const openAsk = useCallback((prompt?: string) => {
    setNewSheetOpen(false);
    setNewOpen(false);
    setAskOpen(true);
    if (prompt) setAskRequest({ id: ++sequence.current, prompt });
  }, []);
  const openNew = useCallback(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) setNewOpen(true);
    else setNewSheetOpen(true);
  }, []);
  const handled = useCallback((id: number) => {
    setAskRequest((current) => (current?.id === id ? undefined : current));
  }, []);

  // Cmd/Ctrl J opens and closes Ask Duna anywhere in the app.
  useEffect(() => {
    if (!signedIn) return;
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "j"
      ) {
        event.preventDefault();
        setAskOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [signedIn]);

  // Menus close when the page changes.
  useEffect(() => {
    setNewOpen(false);
    setNewSheetOpen(false);
  }, [pathname]);

  const commands = useMemo(
    () =>
      shellCommands({
        junior: session.junior,
        dependents: session.dependents,
      }),
    [session.junior, session.dependents],
  );

  const runCommand = useCallback(
    async (value: string) => {
      const command = parseShellCommand(value);
      if (command.kind === "go") {
        if (isShellRoute(command.href)) router.push(command.href);
        else window.location.assign(command.href);
      } else if (command.kind === "act") {
        try {
          await switchActingFor(command.personId);
          router.refresh();
        } catch (error) {
          errorToast("Duna couldn't switch accounts. Try again.", {
            reference: report(error, {
              event: "web.app_shell.acting_for_failed",
            }),
          });
        }
      } else if (command.kind === "do") {
        if (command.action === "ask") openAsk();
        if (command.action === "new") openNew();
        if (command.action === "theme-light") applyThemePreference("light");
        if (command.action === "theme-dark") applyThemePreference("dark");
        if (command.action === "theme-system") applyThemePreference("system");
      }
    },
    [openAsk, openNew, router],
  );

  const api = useMemo<AppShellApi>(
    () => ({ session, openAsk, openNew }),
    [session, openAsk, openNew],
  );

  const unread = session.unreadMessages ?? 0;
  const messagesLabel = unread ? `Messages, ${unread} unread` : "Messages";
  const askButton = (
    <button
      aria-keyshortcuts="Meta+J Control+J"
      className="aps-askbtn"
      onClick={() => openAsk()}
      type="button"
    >
      <CrestMark className="aps-askbtn__mark" micro />
      <span className="aps-askbtn__label">Ask Duna</span>
    </button>
  );
  const messagesButton = (
    <AppLink
      aria-label={messagesLabel}
      className="aps-iconlink"
      href={APP_ROUTES.messages.path}
    >
      <Icon name="message" size="control" />
      {unread ? <span aria-hidden="true" className="aps-dot" /> : null}
    </AppLink>
  );

  return (
    <AppShellContext.Provider value={api}>
      <a className="aps-skip" href="#main">
        Skip to content
      </a>
      <div
        className="aps"
        data-signed={signedIn ? "in" : "out"}
        data-zone="athletic"
      >
        {signedIn ? (
          <nav aria-label="Duna Player" className="aps-rail">
            <Rail
              foot={<PersonMenu placement="rail" session={session} />}
              newControl={
                <Popover onOpenChange={setNewOpen} open={newOpen}>
                  <PopoverTrigger block variant="primary">
                    <Icon name="plus" size="control" />
                    New
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="aps-new-popover"
                    side="right"
                    title="New"
                  >
                    <NewActions
                      junior={session.junior}
                      onChoose={() => setNewOpen(false)}
                    />
                  </PopoverContent>
                </Popover>
              }
              pathname={pathname}
              session={session}
            />
          </nav>
        ) : null}
        <div className="aps-work">
          <header className="aps-top">
            <div className="aps-top__brand">
              <AppBrand compact={signedIn} />
            </div>
            {signedIn ? (
              <p className="aps-top__title">
                {session.actingFor ? (
                  <span className="aps-top__whose">
                    {session.actingFor.firstName}&rsquo;s account ·{" "}
                  </span>
                ) : null}
                {route?.title ?? "Duna"}
              </p>
            ) : null}
            <div className="aps-top__end">
              {signedIn ? (
                <>
                  <CommandPalette
                    className="aps-search"
                    commands={commands}
                    emptyText="Nothing matches. Try a page name, like Wallet."
                    onAction={runCommand}
                    placeholder="Go to a page or start something"
                    title="Search Duna"
                    triggerLabel="Search"
                  />
                  {messagesButton}
                  {askButton}
                  <span className="aps-top__person">
                    <PersonMenu placement="top" session={session} />
                  </span>
                </>
              ) : (
                <>
                  <Button
                    href={signInHref(pathname)}
                    size="sm"
                    variant="secondary"
                  >
                    Sign in
                  </Button>
                  <Button
                    href={signUpHref(pathname)}
                    size="sm"
                    variant="primary"
                  >
                    Create account
                  </Button>
                </>
              )}
            </div>
          </header>
          {signedIn ? <ActingForBand session={session} /> : null}
          {online ? null : (
            <div className="aps-offline">
              <OfflineBanner online={false} writes="refused" />
            </div>
          )}
          <main className="aps-main" id="main" tabIndex={-1}>
            <PageTransition routeKey={pathname}>{children}</PageTransition>
          </main>
        </div>
        {signedIn ? (
          <nav aria-label="Main" className="aps-dock">
            <Dock onNew={openNew} pathname={pathname} session={session} />
          </nav>
        ) : null}
      </div>
      {signedIn ? (
        <>
          <AskDunaSheet
            onOpenChange={setAskOpen}
            onRequestHandled={handled}
            open={askOpen}
            pathname={pathname}
            request={askRequest}
          />
          <Sheet onOpenChange={setNewSheetOpen} open={newSheetOpen}>
            <SheetContent className="aps-new-sheet" title="New">
              <NewActions
                junior={session.junior}
                onChoose={() => setNewSheetOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </>
      ) : null}
      <Toaster />
    </AppShellContext.Provider>
  );
}
