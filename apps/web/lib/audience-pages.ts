export const clubHighlights = [
  {
    title: "Courts & scheduling",
    description:
      "Manage courts, rentals, coach availability, and bookings in one calendar.",
    key: "venues",
  },
  {
    title: "Programs & events",
    description:
      "Take registrations for lessons, clinics, camps, leagues, and tournaments.",
    key: "events",
  },
  {
    title: "Memberships & payments",
    description:
      "Sell memberships and credit packs. Keep orders, refunds, and payouts together.",
    key: "products/plans",
  },
  {
    title: "Players & teams",
    description:
      "Organize rosters, staff, parents, waivers, and the people behind every session.",
    key: "people",
  },
  {
    title: "Messaging & marketing",
    description:
      "Send useful updates to the right players, teams, and members with consent built in.",
    key: "messaging",
  },
  {
    title: "Training & video",
    description:
      "Plan practices, review recordings, and share coaching moments with your players.",
    key: "coach-video",
  },
] as const;

export const playerHighlights = [
  {
    title: "Find your next game",
    description:
      "Explore courts, open play, clinics, lessons, leagues, and tournaments near you.",
    href: "/discover",
  },
  {
    title: "Book your place",
    description:
      "See the details, choose a session, and register with the club hosting it.",
    href: "/discover",
  },
  {
    title: "Know your level",
    description:
      "Build a verified match history and understand how your Sand Rating changes.",
    href: "/methodology",
  },
  {
    title: "Keep your matches",
    description:
      "Record results, follow your progress, and bring your game history with you.",
    href: "/app/matches",
  },
  {
    title: "Learn from your video",
    description:
      "Record practice, revisit important moments, and control who can see your footage.",
    href: "/app/video",
  },
  {
    title: "Follow the sport",
    description:
      "Keep up with professional events, scores, broadcasts, and world rankings.",
    href: "/pro",
  },
] as const;

export const clubFaqs = [
  {
    question: "Who is Duna built for?",
    answer:
      "Duna supports indoor, beach, and combined volleyball clubs, independent coaches, facilities, and event organizers. Start with the tools your operation needs and add more as you grow.",
  },
  {
    question: "What can we offer through Duna?",
    answer:
      "Court rentals, private lessons, clinics, camps, open play, leagues, tournaments, memberships, credit packs, merchandise, and equipment. Each offer keeps its own schedule, pricing, and registration details.",
  },
  {
    question: "How does pricing work?",
    answer:
      "Duna offers organization plans with no monthly platform fee. Transaction fees and video usage charges apply. See the pricing page for current rates, included usage, and plan details.",
  },
  {
    question: "How do players use Duna?",
    answer:
      "Players discover your club and offers, register or book, manage their memberships, and stay connected through Duna Player. Their match history and Sand Rating travel with them.",
  },
] as const;

export const playerFaqs = [
  {
    question: "Where do I start?",
    answer:
      "Explore Discover to find places and sessions. You can browse public details first, then sign in when you are ready to book, register, or save your activity.",
  },
  {
    question: "Who can help with a booking?",
    answer:
      "Your club or event organizer manages the session, availability, membership terms, and cancellation policy. Open the booking or event details to find the organizer and contact options.",
  },
  {
    question: "How does Sand Rating work?",
    answer:
      "Sand Rating uses verified match results and the strength of your opponents and partners to help explain your level. Read the methodology for the full calculation and verification process.",
  },
] as const;
