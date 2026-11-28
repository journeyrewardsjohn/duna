/**
 * Privacy in plain sentences (Profile and Settings). Pure and tested
 * (`privacy-model.test.ts`). What is public follows the server's rules: a
 * public profile page exists only for an adult whose visibility is "public"
 * (`public.playerByHandle`), and a match appears on a public page only when
 * every player in it is a public adult (`match-service` public live view).
 * Juniors are private by rule.
 */

export type Visibility = "public" | "members" | "private";

export interface VisibilityChoice {
  readonly value: Visibility;
  readonly label: string;
  /** What this choice means, in one sentence. */
  readonly sentence: string;
}

export const VISIBILITY_CHOICES: readonly VisibilityChoice[] = [
  {
    value: "public",
    label: "Public",
    sentence:
      "Anyone can open your profile page: your name, handle, home area and Sand Rating, and matches where every player is public.",
  },
  {
    value: "members",
    label: "Duna members",
    sentence:
      "You have no public page. People signed in to Duna can still see your name on matches and sessions you share.",
  },
  {
    value: "private",
    label: "Private",
    sentence:
      "You have no public page. Only the people you play with see your name, on the matches and sessions you share.",
  },
];

export const JUNIOR_RULE =
  "Players under 18 are private by rule: no public page, and their matches never appear on public pages.";

/** The sentence for a choice. */
export function visibilitySentence(visibility: Visibility): string {
  return (
    VISIBILITY_CHOICES.find((choice) => choice.value === visibility)
      ?.sentence ?? VISIBILITY_CHOICES[2]!.sentence
  );
}

/** The choices a person may make: juniors only "Private". */
export function visibilityChoices(
  isMinor: boolean,
): readonly VisibilityChoice[] {
  return isMinor
    ? VISIBILITY_CHOICES.filter((choice) => choice.value === "private")
    : VISIBILITY_CHOICES;
}

export interface PublicPreview {
  /** Whether a public page exists. */
  readonly published: boolean;
  /** Its address, when it does. */
  readonly path?: string;
  /** What the page shows, in order. */
  readonly shows: readonly string[];
  /** What it never shows. */
  readonly hidden: readonly string[];
  readonly summary: string;
}

/** What the public sees of a person, given their choices. */
export function publicPreview(input: {
  readonly visibility: Visibility;
  readonly isMinor: boolean;
  readonly handle: string;
  readonly ratingProvisional: boolean;
}): PublicPreview {
  const hidden = [
    "Email and phone",
    "Date of birth",
    "Your household and juniors",
    "Payments, wallet and bookings",
  ];
  if (input.isMinor) {
    return { published: false, shows: [], hidden, summary: JUNIOR_RULE };
  }
  if (input.visibility !== "public") {
    return {
      published: false,
      shows: [],
      hidden,
      summary: visibilitySentence(input.visibility),
    };
  }
  return {
    published: true,
    path: `/players/${input.handle}`,
    shows: [
      "Your name, handle and photo",
      "Your home area",
      input.ratingProvisional
        ? "Your Sand Rating, once it is no longer provisional"
        : "Your Sand Rating",
      "Matches where every player is public",
    ],
    hidden,
    summary: visibilitySentence("public"),
  };
}

export type MarketingScope =
  "marketing-email" | "marketing-sms" | "marketing-push";

/**
 * Each optional message, in the sentence the person agrees to. The same text
 * is recorded with the consent (`recordConsent` `disclosureText`), so what the
 * person read is what Duna keeps.
 */
export const MARKETING_CHOICES: readonly {
  readonly scope: MarketingScope;
  readonly label: string;
  readonly sentence: string;
}[] = [
  {
    scope: "marketing-email",
    label: "Email",
    sentence:
      "Duna may send optional email updates about nearby play, programs, product news, and offers. You can turn these emails off at any time.",
  },
  {
    scope: "marketing-sms",
    label: "Text messages",
    sentence:
      "Duna may send optional text messages about nearby play, programs, product news, and offers. Message and data rates may apply. Reply STOP to opt out.",
  },
  {
    scope: "marketing-push",
    label: "Notifications",
    sentence:
      "Duna may send optional device notifications about nearby play, programs, product news, and offers. You can disable these notifications at any time.",
  },
];

export function marketingDisclosure(scope: MarketingScope): string {
  return MARKETING_CHOICES.find((choice) => choice.scope === scope)!.sentence;
}

export const ACCOUNT_NOTICES_SENTENCE =
  "Messages about your own bookings, payments, matches and safety are always sent. They are part of your account.";
