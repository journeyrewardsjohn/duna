import { messagingConversationParticipants } from "@duna/db";
import { sql } from "drizzle-orm";

/** Guardian access ends when verification ends, including historical sync and push. */
export function verifiedGuardianMembership() {
  return sql`(${messagingConversationParticipants.role} <> 'guardian' OR EXISTS (
    SELECT 1 FROM guardianships AS current_guardianship
    JOIN people AS current_guardian ON current_guardian.id = current_guardianship.guardian_id
    WHERE current_guardianship.guardian_id = ${messagingConversationParticipants.personId}
      AND current_guardianship.minor_id = ${messagingConversationParticipants.guardianOfPersonId}
      AND current_guardianship.verified = true
      AND current_guardianship.review_status = 'verified'
      AND current_guardian.status = 'active'
      AND current_guardian.is_minor = false
  ))`;
}
