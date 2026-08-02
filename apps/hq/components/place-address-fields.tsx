"use client";

import { useState } from "react";
import { PlaceSearch, type PlaceDetails } from "./place-search";

interface AddressValue {
  readonly googlePlaceId?: string;
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly locality?: string;
  readonly administrativeArea?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

export function PlaceAddressFields({
  initial = {},
  label = "Search for an address",
  required = false,
}: {
  readonly initial?: AddressValue;
  readonly label?: string;
  readonly required?: boolean;
}) {
  const [search, setSearch] = useState(
    [
      initial.addressLine1,
      initial.locality,
      initial.administrativeArea,
      initial.postalCode,
    ]
      .filter(Boolean)
      .join(", "),
  );
  const [address, setAddress] = useState<AddressValue>(initial);

  function select(details: PlaceDetails) {
    setAddress((current) => ({
      ...current,
      googlePlaceId: details.placeId,
      addressLine1: details.addressLine1 ?? details.address,
      locality: details.locality,
      administrativeArea: details.administrativeArea,
      postalCode: details.postalCode,
      countryCode: details.countryCode,
      latitude: details.latitude,
      longitude: details.longitude,
    }));
  }

  return (
    <div className="place-address-fields operator-field--wide">
      <PlaceSearch
        label={label}
        onAddress={(value) => {
          setSearch(value);
          setAddress((current) => ({
            addressLine1: value,
            addressLine2: current.addressLine2,
          }));
        }}
        onPlace={select}
        onVenueName={() => undefined}
        value={search}
      />
      <input
        name="googlePlaceId"
        type="hidden"
        value={address.googlePlaceId ?? ""}
      />
      <input
        name="addressLine1"
        required={required}
        type="hidden"
        value={address.addressLine1 ?? ""}
      />
      <input name="locality" type="hidden" value={address.locality ?? ""} />
      <input
        name="administrativeArea"
        type="hidden"
        value={address.administrativeArea ?? ""}
      />
      <input name="postalCode" type="hidden" value={address.postalCode ?? ""} />
      <input
        name="countryCode"
        type="hidden"
        value={address.countryCode ?? "US"}
      />
      <input name="latitude" type="hidden" value={address.latitude ?? ""} />
      <input name="longitude" type="hidden" value={address.longitude ?? ""} />
      <label>
        <span>Address line 2</span>
        <input
          name="addressLine2"
          onChange={(event) =>
            setAddress((current) => ({
              ...current,
              addressLine2: event.target.value,
            }))
          }
          placeholder="Suite, unit, or building"
          value={address.addressLine2 ?? ""}
        />
      </label>
      {address.locality && (
        <small className="place-address-fields__resolved">
          {[
            address.locality,
            address.administrativeArea,
            address.postalCode,
            address.countryCode,
          ]
            .filter(Boolean)
            .join(", ")}
        </small>
      )}
    </div>
  );
}
