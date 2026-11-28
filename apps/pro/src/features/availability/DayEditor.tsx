/**
 * One day of my week, edited with thumbs (M-R5): each block's start and end
 * in half hours, what it is for (the model's window kinds), remove; add a
 * block; copy the day onto other days; clear the day. Nothing is saved
 * here: the screen saves the whole week explicitly.
 */
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, Text, useTheme } from "@duna/ui/native";
import { useState } from "react";
import { Card } from "../../app/ui";
import { ActionButton } from "../session/parts";
import { ChoiceChip, Stepper } from "./parts";
import {
  weekdayLong,
  weekdayShort,
  weekOrder,
  windowKindLabels,
  type WindowKind,
} from "./team-words";
import {
  DAY_MINUTES,
  STEP_MINUTES,
  blockProblem,
  blockSpokenLabel,
  blockTimeLabel,
  blocksOn,
  clearDay,
  copyDay,
  nudge,
  putBlock,
  removeBlock,
  spokenTime,
  type WeekBlock,
} from "./week-model";

const KINDS = Object.keys(windowKindLabels) as WindowKind[];

let keyCounter = 0;
export function newBlockKey(weekday: number, index = 0): string {
  keyCounter += 1;
  return `new-${weekday}-${index}-${keyCounter}`;
}

/** Where a new block lands: after the day's last block, else 5–9 PM. */
export function nextBlockFor(
  blocks: readonly WeekBlock[],
  weekday: number,
): WeekBlock {
  const day = blocksOn(blocks, weekday);
  const last = day.at(-1);
  const start =
    last && last.end <= DAY_MINUTES - 2 * 60
      ? last.end
      : last
        ? Math.max(0, day[0]!.start - 3 * 60)
        : 17 * 60;
  return {
    key: newBlockKey(weekday),
    weekday,
    start,
    end: Math.min(start + (last ? 2 : 4) * 60, DAY_MINUTES),
    kind: "coaching",
  };
}

function clock(minute: number): string {
  return spokenTime(minute);
}

