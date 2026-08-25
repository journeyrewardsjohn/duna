import type { DiscoveryEntityType, DiscoveryMapItem } from "@duna/api";
import { formatMoney } from "@duna/core";
import {
  environmentalColors,
  motion,
  radii,
  resolveDunaTokens,
  spacing,
  type DunaTheme,
  type ResolvedDunaTokens,
} from "@duna/ui/tokens";
import Mapbox, { type MapState } from "@rnmapbox/maps";
import * as Location from "expo-location";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SatoshiText as Text } from "./satoshi-text";
import { createDeferredModalTransition } from "./deferred-modal-transition";
import { resolveDiscoveryMediaUrl } from "./discovery-media";
import { dunaWebUrl } from "./mobile-api";
import { type DiscoveryCoordinates } from "./discovery-search";
import {
  buildDrivingMatrixRequest,
  formatDrivingDistance,
  formatDrivingDuration,
  parseDrivingMatrix,
  type MeasurementSystem,
  type TravelEstimate,
} from "./discovery-travel";
import {
  discoveryItemMatchesFilter,
  type DiscoveryMapFilter,
} from "./discovery-filters";

type MapBounds = MapState["properties"]["bounds"];
type SheetPosition = "list" | "split" | "map";

const filterOptions: readonly { value: DiscoveryMapFilter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "organization", label: "Clubs" },
  { value: "venue", label: "Courts" },
  { value: "event", label: "Events" },
  { value: "coach", label: "Coaches" },
  { value: "match", label: "Matches" },
  { value: "pro-tour", label: "Pro tour" },
] as const;

const entityColors: Record<DiscoveryEntityType, string> = {
  event: environmentalColors.marine900,
  venue: environmentalColors.sand500,
  coach: environmentalColors.flare,
  organization: environmentalColors.gain,
  match: environmentalColors.marine400,
  "pro-tour": environmentalColors.signal,
};

let publicTokenRequest: Promise<string | undefined> | undefined;
const embeddedPublicToken = process.env.EXPO_PUBLIC_MAPBOX_API_TOKEN?.trim();

async function publicMapboxToken(): Promise<string | undefined> {
  if (embeddedPublicToken?.startsWith("pk.")) return embeddedPublicToken;
  publicTokenRequest ??= fetch(`${dunaWebUrl}/api/mapbox/token`)
    .then(async (response) => {
      if (!response.ok) return undefined;
      const payload = (await response.json()) as { token?: string };
      return payload.token?.startsWith("pk.") ? payload.token : undefined;
    })
    .catch(() => undefined);
  return publicTokenRequest;
}

export function useMapboxToken(active = true) {
  const [token, setToken] = useState<string>();
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    void publicMapboxToken().then((nextToken) => {
      if (!mounted || !nextToken) return;
      Mapbox.setAccessToken(nextToken);
      setToken(nextToken);
    });
    return () => {
      mounted = false;
    };
  }, [active]);
  return token;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => subscription.remove();
  }, []);
  return reduced;
}

function mapShape(
  items: readonly DiscoveryMapItem[],
): GeoJSON.FeatureCollection<
  GeoJSON.Point,
  {
    readonly id: string;
    readonly entityType: DiscoveryEntityType;
    readonly title: string;
    readonly live: number;
  }
> {
  return {
    type: "FeatureCollection",
    features: items.flatMap((item) =>
      item.latitude !== undefined && item.longitude !== undefined
        ? [
            {
              type: "Feature" as const,
              geometry: {
                type: "Point" as const,
                coordinates: [item.longitude, item.latitude],
              },
              properties: {
                id: item.id,
                entityType: item.entityType,
                title: item.title,
                live: item.live ? 1 : 0,
              },
            },
          ]
        : [],
    ),
  };
}

function itemInBounds(item: DiscoveryMapItem, bounds: MapBounds): boolean {
  if (item.latitude === undefined || item.longitude === undefined) return false;
  const [west, south] = bounds.sw;
  const [east, north] = bounds.ne;
  if (
    west === undefined ||
    south === undefined ||
    east === undefined ||
    north === undefined
  ) {
    return false;
  }
  const longitudeInBounds =
    west <= east
      ? item.longitude >= west && item.longitude <= east
      : item.longitude >= west || item.longitude <= east;
  return longitudeInBounds && item.latitude >= south && item.latitude <= north;
}

