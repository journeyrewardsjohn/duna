/**
 * The Find tab (M-P1; boards F-Search-Results, DUO-Open-Find, IPAD-Find,
 * DUO-States): one Jost title, the Where · When · What bar (it collapses to
 * one line as the list scrolls), and the results grouped by What.
 *
 * - Phone and the closed Duo: the list, with a Map toggle; on the map the
 *   selected result sits in a card over it (View · List).
 * - The open Duo and iPad: the list in the first pane, the map beside it
 *   (`FindMapPane`), one shared selection; a session opens in the second pane.
 * - The Duo half-open: the map on the top pane, the list below (`TabRoot`
 *   uses `FoldScaffold`), nothing crossing the fold.
 */
import { ScrollView, StyleSheet, View } from "react-native";
import { demoEvents } from "@duna/core/demo";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  OfflineState,
  Rise,
  Text,
  Title,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { SearchBar } from "@duna/ui/native/search";
import * as WebBrowser from "expo-web-browser";
import { useContext, useEffect, useRef, useState } from "react";
import { dunaWebUrl } from "../../../mobile-api";
import { usePlayerRuntime } from "../../../runtime";
import { RouteEntryContext, useShell } from "../../app/ShellContext";
import { IconButton, usePaneEdges } from "../../app/ui";
import { CoachProfileModal } from "../coaches/CoachProfileModal";
import { ProTourModal } from "../pro-tour/ProTourModal";
import { FindMap } from "./FindMap";
import { useFind } from "./FindContext";
import { whatLabel, whenLabel, type FindResult } from "./find-search";
import { ActionButton, GroupHeader, ResultRow } from "./parts";
import { SearchSheet } from "./SearchSheet";

