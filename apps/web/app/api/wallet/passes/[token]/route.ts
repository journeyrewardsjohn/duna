import {
  loadTournamentAdmissionPassById,
  verifyWalletPassDownloadToken,
} from "@duna/api";
import { buildTournamentWalletPassDefinition } from "@duna/core";
import { PKPass } from "passkit-generator";
import { tournamentPassArtwork } from "./wallet-pass-artwork";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WalletConfiguration = {
  readonly passTypeIdentifier: string;
  readonly teamIdentifier: string;
  readonly wwdr: Buffer;
  readonly signerCert: Buffer;
  readonly signerKey: Buffer;
  readonly signerKeyPassphrase?: string;
};

function walletConfiguration(): WalletConfiguration | undefined {
  const passTypeIdentifier = process.env.APPLE_WALLET_PASS_TYPE_ID?.trim();
  const teamIdentifier = process.env.APPLE_WALLET_TEAM_ID?.trim();
  const wwdr = process.env.APPLE_WALLET_WWDR_CERT_BASE64?.trim();
  const signerCert = process.env.APPLE_WALLET_SIGNER_CERT_BASE64?.trim();
  const signerKey = process.env.APPLE_WALLET_SIGNER_KEY_BASE64?.trim();
  if (
    !passTypeIdentifier ||
    !teamIdentifier ||
    !wwdr ||
    !signerCert ||
    !signerKey
  ) {
    return undefined;
  }
  return {
    passTypeIdentifier,
    teamIdentifier,
    wwdr: Buffer.from(wwdr, "base64"),
    signerCert: Buffer.from(signerCert, "base64"),
    signerKey: Buffer.from(signerKey, "base64"),
    signerKeyPassphrase:
      process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE?.trim() || undefined,
  };
}

function filename(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${normalized || "duna-tournament"}.pkpass`;
}

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly token: string }> },
) {
  const { token } = await context.params;
  const claim = await verifyWalletPassDownloadToken(token);
  if (!claim) {
    return Response.json(
      { error: "This Apple Wallet link is invalid or has expired." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const configuration = walletConfiguration();
  if (!configuration) {
    return Response.json(
      { error: "Apple Wallet signing is not configured for this environment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const record = await loadTournamentAdmissionPassById({
    kind: claim.kind,
    passId: claim.passId,
    personId: claim.personId,
  });
  if (!record) {
    return Response.json(
      { error: "This tournament pass is no longer available." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const definition = buildTournamentWalletPassDefinition({
      ...record,
      passTypeIdentifier: configuration.passTypeIdentifier,
      teamIdentifier: configuration.teamIdentifier,
    });
    const artwork = tournamentPassArtwork();
    const pass = new PKPass(
      {
        ...artwork,
        "pass.json": Buffer.from(JSON.stringify(definition)),
      },
      {
        wwdr: configuration.wwdr,
        signerCert: configuration.signerCert,
        signerKey: configuration.signerKey,
        signerKeyPassphrase: configuration.signerKeyPassphrase,
      },
    );
    const buffer = pass.getAsBuffer();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Cache-Control": "no-store, private",
        "Content-Disposition": `attachment; filename="${filename(record.eventTitle)}"`,
        "Content-Length": String(buffer.byteLength),
        "Content-Type": "application/vnd.apple.pkpass",
      },
    });
  } catch (error) {
    console.error(
      "Apple Wallet pass generation failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return Response.json(
      { error: "Duna could not sign this Apple Wallet pass." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
