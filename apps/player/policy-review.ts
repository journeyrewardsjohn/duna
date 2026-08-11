export interface PolicyScrollMetrics {
  readonly contentHeight: number;
  readonly offsetY: number;
  readonly viewportHeight: number;
}

const POLICY_END_THRESHOLD_PX = 16;

export function policyScrollReachedEnd({
  contentHeight,
  offsetY,
  viewportHeight,
}: PolicyScrollMetrics): boolean {
  if (contentHeight <= 0 || viewportHeight <= 0) return false;
  return (
    Math.max(0, offsetY) + viewportHeight >=
    contentHeight - POLICY_END_THRESHOLD_PX
  );
}

export function policyAcceptanceLabel(kind: "policy" | "waiver"): string {
  return kind === "waiver"
    ? "I Accept & Waive my Rights"
    : "I Accept this Policy";
}
