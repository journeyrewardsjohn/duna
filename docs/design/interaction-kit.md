# Interaction kit

Work package X1, 27 November 2026. The shared parts every rebuilt screen uses
for motion, confirmations, async actions, debounce, honest states and form
behaviour, so no screen reinvents them. Everything imports from
`@duna/ui/tideline`; the library conventions are in
[`tideline-components.md`](tideline-components.md), the rules in the contract
([`tideline-4.1.1/README.md`](tideline-4.1.1/README.md), R10 and R18) and in
the definition of done (`docs/plan/definition-of-done.md`, sections 2 to 5).
Every part is shown, with simulated latency and a "Fail next request"
switch, in the gallery (`TIDELINE_GALLERY=1 pnpm dev:hq`, `/tideline`).

## Timing constants

Import these; never write a literal delay in a screen.

| Constant             | Value  | Token                                | Used for                                                 |
| -------------------- | ------ | ------------------------------------ | -------------------------------------------------------- |
| `LOADING_DELAY_MS`   | 250 ms | `--td-delay-loading`                 | No loader for work shorter than this                     |
| `LOADING_MIN_MS`     | 400 ms | `--td-duration-loading-min`          | A loader that shows stays at least this long             |
| `SEARCH_DEBOUNCE_MS` | 220 ms | `--td-debounce-search`               | Search and typeahead                                     |
| `DEBOUNCE_MS`        | 220 ms | `--td-debounce-search`               | Default for `useDebouncedValue` / `useDebouncedCallback` |
| `THROTTLE_MS`        | 300 ms | PROMOTE `--td-throttle-continuous`   | Map bounds, scroll, resize: one call per interval        |
| `AUTOSAVE_DELAY_MS`  | 2 s    | PROMOTE `--td-debounce-autosave`     | Draft saves after typing stops (and at once on blur)     |
| `UNDO_WINDOW_MS`     | 6 s    | PROMOTE `--td-duration-undo-window`  | How long Undo is on offer (pauses on hover/focus)        |
| `SUCCESS_HOLD_MS`    | 1.6 s  | PROMOTE `--td-duration-success-hold` | A "Saved" state holds before returning to rest           |
| `REPEAT_GUARD_MS`    | 500 ms | PROMOTE `--td-duration-repeat-guard` | A repeat this soon after a success is ignored            |

Motion durations come from the tokens: Rise `--td-duration-rise` 600 ms,
Rally `--td-duration-rally` 600 ms with `--td-stagger-rally` 120 ms, Cross
`--td-duration-cross` 320 ms, all on `--td-ease-*` (inside 0..1, nothing
overshoots). Under reduced motion the tokens make each a 200 ms fade and
`--td-motion: 0` removes all travel.

## Motion

| Part                              | Use it for                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `Rise`, `riseClassName({ from })` | A pane, card or confirmation entering: grows out of the edge nearest its line               |
| `Rally`, `rallyStyle(i)`          | Siblings arriving one after another, on first load only (never on scroll); capped at 8      |
| `RallyOnChange value`             | A change in place: a status flips to Confirmed, a count updates. Still on first render      |
| `Cross`, `PaneTransition`         | A pane, tab or wizard step crossing to the next (`direction="forward" \| "back"`)           |
| `PageTransition routeKey`         | Page content crossing in on a route change (put it in a client layout with `usePathname()`) |
| `crossViewTransition(update)`     | Opt-in: both views move, through the View Transitions API, where the browser has it         |
| `AnimatedList`                    | Insert Rises in place, remove fades where it was, reorder slides (not while hovered)        |
| `NumberChange value format`       | Scores and ratings: only the changed digits Rally up, in fixed cells                        |
| `FirstOpen ready once`            | The brand's first-open sequence; skippable (Skip, Escape), plays once per session           |

```tsx
<Rise from="bottom">{confirmation}</Rise>

<ul>
  {rows.map((row, i) => (
    <li className={riseClassName()} key={row.id} style={rallyStyle(i)}>…</li>
  ))}
</ul>

// app/(shell)/template.tsx-style client layout
<PageTransition routeKey={usePathname()}>{children}</PageTransition>
```

