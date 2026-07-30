import { describe, expect, it } from "vitest";
import {
  validateFormResponse,
  waiverRequiresResign,
  type SignatureEnvelope,
  type VersionedForm,
} from "./forms";

const form: VersionedForm = {
  id: "waiver-summer",
  version: 3,
  title: "Summer program waiver",
  fields: [
    {
      id: "emergencyPhone",
      type: "phone",
      label: "Emergency phone",
      required: true,
    },
    {
      id: "hasAllergy",
      type: "checkbox",
      label: "Allergy",
      required: true,
    },
    {
      id: "allergyNotes",
      type: "long-text",
      label: "Allergy notes",
      required: true,
      visibleWhen: {
        fieldId: "hasAllergy",
        operator: "equals",
        value: true,
      },
    },
  ],
  waiver: {
    documentText: "Exact waiver text shown to the signer.",
    documentTextHash: "sha256:waiver-v3",
  },
};

const signature: SignatureEnvelope = {
  formId: form.id,
  formVersion: form.version,
  documentTextHash: form.waiver!.documentTextHash,
  personId: "minor-1",
  minorPersonId: "minor-1",
  signerPersonId: "guardian-1",
  signedAt: "2026-07-30T12:00:00Z",
  ipAddress: "203.0.113.10",
  signatureValue: "Mara Guardian",
};

describe("versioned forms and waivers", () => {
  it("validates typed fields and conditional requirements server-side", () => {
    expect(
      validateFormResponse({
        form,
        personId: "minor-1",
        minorPersonId: "minor-1",
        verifiedGuardianOfMinorIds: ["guardian-1"],
        answers: {
          emergencyPhone: "+13105550123",
          hasAllergy: true,
        },
        signature,
      }),
    ).toContainEqual({ fieldId: "allergyNotes", code: "required" });
  });

  it("does not require a hidden conditional field", () => {
    expect(
      validateFormResponse({
        form,
        personId: "minor-1",
        minorPersonId: "minor-1",
        verifiedGuardianOfMinorIds: ["guardian-1"],
        answers: {
          emergencyPhone: "+13105550123",
          hasAllergy: false,
        },
        signature,
      }),
    ).toEqual([]);
  });

  it("binds a guardian signature to the exact child and document version", () => {
    const issues = validateFormResponse({
      form,
      personId: "minor-2",
      minorPersonId: "minor-2",
      verifiedGuardianOfMinorIds: ["guardian-1"],
      answers: {
        emergencyPhone: "+13105550123",
        hasAllergy: false,
      },
      signature,
    });

    expect(issues).toContainEqual({
      fieldId: "signature",
      code: "signature-person-mismatch",
    });
    expect(issues).toContainEqual({
      fieldId: "signature",
      code: "guardian-child-mismatch",
    });
  });

  it("requires one-tap re-signing when version or exact text changes", () => {
    expect(
      waiverRequiresResign({
        currentFormVersion: 4,
        currentDocumentTextHash: "sha256:waiver-v4",
        signature,
      }),
    ).toBe(true);
    expect(
      waiverRequiresResign({
        currentFormVersion: 3,
        currentDocumentTextHash: "sha256:waiver-v3",
        signature,
      }),
    ).toBe(false);
  });
});
