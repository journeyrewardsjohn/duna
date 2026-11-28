/**
 * The Tap to Pay stage (M-R4): a Night Court ground, the Crest's arcs
 * turned to face the top of the phone as the contactless field, the amount
 * in Geist Mono and one instruction. Drawn in code; it replaces the old
 * card-and-phone illustration.
 *
 * States: preparing (the field rests while the reader starts), ready
 * ("Hold the card or phone at the top of this iPhone", the field breathes),
 * reading (the field runs at the Rally pace), approved (still, in the
 * positive colour), declined / cancelled / error (still, with what to do
 * next). The words come from the reader's own prompts (unchanged), and the
 * Tap to Pay name and contactless symbol stay as Apple's Tap to Pay on
 * iPhone guidelines require. Reduced motion: the still field.
 */
import { StyleSheet, View } from "react-native";
import { Icon, Rise, Text, ThemeOverride, useTheme } from "@duna/ui/native";
import { CrestField, type CrestTempo } from "../../shared/CrestField";

export type StagePhase =
  | "preparing"
  | "ready"
  | "reading"
  | "approved"
  | "declined"
  | "cancelled"
  | "error";

const NEXT_STEP: Partial<Record<StagePhase, string>> = {
  declined: "Ask for another card, or choose another way to pay.",
  cancelled: "Nothing was charged. Try again when they're ready.",
  error:
    "Nothing was charged unless the receipt says so. Try again, or choose another way to pay.",
};

export function TapToPayStage(props: {
  readonly phase: StagePhase;
  readonly prompt: string;
  readonly amount: string;
  readonly context: string;
  readonly detail?: string;
}) {
  return (
    <ThemeOverride theme="dark">
      <Stage {...props} />
    </ThemeOverride>
  );
}

function Stage({
  phase,
  prompt,
  amount,
  context,
  detail,
}: {
  readonly phase: StagePhase;
  readonly prompt: string;
  readonly amount: string;
  readonly context: string;
  readonly detail?: string;
}) {
  const { colors, tokens } = useTheme();
  const tempo: CrestTempo =
    phase === "ready" ? "calm" : phase === "reading" ? "active" : "still";
  const fieldColor =
    phase === "approved"
      ? colors.positive
      : phase === "declined" || phase === "error"
        ? colors.danger
        : tokens.brand.dune;
  const result =
    phase === "approved" ||
    phase === "declined" ||
    phase === "cancelled" ||
    phase === "error";
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.stage,
        {
          backgroundColor: tokens.brand["night-court"],
          borderRadius: tokens.radius["2xl"],
          borderColor: colors.line,
        },
      ]}
      testID={`tap-to-pay-${phase}`}
    >
      {/* The top edge of the stage is the top of the phone: the field faces it. */}
      <View style={styles.fieldWrap}>
        <CrestField
          color={fieldColor}
          height={132}
          net={false}
          style={{
            transform: [{ rotate: "-90deg" }],
            opacity: phase === "preparing" ? 0.45 : 1,
          }}
          tempo={tempo}
          testID="tap-to-pay-field"
        />
      </View>
      <View style={styles.badge}>
        <Icon
          name={
            phase === "approved" ? "success" : result ? "alert" : "tap-to-pay"
          }
          size="control"
          tone={
            phase === "approved"
              ? "positive"
              : phase === "declined" || phase === "error"
                ? "danger"
                : "text"
          }
        />
        <Text variant="phone-meta" weight={600}>
          Tap to Pay
        </Text>
      </View>
      {/* The amount, the player and the item stay on the summary card above. */}
      <Text
        accessibilityLabel={`${amount}, ${context}`}
        style={styles.center}
        tone="text-2"
        variant="phone-meta"
      >
        {`${amount} · ${context}`}
      </Text>
      <Rise trigger={`${phase}:${prompt}`}>
        <Text style={styles.center} variant="phone-heading">
          {prompt}
        </Text>
      </Rise>
      {NEXT_STEP[phase] ? (
        <Text style={styles.center} tone="text-2" variant="phone-body">
          {NEXT_STEP[phase]}
        </Text>
      ) : null}
      {detail ? (
        <Text style={styles.center} tone="text-3" variant="phone-meta">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  fieldWrap: { height: 150, alignItems: "center", justifyContent: "center" },
  badge: { flexDirection: "row", alignItems: "center", gap: 6 },
  center: { textAlign: "center" },
});
