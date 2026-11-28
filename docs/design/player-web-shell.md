# The Player web shell (`duna.coach/app`)

Work package P1 (28 November 2026). How the signed-in Player web app is laid
out on the Duna Design System, what the shell gives a page, and how a screen
package moves a page out of `(legacy)`. It is the sibling of the public site
shell ([`web-shell.md`](web-shell.md)): same `(next)` root layout, fonts,
theme boot script and tokens. Boards: `P-Shell-Sidebar`, `P-Shell-Topbar`,
`P-Shell-MobileBar`, `P-Home`, `M-Home-390` (Player web canvas, see
[`tideline-4.1.1/canvases.md`](tideline-4.1.1/canvases.md)); it mirrors the
Player app's shell (`apps/player/src/app/router.ts`, Home, Account) so the two
feel like one product.

## Where things are

| Part                                   | File                                                   |
| -------------------------------------- | ------------------------------------------------------ |
| Group layout (session → shell)         | `apps/web/app/(next)/(app)/layout.tsx`                 |
| Styles (tokens only, `@layer app`)     | `apps/web/app/(next)/(app)/app-shell.css`              |
| Home, loading, error, not-found        | `apps/web/app/(next)/(app)/app/`                       |
| Route table (verbs, titles, rebuilt)   | `apps/web/lib/app-routes.ts` (+ `app-routes.test.ts`)  |
| Frame: rail, top bar, phone bar        | `components/app-shell/app-shell.tsx`, `navigation.tsx` |
| Person menu (acting for, clubs, theme) | `components/app-shell/person-menu.tsx`                 |
| Command palette commands               | `components/app-shell/commands.ts`                     |
| Ask Duna (player path, `/api/duna-ai`) | `components/app-shell/ask-duna.tsx`                    |
| Session and "acting for"               | `components/app-shell/session.ts`, `acting-for.ts`     |
| Server actions (club, acting for)      | `components/app-shell/actions.ts`                      |
| Home model, data and view              | `components/app-shell/home/`                           |
| Signed-out redirect (both layouts)     | `components/app-shell/signed-out.tsx`                  |

## The shell

- **Wide (1,024 px and up)**: a 248 px white rail with the brand, the four
  verbs Find · Play · Improve · Connect (contract R15) each with the pages it
  holds, the create action **New** (a menu: book a court, book a lesson, find
  a match, host a pickup, add a result, record a game) and the person at the
  foot. The top bar shows whose account and the page title, Search (Cmd/Ctrl
  K), Messages with the unread count, and Ask Duna (Crest mark; Cmd/Ctrl J).
- **Phones**: a top bar (Crest, search, messages, Ask Duna, the person) and a
  bottom bar Find, Play, **+**, Improve, Connect, 64 px tall above the home
  indicator. Every function is reachable at 375 px.
