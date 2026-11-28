"use client";

import { ClubMark, Segmented, Tideline } from "@duna/ui/tideline";
import { checkColour, type MarkForm, markFormOptions } from "./setup-model";

/**
 * A club's mark as people will see it: on its colour, in light and in dark,
 * with the contrast result in numbers and words. The person picks how the
 * mark is drawn: their logo on the colour, an uploaded image tile, or a
 * two-letter monogram. No white border, ever (Duna owns the frame).
 */
export function BrandPreview({
  name,
  color,
  logo,
  tile,
  form,
  onFormChange,
  idPrefix,
}: {
  readonly name: string;
  readonly color: string;
  readonly logo?: string | null;
  readonly tile?: string | null;
  readonly form: MarkForm;
  readonly onFormChange?: (form: MarkForm) => void;
  readonly idPrefix: string;
}) {
  const check = checkColour(color);
  const source =
    form === "logo"
      ? logo
        ? "logo"
        : "monogram"
      : form === "tile"
        ? tile
          ? "tile"
          : "monogram"
        : "monogram";
  const mark = (
    <ClubMark
      color={check.valid ? check.hex : null}
      logo={logo}
      name={name}
      size="xl"
      source={source}
      tile={tile}
    />
  );
  return (
    <div className="setup-brand">
      {onFormChange ? (
        <div className="setup-brand__form">
          <span className="setup-brand__label" id={`${idPrefix}-form`}>
            How your mark is drawn
          </span>
          <Segmented
            aria-labelledby={`${idPrefix}-form`}
            onValueChange={(next) => {
              if (next === "logo" || next === "tile" || next === "monogram")
                onFormChange(next);
            }}
            options={markFormOptions.map((option) => ({
              ...option,
              disabled:
                (option.value === "logo" && !logo) ||
                (option.value === "tile" && !tile),
            }))}
            value={form}
          />
        </div>
      ) : null}
      <div className="setup-brand__tiles">
        <Tideline className="setup-brand__tile" ground theme="light" zone="hq">
          <span className="setup-brand__tile-label">Light</span>
          {mark}
        </Tideline>
        <Tideline className="setup-brand__tile" ground theme="dark" zone="hq">
          <span className="setup-brand__tile-label">Dark</span>
          {mark}
        </Tideline>
      </div>
      <p
        className="setup-brand__verdict"
        data-ok={check.valid && !check.nearLive && check.passesGraphics}
      >
        {check.verdict}
      </p>
      {form === "logo" && !logo ? (
        <p className="setup-quiet">
          No logo yet, so the monogram shows. Add a logo in Identity.
        </p>
      ) : null}
      {form === "tile" && !tile ? (
        <p className="setup-quiet">No image tile yet, so the monogram shows.</p>
      ) : null}
    </div>
  );
}
