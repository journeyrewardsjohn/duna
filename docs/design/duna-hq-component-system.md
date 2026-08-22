# Duna HQ component and content system

Status: active implementation contract for Duna HQ.

This guide turns the broader Duna visual system into repeatable product
decisions. It is intentionally concrete: use the shared component named here,
follow its content rule, and only create a new pattern when the existing one
cannot express the job.

The reference implementation is the Audience overview and builder. It shows
the expected page hierarchy, action prominence, typed rule controls, searchable
people selection, live preview, tables, status language, and responsive
behavior.

## 1. Source of truth

Use these sources in order:

1. `duna-font-usage-guide.md` for typography. Satoshi is the only product
   family for words and numbers.
2. `duna-design-system-v3.md` for current color, surface, hierarchy, and HQ
   workspace behavior.
3. This guide for component selection and content patterns.
4. `duna-mobile-design-guide.md` for phone behavior.

Shared primitives live in `packages/ui`. HQ-specific compositions live in
`apps/hq/components`. A page may compose those pieces, but it may not create a
private button, input, badge, header, date picker, address form, or avatar
language merely to achieve a slightly different visual.

## 2. Foundations

### Typography

- Use Satoshi everywhere.
- Page titles use the shared `PageHeader`; do not resize title text per page.
- Section headings describe a task: “Set the rules,” not a database noun such
  as “Rule AST.”
- Eyebrow, title, and description stack vertically. Never place eyebrow text
  beside the title or description.
- Product text is at least 12px, field labels at least 14px, and text inputs at
  least 16px. Controls are at least 48px high unless they are compact actions
  inside an already-selected row.
- Numbers that need fast comparison use tabular numerals through `Numeric` or
  the shared metric components.

### Spacing and shape

- Use the shared 4/8px rhythm. Page sections normally use 16–24px gaps.
- Working surfaces use 18–20px radii. Inputs and compact controls use 10–12px.
- Borders communicate grouping; shadows communicate elevation. Do not use
  both at high contrast.
- HQ is a broad, left-anchored workspace with a 112rem cap. Do not center a
  narrow marketing-style column inside the operator shell.

### Color

- Use semantic tokens only: `--surface-*`, `--text-*`, `--hairline*`, and the
  `--hq-*` accent family. No page-local hex colors.
- HQ green is an action and selection signal, not decoration.
- Red means destructive or failed, amber means attention or partial, green
  means ready or successful, and neutral means inactive or informational.
- Never use color as the only status indicator. Pair it with words and, when
  useful, an icon.

## 3. Page anatomy

Use `PageHeader` from `@duna/ui`.

1. Eyebrow: product area and context, three to six words.
2. Title: one clear noun or action.
3. Description: one sentence describing the job and result.
4. Actions: one primary action at the trailing edge; secondary actions follow.

The first screenful must answer “where am I?”, “what can I do?”, and “what is
the current state?” A page with no records uses `EmptyState` and repeats the
primary action in context.

## 4. Buttons and actions

Use `Button` for button behavior and `buttonClassName` for links that navigate.

| Tone      | Use                                                         | Do not use                                      |
| --------- | ----------------------------------------------------------- | ----------------------------------------------- |
| Primary   | The one action that completes or begins the page’s main job | Filters, row actions, or a second competing CTA |
| Secondary | Back, cancel, refresh, or a safe alternative                | Destructive confirmation                        |
| Ghost     | Low-emphasis contextual action                              | The only way to discover a main action          |
| Danger    | Destructive confirmation after explicit intent              | Archive links shown as ordinary navigation      |

Button copy starts with a verb and names the result: “Create audience,” “Save
new revision,” or “Refresh sizes.” Avoid “Submit,” “Continue” without context,
and technical phrases such as “Save immutable revision.” Disable duplicate
submission at the click boundary and give immediate progress text.

## 5. Fields and form controls

Use `Field`, `Input`, `Select`, `Textarea`, and `QuantityStepper` from
`@duna/ui`. Every input has a visible label. Placeholder text is an example,
not a substitute for the label.

Choose controls by data type:

- Known finite options: `Select` or a segmented choice.
- Mutually exclusive product modes with meaningful explanation: choice cards.
- Integer count: numeric `Input` or `QuantityStepper`.
- Money: numeric `Input` with a currency adornment; convert to minor units at
  the boundary.
- Search: `Input type="search"` with a search icon.
- Long text: `Textarea`, with guidance and limits next to the field.
- Boolean: switch only for immediate on/off state; checkbox for agreement or
  multi-selection.

Validation appears beside the field, in plain language, and remains until the
problem is resolved. Never ask an operator for a UUID, JSON, minor currency
units, or an internal enum.

## 6. Dates and time

- Use `SmartDateTimePicker` from `@duna/ui` for a single scheduled instant.
- Use `SmartDateRangePicker` for a date range.
- Use `DunaDateTimePicker` in HQ when date and time must be selected as one
  operational decision.
