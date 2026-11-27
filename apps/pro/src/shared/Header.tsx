import { useProRuntime } from "../../runtime";
import { useState } from "react";
import { demoOrganization } from "@duna/core/demo";
import { View, Pressable, Modal, ScrollView } from "react-native";
import { SatoshiText as Text } from "../../satoshi-text";
import { ChevronDown } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { calendarDateKey } from "./calendar-time";
import { previewOperatorMatches } from "./preview-operator-matches";
import { styles } from "../legacy/styles";
import { colors } from "./palette";
import { ThemeButton } from "./theme-context";

export function Header({
  showOperations = false,
}: {
  readonly showOperations?: boolean;
}) {
  const {
    activeAuthOrganizationId,
    authOrganizations,
    dashboard,
    matches = [],
    mode,
    signOut,
    switchOrganization,
    workspace,
  } = useProRuntime();
  const [organizationSheetOpen, setOrganizationSheetOpen] = useState(false);
  const [switching, setSwitching] = useState<string>();
  const initials = (dashboard?.organization.name ?? demoOrganization.name)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const timezone =
    workspace?.organization.timezone ??
    dashboard?.organization.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const todayKey = calendarDateKey(new Date(), timezone);
  const watchMatches = mode === "preview" ? previewOperatorMatches() : matches;
  const todayMatches = watchMatches.filter(
    (match) =>
      !match.scheduledAt ||
      calendarDateKey(new Date(match.scheduledAt), timezone) === todayKey,
  );
  const liveCount = watchMatches.filter(
    (match) => match.status === "live",
  ).length;
  const exceptionCount =
    (dashboard?.alerts.filter((alert) => alert.tone !== "positive").length ??
      0) +
    (workspace?.eventRegistrations.filter((registration) =>
      ["cancelled", "refunded", "waitlisted"].includes(registration.status),
    ).length ?? 0);
  const organizationName =
    dashboard?.organization.name ?? demoOrganization.name;
  return (
    <>
      <View style={styles.headerShell}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={`Current organization: ${organizationName}. Change organization`}
            onPress={() => setOrganizationSheetOpen(true)}
            style={styles.headerOrganization}
          >
            <Text numberOfLines={1} style={styles.headerOrganizationName}>
              {organizationName}
            </Text>
            <ChevronDown color={colors.muted} size={18} strokeWidth={1.75} />
          </Pressable>
          <View style={styles.headerButtons}>
            <ThemeButton />
            <Pressable
              accessibilityLabel="Open organization switcher"
              onPress={() => setOrganizationSheetOpen(true)}
              style={styles.profileButton}
            >
              <Text style={styles.profileText}>{initials}</Text>
              {mode === "live" && <View style={styles.dot} />}
            </Pressable>
          </View>
        </View>
        {showOperations && (
          <View
            accessibilityLabel={`Today: ${todayMatches.length} matches, ${liveCount} live now, ${exceptionCount} needing review`}
            style={styles.watchStrip}
          >
            <View style={styles.watchBrand}>
              <View style={styles.watchPulse} />
              <Text style={styles.watchBrandText}>TODAY</Text>
            </View>
            <View style={styles.watchMetric}>
              <Text style={styles.watchMetricValue}>{todayMatches.length}</Text>
              <Text numberOfLines={1} style={styles.watchMetricLabel}>
                MATCHES
              </Text>
            </View>
            <View style={styles.watchMetric}>
              <Text style={styles.watchMetricValue}>{liveCount}</Text>
              <Text numberOfLines={1} style={styles.watchMetricLabel}>
                LIVE NOW
              </Text>
            </View>
            <View style={styles.watchMetric}>
              <Text style={styles.watchMetricValue}>{exceptionCount}</Text>
              <Text numberOfLines={1} style={styles.watchMetricLabel}>
                TO DO
              </Text>
            </View>
          </View>
        )}
      </View>
      <Modal
        animationType="slide"
        onRequestClose={() => setOrganizationSheetOpen(false)}
        presentationStyle="pageSheet"
        visible={organizationSheetOpen}
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
          <View style={styles.sheetHeader}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>DUNA PRO WORKSPACE</Text>
              <Text style={styles.sheetTitle}>Choose an organization.</Text>
            </View>
            <Pressable
              accessibilityLabel="Close organization switcher"
              onPress={() => setOrganizationSheetOpen(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.organizationSheetContent}>
            <Text style={styles.organizationSheetLead}>
              Every schedule, match, court, person, and payment below is scoped
              to the selected organization.
            </Text>
            <View style={styles.organizationSheetList}>
              {(authOrganizations ?? []).map((organization) => {
                const active = organization.id === activeAuthOrganizationId;
                return (
                  <Pressable
                    accessibilityState={{ selected: active }}
                    disabled={active || Boolean(switching)}
                    key={organization.id}
                    onPress={() => {
                      if (!switchOrganization) return;
                      setSwitching(organization.id);
                      void switchOrganization(organization.id)
                        .then(() => setOrganizationSheetOpen(false))
                        .finally(() => setSwitching(undefined));
                    }}
                    style={[
                      styles.organizationSheetRow,
                      active && styles.organizationSheetRowActive,
                    ]}
                  >
                    <View style={styles.organizationSheetMark}>
                      <Text style={styles.organizationSheetMarkText}>
                        {organization.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.organizationSheetName}>
                        {organization.name}
                      </Text>
                      <Text style={styles.organizationSheetRole}>
                        {(organization.role ?? "member").replaceAll("_", " ")}
                      </Text>
                    </View>
                    <Text style={styles.organizationSheetState}>
                      {switching === organization.id
                        ? "OPENING…"
                        : active
                          ? "ACTIVE"
                          : "OPEN"}
                    </Text>
                  </Pressable>
                );
              })}
              {!authOrganizations?.length && (
                <View style={styles.organizationSheetEmpty}>
                  <Text style={styles.organizationSheetName}>
                    {demoOrganization.name}
                  </Text>
                  <Text style={styles.organizationSheetRole}>
                    Preview workspace
                  </Text>
                </View>
              )}
            </View>
            {signOut && (
              <Pressable
                onPress={() => void signOut()}
                style={styles.organizationSignOutButton}
              >
                <Text style={styles.organizationSignOutText}>
                  Sign out of Duna Pro
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