Rules enforced in code: only `transform`/`translate`, `clip-path` and
`opacity` move (no layout animation, so nothing shifts under a pointer);
nothing blocks input (CSS animations, the new view is interactive at once;
the view-transition Cross skips on any pointer press); no loops except the
loaders; no motion on money or a rating before the value is final.

**Page transitions and the framework.** HQ and Web run Next.js 16.2. Its
bundled React canary has `ViewTransition`, but wiring it to App Router
navigations needs `experimental.viewTransition` in `next.config` (not owned
by X1) and React types the apps do not have. So the kit uses a CSS Cross
keyed on the route (`PageTransition`), which works in every browser and never
holds input, plus `crossViewTransition` (`document.startViewTransition`,
Chromium and Safari 18+; elsewhere it just runs the update) for same-page
swaps. `usePendingNavigation(router.push)` + `TopProgress` covers slow route
changes.

**Loaders** (brand book section 6), in `loaders/`: `RallyLoader` (default
wait), `CrossingLoader` (searching), `SetBySet` (known steps), `Serve`
(sign-in, long sync), `MicroRally` (inside a pressed `Button`, now its
loader), `PullToRefresh` (with a Refresh button for keyboard users),
`HorizonSweep` (tide sweep) and `Skeleton` (sand shimmer).

## Confirmation tiers

One API, `useConfirm()`, for all three. Render `confirm.dialog` once.

| Tier          | When                                                                           | What the person sees                                                                                      |
| ------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `undo` (0)    | Reversible, low stakes: archive, rename, reorder, toggle, mark read            | It happens at once; a toast offers Undo for 6 s with a line that empties                                  |
| `confirm` (1) | Irreversible or outward-facing: sends, publishes, invites, cancels with notice | One dialog: the question, what happens, who is affected; the button is the verb                           |
| `strong` (2)  | Money, deleting data, many people                                              | Restates amount, recipients or scope, the consequence and the reference; typing only for destructive bulk |

Built in: `data-agent-confirm` on the confirming control (the agent bridge
stops for a person), Cancel first and focused when `destructive`, the verb
focused otherwise, the typed phrase focused when asked; Escape answers no
(unless the action is running); the confirming button is single-flight with
an idempotency key reused on retry; a failure stays in the dialog with its
reference. A development warning names a vague verb ("OK"), a strong
confirmation that restates nothing, or a second step asked for where it does
not belong (it is then left out).

**Never two dialogs deep.** Inside an open Dialog or Sheet use
`useConfirm({ presentation: "inline" })`, wrap the body in
`<ConfirmSlot confirm={confirm}>`, and spread `confirm.hostProps` on the
outer `Dialog`: the question replaces the dialog's content (which stays
mounted, so typed values survive), Escape answers no and keeps the dialog.

Examples from this product:

