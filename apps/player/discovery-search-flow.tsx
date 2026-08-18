import type { DiscoveryMapItem } from "@duna/api";
import {
  radii,
  resolveDunaTokens,
  spacing,
  type DunaTheme,
  type ResolvedDunaTokens,
} from "@duna/ui/tokens";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  DunaNumericText,
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "./satoshi-text";
import { dunaWebUrl } from "./mobile-api";
import {
  discoveryPresetRange,
  discoveryWhatLabel,
  discoveryWhatOptions,
  discoveryWhenLabel,
  runDiscoverySearch,
  type DiscoveryCoordinates,
  type DiscoveryDateRange,
  type DiscoveryLocation,
  type DiscoverySearchCriteria,
  type DiscoverySearchResult,
  type DiscoveryWhat,
  type DiscoveryWhenPreset,
} from "./discovery-search";

type SearchStep = "main" | "where" | "when" | "what";

interface PlaceSuggestion {
  readonly placeId: string;
  readonly text: string;
  readonly mainText: string;
  readonly secondaryText: string;
}

type PlaceDetails = {
  readonly name?: string;
  readonly address?: string;
  readonly placeId?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly error?: string;
};

const whenOptions: readonly {
  readonly value: Exclude<DiscoveryWhenPreset, "custom">;
  readonly label: string;
  readonly detail: string;
}[] = [
  {
    value: "flexible",
    label: "I’m Flexible",
    detail: "Show the best available play",
  },
  { value: "next-7-days", label: "Next 7 Days", detail: "Starting today" },
  {
    value: "this-month",
    label: "This Month",
    detail: "Through the end of this month",
  },
  {
    value: "next-month",
    label: "Next Month",
    detail: "Plan a little further ahead",
  },
  {
    value: "next-3-months",
    label: "Next 3 Months",
    detail: "The season ahead",
  },
] as const;

function defaultCriteria(
  currentLocation?: DiscoveryCoordinates,
): DiscoverySearchCriteria {
  return {
    location: currentLocation
      ? {
          mode: "current",
          label: "Current location",
          ...currentLocation,
        }
      : { mode: "anywhere", label: "Anywhere" },
    when: { preset: "flexible" },
    what: ["for-you"],
  };
}

function calendarMonths(now = new Date()) {
  return Array.from(
    { length: 4 },
    (_, index) => new Date(now.getFullYear(), now.getMonth() + index, 1),
  );
}

function calendarDays(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const leading = new Date(year, monthIndex, 1).getDay();
  const count = new Date(year, monthIndex + 1, 0).getDate();
  return [
    ...Array.from({ length: leading }, () => undefined),
    ...Array.from(
      { length: count },
      (_, index) => new Date(year, monthIndex, index + 1),
    ),
  ];
}

function dateKey(value: Date) {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

function localStartIso(value: Date) {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next.toISOString();
}

function localEndIso(value: Date) {
  const next = new Date(value);
  next.setHours(23, 59, 59, 999);
  return next.toISOString();
}

function selectionDates(range: DiscoveryDateRange) {
  if (range.preset !== "custom") return {};
  return {
    start: range.startsAt ? new Date(range.startsAt) : undefined,
    end: range.endsAt ? new Date(range.endsAt) : undefined,
  };
}

function StepHeader({
  eyebrow,
  onBack,
  title,
  styles,
}: {
  readonly eyebrow: string;
  readonly onBack: () => void;
  readonly title: string;
  readonly styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.stepHeader}>
      <Pressable
        accessibilityLabel="Back"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={styles.iconButton}
      >
        <Text style={styles.backIcon}>‹</Text>
      </Pressable>
      <View style={styles.stepHeadingCopy}>
        <Text style={styles.stepEyebrow}>{eyebrow}</Text>
        <Text style={styles.stepTitle}>{title}</Text>
      </View>
      <View style={styles.iconButtonSpacer} />
    </View>
  );
}

