# The HQ shell and the `(next)` route group

Work package S1 (28 November 2026). How HQ's rebuilt screens are laid out,
what the shell gives a screen, and how to add one. The IA is
[`tideline-4.1.1/ia-hq.md`](tideline-4.1.1/ia-hq.md); the decision to replace
legacy screens instead of preserving them is
[`docs/plan/legacy-styles.md`](../plan/legacy-styles.md).

## Two root layouts

`apps/hq/app` has no root `layout.tsx`. It has two route groups, each with its
own root layout, so each is a separate document with separate CSS:

| Group      | Root layout               | CSS it loads                                                                    | Holds                         |
| ---------- | ------------------------- | ------------------------------------------------------------------------------- | ----------------------------- |
| `(next)`   | `app/(next)/layout.tsx`   | `@duna/ui/tideline/styles.css`, `app/(next)/hq.css`, the fonts (`app/fonts.ts`) | The shell, Today, the gallery |
| `(legacy)` | `app/(legacy)/layout.tsx` | The old sheets (unchanged)                                                      | Every page not rebuilt yet    |

Moving between the groups is a full page load. A screen package **moves** its
route from `(legacy)` to `(next)/(hq)` when it rebuilds it, and deletes the old
page's components, style rules and tests in the same pull request. When
`(legacy)` is empty, its layout and every legacy sheet go.

At the app root, outside both groups, stay only the files Next serves without
a layout: `api/**`, `auth/callback`, `sign-in` and `sign-up` (route
handlers), `actions.ts` and `workspace-actions.ts` (server actions),
`fonts.ts`, the metadata files (icons, manifest, Open Graph image),
`global-error.tsx` and `global-not-found.tsx` (each its own document, on the
design system only, because Next loads `global-error`'s CSS with every page;
`experimental.globalNotFound` is on in `next.config.mjs`). The Duna Pay return
page (`/stripe/return`) is a page, so it lives in `(legacy)` at the same
address.

`scripts/design-contracts/hq.ts` pins this: both layouts load the font module;
`(next)`'s layout is a design-system document; nothing under `app/(next)`,
nor `global-error` / `global-not-found`, imports a legacy sheet; `hq.css` has
no `@import` and no important flag; `app/layout.tsx` and the old
`legacy-bridge.css` do not exist.

## The document

`app/(next)/layout.tsx` renders `<body class="td" data-zone="hq">`: the whole
document is one design-system scope in the HQ zone (white ground, never sand).
A scope does not inherit a theme, so a tiny inline script, the first thing in
`<body>`, reads the person's choice (`localStorage["duna-theme"]`: `system`,
`light` or `dark`, the same key and options as the legacy layout) and sets
`data-theme` on `<html>` and `<body>` before anything paints. The account menu
changes it with `applyThemePreference` (`components/shell/theme.ts`), which
updates both. Fonts: `app/fonts.ts` puts the next/font variables on `<html>`;
the design-system font tokens read them (F7).

## The shell

`app/(next)/(hq)/layout.tsx` wraps every operator screen in `HqShell`
(`components/shell/hq-shell.tsx`, server) → `ShellFrame` (client):

- **Sidebar** (`sidebar.tsx`): white, hairline edge, 248 px expanded and 64 px
  collapsed. The choice is remembered in the `duna-hq-sidebar` cookie, so the
  server renders it with no jump; without a choice it is expanded from 1200 px
  and collapsed below (tablet). The 56 px brand row puts the Duna mark's left
  edge on the nav icons' drawn edge (checked at 400 %). Then the club switcher
  (`org-switcher.tsx`: club mark, name and role; the person's organisations;
  "Create new organisation"; "Your personal account"), the four groups from
  `components/navigation.ts` with the current item on the neutral wash in
  Night Court ink, and the account row (`account-menu.tsx`: profile, club
  settings, Duna Admin for staff, theme, sign out).
- **Top bar**: collapse button, breadcrumb, the command palette (Cmd/Ctrl K:
  every sidebar place, Settings, Account, the "create" pages and the theme,
  from `shell-commands.ts`; only HQ paths from the route map) and the **Ask
  Duna** button (Cmd/Ctrl J).
