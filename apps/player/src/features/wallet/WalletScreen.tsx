/**
 * The Player wallet (WALLET-2, docs/design/wallet.md): every club card the
 * person holds (and their juniors' cards), swipeable, or a stack from seven;
 * tap a card to turn it over to the pass; the four actions; the selected
 * club's sheet; then the Duna balance. Laid out by the pane it has:
 * - one column (iPhone, the closed Duo, the wallet beside Connect on the
 *   open Duo): the dark band over the sheet, one scroll;
 * - side by side when its pane is wide (iPad): the band beside the sheet;
 * - propped half-open: the card or the pass on the top pane for the desk to
 *   scan, the actions and the sheet below.
 * Preview builds show the fictional demo clubs
 * (`duna://dev/shell?tab=connect&route=wallet&id=demo-12&step=pass`).
 */
import {
  ActionSheetIOS,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewInstance,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { log } from "@duna/observability";
import type { WalletPresentation } from "@duna/tideline-core";
import {
  ErrorState,
  Icon,
  nativeTokens,
  Skeleton,
  Text,
  ThemeOverride,
  Title,
  useTheme,
} from "@duna/ui/native";
import {
  CardArrival,
  CardArtProvider,
  MembershipCard,
  WalletActions,
  WalletBand,
  cardGeometry,
  type NativeWalletCard,
} from "@duna/ui/native/identity";
import { FoldScaffold, usePane, useRegionLayout } from "@duna/ui/native/layout";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { RouteEntryContext, useShell } from "../../app/ShellContext";
import { usePaneEdges } from "../../app/ui";
import { renderCardLoop } from "./CardLoop";
import { useWalletData } from "./use-wallet-data";
import { arrivalWords, arrivedCard } from "./wallet-model";
import { SheetButton, WalletBalance, WalletSheet } from "./WalletSheet";

const PRESENTATION_KEY = "duna.wallet.presentation";
const knownKey = (personId: string) => `duna.wallet.known.${personId}`;
/** From this width the band sits beside the sheet. */
const SPLIT_FROM = 700;

/** The person's carousel / stack choice, remembered on this device. */
function usePresentation(forced: WalletPresentation | null) {
  const [saved, setSaved] = useState<WalletPresentation | "auto">("auto");
  useEffect(() => {
    void AsyncStorage.getItem(PRESENTATION_KEY)
      .then((value) => {
        if (value === "carousel" || value === "stack") setSaved(value);
      })
      .catch(() => undefined);
  }, []);
  const choose = useCallback((next: WalletPresentation) => {
    setSaved(next);
    void AsyncStorage.setItem(PRESENTATION_KEY, next).catch(() => undefined);
  }, []);
  return [forced ?? saved, choose] as const;
}

function Notice({ children }: { readonly children: string }) {
  return (
    <View style={styles.notice}>
      <Icon name="info" size="inline" />
      <Text style={styles.flex} variant="phone-meta">
        {children}
      </Text>
    </View>
  );
}

function EmptyWallet({
  memberName,
  width,
  onFind,
}: {
  readonly memberName: string;
  readonly width: number;
  readonly onFind: () => void;
}) {
  const example: NativeWalletCard = {
    id: "example",
    club: { name: "Your club" },
    member: memberName,
    chip: "Example",
    status: "active",
    fact: { kind: "credits", text: "8 credits" },
    art: { source: "set", key: "golden-dune" },
  };
  return (
    <View style={styles.empty} testID="wallet-empty">
      <View style={styles.center}>
        <MembershipCard
          accessibilityLabel="An example club card"
          card={example}
          width={cardGeometry(width).width}
        />
      </View>
      <Text variant="phone-heading">Your club cards live here</Text>
      <Text tone="text-2" variant="phone-body">
        Join a club and its card lands here: swipe between your clubs and tap a
        card to show your pass at the front desk.
      </Text>
      <SheetButton kind="primary" label="Find a club" onPress={onFind} />
    </View>
  );
}

function LoadingBand({ width }: { readonly width: number }) {
  const card = cardGeometry(width);
  return (
    <View style={styles.center} testID="wallet-loading">
      <Skeleton
        count={1}
        kind="card"
        label="Loading your cards"
        style={{
          width: card.width,
          height: card.height,
          borderRadius: card.radius,
        }}
      />
    </View>
  );
}

export function WalletScreen() {
  const entry = useContext(RouteEntryContext);
  const step = entry?.prompt;
  const data = useWalletData(entry?.targetId);
  const shell = useShell();
  const pane = usePane();
  const region = useRegionLayout();
  const edges = usePaneEdges();
  const { colors, tokens } = useTheme();
  const model = data.model;
  const cards = model?.cards ?? [];

  const [value, setValue] = useState<string | undefined>(model?.initial);
  const [flipped, setFlipped] = useState(step === "pass");
  const [presentation, setPresentation] = usePresentation(
    step === "stack" ? "stack" : step === "carousel" ? "carousel" : null,
  );
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [arrival, setArrival] = useState<NativeWalletCard | null>(null);
  const scroll = useRef<ScrollViewInstance | null>(null);
  const sheetTop = useRef(0);
  const sections = useRef<{ benefits: number; activity: number }>({
    benefits: 0,
    activity: 0,
  });

  // A link to one club's card (Home, a deep link) selects it.
  useEffect(() => {
    if (model?.initial) setValue(model.initial);
  }, [model?.initial, entry?.nonce]);

  const selected = cards.find((card) => card.id === value) ?? cards[0];
  const sheet = selected ? model?.sheets[selected.id] : undefined;

  // The arrival moment: a card that was not here the last time.
  const ids = cards.map((card) => card.id).join("|");
  useEffect(() => {
    if (!data.personId || data.preview || !model || model.cardsError) return;
    const key = knownKey(data.personId);
    let live = true;
    void AsyncStorage.getItem(key)
      .then((stored) => {
        if (!live) return;
        const known = stored ? (JSON.parse(stored) as string[]) : null;
        const landed = arrivedCard(cards, known);
        if (landed) {
          log.info("player.wallet.card_arrived");
          setArrival(landed);
        } else {
          void AsyncStorage.setItem(
            key,
            JSON.stringify(cards.map((c) => c.id)),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // Re-checked when the set of cards changes.
  }, [ids, data.personId, data.preview]);
  // Preview: `step=arrival` shows the moment for the first card.
  useEffect(() => {
    if (data.preview && step === "arrival" && cards[0]) setArrival(cards[0]);
  }, [data.preview, step, ids]);

  // The pane's own width, inside the edges it shares with the window (the
  // Duo's vertical tab bar and camera region, the iPad's sidebar).
  const width = Math.max(
    320,
    Math.round((pane.width || 402) - edges.left - edges.right),
  );
  const tabletop = region.layout.mode === "tabletop";
  const split = !tabletop && width >= SPLIT_FROM;
  const bandWidth = split
    ? Math.max(340, Math.min(440, Math.round(width * 0.48)))
    : width;

  const book = (card: NativeWalletCard) => {
    const target = model?.sheets[card.id];
    if (card.status === "expired" || !target) return;
    shell.openOrganization(target.clubSlug);
  };
  const quickActions = (id: string) => {
    const card = cards.find((item) => item.id === id);
    if (!card) return;
    const options = ["Show pass", "Book", "Cancel"];
    const run = (index: number) => {
      if (index === 0) setFlipped(true);
      else if (index === 1) {
        if (card.status === "expired")
          setUnavailable("This membership has ended");
        else book(card);
      }
    };
    if (Platform.OS === "ios")
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 2, title: card.club.name },
        run,
      );
    else
      Alert.alert(card.club.name, undefined, [
        { text: "Show pass", onPress: () => run(0) },
        { text: "Book", onPress: () => run(1) },
        { text: "Cancel", style: "cancel" },
      ]);
  };
  const scrollTo = (section: "benefits" | "activity") => {
    scroll.current?.scrollTo({
      y: Math.max(0, sheetTop.current + sections.current[section] - 12),
      animated: true,
    });
  };

  const actions = selected ? (
    <WalletActions
      items={[
        {
          key: "pass",
          label: flipped ? "Hide pass" : "Show pass",
          icon: "pass",
          pressed: flipped,
          onPress: () => setFlipped(!flipped),
        },
        {
          key: "book",
          label: "Book",
          icon: "calendar",
          onPress: () => book(selected),
          disabled: selected.status === "expired",
          reason: "This membership has ended",
          hint: `Opens ${selected.club.name}`,
        },
        {
          key: "benefits",
          label: "Benefits",
          icon: "verified",
          onPress: () => scrollTo("benefits"),
        },
        {
          key: "activity",
          label: "Activity",
          icon: "timer",
          onPress: () => scrollTo("activity"),
        },
      ]}
      label={`Actions for ${selected.club.name}`}
      onUnavailable={setUnavailable}
    />
  ) : null;

  const noticeText = model?.passError
    ? `Your pass didn't load, so the back of each card shows no code. Reference: ${model.passError}`
    : data.preview
      ? "Preview: these are example clubs, and the pass is a sample."
      : data.offline
        ? "You're offline. Cards show what was last synced; your saved pass still works."
        : null;

  const findClub = () => shell.open("discover", { intent: "search" });
  const band = (withActions: boolean, topInset: number, chrome = true) => (
    <ThemeOverride theme="dark">
      <WalletBand
        actions={withActions ? actions : undefined}
        cards={cards}
        chrome={chrome}
        empty={
          data.loading ? (
            <LoadingBand width={bandWidth} />
          ) : model?.cardsError ? (
            <ErrorState
              onRetry={() => void data.reload()}
              reference={model.cardsError}
              text="Your club cards didn't load. Your memberships and credits are safe."
              title="Cards didn't load"
            />
          ) : (
            <EmptyWallet
              memberName={data.memberName}
              onFind={findClub}
              width={bandWidth}
            />
          )
        }
        flipped={flipped}
        notice={
          noticeText || unavailable ? (
            <View style={styles.notices}>
              {noticeText ? <Notice>{noticeText}</Notice> : null}
              {unavailable ? <Notice>{unavailable}</Notice> : null}
            </View>
          ) : undefined
        }
        onChange={(id) => {
          setValue(id);
          setFlipped(false);
          setUnavailable(null);
        }}
        onFlip={setFlipped}
        onLongPress={quickActions}
        onPresentationChange={setPresentation}
        paddingTop={topInset}
        presentation={presentation}
        title={<Title>Wallet</Title>}
        toolbar={
          <Pressable
            accessibilityLabel="Find a club"
            accessibilityRole="button"
            hitSlop={4}
            onPress={findClub}
            style={styles.iconButton}
          >
            <Icon name="plus" size="control" />
          </Pressable>
        }
        value={selected?.id}
        width={bandWidth}
      />
    </ThemeOverride>
  );
  const details = (
    <View
      onLayout={(event) => {
        sheetTop.current = event.nativeEvent.layout.y;
      }}
      style={[styles.details, { padding: tokens.space["5"] }]}
    >
      {selected && sheet && model ? (
        <WalletSheet
          appleWallet={Boolean(model.appleWalletPath)}
          card={selected}
          flipped={flipped}
          onChanged={() => void data.reload()}
          onSection={(section, y) => {
            sections.current[section] = y;
          }}
          sheet={sheet}
        />
      ) : data.loading ? (
        <Skeleton count={4} kind="row" label="Loading your club" />
      ) : null}
      {model ? <WalletBalance model={model} /> : null}
    </View>
  );
  const refresh = (
    <RefreshControl
      onRefresh={() => void data.reload()}
      refreshing={false}
      tintColor={colors["text-2"]}
    />
  );

  let body;
  if (tabletop) {
    body = (
      <FoldScaffold
        layout={region.layout}
        primary={
          <View style={styles.tabletopTop}>{band(false, 0, false)}</View>
        }
        secondary={
          <ScrollView ref={scroll} style={{ backgroundColor: colors.ground }}>
            <ThemeOverride theme="dark">
              <View style={styles.tabletopActions}>{actions}</View>
            </ThemeOverride>
            {details}
          </ScrollView>
        }
        testID="wallet-tabletop"
      />
    );
  } else if (split) {
    body = (
      <View style={styles.row}>
        <ScrollView
          contentContainerStyle={styles.grow}
          refreshControl={refresh}
          style={[styles.side, { width: bandWidth }]}
        >
          {band(true, edges.top)}
        </ScrollView>
        <ScrollView
          contentContainerStyle={{
            paddingTop: edges.top,
            paddingBottom: edges.bottom + 24,
          }}
          ref={scroll}
          style={{ backgroundColor: colors.ground }}
          testID="wallet-sheet-pane"
        >
          {details}
        </ScrollView>
      </View>
    );
  } else {
    body = (
      <ScrollView
        contentContainerStyle={{ paddingBottom: edges.bottom + 24 }}
        ref={scroll}
        refreshControl={refresh}
        style={{ backgroundColor: colors.ground }}
        testID="wallet-scroll"
      >
        {band(true, 0)}
        {details}
      </ScrollView>
    );
  }

  return (
    <CardArtProvider renderLoop={renderCardLoop}>
      <View
        onLayout={region.onLayout}
        ref={region.ref}
        style={[
          styles.fill,
          {
            backgroundColor: colors.ground,
            paddingLeft: edges.left,
            paddingRight: edges.right,
          },
        ]}
        testID="wallet-screen"
      >
        {body}
        {arrival ? (
          <View style={StyleSheet.absoluteFill}>
            <CardArrival
              actions={
                <SheetButton
                  kind="primary"
                  label="Open my wallet"
                  onPress={() => {
                    setValue(arrival.id);
                    setFlipped(false);
                    setArrival(null);
                    if (data.personId)
                      void AsyncStorage.setItem(
                        knownKey(data.personId),
                        JSON.stringify(cards.map((card) => card.id)),
                      );
                  }}
                  testID="arrival-open"
                />
              }
              card={arrival}
              paddingTop={edges.top}
              width={cardGeometry(width, "hero").width}
              {...arrivalWords(arrival)}
            />
          </View>
        ) : null}
      </View>
    </CardArtProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1, flexShrink: 1 },
  row: { flex: 1, flexDirection: "row" },
  grow: { flexGrow: 1 },
  side: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: nativeTokens.brand["night-court"],
  },
  center: { alignItems: "center" },
  details: { gap: 28 },
  empty: { gap: 14 },
  notices: { gap: 8 },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(244,242,236,0.08)",
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(244,242,236,0.1)",
  },
  tabletopTop: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: nativeTokens.brand["night-court"],
  },
  tabletopActions: {
    backgroundColor: nativeTokens.brand["night-court"],
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
});
