export type ClubFeatureVisualKind =
  | "products"
  | "services"
  | "plans"
  | "inventory"
  | "team"
  | "people"
  | "events"
  | "leagues"
  | "venues"
  | "training"
  | "money"
  | "marketing"
  | "messaging"
  | "safety"
  | "vision"
  | "watch";

export interface ClubFeatureCapability {
  readonly title: string;
  readonly description: string;
}

export interface ClubFeaturePageData {
  readonly key: string;
  readonly href: string;
  readonly navLabel: string;
  readonly navDescription: string;
  readonly category: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly image: string;
  readonly imageAlt: string;
  readonly accent: "sand" | "marine" | "signal" | "rose";
  readonly visual: ClubFeatureVisualKind;
  readonly problemTitle: string;
  readonly problem: string;
  readonly problemSignals: readonly string[];
  readonly solutionTitle: string;
  readonly solution: string;
  readonly outcomes: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly capabilities: readonly ClubFeatureCapability[];
  readonly journey: readonly ClubFeatureCapability[];
  readonly related: readonly string[];
  readonly statusNote?: string;
}

const feature = (
  input: Omit<ClubFeaturePageData, "href">,
): ClubFeaturePageData => ({
  ...input,
  href: `/run-your-club/features/${input.key}`,
});

