/**
 * `@duna/ui/native/identity`: the membership card, its pass and the wallet
 * on React Native (WALLET-2, docs/design/wallet.md). Built on the shared
 * pure model in `@duna/tideline-core` (`wallet.ts`, `qr.ts`), the same one
 * the web card reads. Never imports DOM code.
 */
export {
  CardArt,
  CardArtProvider,
  NATIVE_CARD_ART_ASSETS,
  useArtMotion,
  type CardArtProps,
  type CardLoopRenderer,
  type NativeCardArtAssets,
} from "./CardArt";
export { CardClubMark } from "./ClubMark";
export { CardFlip, FLIP_MS, FLIP_REDUCED_MS } from "./CardFlip";
export {
  CardFace,
  MembershipCard,
  type MembershipCardProps,
} from "./MembershipCard";
export {
  MembershipPass,
  QrCode,
  type MembershipPassProps,
} from "./MembershipPass";
export { WalletCarousel, type WalletCarouselProps } from "./WalletCarousel";
export { DRAW_MS, WalletStack, type WalletStackProps } from "./WalletStack";
export { WalletActions, type WalletActionItem } from "./WalletActions";
export { WalletBand, type WalletBandProps } from "./Wallet";
export { CardArrival, type CardArrivalProps } from "./CardArrival";
export {
  CARD_WIDTHS,
  CAROUSEL_GAP,
  CAROUSEL_MARGIN,
  UPLOAD_CONTRAST,
  alphaHex,
  artPainting,
  cardContrast,
  cardFaceParts,
  cardGeometry,
  cardLabel,
  carouselGeometry,
  carouselIndexAt,
  carouselInterpolation,
  carouselValue,
  flipAnnouncement,
  geometryForWidth,
  passText,
  type ArtLayer,
  type ArtPainting,
  type CardFaceParts,
  type CardGeometry,
  type CardSize,
  type CarouselGeometry,
  type NativeWalletCard,
  type PassText,
} from "./model";
export { scalePath } from "./paths";
