import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useProRuntime } from "./runtime";

type CreateKind = "session" | "service" | "good" | "plan";

const createOptions: readonly {
  kind: CreateKind;
  icon: string;
  title: string;
  body: string;
  accent: string;
}[] = [
  {
    kind: "session",
    icon: "▦",
    title: "Session",
    body: "Put a lesson, clinic, or open play on the calendar.",
    accent: "#2367a8",
  },
  {
    kind: "service",
    icon: "◎",
    title: "Service",
    body: "Create something players can book with you.",
    accent: "#3d7d66",
  },
  {
    kind: "good",
    icon: "◇",
    title: "Good",
    body: "Photograph, stock, and optionally sell an item.",
    accent: "#b4653d",
  },
  {
    kind: "plan",
    icon: "✦",
    title: "Plan",
    body: "Start a membership, credit pack, or bundle.",
    accent: "#745aa6",
  },
];

function moneyMinor(value: string): number {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function positiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function commaValues(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, 24);
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addLocalMinutes(local: string, minutes: number): string {
  const value = new Date(`${local}:00Z`);
  value.setUTCMinutes(value.getUTCMinutes() + minutes);
  return value.toISOString().slice(0, 16);
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  suffix,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly keyboardType?: "default" | "decimal-pad" | "number-pad";
  readonly multiline?: boolean;
  readonly suffix?: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          autoCapitalize="sentences"
          keyboardType={keyboardType}
          multiline={multiline}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#98a2b3"
          style={[styles.input, multiline && styles.inputMultiline]}
          value={value}
        />
        {suffix && <Text style={styles.inputSuffix}>{suffix}</Text>}
      </View>
    </View>
  );
}

function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choices}>
        {options.map((option) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: option.value === value }}
            key={option.value}
            onPress={() => {
              if (Platform.OS !== "web") void Haptics.selectionAsync();
              onChange(option.value);
            }}
            style={[
              styles.choice,
              option.value === value && styles.choiceSelected,
            ]}
          >
            <Text
              style={[
                styles.choiceText,
                option.value === value && styles.choiceTextSelected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Toggle({
  title,
  body,
  value,
  onChange,
}: {
  readonly title: string;
  readonly body: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[styles.toggle, value && styles.toggleOn]}
    >
      <View style={styles.flex}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleBody}>{body}</Text>
      </View>
      <View style={[styles.switchTrack, value && styles.switchTrackOn]}>
        <View style={[styles.switchKnob, value && styles.switchKnobOn]} />
      </View>
    </Pressable>
  );
}