export function DayEditor({
  weekday,
  blocks,
  onChange,
  disabled = false,
}: {
  readonly weekday: number;
  readonly blocks: readonly WeekBlock[];
  readonly onChange: (blocks: WeekBlock[]) => void;
  readonly disabled?: boolean;
}) {
  const { colors, tokens } = useTheme();
  const day = blocksOn(blocks, weekday);
  const [copyTargets, setCopyTargets] = useState<readonly number[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const toggleTarget = (target: number) =>
    setCopyTargets((current) =>
      current.includes(target)
        ? current.filter((value) => value !== target)
        : [...current, target],
    );

  return (
    <View style={styles.editor} testID={`day-editor-${weekday}`}>
      <Text accessibilityRole="header" variant="phone-heading">
        {weekdayLong[weekday]}
      </Text>
      {day.length === 0 ? (
        <Text tone="text-2" variant="phone-body">
          {`You're not available on ${weekdayLong[weekday]}s. Add a block for the hours you can work.`}
        </Text>
      ) : null}
      {day.map((block) => {
        const problem = blockProblem(block, blocks);
        return (
          <Card key={block.key} testID={`block-card-${block.key}`}>
            <View style={styles.blockHead}>
              <View accessible style={styles.flex}>
                <Text
                  accessibilityLabel={blockSpokenLabel(block)}
                  variant="phone-heading"
                >
                  {blockTimeLabel(block)}
                </Text>
                <Text tone="text-2" variant="phone-meta">
                  {block.end > DAY_MINUTES
                    ? "Runs past midnight"
                    : windowKindLabels[block.kind]}
                </Text>
              </View>
              <Pressable
                accessibilityHint="Removes this block from the day"
                accessibilityLabel={`Remove ${blockSpokenLabel(block)}`}
                accessibilityRole="button"
                disabled={disabled}
                hitSlop={4}
                onPress={() => onChange(removeBlock(blocks, block.key))}
                style={({ pressed }) => [
                  styles.remove,
                  {
                    borderColor: colors["line-strong"],
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
                testID={`block-remove-${block.key}`}
              >
                <Icon name="close" size="control" />
              </Pressable>
            </View>
            <View style={styles.steppers}>
              <Stepper
                canDecrease={!disabled && block.start > 0}
                canIncrease={
                  !disabled && block.start + STEP_MINUTES < block.end
                }
                label="Starts"
                onChange={(steps) =>
                  onChange(putBlock(blocks, nudge(block, "start", steps)))
                }
                testID={`block-start-${block.key}`}
                value={clock(block.start)}
              />
              <Stepper
                canDecrease={
                  !disabled && block.end - STEP_MINUTES > block.start
                }
                canIncrease={!disabled && block.end < block.start + DAY_MINUTES}
                label="Ends"
                onChange={(steps) =>
                  onChange(putBlock(blocks, nudge(block, "end", steps)))
                }
                spokenValue={
                  block.end > DAY_MINUTES
                    ? `${clock(block.end)} the next day`
                    : clock(block.end)
                }
                testID={`block-end-${block.key}`}
                value={clock(block.end)}
              />
            </View>
            <View
              accessibilityLabel="What this block is for"
              accessibilityRole="radiogroup"
              style={styles.chips}
            >
              {KINDS.map((kind) => (
                <ChoiceChip
                  key={kind}
                  label={windowKindLabels[kind]}
                  onPress={() =>
                    disabled
                      ? undefined
                      : onChange(putBlock(blocks, { ...block, kind }))
                  }
                  selected={block.kind === kind}
                />
              ))}
            </View>
            {problem ? (
              <View accessibilityLiveRegion="polite" style={styles.problem}>
                <Icon name="alert" size="inline" tone="danger" />
                <Text
                  style={styles.flex}
                  tone="danger"
                  variant="phone-meta"
                  weight={600}
                >
                  {problem}
                </Text>
              </View>
            ) : null}
          </Card>
        );
      })}
      <ActionButton
        disabled={disabled}
        hint={`Adds hours on ${weekdayLong[weekday]}`}
        icon="plus"
        label="Add a block"
        onPress={() =>
          onChange(putBlock(blocks, nextBlockFor(blocks, weekday)))
        }
        testID={`day-add-${weekday}`}
      />
      {day.length > 0 ? (
        <View
          style={[
            styles.copy,
            {
              backgroundColor: colors["surface-sunken"],
              borderRadius: tokens.radius.lg,
            },
          ]}
        >
          <Text variant="phone-body" weight={600}>
            {`Copy ${weekdayLong[weekday]} to`}
          </Text>
          <View style={styles.chips}>
            {weekOrder
              .filter((target) => target !== weekday)
              .map((target) => (
                <ChoiceChip
                  accessibilityLabel={weekdayLong[target]}
                  key={target}
                  label={weekdayShort[target]!}
                  onPress={() => toggleTarget(target)}
                  selected={copyTargets.includes(target)}
                  testID={`copy-target-${target}`}
                />
              ))}
          </View>
          <Text tone="text-2" variant="phone-meta">
            Copying replaces what those days have.
          </Text>
          <ActionButton
            disabled={disabled || copyTargets.length === 0}
            hint="Gives the chosen days the same blocks"
            icon="check"
            label={
              copyTargets.length === 0
                ? "Choose days to copy to"
                : `Copy to ${copyTargets.length} ${copyTargets.length === 1 ? "day" : "days"}`
            }
            onPress={() => {
              onChange(copyDay(blocks, weekday, copyTargets, newBlockKey));
              setCopied(
                `Copied to ${copyTargets
                  .map((target) => weekdayLong[target])
                  .join(", ")}.`,
              );
              setCopyTargets([]);
            }}
            testID={`day-copy-${weekday}`}
          />
          {copied ? (
            <Text
              accessibilityLiveRegion="polite"
              tone="positive"
              variant="phone-meta"
              weight={600}
            >
              {copied}
            </Text>
          ) : null}
        </View>
      ) : null}
      {day.length > 0 ? (
        <ActionButton
          disabled={disabled}
          hint={`Removes every block on ${weekdayLong[weekday]}`}
          icon="close"
          kind="danger"
          label={`Clear ${weekdayLong[weekday]}`}
          onPress={() => onChange(clearDay(blocks, weekday))}
          testID={`day-clear-${weekday}`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { gap: 12 },
  flex: { flex: 1, gap: 2 },
  blockHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  remove: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  steppers: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  problem: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  copy: { padding: 12, gap: 10 },
});
