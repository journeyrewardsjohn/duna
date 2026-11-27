import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  policyAcceptanceLabel,
  policyScrollReachedEnd,
  type PolicyScrollMetrics,
} from "../../policy-review";
import { NativeMarkdownContent } from "../../markdown-content";
import { SatoshiText as Text } from "../../satoshi-text";
import { colors } from "./palette";
import { successHaptic } from "./haptics";
import { Pill } from "./Pill";
import { styles } from "../legacy/styles";

export interface MobilePolicyReviewDocument {
  readonly id: string;
  readonly kind: "policy" | "waiver";
  readonly markdown: string;
  readonly required: boolean;
  readonly requireFullScroll: boolean;
  readonly title: string;
}

export function MobilePolicyReviewCard({
  accepted,
  detail,
  onPress,
  policy,
}: {
  readonly accepted: boolean;
  readonly detail?: string;
  readonly onPress: () => void;
  readonly policy: MobilePolicyReviewDocument;
}) {
  return (
    <Pressable
      accessibilityHint="Opens the full document and its acceptance button"
      accessibilityLabel={`Review ${policy.title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.mobilePolicyCard,
        pressed && styles.mobilePolicyCardPressed,
      ]}
    >
      <View style={styles.mobilePolicyHeader}>
        <View style={styles.flex}>
          <Text style={styles.mobilePolicyTitle}>{policy.title}</Text>
          {detail && <Text style={styles.mobilePolicyDetail}>{detail}</Text>}
        </View>
        <Pill tone={accepted ? "positive" : "warning"}>
          {accepted ? "Accepted" : policy.required ? "Required" : "Optional"}
        </Pill>
      </View>
      <Text numberOfLines={3} style={styles.mobilePolicyDocumentText}>
        {policy.markdown}
      </Text>
      <View
        style={[
          styles.mobilePolicyAction,
          accepted && styles.mobilePolicyActionAccepted,
        ]}
      >
        <View style={styles.flex}>
          <Text
            style={[
              styles.mobilePolicyActionTitle,
              accepted && styles.mobilePolicyActionTitleAccepted,
            ]}
          >
            {accepted
              ? "Accepted for this checkout"
              : policy.requireFullScroll
                ? `Tap to read the full ${policy.kind}`
                : "Tap to review and accept"}
          </Text>
          <Text style={styles.mobilePolicyActionMeta}>
            {accepted
              ? "Tap to review the document again"
              : policy.requireFullScroll
                ? "Scroll to the bottom to unlock acceptance"
                : "The acceptance button is on the review screen"}
          </Text>
        </View>
        <Text
          style={[
            styles.mobilePolicyActionIcon,
            accepted && styles.mobilePolicyActionIconAccepted,
          ]}
        >
          {accepted ? "✓" : "›"}
        </Text>
      </View>
    </Pressable>
  );
}

export function PolicyReviewModal({
  accepted,
  onAccept,
  onClose,
  policy,
  read,
  visible,
}: {
  readonly accepted: boolean;
  readonly onAccept: () => void;
  readonly onClose: () => void;
  readonly policy?: MobilePolicyReviewDocument;
  readonly read: boolean;
  readonly visible: boolean;
}) {
  const metrics = useRef<PolicyScrollMetrics>({
    contentHeight: 0,
    offsetY: 0,
    viewportHeight: 0,
  });
  const [reachedEnd, setReachedEnd] = useState(false);

  useEffect(() => {
    metrics.current = {
      contentHeight: 0,
      offsetY: 0,
      viewportHeight: 0,
    };
    setReachedEnd(Boolean(policy && (!policy.requireFullScroll || read)));
  }, [policy?.id, policy?.requireFullScroll, read, visible]);

  if (!policy) return null;

  const updateMetrics = (next: Partial<PolicyScrollMetrics>) => {
    metrics.current = { ...metrics.current, ...next };
    if (policyScrollReachedEnd(metrics.current)) setReachedEnd(true);
  };
  const canAccept = !policy.requireFullScroll || read || reachedEnd;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.policyReviewSafe}>
        <View style={styles.policyReviewHeader}>
          <Pressable
            accessibilityLabel="Close policy review"
            hitSlop={12}
            onPress={onClose}
            style={styles.policyReviewClose}
          >
            <Text style={styles.policyReviewCloseText}>‹</Text>
          </Pressable>
          <View style={styles.policyReviewHeading}>
            <Text style={styles.policyReviewEyebrow}>
              {policy.kind === "waiver" ? "WAIVER REVIEW" : "POLICY REVIEW"}
            </Text>
            <Text numberOfLines={2} style={styles.policyReviewTitle}>
              {policy.title}
            </Text>
          </View>
          <Pill tone={accepted ? "positive" : "warning"}>
            {accepted ? "Accepted" : policy.required ? "Required" : "Optional"}
          </Pill>
        </View>

        {policy.requireFullScroll && (
          <View
            accessibilityLiveRegion="polite"
            style={[
              styles.policyReviewInstruction,
              canAccept && styles.policyReviewInstructionComplete,
            ]}
          >
            <Text style={styles.policyReviewInstructionIcon}>
              {canAccept ? "✓" : "↓"}
            </Text>
            <Text style={styles.policyReviewInstructionText}>
              {canAccept
                ? "You reached the end. The acceptance button is ready."
                : "Read this document and scroll to the bottom to unlock acceptance."}
            </Text>
          </View>
        )}

        <ScrollView
          accessibilityLabel={`${policy.title} full text`}
          contentContainerStyle={styles.policyReviewContent}
          onContentSizeChange={(_width, height) =>
            updateMetrics({ contentHeight: height })
          }
          onLayout={({ nativeEvent }) =>
            updateMetrics({ viewportHeight: nativeEvent.layout.height })
          }
          onScroll={({ nativeEvent }) =>
            updateMetrics({
              contentHeight: nativeEvent.contentSize.height,
              offsetY: nativeEvent.contentOffset.y,
              viewportHeight: nativeEvent.layoutMeasurement.height,
            })
          }
          scrollEventThrottle={16}
          showsVerticalScrollIndicator
          style={styles.policyReviewScroll}
        >
          <NativeMarkdownContent
            color={colors.bone}
            linkColor={colors.signal}
            markdown={policy.markdown}
          />
          <View style={styles.policyReviewEnd}>
            <Text style={styles.policyReviewEndMark}>✓</Text>
            <Text style={styles.policyReviewEndText}>End of {policy.kind}</Text>
          </View>
        </ScrollView>

        <View style={styles.policyReviewFooter}>
          <Text style={styles.policyReviewConfirmation}>
            {policy.kind === "waiver"
              ? "By accepting, you confirm you read and agree to the waiver shown above."
              : "By accepting, you confirm you read and agree to the policy shown above."}
          </Text>
          <Pressable
            accessibilityHint={
              canAccept
                ? "Records your acceptance for this checkout"
                : "Scroll to the bottom of the document first"
            }
            accessibilityRole="button"
            accessibilityState={{ disabled: accepted || !canAccept }}
            disabled={accepted || !canAccept}
            onPress={() => {
              successHaptic();
              onAccept();
            }}
            style={[
              styles.policyReviewAccept,
              (accepted || !canAccept) && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.policyReviewAcceptText}>
              {accepted ? "✓ Accepted" : policyAcceptanceLabel(policy.kind)}
            </Text>
          </Pressable>
          {policy.requireFullScroll && !canAccept && (
            <Text style={styles.policyReviewLockedText}>
              Acceptance unlocks at the end of the document.
            </Text>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
