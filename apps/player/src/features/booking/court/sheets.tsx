/**
 * The court booking flow's sheets (M-P3; owner feedback image 38, Playtomic
 * image 50): every one closes (a Close button, the scrim, the system back).
 *
 * - `DunaPlayersSheet`: "Choose Duna players". Suggestions first (frequent
 *   partners, then connections and nearby players), each with their photo,
 *   Sand Rating (a dash while provisional) and reliability, and a one-tap
 *   Add; then search everyone on Duna.
 * - `InviteSheet`: "Invite someone" outside Duna. Pick from the phone's
 *   contacts (the permission is asked here, after saying why, and only the
 *   one picked person's name and number are used), or type a name and a
 *   mobile number or email; then a review of who gets what before adding.
 * - `PolicySheet`: the venue's cancellation policy, read (to the end when
 *   the venue requires it) and accepted.
 */
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import type { PersonSummary } from "@duna/core";
import { report } from "@duna/observability";
import {
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  Text,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { AdaptiveSheet } from "@duna/ui/native/layout";
import * as Contacts from "expo-contacts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NativeMarkdownContent } from "../../../../markdown-content";
import {
  policyScrollReachedEnd,
  type PolicyScrollMetrics,
} from "../../../../policy-review";
import { usePlayerRuntime } from "../../../../runtime";
import { PersonAvatar } from "../../../shared/PersonAvatar";
import { ActionButton } from "../../find/parts";
import { DunaTextInput } from "../../score/duna-text";
import type { BookingParticipant } from "../../courts/court-types";
import {
  contactRoutes,
  contactToGuest,
  manualGuest,
  sandRatingText,
  suggestionOrder,
  type ContactRoute,
} from "./roster";
import { SectionLabel } from "./parts";

type TeammateResult = Awaited<
  ReturnType<
    NonNullable<
      ReturnType<typeof usePlayerRuntime>["client"]
    >["player"]["teammateSearch"]["query"]
  >
>[number];

const RELIABILITY_WORDS: Readonly<Record<string, string>> = {
  new: "New to Duna",
  building: "Building a record",
  "needs-context": "Mixed attendance",
  reliable: "Reliable",
  "highly-reliable": "Very reliable",
};

/** A sheet's header: one heading and a Close (or Done) that always works. */
export function SheetHeader({
  title,
  onClose,
  closeLabel = "Close",
  leading,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly closeLabel?: string;
  readonly leading?: ReactNode;
}) {
  const { colors, tokens } = useTheme();
  return (
    <View
      style={[
        styles.header,
        {
          paddingHorizontal: tokens.space["4"],
          paddingVertical: tokens.space["2"],
          borderBottomColor: colors.line,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      {leading}
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={styles.fill}
        variant="phone-heading"
      >
        {title}
      </Text>
      <Pressable
        accessibilityLabel={closeLabel}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onClose}
        style={({ pressed }) => [
          styles.headerButton,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        {closeLabel === "Close" ? (
          <Icon color={colors.text} name="close" size="control" />
        ) : (
          <Text variant="phone-body" weight={600}>
            {closeLabel}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

export function DunaPlayersSheet({
  visible,
  selected,
  excludedPersonIds,
  maxSelected,
  onChange,
  onClose,
}: {
  readonly visible: boolean;
  readonly selected: readonly PersonSummary[];
  readonly excludedPersonIds: readonly string[];
  readonly maxSelected: number;
  readonly onChange: (players: readonly PersonSummary[]) => void;
  readonly onClose: () => void;
}) {
  const runtime = usePlayerRuntime();
  const haptics = useHaptics();
  const { colors, tokens } = useTheme();
  const client = runtime.mode === "live" ? runtime.client : undefined;
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<readonly TeammateResult[]>();
  const [results, setResults] = useState<readonly TeammateResult[]>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const excluded = new Set(excludedPersonIds);
  const chosen = new Set(selected.map((person) => person.id));

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults(undefined);
      return;
    }
    if (!client) return;
    let active = true;
    setError(undefined);
    void client.player.teammateSearch
      .query({ limit: 20 })
      .then((next) => {
        if (active) setSuggestions(suggestionOrder(next));
      })
      .catch((reason: unknown) => {
        if (active)
          setError(report(reason, { event: "player.court.players_failed" }));
      });
    return () => {
      active = false;
    };
  }, [attempt, client, visible]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const search = (value: string) => {
    setQuery(value);
    clearTimeout(timer.current);
    if (!client || value.trim().length < 2) {
      setResults(undefined);
      return;
    }
    // Debounced: one search after the person pauses typing.
    timer.current = setTimeout(() => {
      void client.player.teammateSearch
        .query({ query: value.trim(), limit: 20 })
        .then(setResults)
        .catch((reason: unknown) =>
          setError(
            report(reason, { event: "player.court.players_search_failed" }),
          ),
        );
    }, 250);
  };

  const toggle = (person: PersonSummary) => {
    if (chosen.has(person.id)) {
      haptics.selection();
      onChange(selected.filter((entry) => entry.id !== person.id));
      return;
    }
    if (selected.length >= maxSelected) {
      haptics.refused();
      return;
    }
    haptics.confirmed(0);
    onChange([...selected, person]);
  };

  const visibleSuggestions = (suggestions ?? []).filter(
    (entry) => !excluded.has(entry.person.id),
  );
  const list = (results ?? []).filter(
    (entry) => !excluded.has(entry.person.id),
  );

  return (
    <AdaptiveSheet
      accessibilityLabel="Choose Duna players"
      kind="dialog"
      onClose={onClose}
      testID="duna-players-sheet"
      visible={visible}
    >
      <SheetHeader
        closeLabel="Done"
        onClose={onClose}
        title="Choose Duna players"
      />
      <ScrollView
        contentContainerStyle={{
          padding: tokens.space["4"],
          gap: tokens.space["4"],
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.search,
            {
              backgroundColor: colors["surface-sunken"],
              borderRadius: tokens.radius.pill,
              paddingHorizontal: tokens.space["4"],
              gap: tokens.space["2"],
            },
          ]}
        >
          <Icon color={colors["text-2"]} name="search" size="control" />
          <DunaTextInput
            accessibilityLabel="Search players by name"
            autoCapitalize="words"
            autoCorrect={false}
            onChangeText={search}
            placeholder="Search players by name"
            returnKeyType="search"
            style={styles.fill}
            value={query}
          />
        </View>
        {!client ? (
          <EmptyState
            text="Sign in to see your partners and everyone on Duna."
            title="Players appear when you're signed in"
          />
        ) : error ? (
          <ErrorState
            onRetry={() => setAttempt((count) => count + 1)}
            reference={error}
            text="Check your connection and try again."
            title="Players didn't load"
          />
        ) : !suggestions ? (
          <LoadingState label="Loading players" loading skeleton="row" />
        ) : null}
        {results === undefined && visibleSuggestions.length > 0 ? (
          <View style={{ gap: tokens.space["2"] }}>
            <SectionLabel>Suggestions</SectionLabel>
            <ScrollView
              contentContainerStyle={{ gap: tokens.space["3"] }}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {visibleSuggestions.map((entry) => (
                <SuggestionCard
                  added={chosen.has(entry.person.id)}
                  entry={entry}
                  key={entry.person.id}
                  onToggle={() => toggle(entry.person)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}
        {results !== undefined ? (
          <View style={{ gap: tokens.space["1"] }}>
            <SectionLabel>{`Players · ${list.length}`}</SectionLabel>
            {list.length === 0 ? (
              <Text tone="text-2" variant="phone-body">
                {`No one on Duna matches "${query.trim()}". Invite them instead.`}
              </Text>
            ) : (
              list.map((entry) => (
                <PlayerRow
                  added={chosen.has(entry.person.id)}
                  entry={entry}
                  key={entry.person.id}
                  onToggle={() => toggle(entry.person)}
                />
              ))
            )}
          </View>
        ) : null}
        {selected.length >= maxSelected ? (
          <Text tone="warning" variant="phone-meta">
            {`That's the most a booking takes (${maxSelected + 1} players).`}
          </Text>
        ) : null}
      </ScrollView>
    </AdaptiveSheet>
  );
}

function AddButton({
  added,
  name,
  onPress,
}: {
  readonly added: boolean;
  readonly name: string;
  readonly onPress: () => void;
}) {
  const { colors, tokens } = useTheme();
  return (
    <Pressable
      accessibilityLabel={added ? `Remove ${name}` : `Add ${name}`}
      accessibilityRole="button"
      accessibilityState={{ selected: added }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.add,
        {
          borderRadius: tokens.radius.pill,
          backgroundColor: added ? colors["positive-wash"] : colors.action,
          paddingHorizontal: tokens.space["4"],
          gap: tokens.space["1"],
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Icon
        color={added ? colors.positive : colors["on-action"]}
        name={added ? "check" : "plus"}
        size="inline"
      />
      <Text
        style={{ color: added ? colors.positive : colors["on-action"] }}
        variant="phone-meta"
        weight={600}
      >
        {added ? "Added" : "Add"}
      </Text>
    </Pressable>
  );
}

function SuggestionCard({
  entry,
  added,
  onToggle,
}: {
  readonly entry: TeammateResult;
  readonly added: boolean;
  readonly onToggle: () => void;
}) {
  const { colors, tokens } = useTheme();
  const person = entry.person;
  return (
    <View
      style={[
        styles.card,
        {
          width: 156,
          padding: tokens.space["3"],
          gap: tokens.space["2"],
          borderRadius: tokens.radius.xl,
          backgroundColor: colors.surface,
          borderColor: added ? colors.positive : colors.line,
          borderWidth: added ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <PersonAvatar
        badge={added ? { icon: "check", tone: "positive" } : undefined}
        name={person.displayName}
        photoUrl={person.avatarUrl}
        size={64}
      />
      <Text
        numberOfLines={1}
        style={styles.center}
        variant="phone-body"
        weight={600}
      >
        {person.displayName}
      </Text>
      <Text
        numberOfLines={1}
        style={styles.center}
        tone="text-2"
        variant="phone-meta"
      >
        {entry.relationship === "recent-partner"
          ? `Played together${entry.sharedTeams > 1 ? ` ${entry.sharedTeams}×` : ""}`
          : entry.relationship === "connection"
            ? "You follow each other"
            : entry.relationship === "nearby"
              ? "Plays near you"
              : person.homeMarket}
      </Text>
      <Text
        accessibilityLabel={`Sand Rating ${sandRatingText(person.rating) === "–" ? "provisional" : sandRatingText(person.rating)}`}
        tabular
        variant="phone-meta"
        weight={600}
      >
        {`Sand Rating ${sandRatingText(person.rating)}`}
      </Text>
      <AddButton added={added} name={person.displayName} onPress={onToggle} />
    </View>
  );
}

function PlayerRow({
  entry,
  added,
  onToggle,
}: {
  readonly entry: TeammateResult;
  readonly added: boolean;
  readonly onToggle: () => void;
}) {
  const { tokens } = useTheme();
  const person = entry.person;
  return (
    <View style={[styles.rowLine, { gap: tokens.space["3"], minHeight: 64 }]}>
      <PersonAvatar
        name={person.displayName}
        photoUrl={person.avatarUrl}
        size={44}
      />
      <View style={styles.fill}>
        <Text numberOfLines={1} variant="phone-body" weight={600}>
          {person.displayName}
        </Text>
        <Text numberOfLines={1} tone="text-2" variant="phone-meta">
          {`Sand Rating ${sandRatingText(person.rating)} · ${RELIABILITY_WORDS[entry.reliability.label] ?? "New to Duna"}`}
        </Text>
      </View>
      <AddButton added={added} name={person.displayName} onPress={onToggle} />
    </View>
  );
}

type InviteStage =
  | { readonly kind: "start" }
  | { readonly kind: "asking" }
  | { readonly kind: "denied" }
  | {
      readonly kind: "routes";
      readonly name: string;
      readonly routes: readonly ContactRoute[];
    }
  | { readonly kind: "manual" }
  | { readonly kind: "review"; readonly guest: BookingParticipant };

/**
 * Invite someone outside Duna. Nothing leaves the phone here: "Add to
 * booking" puts them on the roster, and the invitation is sent when the
 * person books (with their share, when splitting).
 */
export function InviteSheet({
  visible,
  onAdd,
  onClose,
  shareNote,
}: {
  readonly visible: boolean;
  /** Returns an error message when the guest can't be added. */
  readonly onAdd: (guest: BookingParticipant) => string | undefined;
  readonly onClose: () => void;
  /** What the invitee will be asked to pay, in words ("Pays $7.50"). */
  readonly shareNote?: string;
}) {
  const haptics = useHaptics();
  const { colors, tokens } = useTheme();
  const [stage, setStage] = useState<InviteStage>({ kind: "start" });
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!visible) return;
    setStage({ kind: "start" });
    setName("");
    setTarget("");
    setError(undefined);
  }, [visible]);

  const pick = async () => {
    setError(undefined);
    setStage({ kind: "asking" });
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (permission.status !== "granted") {
        haptics.refused();
        setStage({ kind: "denied" });
        return;
      }
      const contact = await Contacts.Contact.presentPicker();
      if (!contact) {
        setStage({ kind: "start" });
        return;
      }
      const [fullName, phones, emails] = await Promise.all([
        contact.getFullName().catch(() => ""),
        contact.getPhones().catch(() => []),
        contact.getEmails().catch(() => []),
      ]);
      const routes = contactRoutes({
        name: fullName,
        phones: phones.map((phone) => ({
          label: phone.label,
          number: phone.number,
        })),
        emails: emails.map((email) => ({
          label: email.label,
          address: email.address,
        })),
      });
      if (routes.length === 0) {
        setName(fullName);
        setError(
          `${fullName || "That contact"} has no mobile number or email. Type one below.`,
        );
        setStage({ kind: "manual" });
        return;
      }
      haptics.selection();
      if (routes.length === 1) {
        setStage({
          kind: "review",
          guest: contactToGuest(fullName, routes[0]!),
        });
        return;
      }
      setStage({ kind: "routes", name: fullName, routes });
    } catch (reason) {
      const reference = report(reason, {
        event: "player.court.contact_pick_failed",
      });
      setError(
        `Contacts didn't open (reference ${reference}). Type their details instead.`,
      );
      setStage({ kind: "manual" });
    }
  };

  const reviewManual = () => {
    const result = manualGuest(name, target);
    if ("error" in result) {
      haptics.refused();
      setError(result.error);
      return;
    }
    setError(undefined);
    setStage({ kind: "review", guest: result.guest });
  };

  let body: ReactNode;
  if (stage.kind === "review") {
    const guest = stage.guest;
    const who = guest.name ?? guest.phoneE164 ?? guest.email ?? "Your guest";
    body = (
      <View style={{ gap: tokens.space["4"] }}>
        <View style={[styles.rowLine, { gap: tokens.space["3"] }]}>
          <PersonAvatar name={who} size={56} />
          <View style={styles.fill}>
            <Text variant="phone-body" weight={600}>
              {who}
            </Text>
            <Text tone="text-2" variant="phone-meta">
              {guest.phoneE164 ?? guest.email}
            </Text>
          </View>
        </View>
        <View
          style={{
            gap: tokens.space["2"],
            padding: tokens.space["3"],
            borderRadius: tokens.radius.lg,
            backgroundColor: colors["surface-sunken"],
          }}
        >
          <SectionLabel>Who gets what</SectionLabel>
          <Text variant="phone-body">
            {guest.phoneE164
              ? `When you book, Duna texts ${who.split(/\s+/)[0]} an invitation link to ${guest.phoneE164}.`
              : `When you book, Duna emails ${who.split(/\s+/)[0]} an invitation link at ${guest.email}.`}
          </Text>
          <Text tone="text-2" variant="phone-meta">
            {shareNote
              ? `${shareNote} through that link.`
              : "They join your booking; you're paying for the court."}
          </Text>
          <Text tone="text-2" variant="phone-meta">
            Only this name and this number or email leave your phone, and only
            when you book. You can also send the link yourself afterwards.
          </Text>
        </View>
        <ActionButton
          label={`Add ${who.split(/\s+/)[0]} to the booking`}
          onPress={() => {
            const refused = onAdd(guest);
            if (refused) {
              haptics.refused();
              setError(refused);
              return;
            }
            haptics.confirmed(0);
            onClose();
          }}
          testID="invite-add"
        />
        <ActionButton
          kind="quiet"
          label="Change"
          onPress={() => setStage({ kind: "start" })}
        />
      </View>
    );
  } else if (stage.kind === "routes") {
    body = (
      <View style={{ gap: tokens.space["2"] }}>
        <Text variant="phone-body">{`How should ${stage.name.split(/\s+/)[0] || "they"} get the invitation?`}</Text>
        {stage.routes.map((route) => (
          <Pressable
            accessibilityLabel={`${route.kind === "text" ? "Text" : "Email"} ${route.value}`}
            accessibilityRole="button"
            key={route.value}
            onPress={() => {
              haptics.selection();
              setStage({
                kind: "review",
                guest: contactToGuest(stage.name, route),
              });
            }}
            style={({ pressed }) => [
              styles.rowLine,
              {
                gap: tokens.space["3"],
                minHeight: 56,
                paddingHorizontal: tokens.space["3"],
                borderRadius: tokens.radius.lg,
                backgroundColor: colors.surface,
                borderColor: colors.line,
                borderWidth: StyleSheet.hairlineWidth,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Icon
              name={route.kind === "text" ? "phone-bubble" : "mail"}
              size="control"
            />
            <View style={styles.fill}>
              <Text variant="phone-body" weight={600}>
                {route.value}
              </Text>
              <Text tone="text-2" variant="phone-meta">
                {route.label}
              </Text>
            </View>
            <Icon
              color={colors["text-3"]}
              name="chevron-right"
              size="control"
            />
          </Pressable>
        ))}
      </View>
    );
  } else {
    const manual = stage.kind === "manual" || stage.kind === "denied";
    body = (
      <View style={{ gap: tokens.space["4"] }}>
        {stage.kind === "denied" ? (
          <View
            style={{
              gap: tokens.space["2"],
              padding: tokens.space["3"],
              borderRadius: tokens.radius.lg,
              backgroundColor: colors["warning-wash"],
            }}
          >
            <Text variant="phone-body" weight={600}>
              Contacts are off for Duna
            </Text>
            <Text tone="text-2" variant="phone-meta">
              Type their name and mobile number or email below, or turn Contacts
              on in Settings.
            </Text>
            <ActionButton
              kind="secondary"
              label="Open Settings"
              onPress={() => void Linking.openSettings()}
            />
          </View>
        ) : null}
        {!manual ? (
          <>
            <Text tone="text-2" variant="phone-body">
              Choose one person from your contacts. Duna uses only their name
              and the number or email you pick, and only when you book. Your
              address book is never uploaded.
            </Text>
            <ActionButton
              busy={stage.kind === "asking"}
              icon="users"
              label="Choose from contacts"
              onPress={() => void pick()}
              testID="invite-contacts"
            />
            <ActionButton
              kind="quiet"
              label="Type their details instead"
              onPress={() => setStage({ kind: "manual" })}
            />
          </>
        ) : (
          <>
            <DunaTextInput
              accessibilityLabel="Name"
              autoCapitalize="words"
              onChangeText={setName}
              placeholder="Name"
              style={[styles.field, fieldStyle(colors, tokens)]}
              textContentType="name"
              value={name}
            />
            <DunaTextInput
              accessibilityLabel="Mobile number or email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={Platform.OS === "ios" ? "email-address" : "default"}
              onChangeText={(value) => {
                setTarget(value);
                setError(undefined);
              }}
              onSubmitEditing={reviewManual}
              placeholder="Mobile number or email"
              returnKeyType="next"
              style={[styles.field, fieldStyle(colors, tokens)]}
              value={target}
            />
            <ActionButton
              disabled={target.trim().length === 0}
              label="Review"
              onPress={reviewManual}
              testID="invite-review"
            />
            {stage.kind === "manual" ? (
              <ActionButton
                kind="quiet"
                label="Choose from contacts instead"
                onPress={() => void pick()}
              />
            ) : null}
          </>
        )}
      </View>
    );
  }

  return (
    <AdaptiveSheet
      accessibilityLabel="Invite someone"
      kind="dialog"
      onClose={onClose}
      testID="invite-sheet"
      visible={visible}
    >
      <SheetHeader onClose={onClose} title="Invite someone" />
      <ScrollView
        contentContainerStyle={{
          padding: tokens.space["4"],
          gap: tokens.space["3"],
        }}
        keyboardShouldPersistTaps="handled"
      >
        {body}
        {error ? (
          <Text accessibilityRole="alert" tone="danger" variant="phone-meta">
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </AdaptiveSheet>
  );
}

function fieldStyle(
  colors: ReturnType<typeof useTheme>["colors"],
  tokens: ReturnType<typeof useTheme>["tokens"],
) {
  return {
    borderColor: colors["border-control"],
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.space["3"],
    backgroundColor: colors.surface,
  };
}

export function PolicySheet({
  visible,
  title,
  markdown,
  requireFullScroll,
  accepted,
  onAccept,
  onClose,
}: {
  readonly visible: boolean;
  readonly title: string;
  readonly markdown: string;
  readonly requireFullScroll: boolean;
  readonly accepted: boolean;
  readonly onAccept: (readToEnd: boolean) => void;
  readonly onClose: () => void;
}) {
  const { colors, tokens } = useTheme();
  const [readToEnd, setReadToEnd] = useState(false);
  const metrics = useRef<PolicyScrollMetrics>({
    contentHeight: 0,
    offsetY: 0,
    viewportHeight: 0,
  });
  // A short policy that fits on screen counts as read once it is laid out.
  const check = (next: Partial<PolicyScrollMetrics>) => {
    metrics.current = { ...metrics.current, ...next };
    if (!readToEnd && policyScrollReachedEnd(metrics.current))
      setReadToEnd(true);
  };
  const ready = !requireFullScroll || readToEnd || accepted;
  return (
    <AdaptiveSheet
      accessibilityLabel={title}
      kind="dialog"
      onClose={onClose}
      testID="policy-sheet"
      visible={visible}
    >
      <SheetHeader onClose={onClose} title={title} />
      <ScrollView
        contentContainerStyle={{ padding: tokens.space["4"] }}
        onContentSizeChange={(_width, height) =>
          check({ contentHeight: height })
        }
        onLayout={(event) =>
          check({ viewportHeight: event.nativeEvent.layout.height })
        }
        onScroll={(event) =>
          check({
            contentHeight: event.nativeEvent.contentSize.height,
            offsetY: event.nativeEvent.contentOffset.y,
            viewportHeight: event.nativeEvent.layoutMeasurement.height,
          })
        }
        scrollEventThrottle={64}
      >
        <NativeMarkdownContent
          color={colors.text}
          linkColor={colors.link}
          markdown={markdown}
        />
      </ScrollView>
      <View
        style={{
          padding: tokens.space["4"],
          gap: tokens.space["2"],
          borderTopColor: colors.line,
          borderTopWidth: StyleSheet.hairlineWidth,
        }}
      >
        {!ready ? (
          <Text tone="text-2" variant="phone-meta">
            Read to the end to accept.
          </Text>
        ) : null}
        <ActionButton
          disabled={!ready}
          label={accepted ? "Accepted" : "I've read it and accept"}
          onPress={() => onAccept(readToEnd || !requireFullScroll)}
          testID="policy-accept"
        />
      </View>
    </AdaptiveSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: "center" },
  header: { flexDirection: "row", alignItems: "center", minHeight: 56, gap: 8 },
  headerButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  search: { flexDirection: "row", alignItems: "center", minHeight: 48 },
  card: { alignItems: "center" },
  add: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  rowLine: { flexDirection: "row", alignItems: "center" },
  field: { minHeight: 52, borderWidth: 1 },
});
