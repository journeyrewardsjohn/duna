import type { DiscoveryEntityType, DiscoveryMapItem } from "@duna/api";
import Mapbox, { type MapState } from "@rnmapbox/maps";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  FellixText as Text,
  FellixTextInput as TextInput,
} from "./fellix-text";
import { dunaWebUrl } from "./mobile-api";

type DiscoveryFilter = "all" | DiscoveryEntityType;
type MapBounds = MapState["properties"]["bounds"];

const filterOptions: readonly { value: DiscoveryFilter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "organization", label: "Clubs" },
  { value: "venue", label: "Courts" },
  { value: "event", label: "Events" },
  { value: "coach", label: "Coaches" },
  { value: "match", label: "Matches" },
  { value: "pro-tour", label: "Pro tour" },
];

const entityColors: Record<DiscoveryEntityType, string> = {
  event: "#3d6672",
  venue: "#d4b77c",
  coach: "#ec8064",
  organization: "#4e765d",
  match: "#35c8bd",
  "pro-tour": "#f2c46d",
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
}: {
  readonly items: readonly DiscoveryMapItem[];
  readonly onPress?: (event: {
    readonly features: readonly GeoJSON.Feature[];
  }) => void;
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
            "#22343b",
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
          circleStrokeColor: "#ffffff",
          circleStrokeWidth: 2,
        }}
      />
      <Mapbox.SymbolLayer
        filter={["has", "point_count"] as never}
        id="duna-discovery-cluster-count"
        style={{
          textColor: "#0d1114",
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
          circleColor: "rgba(242,196,109,0.2)",
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
          circleStrokeColor: "#ffffff",
          circleStrokeWidth: 2,
        }}
      />
    </Mapbox.ShapeSource>
  );
}

function MapFallback({ children }: { readonly children?: ReactNode }) {
  return (
    <View style={nativeStyles.fallback}>
      <View style={nativeStyles.fallbackGlobe}>
        <View style={nativeStyles.fallbackArc} />
      </View>
      <Text style={nativeStyles.fallbackTitle}>The map is almost ready.</Text>
      <Text style={nativeStyles.fallbackBody}>
        Geocoded places remain available in the discovery list.
      </Text>
      {children}
    </View>
  );
}

