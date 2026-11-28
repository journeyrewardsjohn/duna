/**
 * Test fixture: a fictional club website, "Harbor Sands Volleyball Club",
 * recorded as the reader would return it (Markdown per page), with the
 * extraction a model returned for each page. Invented for tests: no real
 * business, person, address, phone number or price. The recorded
 * extractions deliberately include facts that are NOT on the page (a made-up
 * phone, a court count the page never states, a price the page does not
 * show) so the tests prove code drops or flags them.
 */
import type { SetupRawExtraction } from "../extraction-schema";
import { emptySetupExtraction } from "../extraction-schema";
import type { SetupReaderPage } from "../reader";

export const harborOrigin = "https://www.harborsands-fixture.club";

const home = `# Harbor Sands Volleyball Club

Beach volleyball for every age on the bay.

Harbor Sands is a member-run beach volleyball club with eight sand courts on the north shore. We run lessons, junior programs and leagues all year.

[About](/about) · [Lessons](/lessons) · [Coaches](/coaches) · [Policies](/policies) · [Contact](/contact) · [Blog](/blog/summer-recap) · [Gallery](/gallery.pdf)

Follow us on [Instagram](https://instagram.com/harborsands_fixture)

Call us: (310) 555-0142 · Email: hello@harborsands-fixture.club

Open every day 8:00 AM – 9:00 PM.
`;

const contact = `# Contact

Front desk: (310) 555-0142
Text line: +1 310 555 0199
Email: frontdesk@harborsands-fixture.club

Harbor Sands Courts
1200 Shoreline Way, Bayview, CA 90299

Hours: Monday to Friday 7:00 AM – 9:00 PM, Saturday and Sunday 8:00 AM – 8:00 PM.
`;

const lessons = `# Lessons and programs

Private lesson (60 minutes): $95 per session.
Group clinic (90 minutes): $35 per player.
Junior program, ages 12–16, Saturdays. Ask us about pricing.
Adult league: $480 per team per season.
`;

const coaches = `# Our coaches

Head coach Maya Okafor leads the junior program.
Coach Theo Lindqvist runs adult clinics.
`;

const policies = `# Policies

Cancellations: cancel at least 24 hours before your lesson for a full refund.
Weather: if lightning is within ten miles, play stops for 30 minutes.
`;

export const harborPages: Readonly<Record<string, SetupReaderPage>> = {
  [`${harborOrigin}/`]: {
    finalUrl: `${harborOrigin}/`,
    statusCode: 200,
    title: "Harbor Sands Volleyball Club",
    markdown: home,
    links: [
      "/about",
      "/lessons",
      "/coaches",
      "/policies",
      "/contact",
      "/blog/summer-recap",
      "/gallery.pdf",
      "https://instagram.com/harborsands_fixture",
      "https://elsewhere-fixture.club/lessons",
    ],
    branding: {
      logo: `${harborOrigin}/logo.png`,
      colors: { primary: "#0B5D7A", accent: "#F2C14E" },
    },
  },
  [`${harborOrigin}/contact`]: {
    finalUrl: `${harborOrigin}/contact`,
    statusCode: 200,
    title: "Contact",
    markdown: contact,
    links: [],
  },
  [`${harborOrigin}/lessons`]: {
    finalUrl: `${harborOrigin}/lessons`,
    statusCode: 200,
    title: "Lessons",
    markdown: lessons,
    links: [],
  },
  [`${harborOrigin}/coaches`]: {
    finalUrl: `${harborOrigin}/coaches`,
    statusCode: 200,
    title: "Coaches",
    markdown: coaches,
    links: [],
  },
  [`${harborOrigin}/policies`]: {
    finalUrl: `${harborOrigin}/policies`,
    statusCode: 200,
    title: "Policies",
    markdown: policies,
    links: [],
  },
  [`${harborOrigin}/about`]: {
    finalUrl: `${harborOrigin}/about`,
    statusCode: 404,
    title: "Not found",
    markdown: "Not found",
    links: [],
  },
};