function MapLayers({
  items,
  onPress,
  token,
}: {
  readonly items: readonly DiscoveryMapItem[];
  readonly onPress?: (event: {
    readonly features: readonly GeoJSON.Feature[];
  }) => void;
  readonly token: ResolvedDunaTokens;
}) {
  const shape = useMemo(() => mapShape(items), [items]);
  return (
    <Mapbox.ShapeSource
      cluster
      clusterMaxZoomLevel={14}
      clusterProperties={
        {
          pro_count: [
            "+",
            ["case", ["==", ["get", "entityType"], "pro-tour"], 1, 0],
          ],
          venue_count: [
            "+",
            ["case", ["==", ["get", "entityType"], "venue"], 1, 0],
          ],
        } as never
      }
      clusterRadius={56}
      id="duna-discovery"
      onPress={onPress as never}
      shape={shape}
    >
      <Mapbox.CircleLayer
        filter={["has", "point_count"] as never}
        id="duna-discovery-clusters"
        style={{
          circleColor: [
            "case",
            [">", ["get", "pro_count"], 0],
            entityColors["pro-tour"],
            ["==", ["get", "venue_count"], ["get", "point_count"]],
            entityColors.venue,
            environmentalColors.marine900,
          ] as never,
          circleOpacity: 0.94,
          circleRadius: [
            "step",
            ["get", "point_count"],
            18,
            10,
            23,
            40,
            29,
          ] as never,
          circleStrokeColor: token.surface1,
          circleStrokeWidth: 2,
        }}
      />
      <Mapbox.SymbolLayer
        filter={["has", "point_count"] as never}
        id="duna-discovery-cluster-count"
        style={{
          textColor: environmentalColors.ink,
          textField: ["get", "point_count_abbreviated"] as never,
          textSize: 12,
        }}
      />
      <Mapbox.CircleLayer
        filter={
          [
            "all",
            ["!", ["has", "point_count"]],
            ["==", ["get", "entityType"], "pro-tour"],
          ] as never
        }
        id="duna-discovery-pro-halo"
        style={{
          circleColor: token.flareFill,
          circleRadius: 14,
          circleStrokeColor: entityColors["pro-tour"],
          circleStrokeWidth: 2,
        }}
      />
      <Mapbox.CircleLayer
        filter={["!", ["has", "point_count"]] as never}
        id="duna-discovery-points"
        style={{
          circleColor: [
            "match",
            ["get", "entityType"],
            "venue",
            entityColors.venue,
            "coach",
            entityColors.coach,
            "organization",
            entityColors.organization,
            "match",
            entityColors.match,
            "pro-tour",
            entityColors["pro-tour"],
            entityColors.event,
          ] as never,
          circleRadius: [
            "case",
            ["==", ["get", "entityType"], "pro-tour"],
            8,
            7,
          ] as never,
          circleStrokeColor: token.surface1,
          circleStrokeWidth: 2,
        }}
      />
    </Mapbox.ShapeSource>
  );
}

function MapFallback({
  children,
  styles,
}: {
  readonly children?: ReactNode;
  readonly styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.fallback}>
      <View style={styles.fallbackGlobe}>
        <View style={styles.fallbackArc} />
      </View>
      <Text style={styles.fallbackTitle}>The map is almost ready.</Text>
      <Text style={styles.fallbackBody}>
        Every result remains available in the list.
      </Text>
      {children}
    </View>
  );
}

function startingCamera(
  items: readonly DiscoveryMapItem[],
  origin?: DiscoveryCoordinates,
  radiusMiles?: number,
) {
  if (origin) {
    const zoomLevel =
      radiusMiles === undefined
        ? 2.2
        : radiusMiles <= 10
          ? 9.4
          : radiusMiles <= 30
            ? 8
            : radiusMiles <= 60
              ? 7
              : radiusMiles <= 120
                ? 6
                : radiusMiles <= 240
                  ? 5
                  : radiusMiles <= 480
                    ? 4
                    : 2.6;
    return {
      centerCoordinate: [origin.longitude, origin.latitude] as [number, number],
      zoomLevel,
    };
  }
  const mapped = items.filter(
    (item) => item.latitude !== undefined && item.longitude !== undefined,
  );
  if (mapped.length === 0) {
    return { centerCoordinate: [-25, 18] as [number, number], zoomLevel: 1.45 };
  }
  const centerCoordinate: [number, number] = [
    mapped.reduce((sum, item) => sum + item.longitude!, 0) / mapped.length,
    mapped.reduce((sum, item) => sum + item.latitude!, 0) / mapped.length,
  ];
  return {
    centerCoordinate,
    zoomLevel: mapped.length > 4 ? 1.8 : mapped.length > 1 ? 4.2 : 9,
  };
}

function mappedCoordinates(
  items: readonly DiscoveryMapItem[],
  origin?: DiscoveryCoordinates,
): readonly [number, number][] {
  return [
    ...(origin
      ? [[origin.longitude, origin.latitude] as [number, number]]
      : []),
    ...items.flatMap((item) =>
      item.latitude !== undefined && item.longitude !== undefined
        ? [[item.longitude, item.latitude] as [number, number]]
        : [],
    ),
  ];
}