function MainSelector({
  detail,
  label,
  onPress,
  styles,
  value,
}: {
  readonly detail: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly styles: ReturnType<typeof createStyles>;
  readonly value: string;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.mainSelector,
        pressed && styles.selectorPressed,
      ]}
    >
      <View style={styles.mainSelectorCopy}>
        <Text style={styles.selectorLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.selectorValue}>
          {value}
        </Text>
        <Text numberOfLines={1} style={styles.selectorDetail}>
          {detail}
        </Text>
      </View>
      <Text style={styles.selectorArrow}>›</Text>
    </Pressable>
  );
}

function SearchMain({
  criteria,
  onClose,
  onStep,
  styles,
}: {
  readonly criteria: DiscoverySearchCriteria;
  readonly onClose: () => void;
  readonly onStep: (step: SearchStep) => void;
  readonly styles: ReturnType<typeof createStyles>;
}) {
  const locationDetail =
    criteria.location.mode === "anywhere"
      ? "We’ll explore every Duna market"
      : (criteria.location.address ??
        "We’ll expand the radius until play appears");
  return (
    <>
      <View style={styles.mainHeader}>
        <Pressable
          accessibilityLabel="Back to Discover"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onClose}
          style={styles.iconButton}
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <View style={styles.mainHeadingCopy}>
          <Text style={styles.mainEyebrow}>DISCOVER</Text>
          <Text style={styles.mainTitle}>Search Duna</Text>
        </View>
        <View style={styles.iconButtonSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={styles.mainSelectors}
        showsVerticalScrollIndicator={false}
      >
        <MainSelector
          detail={locationDetail}
          label="WHERE"
          onPress={() => onStep("where")}
          styles={styles}
          value={criteria.location.label}
        />
        <MainSelector
          detail="Pick a window or leave your plans open"
          label="WHEN"
          onPress={() => onStep("when")}
          styles={styles}
          value={discoveryWhenLabel(criteria.when)}
        />
        <MainSelector
          detail="Events, matches, training, leagues, and courts"
          label="WHAT"
          onPress={() => onStep("what")}
          styles={styles}
          value={discoveryWhatLabel(criteria.what)}
        />
      </ScrollView>
    </>
  );
}

