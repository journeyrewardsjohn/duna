# HQ component depth

The November 5 reference refinement adds quiet surface hierarchy to the existing
HQ layout: a grey navigation rail, an elevated white workspace, subtly raised
buttons, inset fields, selected segments, framed tables and deeper temporary
overlays. Shared elevation roles live in `packages/ui/src/hq-workspace.css` and
resolve independently in light and dark themes.

The AI composer and secondary manual tray are visually connected, while the
manual button remains outside the form. No decorative stacked cards, extra
sections, new icons or additional screen space are introduced. Satoshi, legible
control sizes, focus indicators and all operational actions are preserved.

Do not add transforms or paint containment to ancestors of fixed mobile actions.
Keep the positioned table scroll region and its viewport containment checks.
Review the existing remote desktop/tablet/mobile screenshots and authenticated
production UI; run builds and browser workers remotely to protect local memory.
