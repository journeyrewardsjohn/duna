import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef } from "react";
import { Image, Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { dunaWebUrl } from "../../../mobile-api";
import { createDeferredModalTransition } from "../../../deferred-modal-transition";
import { SatoshiText as Text } from "../../../satoshi-text";
import {
  type MobileCoach,
  coachInitials,
  coachExperienceLabel,
  coachServicePrice,
  coachSupportsVirtual,
} from "./coach-format";
import { selectionHaptic } from "../../shared/haptics";
import { SectionHeader } from "../../shared/SectionHeader";
import { styles } from "../../legacy/styles";

export function CoachProfileModal({
  coach,
  onClose,
  onOpenSession,
}: {
  readonly coach?: MobileCoach;
  readonly onClose: () => void;
  readonly onOpenSession: (
    session: MobileCoach["upcomingSessions"][number],
  ) => void;
}) {
  const onOpenSessionRef = useRef(onOpenSession);
  onOpenSessionRef.current = onOpenSession;
  const sessionTransitionRef = useRef<
    | ReturnType<
        typeof createDeferredModalTransition<
          MobileCoach["upcomingSessions"][number]
        >
      >
    | undefined
  >(undefined);
  if (!sessionTransitionRef.current) {
    sessionTransitionRef.current = createDeferredModalTransition<
      MobileCoach["upcomingSessions"][number]
    >({
      onComplete: (session) => onOpenSessionRef.current(session),
    });
  }
  const sessionTransition = sessionTransitionRef.current;

  useEffect(
    () => () => {
      sessionTransition.cancel();
    },
    [sessionTransition],
  );

  if (!coach) return null;

  return (
    <Modal
      animationType="slide"
      onDismiss={sessionTransition.complete}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible
    >
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.coachModalHeader}>
          <View>
            <Text style={styles.eyebrow}>DUNA COACH</Text>
            <Text style={styles.coachModalHandle}>@{coach.handle}</Text>
          </View>
          <Pressable
            accessibilityLabel="Close coach profile"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.coachModalClose}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.coachModalContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.coachModalHero}>
            {coach.avatarUrl ? (
              <Image
                accessibilityIgnoresInvertColors
                source={{ uri: coach.avatarUrl }}
                style={styles.coachModalAvatar}
              />
            ) : (
              <View style={styles.coachModalAvatarFallback}>
                <Text style={styles.coachModalAvatarText}>
                  {coachInitials(coach.displayName)}
                </Text>
              </View>
            )}
            <Text style={styles.coachModalName}>{coach.displayName}</Text>
            <Text style={styles.coachModalOrganization}>
              {coach.organizationName}
              {coach.homeMarket ? ` · ${coach.homeMarket}` : ""}
            </Text>
            <View style={styles.coachProfileFacts}>
              <Text style={styles.coachProfileFact}>
                {coachExperienceLabel(coach.playingExperience)}
              </Text>
              {coach.genderCategory ? (
                <Text style={styles.coachProfileFact}>
                  {coach.genderCategory}
                </Text>
              ) : null}
              {coach.yearsPlaying !== undefined ? (
                <Text style={styles.coachProfileFact}>
                  {coach.yearsPlaying} years playing
                </Text>
              ) : null}
              {coachSupportsVirtual(coach) ? (
                <Text style={styles.coachProfileFact}>Virtual available</Text>
              ) : null}
            </View>
            <Text style={styles.coachModalBio}>
              {coach.bio ??
                `Book training and upcoming sessions with ${coach.displayName}.`}
            </Text>
          </View>

          <SectionHeader
            eyebrow="WAYS TO TRAIN"
            title="Choose what fits."
            action={`${coach.services.length} services`}
          />
          <View style={styles.coachServiceList}>
            {coach.services.map((service) => (
              <Pressable
                key={service.id}
                onPress={() => {
                  selectionHaptic();
                  void WebBrowser.openBrowserAsync(
                    `${dunaWebUrl}/clubs/${coach.organizationSlug}/products/${service.slug}`,
                  );
                }}
                style={styles.coachServiceCard}
              >
                <Text style={styles.coachServiceType}>
                  {service.subtype.replaceAll("-", " ").toUpperCase()}
                </Text>
                <Text style={styles.coachServiceTitle}>{service.title}</Text>
                <Text numberOfLines={3} style={styles.coachServiceBody}>
                  {service.shortSummary ??
                    service.description ??
                    "See live availability and booking options."}
                </Text>
                {coachServicePrice(service) ? (
                  <Text style={styles.coachServicePrice}>
                    {coachServicePrice(service)}
                  </Text>
                ) : null}
                <Text style={styles.coachServiceAction}>
                  View availability →
                </Text>
              </Pressable>
            ))}
            {coach.services.length === 0 && (
              <View style={styles.coachEmptyCard}>
                <Text style={styles.coachServiceTitle}>
                  New availability is coming.
                </Text>
                <Text style={styles.coachServiceBody}>
                  Follow {coach.organizationName} for the next published
                  session.
                </Text>
              </View>
            )}
          </View>

          {coach.upcomingSessions.length > 0 && (
            <>
              <SectionHeader
                eyebrow="ON THE CALENDAR"
                title={`Upcoming with ${coach.displayName}.`}
              />
              <View style={styles.listCard}>
                {coach.upcomingSessions.map((session) => (
                  <Pressable
                    key={session.id}
                    onPress={() => {
                      selectionHaptic();
                      sessionTransition.schedule(session);
                      onClose();
                    }}
                    style={styles.coachSessionRow}
                  >
                    <View style={styles.coachSessionDate}>
                      <Text style={styles.coachSessionMonth}>
                        {new Date(session.startsAt)
                          .toLocaleDateString("en-US", { month: "short" })
                          .toUpperCase()}
                      </Text>
                      <Text style={styles.coachSessionDay}>
                        {new Date(session.startsAt).getDate()}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.rowTitle}>{session.title}</Text>
                      <Text style={styles.rowMeta}>
                        {new Date(session.startsAt).toLocaleTimeString(
                          "en-US",
                          {
                            hour: "numeric",
                            minute: "2-digit",
                          },
                        )}
                        {session.venueName ? ` · ${session.venueName}` : ""}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
