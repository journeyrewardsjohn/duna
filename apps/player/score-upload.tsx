/**
 * The legacy "Upload a score" screen was replaced by "Add a result"
 * (`src/features/score/AddResultScreen.tsx`, M-P4a). Only this type stays:
 * the film studio's quick match set-up (`video-studio.tsx`, owned by the
 * video work stream) still imports it. Delete this file when it moves.
 */
export type ProvisionalParticipant = {
  readonly kind: "provisional";
  readonly id: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly email?: string;
  readonly phoneE164?: string;
};
