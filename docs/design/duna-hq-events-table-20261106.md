# Events directory

Events opens with one searchable TanStack table, rather than separate draft,
activity and published inventories. All events is the default; Upcoming, Drafts
and Past provide quick views. Status and type filters, sortable columns and
pagination support larger inventories. Dates display the event's timezone;
Past uses the end time, not the start time. Entry prices are not compared across
currencies.

Workspace sessions take precedence over matching published listing IDs. Only
known workspace sessions receive a Manage link. Published-only listings retain
their exact player URL. Drafts retain editing, private previews and explicit
publication review through the existing server-authorized action. A draft deep
link opens review independently of table filters. No bulk publication is added.

Schedule remains the secondary action for calendar, match and court operations.
Leagues retain their existing dedicated workspace. Empty review/schedule cards
are removed from the Events landing page; a single useful table empty state
replaces them. No decorative imagery or statistics displace the inventory.

Use HQ semantic tokens and shared data-table/pagination styling. Keep the table
scrollport positioned and contained on narrow screens. Run builds and browser
checks remotely to avoid memory pressure on the owner's machine.
