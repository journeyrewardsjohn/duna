import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import {
  FellixText as Text,
  FellixTextInput as TextInput,
} from "../fellix-text";

interface PlaceSuggestion {
  readonly placeId: string;
  readonly text: string;
  readonly mainText: string;
  readonly secondaryText: string;
}

export interface MobilePlaceSelection {
  readonly venueId?: string;
  readonly name: string;
  readonly address?: string;
  readonly googlePlaceId?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

function MapPinGlyph({ confirmed = false }: { readonly confirmed?: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.pin, confirmed && styles.pinConfirmed]}
    >
      <Text style={[styles.pinText, confirmed && styles.pinTextConfirmed]}>
        {confirmed ? "✓" : "⌖"}
      </Text>
    </View>
  );
}

export function MobilePlacePicker({
  baseUrl,
  label = "Venue",
  onChange,
  value,
}: {
  readonly baseUrl: string;
  readonly label?: string;
  readonly value?: MobilePlaceSelection;
  readonly onChange: (value: MobilePlaceSelection | undefined) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<readonly PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const requestNumber = useRef(0);

  useEffect(() => {
    if (value || query.trim().length < 3) {
      setOptions([]);
      setError(undefined);
      return;
    }
    const currentRequest = ++requestNumber.current;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError(undefined);
      void fetch(
        `${baseUrl}/api/places/autocomplete?q=${encodeURIComponent(query.trim())}`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          const payload = (await response.json()) as {
            readonly suggestions?: readonly PlaceSuggestion[];
            readonly error?: string;
          };
          if (!response.ok) {
            throw new Error(payload.error || "Venue search is unavailable.");
          }
          return payload.suggestions ?? [];
        })
        .then((suggestions) => {
          if (currentRequest === requestNumber.current) {
            setOptions(suggestions);
            if (suggestions.length === 0) {
              setError(
                "No matching places yet. Try a venue, beach, or address.",
              );
            }
          }
        })
        .catch((reason: unknown) => {
          if (
            currentRequest === requestNumber.current &&
            !(reason instanceof Error && reason.name === "AbortError")
          ) {
            setOptions([]);
            setError(
              reason instanceof Error
                ? reason.message
                : "Venue search is unavailable.",
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
  }, [baseUrl, query, value]);

  const select = async (option: PlaceSuggestion) => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(
        `${baseUrl}/api/places/details?placeId=${encodeURIComponent(option.placeId)}`,
      );
      const place = (await response.json()) as MobilePlaceSelection & {
        readonly placeId?: string;
        readonly error?: string;
      };
      if (!response.ok) {
        throw new Error(place.error || "Duna could not confirm that location.");
      }
      onChange({
        name: place.name || option.mainText,
        address: place.address || option.secondaryText,
        googlePlaceId: place.placeId ?? option.placeId,
        latitude: place.latitude,
        longitude: place.longitude,
      });
      setQuery("");
      setOptions([]);
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

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.description}>
        Search once, then Duna locks the map-ready place to this video.
      </Text>
      {value ? (
        <View style={styles.lockedCard}>
          <MapPinGlyph confirmed />
          <View style={styles.flex}>
            <Text numberOfLines={2} style={styles.placeName}>
              {value.name}
            </Text>
            {!!value.address && (
              <Text numberOfLines={2} style={styles.placeAddress}>
                {value.address}
              </Text>
            )}
            <Text style={styles.lockedLabel}>LOCATION LOCKED · GOOGLE</Text>
          </View>
          <Pressable
            accessibilityLabel="Change venue"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => onChange(undefined)}
            style={styles.changeButton}
          >
            <Text style={styles.changeText}>Change</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.inputShell}>
            <MapPinGlyph />
            <TextInput
              autoCapitalize="words"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder="Search a venue, beach, or address"
              placeholderTextColor="#8b96a7"
              returnKeyType="search"
              style={styles.input}
              value={query}
            />
            {loading && <ActivityIndicator color="#235a96" size="small" />}
          </View>
          {options.length > 0 && (
            <View style={styles.results}>
              {options.map((option) => (
                <Pressable
                  accessibilityRole="button"
                  key={option.placeId}
                  onPress={() => void select(option)}
                  style={({ pressed }) => [
                    styles.result,
                    pressed && styles.resultPressed,
                  ]}
                >
                  <MapPinGlyph />
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={styles.placeName}>
                      {option.mainText}
                    </Text>
                    <Text numberOfLines={2} style={styles.placeAddress}>
                      {option.secondaryText}
                    </Text>
                  </View>
                </Pressable>
              ))}
              <Text style={styles.powered}>Powered by Google</Text>
            </View>
          )}
          {!!error && <Text style={styles.error}>{error}</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: { gap: 8 },
  label: { color: "#101828", fontSize: 16, fontWeight: "800" },
  description: { color: "#667085", fontSize: 13, lineHeight: 19 },
  inputShell: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#cfd6df",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 62,
    paddingHorizontal: 14,
  },
  input: { color: "#101828", flex: 1, fontSize: 16, minHeight: 60 },
  pin: {
    alignItems: "center",
    backgroundColor: "#e8eef7",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  pinConfirmed: { backgroundColor: "#e6f4ed" },
  pinText: { color: "#235a96", fontSize: 20, fontWeight: "900" },
  pinTextConfirmed: { color: "#2f7d57", fontSize: 16 },
  lockedCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#9acbb6",
    borderRadius: 18,
    borderWidth: 1.5,
    flexDirection: "row",
    gap: 12,
    minHeight: 84,
    padding: 14,
  },
  placeName: { color: "#101828", fontSize: 15, fontWeight: "800" },
  placeAddress: {
    color: "#667085",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  lockedLabel: {
    color: "#2f7d57",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
    marginTop: 6,
  },
  changeButton: { justifyContent: "center", minHeight: 44, paddingLeft: 8 },
  changeText: { color: "#235a96", fontSize: 13, fontWeight: "800" },
  results: {
    backgroundColor: "#ffffff",
    borderColor: "#d9dee6",
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  result: {
    alignItems: "center",
    borderBottomColor: "#edf0f4",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  resultPressed: { backgroundColor: "#f5f7fa" },
  powered: {
    color: "#8b96a7",
    fontSize: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    textAlign: "right",
  },
  error: { color: "#b84444", fontSize: 12, lineHeight: 17 },
});