export function DiscoveryMapPreview({
  items,
  onOpen,
  theme = "light",
}: {
  readonly items: readonly DiscoveryMapItem[];
  readonly onOpen: () => void;
  readonly theme?: DunaTheme;
}) {
  const token = resolveDunaTokens(theme, "editorial");
  const styles = useMemo(() => createStyles(token), [token]);
  const mapToken = useMapboxToken();
  const mappedItems = items.filter(
    (item) => item.latitude !== undefined && item.longitude !== undefined,
  );
  const camera = startingCamera(mappedItems);
  return (
    <Pressable
      accessibilityLabel="Open the full discovery map"
      accessibilityRole="button"
      onPress={onOpen}
      style={styles.preview}
    >
      {mapToken ? (
        <Mapbox.MapView
          attributionEnabled={false}
          compassEnabled={false}
          logoEnabled={false}
          pitchEnabled={false}
          projection="globe"
          rotateEnabled={false}
          scaleBarEnabled={false}
          scrollEnabled={false}
          style={StyleSheet.absoluteFill}
          styleURL="mapbox://styles/mapbox/standard"
          zoomEnabled={false}
        >
          <Mapbox.Camera defaultSettings={camera} />
          <MapLayers items={mappedItems} token={token} />
        </Mapbox.MapView>
      ) : (
        <MapFallback styles={styles} />
      )}
      <View style={styles.previewShade} />
      <View style={styles.previewLabel}>
        <Text style={styles.previewEyebrow}>MAP DISCOVERY</Text>
        <Text style={styles.previewTitle}>
          {mappedItems.length} places to play
        </Text>
        <Text style={styles.previewAction}>Open map ↗</Text>
      </View>
      <View style={styles.previewLegend}>
        {filterOptions.slice(1, 5).map((option) => (
          <View key={option.value} style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                {
                  backgroundColor:
                    entityColors[option.value as DiscoveryEntityType],
                },
              ]}
            />
            <Text style={styles.legendText}>{option.label}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function formatResultDate(item: DiscoveryMapItem) {
  if (!item.startsAt) return undefined;
  const date = new Date(item.startsAt);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function resultTypeLabel(item: DiscoveryMapItem) {
  if (item.entityType === "pro-tour") return "PRO TOUR";
  if (item.entityType === "venue") return "COURT RENTAL";
  if (item.entityType === "coach") return "TRAINING";
  if (item.entityType === "organization") return "CLUB";
  if (item.entityType === "match") return "MATCH";
  if (["open-play", "pickup", "hosted-match"].includes(item.kind)) {
    return "OPEN MATCH";
  }
  return item.kind.replaceAll("-", " ").toUpperCase();
}

function resultAction(item: DiscoveryMapItem) {
  if (item.entityType === "venue") return "See open times";
  if (item.entityType === "coach") return "View coach";
  if (item.entityType === "organization") return "Open club";
  if (item.entityType === "match")
    return item.live ? "Open live match" : "View match";
  if (item.entityType === "pro-tour") return "Open Pro Tour";
  if (["open-play", "pickup", "hosted-match"].includes(item.kind)) {
    return item.spotsRemaining ? "Join open match" : "View match";
  }
  return item.kind === "tournament" ? "View tournament" : "View event";
}

function resultFacts(item: DiscoveryMapItem) {
  const facts: string[] = [];
  if (item.live) facts.push("● LIVE");
  if (item.entityType === "venue" && item.openNow !== undefined) {
    facts.push(item.openNow ? "Open now" : "Closed now");
  }
  if (item.courtCount) {
    facts.push(
      `${item.courtCount} ${item.courtCount === 1 ? "court" : "courts"}`,
    );
  }
  if (item.spotsRemaining !== undefined && item.spotsRemaining > 0) {
    facts.push(
      `${item.spotsRemaining} ${item.spotsRemaining === 1 ? "spot" : "spots"} open`,
    );
  }
  if (item.level) facts.push(`Level ${item.level}`);
  const date = formatResultDate(item);
  if (date) facts.push(date);
  if (item.price)
    facts.push(formatMoney(item.price.amountMinor, item.price.currency));
  const ignoredTags = new Set([
    item.entityType,
    item.kind.toLowerCase(),
    "event",
    "match",
    "organization",
    "pro tour",
    "venue",
  ]);
  item.tags
    .filter((tag) => {
      const normalized = tag.trim().toLowerCase();
      return (
        normalized.length > 0 &&
        normalized.length <= 28 &&
        !ignoredTags.has(normalized) &&
        !item.title.toLowerCase().includes(normalized) &&
        !item.subtitle.toLowerCase().includes(normalized)
      );
    })
    .slice(0, 2)
    .forEach((tag) => facts.push(tag));
  return Array.from(new Set(facts)).slice(0, 5);
}

function ActiveResultVideo({
  fit,
  posterUrl,
  styles,
  videoUrl,
}: {
  readonly fit: "cover" | "contain";
  readonly posterUrl?: string;
  readonly styles: ReturnType<typeof createStyles>;
  readonly videoUrl: string;
}) {
  const [ready, setReady] = useState(false);
  const player = useVideoPlayer(videoUrl, (nextPlayer) => {
    nextPlayer.loop = true;
    nextPlayer.muted = true;
    nextPlayer.play();
  });

  useEffect(() => {
    player.play();
    return () => player.pause();
  }, [player]);

  return (
    <View pointerEvents="none" style={styles.resultVideoLayer}>
      <VideoView
        allowsVideoFrameAnalysis={false}
        contentFit={fit}
        nativeControls={false}
        onFirstFrameRender={() => setReady(true)}
        player={player}
        style={styles.resultVideo}
        useExoShutter={false}
      />
      {!ready && posterUrl ? (
        <Image
          resizeMode={fit}
          source={{ uri: posterUrl }}
          style={styles.resultImage}
        />
      ) : null}
    </View>
  );
}

function NativeResultCard({
  item,
  measurementSystem,
  onPress,
  onVideoToggle,
  styles,
  travel,
  videoPlaying,
}: {
  readonly item: DiscoveryMapItem;
  readonly measurementSystem: MeasurementSystem;
  readonly onPress: (item: DiscoveryMapItem) => void;
  readonly onVideoToggle: (itemId: string, playing: boolean) => void;
  readonly styles: ReturnType<typeof createStyles>;
  readonly travel?: TravelEstimate;
  readonly videoPlaying: boolean;
}) {
  const facts = resultFacts(item);
  const imageUrl = resolveDiscoveryMediaUrl(item.imageUrl, dunaWebUrl);
  const videoUrl = resolveDiscoveryMediaUrl(item.videoUrl, dunaWebUrl);
  const fit = item.imageFit === "contain" ? "contain" : "cover";
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [imageUrl, item.id]);
  return (
    <Pressable
      accessibilityLabel={`${item.title}. ${resultAction(item)}`}
      accessibilityRole="button"
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.resultCard,
        pressed && styles.cardPressed,
      ]}
    >
      {imageUrl || videoUrl ? (
        <View style={styles.resultMedia}>
          <View
            style={[
              styles.resultMediaFallback,
              { borderTopColor: entityColors[item.entityType] },
            ]}
          >
            <Text style={styles.resultMediaFallbackEyebrow}>
              {resultTypeLabel(item)}
            </Text>
            <Text numberOfLines={2} style={styles.resultMediaFallbackTitle}>
              {item.title}
            </Text>
          </View>
          {imageUrl && !imageFailed ? (
            <Image
              onError={() => setImageFailed(true)}
              resizeMode={fit}
              source={{ uri: imageUrl }}
              style={styles.resultImage}
            />
          ) : null}
          {videoUrl && videoPlaying ? (
            <ActiveResultVideo
              fit={fit}
              posterUrl={imageFailed ? undefined : imageUrl}
              styles={styles}
              videoUrl={videoUrl}
            />
          ) : null}
          {videoUrl ? (
            <Pressable
              accessibilityLabel={
                videoPlaying ? "Pause hero video" : "Play hero video"
              }
              accessibilityRole="button"
              onPress={(event) => {
                event.stopPropagation();
                onVideoToggle(item.id, !videoPlaying);
              }}
              style={styles.resultVideoControl}
            >
              <Text style={styles.resultVideoControlIcon}>
                {videoPlaying ? "Ⅱ" : "▶"}
              </Text>
              <Text style={styles.resultVideoControlText}>
                {videoPlaying ? "Pause" : "Video"}
              </Text>
            </Pressable>
          ) : null}
          {item.live ? (
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>● LIVE</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View
          style={[
            styles.resultPlaceholder,
            { borderTopColor: entityColors[item.entityType] },
          ]}
        >
          <Text style={styles.placeholderEyebrow}>{resultTypeLabel(item)}</Text>
          <Text numberOfLines={2} style={styles.placeholderTitle}>
            {item.title}
          </Text>
        </View>
      )}
      <View style={styles.resultBody}>
        <View style={styles.resultTypeRow}>
          <View
            style={[
              styles.resultTypeDot,
              { backgroundColor: entityColors[item.entityType] },
            ]}
          />
          <Text style={styles.resultType}>{resultTypeLabel(item)}</Text>
        </View>
        <Text numberOfLines={2} style={styles.resultTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={2} style={styles.resultSubtitle}>
          {item.subtitle}
        </Text>
        {travel ? (
          <Text style={styles.travelSummary}>
            {formatDrivingDistance(travel.distanceMeters, measurementSystem)}{" "}
            away · {formatDrivingDuration(travel.durationSeconds)} drive now
          </Text>
        ) : null}
        {facts.length > 0 ? (
          <View style={styles.factRow}>
            {facts.map((fact) => (
              <View key={fact} style={styles.factChip}>
                <Text style={styles.factText}>{fact}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.resultFooter}>
          <Text style={styles.resultAction}>{resultAction(item)}</Text>
          <Text style={styles.resultArrow}>→</Text>
        </View>
      </View>
    </Pressable>
  );
}

function closestSnap(
  value: number,
  positions: Record<SheetPosition, number>,
): SheetPosition {
  return (Object.entries(positions) as [SheetPosition, number][]).reduce(
    (closest, candidate) =>
      Math.abs(candidate[1] - value) < Math.abs(closest[1] - value)
        ? candidate
        : closest,
  )[0];
}

export function DiscoveryMapModal({
  initialFilter = "all",
  items,
  measurementSystem = "imperial",
  onClose,
  onCreateMatch,
  onSearch,
  onSelect,
  origin,
  radiusMiles,
  resultSummary,
  searchLabel,
  theme = "light",
  visible,
}: {
  readonly initialFilter?: DiscoveryMapFilter;
  readonly items: readonly DiscoveryMapItem[];
  readonly measurementSystem?: MeasurementSystem;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onCreateMatch?: () => void;
  readonly onSearch: () => void;
  readonly onSelect: (item: DiscoveryMapItem) => void;
  readonly origin?: DiscoveryCoordinates;
  readonly radiusMiles?: number;
  readonly resultSummary?: string;
  readonly searchLabel?: string;
  readonly theme?: DunaTheme;
}) {
  const token = resolveDunaTokens(theme, "editorial");
  const styles = useMemo(() => createStyles(token), [token]);
  const mapToken = useMapboxToken(visible);
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const cameraRef = useRef<React.ElementRef<typeof Mapbox.Camera>>(null);
  const onSelectRef = useRef(onSelect);
  const firstIdle = useRef(true);
  const listScrollY = useRef(0);
  const [filter, setFilter] = useState<DiscoveryMapFilter>(initialFilter);
  const [bounds, setBounds] = useState<MapBounds>();
  const [areaIds, setAreaIds] = useState<readonly string[]>();
  const [mapMoved, setMapMoved] = useState(false);
  const [zoom, setZoom] = useState(1.45);
  const [showLocation, setShowLocation] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [playingVideoId, setPlayingVideoId] = useState<string>();
  const [travelEstimates, setTravelEstimates] = useState<
    Readonly<Record<string, TravelEstimate>>
  >({});
  const [sheetPosition, setSheetPosition] = useState<SheetPosition>("split");
  const positions = useMemo(
    () => ({
      list: Math.max(92, height * 0.105),
      split: Math.max(280, height * 0.47),
      map: Math.max(420, height - 132),
    }),
    [height],
  );
  const sheetY = useRef(new Animated.Value(positions.split)).current;
  const sheetValue = useRef(positions.split);
  const gestureStart = useRef(positions.split);
  const resultTransitionRef = useRef<
    | ReturnType<typeof createDeferredModalTransition<DiscoveryMapItem>>
    | undefined
  >(undefined);
  if (!resultTransitionRef.current) {
    resultTransitionRef.current =
      createDeferredModalTransition<DiscoveryMapItem>({
        onComplete: (item) => onSelectRef.current(item),
      });
  }
  const resultTransition = resultTransitionRef.current;

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(
    () => () => {
      resultTransition.cancel();
    },
    [resultTransition],
  );

  const filtered = useMemo(
    () => items.filter((item) => discoveryItemMatchesFilter(item, filter)),
    [filter, items],
  );
  const listItems = useMemo(() => {
    const inArea = areaIds
      ? filtered.filter((item) => areaIds.includes(item.id))
      : filtered;
    const selected = inArea.find((item) => item.id === selectedId);
    return selected
      ? [selected, ...inArea.filter((item) => item.id !== selected.id)]
      : inArea;
  }, [areaIds, filtered, selectedId]);
  const initialCamera = useMemo(
    () => startingCamera(items, origin, radiusMiles),
    [items, origin, radiusMiles],
  );

  useEffect(() => {
    if (!visible || !mapToken) return;
    const coordinates = mappedCoordinates(filtered, origin);
    firstIdle.current = true;
    setShowLocation(Boolean(origin));
    if (coordinates.length === 0) {
      cameraRef.current?.setCamera({
        ...initialCamera,
        animationDuration: 0,
      });
      return;
    }
    if (coordinates.length === 1) {
      cameraRef.current?.setCamera({
        animationDuration: 0,
        centerCoordinate: coordinates[0],
        zoomLevel: 10,
      });
      return;
    }
    const longitudes = coordinates.map(([longitude]) => longitude);
    const latitudes = coordinates.map(([, latitude]) => latitude);
    cameraRef.current?.fitBounds(
      [Math.max(...longitudes), Math.max(...latitudes)],
      [Math.min(...longitudes), Math.min(...latitudes)],
      [150, 38, Math.max(260, height * 0.55), 38],
      0,
    );
  }, [filtered, height, initialCamera, mapToken, origin, visible]);

  useEffect(() => {
    if (!visible || !mapToken || !origin) {
      setTravelEstimates({});
      return;
    }
    const request = buildDrivingMatrixRequest(origin, listItems, mapToken);
    if (!request) {
      setTravelEstimates({});
      return;
    }
    const controller = new AbortController();
    void fetch(request.url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return {};
        return parseDrivingMatrix(
          request.destinationIds,
          (await response.json()) as unknown,
        );
      })
      .then(setTravelEstimates)
      .catch((error: unknown) => {
        if (!(error instanceof Error && error.name === "AbortError")) {
          setTravelEstimates({});
        }
      });
    return () => controller.abort();
  }, [listItems, mapToken, origin, visible]);

  const snapTo = (position: SheetPosition) => {
    setSheetPosition(position);
    Animated.timing(sheetY, {
      duration: reducedMotion ? 0 : motion.standard,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      toValue: positions[position],
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    const listener = sheetY.addListener(({ value }) => {
      sheetValue.current = value;
    });
    return () => sheetY.removeListener(listener);
  }, [sheetY]);

  useEffect(() => {
    if (!visible) return;
    sheetY.setValue(positions.split);
    sheetValue.current = positions.split;
    setSheetPosition("split");
    setAreaIds(undefined);
    setMapMoved(false);
    setSelectedId(undefined);
    setFilter(initialFilter);
    firstIdle.current = true;
  }, [initialFilter, positions.split, sheetY, visible]);

  useEffect(() => {
    setAreaIds(undefined);
    setMapMoved(false);
  }, [filter]);

  useEffect(() => {
    if (!visible || sheetPosition === "map") setPlayingVideoId(undefined);
  }, [sheetPosition, visible]);

  useEffect(() => {
    if (
      playingVideoId &&
      !listItems.some((item) => item.id === playingVideoId)
    ) {
      setPlayingVideoId(undefined);
    }
  }, [listItems, playingVideoId]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) => {
          if (
            Math.abs(gesture.dy) < 8 ||
            Math.abs(gesture.dy) < Math.abs(gesture.dx)
          ) {
            return false;
          }
          if (sheetPosition === "list") {
            return gesture.dy > 0 && listScrollY.current <= 1;
          }
          return true;
        },
        onPanResponderGrant: () => {
          gestureStart.current = sheetValue.current;
        },
        onPanResponderMove: (_, gesture) => {
          sheetY.setValue(
            Math.max(
              positions.list,
              Math.min(positions.map, gestureStart.current + gesture.dy),
            ),
          );
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.vy < -0.35) {
            snapTo(
              sheetValue.current > positions.split + 20 ? "split" : "list",
            );
            return;
          }
          if (gesture.vy > 0.35) {
            snapTo(sheetValue.current < positions.split - 20 ? "split" : "map");
            return;
          }
          snapTo(closestSnap(sheetValue.current, positions));
        },
      }),
    [positions, sheetPosition],
  );

  const onMapIdle = (state: MapState) => {
    setBounds(state.properties.bounds);
    setZoom(state.properties.zoom);
    if (firstIdle.current) {
      firstIdle.current = false;
      return;
    }
    setMapMoved(true);
  };

  const handleMapPress = (event: {
    readonly features: readonly GeoJSON.Feature[];
  }) => {
    const feature = event.features[0] as
      | GeoJSON.Feature<
          GeoJSON.Point,
          { id?: string; cluster?: boolean; point_count?: number }
        >
      | undefined;
    if (!feature) return;
    if (feature.properties?.cluster || feature.properties?.point_count) {
      cameraRef.current?.setCamera({
        animationDuration: reducedMotion ? 0 : motion.zone,
        animationMode: "easeTo",
        centerCoordinate: feature.geometry.coordinates,
        zoomLevel: Math.min(zoom + 2.4, 16),
      });
      return;
    }
    if (feature.properties?.id) {
      setSelectedId(feature.properties.id);
      snapTo("split");
    }
  };

  const searchArea = () => {
    if (!bounds) return;
    setAreaIds(
      filtered
        .filter((item) => itemInBounds(item, bounds))
        .map((item) => item.id),
    );
    setMapMoved(false);
    snapTo("split");
  };

  const locate = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return;
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    setShowLocation(true);
    cameraRef.current?.setCamera({
      animationDuration: reducedMotion ? 0 : motion.zone,
      animationMode: "flyTo",
      centerCoordinate: [position.coords.longitude, position.coords.latitude],
      zoomLevel: 10,
    });
  };

  const cycleSheet = () => {
    if (sheetPosition === "map") snapTo("split");
    else if (sheetPosition === "split") snapTo("list");
    else snapTo("map");
  };

  const openResult = (item: DiscoveryMapItem) => {
    setPlayingVideoId(undefined);
    resultTransition.schedule(item);
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      onDismiss={resultTransition.complete}
      onRequestClose={onClose}
      visible={visible}
    >
      <View style={styles.fullMap}>
        {mapToken ? (
          <Mapbox.MapView
            attributionEnabled
            compassEnabled={false}
            logoEnabled
            onMapIdle={onMapIdle}
            projection="globe"
            scaleBarEnabled={false}
            style={StyleSheet.absoluteFill}
            styleURL="mapbox://styles/mapbox/standard"
          >
            <Mapbox.Camera
              defaultSettings={initialCamera}
              maxZoomLevel={18}
              minZoomLevel={0.7}
              ref={cameraRef}
            />
            {showLocation ? (
              <Mapbox.LocationPuck pulsing={{ isEnabled: true }} />
            ) : null}
            <MapLayers
              items={filtered}
              onPress={handleMapPress}
              token={token}
            />
          </Mapbox.MapView>
        ) : (
          <MapFallback styles={styles} />
        )}
        <View
          pointerEvents="box-none"
          style={[
            styles.mapChrome,
            { paddingTop: Math.max(insets.top, spacing[3]) },
          ]}
        >
          <View style={styles.mapHeader}>
            <Pressable
              accessibilityLabel="Close map"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.chromeButton}
            >
              <Text style={styles.chromeButtonText}>‹</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Edit search"
              accessibilityRole="button"
              onPress={onSearch}
              style={styles.mapSearchButton}
            >
              <Text style={styles.mapSearchIcon}>⌕</Text>
              <View style={styles.mapSearchCopy}>
                <Text numberOfLines={1} style={styles.mapSearchText}>
                  {searchLabel ?? "Search Duna"}
                </Text>
                {resultSummary ? (
                  <Text numberOfLines={1} style={styles.mapSearchMeta}>
                    {resultSummary}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            <Pressable
              accessibilityLabel="Show my location"
              accessibilityRole="button"
              onPress={() => void locate()}
              style={styles.chromeButton}
            >
              <Text style={styles.locateIcon}>◎</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.mapFilterContent}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.mapFilterScroll}
          >
            {filterOptions.map((option) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: filter === option.value }}
                hitSlop={5}
                key={option.value}
                onPress={() => setFilter(option.value)}
                style={[
                  styles.mapFilter,
                  filter === option.value && styles.mapFilterActive,
                ]}
              >
                <Text
                  style={[
                    styles.mapFilterText,
                    filter === option.value && styles.mapFilterTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {mapMoved ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={5}
              onPress={searchArea}
              style={styles.searchAreaButton}
            >
              <Text style={styles.searchAreaText}>⌕ Search here</Text>
            </Pressable>
          ) : null}
        </View>
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.bottomSheet,
            { height, transform: [{ translateY: sheetY }] },
          ]}
        >
          <Pressable
            accessibilityLabel={`Results sheet, ${sheetPosition} view. Change view.`}
            accessibilityRole="button"
            onPress={cycleSheet}
            style={styles.sheetHandleArea}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeadingRow}>
              <View style={styles.sheetHeadingCopy}>
                <Text style={styles.sheetTitle}>
                  {listItems.length}{" "}
                  {listItems.length === 1 ? "place" : "places"} to play
                </Text>
                <Text style={styles.sheetSubtitle}>
                  {sheetPosition === "map"
                    ? "Swipe up for cards"
                    : sheetPosition === "list"
                      ? "Swipe down for the map"
                      : "Swipe up for cards · down for map"}
                </Text>
              </View>
            </View>
          </Pressable>
          <ScrollView
            contentContainerStyle={styles.sheetResults}
            onScroll={(event) => {
              listScrollY.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
          >
            {listItems.slice(0, 60).map((item) => (
              <NativeResultCard
                item={item}
                key={item.id}
                measurementSystem={measurementSystem}
                onPress={openResult}
                onVideoToggle={(itemId, playing) =>
                  setPlayingVideoId(playing ? itemId : undefined)
                }
                styles={styles}
                travel={travelEstimates[item.id]}
                videoPlaying={playingVideoId === item.id}
              />
            ))}
            {listItems.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No play in this map view.</Text>
                <Text style={styles.emptyText}>
                  Move the map, clear a map filter, or edit your search.
                </Text>
                <Pressable onPress={onSearch} style={styles.emptyButton}>
                  <Text style={styles.emptyButtonText}>Edit search</Text>
                </Pressable>
              </View>
            ) : null}
            {filter === "match" && onCreateMatch ? (
              <View style={styles.createMatchCard}>
                <View style={styles.createMatchMark}>
                  <Text style={styles.createMatchMarkText}>＋</Text>
                </View>
                <Text style={styles.createMatchEyebrow}>CREATE YOUR OWN</Text>
                <Text style={styles.createMatchTitle}>
                  Your court. Your people.
                </Text>
                <Text style={styles.createMatchBody}>
                  Pick a place and invite your crew, or leave spots open for
                  nearby players.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={onCreateMatch}
                  style={styles.createMatchButton}
                >
                  <Text style={styles.createMatchButtonText}>
                    Create your own match
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.sheetEndSpace} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function createStyles(token: ResolvedDunaTokens) {
  return StyleSheet.create({
    fullMap: { backgroundColor: environmentalColors.marine900, flex: 1 },
    fallback: {
      alignItems: "center",
      backgroundColor: environmentalColors.marine900,
      bottom: 0,
      justifyContent: "center",
      left: 0,
      padding: spacing[6],
      position: "absolute",
      right: 0,
      top: 0,
    },
    fallbackGlobe: {
      backgroundColor: environmentalColors.marine400,
      borderColor: token.gold,
      borderRadius: 42,
      borderWidth: 1,
      height: 84,
      marginBottom: spacing[3],
      overflow: "hidden",
      width: 84,
    },
    fallbackArc: {
      borderColor: token.signal,
      borderRadius: 40,
      borderWidth: 1,
      height: 34,
      position: "absolute",
      top: 22,
      transform: [{ rotate: "15deg" }],
      width: 76,
    },
    fallbackTitle: {
      color: environmentalColors.white,
      fontSize: 15,
      fontWeight: "800",
    },
    fallbackBody: {
      color: environmentalColors.marine200,
      fontSize: 12,
      marginTop: spacing[1],
      textAlign: "center",
    },
    preview: {
      backgroundColor: environmentalColors.marine900,
      borderColor: token.hairline,
      borderRadius: radii.large,
      borderWidth: 1,
      height: 286,
      marginTop: spacing[5],
      overflow: "hidden",
      position: "relative",
    },
    previewShade: {
      backgroundColor: token.scrim,
      bottom: 0,
      left: 0,
      opacity: 0.48,
      position: "absolute",
      right: 0,
      top: 0,
    },
    previewLabel: { left: spacing[5], position: "absolute", top: spacing[5] },
    previewEyebrow: {
      color: environmentalColors.signal,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.2,
    },
    previewTitle: {
      color: environmentalColors.white,
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: -0.8,
      marginTop: spacing[2],
    },
    previewAction: {
      color: environmentalColors.sand300,
      fontSize: 12,
      fontWeight: "900",
      marginTop: spacing[2],
    },
    previewLegend: {
      backgroundColor: token.surface1,
      borderRadius: radii.pill,
      bottom: spacing[4],
      flexDirection: "row",
      gap: spacing[2],
      left: spacing[4],
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[2],
      position: "absolute",
    },
    legendItem: { alignItems: "center", flexDirection: "row", gap: spacing[1] },
    legendDot: { borderRadius: 4, height: 7, width: 7 },
    legendText: { color: token.text2, fontSize: 12, fontWeight: "800" },
    mapChrome: { left: 0, position: "absolute", right: 0, top: 0 },
    mapHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing[2],
      paddingHorizontal: spacing[4],
    },
    chromeButton: {
      alignItems: "center",
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: 24,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    chromeButtonText: { color: token.text1, fontSize: 32, lineHeight: 34 },
    locateIcon: { color: token.text1, fontSize: 22, fontWeight: "800" },
    mapSearchButton: {
      alignItems: "center",
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: 24,
      borderWidth: 1,
      flex: 1,
      flexDirection: "row",
      gap: spacing[2],
      minHeight: 48,
      paddingHorizontal: spacing[4],
    },
    mapSearchIcon: { color: token.text1, fontSize: 21 },
    mapSearchCopy: { flex: 1 },
    mapSearchText: { color: token.text1, fontSize: 12, fontWeight: "800" },
    mapSearchMeta: { color: token.text3, fontSize: 12, marginTop: 2 },
    mapFilterScroll: { marginTop: spacing[3] },
    mapFilterContent: {
      gap: spacing[2],
      paddingHorizontal: spacing[4],
      paddingRight: spacing[8],
    },
    mapFilter: {
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: radii.pill,
      borderWidth: 1,
      minHeight: 38,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    mapFilterActive: {
      backgroundColor: token.buttonPrimaryBackground,
      borderColor: token.buttonPrimaryBackground,
    },
    mapFilterText: { color: token.text2, fontSize: 12, fontWeight: "700" },
    mapFilterTextActive: {
      color: token.buttonPrimaryForeground,
      fontWeight: "900",
    },
    searchAreaButton: {
      alignSelf: "center",
      backgroundColor: token.surface1,
      borderColor: token.hairlineStrong,
      borderRadius: radii.pill,
      borderWidth: 1,
      elevation: 4,
      marginTop: spacing[3],
      minHeight: 40,
      paddingHorizontal: spacing[4],
      paddingVertical: 10,
      shadowColor: environmentalColors.ink,
      shadowOffset: { height: 3, width: 0 },
      shadowOpacity: 0.16,
      shadowRadius: 10,
    },
    searchAreaText: {
      color: token.text1,
      fontSize: 12,
      fontWeight: "900",
    },
    bottomSheet: {
      backgroundColor: token.ground,
      borderTopLeftRadius: radii.sheet,
      borderTopRightRadius: radii.sheet,
      bottom: 0,
      left: 0,
      overflow: "hidden",
      position: "absolute",
      right: 0,
      shadowColor: environmentalColors.ink,
      shadowOffset: { height: -8, width: 0 },
      shadowOpacity: 0.18,
      shadowRadius: 24,
    },
    sheetHandleArea: {
      minHeight: 104,
      paddingHorizontal: spacing[5],
      paddingTop: spacing[2],
    },
    sheetHandle: {
      alignSelf: "center",
      backgroundColor: token.hairlineStrong,
      borderRadius: radii.pill,
      height: 5,
      marginBottom: spacing[4],
      width: 48,
    },
    sheetHeadingRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    sheetHeadingCopy: { flex: 1 },
    sheetTitle: {
      color: token.text1,
      fontSize: 21,
      fontWeight: "900",
      letterSpacing: -0.7,
    },
    sheetSubtitle: { color: token.text3, fontSize: 12, marginTop: spacing[1] },
    sheetResults: {
      gap: spacing[4],
      padding: spacing[4],
      paddingTop: spacing[2],
    },
    travelSummary: {
      color: token.text3,
      fontSize: 12,
      lineHeight: 17,
      marginTop: spacing[2],
    },
    sheetEndSpace: { height: 160 },
    resultCard: {
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: radii.large,
      borderWidth: 1,
      overflow: "hidden",
    },
    cardPressed: { opacity: 0.78 },
    resultMedia: {
      backgroundColor: token.surface2,
      height: 168,
      overflow: "hidden",
      position: "relative",
    },
    resultMediaFallback: {
      backgroundColor: token.surface2,
      borderTopWidth: 6,
      bottom: 0,
      justifyContent: "flex-end",
      left: 0,
      padding: spacing[4],
      position: "absolute",
      right: 0,
      top: 0,
    },
    resultMediaFallbackEyebrow: {
      color: token.text3,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    resultMediaFallbackTitle: {
      color: token.text1,
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: -0.9,
      lineHeight: 27,
      marginTop: spacing[2],
    },
    resultImage: {
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    resultVideoLayer: {
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    resultVideo: {
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    resultVideoControl: {
      alignItems: "center",
      backgroundColor: "rgba(7, 24, 37, 0.82)",
      borderColor: "rgba(255, 255, 255, 0.34)",
      borderRadius: radii.pill,
      borderWidth: 1,
      bottom: spacing[3],
      flexDirection: "row",
      gap: spacing[2],
      minHeight: 44,
      paddingHorizontal: spacing[3],
      position: "absolute",
      right: spacing[3],
      zIndex: 4,
    },
    resultVideoControlIcon: {
      color: environmentalColors.white,
      fontSize: 12,
      fontWeight: "900",
    },
    resultVideoControlText: {
      color: environmentalColors.white,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.65,
      textTransform: "uppercase",
    },
    liveBadge: {
      backgroundColor: token.flare,
      borderRadius: radii.pill,
      left: spacing[3],
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[2],
      position: "absolute",
      top: spacing[3],
      zIndex: 4,
    },
    liveBadgeText: {
      color: token.textOnAccent,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    resultPlaceholder: {
      backgroundColor: token.surface2,
      borderTopWidth: 6,
      height: 144,
      justifyContent: "flex-end",
      padding: spacing[4],
    },
    placeholderEyebrow: {
      color: token.text3,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    placeholderTitle: {
      color: token.text1,
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: -0.9,
      lineHeight: 27,
      marginTop: spacing[2],
    },
    resultBody: { padding: spacing[4] },
    resultTypeRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing[2],
    },
    resultTypeDot: { borderRadius: 4, height: 7, width: 7 },
    resultType: {
      color: token.text3,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1,
    },
    resultTitle: {
      color: token.text1,
      fontSize: 21,
      fontWeight: "900",
      letterSpacing: -0.7,
      lineHeight: 25,
      marginTop: spacing[2],
    },
    resultSubtitle: {
      color: token.text2,
      fontSize: 12,
      lineHeight: 18,
      marginTop: spacing[1],
    },
    factRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing[2],
      marginTop: spacing[3],
    },
    factChip: {
      backgroundColor: token.surface2,
      borderRadius: radii.pill,
      minHeight: 30,
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[2],
    },
    factText: { color: token.text2, fontFamily: "Archivo-Chip", fontSize: 12 },
    resultFooter: {
      alignItems: "center",
      borderTopColor: token.hairline,
      borderTopWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: spacing[4],
      paddingTop: spacing[3],
    },
    resultAction: { color: token.flareText, fontSize: 12, fontWeight: "900" },
    resultArrow: { color: token.flareText, fontSize: 17 },
    emptyCard: {
      alignItems: "center",
      backgroundColor: token.surface1,
      borderRadius: radii.large,
      padding: spacing[8],
    },
    emptyTitle: { color: token.text1, fontSize: 18, fontWeight: "900" },
    emptyText: {
      color: token.text3,
      fontSize: 12,
      lineHeight: 18,
      marginTop: spacing[2],
      textAlign: "center",
    },
    emptyButton: {
      borderColor: token.buttonGhostBorder,
      borderRadius: radii.pill,
      borderWidth: 1,
      marginTop: spacing[4],
      minHeight: 48,
      paddingHorizontal: spacing[5],
      paddingVertical: spacing[3],
    },
    emptyButtonText: { color: token.text1, fontSize: 12, fontWeight: "800" },
    createMatchCard: {
      alignItems: "center",
      backgroundColor: token.groundWarm,
      borderColor: token.hairlineStrong,
      borderRadius: radii.large,
      borderWidth: 1,
      marginTop: spacing[3],
      paddingHorizontal: spacing[5],
      paddingVertical: spacing[6],
    },
    createMatchMark: {
      alignItems: "center",
      backgroundColor: token.surface2,
      borderRadius: 24,
      height: 48,
      justifyContent: "center",
      marginBottom: spacing[3],
      width: 48,
    },
    createMatchMarkText: {
      color: environmentalColors.marine900,
      fontSize: 25,
      fontWeight: "500",
    },
    createMatchEyebrow: {
      color: environmentalColors.marine900,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.4,
    },
    createMatchTitle: {
      color: environmentalColors.ink,
      fontSize: 22,
      fontWeight: "900",
      marginTop: spacing[2],
      textAlign: "center",
    },
    createMatchBody: {
      color: token.text2,
      fontSize: 13,
      lineHeight: 19,
      marginTop: spacing[2],
      maxWidth: 310,
      textAlign: "center",
    },
    createMatchButton: {
      backgroundColor: environmentalColors.marine900,
      borderRadius: radii.pill,
      marginTop: spacing[4],
      paddingHorizontal: spacing[5],
      paddingVertical: spacing[3],
    },
    createMatchButtonText: {
      color: environmentalColors.white,
      fontSize: 13,
      fontWeight: "900",
    },
  });
}
