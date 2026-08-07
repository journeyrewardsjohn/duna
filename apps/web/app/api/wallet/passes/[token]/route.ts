import {
  loadTournamentAdmissionPassById,
  verifyWalletPassDownloadToken,
} from "@duna/api";
import { buildTournamentWalletPassDefinition } from "@duna/core";
import { PKPass } from "passkit-generator";
import sharp from "sharp";

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

function dunaMarkSvg(color: string): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48" fill="none">
    <path d="M5 34H59" stroke="${color}" stroke-linecap="round" stroke-width="1.5"/>
    <path d="M6 36.5C17.5 36.5 22.4 31.7 29.2 26.3C36.3 20.7 45 18.4 58 11.5" stroke="${color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="4.5"/>
  </svg>`);
}

async function passArtwork(kind: "player-registration" | "fan-ticket") {
  const mark = dunaMarkSvg(
    kind === "player-registration" ? "#84e2c9" : "#f6bf4d",
  );
  const raster = (width: number, height: number) =>
    sharp(mark).resize({ width, height, fit: "contain" }).png().toBuffer();
  const [icon, icon2x, icon3x, logo, logo2x] = await Promise.all([
    raster(29, 29),
    raster(58, 58),
    raster(87, 87),
    raster(160, 50),
    raster(320, 100),
  ]);
  return {
    "icon.png": icon,
    "icon@2x.png": icon2x,
    "icon@3x.png": icon3x,
    "logo.png": logo,
    "logo@2x.png": logo2x,
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
    const artwork = await passArtwork(record.kind);
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