- A simple date-only business rule may use the shared `Input type="date"`.
- Display dates with `Intl.DateTimeFormat` and the organization timezone when
  time is relevant. Persist ISO timestamps; do not display raw ISO strings.
- Relative timing (“3 days before”) and exact timing are different controls.

## 7. Address capture and presentation

Use `AddressEntry` from `apps/hq/components/place-address-fields.tsx` for
capture. It owns Google place selection, manual fallback, structured fields,
completion validation, and exact-pin confirmation. Do not recreate street,
city, region, postal code, or latitude/longitude fields inside a page.

Use the shared address utilities in `apps/hq/lib/address.ts` for presentation.
Show the venue or place name first, the formatted locality second, and map or
edit actions last. Never show coordinates when a human address is available.

## 8. People selection

People selectors are identity decisions, not ordinary dropdowns.

- Use an avatar or initials, full display name, role tags, and the most useful
  decision context available: city/home market, Sand Rating, age/minor state,
  team, or membership.
- Search across the visible context, not only the name.
- Single remote player identity uses `PlayerCombobox`.
- Multi-person operational selection uses cards or rows with one consistent
  selected state. Audience Include/Exclude is the reference pattern.
- “Parent” and “Player” are distinct visible roles. Never infer a parent from
  an email address or hide a minor’s guardian state.
- Selected state must remain visible without relying on color alone.

## 9. Rules and intelligent configuration

Rule builders use a categorized “Add rule” menu. A rule row always has:

1. Human field name and description.
2. An operator written in plain language.
3. A value control appropriate to the fact.
4. A remove action with an accessible name.

Use “All rules (AND)” and “Any rule (OR)” for group behavior. Show the joiner
between rules. Registration rules select a real event or product. Money rules
accept normal currency. Status rules use a finite selector. Date rules use a
date control. The portable rule definition remains typed and allowlisted at the
API boundary; the UI never exposes its internal representation.

## 10. Tables and management lists

Use semantic `table`, `thead`, `tbody`, `th`, and `td` for repeated records with
shared columns. Put the record identity first, then definition, quantity,
updated time, status, and actions. The entire identity is a link; the last
column may repeat an icon action with an accessible name.

- Headers use sentence case and at least 12px text.
- Quantities use tabular numbers and may include a proportion bar.
- Status uses `Badge` with semantic tone.
- At phone width, a table becomes labeled record cards or deliberately scrolls
  when column comparison is essential. It never silently clips.
- Search and result count sit directly above the table.

## 11. Tags, badges, and chips

- `Badge` communicates state or a compact categorical attribute.
- `StatusPill` is for lifecycle state in event and competition contexts.
- `TaxonomyChip` is for a classification that can be scanned or filtered.
- `MetricChip` pairs a compact label and number.
- `IdentityChip` represents a selected person.

Tags use short nouns. Status tags use a state word: “Ready,” “Partial,” “Paid,”
“Overdue.” Do not make every metadata value a brightly colored pill.

## 12. Icons and logos

Use Lucide icons at 16–20px in HQ controls. Icons support a word; they do not
replace an unfamiliar action label. Icon-only buttons require an accessible
name and at least a 40px target inside a larger row.

Use `DunaMark` for Duna identity. The component owns compact, blue, and white
logo variants. Partner marks use official assets and the containment rules in
`duna-theming-light-dark.md`; never recolor a trademark with CSS filters.

## 13. Feedback and state

- Loading: preserve the page frame and use direct progress copy.
- Success: say what changed and where it is now available.
- Empty: explain why the area matters and offer the main action.
- Error: say what failed, preserve the operator’s input, and offer a retry.
- Partial data: name unavailable facts and fail closed. Never fabricate an
  audience size, payment value, address, rating, or delivery status.

## 14. Responsive and accessibility acceptance

Every new HQ surface is checked at desktop, tablet, and 390px phone width, plus
keyboard-only navigation and reduced motion.

- No horizontal page overflow at 390px.
- Focus follows visual order and remains visible.
- Every form control has a label and every icon action has an accessible name.
- Touch targets are at least 48px except compact row actions, which are at least
  40px inside a larger target.
- Dialogs and menus remain inside the viewport.
- Dynamic totals announce through a polite live region.
- Color contrast and state meaning remain intact in light and dark themes.

## 15. Contribution checklist

Before adding CSS or a component:

1. Search `packages/ui` and `apps/hq/components` for the job.
2. Extend a shared primitive when the behavior is cross-product.
3. Keep domain data and server actions in the product layer.
4. Add usage guidance here when a new reusable pattern is introduced.
5. Add a verifier or focused test for the contract.
6. Run type checks, tests, design verification, readable-type verification,
   build, and responsive browser QA.

An exception must name the unmet job and the reason an existing component
cannot satisfy it. Visual preference alone is not an exception.
