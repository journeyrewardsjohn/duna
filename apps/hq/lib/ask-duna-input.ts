import { z } from "zod";

const text = z
  .object({ type: z.literal("text"), text: z.string().min(1).max(120_000) })
  .strict();
const file = z
  .object({
    type: z.literal("file"),
    mediaType: z.enum([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]),
    filename: z.string().max(200).optional(),
    data: z.string().max(2_000_100),
  })
  .strict()
  .refine((value) => {
    const prefix = `data:${value.mediaType};base64,`;
    return (
      value.data.startsWith(prefix) &&
      /^[A-Za-z0-9+/]*={0,2}$/.test(value.data.slice(prefix.length))
    );
  }, "Attachments must contain uploaded file data. Remote URLs are not accepted.");

const message = z
  .union([
    z.string().min(1).max(120_000),
    z
      .array(z.union([text, file]))
      .min(1)
      .max(7),
  ])
  .refine(
    (value) =>
      typeof value === "string" ||
      value.filter((part) => part.type === "file").length <= 3,
    "Attach up to three files.",
  );

// The model, auth principal, tools, output schema and hidden context are owned
// by the server. Clients can send user content and answer runtime budget prompts.
export const askDunaTurnInput = z
  .object({
    message: message.optional(),
    inputResponses: z
      .array(
        z
          .object({
            requestId: z.string().min(1).max(300),
            optionId: z.string().min(1).max(100).optional(),
            text: z.string().max(12_000).optional(),
          })
          .strict(),
      )
      .max(5)
      .optional(),
    turnPolicy: z.literal("queue").optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.message !== undefined || Boolean(value.inputResponses?.length),
    "Send a message or an input response.",
  );

export function validateAskDunaSessionBody(body: unknown, action?: string) {
  if (action === "cancel")
    return z
      .object({ turnId: z.string().max(300).optional() })
      .strict()
      .parse(body);
  if (action === "compact") return z.object({}).strict().parse(body);
  return askDunaTurnInput.parse(body);
}