```tsx
// Tier 0: delete a drill from a practice plan (the drill stays in the library)
confirm.run({
  tier: "undo",
  title: "Serve receive removed from the plan",
  undoneMessage: "Serve receive is back",
  optimistic: () => {
    const before = plan;
    setPlan(without(plan, id));
    return () => setPlan(before);
  },
  perform: ({ idempotencyKey }) =>
    api.plans.removeDrill.mutate({ planId, id, idempotencyKey }),
  reverse: () => api.plans.addDrill.mutate({ planId, id }),
});

// Tier 1: cancel a practice and notify the roster
confirm.run({
  tier: "confirm",
  destructive: true,
  title: "Cancel Tuesday practice?",
  description: "The practice is removed from the calendar.",
  affected: "The 14 players on the roster are emailed that it is off.",
  verb: "Cancel and notify 14 players",
  cancelLabel: "Keep practice",
  agentConfirm: "Cancels Tuesday's 6:00 PM practice and emails 14 players",
  perform: ({ idempotencyKey }) =>
    api.practices.cancel.mutate({ id, notify: true, idempotencyKey }),
  success: "Practice cancelled. 14 players were emailed.",
});

// Tier 1: publish a website change
confirm.run({
  tier: "confirm",
  title: "Publish the website change?",
  description: "The new opening hours go live on your public site.",
  verb: "Publish opening hours",
  agentConfirm: "Publishes the new opening hours to the public website",
  perform,
  success: "Opening hours published",
});

// Tier 1, destructive: delete a drill from the library
confirm.run({
  tier: "confirm",
  destructive: true,
  title: "Delete the Serve receive drill?",
  description: "It is removed from your library and from 3 practice plans.",
  verb: "Delete drill",
  agentConfirm: "Deletes the Serve receive drill",
  perform,
});

// Tier 2: refund a booking
confirm.run({
  tier: "strong",
  destructive: true,
  title: "Refund this booking?",
  description: "The booking is cancelled and the court slot opens again.",
  amount: "$48.00 (USD)",
  recipients: "Jane Doe, to the card she paid with",
  reference: "BK-2041",
  consequence: "Jane is emailed. A refund cannot be undone.",
  verb: "Refund $48.00",
  cancelLabel: "Keep booking",
  agentConfirm: "Refunds $48.00 to Jane Doe for booking BK-2041",
  perform: ({ idempotencyKey }) =>
    api.bookings.refund.mutate({ id, idempotencyKey }),
});

// Tier 2, destructive bulk: the only place a typed second step is allowed
confirm.run({
  tier: "strong",
  destructive: true,
  title: "Remove 12 members from Juniors?",
  description: "They leave the group and its schedule.",
  scope: "12 members of Juniors",
  bulk: { count: 12, noun: "members", typeToConfirm: "remove 12 members" },
  verb: "Remove 12 members",
  agentConfirm:
    "Removes 12 members from Juniors and cancels their group bookings",
  perform,
});
```

`ProposalCard` is the visual part of an Ask Duna proposal: before / after
rows, the reason, who is affected, the reference and the person's actions.
Apply goes through `useConfirm` at the action's own tier. Wiring it to the
agent (`propose_change`, `fill_form`) is package S4's.

## Async actions

| Hook                                        | Gives you                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useAction(fn, options)`                    | Single flight (double click, double tap, held Enter: one call), `idempotencyKey` per logical attempt (reused on retry, new after success or `reset()`), `pending` / `success` / `error`, `showPending` (250/400 ms), `fieldErrors`, `reference`, toasts from `messages`, `optimistic.apply` with rollback, `report`; spread `buttonProps` on a `Button` |
| `useSubmit(fn)`                             | `useAction` for a `<form>`: `formProps`, reads the values, focuses the first server-rejected field                                                                                                                                                                                                                                                      |
| `useDebouncedValue`, `useDebouncedCallback` | 220 ms by default; `{ leading, trailing }`                                                                                                                                                                                                                                                                                                              |
| `useThrottledCallback`                      | 300 ms by default; one call per interval plus one on settle                                                                                                                                                                                                                                                                                             |
| `useLatest()`                               | `run(signal => fetch…)`: aborts the previous request, a late answer resolves `stale`; results never go back in time                                                                                                                                                                                                                                     |
| `useAsyncSearch`                            | The whole search-as-you-type pattern (existing)                                                                                                                                                                                                                                                                                                         |
| `useAutosave(value, { save })`              | Debounced draft save, `flush` on blur, never two saves at once, leave guard; show it with `AutosaveStatus`                                                                                                                                                                                                                                              |
| `useLeaveGuard(active)`                     | Browser prompt on unload, `guard(navigate)` for in-app navigation                                                                                                                                                                                                                                                                                       |
| `usePendingNavigation(router.push)`         | `pending` until the new route renders (React transition); pass to `TopProgress`                                                                                                                                                                                                                                                                         |
| `useOnline()`, `useReducedMotion()`         | Connectivity and the motion preference                                                                                                                                                                                                                                                                                                                  |

```tsx
const book = useAction(
  ({ idempotencyKey }) => api.courts.book.mutate({ slotId, idempotencyKey }),
  {
    messages: {
      success: "Court 2 booked for Sat 10:30 AM",
      error: "Could not book the court. Nothing was charged.",
    },
  },
);
<Button {...book.buttonProps} variant="primary">
  Book court 2
