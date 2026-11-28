"use client";

import {
  Button,
  CharacterCounter,
  Select,
  Textarea,
  useAction,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateBusinessAction } from "@/app/(next)/(hq)/money/actions";
import { unwrap } from "./money-action-result";
import { actionError } from "./money-client";

export const businessTypes = [
  { value: "individual", label: "run by one person" },
  { value: "company-llc", label: "a limited company (LLC)" },
  { value: "company-corporation", label: "a corporation" },
  { value: "partnership", label: "a partnership" },
  { value: "non-profit", label: "a non-profit" },
  { value: "public-body", label: "a school, city or public body" },
] as const;

const WHAT_YOU_SELL_MAX = 500;

/**
 * Business details as a sentence (ia-hq.md "settings as sentences"): the
 * club is [a kind of business] that sells [what it sells]. The legal name
 * comes from verification and is shown, not typed here. Saved with a toast;
 * nothing about money changes.
 */
export function BusinessForm({
  organization,
  legalName,
  businessType,
  whatYouSell,
  canWrite,
}: {
  readonly organization: string;
  readonly legalName?: string;
  readonly businessType?: string;
  readonly whatYouSell?: string;
  readonly canWrite: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<string | null>(businessType ?? null);
  const [sells, setSells] = useState(whatYouSell ?? "");
  const [problems, setProblems] = useState<{ type?: string; sells?: string }>(
    {},
  );
  const save = useAction(
    async () => {
      const next = {
        type: type ? undefined : "Choose what kind of business this is.",
        sells: sells.trim() ? undefined : "Say what you sell, in a few words.",
      };
      setProblems(next);
      if (next.type || next.sells) {
        throw Object.assign(new Error("Check the highlighted fields."), {
          userMessage: "Two answers are needed before saving.",
        });
      }
      return unwrap(
        await updateBusinessAction({ businessType: type!, whatYouSell: sells }),
      );
    },
    {
      messages: {
        success: "Business details saved",
        error: (error) => actionError(error, "Business details weren't saved."),
      },
      onSuccess: () => router.refresh(),
    },
  );
  const known = businessTypes.some((option) => option.value === type);
  return (
    <form
      aria-label="Business details"
      className="money-sentence"
      onSubmit={(event) => {
        event.preventDefault();
        void save.run();
      }}
    >
      <div className="money-sentence__line">
        <span>
          {legalName
            ? `${legalName} (${organization}) is`
            : `${organization} is`}
        </span>
        <div className="money-sentence__field">
          <Select
            aria-label="Kind of business"
            disabled={!canWrite}
            onValueChange={(value) => {
              setType(value);
              setProblems((p) => ({ ...p, type: undefined }));
            }}
            options={[
              ...businessTypes,
              ...(type && !known ? [{ value: type, label: type }] : []),
            ]}
            value={type}
          />
        </div>
        <span>that sells</span>
      </div>
      {problems.type ? (
        <p className="money-field-error" role="alert">
          {problems.type}
        </p>
      ) : null}
      <label className="money-sentence__block">
        <span className="td-sr">What you sell</span>
        <Textarea
          aria-invalid={problems.sells ? true : undefined}
          disabled={!canWrite}
          maxLength={WHAT_YOU_SELL_MAX}
          onChange={(event) => {
            setSells(event.currentTarget.value);
            setProblems((p) => ({ ...p, sells: undefined }));
          }}
          placeholder="Court rentals, lessons, junior programs and weekend tournaments"
          rows={3}
          value={sells}
        />
        <CharacterCounter max={WHAT_YOU_SELL_MAX} value={sells} />
      </label>
      {problems.sells ? (
        <p className="money-field-error" role="alert">
          {problems.sells}
        </p>
      ) : null}
      <p className="money-quiet">
        {legalName
          ? "The legal name comes from verification. To change it, contact Duna support."
          : "Your legal name is confirmed during verification."}
      </p>
      {canWrite ? (
        <div className="money-form-actions">
          <Button {...save.buttonProps} variant="primary">
            Save business details
          </Button>
        </div>
      ) : null}
    </form>
  );
}