export const clubFeatures: readonly ClubFeaturePageData[] = [
  feature({
    key: "products",
    navLabel: "Products",
    navDescription: "One catalog for everything you sell and lend",
    category: "Build the offer",
    eyebrow: "Products",
    title: "Sell the way your club actually works.",
    summary:
      "Lessons, memberships, credit packs, programs, apparel, rentals, and equipment start in one guided builder, then stay connected to the people, places, fulfillment, and money behind them.",
    image: "/media/product-library/duna-product-season-program.webp",
    imageAlt: "A volleyball training program at golden hour",
    accent: "signal",
    visual: "products",
    problemTitle: "Most catalogs flatten a club into a list of prices.",
    problem:
      "A private lesson has availability. A membership has benefits and renewal rules. A shirt has sizes, cost, and stock. Treating them as the same generic item creates work everywhere else.",
    problemSignals: [
      "Pricing rules live outside the offer",
      "Fulfillment gets rebuilt by hand",
      "The public page never explains the value",
    ],
    solutionTitle: "Duna starts with the kind of thing you are creating.",
    solution:
      "The builder asks the decisions that matter for that product type, shows the customer-facing offer while you work, and carries the result into discovery, checkout, scheduling, inventory, and reporting.",
    outcomes: [
      { value: "1", label: "connected catalog" },
      { value: "4", label: "purpose-built product families" },
      { value: "Live", label: "offer preview while you build" },
    ],
    capabilities: [
      {
        title: "Guided product builder",
        description:
          "Choose the product type first, then answer only the decisions that apply.",
      },
      {
        title: "Flexible pricing",
        description:
          "Set variants, billing cadence, installments, member access, bundles, and clear checkout terms.",
      },
      {
        title: "Story-first storefronts",
        description:
          "Lead with outcomes, media, proof, FAQs, and how the offer works before checkout.",
      },
      {
        title: "Lifecycle and history",
        description:
          "Draft, publish, turn off, archive, restore, and keep purchase and fulfillment history intact.",
      },
      {
        title: "Connected fulfillment",
        description:
          "Bookings, credit grants, memberships, rentals, pickup, shipping, and digital access follow the offer.",
      },
      {
        title: "Recommendations",
        description:
          "Link the next useful service, plan, event, or good without rebuilding a separate sales funnel.",
      },
    ],
    journey: [
      {
        title: "Choose the shape",
        description:
          "Start with service, plan, good, rental, or program so the right workflow appears.",
      },
      {
        title: "Craft the offer",
        description:
          "Build the value story, pricing, eligibility, delivery, and customer experience together.",
      },
      {
        title: "Publish with context",
        description:
          "The offer becomes discoverable and stays linked to orders, people, inventory, and performance.",
      },
    ],
    related: [
      "products/services",
      "products/plans",
      "products/goods-equipment",
      "marketing",
    ],
  }),
  feature({
    key: "products/services",
    navLabel: "Services",
    navDescription: "Lessons, assessments, rentals, and programs",
    category: "Products",
    eyebrow: "Services",
    title: "A lesson is more than a time slot.",
    summary:
      "Package the coach, court, availability, participant rules, intake, notes, and follow-up into one bookable service that is easy to understand and easier to run.",
    image: "/media/event-library/duna-event-private-coaching.webp",
    imageAlt: "A coach working with a volleyball player on a beach court",
    accent: "sand",
    visual: "services",
    problemTitle: "The booking is simple. Delivering it well is not.",
    problem:
      "When pricing, availability, participant context, and session delivery live in different tools, every booking creates a trail of manual coordination.",
    problemSignals: [
      "Clients cannot tell what is included",
      "Coach and court availability drift apart",
      "Notes and follow-up lose the session context",
    ],
    solutionTitle: "Build the promise and the delivery in the same place.",
    solution:
      "Duna connects the public service page to scheduling rules, eligible coaches and venues, checkout, check-in, private session notes, and the player relationship that continues afterward.",
    outcomes: [
      { value: "One", label: "service story and schedule" },
      { value: "Live", label: "availability at booking" },
      { value: "Private", label: "coach notes by design" },
    ],
    capabilities: [
      {
        title: "Service-specific setup",
        description:
          "Create private lessons, group sessions, assessments, programs, and court rentals.",
      },
      {
        title: "Availability rules",
        description:
          "Connect coaches, courts, booking windows, durations, capacity, and blackout dates.",
      },
      {
        title: "Clear customer story",
        description:
          "Explain the outcome, what happens, what to bring, and who the service fits.",
      },
      {
        title: "Checkout choices",
        description:
          "Sell a single booking, a plan benefit, a credit redemption, or a program package.",
      },
      {
        title: "Duna Pro delivery",
        description:
          "Take payment, check players in, and write private session notes while courtside.",
      },
      {
        title: "Virtual delivery",
        description:
          "Where configured, connect the appointment to calendar delivery and a secure meeting link.",
      },
    ],
    journey: [
      {
        title: "Describe the result",
        description:
          "Start with the player outcome instead of a blank booking form.",
      },
      {
        title: "Attach real capacity",
        description:
          "Add the coaches, places, durations, and rules that make the promise deliverable.",
      },
      {
        title: "Carry the relationship",
        description:
          "Check-in, notes, purchases, video, and the next recommendation stay with the player.",
      },
    ],
    related: ["team-management", "venues", "people", "coach-video"],
  }),
  feature({
    key: "products/plans",
    navLabel: "Plans + memberships",
    navDescription: "Memberships, credit packs, bundles, and access",
    category: "Products",
    eyebrow: "Plans + memberships",
    title: "Turn access into a relationship.",
    summary:
      "Create memberships, credit packs, and bundles whose benefits are understandable at checkout and enforceable wherever a player books, registers, or buys.",
    image: "/media/product-library/duna-product-credit-pack.webp",
    imageAlt: "A player using a club training credit pack",
    accent: "marine",
    visual: "plans",
    problemTitle: "Recurring revenue fails when the rules are invisible.",
    problem:
      "Members should not need a staff explanation to understand what is included, where credits work, when access renews, or what happens when a plan changes.",
    problemSignals: [
      "Benefits are remembered instead of enforced",
      "Credits and bookings do not reconcile",
      "Cancellation and renewal state surprise people",
    ],
    solutionTitle: "Make every benefit explicit and portable.",
    solution:
      "Duna models membership access, included items, discounts, priority booking, and credit grants as real entitlements that travel into the relevant checkout and remain visible to staff and players.",
    outcomes: [
      { value: "Clear", label: "benefits before purchase" },
      { value: "Shared", label: "rules across checkout" },
      { value: "Visible", label: "balance and renewal state" },
    ],
    capabilities: [
      {
        title: "Membership access",
        description:
          "Control member-only products, schedules, courts, and priority windows.",
      },
      {
        title: "Credit packs",
        description:
          "Grant a defined balance, show redemptions, and preserve the order that created it.",
      },
      {
        title: "Bundles",
        description:
          "Combine access, credits, included items, and discounts into one understandable offer.",
      },
      {
        title: "Billing structure",
        description:
          "Support recurring cadence, fixed installments, and upfront options with clear totals.",
      },
      {
        title: "Plan safeguards",
        description:
          "Prevent the last active membership from disappearing while member-only offers still depend on it.",
      },
      {
        title: "Lifecycle history",
        description:
          "Pause availability or archive the offer without erasing purchases, entitlements, or fulfillment.",
      },
    ],
    journey: [
      {
        title: "Define the promise",
        description:
          "Choose the access, credits, discounts, and included items a player receives.",
      },
      {
        title: "Set the commercial shape",
        description:
          "Price the plan, renewal cadence, term, and payment options transparently.",
      },
      {
        title: "Let the system remember",
        description:
          "Duna applies active entitlements at the right booking, product, event, or court.",
      },
    ],
    related: ["products/services", "people", "money", "events"],
  }),
  feature({
    key: "products/goods-equipment",
    navLabel: "Goods + equipment",
    navDescription: "Inventory, cost, rentals, tax context, and online sales",
    category: "Products",
    eyebrow: "Goods + equipment",
    title: "Know what you own, what it costs, and where it went.",
    summary:
      "Sell apparel online, manage stock by location, check equipment out to coaches, record returns and damage, and keep the acquisition and tax context your back office needs.",
    image: "/media/product-library/duna-product-premium-equipment.webp",
    imageAlt: "Volleyball training equipment prepared beside a sand court",
    accent: "rose",
    visual: "inventory",
    problemTitle:
      "A ball cart and a club shirt should not share the same lifecycle.",
    problem:
      "Sale inventory, rental equipment, coach kits, and operating assets move differently. A single quantity field cannot explain cost, custody, reservations, damage, or what your accountant needs later.",
    problemSignals: [
      "Stock counts do not explain movements",
      "Equipment leaves without a custody trail",
      "Cost and tax context gets reconstructed at year end",
    ],
    solutionTitle:
      "Treat inventory as a record of movement, not a number to edit.",
    solution:
      "Duna keeps location, purpose, unit cost, serialized assets, reservations, sales, rentals, coach checkout, returns, adjustments, damage, and retirement in an append-only operational story.",
    outcomes: [
      { value: "5", label: "inventory location types" },
      { value: "Traceable", label: "every movement" },
      { value: "Ready", label: "cost and tax context" },
    ],
    capabilities: [
      {
        title: "Online goods sales",
        description:
          "Publish apparel, equipment, swag, consumables, and digital goods with variants and fulfillment choices.",
      },
      {
        title: "Inventory by location",
        description:
          "Track stock at venues, warehouses, vehicles, coach kits, and virtual locations.",
      },
      {
        title: "Equipment custody",
        description:
          "Record coach checkout, returns, rentals, damage, retirement, serial numbers, and asset tags.",
      },
      {
        title: "Cost layers",
        description:
          "Receive exact variants with quantity and unit cost while preserving the historical layer.",
      },
      {
        title: "Reservations and availability",
        description:
          "Keep reserved quantities from being silently sold or promised twice.",
      },
      {
        title: "Tax-season context",
        description:
          "Preserve taxable status, tax codes, acquisition details, depreciation choices, and committed order tax records. Filing remains your tax professional’s decision.",
      },
    ],
    journey: [
      {
        title: "Receive it",
        description:
          "Record the exact variant, quantity, cost, purpose, and location when inventory arrives.",
      },
      {
        title: "Move it with a reason",
        description:
          "Every sale, rental, coach checkout, return, damage event, or adjustment names what changed.",
      },
      {
        title: "Close the year with evidence",
        description:
          "Exportable cost, custody, movement, and tax context replaces a reconstructed spreadsheet.",
      },
    ],
    related: ["products", "venues", "money", "team-management"],
  }),
  feature({
    key: "team-management",
    navLabel: "Team management",
    navDescription:
      "Coach profiles, availability, hours, roles, and compensation",
    category: "Run the operation",
    eyebrow: "Team management",
    title: "Your coaches should not live in spreadsheets.",
    summary:
      "Give every coach a clear profile, role, availability pattern, assignment history, hour record, and compensation setup, then put today’s small actions in Duna Pro.",
    image: "/media/brand/people/duna-avatar-jordan-cruz-v1.webp",
    imageAlt: "A volleyball coach in warm outdoor light",
    accent: "signal",
    visual: "team",
    problemTitle: "The schedule knows the shift. Payroll rarely knows why.",
    problem:
      "Availability, assignments, hours, qualifications, goals, and compensation often live in separate files. That leaves managers reconciling what happened after the week is already over.",
    problemSignals: [
      "Availability changes arrive in chat",
      "Session hours need manual reconstruction",
      "Profit-share rules sit beside, not with, the work",
    ],
    solutionTitle:
      "Connect the person, the assignment, and the commercial rule.",
    solution:
      "Duna keeps staff profiles and availability beside scheduled work, then records administrative hourly and profit-share configuration without pretending to replace payroll, classification, or wage compliance.",
    outcomes: [
      { value: "One", label: "coach profile" },
      { value: "Current", label: "availability and assignments" },
      { value: "Visible", label: "hours and compensation setup" },
    ],
    capabilities: [
      {
        title: "Coach profiles",
        description:
          "Keep role, bio, contact details, qualifications, public identity, and internal context together.",
      },
      {
        title: "Availability and assignments",
        description:
          "See when a coach can work and which sessions, programs, courts, and teams need them.",
      },
      {
        title: "Hour tracking",
        description:
          "Connect scheduled and recorded work to the staff profile for review.",
      },
      {
        title: "Compensation configuration",
        description:
          "Track hourly, profit-share, or combined administrative models. Payroll and legal classification remain the organization’s responsibility.",
      },
      {
        title: "Duna Pro actions",
        description:
          "Take a payment, check players in, write session notes, and handle the next courtside task from a phone.",
      },
      {
        title: "Permissioned roles",
        description:
          "Give coaches the access their job needs without exposing every club setting or financial record.",
      },
    ],
    journey: [
      {
        title: "Build the profile",
        description:
          "Set the role, public identity, availability, permissions, and compensation context once.",
      },
      {
        title: "Assign the work",
        description:
          "Connect the coach to sessions, services, programs, teams, and places.",
      },
      {
        title: "Review what happened",
        description:
          "Hours, check-ins, notes, payments, and assignments remain tied to the actual day.",
      },
    ],
    related: ["products/services", "people", "training", "money"],
  }),
  feature({
    key: "people",
    navLabel: "People",
    navDescription: "Players, parents, goals, health sharing, and check-ins",
    category: "Run the operation",
    eyebrow: "People",
    title: "See the person, not another customer row.",
    summary:
      "Bring players, parents, guardians, memberships, goals, private check-ins, shared health summaries, notes, attendance, purchases, and messages into one permissioned relationship.",
    image: "/media/brand/people/duna-avatar-maya-rivera-v1.webp",
    imageAlt: "A beach volleyball player in soft golden-hour light",
    accent: "sand",
    visual: "people",
    problemTitle:
      "A roster tells you who enrolled. It does not tell you how to serve them.",
    problem:
      "The useful context is usually scattered across registration forms, parent emails, coach notes, health apps, memberships, and memory. The privacy risk grows as the relationship becomes more personal.",
    problemSignals: [
      "Parents and players receive different fragments",
      "Goals disappear after intake",
      "Sensitive context spreads farther than intended",
    ],
    solutionTitle:
      "One relationship, with the right context visible to the right person.",
    solution:
      "Duna links household authority, club relationships, goals, attendance, purchases, consent, private check-ins, and player-controlled health sharing without turning a private signal into a public label.",
    outcomes: [
      { value: "360°", label: "relationship context" },
      { value: "Player", label: "controls health sharing" },
      { value: "Guardian", label: "aware by design" },
    ],
    capabilities: [
      {
        title: "Player and parent profiles",
        description:
          "Keep household, guardian, contact, organization, and participation relationships explicit.",
      },
      {
        title: "Goals and coaching context",
        description:
          "Record what the player is working toward and keep it near relevant sessions and notes.",
      },
      {
        title: "Private check-ins",
        description:
          "Players can record readiness context without publishing raw answers to the club.",
      },
      {
        title: "Shared health summaries",
        description:
          "Use player-controlled, revocable summaries. Private answers and notes stay excluded.",
      },
      {
        title: "Attendance and history",
        description:
          "See bookings, sessions, plans, credits, purchases, waivers, and recent activity in context.",
      },
      {
        title: "Reason-visible signals",
        description:
          "When Duna surfaces a relationship needing attention, it names the observed reason instead of hiding a mystery score.",
      },
    ],
    journey: [
      {
        title: "Connect the household",
        description:
          "Establish the player, parent, guardian, and organization relationships with authority visible.",
      },
      {
        title: "Share only what helps",
        description:
          "The player chooses if a health summary is shared and can revoke that choice.",
      },
      {
        title: "Coach with continuity",
        description:
          "Goals, sessions, notes, video, and the next conversation stay attached to the relationship.",
      },
    ],
    related: ["safety-privacy", "messaging", "training", "products/plans"],
  }),
  feature({
    key: "events",
    navLabel: "Events",
    navDescription:
      "Registration, divisions, eligibility, scoring, and operations",
    category: "Run the operation",
    eyebrow: "Event management",
    title: "Publish the event. Keep every moving part attached.",
    summary:
      "Build tournaments, clinics, open play, pickups, and showcases with registration, divisions, eligibility, capacity, staffing, venue time, communication, scoring, and results in one event record.",
    image: "/media/event-library/duna-event-junior-showcase.webp",
    imageAlt: "A youth volleyball event on a sand court",
    accent: "rose",
    visual: "events",
    problemTitle: "Event day exposes every disconnected decision.",
    problem:
      "The poster, registration form, payment list, court plan, staff chat, waitlist, and results often describe the same event differently. The operator becomes the integration layer.",
    problemSignals: [
      "Capacity and checkout disagree",
      "Divisions need manual eligibility review",
      "Participants cannot find one current source",
    ],
    solutionTitle: "Make the event the shared source of truth.",
    solution:
      "Duna connects the public story to divisions, tickets, eligibility, registration, waivers, schedules, courts, staff, messages, scoring, and results while preserving honest pending states.",
    outcomes: [
      { value: "One", label: "event record" },
      { value: "Atomic", label: "capacity decisions" },
      { value: "Public", label: "current event page" },
    ],
    capabilities: [
      {
        title: "Purpose-built event types",
        description:
          "Start with tournament, clinic, open play, pickup, or showcase workflows.",
      },
      {
        title: "Registration and tickets",
        description:
          "Set divisions, team or player pricing, ticket options, capacity, waitlists, and checkout.",
      },
      {
        title: "Eligibility and waivers",
        description:
          "Apply visible rules and collect required signatures after purchase through the authorized signer flow.",
      },
      {
        title: "Venue and staffing",
        description:
          "Attach courts, schedules, officials, coaches, media, and operating notes to the event.",
      },
      {
        title: "Participant communication",
        description:
          "Message the event audience with guardian and consent rules enforced at send time.",
      },
      {
        title: "Scoring and results",
        description:
          "Carry the event into matches, live state, verified results, and the player record.",
      },
    ],
    journey: [
      {
        title: "Build the event",
        description:
          "Define the story, type, divisions, place, time, prices, capacity, and eligibility.",
      },
      {
        title: "Run the day",
        description:
          "Keep staff, courts, check-in, communication, scoring, and exceptions on the same record.",
      },
      {
        title: "Publish the proof",
        description:
          "Results and player history continue after registration closes.",
      },
    ],
    related: ["leagues", "venues", "messaging", "money"],
  }),
  feature({
    key: "leagues",
    navLabel: "Leagues",
    navDescription: "Teams, schedules, standings, substitutions, and seasons",
    category: "Run the operation",
    eyebrow: "League management",
    title: "A season should feel connected from registration to standings.",
    summary:
      "Create the season, register teams, schedule courts, manage substitutions and weather changes, record matches, and give every participant one current place for what happens next.",
    image: "/media/event-library/duna-event-night-league.webp",
    imageAlt: "A beach volleyball league playing under evening lights",
    accent: "marine",
    visual: "leagues",
    problemTitle: "A schedule grid is not a league system.",
    problem:
      "Teams change, courts close, players substitute, matches move, and standings depend on verified results. A static bracket or spreadsheet starts drifting the moment the season begins.",
    problemSignals: [
      "One change creates five messages",
      "Substitutes lose eligibility context",
      "Standings wait for manual reconciliation",
    ],
    solutionTitle: "Let the season own its teams, matches, and changes.",
    solution:
      "Duna keeps league registration, rosters, divisions, court assignments, schedule changes, results, standings, payments, and communication on the same season timeline.",
    outcomes: [
      { value: "Season", label: "one operating timeline" },
      { value: "Live", label: "schedule changes" },
      { value: "Verified", label: "results into standings" },
    ],
    capabilities: [
      {
        title: "Team registration",
        description:
          "Register full teams or assemble rosters with participant and guardian authority visible.",
      },
      {
        title: "Season scheduling",
        description:
          "Assign dates, rounds, divisions, venues, courts, and match windows.",
      },
      {
        title: "Substitutions",
        description:
          "Keep roster changes and eligibility attached to the affected match instead of a side conversation.",
      },
      {
        title: "Weather and rescheduling",
        description:
          "Move affected matches, update participants, and keep the current schedule public.",
      },
      {
        title: "Scoring and standings",
        description:
          "Use accepted results to update records and standings without rewriting history.",
      },
      {
        title: "League communication",
        description:
          "Reach a division, team, match, or full season audience through the right channels.",
      },
    ],
    journey: [
      {
        title: "Open the season",
        description:
          "Publish divisions, team rules, registration, dates, venues, and the commercial offer.",
      },
      {
        title: "Adapt without losing context",
        description:
          "Reschedules, substitutions, messages, and payments stay tied to the affected people and matches.",
      },
      {
        title: "Finish with a record",
        description:
          "Accepted scores become standings and player history, not another spreadsheet export.",
      },
    ],
    related: ["events", "venues", "people", "messaging"],
  }),
  feature({
    key: "venues",
    navLabel: "Venues",
    navDescription:
      "Model the place, choose access, and publish it across Duna",
    category: "Run the operation",
    eyebrow: "Venue network",
    title: "Put your courts on the map—and open them to the world.",
    summary:
      "Build the real venue over satellite imagery, decide exactly who can book each court, then publish availability into Duna Player so nearby players, members, and coaches can discover and act.",
    image: "/media/event-library/duna-event-court-rental.webp",
    imageAlt: "An open beach volleyball court prepared for a rental",
    accent: "sand",
    visual: "venues",
    problemTitle: "A pin on a map is not a bookable venue.",
    problem:
      "Players need to know where the courts are, which setup is live, whether they are eligible, what time is actually open, and how to reserve it. Most venue software stops at an internal calendar and leaves discovery to chance.",
    problemSignals: [
      "The real court layout is invisible to players",
      "Access rules are rebuilt at every checkout",
      "Open time never reaches new local demand",
    ],
    solutionTitle:
      "Model the real place once, then distribute it through the Duna network.",
    solution:
      "Duna turns precise satellite or floorplan geometry into a player-ready venue, applies court-level audience, schedule, rate, and cancellation rules, and carries the published result into nearby search, maps, club storefronts, services, and events.",
    outcomes: [
      { value: "Metric", label: "satellite geometry" },
      { value: "5 ways", label: "to control access" },
      { value: "Network", label: "distribution through Duna" },
    ],
    capabilities: [
      {
        title: "Satellite layout studio",
        description:
          "Place courts, safety zones, amenities, guest spaces, and bookable blocks over Mapbox satellite imagery with meter-aware geometry.",
      },
      {
        title: "Versioned venue setups",
        description:
          "Keep published layouts read-only, refine changes in a draft, preview the player experience, then publish or unpublish safely.",
      },
      {
        title: "Booking audience controls",
        description:
          "Open a court to anyone, active members, selected membership tiers, coaches and staff, or keep it unavailable for independent booking.",
      },
      {
        title: "Court-level commerce",
        description:
          "Connect hours, booking increments, notice, advance windows, buffers, reusable rate plans, cancellations, checkout, and participant invitations.",
      },
      {
        title: "Duna Player discovery",
        description:
          "Publish eligible court inventory into location search, the Duna map, venue pages, and the club storefront where players around the world look to play.",
      },
      {
        title: "One source for every use",
        description:
          "Let rentals, private lessons, programs, leagues, tournaments, and utilization resolve against the same court and schedule truth.",
      },
    ],
    journey: [
      {
        title: "Build the real venue",
        description:
          "Start with satellite imagery or an indoor floorplan, place every court and space, then inspect the same visual map a player will see.",
      },
      {
        title: "Choose exactly who gets access",
        description:
          "Make each court public, member-only, tier-specific, coach-and-staff-only, or not independently bookable—then attach time and price.",
      },
      {
        title: "Publish into the network",
        description:
          "Let local players—or someone planning a trip—find the venue in Duna Player, navigate the live setup, see eligible availability, and book alongside its services and events.",
      },
    ],
    related: ["products/services", "events", "leagues", "money"],
  }),
  feature({
    key: "training",
    navLabel: "Training",
    navDescription: "Programs, practice plans, drills, animation, and load",
    category: "Run the operation",
    eyebrow: "Training OS",
    title: "Write the season. Run today’s practice.",
    summary:
      "Design programs around dates and competition, assemble timed practice plans, build a reusable drill library, animate movement, and estimate load without pretending a planning estimate is athlete measurement.",
    image: "/media/product-library/duna-product-training-bundle.webp",
    imageAlt: "A structured volleyball training session on sand",
    accent: "signal",
    visual: "training",
    problemTitle:
      "The season lives in a coach’s head. The session lives on a scrap of paper.",
    problem:
      "Drills, practice timing, tournament priorities, weekly load, and the commercial program often become separate artifacts. The useful coaching logic disappears between them.",
    problemSignals: [
      "Drills are rewritten instead of reused",
      "Practice timing is hard to see before court time",
      "Season goals do not shape the weekly plan",
    ],
    solutionTitle: "Connect the drill, the practice, and the program.",
    solution:
      "Duna keeps structured drills, versions, tags, media, timed blocks, parallel courts, estimated touches and jumps, weekly phases, competitions, and sold sessions in one editable training system.",
    outcomes: [
      { value: "Drill", label: "reusable building block" },
      { value: "90m", label: "practice timeline" },
      { value: "Season", label: "load-aware program" },
    ],
    capabilities: [
      {
        title: "Drill Studio",
        description:
          "Describe a drill in plain language, then review and correct its steps, cues, scoring, and court scene.",
      },
      {
        title: "Drill Library",
        description:
          "Keep private organization drills, shared public drills, and licensed marketplace drills with structured tags.",
      },
      {
        title: "Practice Planner",
        description:
          "Build timed blocks, parallel courts, intensity, technical work, game-like play, strength, and recovery.",
      },
      {
        title: "Program Designer",
        description:
          "Plan date windows, weekly recurrence, competitions, travel, objectives, phases, and scheduled sessions.",
      },
      {
        title: "Load context",
        description:
          "Estimate touches, jumps, intensity, and contact from drill pacing assumptions. These are planning estimates, not health predictions.",
      },
      {
        title: "Version history",
        description:
          "Restore recent non-financial versions while protecting commercial and completed-session history.",
      },
    ],
    journey: [
      {
        title: "Build the library",
        description:
          "Capture the drills, cues, court movement, tags, and versions your coaches actually use.",
      },
      {
        title: "Assemble the practice",
        description:
          "Place those drills on a timed court plan and see the session load before it begins.",
      },
      {
        title: "Shape the season",
        description:
          "Organize practices into phases that respond to dates, travel, objectives, and competitions.",
      },
    ],
    related: ["team-management", "people", "coach-video", "products/services"],
  }),
  feature({
    key: "money",
    navLabel: "Money",
    navDescription: "Orders, payments, credits, refunds, payouts, and reports",
    category: "Grow with control",
    eyebrow: "Money",
    title: "Follow the money back to the work that created it.",
    summary:
      "Keep orders, payment state, credits, refunds, tax context, inventory cost, fees, payouts, and operating activity connected so a total can always be explained.",
    image: "/media/product-library/duna-product-club-community.webp",
    imageAlt: "A volleyball club community gathering at a beach court",
    accent: "marine",
    visual: "money",
    problemTitle:
      "A revenue total without context is another reconciliation task.",
    problem:
      "Operators need to know what sold, who received it, whether it was fulfilled, what fees applied, which credit moved, and what payout state is current. Separate ledgers hide that story.",
    problemSignals: [
      "Refunds lose the original fulfillment context",
      "Credits look like revenue twice",
      "Payout questions start with manual tracing",
    ],
    solutionTitle: "Make every financial state traceable to its source.",
    solution:
      "Duna connects the commercial event to the order, payment, tax context, fulfillment, credit movement, refund, inventory movement, fee, and payout record without inferring unavailable bank or processor state.",
    outcomes: [
      { value: "Source", label: "attached to every record" },
      { value: "State", label: "pending stays pending" },
      { value: "Audit", label: "append-only history" },
    ],
    capabilities: [
      {
        title: "Orders and payment state",
        description:
          "See what was purchased, by whom, through which organization, and its current processor-backed state.",
      },
      {
        title: "Credits and entitlements",
        description:
          "Trace grants, redemptions, balances, and the order or adjustment that created them.",
      },
      {
        title: "Refunds and recovery",
        description:
          "Keep retries, failures, refunds, and fulfillment consequences visible beside the original order.",
      },
      {
        title: "Fees and pricing",
        description:
          "Show Duna organization fees, payment processing context, discounts, and the terms presented at checkout.",
      },
      {
        title: "Payout visibility",
        description:
          "Present connected-account and payout state that is actually available, without inventing a settlement.",
      },
      {
        title: "Operational reports",
        description:
          "Connect revenue to products, events, venues, coaches, inventory cost, customers, and utilization.",
      },
    ],
    journey: [
      {
        title: "See the source",
        description:
          "Start with the order, rental, booking, membership, event, or adjustment that moved value.",
      },
      {
        title: "Follow the state",
        description:
          "Payment, fulfillment, tax, credit, fee, refund, and payout records remain connected.",
      },
      {
        title: "Review the operation",
        description:
          "Reports explain the product and activity behind a number instead of presenting totals alone.",
      },
    ],
    related: [
      "products",
      "products/goods-equipment",
      "venues",
      "team-management",
    ],
  }),
  feature({
    key: "marketing",
    navLabel: "Marketing",
    navDescription: "Discovery, storefronts, audiences, journeys, and proof",
    category: "Grow with control",
    eyebrow: "Marketing",
    title: "Start with real activity, not another contact list.",
    summary:
      "Turn products, events, bookings, memberships, attendance, and consent into useful audiences and reviewable journeys across public pages, email, SMS, push, and in-app surfaces.",
    image: "/media/event-library/duna-event-community-huddle.webp",
    imageAlt: "A volleyball community meeting beside a court",
    accent: "rose",
    visual: "marketing",
    problemTitle:
      "Marketing tools know the address. They rarely know the relationship.",
    problem:
      "A player who attended once, a parent of a minor, an active member, and a customer whose credits are expiring should not receive the same campaign or lose the reason they were selected.",
    problemSignals: [
      "Audience lists go stale after export",
      "Messages ignore the booking or membership context",
      "A send can outpace consent and guardian rules",
    ],
    solutionTitle: "Build audiences from the club’s current operating truth.",
    solution:
      "Duna keeps discovery, storefronts, relationship segments, consent, channel readiness, draft content, and sends connected. Suggestions stay reviewable and an operator owns publication.",
    outcomes: [
      { value: "Live", label: "relationship audiences" },
      { value: "Draft", label: "before every send" },
      { value: "Reason", label: "visible for selection" },
    ],
    capabilities: [
      {
        title: "Public discovery",
        description:
          "Publish clubs, coaches, venues, products, events, leagues, and court rentals where players can act.",
      },
      {
        title: "Story-first pages",
        description:
          "Use outcomes, imagery, proof, recommendations, and FAQs to help a buyer decide.",
      },
      {
        title: "Relationship audiences",
        description:
          "Build from memberships, registrations, lessons, rentals, attendance, purchases, and follows.",
      },
      {
        title: "Lifecycle journeys",
        description:
          "Create reviewable triggers and actions around real moments such as a booking gap or expiring credit.",
      },
      {
        title: "Channel readiness",
        description:
          "Keep domain, sender, SMS, push, in-app, consent, and usage state visible before a send.",
      },
      {
        title: "Operator approval",
        description:
          "Duna can draft and suggest. Publishing and sending remain explicit human actions.",
      },
    ],
    journey: [
      {
        title: "Choose the relationship",
        description:
          "Start with the observed activity and reason a person belongs in the audience.",
      },
      {
        title: "Craft in context",
        description:
          "Write the message beside the offer, event, credit, or relationship that gives it meaning.",
      },
      {
        title: "Review, then send",
        description:
          "Confirm audience, guardian and consent state, channel readiness, and content before publication.",
      },
    ],
    related: ["messaging", "products", "events", "people"],
  }),
  feature({
    key: "messaging",
    navLabel: "Messaging",
    navDescription: "Group and player conversations across every channel",
    category: "Grow with control",
    eyebrow: "Messaging",
    title: "The conversation should know what it is about.",
    summary:
      "Message a player, parent, team, lesson, league, event, rental, or organization through in-app conversation, email, SMS, and Duna Player push without losing guardian, consent, or delivery context.",
    image: "/media/brand/people/duna-avatar-mara-lewis-v1.webp",
    imageAlt: "A volleyball club member outdoors in warm light",
    accent: "signal",
    visual: "messaging",
    problemTitle: "Group chat moves fast. Accountability disappears faster.",
    problem:
      "When a schedule update, payment question, coach note, and youth conversation all share the same channel, context and safety rules become a memory test for the sender.",
    problemSignals: [
      "The audience must be rebuilt manually",
      "Guardians can be left out of youth conversations",
      "Delivery and read state fragment by channel",
    ],
    solutionTitle: "Keep the relationship and policy attached to the thread.",
    solution:
      "Duna anchors conversations to the player or operating context, checks relationship, block, guardian, consent, and channel rules at send time, and keeps cursor and delivery state convergent across web and native apps.",
    outcomes: [
      { value: "4", label: "supported channel families" },
      { value: "Same", label: "conversation context" },
      { value: "Fail-safe", label: "guardian routing" },
    ],
    capabilities: [
      {
        title: "Direct player messaging",
        description:
          "Keep the person, organization relationship, block state, and conversation history together.",
      },
      {
        title: "Group messaging",
        description:
          "Start from a team, event, league, lesson, rental, staff group, or organization audience.",
      },
      {
        title: "In-app conversations",
        description:
          "Sync messages, read state, stable client IDs, and offline outboxes across supported Duna surfaces.",
      },
      {
        title: "Email and SMS",
        description:
          "Use configured sender domains and SMS delivery with channel readiness and provider state visible.",
      },
      {
        title: "Duna Player push",
        description:
          "Wake the relevant native conversation without treating a notification as the message record.",
      },
      {
        title: "Guardian and safety policy",
        description:
          "Youth conversations require verified guardian coverage and are rechecked when the message is sent.",
      },
    ],
    journey: [
      {
        title: "Start from context",
        description:
          "Open the person, team, event, lesson, league, rental, or organization that needs a conversation.",
      },
      {
        title: "Resolve the audience safely",
        description:
          "Duna checks active relationships, blocks, guardian coverage, consent, and channel availability.",
      },
      {
        title: "Keep one record",
        description:
          "Delivery channels may differ while the conversation and policy trail remain coherent.",
      },
    ],
    related: ["people", "marketing", "safety-privacy", "events"],
  }),
  feature({
    key: "safety-privacy",
    navLabel: "Safety + privacy",
    navDescription: "Guardian controls, waivers, consent, and guest visibility",
    category: "Grow with control",
    eyebrow: "Safety + privacy",
    title: "Trust should be visible in the product, not buried in policy.",
    summary:
      "Give parents and guardians real authority, manage waiver versions and signature evidence, respect guest and player visibility choices, and keep private health, video, and communication boundaries explicit.",
    image: "/media/event-library/duna-event-wellness-warmup.webp",
    imageAlt: "Players preparing carefully before a volleyball session",
    accent: "marine",
    visual: "safety",
    problemTitle: "Consent is not one checkbox collected forever.",
    problem:
      "Youth authority, waiver text, profile visibility, attendance, health sharing, video access, messaging, and account deletion all change over time. A hidden policy cannot enforce those boundaries.",
    problemSignals: [
      "A revised waiver lacks a clean re-consent trail",
      "Youth messaging can outlive guardian coverage",
      "Guests cannot see or control where their identity appears",
    ],
    solutionTitle:
      "Make authority, scope, version, and evidence first-class state.",
    solution:
      "Duna resolves the authorized signer, preserves exact waiver text and receipts, rechecks guardian and relationship policy, and applies player-controlled visibility and sharing decisions where data is actually used.",
    outcomes: [
      { value: "Exact", label: "waiver version evidence" },
      { value: "Scoped", label: "guardian authority" },
      { value: "Revocable", label: "sharing choices" },
    ],
    capabilities: [
      {
        title: "Parent and guardian controls",
        description:
          "Connect verified adults to minors with recorded authority and appropriately scoped access.",
      },
      {
        title: "Waiver library",
        description:
          "Create or import versioned documents, preserve exact text, and require re-consent after a meaningful revision.",
      },
      {
        title: "Authorized signing",
        description:
          "Route adults, guardians, additional signers, and teen acknowledgement without replacing required guardian signatures.",
      },
      {
        title: "Privacy settings",
        description:
          "Let players and guests control profile, attendance, discoverability, and relevant sharing choices.",
      },
      {
        title: "Health and video boundaries",
        description:
          "Keep private check-ins excluded, health sharing revocable, minor video private, and playback authorization server-owned.",
      },
      {
        title: "Communication safeguards",
        description:
          "Recheck youth guardian coverage, organization relationship, blocks, and consent at send time.",
      },
    ],
    journey: [
      {
        title: "Name the authority",
        description:
          "Resolve who may act for the person and what relationship grants that authority.",
      },
      {
        title: "Show the exact decision",
        description:
          "Present the complete waiver, privacy, health, video, or messaging choice in context.",
      },
      {
        title: "Preserve the evidence",
        description:
          "Keep version, signer, scope, time, receipt, and later revocation or re-consent visible.",
      },
    ],
    related: ["people", "messaging", "coach-video", "events"],
  }),
  feature({
    key: "coach-video",
    navLabel: "Coach video",
    navDescription: "Duna Vision capture, source-linked review, and sharing",
    category: "Grow with control",
    eyebrow: "Duna Vision",
    title: "Review the rally, not a disconnected clip.",
    summary:
      "Capture or upload video, align the real court, connect scoring and Watch events to the source timeline, flag coaching moments, and share the right view with the right player.",
    image: "/media/brand/people/duna-video-maya-practice-v1.webp",
    imageAlt: "A beach volleyball practice recorded for coaching review",
    accent: "rose",
    visual: "vision",
    problemTitle: "Video becomes a folder before it becomes coaching.",
    problem:
      "A long recording without score, court geometry, player context, or review cues forces the coach to find the same rally again and then explain what the clip cannot show by itself.",
    problemSignals: [
      "Scores and video drift onto separate timelines",
      "Interesting moments are lost inside long recordings",
      "Private footage spreads through ad hoc links",
    ],
    solutionTitle: "Keep every observation anchored to the source.",
    solution:
      "Duna Vision preserves calibration, score events, Watch favorites, side changes, analysis observations, human review, privacy, and share grants as separate evidence layers attached to the same recording.",
    outcomes: [
      { value: "Source", label: "linked review cues" },
      { value: "Human", label: "correction outranks model output" },
      { value: "Private", label: "practice by default" },
    ],
    capabilities: [
      {
        title: "Guided capture",
        description:
          "Use court evidence, orientation, stability, framing, and calibration guidance without blocking an unusual angle.",
      },
      {
        title: "Score-synced timeline",
        description:
          "Keep score, favorite, undo, side-change, and review-cue events append-only and timestamped.",
      },
      {
        title: "Coach review",
        description:
          "Open the source-linked rally, court map, coverage, observation, and player context together.",
      },
      {
        title: "Human confirmation",
        description:
          "Store a coach or player correction separately. Reprocessing cannot silently overwrite it.",
      },
      {
        title: "Private sharing",
        description:
          "Practice starts private. Public, link-only, profile publishing, and invited access remain separate choices.",
      },
      {
        title: "Live and uploaded video",
        description:
          "Use organization-scoped recording and live capacity with usage and price visible before purchase.",
      },
    ],
    journey: [
      {
        title: "Set the court",
        description:
          "Align the real playing surface and lock the capture orientation and calibration.",
      },
      {
        title: "Mark what matters",
        description:
          "Scores, Watch favorites, side changes, and coaching cues stay attached while the session runs.",
      },
      {
        title: "Review with evidence",
        description:
          "Open the rally, observation, human correction, privacy, and sharing state from one timeline.",
      },
    ],
    related: ["duna-pro-watch", "training", "people", "safety-privacy"],
  }),
  feature({
    key: "duna-pro-watch",
    navLabel: "Duna for Apple Watch",
    navDescription:
      "Score, check the court, and save review cues from your wrist",
    category: "Grow with control",
    eyebrow: "Duna for Apple Watch",
    title: "Your match. On your wrist.",
    summary:
      "Score with simple gestures, confirm the court is in frame, save the moment, and carry a source-linked review cue back to the paired iPhone and Duna Vision.",
    image: "/media/brand/duna-pro-hero-v3.webp",
    imageAlt: "A coach using Duna Pro beside a volleyball court",
    accent: "signal",
    visual: "watch",
    problemTitle: "The point keeps moving while your phone stays in your bag.",
    problem:
      "Keeping score, checking capture, and remembering the rally to review should not pull a coach or player away from the court. A phone-first workflow loses attention and often loses the exact moment too.",
    problemSignals: [
      "Scorekeeping competes with watching the match",
      "Capture quality is discovered too late",
      "Review moments rely on memory",
    ],
    solutionTitle: "Make the wrist the match’s fastest control surface.",
    solution:
      "Duna for Apple Watch brings the configured match, gesture scoring, one-tap undo, Live Check-In, and Duna Vision review cues into a focused interface designed for use between rallies.",
    outcomes: [
      { value: "↑ / ↓", label: "gesture scoring" },
      { value: "94/100", label: "live court check" },
      { value: "Source", label: "linked review cue" },
    ],
    capabilities: [
      {
        title: "Gesture scorekeeping",
        description:
          "Swipe up for Side A or down for Side B with the score always readable at a glance.",
      },
      {
        title: "Match rules that travel",
        description:
          "The configured set and match context arrive with the paired session.",
      },
      {
        title: "Fast undo",
        description:
          "Correct the last point from the same screen without breaking the match rhythm.",
      },
      {
        title: "Live Check-In",
        description:
          "Confirm the court is visible and calibrated before the important rally happens.",
      },
      {
        title: "Duna Vision moments",
        description:
          "Save a moment with its score and recording-relative time attached for review.",
      },
      {
        title: "Paired iPhone handoff",
        description:
          "Open a flagged point on the paired phone with the review context already in place.",
      },
    ],
    journey: [
      {
        title: "Start the match",
        description:
          "Pair the session once and let the match rules, sides, set, and Duna Vision state arrive on the Watch.",
      },
      {
        title: "Keep your eyes up",
        description:
          "Score with up and down gestures, undo quickly, and check that the court remains in frame.",
      },
      {
        title: "Return to the exact point",
        description:
          "Flag the moment, preserve the score and time, then open the source-linked cue on the paired iPhone.",
      },
    ],
    related: ["coach-video", "training", "team-management", "people"],
    statusNote:
      "This page reflects the current Duna Apple Watch scorekeeping, Live Check-In, and Duna Vision review workflow. See the dedicated Watch page for the complete product story.",
  }),
] as const;

export const clubFeatureGroups = [
  {
    label: "Build the offer",
    description: "Price, package, and present what your club sells.",
    keys: [
      "products",
      "products/services",
      "products/plans",
      "products/goods-equipment",
    ],
  },
  {
    label: "Run the operation",
    description: "Keep the day, people, places, and training connected.",
    keys: [
      "team-management",
      "people",
      "events",
      "leagues",
      "venues",
      "training",
    ],
  },
  {
    label: "Grow with control",
    description: "Understand, communicate, and coach without losing trust.",
    keys: [
      "money",
      "marketing",
      "messaging",
      "safety-privacy",
      "coach-video",
      "duna-pro-watch",
    ],
  },
] as const;

export const clubFeatureByKey = new Map(
  clubFeatures.map((item) => [item.key, item] as const),
);

export function findClubFeature(
  path: readonly string[],
): ClubFeaturePageData | undefined {
  return clubFeatureByKey.get(path.join("/"));
}

export function relatedClubFeatures(
  item: ClubFeaturePageData,
): readonly ClubFeaturePageData[] {
  return item.related.flatMap((key) => {
    const related = clubFeatureByKey.get(key);
    return related ? [related] : [];
  });
}
