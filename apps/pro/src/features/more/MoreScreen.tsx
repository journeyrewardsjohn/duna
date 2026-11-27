import { useProRuntime } from "../../../runtime";
import { useState } from "react";
import { demoOrganization } from "@duna/core/demo";
import { ScrollView, View, Pressable, Modal } from "react-native";
import { SatoshiText as Text } from "../../../satoshi-text";
import { SafeAreaView } from "react-native-safe-area-context";
import { styles } from "../../legacy/styles";
import { Header } from "../../shared/Header";
import { PageTitle } from "../../shared/PageTitle";
import { BrandMark } from "../../app/brand";
import { Pill } from "../../shared/Pill";

export function MoreScreen({
  onCalendar,
  onCreate,
  onGetPaid,
  onMoney,
  onMessages,
  onPeople,
  onTournament,
  onVideo,
}: {
  readonly onCalendar: () => void;
  readonly onCreate: () => void;
  readonly onGetPaid: () => void;
  readonly onMoney: () => void;
  readonly onMessages: () => void;
  readonly onPeople: () => void;
  readonly onTournament: () => void;
  readonly onVideo: () => void;
}) {
  const { dashboard, signOut, workspace } = useProRuntime();
  const [selectedMenu, setSelectedMenu] = useState<string>();
  const organization = dashboard?.organization ?? demoOrganization;
  const organizationInitials = organization.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const sections = [
    [
      "OPERATIONS",
      [
        "Calendar",
        "Products + services",
        "Events + leagues",
        "Coach video",
        "Messages",
        "Reports",
      ],
    ],
    [
      "BUSINESS",
      [
        "Money + tax",
        "Memberships + credits",
        "Retail + inventory",
        "Coach payroll support",
      ],
    ],
    [
      "ORGANIZATION",
      [
        "Venues + courts",
        "Team + roles",
        "Policies + waivers",
        "Integrations",
        "Billing + plan",
        "Account + privacy",
        "Delete my account",
      ],
    ],
  ] as const;
  const detailRows: readonly {
    readonly title: string;
    readonly meta: string;
  }[] =
    selectedMenu === "Products + services"
      ? (workspace?.catalog.map((item) => ({
          title: item.title,
          meta: `${item.type} · ${item.status} · ${item.variants.length} option${item.variants.length === 1 ? "" : "s"}`,
        })) ?? [])
      : selectedMenu === "Events + leagues"
        ? (workspace?.sessions
            .filter((session) =>
              ["tournament", "league", "pickup"].includes(session.kind),
            )
            .map((session) => ({
              title: session.title,
              meta: `${session.kind} · ${session.status}`,
            })) ?? [])
        : selectedMenu === "Messages"
          ? [
              {
                title: `${workspace?.people.filter((person) => person.email || person.phoneE164).length ?? 0} reachable people`,
                meta: "Open People to choose a player, guardian, or staff member and use the device messenger.",
              },
            ]
          : selectedMenu === "Reports"
            ? (workspace?.productPerformance.map((item) => ({
                title:
                  workspace.catalog.find(
                    (product) => product.id === item.catalogItemId,
                  )?.title ?? "Product performance",
                meta: `${item.paidPurchases} sales · ${item.uniqueCustomers} customers · ${item.grossMarginBps === undefined ? "margin pending" : `${(item.grossMarginBps / 100).toFixed(1)}% margin`}`,
              })) ?? [])
            : selectedMenu === "Memberships + credits"
              ? (workspace?.ratePlans.map((plan) => ({
                  title: plan.name,
                  meta: `${plan.currency} ${(plan.baseAmountMinor / 100).toFixed(2)} · ${plan.rateUnitMinutes} min`,
                })) ?? [])
              : selectedMenu === "Retail + inventory"
                ? (workspace?.inventory.map((item) => ({
                    title: `${item.itemTitle} · ${item.variantTitle}`,
                    meta: `${item.quantityOnHand - item.quantityReserved} available · ${item.locationName}`,
                  })) ?? [])
                : selectedMenu === "Coach payroll support" ||
                    selectedMenu === "Team + roles"
                  ? (workspace?.staff.map((person) => ({
                      title: person.displayName,
                      meta: `${person.role} · ${person.compensationModel.replaceAll("-", " ")} · ${person.active ? "active" : "inactive"}`,
                    })) ?? [])
                  : selectedMenu === "Venues + courts"
                    ? (workspace?.venues.map((venue) => ({
                        title: venue.name,
                        meta: `${venue.courts.length} court${venue.courts.length === 1 ? "" : "s"} · ${venue.status}`,
                      })) ?? [])
                    : selectedMenu === "Money + tax"
                      ? [
                          {
                            title: `Reconciliation · ${workspace?.ledger.reconciliationStatus.replaceAll("-", " ") ?? "not started"}`,
                            meta: `${workspace?.ledger.postedJournalCount ?? 0} posted journals · ${workspace?.ledger.draftJournalCount ?? 0} drafts`,
                          },
                          {
                            title: `Stripe Tax · ${workspace?.organization.taxRegistrationStatus.replaceAll("-", " ") ?? "not configured"}`,
                            meta: workspace?.organization.stripeChargesEnabled
                              ? "Card payments are enabled."
                              : "Card payments need organization setup.",
                          },
                        ]
                      : selectedMenu
                        ? [
                            {
                              title: selectedMenu,
                              meta:
                                selectedMenu === "Delete my account"
                                  ? "Account deletion is a protected, reviewable request. Duna will never trigger it from a menu tap."
                                  : "This organization setting is available here without leaving Duna Pro. Changes that affect members require explicit confirmation.",
                            },
                          ]
                        : [];

  const detailAction = () => {
    const item = selectedMenu;
    setSelectedMenu(undefined);
    if (!item) return;
    if (
      [
        "Products + services",
        "Memberships + credits",
        "Retail + inventory",
      ].includes(item)
    ) {
      onCreate();
    } else if (item === "Events + leagues") {
      onTournament();
    } else if (item === "Coach video") {
      onVideo();
    } else if (item === "Venues + courts") {
      onCalendar();
    } else if (item === "Money + tax") {
      onMoney();
    } else if (item === "Coach payroll support") {
      onGetPaid();
    } else if (
      ["Messages", "Team + roles", "Policies + waivers"].includes(item)
    ) {
      onPeople();
    }
  };
  const detailActionLabel = selectedMenu
    ? [
        "Products + services",
        "Memberships + credits",
        "Retail + inventory",
      ].includes(selectedMenu)
      ? "Create natively"
      : selectedMenu === "Events + leagues"
        ? "Open tournament desk"
        : selectedMenu === "Coach video"
          ? "Open video"
          : selectedMenu === "Venues + courts"
            ? "Open schedule"
            : selectedMenu === "Money + tax"
              ? "Open Money"
              : selectedMenu === "Coach payroll support"
                ? "Open Get Paid"
                : ["Messages", "Team + roles", "Policies + waivers"].includes(
                      selectedMenu,
                    )
                  ? "Open People"
                  : undefined
    : undefined;
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Header />
        <PageTitle eyebrow="EVERYTHING ELSE" title="More." />
        <View style={styles.moreQuickActions}>
          <Pressable onPress={onGetPaid} style={styles.moreQuickPrimary}>
            <Text style={styles.moreQuickIcon}>)))</Text>
            <Text style={styles.moreQuickPrimaryText}>Get Paid</Text>
          </Pressable>
          <Pressable onPress={onCreate} style={styles.moreQuickSecondary}>
            <Text style={styles.moreQuickIconAlt}>＋</Text>
            <Text style={styles.moreQuickSecondaryText}>Create</Text>
          </Pressable>
        </View>
        <View style={styles.organizationCard}>
          <View style={styles.orgAvatar}>
            <Text style={styles.orgAvatarText}>{organizationInitials}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.orgName}>{organization.name}</Text>
            <Text style={styles.metaText}>
              {organization.plan} plan · {organization.memberCount} people ·{" "}
              {workspace?.venues.length ?? organization.venueCount} venues
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
        {sections.map((section) => (
          <View key={section[0]}>
            <Text style={styles.menuEyebrow}>{section[0]}</Text>
            <View style={styles.menuCard}>
              {section[1].map((item) => (
                <Pressable
                  key={item}
                  onPress={() => {
                    if (item === "Calendar") {
                      onCalendar();
                      return;
                    }
                    if (item === "Messages") {
                      onMessages();
                      return;
                    }
                    setSelectedMenu(item);
                  }}
                  style={styles.menuRow}
                >
                  <Text style={styles.menuIcon}>{item.charAt(0)}</Text>
                  <Text style={styles.rowTitle}>{item}</Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <View style={styles.proNote}>
          <BrandMark />
          <Text style={styles.metaText}>
            Duna Pro keeps core workflows available in the field. Drafts and
            score events persist on-device, then sync when a connection returns.
          </Text>
          <Pill tone="positive">Offline ready</Pill>
        </View>
        {signOut && (
          <Pressable
            onPress={() => void signOut()}
            style={styles.signOutButton}
          >
            <Text style={styles.signOutText}>Sign out of Duna Pro</Text>
          </Pressable>
        )}
      </ScrollView>
      <Modal
        animationType="slide"
        onRequestClose={() => setSelectedMenu(undefined)}
        presentationStyle="pageSheet"
        visible={Boolean(selectedMenu)}
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.peopleModalSafe}>
          <View style={styles.peopleModalHeader}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>NATIVE OPERATIONS</Text>
              <Text numberOfLines={2} style={styles.peopleModalTitle}>
                {selectedMenu}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close operations"
              onPress={() => setSelectedMenu(undefined)}
              style={styles.peopleModalClose}
            >
              <Text style={styles.peopleModalCloseText}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.moreDetailContent}>
            <Text style={styles.moreDetailLead}>
              Built for quick decisions in the field. Deeper records stay
              structured and reviewable inside the same Duna data model.
            </Text>
            <View style={styles.moreDetailList}>
              {detailRows.map((row, index) => (
                <View
                  key={`${row.title}:${index}`}
                  style={styles.moreDetailRow}
                >
                  <View style={styles.moreDetailMark}>
                    <Text style={styles.moreDetailMarkText}>
                      {row.title.charAt(0)}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{row.title}</Text>
                    <Text style={styles.moreDetailMeta}>{row.meta}</Text>
                  </View>
                </View>
              ))}
              {detailRows.length === 0 && (
                <View style={styles.moreDetailEmpty}>
                  <Text style={styles.rowTitle}>Nothing here yet.</Text>
                  <Text style={styles.metaText}>
                    Use the native action below to create the first record.
                  </Text>
                </View>
              )}
            </View>
            {detailActionLabel && (
              <Pressable
                onPress={detailAction}
                style={styles.peopleInviteSubmit}
              >
                <Text style={styles.peopleInviteSubmitText}>
                  {detailActionLabel}
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
