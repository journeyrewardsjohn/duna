export type TourBrand = "fivb" | "avp";

const tourBrand = {
  fivb: {
    label: "Volleyball World Beach Pro Tour",
    markSrc: "/media/tours/beach-pro-tour-mark.svg",
    src: "/media/tours/beach-pro-tour.svg",
  },
  avp: {
    label: "AVP",
    markSrc: "/media/tours/avp-mark.svg",
    src: "/media/tours/avp.svg",
  },
} as const;

export function TourBrandMark({
  brand,
  compact = false,
  decorative = false,
}: {
  readonly brand: TourBrand;
  readonly compact?: boolean;
  readonly decorative?: boolean;
}) {
  const identity = tourBrand[brand];
  return (
    <span
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : identity.label}
      className={`tour-brand-mark tour-brand-mark--${brand}${compact ? " tour-brand-mark--compact" : ""}`}
      role={decorative ? undefined : "img"}
    >
      <img alt="" src={compact ? identity.markSrc : identity.src} />
    </span>
  );
}
