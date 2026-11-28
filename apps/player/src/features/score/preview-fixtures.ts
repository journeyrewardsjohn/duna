/**
 * Preview builds only (`duna://dev/shell?route=live&step=demo` or
 * `step=finish`): a match part-way through, or just won, so the
 * scoreboard can be seen on every device shape without playing one.
 * Example people; never sent anywhere (preview builds have no API).
 */
import {
  completeTechnicalTimeout,
  createLiveMatch,
  foldMatch,
  scorePoint,
  type LiveMatch,
  type TeamSide,
} from "./scoring-machine";

export function previewLiveMatch(kind: "demo" | "finish"): LiveMatch {
  const now = new Date().toISOString();
  let match = createLiveMatch({
    id: "00000000-0000-4000-8000-00000000d001",
    startEventId: "00000000-0000-4000-8000-00000000d000",
    now,
    teamSize: 2,
    matchType: "competitive",
    scoringSystem: "rally",
    teams: {
      A: { people: [{ name: "Noa Williams" }, { name: "Mara Lewis" }] },
      B: { people: [{ name: "Theo Park" }, { name: "Jamie Stone" }] },
    },
    agreed: true,
  });
  // 21–18, then 17–14 in the second set (or the match won 21–18, 21–16).
  const script =
    "ABABABABABABABABABABABABABABABABABABAAA".slice(0, 39) +
    (kind === "finish"
      ? "ABABABABABABABABABABABABABABABAAAAAA"
      : "ABABABABABABABABABABABABABABAAA");
  let counter = 0;
  for (const side of script) {
    counter += 1;
    match = scorePoint(
      match,
      side as TeamSide,
      `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
      now,
    );
    if (foldMatch(match).technicalTimeoutDue)
      match = completeTechnicalTimeout(match, `tto-${counter}`, now);
  }
  return match;
}
