export type AdmissionCredentialKind = "player-registration" | "fan-ticket";

export type AdmissionCredential = {
  readonly version: 1;
  readonly kind: AdmissionCredentialKind;
  readonly token: string;
};

const prefix = "duna:admission:v1";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeAdmissionCredential(input: {
  readonly kind: AdmissionCredentialKind;
  readonly token: string;
}): string {
  const token = input.token.trim();
  if (!token || token.length > 128 || token.includes(":")) {
    throw new Error("Admission credential token is invalid.");
  }
  if (input.kind === "player-registration" && !uuidPattern.test(token)) {
    throw new Error(
      "Player registration credentials require a registration ID.",
    );
  }
  return `${prefix}:${input.kind}:${token}`;
}

export function parseAdmissionCredential(
  value: string,
): AdmissionCredential | undefined {
  const normalized = value.trim();
  const match =
    /^duna:admission:v1:(player-registration|fan-ticket):([^:]+)$/i.exec(
      normalized,
    );
  if (!match?.[1] || !match[2] || match[2].length > 128) return undefined;
  const kind = match[1].toLowerCase() as AdmissionCredentialKind;
  const token = match[2];
  if (kind === "player-registration" && !uuidPattern.test(token)) {
    return undefined;
  }
  if (kind === "fan-ticket" && token.length < 16) return undefined;
  return { version: 1, kind, token };
}
