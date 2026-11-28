/**
 * A card's art layer on native (WALLET-2). The Duna art set and the colour-
 * derived art are painted with layered native gradients and soft shapes from
 * the shared palettes (`artPainting`); the selected card's light breathes on
 * the native driver. Uploaded club art and future painted posters / loops
 * load through the same slot the web uses (`CardArtProvider`): the poster
 * first, the loop only for the selected card where motion is allowed.
 */
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
import Svg, {
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import type { CardArtSource, DunaArtKey } from "@duna/tideline-core";
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useReducedMotion } from "../motion";
import { artPainting, type ArtLayer, type ArtStop } from "./model";
import { scalePath } from "./paths";

/** Painted stills and loops for a Duna piece (same shape as the web's). */
export interface NativeCardArtAssets {
  /** A poster URI (HEIC or JPEG, 1116 × 704). */
  readonly poster: string;
  /** A 3–6 s seamless loop URI (HEVC or H.264 `.mp4`), muted. */
  readonly loop?: string;
}

/** Renders a muted looping video over the poster (the app supplies it). */
export type CardLoopRenderer = (props: {
  readonly uri: string;
  readonly playing: boolean;
}) => ReactNode;

interface ArtContextValue {
  readonly assets: Partial<Record<DunaArtKey, NativeCardArtAssets>>;
  readonly renderLoop?: CardLoopRenderer;
  /** False stops every loop and the light's breath (Low Power Mode, a setting). */
  readonly motion: boolean;
}

/**
 * Generated stills and loops shipped with the app. Empty today: every piece
 * is painted natively. Add a line per piece to swap in painted art.
 */
export const NATIVE_CARD_ART_ASSETS: Partial<
  Record<DunaArtKey, NativeCardArtAssets>
> = {};

const ArtContext = createContext<ArtContextValue>({
  assets: NATIVE_CARD_ART_ASSETS,
  motion: true,
});

/** Art assets, the loop player and whether art may move, for everything inside. */
export function CardArtProvider({
  assets,
  renderLoop,
  motion,
  children,
}: {
  readonly assets?: Partial<Record<DunaArtKey, NativeCardArtAssets>>;
  readonly renderLoop?: CardLoopRenderer;
  readonly motion?: boolean;
  readonly children: ReactNode;
}) {
  const inherited = useContext(ArtContext);
  const value = useMemo(
    () => ({
      assets: { ...inherited.assets, ...assets },
      renderLoop: renderLoop ?? inherited.renderLoop,
      motion: motion ?? inherited.motion,
    }),
    [assets, inherited, motion, renderLoop],
  );
  return <ArtContext.Provider value={value}>{children}</ArtContext.Provider>;
}

/** Whether art may move here: the provider's switch and Reduce Motion. */
export function useArtMotion(): boolean {
  const { motion } = useContext(ArtContext);
  const reduced = useReducedMotion();
  return motion && !reduced;
}

function stopsOf(stops: readonly ArtStop[]) {
  return stops.map((item, index) => (
    <Stop
      key={index}
      offset={item.offset}
      stopColor={item.color}
      stopOpacity={item.opacity}
    />
  ));
}

function Layer({
  layer,
  id,
  width,
  height,
}: {
  readonly layer: ArtLayer;
  readonly id: string;
  readonly width: number;
  readonly height: number;
}) {
  if (layer.kind === "linear") {
    return (
      <>
        <Defs>
          <LinearGradient
            gradientUnits="userSpaceOnUse"
            id={id}
            x1={layer.from[0] * width}
            x2={layer.to[0] * width}
            y1={layer.from[1] * height}
            y2={layer.to[1] * height}
          >
            {stopsOf(layer.stops)}
          </LinearGradient>
        </Defs>
        <Rect fill={`url(#${id})`} height={height} width={width} />
      </>
    );
  }
  if (layer.kind === "radial") {
    const cx = layer.center[0] * width;
    const cy = layer.center[1] * height;
    return (
      <>
        <Defs>
          <RadialGradient
            cx={cx}
            cy={cy}
            fx={cx}
            fy={cy}
            gradientUnits="userSpaceOnUse"
            id={id}
            rx={layer.radius[0] * width}
            ry={layer.radius[1] * height}
          >
            {stopsOf(layer.stops)}
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${id})`} height={height} width={width} />
      </>
    );
  }
  const d = scalePath(layer.d, width, height);
  return (
    <>
      {layer.fade ? (
        <Defs>
          <LinearGradient
            gradientUnits="userSpaceOnUse"
            id={id}
            x1={layer.fade.from[0] * width}
            x2={layer.fade.to[0] * width}
            y1={layer.fade.from[1] * height}
            y2={layer.fade.to[1] * height}
          >
            {stopsOf(layer.fade.stops)}
          </LinearGradient>
        </Defs>
      ) : null}
      <Path
        d={d}
        fill={
          layer.fade ? `url(#${id})` : layer.fill ? layer.fill.color : "none"
        }
        fillOpacity={layer.fill?.opacity}
        stroke={layer.stroke?.color}
        strokeLinecap="round"
        strokeOpacity={layer.stroke?.opacity}
        strokeWidth={layer.stroke?.width}
      />
    </>
  );
}