export function OperatorCreateScreen({
  onClose,
  onCreated,
  onGetPaid,
}: {
  readonly onClose: () => void;
  readonly onCreated: () => Promise<void>;
  readonly onGetPaid: () => void;
}) {
  const { client, mode, uploadProductImage, workspace } = useProRuntime();
  const [kind, setKind] = useState<CreateKind>();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [createdTitle, setCreatedTitle] = useState<string>();

  const [sessionType, setSessionType] = useState<
    "private-lesson" | "clinic" | "open-play"
  >("private-lesson");
  const tomorrow = useMemo(() => {
    const value = new Date();
    value.setDate(value.getDate() + 1);
    return value;
  }, []);
  const [sessionDate, setSessionDate] = useState(dateKey(tomorrow));
  const [sessionHour, setSessionHour] = useState("16");
  const [duration, setDuration] = useState("60");
  const [capacity, setCapacity] = useState("1");
  const [venueId, setVenueId] = useState(workspace?.venues[0]?.id ?? "");
  const [newVenueName, setNewVenueName] = useState("");
  const [newVenueCity, setNewVenueCity] = useState("");

  const [serviceType, setServiceType] = useState<
    "private-lesson" | "group-lesson" | "assessment" | "other"
  >("private-lesson");
  const [serviceDelivery, setServiceDelivery] = useState<
    "at-club" | "mobile" | "online"
  >("at-club");
  const [serviceCredits, setServiceCredits] = useState("");

  const [goodType, setGoodType] = useState<
    "equipment" | "apparel" | "consumable" | "other"
  >("equipment");
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [forSale, setForSale] = useState(true);
  const [trackInventory, setTrackInventory] = useState(true);
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [goodColors, setGoodColors] = useState("");
  const [goodSizes, setGoodSizes] = useState("");

  const [planType, setPlanType] = useState<
    "membership" | "credit-pack" | "bundle"
  >("membership");
  const [planInterval, setPlanInterval] = useState<"month" | "year">("month");
  const [planCredits, setPlanCredits] = useState("10");

  const reset = () => {
    setKind(undefined);
    setStep(0);
    setTitle("");
    setDescription("");
    setPrice("");
    setPhotos([]);
    setForSale(true);
    setTrackInventory(true);
    setQuantity("1");
    setUnitCost("");
    setGoodColors("");
    setGoodSizes("");
    setServiceCredits("");
    setPlanCredits("10");
    setError(undefined);
    setCreatedTitle(undefined);
  };

  const pickPhoto = async (source: "camera" | "library") => {
    setError(undefined);
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(
        source === "camera"
          ? "Allow camera access to photograph this item."
          : "Allow photo access to choose an item image.",
      );
      return;
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.78,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsMultipleSelection: true,
            selectionLimit: Math.max(1, 8 - photos.length),
            quality: 0.78,
          });
    if (!result.canceled) {
      setPhotos((current) =>
        [...current, ...result.assets]
          .filter(
            (asset, index, all) =>
              all.findIndex((candidate) => candidate.uri === asset.uri) ===
              index,
          )
          .slice(0, 8),
      );
    }
  };

  const validateStep = (): string | undefined => {
    if (!kind) return "Choose what you want to create.";
    if (step === 0 && title.trim().length < 2) return "Give it a clear name.";
    if (kind === "good" && step === 0 && photos.length === 0)
      return "Add at least one product image.";
    if (kind === "session" && step === 1) {
      if (!venueId && newVenueName.trim().length < 2)
        return "Choose a location or name a new one.";
      if (!venueId && newVenueCity.trim().length < 2)
        return "Add the city for the new location.";
    }
    if (step === 2 && kind !== "good" && price.trim() && moneyMinor(price) < 0)
      return "Enter a valid price.";
    if (step === 2 && kind === "good" && forSale && !price.trim())
      return "Add a sale price or turn off For sale.";
    return undefined;
  };

  const next = () => {
    const issue = validateStep();
    if (issue) {
      setError(issue);
      return;
    }
    setError(undefined);
    setStep((value) => Math.min(2, value + 1));
  };

  const submit = async () => {
    const issue = validateStep();
    if (issue) {
      setError(issue);
      return;
    }
    if (mode !== "live" || !client) {
      setError("Preview mode shows the flow but does not create live records.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      if (kind === "session") {
        let selectedVenueId = venueId;
        if (!selectedVenueId) {
          const createdVenue = await client.operator.createVenue.mutate({
            name: newVenueName.trim(),
            locality: newVenueCity.trim(),
            administrativeArea:
              workspace?.organization.administrativeArea ?? undefined,
            postalCode: workspace?.organization.postalCode ?? undefined,
            countryCode: workspace?.organization.countryCode ?? "US",
            timezone:
              workspace?.organization.timezone ??
              Intl.DateTimeFormat().resolvedOptions().timeZone,
            temporary: true,
            idempotencyKey: Crypto.randomUUID(),
          });
          selectedVenueId = createdVenue.id;
        }
        const localStart = `${sessionDate}T${sessionHour.padStart(2, "0")}:00`;
        const localEnd = addLocalMinutes(
          localStart,
          positiveInteger(duration, 60),
        );
        await client.operator.createProgramSession.mutate({
          title: title.trim(),
          description: description.trim() || undefined,
          kind: sessionType,
          venueId: selectedVenueId,
          localStartsAt: localStart,
          localEndsAt: localEnd,
          capacity: positiveInteger(capacity, 1),
          minimumCapacity: 1,
          priceMinor: moneyMinor(price),
          confirmedPrice: true,
          idempotencyKey: Crypto.randomUUID(),
        });
      } else if (kind === "service") {
        await client.operator.createCatalogItem.mutate({
          type: "service",
          subtype: serviceType,
          title: title.trim(),
          shortSummary: description.trim().slice(0, 240) || undefined,
          description: description.trim() || undefined,
          visibility: "public",
          taxable: false,
          allowCard: true,
          allowCash: true,
          allowCredits: Boolean(serviceCredits.trim()),
          priceMinor: moneyMinor(price),
          creditCost: serviceCredits.trim()
            ? positiveInteger(serviceCredits, 1)
            : undefined,
          configuration: {
            durationMinutes: positiveInteger(duration, 60),
            deliveryMode: serviceDelivery,
            mobileCreated: true,
          },
          confirmed: true,
          idempotencyKey: Crypto.randomUUID(),
        });
      } else if (kind === "good") {
        if (photos.length === 0 || !uploadProductImage) {
          throw new Error("Add a product image before saving this good.");
        }
        const uploaded = [];
        for (const [index, photo] of photos.entries()) {
          uploaded.push(
            await uploadProductImage({
              uri: photo.uri,
              name:
                photo.fileName ?? `duna-product-${Date.now()}-${index + 1}.jpg`,
              type:
                photo.mimeType === "image/png" ||
                photo.mimeType === "image/webp" ||
                photo.mimeType === "image/jpeg"
                  ? photo.mimeType
                  : "image/jpeg",
            }),
          );
        }
        const stockQuantity = positiveInteger(quantity, 1);
        const unitCostMinor = unitCost.trim()
          ? moneyMinor(unitCost)
          : undefined;
        await client.operator.createCatalogItem.mutate({
          type: "good",
          subtype: goodType,
          title: title.trim(),
          shortSummary: description.trim().slice(0, 240) || undefined,
          description: description.trim() || undefined,
          visibility: "public",
          taxable: forSale,
          allowCard: forSale,
          allowCash: forSale,
          allowCredits: false,
          priceMinor: forSale ? moneyMinor(price) : undefined,
          options: [
            ...(commaValues(goodColors).length
              ? [{ name: "Color", values: commaValues(goodColors) }]
              : []),
            ...(commaValues(goodSizes).length
              ? [{ name: "Size", values: commaValues(goodSizes) }]
              : []),
          ],
          media: uploaded.map((asset, index) => ({
            kind: "image",
            url: asset.url,
            alt:
              index === 0
                ? title.trim()
                : `${title.trim()} gallery image ${index + 1}`,
          })),
          initialInventory: trackInventory
            ? {
                variantIndex: 0,
                locationName: "Main inventory",
                purpose: forSale ? "sale" : "operations",
                trackingMode: "quantity",
                quantity: stockQuantity,
                unitCostMinor,
                totalCostMinor:
                  unitCostMinor === undefined
                    ? undefined
                    : unitCostMinor * stockQuantity,
                acquiredAt: dateKey(new Date()),
              }
            : undefined,
          configuration: {
            saleEnabled: forSale,
            inventoryTracked: trackInventory,
            costingMethod: "fifo",
            mobileCreated: true,
          },
          confirmed: true,
          idempotencyKey: Crypto.randomUUID(),
        });
      } else if (kind === "plan") {
        await client.operator.createCatalogItem.mutate({
          type: "plan",
          subtype: planType,
          title: title.trim(),
          shortSummary: description.trim().slice(0, 240) || undefined,
          description: description.trim() || undefined,
          visibility: "public",
          taxable: false,
          allowCard: true,
          allowCash: false,
          allowCredits: false,
          priceMinor: moneyMinor(price),
          recurringInterval:
            planType === "membership" ? planInterval : undefined,
          recurringIntervalCount: planType === "membership" ? 1 : undefined,
          configuration: {
            creditsGranted:
              planType === "credit-pack"
                ? positiveInteger(planCredits, 10)
                : undefined,
            bundleKind: planType === "bundle" ? "starter" : undefined,
            mobileCreated: true,
          },
          confirmed: true,
          idempotencyKey: Crypto.randomUUID(),
        });
      }
      if (Platform.OS !== "web") {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }
      setCreatedTitle(title.trim());
      await onCreated();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna Pro could not create this item.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (createdTitle) {
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
        <View style={styles.successPage}>
          <View style={styles.successIcon}>
            <Text style={styles.successIconText}>✓</Text>
          </View>
          <Text style={styles.successEyebrow}>DRAFT CREATED</Text>
          <Text style={styles.successTitle}>{createdTitle}</Text>
          <Text style={styles.successBody}>
            It is saved privately and ready for any final details before you
            publish or sell it.
          </Text>
          <Pressable onPress={onClose} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Done</Text>
          </Pressable>
          <View style={styles.successActions}>
            <Pressable onPress={reset} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Create another</Text>
            </Pressable>
            <Pressable onPress={onGetPaid} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Get paid</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.topbar}>
        <Pressable
          onPress={kind ? () => (step ? setStep(step - 1) : reset()) : onClose}
          style={styles.topButton}
        >
          <Text style={styles.topButtonText}>{kind ? "‹ Back" : "Close"}</Text>
        </Pressable>
        <Text style={styles.topTitle}>Create</Text>
        <View style={styles.topButton} />
      </View>
      {!kind ? (
        <ScrollView contentContainerStyle={styles.hub}>
          <Text style={styles.hubEyebrow}>BIG JOBS, FEWER STEPS</Text>
          <Text style={styles.hubTitle}>What are you making?</Text>
          <Text style={styles.hubBody}>
            Start it here. Duna keeps the advanced settings out of your way
            until you need them.
          </Text>
          <View style={styles.optionGrid}>
            {createOptions.map((option) => (
              <Pressable
                key={option.kind}
                onPress={() => {
                  setKind(option.kind);
                  setStep(0);
                  setError(undefined);
                }}
                style={styles.optionCard}
              >
                <View
                  style={[
                    styles.optionIcon,
                    { backgroundColor: option.accent },
                  ]}
                >
                  <Text style={styles.optionIconText}>{option.icon}</Text>
                </View>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionBody}>{option.body}</Text>
                <Text style={[styles.optionArrow, { color: option.accent }]}>
                  →
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.progressRow}>
              {[0, 1, 2].map((value) => (
                <View
                  key={value}
                  style={[styles.progress, value <= step && styles.progressOn]}
                />
              ))}
            </View>
            <Text style={styles.stepEyebrow}>STEP {step + 1} OF 3</Text>
            <Text style={styles.stepTitle}>
              {step === 0
                ? kind === "good"
                  ? "Show it and name it."
                  : "Give it a clear identity."
                : step === 1
                  ? kind === "session"
                    ? "When and where?"
                    : kind === "good"
                      ? "How will you use it?"
                      : "How does it work?"
                  : "Confirm the value."}
            </Text>
            {step === 0 && (
              <View style={styles.formStack}>
                {kind === "good" && (
                  <View style={styles.photoCard}>
                    {photos[0] ? (
                      <>
                        <Image
                          source={{ uri: photos[0].uri }}
                          style={styles.photo}
                        />
                        <View style={styles.photoGallery}>
                          {photos.map((asset, index) => (
                            <Pressable
                              accessibilityLabel={`Remove product image ${index + 1}`}
                              key={asset.uri}
                              onPress={() =>
                                setPhotos((current) =>
                                  current.filter(
                                    (candidate) => candidate.uri !== asset.uri,
                                  ),
                                )
                              }
                              style={styles.photoThumbnailWrap}
                            >
                              <Image
                                source={{ uri: asset.uri }}
                                style={styles.photoThumbnail}
                              />
                              <View style={styles.photoRemove}>
                                <Text style={styles.photoRemoveText}>×</Text>
                              </View>
                            </Pressable>
                          ))}
                        </View>
                      </>
                    ) : (
                      <View style={styles.photoEmpty}>
                        <Text style={styles.photoEmptyIcon}>◇</Text>
                        <Text style={styles.photoEmptyText}>
                          Add the main product image
                        </Text>
                      </View>
                    )}
                    <View style={styles.photoActions}>
                      <Pressable
                        onPress={() => void pickPhoto("camera")}
                        style={styles.photoButton}
                      >
                        <Text style={styles.photoButtonText}>Use camera</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void pickPhoto("library")}
                        style={styles.photoButton}
                      >
                        <Text style={styles.photoButtonText}>Add photos</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
                <Field
                  label="Name"
                  onChangeText={setTitle}
                  placeholder={
                    kind === "session"
                      ? "Private lesson with John"
                      : kind === "good"
                        ? "Wilson Optx ball"
                        : "Give it a useful name"
                  }
                  value={title}
                />
                <Field
                  label="Short description (optional)"
                  multiline
                  onChangeText={setDescription}
                  placeholder="What should a player know?"
                  value={description}
                />
                {kind === "session" && (
                  <Choices
                    label="Session type"
                    value={sessionType}
                    onChange={setSessionType}
                    options={[
                      { value: "private-lesson", label: "Private" },
                      { value: "clinic", label: "Clinic" },
                      { value: "open-play", label: "Open play" },
                    ]}
                  />
                )}
                {kind === "service" && (
                  <Choices
                    label="Service type"
                    value={serviceType}
                    onChange={setServiceType}
                    options={[
                      { value: "private-lesson", label: "Private" },
                      { value: "group-lesson", label: "Group" },
                      { value: "assessment", label: "Assessment" },
                      { value: "other", label: "Other" },
                    ]}
                  />
                )}
                {kind === "good" && (
                  <Choices
                    label="Item type"
                    value={goodType}
                    onChange={setGoodType}
                    options={[
                      { value: "equipment", label: "Equipment" },
                      { value: "apparel", label: "Apparel" },
                      { value: "consumable", label: "Consumable" },
                      { value: "other", label: "Other" },
                    ]}
                  />
                )}
                {kind === "plan" && (
                  <Choices
                    label="Plan type"
                    value={planType}
                    onChange={setPlanType}
                    options={[
                      { value: "membership", label: "Membership" },
                      { value: "credit-pack", label: "Credit pack" },
                      { value: "bundle", label: "Bundle" },
                    ]}
                  />
                )}
              </View>
            )}
            {step === 1 && kind === "session" && (
              <View style={styles.formStack}>
                {workspace?.venues.length ? (
                  <Choices
                    label="Location"
                    value={venueId}
                    onChange={setVenueId}
                    options={workspace.venues.map((venue) => ({
                      value: venue.id,
                      label: venue.name,
                    }))}
                  />
                ) : (
                  <View style={styles.inlineSetup}>
                    <Text style={styles.inlineSetupTitle}>
                      Add your first location
                    </Text>
                    <Text style={styles.inlineSetupBody}>
                      We will save it with this session. You can add the full
                      address later.
                    </Text>
                    <Field
                      label="Location name"
                      onChangeText={setNewVenueName}
                      placeholder="Main courts"
                      value={newVenueName}
                    />
                    <Field
                      label="City"
                      onChangeText={setNewVenueCity}
                      placeholder="Manhattan Beach"
                      value={newVenueCity}
                    />
                  </View>
                )}
                <Field
                  label="Date"
                  onChangeText={setSessionDate}
                  placeholder="YYYY-MM-DD"
                  value={sessionDate}
                />
                <Choices
                  label="Starts"
                  value={sessionHour}
                  onChange={setSessionHour}
                  options={[
                    { value: "9", label: "9 AM" },
                    { value: "12", label: "Noon" },
                    { value: "16", label: "4 PM" },
                    { value: "18", label: "6 PM" },
                  ]}
                />
                <Choices
                  label="Length"
                  value={duration}
                  onChange={setDuration}
                  options={[
                    { value: "45", label: "45 min" },
                    { value: "60", label: "60 min" },
                    { value: "90", label: "90 min" },
                    { value: "120", label: "2 hours" },
                  ]}
                />
                <Field
                  keyboardType="number-pad"
                  label="Capacity"
                  onChangeText={setCapacity}
                  value={capacity}
                />
              </View>
            )}
            {step === 1 && kind === "service" && (
              <View style={styles.formStack}>
                <Choices
                  label="Length"
                  value={duration}
                  onChange={setDuration}
                  options={[
                    { value: "30", label: "30 min" },
                    { value: "45", label: "45 min" },
                    { value: "60", label: "60 min" },
                    { value: "90", label: "90 min" },
                  ]}
                />
                <Choices
                  label="Delivered"
                  value={serviceDelivery}
                  onChange={setServiceDelivery}
                  options={[
                    { value: "at-club", label: "At club" },
                    { value: "mobile", label: "I travel" },
                    { value: "online", label: "Online" },
                  ]}
                />
                <Field
                  keyboardType="number-pad"
                  label="Optional credit price"
                  onChangeText={setServiceCredits}
                  placeholder="1"
                  suffix="credits"
                  value={serviceCredits}
                />
              </View>
            )}
            {step === 1 && kind === "good" && (
              <View style={styles.formStack}>
                <Toggle
                  body="Show a price and allow checkout."
                  onChange={setForSale}
                  title="For sale"
                  value={forSale}
                />
                <Toggle
                  body="Track receipts, cost, quantity, and future stock."
                  onChange={setTrackInventory}
                  title="Track inventory"
                  value={trackInventory}
                />
                {trackInventory && (
                  <>
                    <Field
                      keyboardType="number-pad"
                      label="Quantity received"
                      onChangeText={setQuantity}
                      value={quantity}
                    />
                    <Field
                      keyboardType="decimal-pad"
                      label="Cost per item (optional)"
                      onChangeText={setUnitCost}
                      placeholder="0.00"
                      suffix={workspace?.organization.currency ?? "USD"}
                      value={unitCost}
                    />
                  </>
                )}
                <Field
                  label="Colors (optional)"
                  onChangeText={setGoodColors}
                  placeholder="Blue, Yellow, White"
                  value={goodColors}
                />
                <Field
                  label="Sizes (optional)"
                  onChangeText={setGoodSizes}
                  placeholder="S, M, L"
                  value={goodSizes}
                />
                <View style={styles.adviceCard}>
                  <Text style={styles.adviceTitle}>Duna recommends FIFO</Text>
                  <Text style={styles.adviceBody}>
                    It is the clearest default for changing receipt costs. This
                    is an operational suggestion, not tax advice.
                  </Text>
                </View>
              </View>
            )}
            {step === 1 && kind === "plan" && (
              <View style={styles.formStack}>
                {planType === "membership" && (
                  <Choices
                    label="Renews"
                    value={planInterval}
                    onChange={setPlanInterval}
                    options={[
                      { value: "month", label: "Monthly" },
                      { value: "year", label: "Yearly" },
                    ]}
                  />
                )}
                {planType === "credit-pack" && (
                  <Field
                    keyboardType="number-pad"
                    label="Credits included"
                    onChangeText={setPlanCredits}
                    value={planCredits}
                  />
                )}
                <View style={styles.adviceCard}>
                  <Text style={styles.adviceTitle}>Start simple</Text>
                  <Text style={styles.adviceBody}>
                    {planType === "bundle"
                      ? "Save the bundle now, then choose the included services before publishing."
                      : "You can add eligibility, member perks, and limits before publishing."}
                  </Text>
                </View>
              </View>
            )}
            {step === 2 && (
              <View style={styles.formStack}>
                {(kind !== "good" || forSale) && (
                  <Field
                    keyboardType="decimal-pad"
                    label={
                      kind === "plan" && planType === "membership"
                        ? `Price per ${planInterval}`
                        : "Price"
                    }
                    onChangeText={setPrice}
                    placeholder="0.00"
                    suffix={workspace?.organization.currency ?? "USD"}
                    value={price}
                  />
                )}
                <View style={styles.reviewCard}>
                  <Text style={styles.reviewEyebrow}>READY TO SAVE</Text>
                  <Text style={styles.reviewTitle}>{title || "Untitled"}</Text>
                  <Text style={styles.reviewBody}>
                    {kind === "session"
                      ? `${sessionType.replaceAll("-", " ")} · ${sessionDate} · ${duration} min`
                      : kind === "service"
                        ? `${serviceType.replaceAll("-", " ")} · ${duration} min`
                        : kind === "good"
                          ? `${goodType} · ${photos.length} image${photos.length === 1 ? "" : "s"} · ${trackInventory ? `${quantity} in inventory` : "inventory not tracked"}${forSale ? ` · $${price || "0.00"}` : " · not for sale"}`
                          : `${planType.replaceAll("-", " ")}${planType === "membership" ? ` · ${planInterval}ly` : ""}`}
                  </Text>
                  <View style={styles.draftPill}>
                    <Text style={styles.draftPillText}>
                      SAVES AS PRIVATE DRAFT
                    </Text>
                  </View>
                </View>
              </View>
            )}
            {error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>
          <View style={styles.footer}>
            {step < 2 ? (
              <Pressable
                disabled={busy}
                onPress={next}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Continue</Text>
              </Pressable>
            ) : (
              <Pressable
                disabled={busy}
                onPress={() => void submit()}
                style={[styles.primaryButton, busy && styles.buttonDisabled]}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Create draft</Text>
                )}
              </Pressable>
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: "#f8f7f3", flex: 1 },
  flex: { flex: 1 },
  topbar: {
    alignItems: "center",
    borderBottomColor: "#e7e4dc",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 16,
  },
  topButton: { justifyContent: "center", minHeight: 48, minWidth: 72 },
  topButtonText: { color: "#235a96", fontSize: 15, fontWeight: "800" },
  topTitle: { color: "#101828", fontSize: 17, fontWeight: "900" },
  hub: { padding: 20, paddingBottom: 60 },
  hubEyebrow: {
    color: "#235a96",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginTop: 14,
  },
  hubTitle: {
    color: "#101828",
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -1.3,
    lineHeight: 40,
    marginTop: 10,
  },
  hubBody: {
    color: "#667085",
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10,
    maxWidth: 540,
  },
  optionGrid: { gap: 12, marginTop: 28 },
  optionCard: {
    backgroundColor: "#fff",
    borderColor: "#e7e9ee",
    borderRadius: 22,
    borderWidth: 1,
    minHeight: 152,
    padding: 18,
  },
  optionIcon: {
    alignItems: "center",
    borderRadius: 14,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  optionIconText: { color: "#fff", fontSize: 22, fontWeight: "900" },
  optionTitle: {
    color: "#101828",
    fontSize: 21,
    fontWeight: "900",
    marginTop: 16,
  },
  optionBody: {
    color: "#667085",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    maxWidth: "84%",
  },
  optionArrow: {
    fontSize: 24,
    fontWeight: "900",
    position: "absolute",
    right: 20,
    top: 64,
  },
  form: { padding: 20, paddingBottom: 130 },
  progressRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  progress: { backgroundColor: "#dfe3e8", borderRadius: 4, flex: 1, height: 5 },
  progressOn: { backgroundColor: "#235a96" },
  stepEyebrow: {
    color: "#235a96",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 26,
  },
  stepTitle: {
    color: "#101828",
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: -1,
    lineHeight: 36,
    marginTop: 8,
  },
  formStack: { gap: 18, marginTop: 28 },
  fieldWrap: { gap: 7 },
  label: { color: "#344054", fontSize: 12, fontWeight: "800" },
  inputWrap: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#d9dee7",
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 56,
    paddingHorizontal: 15,
  },
  input: {
    color: "#101828",
    flex: 1,
    fontSize: 16,
    minHeight: 54,
    paddingVertical: 12,
  },
  inputMultiline: { minHeight: 92, textAlignVertical: "top" },
  inputSuffix: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "800",
    marginLeft: 8,
  },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#d9dee7",
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
    minWidth: 88,
    paddingHorizontal: 16,
  },
  choiceSelected: { backgroundColor: "#eaf2fb", borderColor: "#235a96" },
  choiceText: { color: "#667085", fontSize: 13, fontWeight: "800" },
  choiceTextSelected: { color: "#235a96" },
  toggle: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#d9dee7",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 82,
    padding: 15,
  },
  toggleOn: { backgroundColor: "#f2f8f5", borderColor: "#71a48c" },
  toggleTitle: { color: "#101828", fontSize: 15, fontWeight: "900" },
  toggleBody: { color: "#667085", fontSize: 11, lineHeight: 16, marginTop: 4 },
  switchTrack: {
    backgroundColor: "#cfd5dc",
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    paddingHorizontal: 3,
    width: 48,
  },
  switchTrackOn: { backgroundColor: "#3d7d66" },
  switchKnob: {
    backgroundColor: "#fff",
    borderRadius: 11,
    height: 22,
    width: 22,
  },
  switchKnobOn: { alignSelf: "flex-end" },
  photoCard: {
    backgroundColor: "#fff",
    borderColor: "#d9dee7",
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  photo: { aspectRatio: 4 / 3, width: "100%" },
  photoGallery: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 10,
  },
  photoThumbnailWrap: {
    borderRadius: 10,
    height: 58,
    overflow: "hidden",
    width: 58,
  },
  photoThumbnail: { height: "100%", width: "100%" },
  photoRemove: {
    alignItems: "center",
    backgroundColor: "rgba(16,24,40,0.78)",
    borderRadius: 10,
    height: 20,
    justifyContent: "center",
    position: "absolute",
    right: 3,
    top: 3,
    width: 20,
  },
  photoRemoveText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  photoEmpty: {
    alignItems: "center",
    aspectRatio: 4 / 3,
    backgroundColor: "#eef3f8",
    justifyContent: "center",
  },
  photoEmptyIcon: { color: "#235a96", fontSize: 36 },
  photoEmptyText: {
    color: "#667085",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8,
  },
  photoActions: { flexDirection: "row", gap: 8, padding: 10 },
  photoButton: {
    alignItems: "center",
    backgroundColor: "#f7f8fa",
    borderRadius: 13,
    flex: 1,
    justifyContent: "center",
    minHeight: 52,
  },
  photoButtonText: { color: "#235a96", fontSize: 12, fontWeight: "900" },
  inlineSetup: {
    backgroundColor: "#eef3f8",
    borderRadius: 19,
    gap: 14,
    padding: 16,
  },
  inlineSetupTitle: { color: "#101828", fontSize: 17, fontWeight: "900" },
  inlineSetupBody: { color: "#667085", fontSize: 12, lineHeight: 18 },
  adviceCard: {
    backgroundColor: "#fff7e8",
    borderColor: "#edd3a6",
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  adviceTitle: { color: "#80571b", fontSize: 14, fontWeight: "900" },
  adviceBody: { color: "#805f31", fontSize: 12, lineHeight: 18, marginTop: 6 },
  reviewCard: { backgroundColor: "#173a67", borderRadius: 24, padding: 20 },
  reviewEyebrow: {
    color: "#e7c37f",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  reviewTitle: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginTop: 12,
  },
  reviewBody: {
    color: "rgba(255,255,255,.72)",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
  },
  draftPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,.12)",
    borderRadius: 20,
    marginTop: 18,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  draftPillText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  error: {
    backgroundColor: "#fff0f0",
    borderRadius: 12,
    color: "#b84444",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 18,
    padding: 13,
  },
  footer: {
    backgroundColor: "rgba(248,247,243,.96)",
    borderTopColor: "#e7e4dc",
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    padding: 14,
    position: "absolute",
    right: 0,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#235a96",
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  buttonDisabled: { opacity: 0.55 },
  successPage: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  successIcon: {
    alignItems: "center",
    backgroundColor: "#e6f3ec",
    borderRadius: 42,
    height: 84,
    justifyContent: "center",
    width: 84,
  },
  successIconText: { color: "#2f7d57", fontSize: 40, fontWeight: "900" },
  successEyebrow: {
    color: "#2f7d57",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: 24,
  },
  successTitle: {
    color: "#101828",
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 8,
    textAlign: "center",
  },
  successBody: {
    color: "#667085",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 24,
    marginTop: 9,
    maxWidth: 360,
    textAlign: "center",
  },
  successActions: {
    flexDirection: "row",
    gap: 9,
    marginTop: 10,
    width: "100%",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#d9dee7",
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 54,
  },
  secondaryButtonText: { color: "#235a96", fontSize: 12, fontWeight: "900" },
});