- **Person menu**: who is signed in, **Whose account** (a guardian's juniors),
  the clubs with "Manage … in Duna HQ" and "Create new organisation",
  Profile / Account and household / Wallet, Appearance (Match device, Light,
  Dark: the same `duna-theme` key as the rest of Duna), and Sign out after a
  confirmation.
- **States**: route `loading.tsx` (skeletons), `error.tsx` (kit `ErrorState`
  with the reference, reported through `@duna/observability`; an ended session
  becomes the signed-out state), `not-found.tsx`, an offline banner, and
  signed out → `/sign-in?returnTo=<the page>`. If the session itself cannot be
  read the layout shows the error with its reference inside the frame.
- Skip link to `#main`, one `main`, navigation landmarks "Duna Player" (rail)
  and "Main" (phone bar); pages Cross in (`PageTransition`), cards Rise; under
  reduced motion both are a short fade.

## Acting for a junior

A guardian chooses a junior in the person menu (or "Act for …" in the
palette). `switchActingFor` stores the junior's person id in the httpOnly
`duna-acting-for` cookie; every request re-reads the guardian's own links
(`player.households.mine` guardianship links and `player.settings` household)
and ignores an id that is not one of their juniors, so the cookie never grants
anything. The API still authorises every read and write as the guardian.
While acting, a band on every screen says "You're acting for Remy Lewis" with
"Back to my account", the top bar says "Remy's account", and Home shows
Remy's plans only. Pages still in `(legacy)` show the guardian's own account
and the band says so. In demo mode only the `parent` persona has a household.

## Move a legacy `/app` page into the shell

1. `git mv "apps/web/app/(legacy)/app/wallet" "apps/web/app/(next)/(app)/app/wallet"`
   (same address; fix `@/app/(legacy)/…` imports).
2. Rebuild `page.tsx` on `@duna/ui/tideline` (example below); read the person
   with `getAppSession()` (server) or `useAppShell()` (client). Respect
   `session.actingFor` (show whose data it is) and `session.junior`.
3. In `lib/app-routes.ts` set the entry's `rebuilt: true`. The shell now
   navigates to it without a full page load; the route-table test checks the
   page lives in the tree the table says.
4. Delete the old page's components, style rules and tests; add styles to
   `app-shell.css` (tokens only) under a page prefix.
5. Look at it at 1440, 1024 and 375 px, light and dark, as a player, a parent
   acting for a junior and a brand-new player (`duna-demo-player=first-day`).

```tsx
// apps/web/app/(next)/(app)/app/wallet/page.tsx
import { Card, EmptyState } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { getAppSession } from "@/components/app-shell/session";
import { getServerCaller } from "@/lib/api";

export const metadata: Metadata = { title: "Wallet" };

export default async function WalletPage() {
  const session = await getAppSession();
  const wallet = await (await getServerCaller()).player.wallet();
  const whose = session.actingFor?.firstName ?? "Your";
  return (
    <div className="apw">
      <h1 className="td-display">
        {whose === "Your" ? "Your wallet" : `${whose}'s wallet`}
      </h1>
      {wallet.entries.length ? (
        <Card>…</Card>
      ) : (
        <EmptyState title="Nothing here yet" />
      )}
    </div>
  );
}
```

## Home

Greeting and where (date · active club), then Next up (the next future
booking or club session, its state, countdown, the group-session words from
the shared participation copy table, and one `ConditionsLine`: "No weather for
this location" when the event has no forecast), the four actions (Find a game,
Book a court, Find a coach, Add a score), Your game (`RatingRing` and the last
five), Who is Duna for (until onboarding is complete), Needs you, Your
household (a guardian's juniors and each one's next thing), This week, Your
clubs (`MembershipCard` / `WalletStack`, linking to the wallet) and Ask Duna.

Data: `player.dashboard`, `player.settings`, `player.catalogSessionBookings`
(with dependents), `player.paymentSchedules`, `player.organizationWallets`,
`messaging.inbox` (unread), `player.organizationAccess`,
`player.households.mine`. No new API.

**Needs API**: waivers due across clubs (today `waiverRequirements` needs an
organisation and an offering); the full participation copy on
`catalogSessionBookings` (it carries the state, not the session's rule, so the
"confirms Thu 6 PM if 2 more join" line is not shown); an occurrence id on
those bookings (to ask `participation.quote`); a junior's Sand Rating and
sessions readable by their guardian; sunrise / sunset for a booking's place on
the web; a demo junior booking fixture.

## Test-only switch (demo mode)

With no sign-in, demo mode, `DUNA_DEMO_PERSONAS=enabled` and never on a
production deployment: `duna-demo-player=first-day` shows Home for a player
with nothing booked, played or joined yet, and `duna-demo-wallet=0|1|5|12`
gives the Wallet that many example club cards (fictional clubs, a sample pass
labelled as one; `tests/e2e/player-wallet.spec.ts`).

Specs: `tests/e2e/player-web-shell.spec.ts`; persona steps PL-1.1, PA-7.1,
PA-7.2, VI-3.2, VI-4.2; unit tests `lib/app-routes.test.ts`,
`components/app-shell/home/home-model.test.ts`.