/** The painted piece; memoised so a scroll never repaints it. */
const Painting = memo(function Painting({
  art,
  width,
  height,
  prefix,
}: {
  readonly art: CardArtSource;
  readonly width: number;
  readonly height: number;
  readonly prefix: string;
}) {
  const painting = useMemo(() => artPainting(art), [art]);
  if (!painting) return null;
  return (
    <Svg height={height} width={width}>
      <G>
        {painting.layers.map((layer, index) => (
          <Layer
            height={height}
            id={`${prefix}-${index}`}
            key={index}
            layer={layer}
            width={width}
          />
        ))}
      </G>
    </Svg>
  );
});

/**
 * The light's slow breath on the selected card: a bloom of the highlight
 * that drifts a few per cent and back over the piece's period (never more
 * than 4 % of the card a second), on the native driver. Seamless: it returns
 * exactly to where it started.
 */
function Breath({
  art,
  width,
  height,
  prefix,
}: {
  readonly art: CardArtSource;
  readonly width: number;
  readonly height: number;
  readonly prefix: string;
}) {
  const painting = useMemo(() => artPainting(art), [art]);
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!painting) return;
    const half = (painting.period * 1000) / 2;
    const ease = Easing.inOut(Easing.ease);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: half,
          easing: ease,
          useNativeDriver: true,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration: half,
          easing: ease,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      t.setValue(0);
    };
  }, [painting, t]);
  if (!painting) return null;
  const [lx, ly] = painting.light;
  const high = painting.palette[3];
  // 6 % of the width over half a period: under 4 % of the card a second.
  const travel = 0.06 * width;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          opacity: t.interpolate({
            inputRange: [0, 1],
            outputRange: [0.55, 1],
          }),
          transform: [
            {
              translateX: t.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -travel],
              }),
            },
            {
              translateY: t.interpolate({
                inputRange: [0, 1],
                outputRange: [0, travel * 0.35],
              }),
            },
          ],
        },
      ]}
    >
      <Svg height={height} width={width}>
        <Defs>
          <RadialGradient
            cx={lx * width}
            cy={ly * height}
            fx={lx * width}
            fy={ly * height}
            gradientUnits="userSpaceOnUse"
            id={`${prefix}-breath`}
            rx={width * 0.42}
            ry={height * 0.6}
          >
            <Stop offset={0} stopColor={high} stopOpacity={0.5} />
            <Stop offset={0.5} stopColor={high} stopOpacity={0.14} />
            <Stop offset={1} stopColor={high} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${prefix}-breath)`} height={height} width={width} />
      </Svg>
    </Animated.View>
  );
}

export interface CardArtProps {
  readonly art: CardArtSource;
  readonly width: number;
  readonly height: number;
  /** The selected card: its light breathes and its loop plays. Stills otherwise. */
  readonly animate?: boolean;
  /** Unique within the screen (gradient ids). */
  readonly id: string;
}

/**
 * The art, full bleed: a poster or the native painting, and for the
 * selected card where motion is allowed, the loop or the light's breath.
 * Neighbours, strips and lists are still.
 */
export function CardArt({ art, width, height, animate, id }: CardArtProps) {
  const { assets, renderLoop } = useContext(ArtContext);
  const moves = useArtMotion() && animate === true;
  const files =
    art.source === "upload"
      ? { poster: art.poster, loop: art.loop?.mp4 }
      : art.source === "set"
        ? assets[art.key]
        : undefined;
  const prefix = `art-${id.replace(/[^a-zA-Z0-9-]/g, "")}`;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      {files ? (
        <>
          <Image
            resizeMode="cover"
            source={{ uri: files.poster, width, height }}
            style={StyleSheet.absoluteFill}
          />
          {files.loop && renderLoop && moves
            ? renderLoop({ uri: files.loop, playing: true })
            : null}
        </>
      ) : (
        <>
          <Painting art={art} height={height} prefix={prefix} width={width} />
          {moves ? (
            <Breath art={art} height={height} prefix={prefix} width={width} />
          ) : null}
        </>
      )}
    </View>
  );
}
