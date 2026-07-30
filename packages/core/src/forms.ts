export type FormFieldType =
  | "short-text"
  | "long-text"
  | "number"
  | "date"
  | "dropdown"
  | "multi-select"
  | "checkbox"
  | "file"
  | "signature"
  | "phone"
  | "email"
  | "address"
  | "rating-band"
  | "guardian"
  | "emergency-contact";

export interface FormCondition {
  readonly fieldId: string;
  readonly operator: "equals" | "not-equals" | "includes";
  readonly value: string | number | boolean;
}

export interface FormField {
  readonly id: string;
  readonly type: FormFieldType;
  readonly label: string;
  readonly required: boolean;
  readonly options?: readonly string[];
  readonly visibleWhen?: FormCondition;
  readonly privateToOrganization?: boolean;
}

export interface VersionedForm {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly fields: readonly FormField[];
  readonly waiver?: {
    readonly documentText: string;
    readonly documentTextHash: string;
  };
}

export interface SignatureEnvelope {
  readonly formId: string;
  readonly formVersion: number;
  readonly documentTextHash: string;
  readonly personId: string;
  readonly minorPersonId?: string;
  readonly signerPersonId: string;
  readonly signedAt: string;
  readonly ipAddress: string;
  readonly signatureValue: string;
}

export interface FormValidationIssue {
  readonly fieldId: string;
  readonly code:
    | "required"
    | "invalid-type"
    | "invalid-option"
    | "invalid-email"
    | "invalid-phone"
    | "invalid-date"
    | "invalid-rating-band"
    | "signature-required"
    | "signature-form-mismatch"
    | "signature-version-mismatch"
    | "signature-document-mismatch"
    | "signature-person-mismatch"
    | "guardian-child-mismatch";
}

function conditionMatches(
  condition: FormCondition | undefined,
  answers: Readonly<Record<string, unknown>>,
): boolean {
  if (!condition) return true;
  const actual = answers[condition.fieldId];
  if (condition.operator === "equals") return actual === condition.value;
  if (condition.operator === "not-equals") return actual !== condition.value;
  return (
    Array.isArray(actual) && actual.some((value) => value === condition.value)
  );
}

function valueIssue(
  field: FormField,
  value: unknown,
): FormValidationIssue["code"] | null {
  if (value === undefined || value === null || value === "") {
    return field.required ? "required" : null;
  }

  switch (field.type) {
    case "short-text":
    case "long-text":
    case "file":
    case "signature":
    case "address":
    case "guardian":
    case "emergency-contact":
      return typeof value === "string" ? null : "invalid-type";
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : "invalid-type";
    case "date":
      return typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
        ? null
        : "invalid-date";
    case "dropdown":
      if (typeof value !== "string") return "invalid-type";
      return field.options?.includes(value) ? null : "invalid-option";
    case "multi-select":
      if (
        !Array.isArray(value) ||
        !value.every((item) => typeof item === "string")
      ) {
        return "invalid-type";
      }
      return value.every((item) => field.options?.includes(item))
        ? null
        : "invalid-option";
    case "checkbox":
      return typeof value === "boolean" ? null : "invalid-type";
    case "phone":
      return typeof value === "string" && /^\+[1-9]\d{7,14}$/.test(value)
        ? null
        : "invalid-phone";
    case "email":
      return typeof value === "string" &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? null
        : "invalid-email";
    case "rating-band":
      return typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 1 &&
        value <= 8
        ? null
        : "invalid-rating-band";
  }
}

export function validateFormResponse(input: {
  readonly form: VersionedForm;
  readonly personId: string;
  readonly minorPersonId?: string;
  readonly verifiedGuardianOfMinorIds?: readonly string[];
  readonly answers: Readonly<Record<string, unknown>>;
  readonly signature?: SignatureEnvelope;
}): readonly FormValidationIssue[] {
  const issues: FormValidationIssue[] = [];

  for (const field of input.form.fields) {
    if (!conditionMatches(field.visibleWhen, input.answers)) continue;
    const issue = valueIssue(field, input.answers[field.id]);
    if (issue) issues.push({ fieldId: field.id, code: issue });
  }

  if (!input.form.waiver) return issues;
  const signature = input.signature;
  if (!signature) {
    issues.push({ fieldId: "signature", code: "signature-required" });
    return issues;
  }
  if (signature.formId !== input.form.id) {
    issues.push({ fieldId: "signature", code: "signature-form-mismatch" });
  }
  if (signature.formVersion !== input.form.version) {
    issues.push({ fieldId: "signature", code: "signature-version-mismatch" });
  }
  if (signature.documentTextHash !== input.form.waiver.documentTextHash) {
    issues.push({ fieldId: "signature", code: "signature-document-mismatch" });
  }
  if (signature.personId !== input.personId) {
    issues.push({ fieldId: "signature", code: "signature-person-mismatch" });
  }
  if (input.minorPersonId) {
    if (signature.minorPersonId !== input.minorPersonId) {
      issues.push({ fieldId: "signature", code: "guardian-child-mismatch" });
    }
    if (!input.verifiedGuardianOfMinorIds?.includes(signature.signerPersonId)) {
      issues.push({ fieldId: "signature", code: "guardian-child-mismatch" });
    }
  } else if (signature.signerPersonId !== input.personId) {
    issues.push({ fieldId: "signature", code: "signature-person-mismatch" });
  }

  return issues;
}

export function waiverRequiresResign(input: {
  readonly currentFormVersion: number;
  readonly currentDocumentTextHash: string;
  readonly signature?: SignatureEnvelope;
}): boolean {
  return (
    !input.signature ||
    input.signature.formVersion !== input.currentFormVersion ||
    input.signature.documentTextHash !== input.currentDocumentTextHash
  );
}
