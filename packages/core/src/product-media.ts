export type DunaProductMediaKind =
  | "membership"
  | "credit-pack"
  | "bundle"
  | "private-lesson"
  | "group-lesson"
  | "program"
  | "assessment"
  | "equipment"
  | "apparel"
  | "swag"
  | "consumable"
  | "other";

export interface DunaProductMedia {
  readonly id: string;
  readonly title: string;
  readonly alt: string;
  readonly path: string;
  readonly kinds: readonly DunaProductMediaKind[];
}

const pathFor = (id: string) =>
  `/media/product-library/duna-product-${id}.webp`;

export const DUNA_PRODUCT_MEDIA: readonly DunaProductMedia[] = [
  {
    id: "club-community",
    title: "Belong here",
    alt: "Beach volleyball club members gathering after morning play",
    path: pathFor("club-community"),
    kinds: ["membership", "bundle", "program"],
  },
  {
    id: "member-courts",
    title: "Your courts",
    alt: "Prepared beach volleyball courts with premium club amenities",
    path: pathFor("member-courts"),
    kinds: ["membership", "credit-pack", "bundle"],
  },
  {
    id: "credit-pack",
    title: "Play on your terms",
    alt: "Volleyball and club tokens beside a freshly prepared beach court",
    path: pathFor("credit-pack"),
    kinds: ["credit-pack", "bundle", "membership"],
  },
  {
    id: "training-bundle",
    title: "Everything you need",
    alt: "Beach volleyball training kit arranged beside an oceanfront court",
    path: pathFor("training-bundle"),
    kinds: ["bundle", "program", "credit-pack"],
  },
  {
    id: "private-lesson",
    title: "Focused reps",
    alt: "One-on-one beach volleyball coaching session",
    path: pathFor("private-lesson"),
    kinds: ["private-lesson", "assessment"],
  },
  {
    id: "group-lesson",
    title: "Learn together",
    alt: "Small group beach volleyball lesson in progress",
    path: pathFor("group-lesson"),
    kinds: ["group-lesson", "program"],
  },
  {
    id: "player-assessment",
    title: "Know your game",
    alt: "Coach observing a beach volleyball player assessment",
    path: pathFor("player-assessment"),
    kinds: ["assessment", "private-lesson", "program"],
  },
  {
    id: "season-program",
    title: "Build your season",
    alt: "Beach volleyball training program across several active courts",
    path: pathFor("season-program"),
    kinds: ["program", "group-lesson", "bundle"],
  },
  {
    id: "premium-equipment",
    title: "Ready to play",
    alt: "Premium beach volleyball equipment on clean sand",
    path: pathFor("premium-equipment"),
    kinds: ["equipment", "consumable", "other"],
  },
  {
    id: "club-apparel",
    title: "Club essentials",
    alt: "Unbranded coastal athletic apparel styled beside a volleyball",
    path: pathFor("club-apparel"),
    kinds: ["apparel", "swag", "other"],
  },
] as const;

export function productMediaForKind(kind: string): readonly DunaProductMedia[] {
  const preferredId: Partial<Record<DunaProductMediaKind, string>> = {
    membership: "club-community",
    "credit-pack": "credit-pack",
    bundle: "training-bundle",
    "private-lesson": "private-lesson",
    "group-lesson": "group-lesson",
    program: "season-program",
    assessment: "player-assessment",
    equipment: "premium-equipment",
    apparel: "club-apparel",
    swag: "club-apparel",
    consumable: "premium-equipment",
  };
  const matched = DUNA_PRODUCT_MEDIA.filter((item) =>
    item.kinds.includes(kind as DunaProductMediaKind),
  );
  const preferred = preferredId[kind as DunaProductMediaKind];
  const prioritized = preferred
    ? [
        ...matched.filter((item) => item.id === preferred),
        ...matched.filter((item) => item.id !== preferred),
      ]
    : matched;
  return [
    ...prioritized,
    ...DUNA_PRODUCT_MEDIA.filter((item) => !prioritized.includes(item)),
  ];
}
