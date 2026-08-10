"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import {
  buildVenueAmenities,
  parkingAmenityOptions,
  parseVenueAmenities,
  restroomAmenityOptions,
  venueAmenityOptions,
} from "@/lib/venue-amenities";

export function VenueAmenitiesField({
  initial = [],
}: {
  readonly initial?: readonly string[];
}) {
  const parsed = parseVenueAmenities(initial);
  const [parking, setParking] = useState(parsed.parking);
  const [restrooms, setRestrooms] = useState(parsed.restrooms);
  const [toggles, setToggles] = useState<readonly string[]>(parsed.toggles);
  const [additional, setAdditional] = useState(parsed.additional.join(", "));
  const amenities = buildVenueAmenities({
    parking,
    restrooms,
    toggles,
    additional,
  });

  return (
    <fieldset className="venue-amenities-field">
      <legend>Venue features</legend>
      <p>Set the practical details players need before they arrive.</p>
      <input name="amenities" type="hidden" value={amenities.join(",")} />
      <div className="venue-amenities-field__groups">
        <fieldset>
          <legend>Parking on-site</legend>
          <div className="venue-segmented-control">
            {parkingAmenityOptions.map((option) => (
              <label key={option.value || "none"}>
                <input
                  checked={parking === option.value}
                  name="venueParking"
                  onChange={() => setParking(option.value)}
                  type="radio"
                  value={option.value}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Restrooms</legend>
          <div className="venue-segmented-control">
            {restroomAmenityOptions.map((option) => (
              <label key={option.value || "none"}>
                <input
                  checked={restrooms === option.value}
                  name="venueRestrooms"
                  onChange={() => setRestrooms(option.value)}
                  type="radio"
                  value={option.value}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="venue-amenities-field__toggles">
        {venueAmenityOptions.map((option) => {
          const checked = toggles.includes(option.value);
          return (
            <label className={checked ? "is-selected" : ""} key={option.value}>
              <input
                checked={checked}
                onChange={() =>
                  setToggles((current) =>
                    current.includes(option.value)
                      ? current.filter((value) => value !== option.value)
                      : [...current, option.value],
                  )
                }
                type="checkbox"
              />
              <span>
                <i>{checked && <Check aria-hidden size={15} />}</i>
                <strong>{option.label}</strong>
              </span>
            </label>
          );
        })}
      </div>
      <label className="venue-amenities-field__additional">
        <span>Other useful features</span>
        <input
          onChange={(event) => setAdditional(event.target.value)}
          placeholder="Outdoor showers, equipment storage, pro shop"
          value={additional}
        />
        <small>Separate additional details with commas.</small>
      </label>
    </fieldset>
  );
}
