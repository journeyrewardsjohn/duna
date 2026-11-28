/**
 * Ask for cover for one session (M-R5). Reviewed before it is posted; a
 * person presses the verb.
 *
 * How it works with today's backend: there is no "ask cover" call for a
 * member yet (Needs API), but a member may mark time they can't work, and
 * Duna then lists every session of theirs in that time for the club's
 * managers as needing cover (B3a: `addBlackout` → a coverage need with the
 * reason "can't work then"). So asking cover for a session marks exactly
 * that session's time as time I can't work. The session stays mine until a
 * manager assigns someone.
 */
import { StyleSheet, View } from "react-native";
import { Text } from "@duna/ui/native";
import { useEffect, useState } from "react";
import { ConfirmSheet } from "../session/ConfirmSheet";
import { DunaTextInput } from "../session/duna-text";
import type { AvailabilityWrites } from "../availability/use-availability";
import { sessionWhenWords, type MySession } from "../availability/week-model";

export function AskCoverSheet({
  session,
  timeZone,
  writes,
  onClose,
  onDone,
}: {
  readonly session: MySession | null;
  readonly timeZone: string;
  readonly writes: AvailabilityWrites;
  readonly onClose: () => void;
  readonly onDone: (text: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!session) setReason("");
  }, [session]);
  const when = session ? sessionWhenWords(session, timeZone) : "";
  return (
    <ConfirmSheet
      description="Duna marks you as unable to work for this session's time and lists it for your club's managers as needing cover. It stays yours until a manager assigns someone."
      event="pro.cover.ask_failed"
      onClose={onClose}
      onDone={() => session && onDone(`Cover asked for ${session.title}.`)}
      perform={async () => {
        if (!session) return;
        await writes.addBlackout({
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          reason: reason.trim() || `Cover for ${session.title}`,
        });
      }}
      rows={[
        { label: "Session", value: session?.title ?? "" },
        {
          label: "When",
          value: [when, session?.venueName].filter(Boolean).join(" · "),
        },
        { label: "Who sees it", value: "Your club's managers" },
      ]}
      testID="ask-cover-sheet"
      tier={2}
      title="Ask for cover?"
      verb="Ask for cover"
      visible={session !== null}
    >
      <View style={styles.field}>
        <Text variant="phone-meta" weight={600}>
          Reason (optional)
        </Text>
        <DunaTextInput
          accessibilityLabel="Reason, optional"
          maxLength={500}
          multiline
          onChangeText={setReason}
          placeholder="Your team can see this on your availability"
          testID="ask-cover-reason"
          value={reason}
        />
      </View>
    </ConfirmSheet>
  );
}

const styles = StyleSheet.create({ field: { gap: 6 } });
