import type { AdmissionCredentialKind } from "./admission";

type WalletField = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly dateStyle?: "PKDateStyleMedium";
  readonly timeStyle?: "PKDateStyleShort";
};

export type TournamentWalletPassDefinition = {
  readonly formatVersion: 1;
  readonly passTypeIdentifier: string;
  readonly teamIdentifier: string;
  readonly organizationName: "Duna";
  readonly description: string;
  readonly serialNumber: string;
  readonly logoText: string;
  readonly foregroundColor: string;
  readonly backgroundColor: string;
  readonly labelColor: string;
  readonly relevantDate: string;
  readonly expirationDate: string;
  readonly voided: boolean;
  readonly eventTicket: {
    readonly primaryFields: readonly WalletField[];
    readonly secondaryFields: readonly WalletField[];
    readonly auxiliaryFields: readonly WalletField[];
    readonly backFields: readonly WalletField[];
  };
  readonly barcodes: readonly {
    readonly format: "PKBarcodeFormatQR";
    readonly message: string;
    readonly messageEncoding: "iso-8859-1";
    readonly altText: string;
  }[];
};

export function buildTournamentWalletPassDefinition(input: {
  readonly kind: AdmissionCredentialKind;
  readonly id: string;
  readonly credentialPayload: string;
  readonly eventTitle: string;
  readonly holderName: string;
  readonly passLabel: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venueName: string;
  readonly venueAddress?: string;
  readonly usable: boolean;
  readonly passTypeIdentifier: string;
  readonly teamIdentifier: string;
}): TournamentWalletPassDefinition {
  const isPlayer = input.kind === "player-registration";
  const kindLabel = isPlayer ? "PLAYER REGISTRATION" : "ADMISSION TICKET";
  const instructions = isPlayer
    ? "Present this player registration at Duna Pro check-in. It is not valid for spectator admission."
    : "Present this individual ticket at the fan admission gate. It is not valid for player check-in.";

  return {
    formatVersion: 1,
    passTypeIdentifier: input.passTypeIdentifier,
    teamIdentifier: input.teamIdentifier,
    organizationName: "Duna",
    description: `${input.eventTitle} · ${isPlayer ? "player registration" : "event ticket"}`,
    serialNumber: `${input.kind}:${input.id}`,
    logoText: isPlayer ? "Duna Player" : "Duna Tickets",
    foregroundColor: "rgb(247, 246, 239)",
    backgroundColor: isPlayer ? "rgb(12, 44, 52)" : "rgb(20, 37, 58)",
    labelColor: isPlayer ? "rgb(132, 226, 201)" : "rgb(246, 191, 77)",
    relevantDate: input.startsAt,
    expirationDate: input.endsAt,
    voided: !input.usable,
    eventTicket: {
      primaryFields: [
        {
          key: "event",
          label: kindLabel,
          value: input.eventTitle,
        },
      ],
      secondaryFields: [
        {
          key: "holder",
          label: isPlayer ? "PLAYER" : "TICKET HOLDER",
          value: input.holderName,
        },
        {
          key: "access",
          label: isPlayer ? "CHECK-IN" : "ADMISSION",
          value: input.passLabel,
        },
      ],
      auxiliaryFields: [
        {
          key: "starts",
          label: "STARTS",
          value: input.startsAt,
          dateStyle: "PKDateStyleMedium",
          timeStyle: "PKDateStyleShort",
        },
        { key: "venue", label: "VENUE", value: input.venueName },
      ],
      backFields: [
        { key: "credential-type", label: "CREDENTIAL TYPE", value: kindLabel },
        { key: "instructions", label: "AT THE GATE", value: instructions },
        ...(input.venueAddress
          ? [{ key: "address", label: "LOCATION", value: input.venueAddress }]
          : []),
        {
          key: "security",
          label: "SECURITY",
          value:
            "Each QR is unique. Duna records accepted, duplicate, and rejected scans in the event ledger.",
        },
      ],
    },
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: input.credentialPayload,
        messageEncoding: "iso-8859-1",
        altText: isPlayer ? "Player registration" : "Fan ticket",
      },
    ],
  };
}
