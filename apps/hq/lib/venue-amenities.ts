export const parkingAmenityOptions = [
  { value: "", label: "No on-site parking" },
  { value: "parking-free", label: "Free parking on-site" },
  { value: "parking-paid", label: "Paid parking on-site" },
] as const;

export const restroomAmenityOptions = [
  { value: "", label: "No on-site restrooms" },
  { value: "restrooms-public", label: "Public restrooms" },
  { value: "restrooms-private", label: "Private restrooms" },
] as const;

export const venueAmenityOptions = [
  { value: "changing-area", label: "Changing area" },
  { value: "ev-charging", label: "EV charging" },
  { value: "restaurant-cafe", label: "Restaurant or cafe" },
  { value: "alcohol-served", label: "Alcohol served on-site" },
  { value: "byob-alcohol", label: "BYOB alcohol allowed" },
  { value: "pets-allowed", label: "Pets allowed" },
  { value: "spectator-seating", label: "Spectator seating" },
] as const;

export type VenueAmenityToken =
  | (typeof parkingAmenityOptions)[number]["value"]
  | (typeof restroomAmenityOptions)[number]["value"]
  | (typeof venueAmenityOptions)[number]["value"];

const amenityLabels = new Map<string, string>(
  [
    ...parkingAmenityOptions,
    ...restroomAmenityOptions,
    ...venueAmenityOptions,
  ].map((option) => [option.value, option.label]),
);

const aliases = new Map<string, string>([
  ["free parking", "parking-free"],
  ["free parking on-site", "parking-free"],
  ["paid parking", "parking-paid"],
  ["paid parking on-site", "parking-paid"],
  ["public restrooms", "restrooms-public"],
  ["private restrooms", "restrooms-private"],
  ["changing area", "changing-area"],
  ["ev charging", "ev-charging"],
  ["restaurant/cafe", "restaurant-cafe"],
  ["restaurant or cafe", "restaurant-cafe"],
  ["alcohol served on-site", "alcohol-served"],
  ["byob alcohol allowed on-site", "byob-alcohol"],
  ["pets allowed", "pets-allowed"],
  ["spectator seating", "spectator-seating"],
]);

export function canonicalVenueAmenity(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (amenityLabels.has(trimmed)) return trimmed;
  return aliases.get(trimmed.toLowerCase()) ?? trimmed;
}

export function venueAmenityLabel(value: string): string {
  const canonical = canonicalVenueAmenity(value);
  return amenityLabels.get(canonical) ?? canonical;
}

export function parseVenueAmenities(values: readonly string[]) {
  const amenities = [
    ...new Set(values.map(canonicalVenueAmenity).filter(Boolean)),
  ];
  const parking = amenities.find((value) => value.startsWith("parking-")) ?? "";
  const restrooms =
    amenities.find((value) => value.startsWith("restrooms-")) ?? "";
  const toggles = venueAmenityOptions
    .map((option) => option.value)
    .filter((value) => amenities.includes(value));
  const known = new Set([parking, restrooms, ...toggles].filter(Boolean));
  return {
    parking,
    restrooms,
    toggles,
    additional: amenities.filter((value) => !known.has(value)),
  };
}

export function buildVenueAmenities(input: {
  readonly parking: string;
  readonly restrooms: string;
  readonly toggles: readonly string[];
  readonly additional: string;
}): readonly string[] {
  return [
    input.parking,
    input.restrooms,
    ...input.toggles,
    ...input.additional.split(","),
  ]
    .map(canonicalVenueAmenity)
    .filter(
      (value, index, values) =>
        Boolean(value) && values.indexOf(value) === index,
    );
}
