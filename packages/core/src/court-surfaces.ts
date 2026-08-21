export const COURT_SURFACE_IDS = [
  "sand",
  "indoor-sand",
  "grass",
  "sports-court",
  "hardwood",
  "carpet",
  "hardcourt",
] as const;

export type CourtSurface = (typeof COURT_SURFACE_IDS)[number];

export const COURT_SURFACE_OPTIONS = [
  { id: "sand", label: "Sand" },
  { id: "indoor-sand", label: "Indoor sand" },
  { id: "grass", label: "Grass" },
  { id: "sports-court", label: "Sports Court" },
  { id: "hardwood", label: "Hardwood" },
  { id: "carpet", label: "Carpet" },
  { id: "hardcourt", label: "Hard court" },
] as const satisfies readonly {
  readonly id: CourtSurface;
  readonly label: string;
}[];