/** What the model returned per page (keyed by site path). */
export const harborExtractions: Readonly<Record<string, SetupRawExtraction>> = {
  "/": {
    ...emptySetupExtraction,
    clubName: {
      value: "Harbor Sands Volleyball Club",
      quote: "Harbor Sands Volleyball Club",
    },
    tagline: {
      value: "Beach volleyball for every age on the bay.",
      quote: "Beach volleyball for every age on the bay.",
    },
    about: {
      value:
        "Harbor Sands is a member-run beach volleyball club with eight sand courts on the north shore.",
      quote:
        "Harbor Sands is a member-run beach volleyball club with eight sand courts on the north shore.",
    },
    sports: [
      { value: "beach", quote: "Beach volleyball for every age on the bay." },
    ],
    phones: [
      { value: "(310) 555-0142", quote: "Call us: (310) 555-0142" },
      // Not on the page: must be dropped.
      { value: "(310) 555-0100", quote: "Call our office at (310) 555-0100" },
    ],
    emails: [
      {
        value: "hello@harborsands-fixture.club",
        quote: "Email: hello@harborsands-fixture.club",
      },
    ],
    socials: [
      {
        network: "instagram",
        url: "https://instagram.com/harborsands_fixture",
        quote: "Follow us on Instagram",
      },
    ],
    hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      opens: "08:00",
      closes: "21:00",
      quote: "Open every day 8:00 AM – 9:00 PM.",
    })),
  },
  "/contact": {
    ...emptySetupExtraction,
    phones: [
      { value: "(310) 555-0142", quote: "Front desk: (310) 555-0142" },
      { value: "+1 310 555 0199", quote: "Text line: +1 310 555 0199" },
    ],
    emails: [
      {
        value: "frontdesk@harborsands-fixture.club",
        quote: "Email: frontdesk@harborsands-fixture.club",
      },
    ],
    locations: [
      {
        name: "Harbor Sands Courts",
        street: "1200 Shoreline Way",
        locality: "Bayview",
        region: "CA",
        postalCode: "90299",
        country: "US",
        // The contact page never states a court count: must be cleared.
        courtCount: 8,
        surface: "sand",
        environment: "outdoor",
        quote: "Harbor Sands Courts",
      },
    ],
    hours: [
      ...[1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        opens: "07:00",
        closes: "21:00",
        quote:
          "Hours: Monday to Friday 7:00 AM – 9:00 PM, Saturday and Sunday 8:00 AM – 8:00 PM.",
      })),
      ...[0, 6].map((weekday) => ({
        weekday,
        opens: "08:00",
        closes: "20:00",
        quote:
          "Hours: Monday to Friday 7:00 AM – 9:00 PM, Saturday and Sunday 8:00 AM – 8:00 PM.",
      })),
    ],
  },
  "/lessons": {
    ...emptySetupExtraction,
    offerings: [
      {
        title: "Private lesson",
        kind: "private-lesson",
        priceText: "$95 per session",
        amount: 95,
        currency: null,
        per: "session",
        durationMinutes: 60,
        description: null,
        quote: "Private lesson (60 minutes): $95 per session.",
      },
      {
        title: "Group clinic",
        kind: "clinic",
        priceText: "$35 per player",
        amount: 35,
        currency: "USD",
        per: "session",
        durationMinutes: 90,
        description: null,
        quote: "Group clinic (90 minutes): $35 per player.",
      },
      {
        title: "Junior program",
        kind: "program",
        // The page asks people to call: a price here is invented.
        priceText: "$200 per month",
        amount: 200,
        currency: null,
        per: "month",
        durationMinutes: null,
        description: "Ages 12–16, Saturdays.",
        quote: "Junior program, ages 12–16, Saturdays. Ask us about pricing.",
      },
      {
        title: "Adult league",
        kind: "league",
        priceText: "$480 per team per season",
        amount: 480,
        currency: null,
        per: "season",
        durationMinutes: null,
        description: null,
        quote: "Adult league: $480 per team per season.",
      },
    ],
  },
  "/coaches": {
    ...emptySetupExtraction,
    staff: [
      {
        name: "Maya Okafor",
        role: "coach",
        title: "Head coach",
        quote: "Head coach Maya Okafor leads the junior program.",
      },
      {
        name: "Theo Lindqvist",
        role: "coach",
        title: null,
        quote: "Coach Theo Lindqvist runs adult clinics.",
      },
      // Nobody of this name is on the page.
      {
        name: "Jordan Vale",
        role: "director",
        title: "Club director",
        quote: "Club director Jordan Vale",
      },
    ],
  },
  "/policies": {
    ...emptySetupExtraction,
    policies: [
      {
        kind: "cancellation",
        title: "Cancellations",
        summary: "Cancel at least 24 hours before a lesson for a full refund.",
        noticeHours: 24,
        quote:
          "Cancellations: cancel at least 24 hours before your lesson for a full refund.",
      },
      {
        kind: "weather",
        title: "Weather",
        summary:
          "Play stops for 30 minutes when lightning is within ten miles.",
        noticeHours: null,
        quote:
          "Weather: if lightning is within ten miles, play stops for 30 minutes.",
      },
    ],
  },
};
