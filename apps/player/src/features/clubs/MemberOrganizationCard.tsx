import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Linking, Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePlayerRuntime } from "../../../runtime";
import { DunaIcon } from "../../../duna-icon";
import { SatoshiText as Text } from "../../../satoshi-text";
import { colors } from "../../shared/palette";
import { selectionHaptic } from "../../shared/haptics";
import { styles } from "../../legacy/styles";

function organizationRoleLabel(role: string): string {
  if (role === "owner" || role === "admin") return "Admin";
  if (role === "front-desk") return "Front desk";
  return `${role[0]?.toUpperCase() ?? ""}${role.slice(1)}`;
}

export function MemberOrganizationCard({
  compact = false,
}: {
  readonly compact?: boolean;
}) {
  const {
    activeAuthOrganizationId,
    authOrganizations = [],
    isSwitchingOrganization,
    organizationAccess,
    organizationWallets,
    selfEnrollOrganizationStaff,
    switchOrganization,
  } = usePlayerRuntime();
  const [open, setOpen] = useState(false);
  const [pendingRole, setPendingRole] = useState<"coach" | "director">();
  const [enrolledRole, setEnrolledRole] = useState<"coach" | "director">();
  const [error, setError] = useState<string>();
  const fallback =
    organizationWallets?.find(
      (organization) =>
        organization.membershipStatus === "active" &&
        organization.status === "active",
    ) ?? organizationWallets?.[0];
  const active = organizationAccess?.organizations.find(
    (organization) => organization.isActive,
  );
  const activeAuthOrganization = authOrganizations.find(
    (organization) => organization.id === activeAuthOrganizationId,
  );
  const organizationName =
    active?.name ??
    activeAuthOrganization?.name ??
    fallback?.organizationName ??
    organizationAccess?.organizations[0]?.name ??
    authOrganizations[0]?.name;
  if (!organizationName) return null;

  const identity = active?.staff?.active
    ? `Player · ${organizationRoleLabel(active.staff.role)}`
    : active?.roles.includes("owner") || active?.roles.includes("manager")
      ? "Player · Admin"
      : "Player";
  const organizationCount = Math.max(
    authOrganizations.length,
    organizationAccess?.organizations.length ?? 0,
  );
  const runSwitch = async (organizationId: string) => {
    if (!switchOrganization || organizationId === activeAuthOrganizationId)
      return;
    setError(undefined);
    try {
      await switchOrganization(organizationId);
      setOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna could not switch organizations.",
      );
    }
  };
  const selfEnroll = async (staffRole: "coach" | "director") => {
    if (!selfEnrollOrganizationStaff) return;
    setError(undefined);
    setPendingRole(staffRole);
    try {
      await selfEnrollOrganizationStaff(staffRole);
      setEnrolledRole(staffRole);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna could not add your working role.",
      );
    } finally {
      setPendingRole(undefined);
    }
  };

  return (
    <>
      <Pressable
        accessibilityHint="Review your role or switch organizations"
        accessibilityLabel={`${organizationName}, ${identity}`}
        accessibilityRole="button"
        onPress={() => {
          selectionHaptic();
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.memberOrganizationCard,
          compact && styles.memberOrganizationCardCompact,
          pressed && styles.homeQuickActionPressed,
        ]}
      >
        <View
          style={[
            styles.memberOrganizationMark,
            compact && styles.memberOrganizationMarkCompact,
          ]}
        >
          {compact ? (
            <DunaIcon color={colors.aqua} name="waves" size={22} />
          ) : (
            <Text style={styles.memberOrganizationMarkText}>
              {organizationName.slice(0, 1).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.flex}>
          <Text style={styles.memberOrganizationEyebrow}>
            {compact ? "HOME CLUB" : "YOUR DUNA"}
          </Text>
          <Text numberOfLines={1} style={styles.memberOrganizationName}>
            {organizationName}
          </Text>
          {!compact && (
            <Text style={styles.memberOrganizationMeta}>
              {identity}
              {fallback
                ? ` · ${fallback.credits.toLocaleString()} credits`
                : ""}
            </Text>
          )}
        </View>
        {!compact && organizationCount > 1 && (
          <Text style={styles.memberOrganizationCount}>
            {organizationCount}
          </Text>
        )}
        <Text style={styles.memberOrganizationArrow}>›</Text>
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        presentationStyle="pageSheet"
        visible={open}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.organizationModalHeader}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>PLAYER + TEAM IDENTITY</Text>
              <Text style={styles.organizationModalTitle}>Your Duna.</Text>
            </View>
            <Pressable
              accessibilityLabel="Close organization switcher"
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={styles.coachModalClose}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.organizationModalContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.organizationModalIntro}>
              Keep your player identity while choosing the club or coaching
              business you are working with right now.
            </Text>

            {authOrganizations.length > 0 && (
              <View style={styles.organizationList}>
                {authOrganizations.map((organization) => {
                  const current = organization.id === activeAuthOrganizationId;
                  const dunaOrganization =
                    organizationAccess?.organizations.find(
                      (candidate) =>
                        candidate.name.toLowerCase() ===
                        organization.name.toLowerCase(),
                    );
                  const role = dunaOrganization?.staff?.active
                    ? `Player · ${organizationRoleLabel(dunaOrganization.staff.role)}`
                    : `Player · ${organizationRoleLabel(organization.role ?? "member")}`;
                  return (
                    <Pressable
                      accessibilityLabel={`Switch to ${organization.name}`}
                      accessibilityRole="button"
                      disabled={
                        !switchOrganization ||
                        current ||
                        isSwitchingOrganization
                      }
                      key={organization.id}
                      onPress={() => void runSwitch(organization.id)}
                      style={[
                        styles.organizationListRow,
                        current && styles.organizationListRowActive,
                      ]}
                    >
                      <View style={styles.organizationListMark}>
                        <Text style={styles.organizationListMarkText}>
                          {organization.name.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.organizationListName}>
                          {organization.name}
                        </Text>
                        <Text style={styles.organizationListRole}>{role}</Text>
                      </View>
                      <Text style={styles.organizationListAction}>
                        {current
                          ? "CURRENT"
                          : isSwitchingOrganization
                            ? "WAIT"
                            : "SWITCH"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {active?.canSelfEnroll && !enrolledRole && (
              <View style={styles.organizationEnrollCard}>
                <Text style={styles.organizationEnrollEyebrow}>
                  PUT YOURSELF ON THE SCHEDULE
                </Text>
                <Text style={styles.organizationEnrollTitle}>
                  Add your working role.
                </Text>
                <Text style={styles.organizationEnrollBody}>
                  You will keep your admin access and also become assignable to
                  schedules, sessions, and coaching work.
                </Text>
                <View style={styles.organizationEnrollActions}>
                  <Pressable
                    disabled={Boolean(pendingRole)}
                    onPress={() => void selfEnroll("coach")}
                    style={styles.organizationEnrollPrimary}
                  >
                    <Text style={styles.organizationEnrollPrimaryText}>
                      {pendingRole === "coach" ? "Adding…" : "Add as coach"}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={Boolean(pendingRole)}
                    onPress={() => void selfEnroll("director")}
                    style={styles.organizationEnrollSecondary}
                  >
                    <Text style={styles.organizationEnrollSecondaryText}>
                      {pendingRole === "director"
                        ? "Adding…"
                        : "Add as director"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {enrolledRole && active && (
              <View style={styles.organizationEnrollCard}>
                <Text style={styles.organizationEnrollEyebrow}>
                  WORKING ROLE ACTIVE
                </Text>
                <Text style={styles.organizationEnrollTitle}>
                  You are on {active.name}&apos;s team.
                </Text>
                <Text style={styles.organizationEnrollBody}>
                  Your {enrolledRole} profile is now visible in Duna HQ. Open
                  Duna Pro to see schedules, sessions, and coaching work for
                  this organization.
                </Text>
                <Pressable
                  accessibilityHint="Opens this organization in Duna Pro"
                  accessibilityRole="button"
                  onPress={() => {
                    const url = `duna-pro://organization/${encodeURIComponent(active.slug)}`;
                    void Linking.openURL(url).catch(() =>
                      WebBrowser.openBrowserAsync("https://hq.duna.coach"),
                    );
                  }}
                  style={styles.organizationEnrollPrimary}
                >
                  <Text style={styles.organizationEnrollPrimaryText}>
                    Open Duna Pro →
                  </Text>
                </Pressable>
              </View>
            )}

            {active?.canManage && (
              <Pressable
                accessibilityHint="Opens organization management in Duna HQ"
                accessibilityRole="link"
                onPress={() =>
                  void WebBrowser.openBrowserAsync("https://hq.duna.coach")
                }
                style={styles.organizationHqLink}
              >
                <View>
                  <Text style={styles.organizationHqEyebrow}>DUNA HQ</Text>
                  <Text style={styles.organizationHqTitle}>
                    Manage {active.name}
                  </Text>
                </View>
                <Text style={styles.organizationHqArrow}>↗</Text>
              </Pressable>
            )}

            {error && (
              <Text accessibilityRole="alert" style={styles.formError}>
                {error}
              </Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
