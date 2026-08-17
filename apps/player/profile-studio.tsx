import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "./satoshi-text";
import type { DunaApiClient, UploadedPlayerMedia } from "./mobile-api";
import { usePlayerRuntime } from "./runtime";

const palette = {
  fog: "#f7f5ef",
  paper: "#ffffff",
  ink: "#111719",
  marine: "#203740",
  muted: "#706a60",
  line: "#dfdfdc",
  aqua: "#2caeb5",
  coral: "#c55b49",
  wash: "#e9eeeb",
} as const;

type PlayerArtworkWorkflow = NonNullable<
  Awaited<
    ReturnType<DunaApiClient["player"]["playerMediaStudio"]["query"]>
  >["workflow"]
>;

function SheetHeader({
  eyebrow,
  onClose,
  title,
}: {
  readonly eyebrow: string;
  readonly onClose: () => void;
  readonly title: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.flex}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      <Pressable
        accessibilityLabel={`Close ${title}`}
        accessibilityRole="button"
        onPress={onClose}
        style={styles.close}
      >
        <Text style={styles.closeText}>×</Text>
      </Pressable>
    </View>
  );
}

function Field({
  autoCapitalize = "sentences",
  keyboardType = "default",
  label,
  onChangeText,
  placeholder,
  value,
}: {
  readonly autoCapitalize?: "none" | "sentences" | "words";
  readonly keyboardType?: "default" | "email-address" | "phone-pad";
  readonly label: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function Choice<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: T) => void;
  readonly options: readonly { readonly label: string; readonly value: T }[];
  readonly value: T;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choices}>
        {options.map((option) => (
          <Pressable
            accessibilityRole="button"
            key={option.value}
            onPress={() => onChange(option.value)}
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

export function ProfileEditorModal({
  onClose,
  visible,
}: {
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  const { client, mode, refresh, settings } = usePlayerRuntime();
  const profile = settings?.profile;
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [homeMarket, setHomeMarket] = useState("");
  const [locale, setLocale] = useState<"en-US" | "es-US" | "pt-BR">("en-US");
  const [visibility, setVisibility] = useState<
    "public" | "members" | "private"
  >("public");
  const [measurementSystem, setMeasurementSystem] = useState<
    "imperial" | "metric"
  >("imperial");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!visible || !profile) return;
    setDisplayName(profile.person.displayName);
    setHandle(profile.person.handle);
    setEmail(profile.email ?? "");
    setPhone(profile.phoneE164 ?? "");
    setHomeMarket(profile.person.homeMarket ?? "");
    setLocale(
      profile.locale === "es-US" || profile.locale === "pt-BR"
        ? profile.locale
        : "en-US",
    );
    setVisibility(profile.visibility);
    setMeasurementSystem(profile.measurementSystem);
    setNotice(undefined);
    setError(undefined);
  }, [profile, visible]);

  const save = async () => {
    setError(undefined);
    setNotice(undefined);
    if (!client || !profile || mode === "preview") {
      setError("Sign in to save your player profile.");
      return;
    }
    if (displayName.trim().length < 2) {
      setError("Add the name players should see.");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle.trim().toLowerCase())) {
      setError(
        "Use lowercase letters, numbers, and single hyphens for your handle.",
      );
      return;
    }
    setBusy(true);
    try {
      await client.player.updateProfile.mutate({
        displayName: displayName.trim(),
        handle: handle.trim().toLowerCase(),
        email: email.trim() || null,
        phoneE164: phone.trim() || null,
        homeMarket: homeMarket.trim() || null,
        visibility,
        locale,
        measurementSystem,
        idempotencyKey: Crypto.randomUUID(),
      });
      await refresh();
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
      setNotice("Your profile is updated everywhere Duna appears.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your profile could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <SheetHeader
            eyebrow="PLAYER IDENTITY"
            onClose={onClose}
            title="Edit profile"
          />
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.introCard}>
              <Text style={styles.introTitle}>One profile, everywhere.</Text>
              <Text style={styles.body}>
                These details update your public player page, match cards, and
                Duna identity. Professional profiles use the same controls and
                add verified tour details automatically.
              </Text>
            </View>
            <Field
              label="Display name"
              onChangeText={setDisplayName}
              value={displayName}
            />
            <Field
              autoCapitalize="none"
              label="Player handle"
              onChangeText={(value) => setHandle(value.toLowerCase())}
              placeholder="your-name"
              value={handle}
            />
            <Field
              autoCapitalize="none"
              keyboardType="email-address"
              label="Email"
              onChangeText={setEmail}
              value={email}
            />
            <Field
              autoCapitalize="none"
              keyboardType="phone-pad"
              label="Phone (international format)"
              onChangeText={setPhone}
              placeholder="+34…"
              value={phone}
            />
            <Field
              label="Home market"
              onChangeText={setHomeMarket}
              value={homeMarket}
            />
            <Choice
              label="Who can see your profile"
              onChange={setVisibility}
              options={[
                { label: "Public", value: "public" },
                { label: "Members", value: "members" },
                { label: "Private", value: "private" },
              ]}
              value={visibility}
            />
            <Choice
              label="Language + region"
              onChange={setLocale}
              options={[
                { label: "English", value: "en-US" },
                { label: "Español", value: "es-US" },
                { label: "Português", value: "pt-BR" },
              ]}
              value={locale}
            />
            <Choice
              label="Measurements"
              onChange={setMeasurementSystem}
              options={[
                { label: "Imperial", value: "imperial" },
                { label: "Metric", value: "metric" },
              ]}
              value={measurementSystem}
            />
            {notice && <Text style={styles.notice}>{notice}</Text>}
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void save()}
              style={[styles.primary, busy && styles.disabled]}
            >
              {busy && <ActivityIndicator color={palette.paper} size="small" />}
              <Text style={styles.primaryText}>
                {busy ? "Saving…" : "Save profile"}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

type SelectedPhoto = ImagePicker.ImagePickerAsset & {
  readonly localId: string;
  readonly uploadError?: string;
  readonly uploadStatus: "queued" | "uploading" | "uploaded" | "failed";
};

function isHighResolutionArtworkPhoto(photo: {
  readonly height: number;
  readonly width: number;
}) {
  return (
    Math.min(photo.width, photo.height) >= 1_080 &&
    photo.width * photo.height >= 2_000_000
  );
}

function photoUploadLabel(photo: SelectedPhoto) {
  if (!isHighResolutionArtworkPhoto(photo)) return "REPLACE";
  if (photo.uploadStatus === "uploaded") return "READY";
  if (photo.uploadStatus === "failed") return "RETRY";
  return "UPLOADING";
}

function artworkStatus(status: string | undefined) {
  if (status === "published") return "Published on your profile";
  if (status === "review") return "Ready for your review";
  if (status === "generating") return "Duna is creating your artwork";
  if (status === "ready") return "Ready for Duna production";
  if (status === "failed") return "Production needs attention";
  return "No artwork request yet";
}

export function PlayerArtworkModal({
  onClose,
  visible,
}: {
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  const { client, mode, refresh, uploadPlayerMedia } = usePlayerRuntime();
  const [photos, setPhotos] = useState<readonly SelectedPhoto[]>([]);
  const [brief, setBrief] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [workflow, setWorkflow] = useState<PlayerArtworkWorkflow>();
  const [approvalBusy, setApprovalBusy] = useState(false);
  const uploadedPhotos = useRef(new Map<string, UploadedPlayerMedia>());
  const uploadPromises = useRef(
    new Map<string, Promise<UploadedPlayerMedia>>(),
  );

  useEffect(() => {
    if (!visible || !client || mode === "preview") return;
    let active = true;
    void client.player.playerMediaStudio
      .query()
      .then((studio) => {
        if (active) setWorkflow(studio.workflow);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, mode, visible]);

  const validPhotos = useMemo(
    () => photos.filter(isHighResolutionArtworkPhoto),
    [photos],
  );

  const uploadCounts = useMemo(
    () => ({
      failed: photos.filter((photo) => photo.uploadStatus === "failed").length,
      ready: photos.filter((photo) => photo.uploadStatus === "uploaded").length,
      uploading: photos.filter(
        (photo) =>
          isHighResolutionArtworkPhoto(photo) &&
          (photo.uploadStatus === "queued" ||
            photo.uploadStatus === "uploading"),
      ).length,
    }),
    [photos],
  );

  const startPhotoUpload = useCallback(
    (photo: SelectedPhoto): Promise<UploadedPlayerMedia> => {
      const uploaded = uploadedPhotos.current.get(photo.localId);
      if (uploaded) return Promise.resolve(uploaded);

      const pending = uploadPromises.current.get(photo.localId);
      if (pending) return pending;

      if (!uploadPlayerMedia || mode === "preview") {
        return Promise.reject(
          new Error("Sign in to upload your artwork photos."),
        );
      }

      setPhotos((current) =>
        current.map((item) =>
          item.localId === photo.localId
            ? { ...item, uploadError: undefined, uploadStatus: "uploading" }
            : item,
        ),
      );

      const promise = uploadPlayerMedia({
        uri: photo.uri,
        name: photo.fileName ?? `duna-action-${photo.localId}.jpg`,
        type: photo.mimeType ?? "image/jpeg",
        width: photo.width,
        height: photo.height,
      })
        .then((nextUploaded) => {
          uploadedPhotos.current.set(photo.localId, nextUploaded);
          setPhotos((current) =>
            current.map((item) =>
              item.localId === photo.localId
                ? {
                    ...item,
                    uploadError: undefined,
                    uploadStatus: "uploaded",
                  }
                : item,
            ),
          );
          return nextUploaded;
        })
        .catch((reason: unknown) => {
          const message =
            reason instanceof Error
              ? reason.message
              : "This photo could not be uploaded.";
          setPhotos((current) =>
            current.map((item) =>
              item.localId === photo.localId
                ? { ...item, uploadError: message, uploadStatus: "failed" }
                : item,
            ),
          );
          throw reason;
        })
        .finally(() => {
          uploadPromises.current.delete(photo.localId);
        });

      uploadPromises.current.set(photo.localId, promise);
      return promise;
    },
    [mode, uploadPlayerMedia],
  );

  useEffect(() => {
    if (!visible || mode === "preview" || !uploadPlayerMedia) return;
    for (const photo of photos) {
      if (
        photo.uploadStatus === "queued" &&
        isHighResolutionArtworkPhoto(photo)
      ) {
        void startPhotoUpload(photo).catch(() => undefined);
      }
    }
  }, [mode, photos, startPhotoUpload, uploadPlayerMedia, visible]);

  const choosePhotos = async () => {
    setError(undefined);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo access to choose your playing images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: Math.max(1, 5 - photos.length),
      // Expo 57 defaults to `Current`, which preserves HEIC/HEIF. Asking iOS
      // for its automatic representation restores the portable JPEG path.
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Automatic,
      quality: 1,
      orderedSelection: true,
    });
    if (result.canceled) return;
    const selected = result.assets.map((asset) => ({
      ...asset,
      localId: `${asset.uri}-${Crypto.randomUUID()}`,
      uploadStatus: "queued" as const,
    }));
    const tooSmall = selected.filter(
      (asset) => !isHighResolutionArtworkPhoto(asset),
    );
    setPhotos((current) => [...current, ...selected].slice(0, 5));
    if (tooSmall.length) {
      setError(
        `${tooSmall.length} photo${tooSmall.length === 1 ? " is" : "s are"} below 1080px on the short edge. Replace ${tooSmall.length === 1 ? "it" : "them"} before submitting.`,
      );
    }
  };

  const submit = async () => {
    setError(undefined);
    setNotice(undefined);
    if (!client || !uploadPlayerMedia || mode === "preview") {
      setError("Sign in to create profile artwork.");
      return;
    }
    if (photos.length < 2 || photos.length > 5) {
      setError("Choose two to five action or active playing photos.");
      return;
    }
    if (validPhotos.length !== photos.length) {
      setError("Replace every low-resolution photo before submitting.");
      return;
    }
    if (!rightsConfirmed) {
      setError("Confirm that you own or can use every photo.");
      return;
    }
    setBusy(true);
    try {
      setProgress("Finishing photo uploads");
      const uploads = await Promise.all(photos.map(startPhotoUpload));
      const referenceImages = uploads.map((uploaded) => ({
        url: uploaded.url,
        kind: "action" as const,
        width: uploaded.width,
        height: uploaded.height,
      }));
      setProgress("Creating your review package");
      const workflow = await client.player.createPlayerMediaWorkflow.mutate({
        referenceImages,
        brief: brief.trim() || undefined,
        rightsConfirmed: true,
        idempotencyKey: Crypto.randomUUID(),
      });
      await refresh();
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
      setWorkflow((current) =>
        current ? { ...current, status: workflow.status } : undefined,
      );
      setNotice(
        "Artwork creation started immediately. It stays in review until you approve it.",
      );
      setPhotos([]);
      uploadedPhotos.current.clear();
      uploadPromises.current.clear();
      setBrief("");
      setRightsConfirmed(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your artwork request could not be created.",
      );
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  };

  const approveArtwork = async () => {
    if (!client || !workflow) return;
    setError(undefined);
    setNotice(undefined);
    setApprovalBusy(true);
    try {
      await client.player.approveOwnPlayerMediaWorkflow.mutate({
        workflowId: workflow.id,
        idempotencyKey: Crypto.randomUUID(),
      });
      await refresh();
      const studio = await client.player.playerMediaStudio.query();
      setWorkflow(studio.workflow);
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
      setNotice("Your approved artwork is now live on your Duna profile.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your artwork package could not be approved.",
      );
    } finally {
      setApprovalBusy(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <SheetHeader
            eyebrow="DUNA ARTWORK"
            onClose={onClose}
            title="Create your look"
          />
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.artworkHero}>
              <Text style={styles.artworkHeroNumber}>2–5</Text>
              <Text style={styles.artworkHeroTitle}>
                Active playing photos.
              </Text>
              <Text style={styles.artworkHeroBody}>
                Choose original, high-resolution action images with varied
                movement and at least one clear view of your face. Every image
                needs 1080px or more on its short edge.
              </Text>
            </View>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <View style={styles.flex}>
                <Text style={styles.fieldLabel}>LATEST PACKAGE</Text>
                <Text style={styles.statusText}>
                  {artworkStatus(workflow?.status)}
                </Text>
              </View>
            </View>
            {workflow?.status === "review" &&
              workflow.outputImages.length > 0 && (
                <View style={styles.reviewPackage}>
                  <Text style={styles.fieldLabel}>READY FOR YOUR APPROVAL</Text>
                  <Text style={styles.reviewTitle}>
                    Your artwork package is ready.
                  </Text>
                  <Text style={styles.reviewBody}>
                    Review the generated look below. Approving publishes it to
                    your profile; you can create another package whenever you
                    want a different direction.
                  </Text>
                  <ScrollView
                    contentContainerStyle={styles.reviewImages}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                  >
                    {workflow.outputImages.map((output, index) => (
                      <Image
                        key={output.url}
                        accessibilityLabel={`Artwork option ${index + 1}`}
                        source={{ uri: output.url }}
                        style={styles.reviewImage}
                      />
                    ))}
                  </ScrollView>
                  <Pressable
                    accessibilityRole="button"
                    disabled={approvalBusy}
                    onPress={() => void approveArtwork()}
                    style={[
                      styles.approveArtwork,
                      approvalBusy && styles.disabled,
                    ]}
                  >
                    {approvalBusy && (
                      <ActivityIndicator color={palette.paper} size="small" />
                    )}
                    <Text style={styles.approveArtworkText}>
                      {approvalBusy ? "Publishing artwork…" : "Approve artwork"}
                    </Text>
                  </Pressable>
                </View>
              )}
            <View style={styles.photoGrid}>
              {photos.map((photo, index) => {
                const highResolution = isHighResolutionArtworkPhoto(photo);
                const uploadLabel = photoUploadLabel(photo);
                return (
                  <View key={photo.localId} style={styles.photoCard}>
                    <Image source={{ uri: photo.uri }} style={styles.photo} />
                    <View style={styles.photoMeta}>
                      <Text style={styles.photoNumber}>
                        {String(index + 1).padStart(2, "0")}
                      </Text>
                      <Text
                        style={[
                          styles.photoQuality,
                          (!highResolution ||
                            photo.uploadStatus === "failed") &&
                            styles.photoQualityBad,
                        ]}
                      >
                        {uploadLabel}
                      </Text>
                      {highResolution &&
                        (photo.uploadStatus === "queued" ||
                          photo.uploadStatus === "uploading") && (
                          <ActivityIndicator color={palette.aqua} size={10} />
                        )}
                    </View>
                    {photo.uploadStatus === "failed" && highResolution && (
                      <Pressable
                        accessibilityLabel={`Retry action photo ${index + 1}`}
                        accessibilityRole="button"
                        onPress={() =>
                          void startPhotoUpload(photo).catch(() => undefined)
                        }
                        style={styles.retryPhoto}
                      >
                        <Text style={styles.retryPhotoText}>Retry upload</Text>
                      </Pressable>
                    )}
                    <Pressable
                      accessibilityLabel={`Remove action photo ${index + 1}`}
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => {
                        uploadedPhotos.current.delete(photo.localId);
                        setPhotos((current) =>
                          current.filter(
                            (item) => item.localId !== photo.localId,
                          ),
                        );
                      }}
                      style={styles.removePhoto}
                    >
                      <Text style={styles.removePhotoText}>×</Text>
                    </Pressable>
                  </View>
                );
              })}
              {photos.length < 5 && (
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void choosePhotos()}
                  style={styles.addPhoto}
                >
                  <Text style={styles.addPhotoIcon}>＋</Text>
                  <Text style={styles.addPhotoText}>
                    {photos.length ? "Add more" : "Choose photos"}
                  </Text>
                  <Text style={styles.addPhotoMeta}>
                    {photos.length}/5 selected
                  </Text>
                </Pressable>
              )}
            </View>
            {uploadCounts.uploading > 0 && (
              <Text style={styles.progress}>
                Uploading {uploadCounts.uploading} photo
                {uploadCounts.uploading === 1 ? "" : "s"} now. Keep going—this
                continues in the background.
              </Text>
            )}
            {photos.length > 0 &&
              validPhotos.length === photos.length &&
              uploadCounts.ready === validPhotos.length &&
              uploadCounts.failed === 0 && (
                <Text style={styles.uploadReady}>
                  ✓ Photos uploaded. Finish your direction and submit when
                  ready.
                </Text>
              )}
            {uploadCounts.failed > 0 && (
              <Text style={styles.error}>
                {uploadCounts.failed} photo
                {uploadCounts.failed === 1 ? " needs" : "s need"} another upload
                attempt. Tap Retry on the photo.{" "}
                {
                  photos.find((photo) => photo.uploadStatus === "failed")
                    ?.uploadError
                }
              </Text>
            )}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>
                CREATIVE DIRECTION · OPTIONAL
              </Text>
              <TextInput
                maxLength={1_000}
                multiline
                onChangeText={setBrief}
                placeholder="Energetic defender, warm sunset, preserve my uniform colors…"
                placeholderTextColor={palette.muted}
                style={[styles.input, styles.textarea]}
                value={brief}
              />
            </View>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: rightsConfirmed }}
              onPress={() => setRightsConfirmed((value) => !value)}
              style={styles.rights}
            >
              <View
                style={[
                  styles.checkbox,
                  rightsConfirmed && styles.checkboxChecked,
                ]}
              >
                <Text style={styles.checkboxText}>
                  {rightsConfirmed ? "✓" : ""}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.rightsTitle}>
                  I own or can use these photos.
                </Text>
                <Text style={styles.rightsBody}>
                  Duna may use them to create profile artwork that stays in
                  review until I approve it.
                </Text>
              </View>
            </Pressable>
            {progress && <Text style={styles.progress}>{progress}</Text>}
            {notice && <Text style={styles.notice}>{notice}</Text>}
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void submit()}
              style={[styles.primary, busy && styles.disabled]}
            >
              {busy && <ActivityIndicator color={palette.paper} size="small" />}
              <Text style={styles.primaryText}>
                {busy ? "Preparing artwork…" : "Create profile artwork"}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  addPhoto: {
    alignItems: "center",
    backgroundColor: palette.wash,
    borderColor: palette.marine,
    borderRadius: 20,
    borderStyle: "dashed",
    borderWidth: 1,
    height: 172,
    justifyContent: "center",
    width: "48.3%",
  },
  addPhotoIcon: { color: palette.marine, fontSize: 30 },
  addPhotoMeta: { color: palette.muted, fontSize: 12, marginTop: 4 },
  addPhotoText: { color: palette.marine, fontSize: 15, fontWeight: "800" },
  approveArtwork: {
    alignItems: "center",
    backgroundColor: palette.marine,
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 16,
  },
  approveArtworkText: { color: palette.paper, fontSize: 15, fontWeight: "900" },
  artworkHero: {
    backgroundColor: palette.marine,
    borderRadius: 24,
    overflow: "hidden",
    padding: 22,
  },
  artworkHeroBody: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  artworkHeroNumber: {
    color: palette.aqua,
    fontFamily: "Archivo-Hero",
    fontSize: 48,
    fontWeight: "900",
  },
  artworkHeroTitle: { color: palette.paper, fontSize: 25, fontWeight: "800" },
  body: { color: palette.muted, fontSize: 15, lineHeight: 22, marginTop: 6 },
  checkbox: {
    alignItems: "center",
    borderColor: palette.marine,
    borderRadius: 7,
    borderWidth: 1.5,
    height: 25,
    justifyContent: "center",
    width: 25,
  },
  checkboxChecked: { backgroundColor: palette.marine },
  checkboxText: { color: palette.paper, fontSize: 14, fontWeight: "900" },
  choice: {
    alignItems: "center",
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 8,
  },
  choiceSelected: {
    backgroundColor: palette.marine,
    borderColor: palette.marine,
  },
  choiceText: { color: palette.marine, fontSize: 13, fontWeight: "800" },
  choiceTextSelected: { color: palette.paper },
  choices: { flexDirection: "row", gap: 8 },
  close: {
    alignItems: "center",
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  closeText: { color: palette.ink, fontSize: 29, lineHeight: 33 },
  content: { gap: 18, padding: 20, paddingBottom: 54 },
  disabled: { opacity: 0.55 },
  error: {
    color: palette.coral,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  eyebrow: {
    color: palette.marine,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  field: { gap: 7 },
  fieldLabel: {
    color: palette.marine,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  flex: { flex: 1, minWidth: 0 },
  header: {
    alignItems: "center",
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  input: {
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  introCard: {
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  introTitle: { color: palette.ink, fontSize: 22, fontWeight: "800" },
  notice: {
    backgroundColor: palette.wash,
    borderRadius: 12,
    color: palette.marine,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    padding: 13,
  },
  photo: { height: 124, width: "100%" },
  photoCard: {
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    height: 172,
    overflow: "hidden",
    width: "48.3%",
  },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  photoNumber: {
    color: palette.marine,
    fontFamily: "Archivo-Chip",
    fontSize: 12,
    fontWeight: "900",
  },
  photoQuality: { color: palette.aqua, fontSize: 12, fontWeight: "900" },
  photoQualityBad: { color: palette.coral },
  primary: {
    alignItems: "center",
    backgroundColor: palette.marine,
    borderRadius: 16,
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 18,
  },
  primaryText: { color: palette.paper, fontSize: 16, fontWeight: "900" },
  progress: { color: palette.marine, fontSize: 14, fontWeight: "800" },
  reviewBody: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  reviewImage: {
    backgroundColor: palette.wash,
    borderRadius: 14,
    height: 176,
    width: 132,
  },
  reviewImages: { gap: 10, paddingVertical: 14 },
  reviewPackage: {
    backgroundColor: "#e7f1f2",
    borderColor: "#b7dadd",
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  reviewTitle: {
    color: palette.marine,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  removePhoto: {
    alignItems: "center",
    backgroundColor: "rgba(17,23,25,0.78)",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    position: "absolute",
    right: 8,
    top: 8,
    width: 32,
  },
  removePhotoText: { color: palette.paper, fontSize: 21, lineHeight: 24 },
  retryPhoto: {
    alignItems: "center",
    backgroundColor: palette.paper,
    bottom: 0,
    justifyContent: "center",
    left: 0,
    minHeight: 48,
    position: "absolute",
    right: 0,
  },
  retryPhotoText: { color: palette.coral, fontSize: 12, fontWeight: "900" },
  rights: {
    alignItems: "flex-start",
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 76,
    padding: 15,
  },
  rightsBody: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  rightsTitle: { color: palette.ink, fontSize: 15, fontWeight: "800" },
  safe: { backgroundColor: palette.fog, flex: 1 },
  statusDot: {
    backgroundColor: palette.aqua,
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  statusRow: {
    alignItems: "center",
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  statusText: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 3,
  },
  textarea: { minHeight: 112, textAlignVertical: "top" },
  title: { color: palette.ink, fontSize: 25, fontWeight: "800", marginTop: 2 },
  uploadReady: {
    color: palette.marine,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
  },
});
