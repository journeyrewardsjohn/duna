/** Where a match was played (M-P4a). */
export interface ChosenPlace {
  /** A Duna venue. */
  readonly venueId?: string;
  readonly label: string;
  readonly location?: {
    readonly label: string;
    readonly name?: string;
    readonly googlePlaceId?: string;
    readonly latitude?: number;
    readonly longitude?: number;
  };
}