function WhereStep({
  currentLocation,
  items,
  onBack,
  onSelect,
  styles,
  token,
}: {
  readonly currentLocation?: DiscoveryCoordinates;
  readonly items: readonly DiscoveryMapItem[];
  readonly onBack: () => void;
  readonly onSelect: (location: DiscoveryLocation) => void;
  readonly styles: ReturnType<typeof createStyles>;
  readonly token: ResolvedDunaTokens;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<readonly PlaceSuggestion[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const requestNumber = useRef(0);
  const recommended = useMemo(() => {
    const seen = new Set<string>();
    return items
      .filter(
        (item) =>
          item.latitude !== undefined &&
          item.longitude !== undefined &&
          item.subtitle.trim().length > 0,
      )
      .filter((item) => {
        const normalized = item.subtitle.trim().toLowerCase();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      })
      .slice(0, 4);
  }, [items]);

  useEffect(() => {
    if (query.trim().length < 3) {
      setSuggestions([]);
      setError(undefined);
      return;
    }
    const currentRequest = ++requestNumber.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError(undefined);
      void fetch(
        `${dunaWebUrl}/api/places/autocomplete?q=${encodeURIComponent(query.trim())}`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          const payload = (await response.json()) as {
            readonly suggestions?: readonly PlaceSuggestion[];
            readonly error?: string;
          };
          if (!response.ok) {
            throw new Error(payload.error ?? "Location search is unavailable.");
          }
          return payload.suggestions ?? [];
        })
        .then((nextSuggestions) => {
          if (currentRequest !== requestNumber.current) return;
          setSuggestions(nextSuggestions);
          if (nextSuggestions.length === 0) {
            setError("No matching places yet. Try a city, beach, or address.");
          }
        })
        .catch((reason: unknown) => {
          if (
            currentRequest === requestNumber.current &&
            !(reason instanceof Error && reason.name === "AbortError")
          ) {
            setSuggestions([]);
            setError(
              reason instanceof Error
                ? reason.message
                : "Location search is unavailable.",
            );
          }
        })
        .finally(() => {
          if (currentRequest === requestNumber.current) setLoading(false);
        });
    }, 280);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const selectSuggestion = async (suggestion: PlaceSuggestion) => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(
        `${dunaWebUrl}/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}`,
      );
      const place = (await response.json()) as PlaceDetails;
      if (
        !response.ok ||
        place.latitude === undefined ||
        place.longitude === undefined
      ) {
        throw new Error(place.error ?? "Duna could not confirm that location.");
      }
      onSelect({
        mode: "place",
        label: place.name ?? suggestion.mainText,
        address: place.address ?? suggestion.secondaryText,
        latitude: place.latitude,
        longitude: place.longitude,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna could not confirm that location.",
      );
    } finally {
      setLoading(false);
    }
  };

  const useCurrentLocation = async () => {
    setLoading(true);
    setError(undefined);
    try {
      let coordinates = currentLocation;
      if (!coordinates) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          throw new Error("Allow location access to search near you.");
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        coordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
      }
      const places = await Location.reverseGeocodeAsync(coordinates).catch(
        () => [],
      );
      const place = places[0];
      const area = [place?.city, place?.region].filter(Boolean).join(", ");
      onSelect({
        mode: "current",
        label: area || "Current location",
        address: area ? "Your current location" : undefined,
        ...coordinates,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna could not find your location.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StepHeader
        eyebrow="WHERE"
        onBack={onBack}
        styles={styles}
        title="Find a place to play"
      />
      <View style={styles.searchInputShell}>
        <Text style={styles.searchGlyph}>⌕</Text>
        <TextInput
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          onChangeText={setQuery}
          placeholder="City, beach, club, or address"
          placeholderTextColor={token.text3}
          returnKeyType="search"
          style={styles.searchInput}
          value={query}
        />
        {loading ? (
          <ActivityIndicator color={token.flare} size="small" />
        ) : null}
      </View>
      <ScrollView
        contentContainerStyle={styles.stepScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {query.trim().length >= 3 ? (
          <View style={styles.optionGroup}>
            <Text style={styles.groupLabel}>SEARCH RESULTS</Text>
            {suggestions.map((suggestion) => (
              <Pressable
                accessibilityRole="button"
                key={suggestion.placeId}
                onPress={() => void selectSuggestion(suggestion)}
                style={({ pressed }) => [
                  styles.optionRow,
                  pressed && styles.selectorPressed,
                ]}
              >
                <View style={styles.optionIcon}>
                  <Text style={styles.optionIconText}>⌖</Text>
                </View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>{suggestion.mainText}</Text>
                  <Text numberOfLines={2} style={styles.optionDetail}>
                    {suggestion.secondaryText}
                  </Text>
                </View>
                <Text style={styles.optionArrow}>›</Text>
              </Pressable>
            ))}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {suggestions.length > 0 ? (
              <Text style={styles.poweredBy}>Powered by Google</Text>
            ) : null}
          </View>
        ) : (
          <>
            <View style={styles.optionGroup}>
              <Text style={styles.groupLabel}>START HERE</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void useCurrentLocation()}
                style={({ pressed }) => [
                  styles.optionRow,
                  pressed && styles.selectorPressed,
                ]}
              >
                <View style={styles.optionIcon}>
                  <Text style={styles.optionIconText}>◎</Text>
                </View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>
                    Use my current location
                  </Text>
                  <Text style={styles.optionDetail}>
                    Starts at 10 mi and expands until play appears
                  </Text>
                </View>
                <Text style={styles.optionArrow}>›</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  onSelect({ mode: "anywhere", label: "Anywhere" })
                }
                style={({ pressed }) => [
                  styles.optionRow,
                  pressed && styles.selectorPressed,
                ]}
              >
                <View style={styles.optionIcon}>
                  <Text style={styles.optionIconText}>◇</Text>
                </View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>Anywhere</Text>
                  <Text style={styles.optionDetail}>
                    Explore every Duna market
                  </Text>
                </View>
                <Text style={styles.optionArrow}>›</Text>
              </Pressable>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>
            {recommended.length > 0 ? (
              <View style={styles.optionGroup}>
                <Text style={styles.groupLabel}>POPULAR WITH DUNA</Text>
                {recommended.map((item) => (
                  <Pressable
                    accessibilityRole="button"
                    key={item.id}
                    onPress={() =>
                      onSelect({
                        mode: "place",
                        label: item.subtitle,
                        address: item.title,
                        latitude: item.latitude!,
                        longitude: item.longitude!,
                      })
                    }
                    style={({ pressed }) => [
                      styles.optionRow,
                      pressed && styles.selectorPressed,
                    ]}
                  >
                    <View style={styles.optionIcon}>
                      <Text style={styles.optionIconText}>⌖</Text>
                    </View>
                    <View style={styles.optionCopy}>
                      <Text style={styles.optionTitle}>{item.subtitle}</Text>
                      <Text numberOfLines={1} style={styles.optionDetail}>
                        {item.title}
                      </Text>
                    </View>
                    <Text style={styles.optionArrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
}

function CalendarMonth({
  month,
  onSelect,
  range,
  styles,
}: {
  readonly month: Date;
  readonly onSelect: (date: Date) => void;
  readonly range: DiscoveryDateRange;
  readonly styles: ReturnType<typeof createStyles>;
}) {
  const { start, end } = selectionDates(range);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (
    <View style={styles.calendarMonth}>
      <Text style={styles.calendarMonthTitle}>
        {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
      </Text>
      <View style={styles.weekRow}>
        {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
          <Text key={`${day}-${index}`} style={styles.weekDay}>
            {day}
          </Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {calendarDays(month).map((date, index) => {
          if (!date)
            return <View key={`blank-${index}`} style={styles.dayCell} />;
          const disabled = date < today;
          const key = dateKey(date);
          const startKey = start ? dateKey(start) : undefined;
          const endKey = end ? dateKey(end) : undefined;
          const selected = key === startKey || key === endKey;
          const inRange = Boolean(start && end && date > start && date < end);
          return (
            <Pressable
              accessibilityLabel={date.toLocaleDateString("en-US", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected }}
              disabled={disabled}
              key={key}
              onPress={() => onSelect(date)}
              style={[
                styles.dayCell,
                inRange && styles.dayCellInRange,
                selected && styles.dayCellSelected,
              ]}
            >
              <DunaNumericText
                style={[
                  styles.dayText,
                  disabled && styles.dayTextDisabled,
                  selected && styles.dayTextSelected,
                ]}
                tier="chip"
              >
                {date.getDate()}
              </DunaNumericText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function WhenStep({
  onBack,
  onChange,
  onContinue,
  styles,
  value,
}: {
  readonly onBack: () => void;
  readonly onChange: (value: DiscoveryDateRange) => void;
  readonly onContinue: () => void;
  readonly styles: ReturnType<typeof createStyles>;
  readonly value: DiscoveryDateRange;
}) {
  const [showCalendar, setShowCalendar] = useState(value.preset === "custom");
  const months = useMemo(() => calendarMonths(), []);
  const chooseDate = (date: Date) => {
    const selected = selectionDates(value);
    if (!selected.start || selected.end || date < selected.start) {
      onChange({
        preset: "custom",
        startsAt: localStartIso(date),
        endsAt: undefined,
      });
      return;
    }
    onChange({
      preset: "custom",
      startsAt: localStartIso(selected.start),
      endsAt: localEndIso(date),
    });
  };
  const customComplete =
    value.preset !== "custom" || Boolean(value.startsAt && value.endsAt);
  return (
    <>
      <StepHeader
        eyebrow="WHEN"
        onBack={onBack}
        styles={styles}
        title="Choose your window"
      />
      <ScrollView
        contentContainerStyle={styles.stepScrollContentWithFooter}
        showsVerticalScrollIndicator={false}
      >
        {!showCalendar ? (
          <View style={styles.optionGroup}>
            <Text style={styles.groupLabel}>QUICK WINDOWS</Text>
            {whenOptions.map((option) => {
              const selected = value.preset === option.value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option.value}
                  onPress={() => onChange(discoveryPresetRange(option.value))}
                  style={[
                    styles.optionRow,
                    selected && styles.optionRowSelected,
                  ]}
                >
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>{option.label}</Text>
                    <Text style={styles.optionDetail}>{option.detail}</Text>
                  </View>
                  <View
                    style={[styles.radio, selected && styles.radioSelected]}
                  >
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setShowCalendar(true);
                if (value.preset !== "custom") {
                  onChange({ preset: "custom" });
                }
              }}
              style={styles.customDateButton}
            >
              <View>
                <Text style={styles.optionTitle}>Choose a date range</Text>
                <Text style={styles.optionDetail}>
                  Pick exact start and end dates
                </Text>
              </View>
              <Text style={styles.optionArrow}>›</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.calendarPanel}>
            <View style={styles.calendarTopRow}>
              <View>
                <Text style={styles.groupLabel}>CUSTOM RANGE</Text>
                <Text style={styles.calendarSelection}>
                  {discoveryWhenLabel(value)}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowCalendar(false)}
                style={styles.textButton}
              >
                <Text style={styles.textButtonLabel}>Quick dates</Text>
              </Pressable>
            </View>
            {months.map((month) => (
              <CalendarMonth
                key={`${month.getFullYear()}-${month.getMonth()}`}
                month={month}
                onSelect={chooseDate}
                range={value}
                styles={styles}
              />
            ))}
          </View>
        )}
      </ScrollView>
      <View style={styles.stepFooter}>
        <Pressable
          accessibilityRole="button"
          disabled={!customComplete}
          onPress={onContinue}
          style={[
            styles.primaryButton,
            !customComplete && styles.primaryButtonDisabled,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {customComplete ? "Continue to What" : "Choose an end date"}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

function WhatStep({
  onBack,
  onChange,
  onSubmit,
  resultCount,
  styles,
  value,
}: {
  readonly onBack: () => void;
  readonly onChange: (value: readonly DiscoveryWhat[]) => void;
  readonly onSubmit: () => void;
  readonly resultCount: number;
  readonly styles: ReturnType<typeof createStyles>;
  readonly value: readonly DiscoveryWhat[];
}) {
  const toggle = (selection: DiscoveryWhat) => {
    if (selection === "for-you") {
      onChange(["for-you"]);
      return;
    }
    const withoutForYou = value.filter((item) => item !== "for-you");
    const next = withoutForYou.includes(selection)
      ? withoutForYou.filter((item) => item !== selection)
      : [...withoutForYou, selection];
    onChange(next.length ? next : ["for-you"]);
  };
  return (
    <>
      <StepHeader
        eyebrow="WHAT"
        onBack={onBack}
        styles={styles}
        title="What sounds good?"
      />
      <ScrollView
        contentContainerStyle={styles.stepScrollContentWithFooter}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.whatIntro}>
          Choose one or mix a few. Every result opens the page made for that
          kind of play.
        </Text>
        <View style={styles.whatGrid}>
          {discoveryWhatOptions.map((option) => {
            const selected = value.includes(option.value);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={option.value}
                onPress={() => toggle(option.value)}
                style={({ pressed }) => [
                  styles.whatCard,
                  selected && styles.whatCardSelected,
                  pressed && styles.selectorPressed,
                ]}
              >
                <View style={styles.whatCardTop}>
                  <Text style={styles.whatTitle}>{option.label}</Text>
                  <View
                    style={[styles.check, selected && styles.checkSelected]}
                  >
                    {selected ? <Text style={styles.checkText}>✓</Text> : null}
                  </View>
                </View>
                <Text style={styles.whatDetail}>{option.detail}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.stepFooter}>
        <Pressable
          accessibilityRole="button"
          onPress={onSubmit}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>
            View {resultCount} {resultCount === 1 ? "result" : "results"}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

export function DiscoverySearchFlow({
  currentLocation,
  initialCriteria,
  items,
  onClose,
  onSubmit,
  theme,
  visible,
}: {
  readonly currentLocation?: DiscoveryCoordinates;
  readonly initialCriteria?: DiscoverySearchCriteria;
  readonly items: readonly DiscoveryMapItem[];
  readonly onClose: () => void;
  readonly onSubmit: (result: DiscoverySearchResult) => void;
  readonly theme: DunaTheme;
  readonly visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const token = resolveDunaTokens(theme, "editorial");
  const topInset = Math.max(
    insets.top,
    Platform.OS === "ios" ? 54 : spacing[3],
  );
  const styles = useMemo(
    () => createStyles(token, insets.bottom, topInset),
    [insets.bottom, token, topInset],
  );
  const [step, setStep] = useState<SearchStep>("main");
  const wasVisible = useRef(false);
  const [criteria, setCriteria] = useState<DiscoverySearchCriteria>(
    () => initialCriteria ?? defaultCriteria(currentLocation),
  );

  useEffect(() => {
    if (!visible) {
      wasVisible.current = false;
      return;
    }
    if (wasVisible.current) return;
    wasVisible.current = true;
    setCriteria(initialCriteria ?? defaultCriteria(currentLocation));
    setStep("main");
  }, [currentLocation, initialCriteria, visible]);

  const result = useMemo(
    () => runDiscoverySearch(items, criteria),
    [criteria, items],
  );
  const submit = () => onSubmit(result);
  const clear = () => setCriteria(defaultCriteria(currentLocation));

  return (
    <Modal
      animationType="slide"
      onRequestClose={step === "main" ? onClose : () => setStep("main")}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.root}
      >
        <SafeAreaView edges={[]} style={styles.safeTop}>
          {step === "main" ? (
            <SearchMain
              criteria={criteria}
              onClose={onClose}
              onStep={setStep}
              styles={styles}
            />
          ) : null}
          {step === "where" ? (
            <WhereStep
              currentLocation={currentLocation}
              items={items}
              onBack={() => setStep("main")}
              onSelect={(location) => {
                setCriteria((current) => ({ ...current, location }));
                setStep("when");
              }}
              styles={styles}
              token={token}
            />
          ) : null}
          {step === "when" ? (
            <WhenStep
              onBack={() => setStep("main")}
              onChange={(when) =>
                setCriteria((current) => ({ ...current, when }))
              }
              onContinue={() => setStep("what")}
              styles={styles}
              value={criteria.when}
            />
          ) : null}
          {step === "what" ? (
            <WhatStep
              onBack={() => setStep("main")}
              onChange={(what) =>
                setCriteria((current) => ({ ...current, what }))
              }
              onSubmit={submit}
              resultCount={result.items.length}
              styles={styles}
              value={criteria.what}
            />
          ) : null}
        </SafeAreaView>
        {step === "main" ? (
          <SafeAreaView edges={["bottom"]} style={styles.mainFooterSafe}>
            <View style={styles.mainFooter}>
              <Pressable
                accessibilityRole="button"
                onPress={clear}
                style={styles.clearButton}
              >
                <Text style={styles.clearButtonText}>Clear</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={submit}
                style={styles.mainSubmitButton}
              >
                <Text style={styles.primaryButtonText}>
                  View {result.items.length}{" "}
                  {result.items.length === 1 ? "result" : "results"}
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(
  token: ResolvedDunaTokens,
  bottomInset: number,
  topInset: number,
) {
  return StyleSheet.create({
    root: { backgroundColor: token.ground, flex: 1 },
    safeTop: { flex: 1, paddingTop: topInset },
    mainHeader: {
      alignItems: "center",
      flexDirection: "row",
      paddingHorizontal: spacing[5],
      paddingTop: spacing[3],
    },
    mainHeadingCopy: { alignItems: "center", flex: 1 },
    mainEyebrow: {
      color: token.flareText,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.4,
    },
    mainTitle: {
      color: token.text1,
      fontSize: 30,
      fontWeight: "900",
      letterSpacing: -1.5,
      lineHeight: 39,
      marginTop: spacing[1],
    },
    iconButton: {
      alignItems: "center",
      borderColor: token.hairlineStrong,
      borderRadius: 24,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    iconButtonSpacer: { height: 48, width: 48 },
    backIcon: {
      color: token.text1,
      fontSize: 34,
      lineHeight: 36,
      marginTop: -2,
    },
    mainSelectors: {
      gap: spacing[3],
      padding: spacing[5],
      paddingTop: spacing[8],
    },
    mainSelector: {
      alignItems: "center",
      backgroundColor: token.surface1,
      borderColor: token.hairlineStrong,
      borderRadius: radii.large,
      borderWidth: 1,
      flexDirection: "row",
      minHeight: 142,
      padding: spacing[5],
    },
    mainSelectorCopy: { flex: 1 },
    selectorLabel: {
      color: token.flareText,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.3,
    },
    selectorValue: {
      color: token.text1,
      fontSize: 27,
      fontWeight: "800",
      letterSpacing: -1,
      lineHeight: 31,
      marginTop: spacing[2],
    },
    selectorDetail: { color: token.text3, fontSize: 12, marginTop: spacing[2] },
    selectorArrow: { color: token.text2, fontSize: 28, marginLeft: spacing[3] },
    selectorPressed: { opacity: 0.72 },
    mainFooterSafe: { backgroundColor: token.surface1 },
    mainFooter: {
      borderTopColor: token.hairline,
      borderTopWidth: 1,
      flexDirection: "row",
      gap: spacing[3],
      padding: spacing[4],
    },
    clearButton: {
      alignItems: "center",
      borderColor: token.buttonGhostBorder,
      borderRadius: radii.pill,
      borderWidth: 1,
      height: 56,
      justifyContent: "center",
      paddingHorizontal: spacing[6],
    },
    clearButtonText: { color: token.text1, fontSize: 15, fontWeight: "800" },
    mainSubmitButton: {
      alignItems: "center",
      backgroundColor: token.buttonPrimaryBackground,
      borderRadius: radii.pill,
      flex: 1,
      height: 56,
      justifyContent: "center",
      paddingHorizontal: spacing[5],
    },
    stepHeader: {
      alignItems: "center",
      flexDirection: "row",
      paddingHorizontal: spacing[4],
      paddingTop: spacing[2],
    },
    stepHeadingCopy: { alignItems: "center", flex: 1 },
    stepEyebrow: {
      color: token.flareText,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.3,
    },
    stepTitle: {
      color: token.text1,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: -0.6,
      marginTop: spacing[1],
    },
    searchInputShell: {
      alignItems: "center",
      backgroundColor: token.surface1,
      borderColor: token.hairlineStrong,
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing[2],
      marginHorizontal: spacing[5],
      marginTop: spacing[6],
      minHeight: 60,
      paddingHorizontal: spacing[4],
    },
    searchGlyph: { color: token.text1, fontSize: 23 },
    searchInput: { color: token.text1, flex: 1, fontSize: 16, minHeight: 58 },
    stepScrollContent: {
      gap: spacing[6],
      padding: spacing[5],
      paddingBottom: spacing[12],
    },
    stepScrollContentWithFooter: {
      gap: spacing[6],
      padding: spacing[5],
      paddingBottom: 148,
    },
    optionGroup: {
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: radii.large,
      borderWidth: 1,
      overflow: "hidden",
      paddingTop: spacing[4],
    },
    groupLabel: {
      color: token.text3,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.2,
      paddingBottom: spacing[3],
      paddingHorizontal: spacing[4],
    },
    optionRow: {
      alignItems: "center",
      borderTopColor: token.hairline,
      borderTopWidth: 1,
      flexDirection: "row",
      gap: spacing[3],
      minHeight: 74,
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3],
    },
    optionRowSelected: { backgroundColor: token.flareFill },
    optionIcon: {
      alignItems: "center",
      backgroundColor: token.surface2,
      borderRadius: 20,
      height: 40,
      justifyContent: "center",
      width: 40,
    },
    optionIconText: { color: token.text2, fontSize: 20, fontWeight: "800" },
    optionCopy: { flex: 1 },
    optionTitle: { color: token.text1, fontSize: 15, fontWeight: "800" },
    optionDetail: {
      color: token.text3,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 3,
    },
    optionArrow: { color: token.text2, fontSize: 24 },
    errorText: {
      color: token.loss,
      fontSize: 12,
      lineHeight: 18,
      padding: spacing[4],
    },
    poweredBy: {
      color: token.text3,
      fontSize: 12,
      padding: spacing[3],
      textAlign: "right",
    },
    radio: {
      alignItems: "center",
      borderColor: token.hairlineStrong,
      borderRadius: 13,
      borderWidth: 1,
      height: 26,
      justifyContent: "center",
      width: 26,
    },
    radioSelected: { borderColor: token.flare, borderWidth: 2 },
    radioDot: {
      backgroundColor: token.flare,
      borderRadius: 6,
      height: 12,
      width: 12,
    },
    customDateButton: {
      alignItems: "center",
      borderTopColor: token.hairline,
      borderTopWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 74,
      padding: spacing[4],
    },
    calendarPanel: {
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: radii.large,
      borderWidth: 1,
      padding: spacing[4],
    },
    calendarTopRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing[5],
    },
    calendarSelection: { color: token.text1, fontSize: 16, fontWeight: "800" },
    textButton: {
      justifyContent: "center",
      minHeight: 48,
      paddingLeft: spacing[3],
    },
    textButtonLabel: {
      color: token.flareText,
      fontSize: 12,
      fontWeight: "800",
    },
    calendarMonth: { marginBottom: spacing[8] },
    calendarMonthTitle: {
      color: token.text1,
      fontSize: 17,
      fontWeight: "800",
      marginBottom: spacing[4],
      textAlign: "center",
    },
    weekRow: { flexDirection: "row", marginBottom: spacing[2] },
    weekDay: {
      color: token.text3,
      fontSize: 12,
      fontWeight: "800",
      textAlign: "center",
      width: `${100 / 7}%`,
    },
    calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
    dayCell: {
      alignItems: "center",
      height: 48,
      justifyContent: "center",
      width: `${100 / 7}%`,
    },
    dayCellInRange: { backgroundColor: token.flareFill },
    dayCellSelected: {
      backgroundColor: token.buttonPrimaryBackground,
      borderRadius: 23,
    },
    dayText: { color: token.text1, fontSize: 13 },
    dayTextDisabled: { color: token.text3, opacity: 0.38 },
    dayTextSelected: { color: token.buttonPrimaryForeground },
    stepFooter: {
      backgroundColor: token.surface1,
      borderTopColor: token.hairline,
      borderTopWidth: 1,
      bottom: 0,
      left: 0,
      paddingBottom: Math.max(spacing[4], bottomInset),
      paddingHorizontal: spacing[4],
      paddingTop: spacing[4],
      position: "absolute",
      right: 0,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: token.buttonPrimaryBackground,
      borderRadius: radii.pill,
      height: 56,
      justifyContent: "center",
      paddingHorizontal: spacing[5],
    },
    primaryButtonDisabled: { opacity: 0.36 },
    primaryButtonText: {
      color: token.buttonPrimaryForeground,
      fontSize: 15,
      fontWeight: "800",
    },
    whatIntro: { color: token.text2, fontSize: 14, lineHeight: 21 },
    whatGrid: { gap: spacing[3] },
    whatCard: {
      backgroundColor: token.surface1,
      borderColor: token.hairlineStrong,
      borderRadius: radii.medium,
      borderWidth: 1,
      minHeight: 96,
      padding: spacing[4],
    },
    whatCardSelected: {
      backgroundColor: token.flareFill,
      borderColor: token.flareBorder,
    },
    whatCardTop: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    whatTitle: { color: token.text1, fontSize: 17, fontWeight: "800" },
    whatDetail: {
      color: token.text3,
      fontSize: 12,
      lineHeight: 17,
      marginTop: spacing[2],
    },
    check: {
      alignItems: "center",
      borderColor: token.hairlineStrong,
      borderRadius: 12,
      borderWidth: 1,
      height: 24,
      justifyContent: "center",
      width: 24,
    },
    checkSelected: { backgroundColor: token.flare, borderColor: token.flare },
    checkText: { color: token.textOnAccent, fontSize: 13, fontWeight: "900" },
  });
}
