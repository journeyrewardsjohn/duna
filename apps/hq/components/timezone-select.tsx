"use client";

import { CheckCircle2, Clock3, LocateFixed } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const fallbackTimeZones = [
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/New_York",
  "America/Phoenix",
  "America/Toronto",
  "America/Vancouver",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Pacific/Auckland",
] as const;

function availableTimeZones(): readonly string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return fallbackTimeZones;
  }
}

function timeZoneLabel(timeZone: string): string {
  return timeZone.replaceAll("_", " ").replace("/", " · ");
}

export function TimezoneSelect({
  value,
  onChange,
  recommended,
  name = "timezone",
}: {
  readonly value: string;
  readonly onChange: (timeZone: string) => void;
  readonly recommended?: string;
  readonly name?: string;
}) {
  const [browserTimeZone, setBrowserTimeZone] = useState("");
  const timeZones = useMemo(() => {
    const choices = new Set(availableTimeZones());
    if (value) choices.add(value);
    if (recommended) choices.add(recommended);
    return [...choices].sort((left, right) => left.localeCompare(right));
  }, [recommended, value]);

  useEffect(() => {
    setBrowserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
  }, []);

  return (
    <div className="timezone-select">
      <label>
        <span>Event timezone</span>
        <span className="timezone-select__control">
          <Clock3 aria-hidden size={17} />
          <select
            name={name}
            onChange={(event) => onChange(event.target.value)}
            required
            value={value}
          >
            <option disabled value="">
              Choose a timezone
            </option>
            {recommended && (
              <optgroup label="Recommended for this venue">
                <option value={recommended}>
                  {timeZoneLabel(recommended)}
                </option>
              </optgroup>
            )}
            <optgroup label="All timezones">
              {timeZones
                .filter((timeZone) => timeZone !== recommended)
                .map((timeZone) => (
                  <option key={timeZone} value={timeZone}>
                    {timeZoneLabel(timeZone)}
                  </option>
                ))}
            </optgroup>
          </select>
        </span>
      </label>
      <div className="timezone-select__assist">
        {recommended && recommended === value ? (
          <span>
            <CheckCircle2 aria-hidden size={14} /> Recommended from the venue
          </span>
        ) : (
          <span>Times publish in the event&apos;s local timezone.</span>
        )}
        {browserTimeZone && browserTimeZone !== value && (
          <button onClick={() => onChange(browserTimeZone)} type="button">
            <LocateFixed aria-hidden size={14} /> Use{" "}
            {timeZoneLabel(browserTimeZone)}
          </button>
        )}
      </div>
    </div>
  );
}
