"use client";

import { useState } from "react";

type HeightUnit = "imperial" | "metric";

function imperialParts(value?: number) {
  if (!value) return { feet: "", inches: "" };
  const totalInches = Math.round(value / 25.4);
  return {
    feet: String(Math.floor(totalInches / 12)),
    inches: String(totalInches % 12),
  };
}

export function HeightInput({
  value,
  onChange,
  initialUnit = "imperial",
}: {
  readonly value?: number;
  readonly onChange: (heightMillimeters?: number) => void;
  readonly initialUnit?: HeightUnit;
}) {
  const [unit, setUnit] = useState<HeightUnit>(initialUnit);
  const parts = imperialParts(value);

  function setImperial(feetValue: string, inchesValue: string) {
    if (!feetValue && !inchesValue) {
      onChange(undefined);
      return;
    }
    const feet = Number(feetValue || 0);
    const inches = Number(inchesValue || 0);
    if (!Number.isFinite(feet) || !Number.isFinite(inches)) return;
    onChange(Math.round((feet * 12 + inches) * 25.4));
  }

  return (
    <fieldset className="height-input">
      <legend>
        Height <small>Optional</small>
      </legend>
      <div className="height-input__units" aria-label="Height units">
        <button
          className={unit === "imperial" ? "is-active" : undefined}
          onClick={() => setUnit("imperial")}
          type="button"
        >
          ft + in
        </button>
        <button
          className={unit === "metric" ? "is-active" : undefined}
          onClick={() => setUnit("metric")}
          type="button"
        >
          cm
        </button>
      </div>
      {unit === "metric" ? (
        <label>
          <span className="sr-only">Height in centimeters</span>
          <input
            inputMode="numeric"
            max={260}
            min={60}
            onChange={(event) => {
              const centimeters = Number(event.target.value);
              onChange(
                event.target.value && Number.isFinite(centimeters)
                  ? Math.round(centimeters * 10)
                  : undefined,
              );
            }}
            placeholder="183"
            type="number"
            value={value ? Math.round(value / 10) : ""}
          />
          <span>cm</span>
        </label>
      ) : (
        <div className="height-input__imperial">
          <label>
            <span className="sr-only">Height in feet</span>
            <input
              inputMode="numeric"
              max={8}
              min={2}
              onChange={(event) =>
                setImperial(event.target.value, parts.inches)
              }
              placeholder="6"
              type="number"
              value={parts.feet}
            />
            <span>ft</span>
          </label>
          <label>
            <span className="sr-only">Additional height in inches</span>
            <input
              inputMode="numeric"
              max={11}
              min={0}
              onChange={(event) => setImperial(parts.feet, event.target.value)}
              placeholder="1"
              type="number"
              value={parts.inches}
            />
            <span>in</span>
          </label>
        </div>
      )}
      {value ? (
        <small>
          {Math.round(value / 10)} cm · {imperialParts(value).feet} ft{" "}
          {imperialParts(value).inches} in
        </small>
      ) : null}
    </fieldset>
  );
}