</Button>;
```

Errors and the observability package: the kit never imports it. `useAction`,
`ErrorState`, `FormStatus` and the toasts read the reference from the error
(`data.requestId`, a Next.js `digest`, or `reference`) and take a `report`
callback: pass `report` from `@duna/observability`.

## States

| Part                                                                                              | Says                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AsyncBoundary`                                                                                   | Loading (layout skeleton, unseen for 250 ms, no shift), error, empty with its action, or content; keeps old data dimmed while reloading or after an error |
| `LoadingState layout`, `SkeletonListRow`, `SkeletonCard`, `SkeletonTable`, `SkeletonDetailHeader` | Placeholders with the real layout's geometry                                                                                                              |
| `ErrorState`                                                                                      | What happened, what to do, Try again (single flight), "Reference: …" with Copy; calls `report` once                                                       |
| `OfflineBanner`                                                                                   | Offline, when the data was last fresh, what happens to changes (never Solar)                                                                              |
| `NotConfigured`                                                                                   | "Online payments isn't set up yet": setup link for the owner, who to ask for everyone else                                                                |
| `FeatureOff`                                                                                      | Switched off (a kill switch), not broken                                                                                                                  |
| `PermissionDenied`                                                                                | No access, and who can grant it                                                                                                                           |
| `PartialData`                                                                                     | What is still pending; the rest works                                                                                                                     |
| `EmptyFirstUse`, `EmptyResults`                                                                   | Empty with its one next action; no results with Clear                                                                                                     |

## Forms

`useFormBehaviour({ validate, submit })` on the existing `Field`/`Input`:
validation on blur and on submit (typing only clears a fixed error), server
errors mapped to fields, focus on the first invalid field and a polite "2
fields need attention" (`FormStatus`), single-flight submit with an
idempotency key. `MoneyInput` (minor units, symbol from the currency, never
fights the caret, grouped on blur), `CharacterCounter` (announced only near
the limit), `AutosaveStatus` and `SubmitBar` (sticky on long forms, the verb
as its label, `agentConfirm` for sends).

```tsx
const form = useFormBehaviour({
  validate,
  submit: (values, { idempotencyKey }) =>
    api.coaches.invite.mutate({ ...values, idempotencyKey }),
});
<form {...form.formProps}>
  <FormStatus form={form} />
  <Field error={form.errors.email} label="Email" name="email">
    <Input type="email" />
  </Field>
  <SubmitBar
    agentConfirm="Emails an invitation to the coach"
    autosave={draft}
    form={form}
    label="Invite coach"
    sticky
  />
</form>;
```

## Toasts

`successToast(title)`, `errorToast(title, { reference, retry })` (stays until
dismissed when it has a reference or retry), `undoToast(title, { onUndo,
windowMs })` (countdown line; a failed Undo can be retried). `Toaster` shows
at most three (`TOAST_MAX_VISIBLE`); the rest wait with their timers paused.

## Checklist for every screen

1. Every load goes through `AsyncBoundary` (or `LoadingBoundary` + a
   `LoadingState` with the layout's shape); first load Rallies once.
2. Every list that changes uses `AnimatedList` or `riseClassName` per insert;
   nothing animates height.
3. Every mutation is `useAction` / `useSubmit` / `useFormBehaviour`; money,
   message and booking mutations send `idempotencyKey`.
4. Every action ends in a visible result: inline, `successToast`, or
   navigation; failures say what to do and show the reference.
5. Each action has a tier: 0 (`undo`), 1 (`confirm`) or 2 (`strong`); list it
   in the PR with its `agentConfirm` sentence. Inside a dialog, inline.
6. Search debounces (`useAsyncSearch` / `useDebouncedCallback` + `useLatest`);
   continuous signals throttle.
7. Long forms autosave (`useAutosave`), guard leaving, and end in a sticky
   `SubmitBar`.
8. Every provider-dependent feature shows `NotConfigured`; kill-switched
   ones `FeatureOff`; missing scopes `PermissionDenied`; missing values
   `PartialData` ("Pending", never zero); offline `OfflineBanner`.
9. Page and pane changes Cross (`PageTransition`, `PaneTransition`); scores
   use `NumberChange`; confirmations Rise.
10. Check light, dark, live, reduced motion (`page.emulateMedia({ reducedMotion: "reduce" })`) and the keyboard path in your e2e.
