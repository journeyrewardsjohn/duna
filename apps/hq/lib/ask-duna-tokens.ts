import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

const claimsSchema = z.object({
  sub: z.string().uuid(),
  organizationId: z.string().uuid(),
  conversationId: z.string().uuid(),
  sessionId: z.string().nullable(),
  purpose: z.enum(["create", "operate", "inspect"]),
});
export type AskDunaClaims = z.infer<typeof claimsSchema>;

function signingKey() {
  const secret =
    process.env.DUNA_AI_SESSION_SECRET || process.env.WORKOS_COOKIE_PASSWORD;
  if (!secret || secret.length < 32)
    throw new Error(
      "Configure DUNA_AI_SESSION_SECRET with at least 32 characters.",
    );
  return new TextEncoder().encode(`duna-ask-session-v1:${secret}`);
}

export function hasAskDunaSessionSecret() {
  return (
    (
      process.env.DUNA_AI_SESSION_SECRET ||
      process.env.WORKOS_COOKIE_PASSWORD ||
      ""
    ).length >= 32
  );
}

export function signAskDunaToken(claims: AskDunaClaims) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("duna-hq")
    .setAudience("ask-duna")
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(signingKey());
}

export async function verifyAskDunaToken(token: string) {
  const { payload } = await jwtVerify(token, signingKey(), {
    issuer: "duna-hq",
    audience: "ask-duna",
    algorithms: ["HS256"],
  });
  return claimsSchema.parse(payload);
}
