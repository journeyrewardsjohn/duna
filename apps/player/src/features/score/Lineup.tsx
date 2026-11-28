/**
 * Who played (M-P4a, board P-Result-Players): your side and the other side
 * as slots. You sit in your side's first place. An empty place opens the
 * chooser: people you played with recently first (`player.teammateSearch`),
 * a search, and "Add by name" for someone not on Duna (a first and last
 * name, and only if they want the confirm link, an email or a mobile).
 */
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { report } from "@duna/observability";
import {
  AdaptiveSheet,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  Text,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePlayerRuntime } from "../../../runtime";
import { IconButton, Row } from "../../app/ui";
import { ActionButton } from "../find/parts";
import { Field } from "./parts";
import { checkAddedPerson } from "./people-rules";
import type { LivePerson, LiveSide, TeamSide } from "./scoring-machine";

export interface Candidate {
  readonly personId: string;
  readonly name: string;
  readonly meta: string;
  readonly recent: boolean;
}

function useCandidates(open: boolean, query: string) {
  const runtime = usePlayerRuntime();
  const client = runtime.mode === "live" ? runtime.client : undefined;
  const [state, setState] = useState<{
    readonly status: "idle" | "loading" | "ready" | "error";
    readonly items: readonly Candidate[];
    readonly reference?: string;
  }>({ status: "idle", items: [] });
  const request = useRef(0);
  useEffect(() => {
    if (!open) return;
    const fallback = (): Candidate[] =>
      (runtime.people ?? [])
        .filter((person) =>
          `${person.displayName} ${person.handle}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .slice(0, 20)
        .map((person) => ({
          personId: person.id,
          name: person.displayName,
          meta: person.homeMarket,
          recent: false,
        }));
    if (!client) {
      setState({ status: "ready", items: fallback() });
      return;
    }
    const current = ++request.current;
    setState((last) => ({ ...last, status: "loading" }));
    const timer = setTimeout(() => {
      void client.player.teammateSearch
        .query({ query: query.trim() || undefined, limit: 20 })
        .then((results) => {
          if (current !== request.current) return;
          setState({
            status: "ready",
            items: results
              .filter((result) => result.eligible)
              .map((result) => ({
                personId: result.person.id,
                name: result.person.displayName,
                meta:
                  result.relationship === "recent-partner"
                    ? "Played together recently"
                    : result.person.homeMarket,
                recent: result.relationship === "recent-partner",
              }))
              .sort((a, b) => Number(b.recent) - Number(a.recent)),
          });
        })
        .catch((reason) => {
          if (current !== request.current) return;
          setState({
            status: "error",
            items: fallback(),
            reference: report(reason, { event: "player.score.people_failed" }),
          });
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [client, open, query, runtime.people]);
  return state;
}

export function PersonChooser({
  visible,
  onClose,
  onChoose,
  excluded,
  title,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onChoose: (person: LivePerson) => void;
  readonly excluded: ReadonlySet<string>;
  readonly title: string;
}) {
  const { tokens } = useTheme();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [given, setGiven] = useState("");
  const [family, setFamily] = useState("");
  const [contact, setContact] = useState("");
  const [problem, setProblem] = useState<{ field: string; text: string }>();
  const candidates = useCandidates(visible, query);
  useEffect(() => {
    if (visible) return;
    setQuery("");
    setAdding(false);
    setGiven("");
    setFamily("");
    setContact("");
    setProblem(undefined);
  }, [visible]);
  const items = candidates.items.filter(
    (candidate) => !excluded.has(candidate.personId),
  );
  return (
    <AdaptiveSheet
      accessibilityLabel={title}
      kind="dialog"
      onClose={onClose}
      visible={visible}
    >
      <View style={[styles.head, { paddingHorizontal: tokens.space["4"] }]}>
        <Text accessibilityRole="header" variant="phone-heading">
          {adding ? "Add by name" : title}
        </Text>
        <IconButton icon="close" label="Close" onPress={onClose} />
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: tokens.space["4"],
          gap: tokens.space["3"],
        }}
        keyboardShouldPersistTaps="handled"
      >
        {adding ? (
          <>
            <Text tone="text-2" variant="phone-meta">
              For someone not on Duna. Their place stays open until they join
              and confirm. Add an email or mobile only if they want the confirm
              link.
            </Text>
            <Field
              autoComplete="given-name"
              error={problem?.field === "given" ? problem.text : undefined}
              label="First name"
              onChange={setGiven}
              testID="add-given"
              value={given}
            />
            <Field
              autoComplete="family-name"
              error={problem?.field === "family" ? problem.text : undefined}
              label="Last name or initial"
              onChange={setFamily}
              testID="add-family"
              value={family}
            />
            <Field
              error={problem?.field === "contact" ? problem.text : undefined}
              keyboardType="email-address"
              label="Email or mobile (optional)"
              onChange={setContact}
              placeholder="+1 310 555 0100"
              value={contact}
            />
            <ActionButton
              label="Add to the match"
              onPress={() => {
                const checked = checkAddedPerson({
                  givenName: given,
                  familyName: family,
                  contact,
                });
                if (!checked.ok) {
                  setProblem({ field: checked.field, text: checked.problem });
                  return;
                }
                onChoose(checked.person);
              }}
              testID="add-person"
            />
            <ActionButton
              kind="quiet"
              label="Back to people"
              onPress={() => setAdding(false)}
            />
          </>
        ) : (
          <>
            <Field
              label="Search people on Duna"
              onChange={setQuery}
              placeholder="Name or handle"
              value={query}
            />
            <Row
              icon="user-plus"
              onPress={() => {
                setAdding(true);
                const [first, ...rest] = query.trim().split(/\s+/);
                if (first) setGiven(first);
                if (rest.length) setFamily(rest.join(" "));
              }}
              summary="Someone who isn't on Duna yet"
              testID="add-by-name"
              title="Add by name"
            />
            {candidates.status === "error" ? (
              <ErrorState
                compact
                onRetry={() => setQuery((value) => `${value}`)}
                reference={candidates.reference}
                text="People could not load. You can still add someone by name."
                title="People unavailable"
              />
            ) : null}
            <LoadingState
              count={3}
              loading={candidates.status === "loading" && items.length === 0}
              skeleton="row"
            >
              {items.length === 0 && candidates.status === "ready" ? (
                <EmptyState
                  compact
                  text={
                    query.trim()
                      ? "No one on Duna matches. Add them by name."
                      : "People you play with appear here."
                  }
                  title={query.trim() ? "No matches" : "No one yet"}
                />
              ) : (
                items.map((candidate) => (
                  <Row
                    icon="player"
                    key={candidate.personId}
                    onPress={() =>
                      onChoose({
                        personId: candidate.personId,
                        name: candidate.name,
                      })
                    }
                    summary={candidate.meta}
                    title={candidate.name}
                  />
                ))
              )}
            </LoadingState>
          </>
        )}
      </ScrollView>
    </AdaptiveSheet>
  );
}

/** Both sides as slots; you fill your side's first place. */
export function LineupEditor({
  teamSize,
  teams,
  onChange,
  me,
  labels = { A: "Your side", B: "The other side" },
}: {
  readonly teamSize: number;
  readonly teams: Readonly<Record<TeamSide, LiveSide>>;
  readonly onChange: (teams: Readonly<Record<TeamSide, LiveSide>>) => void;
  /** The signed-in player, locked into side A. */
  readonly me?: LivePerson;
  readonly labels?: Readonly<Record<TeamSide, string>>;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const [choosing, setChoosing] = useState<TeamSide | null>(null);
  const excluded = useMemo(
    () =>
      new Set(
        (["A", "B"] as const).flatMap((side) =>
          teams[side].people.flatMap((person) =>
            person.personId ? [person.personId] : [],
          ),
        ),
      ),
    [teams],
  );
  const remove = (side: TeamSide, index: number) => {
    haptics.selection();
    onChange({
      ...teams,
      [side]: {
        people: teams[side].people.filter((_, at) => at !== index),
      },
    });
  };
  return (
    <View style={{ gap: tokens.space["4"] }}>
      {(["A", "B"] as const).map((side) => (
        <View key={side} style={{ gap: tokens.space["2"] }}>
          <Text tone="text-2" variant="phone-meta" weight={600}>
            {labels[side]}
          </Text>
          <View style={styles.slots}>
            {Array.from({ length: teamSize }, (_, index) => {
              const person = teams[side].people[index];
              const locked =
                Boolean(me?.personId) && person?.personId === me?.personId;
              if (person) {
                return (
                  <Pressable
                    accessibilityHint={locked ? undefined : "Removes them"}
                    accessibilityLabel={
                      locked ? `${person.name}, you` : `Remove ${person.name}`
                    }
                    accessibilityRole="button"
                    disabled={locked}
                    key={`${side}-${index}`}
                    onPress={() => remove(side, index)}
                    style={[
                      styles.slot,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.line,
                        borderRadius: tokens.radius.lg,
                      },
                    ]}
                  >
                    <Text numberOfLines={1} style={styles.flex} weight={600}>
                      {locked ? `${person.name} (you)` : person.name}
                    </Text>
                    {person.personId ? null : (
                      <Text tone="text-2" variant="phone-meta">
                        Added by name
                      </Text>
                    )}
                    {locked ? null : (
                      <Icon name="close" size="inline" tone="text-3" />
                    )}
                  </Pressable>
                );
              }
              return (
                <Pressable
                  accessibilityLabel={`Add a player to ${labels[side]}`}
                  accessibilityRole="button"
                  key={`${side}-${index}`}
                  onPress={() => setChoosing(side)}
                  style={[
                    styles.slot,
                    {
                      borderColor: colors["line-strong"],
                      borderStyle: "dashed",
                      borderRadius: tokens.radius.lg,
                    },
                  ]}
                  testID={`slot-${side}-${index}`}
                >
                  <Icon name="user-plus" size="control" tone="text-2" />
                  <Text tone="text-2">Add a player</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <PersonChooser
        excluded={excluded}
        onChoose={(person) => {
          if (!choosing) return;
          haptics.confirmed(0);
          onChange({
            ...teams,
            [choosing]: {
              people: [...teams[choosing].people, person].slice(0, teamSize),
            },
          });
          setChoosing(null);
        }}
        onClose={() => setChoosing(null)}
        title={choosing ? labels[choosing] : "Add a player"}
        visible={choosing !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  flex: { flex: 1 },
  slots: { gap: 8 },
  slot: {
    minHeight: 52,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
