/**
 * Contract: invitations by text message (owner: INVITE-SMS). Mounted at
 * `player.invites` (docs/product/invites.md):
 *
 * - `smsPreview` (mutation): the exact text each chosen contact will get, and
 *   anyone who cannot be texted and why. Reserves nothing visible to anyone
 *   else; the preview expires after 15 minutes.
 * - `sendSms` (mutation): sends ONE transactional text per ready recipient.
 *   Requires the preview's hash (a changed booking, link or list is refused
 *   as stale), `confirmed: true` and an idempotency key.
 * - `smsStatus` (query): the sender's own texts for one subject and their
 *   delivery state.
 *
 * Only the contacts the person picked are ever received: a name and a
 * number each, at most eight. Never an address book.
 */
import { inviteSmsBlockReasons, inviteSmsKinds } from "@duna/db/schema";
import { z } from "zod";

export const INVITE_SMS_PREVIEW_TTL_MINUTES = 15;

export const inviteSmsKindSchema = z.enum(inviteSmsKinds);

export const inviteSmsRecipientInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** E.164 preferred; North American numbers without +1 are accepted. */
  phoneE164: z.string().trim().min(7).max(32),
});

const subjectFields = {
  inviteKind: inviteSmsKindSchema,
  subjectId: z.string().uuid(),
};

export const inviteSmsPreviewInputSchema = z.object({
  ...subjectFields,
  recipients: z.array(inviteSmsRecipientInputSchema).min(1).max(8),
});

export const inviteSmsSendInputSchema = inviteSmsPreviewInputSchema.extend({
  previewHash: z.string().regex(/^[0-9a-f]{64}$/),
  confirmed: z.literal(true),
  idempotencyKey: z.string().min(8).max(128),
});

export const inviteSmsStatusInputSchema = z.object(subjectFields);

export const inviteSmsBlockReasonSchema = z.enum(inviteSmsBlockReasons);

export const inviteSmsPreviewRecipientSchema = z.object({
  /** Position in the request's `recipients`. */
  index: z.number().int().min(0).max(7),
  name: z.string(),
  /** "•••• 1234"; empty when the number could not be read. */
  maskedNumber: z.string(),
  state: z.enum(["ready", "blocked"]),
  reason: inviteSmsBlockReasonSchema.optional(),
  /** The exact message, present when ready. */
  text: z.string().optional(),
});

export const inviteSmsPreviewSchema = z.object({
  previewHash: z.string(),
  expiresAt: z.iso.datetime(),
  /** What sending will do now: send, or answer not configured / switched off. */
  sendState: z.enum(["ready", "not-configured", "not-enabled"]),
  readyCount: z.number().int().min(0).max(8),
  recipients: z.array(inviteSmsPreviewRecipientSchema).max(8).readonly(),
});

export const inviteSmsDeliveryStateSchema = z.enum([
  "sending",
  "sent",
  "delivered",
  "failed",
  "not-configured",
  "skipped",
]);

export const inviteSmsStatusRecipientSchema = z.object({
  id: z.string(),
  name: z.string(),
  maskedNumber: z.string(),
  state: inviteSmsDeliveryStateSchema,
  /** For `skipped`: why this person was not texted. */
  reason: inviteSmsBlockReasonSchema.optional(),
  /** Provider failure code (for example `carrier_rejected`), never text. */
  failureCode: z.string().optional(),
  sentAt: z.iso.datetime().optional(),
  deliveredAt: z.iso.datetime().optional(),
});

export const inviteSmsSendResultSchema = z.object({
  sentCount: z.number().int().min(0).max(8),
  recipients: z.array(inviteSmsStatusRecipientSchema).max(8).readonly(),
});

export const inviteSmsStatusSchema = z.object({
  recipients: z.array(inviteSmsStatusRecipientSchema).max(50).readonly(),
});

export type InviteSmsPreviewInput = z.infer<typeof inviteSmsPreviewInputSchema>;
export type InviteSmsSendInput = z.infer<typeof inviteSmsSendInputSchema>;
export type InviteSmsPreview = z.infer<typeof inviteSmsPreviewSchema>;
export type InviteSmsSendResult = z.infer<typeof inviteSmsSendResultSchema>;
export type InviteSmsStatus = z.infer<typeof inviteSmsStatusSchema>;
export type InviteSmsStatusRecipient = z.infer<
  typeof inviteSmsStatusRecipientSchema
>;
export type InviteSmsBlockReason = z.infer<typeof inviteSmsBlockReasonSchema>;
