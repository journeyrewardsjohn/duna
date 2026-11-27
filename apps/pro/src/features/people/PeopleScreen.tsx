import { useState } from "react";
import { useProRuntime } from "../../../runtime";
import { demoPeople } from "@duna/core/demo";
import * as Crypto from "expo-crypto";
import { ScrollView, View, Pressable, Modal, Linking } from "react-native";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "../../../satoshi-text";
import { SafeAreaView } from "react-native-safe-area-context";
import { successHaptic } from "../../shared/haptics";
import { displayError } from "../../shared/display-error";
import { styles } from "../../legacy/styles";
import { Header } from "../../shared/Header";
import { PageTitle } from "../../shared/PageTitle";
import { colors } from "../../shared/palette";
import { Pill } from "../../shared/Pill";

export function PeopleScreen({
  onMessage,
  onRecordNotes,
}: {
  readonly onMessage: (personId: string) => void;
  readonly onRecordNotes: (sessionId: string, personId: string) => void;
}) {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState<string>();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteMinor, setInviteMinor] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<string>();
  const { client, members, mode, refresh, workspace } = useProRuntime();
  const people = members ?? demoPeople;
  const filteredPeople = people.filter((person) => {
    const query = search.trim().toLowerCase();
    if (
      query &&
      ![person.displayName, person.handle, ...person.roles]
        .join(" ")
        .toLowerCase()
        .includes(query)
    ) {
      return false;
    }
    const relationship = workspace?.people.find(
      (candidate) => candidate.personId === person.id,
    );
    if (filter === "Players") return person.roles.includes("player");
    if (filter === "Upcoming") return (relationship?.upcomingCount ?? 0) > 0;
    if (filter === "Credits") return (relationship?.creditBalance ?? 0) > 0;
    if (filter === "Attention")
      return Boolean(relationship && relationship.churnRisk.level !== "low");
    if (filter === "Minors") return Boolean(person.isMinor);
    return true;
  });
  const guardianCount = people.filter((person) =>
    person.roles.includes("guardian"),
  ).length;
  const minorCount = people.filter((person) => person.isMinor).length;
  const selectedPerson = people.find(
    (person) => person.id === selectedPersonId,
  );
  const selectedRelationship = workspace?.people.find(
    (person) => person.personId === selectedPersonId,
  );
  const selectedNoteSession = workspace?.calendar.entries
    .filter(
      (entry) =>
        entry.sourceType === "session" &&
        entry.attendees.some(
          (attendee) => attendee.personId === selectedPersonId,
        ),
    )
    .sort(
      (left, right) =>
        Math.abs(Date.parse(left.startsAt) - Date.now()) -
        Math.abs(Date.parse(right.startsAt) - Date.now()),
    )[0];

  const sendInvitation = async () => {
    if (!client || mode !== "live") {
      setInviteFeedback("Invitations are disabled in preview.");
      return;
    }
    setInviteBusy(true);
    setInviteFeedback(undefined);
    try {
      const normalizedPhone = invitePhone.trim()
        ? `+${invitePhone.replace(/\D/g, "")}`
        : undefined;
      const result = await client.operator.createPlayerInvitation.mutate({
        invitedName: inviteName.trim(),
        ...(inviteEmail.trim() ? { invitedEmail: inviteEmail.trim() } : {}),
        ...(normalizedPhone ? { invitedPhoneE164: normalizedPhone } : {}),
        relationship: "player",
        isMinor: inviteMinor,
        ...(inviteMinor && guardianName.trim()
          ? { guardianName: guardianName.trim() }
          : {}),
        ...(inviteMinor && guardianEmail.trim()
          ? { guardianEmail: guardianEmail.trim() }
          : {}),
        confirmed: true,
        idempotencyKey: Crypto.randomUUID(),
      });
      await refresh();
      setInviteFeedback(
        result.status === "sent"
          ? "Invitation sent."
          : "Invitation created and queued for delivery.",
      );
      setInviteName("");
      setInviteEmail("");
      setInvitePhone("");
      setGuardianName("");
      setGuardianEmail("");
      successHaptic();
    } catch (reason) {
      setInviteFeedback(displayError(reason));
    } finally {
      setInviteBusy(false);
    }
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Header />
        <PageTitle
          action="Add person"
          eyebrow="CRM + ELIGIBILITY"
          onAction={() => setInviteOpen(true)}
          title="People."
        />
        <View style={styles.searchField}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            onChangeText={setSearch}
            placeholder={`Search ${people.length} people…`}
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            value={search}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterBleed}
        >
          <View style={styles.filterRow}>
            {[
              "All",
              "Players",
              "Upcoming",
              "Credits",
              "Attention",
              "Minors",
            ].map((item) => (
              <Pressable
                key={item}
                onPress={() => setFilter(item)}
                style={[
                  styles.filterChip,
                  filter === item && styles.filterActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === item && styles.filterTextActive,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <View style={styles.peopleSummary}>
          <View>
            <Text style={styles.metricValue}>{people.length}</Text>
            <Text style={styles.metaText}>active people</Text>
          </View>
          <View>
            <Text style={styles.metricValue}>{guardianCount}</Text>
            <Text style={styles.metaText}>guardians</Text>
          </View>
          <View>
            <Text style={styles.metricValue}>{minorCount}</Text>
            <Text style={styles.metaText}>minor profiles</Text>
          </View>
        </View>
        <View style={styles.peopleList}>
          {filteredPeople.map((person) => {
            const relationship = workspace?.people.find(
              (candidate) => candidate.personId === person.id,
            );
            return (
              <Pressable
                key={person.id}
                onPress={() => setSelectedPersonId(person.id)}
                style={styles.personRow}
              >
                <View style={styles.personAvatar}>
                  <Text style={styles.personAvatarText}>{person.initials}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{person.displayName}</Text>
                  <Text style={styles.metaText}>
                    @{person.handle} · {person.roles.join(" + ")}
                  </Text>
                  {relationship && (
                    <Text style={styles.personRelationshipMeta}>
                      {relationship.membershipName ?? "No active plan"} ·{" "}
                      {relationship.creditBalance} credits ·{" "}
                      {relationship.upcomingCount} upcoming
                    </Text>
                  )}
                </View>
                <Pill
                  tone={
                    relationship?.churnRisk.level === "high"
                      ? "warning"
                      : person.isMinor
                        ? "warning"
                        : "positive"
                  }
                >
                  {person.isMinor
                    ? "Minor"
                    : relationship?.churnRisk.level === "high"
                      ? "Follow up"
                      : person.roles.includes("guardian")
                        ? "Guardian"
                        : "Active"}
                </Pill>
                <View style={styles.personRating}>
                  <Text style={styles.ratingNumber}>
                    {person.rating.display.toFixed(2)}
                  </Text>
                  <Text style={styles.metaText}>
                    {person.rating.confidence}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        onRequestClose={() => setSelectedPersonId(undefined)}
        presentationStyle="pageSheet"
        visible={Boolean(selectedPerson)}
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.peopleModalSafe}>
          <View style={styles.peopleModalHeader}>
            <View>
              <Text style={styles.eyebrow}>CONNECTED PERSON</Text>
              <Text style={styles.peopleModalTitle}>
                {selectedPerson?.displayName ?? "Player"}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close person profile"
              onPress={() => setSelectedPersonId(undefined)}
              style={styles.peopleModalClose}
            >
              <Text style={styles.peopleModalCloseText}>×</Text>
            </Pressable>
          </View>
          {selectedPerson && (
            <ScrollView contentContainerStyle={styles.peopleModalContent}>
              <View style={styles.peopleProfileHero}>
                <View style={styles.peopleProfileAvatar}>
                  <Text style={styles.peopleProfileAvatarText}>
                    {selectedPerson.initials}
                  </Text>
                </View>
                <Text style={styles.peopleProfileName}>
                  {selectedPerson.displayName}
                </Text>
                <Text style={styles.peopleProfileMeta}>
                  @{selectedPerson.handle} · {selectedPerson.homeMarket}
                </Text>
                <View style={styles.peopleProfilePills}>
                  {selectedPerson.roles.map((role) => (
                    <Pill key={role} tone="neutral">
                      {role}
                    </Pill>
                  ))}
                  {selectedPerson.isMinor && <Pill tone="warning">Minor</Pill>}
                </View>
              </View>
              <View style={styles.peopleProfileMetrics}>
                <View>
                  <Text style={styles.metricValue}>
                    {selectedPerson.rating.display.toFixed(2)}
                  </Text>
                  <Text style={styles.metaText}>rating</Text>
                </View>
                <View>
                  <Text style={styles.metricValue}>
                    {selectedRelationship?.creditBalance ?? 0}
                  </Text>
                  <Text style={styles.metaText}>credits</Text>
                </View>
                <View>
                  <Text style={styles.metricValue}>
                    {selectedRelationship?.upcomingCount ?? 0}
                  </Text>
                  <Text style={styles.metaText}>upcoming</Text>
                </View>
              </View>
              {selectedRelationship && (
                <View style={styles.peopleProfileCard}>
                  <Text style={styles.eyebrow}>RELATIONSHIP</Text>
                  <Text style={styles.peopleProfileCardTitle}>
                    {selectedRelationship.membershipName ?? "No active plan"}
                  </Text>
                  <Text style={styles.peopleProfileCardBody}>
                    {selectedRelationship.purchaseCount} purchases ·{" "}
                    {selectedRelationship.churnRisk.level} care signal
                  </Text>
                  {selectedRelationship.churnRisk.reasons.map((reason) => (
                    <Text key={reason} style={styles.peopleProfileReason}>
                      • {reason}
                    </Text>
                  ))}
                </View>
              )}
              <View style={styles.peopleProfileActions}>
                <Pressable
                  onPress={() => {
                    setSelectedPersonId(undefined);
                    onMessage(selectedPerson.id);
                  }}
                  style={styles.peopleProfilePrimary}
                >
                  <Text style={styles.peopleProfilePrimaryText}>
                    Duna message
                  </Text>
                </Pressable>
                <Pressable
                  disabled={!selectedNoteSession}
                  onPress={() => {
                    if (!selectedNoteSession) return;
                    setSelectedPersonId(undefined);
                    onRecordNotes(selectedNoteSession.id, selectedPerson.id);
                  }}
                  style={[
                    styles.peopleProfileSecondary,
                    !selectedNoteSession && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.peopleProfileSecondaryText}>
                    Add note
                  </Text>
                </Pressable>
              </View>
              {selectedRelationship?.email && (
                <Pressable
                  onPress={() =>
                    void Linking.openURL(`mailto:${selectedRelationship.email}`)
                  }
                  style={styles.peopleProfileEmail}
                >
                  <Text style={styles.peopleProfileEmailText}>
                    Email {selectedRelationship.email}
                  </Text>
                </Pressable>
              )}
              {!selectedNoteSession && (
                <Text style={styles.peopleProfileActionHint}>
                  Player notes become available from a shared session.
                </Text>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setInviteOpen(false)}
        presentationStyle="pageSheet"
        visible={inviteOpen}
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.peopleModalSafe}>
          <View style={styles.peopleModalHeader}>
            <View>
              <Text style={styles.eyebrow}>NATIVE INVITATION</Text>
              <Text style={styles.peopleModalTitle}>Add a player.</Text>
            </View>
            <Pressable
              accessibilityLabel="Close invitation"
              onPress={() => setInviteOpen(false)}
              style={styles.peopleModalClose}
            >
              <Text style={styles.peopleModalCloseText}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.peopleInviteContent}>
            <Text style={styles.peopleInviteLead}>
              Duna creates a connected identity invitation. Nothing is sent
              until you confirm below.
            </Text>
            <Text style={styles.calendarFieldLabel}>PLAYER NAME</Text>
            <TextInput
              onChangeText={setInviteName}
              placeholder="Full name"
              placeholderTextColor={colors.muted}
              style={styles.peopleInviteInput}
              value={inviteName}
            />
            <Text style={styles.calendarFieldLabel}>EMAIL</Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setInviteEmail}
              placeholder="player@example.com"
              placeholderTextColor={colors.muted}
              style={styles.peopleInviteInput}
              value={inviteEmail}
            />
            <Text style={styles.calendarFieldLabel}>PHONE · OPTIONAL</Text>
            <TextInput
              keyboardType="phone-pad"
              onChangeText={setInvitePhone}
              placeholder="+1 310 555 0100"
              placeholderTextColor={colors.muted}
              style={styles.peopleInviteInput}
              value={invitePhone}
            />
            <Pressable
              onPress={() => setInviteMinor((value) => !value)}
              style={styles.peopleInviteToggle}
            >
              <View
                style={[
                  styles.peopleInviteToggleMark,
                  inviteMinor && styles.peopleInviteToggleMarkActive,
                ]}
              >
                <Text style={styles.peopleInviteToggleMarkText}>
                  {inviteMinor ? "✓" : ""}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>This player is a minor</Text>
                <Text style={styles.metaText}>
                  The invitation goes to a verified guardian.
                </Text>
              </View>
            </Pressable>
            {inviteMinor && (
              <>
                <Text style={styles.calendarFieldLabel}>GUARDIAN NAME</Text>
                <TextInput
                  onChangeText={setGuardianName}
                  placeholder="Guardian name"
                  placeholderTextColor={colors.muted}
                  style={styles.peopleInviteInput}
                  value={guardianName}
                />
                <Text style={styles.calendarFieldLabel}>GUARDIAN EMAIL</Text>
                <TextInput
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onChangeText={setGuardianEmail}
                  placeholder="guardian@example.com"
                  placeholderTextColor={colors.muted}
                  style={styles.peopleInviteInput}
                  value={guardianEmail}
                />
              </>
            )}
            {inviteFeedback && (
              <Text style={styles.peopleInviteFeedback}>{inviteFeedback}</Text>
            )}
            <Pressable
              disabled={
                inviteBusy ||
                inviteName.trim().length < 2 ||
                (inviteMinor
                  ? guardianEmail.trim().length < 3
                  : inviteEmail.trim().length < 3 &&
                    invitePhone.trim().length < 8)
              }
              onPress={() => void sendInvitation()}
              style={[
                styles.peopleInviteSubmit,
                (inviteBusy || inviteName.trim().length < 2) &&
                  styles.buttonDisabled,
              ]}
            >
              <Text style={styles.peopleInviteSubmitText}>
                {inviteBusy ? "Creating invitation…" : "Confirm invitation"}
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