- **Ask Duna** (`ask-duna-panel.tsx`): docked on the right
  (`complementary` landmark), pushing the page on wide screens and over it
  below 1200 px. It re-houses the existing conversation (`AskDunaThread`,
  `AskDunaComposer`); proposals render as the kit's `ProposalCard`
  (`ask-duna-proposal.tsx`) and Approve goes through `useConfirm` at the
  action's tier (`strong` for money and removals, `confirm` otherwise).
  Without a working Ask Duna (demo, not configured, no access, signed out) it
  shows the honest state and makes no request. Escape closes it; focus returns
  to the button. Stays mounted while closed, so a draft survives.
- **Phone** (under 768 px): no sidebar; a bottom bar with Today, Schedule,
  Inbox, People and More (a sheet with Ask Duna, the switcher, every area and
  the account). Every function is reachable at 375 px.
- **States**: `(hq)/loading.tsx`, `(hq)/error.tsx` (kit `ErrorState`, reported
  through `@duna/observability` with the reference), `(hq)/not-found.tsx`, and
  "You don't have access to Duna HQ" (kit `PermissionDenied`) for a signed-in
  player or guardian, all inside the shell.
- **Keyboard and motion**: skip link, `banner` / `navigation` / `main` /
  `complementary` landmarks, visible focus, Escape closes panels; pages Cross
  in (`PageTransition`), the panel Rises from the end; reduced motion turns
  both into a short fade.

## What a screen uses

| Need                                  | Use                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------- |
| Person, organisation, roles, Ask Duna | `getHqSession()` (server, cached per request) or `useShellSession()` (client)             |
| A permission                          | `hasScope(session, "payments:read")`; `<RequireScope scope area>` around a section        |
| The title row                         | `<PageHeader title description actions back meta subnav>`: the ONE Jost title per screen  |
| Sub-navigation (S3)                   | `PageHeader`'s `subnav` slot: an object's `SubNav`, a settings `SectionNav`, list filters |
| A card section                        | `<PageSection id title aside flush>`                                                      |
| Breadcrumb and Ask Duna's context     | `<ShellPage crumb parentHref askLabel askStarters />` once in the page                    |
| Open Ask Duna with a task             | `useShell().openAsk("Draft next week's clinics")`                                         |
| A palette command                     | Add an entry to `components/shell/shell-commands.ts` (`go:<path>` from `hqHref`)          |
| Styles                                | `app/(next)/hq.css`, tokens only, in `@layer hq`; container queries on `hqs-main`         |

`ShellSession` (`components/shell/session-types.ts`) is serialisable:
`access` is `operator`, `denied` or `none`; `askDuna` is `ready`, `demo`,
`not-configured`, `no-access` or `signed-out`.

## Add a screen

1. `git mv` the route from `app/(legacy)/…` to `app/(next)/(hq)/…` (same
   address; fix relative imports).
2. Rebuild it on `@duna/ui/tideline` with the parts above; give every block
   loading, empty, error (with reference), not-configured and
   permission-denied states.
3. Delete the old page's components, style rules and tests; update e2e
   selectors that pinned the old layout.
4. Look at it at 1440, 1024 and 375 px, light and dark.

```tsx
// app/(next)/(hq)/reports/page.tsx
import { Button } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { RequireScope } from "@/components/shell/hq-shell";
import { getHqSession } from "@/components/shell/hq-session";
import { PageHeader, PageSection } from "@/components/shell/page-header";
import { ShellPage } from "@/components/shell/shell-context";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const session = await getHqSession();
  if (session.access !== "operator") return null; // the shell says why
  return (
    <>
      <ShellPage
        askLabel="Reports"
        askStarters={["How did October compare?"]}
      />
      <PageHeader
        title="Reports"
        description={session.organization?.name}
        actions={<Button variant="primary">Export</Button>}
      />
      <RequireScope area="Reports" scope="reports:read">
        <PageSection id="revenue" title="Revenue">
          …
        </PageSection>
      </RequireScope>
    </>
  );
}
```

## Test-only switches (demo mode)

Honoured only with no sign-in, demo mode, `DUNA_DEMO_PERSONAS=enabled` and
never on a production deployment (the persona switch's guard):

- `duna-demo-club=first-day`: Today shows a club with nothing in it yet.
- `duna-demo-ask=fixture`: Ask Duna is "ready", for the browser suites that
  answer `/api/ask-duna` themselves (`tests/ask-duna-fixture.ts` sets it).

Specs: `tests/e2e/hq-shell.spec.ts`; persona steps CO-11.2, CO-13.1, CO-13.2.