export function DiscoveryMapPreview({
  items,
  onOpen,
}: {
  readonly items: readonly DiscoveryMapItem[];
  readonly onOpen: () => void;
}) {
  const token = useMapboxToken();
  const mappedItems = items.filter(
    (item) => item.latitude !== undefined && item.longitude !== undefined,
  );
  const first = mappedItems[0];
  return (
    <Pressable
      accessibilityLabel="Open the full discovery globe"
      onPress={onOpen}
      style={nativeStyles.preview}
    >
      {token ? (
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
          <Mapbox.Camera
            defaultSettings={{
              centerCoordinate:
                first?.longitude !== undefined && first.latitude !== undefined
                  ? [first.longitude, first.latitude]
                  : [-25, 18],
              zoomLevel: mappedItems.length > 3 ? 1.45 : 7.4,
            }}
          />
          <MapLayers items={mappedItems} />
        </Mapbox.MapView>
      ) : (
        <MapFallback />
      )}
      <View style={nativeStyles.previewShade} />
      <View style={nativeStyles.previewLabel}>
        <Text style={nativeStyles.previewEyebrow}>GLOBAL DISCOVERY</Text>
        <Text style={nativeStyles.previewTitle}>
          {mappedItems.length} places on the map
        </Text>
        <Text style={nativeStyles.previewAction}>Open globe ↗</Text>
      </View>
      <View style={nativeStyles.previewLegend}>
        {filterOptions.slice(1).map((option) => (
          <View key={option.value} style={nativeStyles.legendItem}>
            <View
              style={[
                nativeStyles.legendDot,
                {
                  backgroundColor:
                    entityColors[option.value as DiscoveryEntityType],
                },
              ]}
            />
            <Text style={nativeStyles.legendText}>{option.label}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

function NativeResultCard({
  item,
  onPress,
  compact = false,
}: {
  readonly item: DiscoveryMapItem;
  readonly onPress: (item: DiscoveryMapItem) => void;
  readonly compact?: boolean;
}) {
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={[
        nativeStyles.resultCard,
        compact && nativeStyles.resultCardCompact,
      ]}
    >
      {item.imageUrl ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={nativeStyles.resultImage}
        />
      ) : (
        <View
          style={[
            nativeStyles.resultImagePlaceholder,
            { backgroundColor: entityColors[item.entityType] },
          ]}
        >
          <Text style={nativeStyles.resultImageText}>
            {item.entityType === "venue"
              ? "COURT"
              : item.entityType === "organization"
                ? "CLUB"
                : item.entityType === "pro-tour"
                  ? "PRO"
                  : item.entityType.toUpperCase()}
          </Text>
        </View>
      )}
      <View style={nativeStyles.resultBody}>
        <View style={nativeStyles.resultTypeRow}>
          <View
            style={[
              nativeStyles.resultTypeDot,
              { backgroundColor: entityColors[item.entityType] },
            ]}
          />
          <Text style={nativeStyles.resultType}>
            {item.live ? "LIVE · " : ""}
            {item.entityType.replace("-", " ").toUpperCase()}
          </Text>
        </View>
        <Text numberOfLines={1} style={nativeStyles.resultTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={nativeStyles.resultSubtitle}>
          {item.subtitle}
        </Text>
      </View>
      <Text style={nativeStyles.resultArrow}>›</Text>
    </Pressable>
  );
}

export function DiscoveryMapModal({
  items,
  visible,
  onClose,
  onSearch,
  onSelect,
}: {
  readonly items: readonly DiscoveryMapItem[];
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSearch: () => void;
  readonly onSelect: (item: DiscoveryMapItem) => void;
}) {
  const token = useMapboxToken(visible);
  const { height } = useWindowDimensions();
  const cameraRef = useRef<React.ElementRef<typeof Mapbox.Camera>>(null);
  const firstIdle = useRef(true);
  const [filter, setFilter] = useState<DiscoveryFilter>("all");
  const [bounds, setBounds] = useState<MapBounds>();
  const [areaIds, setAreaIds] = useState<readonly string[]>();
  const [mapMoved, setMapMoved] = useState(false);
  const [zoom, setZoom] = useState(1.45);
  const [showLocation, setShowLocation] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const expandedY = Math.max(132, height * 0.24);
  const collapsedY = Math.max(expandedY + 120, height - 154);
  const sheetY = useRef(new Animated.Value(collapsedY)).current;
  const sheetValue = useRef(collapsedY);
  const gestureStart = useRef(collapsedY);

  const filtered = useMemo(
    () =>
      filter === "all"
        ? items
        : items.filter((item) => item.entityType === filter),
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

  const animateSheet = (expanded: boolean) => {
    Animated.spring(sheetY, {
      damping: 24,
      mass: 0.8,
      stiffness: 220,
      toValue: expanded ? expandedY : collapsedY,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    sheetY.setValue(collapsedY);
    const listener = sheetY.addListener(({ value }) => {
      sheetValue.current = value;
    });
    return () => sheetY.removeListener(listener);
  }, [collapsedY, sheetY]);

  useEffect(() => {
    setAreaIds(undefined);
    setMapMoved(false);
  }, [filter]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 5,
        onPanResponderGrant: () => {
          gestureStart.current = sheetValue.current;
        },
        onPanResponderMove: (_, gesture) => {
          sheetY.setValue(
            Math.max(
              expandedY,
              Math.min(collapsedY, gestureStart.current + gesture.dy),
            ),
          );
        },
        onPanResponderRelease: (_, gesture) => {
          const midpoint = (expandedY + collapsedY) / 2;
          animateSheet(
            gesture.vy < -0.25 ||
              (gesture.vy < 0.25 && sheetValue.current < midpoint),
          );
        },
      }),
    [collapsedY, expandedY, sheetY],
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
        animationDuration: 500,
        animationMode: "easeTo",
        centerCoordinate: feature.geometry.coordinates,
        zoomLevel: Math.min(zoom + 2.4, 16),
      });
      return;
    }
    if (feature.properties?.id) {
      setSelectedId(feature.properties.id);
      animateSheet(true);
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
    animateSheet(true);
  };

  const locate = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return;
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    setShowLocation(true);
    cameraRef.current?.setCamera({
      animationDuration: 700,
      animationMode: "flyTo",
      centerCoordinate: [position.coords.longitude, position.coords.latitude],
      zoomLevel: 10,
    });
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <View style={nativeStyles.fullMap}>
        {token ? (
          <Mapbox.MapView
            attributionEnabled
            compassEnabled
            logoEnabled
            onMapIdle={onMapIdle}
            projection="globe"
            scaleBarEnabled={false}
            style={StyleSheet.absoluteFill}
            styleURL="mapbox://styles/mapbox/standard"
          >
            <Mapbox.Camera
              defaultSettings={{ centerCoordinate: [-25, 18], zoomLevel: 1.45 }}
              maxZoomLevel={18}
              minZoomLevel={0.7}
              ref={cameraRef}
            />
            {showLocation ? (
              <Mapbox.LocationPuck pulsing={{ isEnabled: true }} />
            ) : null}
            <MapLayers items={filtered} onPress={handleMapPress} />
          </Mapbox.MapView>
        ) : (
          <MapFallback />
        )}
        <SafeAreaView pointerEvents="box-none" style={nativeStyles.mapChrome}>
          <View style={nativeStyles.mapHeader}>
            <Pressable onPress={onClose} style={nativeStyles.chromeButton}>
              <Text style={nativeStyles.chromeButtonText}>‹</Text>
            </Pressable>
            <Pressable onPress={onSearch} style={nativeStyles.mapSearchButton}>
              <Text style={nativeStyles.mapSearchIcon}>⌕</Text>
              <Text style={nativeStyles.mapSearchText}>Search the world</Text>
            </Pressable>
            <Pressable
              onPress={() => void locate()}
              style={nativeStyles.chromeButton}
            >
              <Text style={nativeStyles.locateIcon}>◎</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={nativeStyles.mapFilterContent}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={nativeStyles.mapFilterScroll}
          >
            {filterOptions.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setFilter(option.value)}
                style={[
                  nativeStyles.mapFilter,
                  filter === option.value && nativeStyles.mapFilterActive,
                ]}
              >
                <Text
                  style={[
                    nativeStyles.mapFilterText,
                    filter === option.value && nativeStyles.mapFilterTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {mapMoved ? (
            <Pressable
              onPress={searchArea}
              style={nativeStyles.searchAreaButton}
            >
              <Text style={nativeStyles.searchAreaText}>⌕ Search here</Text>
            </Pressable>
          ) : null}
        </SafeAreaView>
        <Animated.View
          style={[
            nativeStyles.bottomSheet,
            { height, transform: [{ translateY: sheetY }] },
          ]}
        >
          <View
            {...panResponder.panHandlers}
            style={nativeStyles.sheetHandleArea}
          >
            <View style={nativeStyles.sheetHandle} />
            <View style={nativeStyles.sheetHeadingRow}>
              <View>
                <Text style={nativeStyles.sheetTitle}>
                  {listItems.length} places in view
                </Text>
                <Text style={nativeStyles.sheetSubtitle}>
                  Swipe up for the list
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  animateSheet(sheetValue.current > expandedY + 20)
                }
              >
                <Text style={nativeStyles.sheetArrow}>
                  {sheetValue.current > expandedY + 20 ? "↑" : "↓"}
                </Text>
              </Pressable>
            </View>
          </View>
          <ScrollView
            contentContainerStyle={nativeStyles.sheetResults}
            showsVerticalScrollIndicator={false}
          >
            {listItems.slice(0, 40).map((item) => (
              <NativeResultCard
                compact
                item={item}
                key={item.id}
                onPress={onSelect}
              />
            ))}
            {listItems.length === 0 ? (
              <Text style={nativeStyles.emptyText}>
                Move the map or clear a filter to find more play.
              </Text>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function DiscoverySearchModal({
  items,
  visible,
  onClose,
  onSelect,
}: {
  readonly items: readonly DiscoveryMapItem[];
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSelect: (item: DiscoveryMapItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DiscoveryFilter>("all");
  const [nearMe, setNearMe] = useState(false);
  const [origin, setOrigin] = useState<{
    readonly latitude: number;
    readonly longitude: number;
  }>();
  const normalized = query.trim().toLowerCase();
  const results = items
    .filter((item) => {
      if (filter !== "all" && item.entityType !== filter) return false;
      if (!normalized) return true;
      return [item.title, item.subtitle, item.kind, ...item.tags]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    })
    .sort((left, right) => {
      if (!nearMe || !origin) return 0;
      const distance = (item: DiscoveryMapItem) => {
        if (item.latitude === undefined || item.longitude === undefined) {
          return Number.POSITIVE_INFINITY;
        }
        const radians = (value: number) => (value * Math.PI) / 180;
        const latitudeDelta = radians(item.latitude - origin.latitude);
        const longitudeDelta = radians(item.longitude - origin.longitude);
        const a =
          Math.sin(latitudeDelta / 2) ** 2 +
          Math.cos(radians(origin.latitude)) *
            Math.cos(radians(item.latitude)) *
            Math.sin(longitudeDelta / 2) ** 2;
        return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };
      return distance(left) - distance(right);
    });
  const toggleNearMe = async () => {
    if (nearMe) {
      setNearMe(false);
      return;
    }
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return;
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    setOrigin(location.coords);
    setNearMe(true);
  };
  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <SafeAreaView style={nativeStyles.searchModal}>
        <View style={nativeStyles.searchModalHeader}>
          <Pressable onPress={onClose} style={nativeStyles.searchBack}>
            <Text style={nativeStyles.searchBackText}>‹</Text>
          </Pressable>
          <Text style={nativeStyles.searchModalTitle}>Discover</Text>
        </View>
        <View style={nativeStyles.searchInputWrap}>
          <Text style={nativeStyles.mapSearchIcon}>⌕</Text>
          <TextInput
            autoFocus
            onChangeText={setQuery}
            placeholder="Club, coach, match, event, or city"
            placeholderTextColor="#738295"
            style={nativeStyles.searchInput}
            value={query}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")}>
              <Text style={nativeStyles.searchClear}>×</Text>
            </Pressable>
          ) : null}
        </View>
        <ScrollView
          contentContainerStyle={nativeStyles.searchFilters}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          <Pressable
            onPress={() => void toggleNearMe()}
            style={[
              nativeStyles.searchFilter,
              nearMe && nativeStyles.searchFilterActive,
            ]}
          >
            <Text
              style={[
                nativeStyles.searchFilterText,
                nearMe && nativeStyles.searchFilterTextActive,
              ]}
            >
              ◎ Near me
            </Text>
          </Pressable>
          {filterOptions.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setFilter(option.value)}
              style={[
                nativeStyles.searchFilter,
                filter === option.value && nativeStyles.searchFilterActive,
              ]}
            >
              <Text
                style={[
                  nativeStyles.searchFilterText,
                  filter === option.value &&
                    nativeStyles.searchFilterTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={nativeStyles.searchResultHeading}>
          <Text style={nativeStyles.searchResultEyebrow}>
            {nearMe
              ? "NEAREST TO YOU"
              : normalized
                ? "BEST MATCHES"
                : "SUGGESTED AROUND DUNA"}
          </Text>
          <Text style={nativeStyles.searchResultCount}>{results.length}</Text>
        </View>
        <ScrollView
          contentContainerStyle={nativeStyles.searchResultList}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {results.map((item) => (
            <NativeResultCard item={item} key={item.id} onPress={onSelect} />
          ))}
          {results.length === 0 ? (
            <Text style={nativeStyles.emptyText}>
              No matches yet. Try a city, coach, or broader play type.
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const nativeStyles = StyleSheet.create({
  bottomSheet: {
    backgroundColor: "#f7f5ef",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    bottom: 0,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    shadowColor: "#0d1114",
    shadowOffset: { height: -8, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
  },
  chromeButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 23,
    height: 46,
    justifyContent: "center",
    shadowColor: "#0d1114",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    width: 46,
  },
  chromeButtonText: { color: "#0d1114", fontSize: 31, lineHeight: 33 },
  emptyText: {
    color: "#67768a",
    fontSize: 13,
    lineHeight: 20,
    padding: 24,
    textAlign: "center",
  },
  fallback: {
    alignItems: "center",
    backgroundColor: "#101a20",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    padding: 24,
    position: "absolute",
    right: 0,
    top: 0,
  },
  fallbackArc: {
    borderColor: "rgba(53,200,189,0.8)",
    borderRadius: 40,
    borderWidth: 1,
    height: 34,
    position: "absolute",
    top: 22,
    transform: [{ rotate: "15deg" }],
    width: 76,
  },
  fallbackBody: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
    marginTop: 5,
    textAlign: "center",
  },
  fallbackGlobe: {
    backgroundColor: "#22343b",
    borderColor: "#d4b77c",
    borderRadius: 42,
    borderWidth: 1,
    height: 84,
    marginBottom: 12,
    overflow: "hidden",
    width: 84,
  },
  fallbackTitle: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  fullMap: { backgroundColor: "#101a20", flex: 1 },
  legendDot: { borderRadius: 4, height: 7, width: 7 },
  legendItem: { alignItems: "center", flexDirection: "row", gap: 4 },
  legendText: { color: "#0d1114", fontSize: 10, fontWeight: "800" },
  locateIcon: { color: "#0d1114", fontSize: 22, fontWeight: "800" },
  mapChrome: { left: 0, position: "absolute", right: 0, top: 0 },
  mapFilter: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderColor: "rgba(7,27,45,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  mapFilterActive: { backgroundColor: "#0d1114", borderColor: "#0d1114" },
  mapFilterContent: { gap: 7, paddingHorizontal: 16, paddingRight: 32 },
  mapFilterScroll: { marginTop: 11 },
  mapFilterText: { color: "#526275", fontSize: 10, fontWeight: "700" },
  mapFilterTextActive: { color: "#ffffff", fontWeight: "900" },
  mapHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 15,
  },
  mapSearchButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 23,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    height: 46,
    paddingHorizontal: 16,
    shadowColor: "#0d1114",
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  mapSearchIcon: { color: "#0d1114", fontSize: 22 },
  mapSearchText: { color: "#0d1114", fontSize: 12, fontWeight: "700" },
  preview: {
    backgroundColor: "#101a20",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 22,
    borderWidth: 1,
    height: 292,
    marginTop: 20,
    overflow: "hidden",
    position: "relative",
  },
  previewAction: {
    color: "#d4b77c",
    fontSize: 10,
    fontWeight: "900",
    marginTop: 8,
  },
  previewEyebrow: {
    color: "#f2c46d",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  previewLabel: {
    backgroundColor: "rgba(7,27,45,0.88)",
    borderRadius: 14,
    bottom: 16,
    left: 14,
    padding: 13,
    position: "absolute",
  },
  previewLegend: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    bottom: 16,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 8,
    position: "absolute",
    right: 14,
  },
  previewShade: {
    backgroundColor: "rgba(2,11,20,0.06)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  previewTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 4,
  },
  resultArrow: { color: "#d4b77c", fontSize: 26, marginRight: 12 },
  resultBody: { flex: 1, gap: 3, minWidth: 0 },
  resultCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "rgba(7,27,45,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 92,
    overflow: "hidden",
    padding: 9,
  },
  resultCardCompact: { minHeight: 76 },
  resultImage: {
    borderRadius: 13,
    height: 68,
    width: 68,
  },
  resultImagePlaceholder: {
    alignItems: "center",
    borderRadius: 13,
    height: 68,
    justifyContent: "center",
    width: 68,
  },
  resultImageText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  resultSubtitle: { color: "#6b7b8f", fontSize: 10 },
  resultTitle: { color: "#0d1114", fontSize: 13, fontWeight: "900" },
  resultType: {
    color: "#617185",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  resultTypeDot: { borderRadius: 4, height: 7, width: 7 },
  resultTypeRow: { alignItems: "center", flexDirection: "row", gap: 5 },
  searchAreaButton: {
    alignSelf: "center",
    backgroundColor: "#0d1114",
    borderRadius: 22,
    marginTop: 12,
    paddingHorizontal: 17,
    paddingVertical: 12,
    shadowColor: "#0d1114",
    shadowOpacity: 0.2,
    shadowRadius: 14,
  },
  searchAreaText: { color: "#ffffff", fontSize: 11, fontWeight: "900" },
  searchBack: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  searchBackText: { color: "#0d1114", fontSize: 34, lineHeight: 36 },
  searchClear: { color: "#617185", fontSize: 22, paddingHorizontal: 5 },
  searchFilter: {
    backgroundColor: "#ffffff",
    borderColor: "#d8e0e4",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  searchFilterActive: { backgroundColor: "#0d1114", borderColor: "#0d1114" },
  searchFilterText: { color: "#556579", fontSize: 10, fontWeight: "700" },
  searchFilterTextActive: { color: "#ffffff", fontWeight: "900" },
  searchFilters: { gap: 7, paddingHorizontal: 18, paddingVertical: 14 },
  searchInput: { color: "#0d1114", flex: 1, fontSize: 13, height: 50 },
  searchInputWrap: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dbe2e6",
    borderRadius: 25,
    borderWidth: 1,
    flexDirection: "row",
    marginHorizontal: 18,
    marginTop: 10,
    paddingHorizontal: 15,
  },
  searchModal: { backgroundColor: "#f7f5ef", flex: 1 },
  searchModalHeader: {
    alignItems: "center",
    flexDirection: "row",
    paddingHorizontal: 12,
  },
  searchModalTitle: { color: "#0d1114", fontSize: 22, fontWeight: "900" },
  searchResultCount: { color: "#617185", fontSize: 11, fontWeight: "800" },
  searchResultEyebrow: {
    color: "#3d6672",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  searchResultHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 5,
  },
  searchResultList: { gap: 9, padding: 18, paddingBottom: 40 },
  sheetArrow: {
    color: "#0d1114",
    fontSize: 22,
    fontWeight: "800",
    padding: 10,
  },
  sheetHandle: {
    alignSelf: "center",
    backgroundColor: "#c6cfd5",
    borderRadius: 3,
    height: 4,
    width: 42,
  },
  sheetHandleArea: { paddingHorizontal: 18, paddingTop: 9 },
  sheetHeadingRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 69,
  },
  sheetResults: { gap: 9, padding: 14, paddingBottom: 110 },
  sheetSubtitle: { color: "#718095", fontSize: 10, marginTop: 2 },
  sheetTitle: { color: "#0d1114", fontSize: 15, fontWeight: "900" },
});