/** Where a result opens. */
export function useOpenResult(): (result: FindResult) => void {
  const shell = useShell();
  const find = useFind();
  const runtime = usePlayerRuntime();
  const events = runtime.dashboard?.events ?? demoEvents;
  return (result) => {
    find.select(result.id);
    if (result.session) {
      shell.open("session", { targetId: result.session.id });
      return;
    }
    const item = result.item;
    if (!item) return;
    const slugFrom = (pattern: RegExp) => {
      const raw = item.href.match(pattern)?.[1];
      return raw ? decodeURIComponent(raw) : undefined;
    };
    switch (item.entityType) {
      case "venue":
        shell.open("court", { targetId: item.id.replace(/^venue:/, "") });
        return;
      case "organization": {
        const slug =
          slugFrom(/^\/clubs\/([^/?#]+)/) ?? item.id.split(":").at(-1);
        if (slug) shell.openOrganization(slug);
        return;
      }
      case "coach": {
        const coach = (runtime.coaches ?? []).find(
          (candidate) =>
            item.id ===
            `coach:${candidate.organizationId}:${candidate.personId}`,
        );
        if (coach) find.setOverlay({ kind: "coach", coach });
        else shell.open("coaches");
        return;
      }
      case "pro-tour":
      case "match": {
        const slug = slugFrom(/^\/events\/([^/?#]+)/);
        if (item.entityType === "pro-tour" || slug) {
          find.setOverlay({ kind: "pro-tour", ...(slug ? { slug } : {}) });
          return;
        }
        break;
      }
      case "event": {
        const eventId = item.id.replace(/^event:/, "");
        const index = events.findIndex((event) => event.id === eventId);
        if (index >= 0) {
          shell.openEventAtIndex(index);
          return;
        }
        const slug = slugFrom(/^\/events\/([^/?#]+)/);
        const client = runtime.publicClient ?? runtime.client;
        if (slug && client) {
          void client.public.eventBySlug
            .query({ slug })
            .then(shell.openEvent)
            .catch(() =>
              WebBrowser.openBrowserAsync(
                `${dunaWebUrl}/events/${encodeURIComponent(slug)}`,
              ),
            );
          return;
        }
        break;
      }
    }
    shell.openPath(item.href);
  };
}

/** Applies a Home or New-sheet shortcut ("Find a game", "Book a court"…) once. */
function useEntryIntent() {
  const entry = useContext(RouteEntryContext);
  const find = useFind();
  const applied = useRef<number | null>(null);
  useEffect(() => {
    if (!entry?.intent || applied.current === entry.nonce) return;
    applied.current = entry.nonce;
    if (entry.intent === "search") {
      find.openSearch("where");
      return;
    }
    find.applyIntent(entry.intent);
    if (entry.intent === "watch-pros") find.setOverlay({ kind: "pro-tour" });
  }, [entry, find]);
}

function Bar({
  collapsed,
  large,
}: {
  readonly collapsed: boolean;
  readonly large: boolean;
}) {
  const find = useFind();
  const haptics = useHaptics();
  return (
    <SearchBar
      collapsed={collapsed}
      onClear={(step) => {
        haptics.selection();
        if (step === "where")
          find.setCriteria({ ...find.criteria, where: null });
        if (step === "when")
          find.setCriteria({ ...find.criteria, when: { preset: "any-time" } });
        if (step === "what")
          find.setCriteria({ ...find.criteria, what: ["for-you"] });
      }}
      onOpen={(step) => {
        haptics.selection();
        find.openSearch(step);
      }}
      size={large ? "large" : "compact"}
      testID="find-search-bar"
      what={whatLabel(find.criteria.what)}
      when={whenLabel(find.criteria.when)}
      where={find.criteria.where?.label ?? null}
    />
  );
}

function Results({
  onOpen,
}: {
  readonly onOpen: (result: FindResult) => void;
}) {
  const find = useFind();
  const { tokens } = useTheme();
  if (find.loading && find.results.length === 0) {
    return (
      <LoadingState count={4} label="Finding games" loading skeleton="row" />
    );
  }
  const states = (
    <>
      {find.offline ? <OfflineState compact onRetry={find.retry} /> : null}
      {find.sessionsStatus === "error" && !find.offline ? (
        <ErrorState
          onRetry={find.retry}
          reference={find.sessionsReference}
          text="Your clubs' sessions didn't load. Everything else below is current."
          title="Couldn't load your clubs' sessions"
        />
      ) : null}
    </>
  );
  if (find.outcome.groups.length === 0) {
    return (
      <View style={{ gap: tokens.space["3"] }}>
        {states}
        <EmptyState
          action={{
            label: "Search any time, anywhere",
            onPress: () =>
              find.setCriteria({
                where: null,
                when: { preset: "any-time" },
                what: find.criteria.what,
              }),
          }}
          text="Nothing matches yet. Try more days or a wider area."
          title="No results"
        />
      </View>
    );
  }
  return (
    <View style={{ gap: tokens.space["2"] }}>
      {states}
      {find.outcome.radiusMiles !== undefined ? (
        <Text tone="text-2" variant="phone-meta">
          {`${find.outcome.total} result${find.outcome.total === 1 ? "" : "s"} within ${find.outcome.radiusMiles} mi`}
        </Text>
      ) : find.outcome.expandedWorldwide ? (
        <Text tone="text-2" variant="phone-meta">
          Nothing close by, so these are further away.
        </Text>
      ) : null}
      {find.outcome.groups.map((group, groupIndex) => (
        <Rise delay={Math.min(groupIndex, 4) * 40} key={group.key}>
          <View style={{ gap: tokens.space["2"] }}>
            <GroupHeader count={group.results.length} label={group.label} />
            {group.results.map((result) => (
              <ResultRow
                key={result.id}
                onPress={() => onOpen(result)}
                result={result}
                selected={find.selectedId === result.id}
              />
            ))}
          </View>
        </Rise>
      ))}
    </View>
  );
}

/** The list pane: title, the search bar and the results. */
export function FindList({
  arrangement,
}: {
  readonly arrangement: "phone" | "side" | "tabletop";
}) {
  const find = useFind();
  const open = useOpenResult();
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  useEntryIntent();
  const phone = arrangement === "phone";

  if (phone && find.phoneView === "map") {
    return (
      <View
        style={[styles.fill, { backgroundColor: colors.ground }]}
        testID="find-root"
      >
        <FindMap compact />
        <View
          style={[
            styles.mapTop,
            {
              top: edges.top + tokens.space["2"],
              left: edges.left + tokens.space["3"],
              right: edges.right + 64,
            },
          ]}
        >
          <Bar collapsed large={false} />
        </View>
        <MapResultCard onOpen={open} />
        <FindOverlays />
      </View>
    );
  }

  return (
    <View
      style={[styles.fill, { backgroundColor: colors.ground }]}
      testID="find-root"
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop:
            arrangement === "tabletop"
              ? tokens.space["3"]
              : edges.top + tokens.space["4"],
          paddingBottom: edges.bottom + tokens.space["8"],
          paddingLeft: edges.left + tokens.space["4"],
          paddingRight: edges.right + tokens.space["4"],
          gap: tokens.space["3"],
        }}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          const next = event.nativeEvent.contentOffset.y > 72;
          if (next !== collapsed) setCollapsed(next);
        }}
        scrollEventThrottle={64}
        stickyHeaderIndices={[1]}
      >
        <View style={styles.titleRow}>
          {arrangement === "tabletop" ? (
            <Text accessibilityRole="header" variant="phone-heading">
              Find
            </Text>
          ) : (
            <Title>Find</Title>
          )}
          {phone ? (
            <IconButton
              icon="map"
              label="Show map"
              onPress={() => find.setPhoneView("map")}
              testID="find-show-map"
            />
          ) : null}
        </View>
        <View
          style={{
            backgroundColor: colors.ground,
            paddingVertical: tokens.space["1"],
          }}
        >
          <Bar collapsed={phone && collapsed} large={arrangement === "side"} />
        </View>
        <Results onOpen={open} />
      </ScrollView>
      <FindOverlays />
    </View>
  );
}

/** The map pane beside the list (open Duo, iPad) or above it (half-open Duo). */
export function FindMapPane() {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.fill, { backgroundColor: colors.ground }]}
      testID="find-map-pane"
    >
      <FindMap />
    </View>
  );
}

function MapResultCard({
  onOpen,
}: {
  readonly onOpen: (result: FindResult) => void;
}) {
  const find = useFind();
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  const selected = find.results.find((result) => result.id === find.selectedId);
  return (
    <View
      style={[
        styles.mapCard,
        {
          left: edges.left + tokens.space["3"],
          right: edges.right + tokens.space["3"],
          bottom: edges.bottom + tokens.space["3"],
          backgroundColor: colors.surface,
          borderRadius: tokens.radius.xl,
          padding: tokens.space["3"],
          gap: tokens.space["3"],
          borderColor: colors.line,
        },
      ]}
    >
      {selected ? (
        <ResultRow
          onPress={() => onOpen(selected)}
          result={selected}
          selected={false}
        />
      ) : (
        <Text tone="text-2" variant="phone-meta">
          {`${find.outcome.total} result${find.outcome.total === 1 ? "" : "s"} · tap a pin to see one`}
        </Text>
      )}
      <View style={styles.cardActions}>
        {selected ? (
          <View style={styles.fill}>
            <ActionButton label="View" onPress={() => onOpen(selected)} />
          </View>
        ) : null}
        <View style={styles.fill}>
          <ActionButton
            icon="layout"
            kind="secondary"
            label="List"
            onPress={() => find.setPhoneView("list")}
            testID="find-show-list"
          />
        </View>
      </View>
    </View>
  );
}

/** The search sheet and the legacy sheets Find opens (coach, Pro Tour). */
function FindOverlays() {
  const find = useFind();
  const shell = useShell();
  const runtime = usePlayerRuntime();
  const events = runtime.dashboard?.events ?? demoEvents;
  const overlay = find.overlay;
  return (
    <>
      <SearchSheet />
      <ProTourModal
        initialSlug={overlay?.kind === "pro-tour" ? overlay.slug : undefined}
        onClose={() => find.setOverlay(null)}
        visible={overlay?.kind === "pro-tour"}
      />
      <CoachProfileModal
        coach={overlay?.kind === "coach" ? overlay.coach : undefined}
        onClose={() => find.setOverlay(null)}
        onOpenSession={(session) => {
          find.setOverlay(null);
          const index = events.findIndex((event) => event.id === session.id);
          if (index >= 0) shell.openEventAtIndex(index);
          else shell.openPath(`/events/${encodeURIComponent(session.slug)}`);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  mapTop: { position: "absolute" },
  mapCard: { position: "absolute", borderWidth: StyleSheet.hairlineWidth },
  cardActions: { flexDirection: "row", gap: 8 },
});
