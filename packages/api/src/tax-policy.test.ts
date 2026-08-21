import { describe, expect, it } from "vitest";
import {
  MARKETPLACE_TAX_POLICY_VERSION,
  STRIPE_TAX_CODES,
  marketplaceAutomaticTax,
  resolveCatalogTaxCode,
  resolveEventTaxCode,
} from "./tax-policy";

describe("marketplace tax policy", () => {
  it("pins a version for auditable order snapshots", () => {
    expect(MARKETPLACE_TAX_POLICY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it("classifies physical merchandise such as a volleyball", () => {
    expect(
      resolveCatalogTaxCode({
        type: "good",
        subtype: "equipment",
        taxable: true,
      }),
    ).toBe(STRIPE_TAX_CODES.tangibleGoods);
  });

  it("classifies the principal sports offerings", () => {
    expect(
      resolveCatalogTaxCode({
        type: "event",
        subtype: "tournament",
        taxable: true,
      }),
    ).toBe(STRIPE_TAX_CODES.participantCompetitionFee);
    expect(
      resolveCatalogTaxCode({
        type: "service",
        subtype: "private-lesson",
        taxable: true,
      }),
    ).toBe(STRIPE_TAX_CODES.sportInstruction);
    expect(
      resolveCatalogTaxCode({
        type: "service",
        subtype: "court-rental",
        taxable: true,
      }),
    ).toBe(STRIPE_TAX_CODES.singleUseFacilityAccess);
    expect(
      resolveCatalogTaxCode({
        type: "plan",
        subtype: "membership",
        taxable: true,
      }),
    ).toBe(STRIPE_TAX_CODES.fitnessMembership);
  });

  it("preserves reviewed codes and marks exempt items explicitly", () => {
    expect(
      resolveCatalogTaxCode({
        type: "good",
        subtype: "equipment",
        taxable: true,
        explicitTaxCode: "txcd_12345678",
      }),
    ).toBe("txcd_12345678");
    expect(
      resolveCatalogTaxCode({
        type: "service",
        subtype: "other",
        taxable: false,
      }),
    ).toBe(STRIPE_TAX_CODES.nonTaxable);
  });

  it("separates spectator admission from participant fees", () => {
    expect(resolveEventTaxCode({ spectatorTicket: true })).toBe(
      STRIPE_TAX_CODES.sportingEventSpectatorAdmission,
    );
    expect(
      resolveEventTaxCode({ spectatorTicket: false, eventKind: "tournament" }),
    ).toBe(STRIPE_TAX_CODES.participantCompetitionFee);
  });

  it("always assigns marketplace liability to the platform", () => {
    expect(marketplaceAutomaticTax(true)).toEqual({
      enabled: true,
      liability: { type: "self" },
    });
    expect(marketplaceAutomaticTax(false)).toEqual({
      enabled: false,
      liability: undefined,
    });
  });
});
