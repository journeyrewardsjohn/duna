"use client";

import {
  CheckCircle2,
  ExternalLink,
  MapPin,
  Pencil,
  TriangleAlert,
} from "lucide-react";
import { Field, Input } from "@duna/ui";
import { useId, useState } from "react";
import {
  addressCountryName,
  addressLocalityLine,
  addressMapImageSrc,
  formatAddress,
  googleMapsHref,
  isStructuredAddressComplete,
  normalizeAddress,
  type AddressValue,
} from "@/lib/address";
import { LocationPinPicker } from "./location-pin-picker";
import { PlaceSearch, type PlaceDetails } from "./place-search";

export type { AddressValue } from "@/lib/address";

type AddressView = "editing" | "selected";

function hasAddress(value: AddressValue): boolean {
  return Boolean(value.addressLine1?.trim() || value.formattedAddress?.trim());
}

export function AddressEntry({
  initial = {},
  label = "Search for an address",
  required = false,
  structuredFields = true,
  showAddressLine2 = true,
  includeFormFields = true,
  exactPin = false,
  onChange,
  onVenueName,
  onPlaceResolved,
}: {
  readonly initial?: AddressValue;
  readonly label?: string;
  readonly required?: boolean;
  readonly structuredFields?: boolean;
  readonly showAddressLine2?: boolean;
  readonly includeFormFields?: boolean;
  readonly exactPin?: boolean;
  readonly onChange?: (value: AddressValue) => void;
  readonly onVenueName?: (value: string) => void;
  readonly onPlaceResolved?: (details: PlaceDetails) => void;
}) {
  const startingAddress = normalizeAddress(initial);
  const initiallySelected =
    hasAddress(startingAddress) &&
    (Boolean(startingAddress.googlePlaceId) ||
      isStructuredAddressComplete(startingAddress));
  const [address, setAddress] = useState<AddressValue>(startingAddress);
  const [search, setSearch] = useState(formatAddress(startingAddress));
  const [view, setView] = useState<AddressView>(
    initiallySelected ? "selected" : "editing",
  );
  const fieldId = useId();
  const [manual, setManual] = useState(false);
  const [error, setError] = useState("");

  const selectionComplete = structuredFields
    ? isStructuredAddressComplete(address)
    : hasAddress(address);

  function commit(next: AddressValue): AddressValue {
    const normalized = normalizeAddress(next);
    setAddress(normalized);
    onChange?.(normalized);
    return normalized;
  }

  function typeAddress(value: string) {
    setSearch(value);
    setError("");
    commit({
      addressLine1: value,
      addressLine2: address.addressLine2,
      countryCode: address.countryCode,
    });
  }

  function selectPlace(details: PlaceDetails): boolean {
    const next = commit({
      googlePlaceId: details.placeId,
      googleMapsUri: details.googleMapsUri,
      formattedAddress: details.address,
      addressLine1: details.addressLine1 ?? details.address,
      addressLine2: address.addressLine2,
      locality: details.locality,
      administrativeArea: details.administrativeArea,
      postalCode: details.postalCode,
      countryCode: details.countryCode,
      latitude: details.latitude,
      longitude: details.longitude,
    });
    setSearch(formatAddress(next));
    onPlaceResolved?.(details);

    if (structuredFields && !isStructuredAddressComplete(next)) {
      setError(
        "Google found the street, but the city, state or region, or postal code is missing. Complete those details below.",
      );
      setManual(true);
      return false;
    }

    setError("");
    setManual(false);
    setView("selected");
    return true;
  }

  function updateManual(field: keyof AddressValue, value: string) {
    setError("");
    commit({
      ...address,
      [field]: value,
      formattedAddress: undefined,
      googleMapsUri: undefined,
    });
  }

  function confirmManualAddress() {
    if (!hasAddress(address)) {
      setError("Enter the street address before continuing.");
      return;
    }
    if (structuredFields && !isStructuredAddressComplete(address)) {
      setError("Add the city, state or region, postal code, and country.");
      return;
    }
    const next = commit({
      ...address,
      formattedAddress: undefined,
      googlePlaceId: undefined,
      googleMapsUri: undefined,
      latitude: undefined,
      longitude: undefined,
    });
    setSearch(formatAddress(next));
    setError("");
    setManual(false);
    setView("selected");
  }

  return (
    <div className="address-entry event-field--full operator-field--wide">
      {includeFormFields && (
        <>
          <input
            name="googlePlaceId"
            type="hidden"
            value={address.googlePlaceId ?? ""}
          />
          <input
            name="googleMapsUri"
            type="hidden"
            value={address.googleMapsUri ?? ""}
          />
          <input
            name="formattedAddress"
            type="hidden"
            value={address.formattedAddress ?? ""}
          />
          <input
            name="addressLine1"
            type="hidden"
            value={address.addressLine1 ?? ""}
          />
          <input
            name="addressLine2"
            type="hidden"
            value={address.addressLine2 ?? ""}
          />
          <input name="locality" type="hidden" value={address.locality ?? ""} />
          <input
            name="administrativeArea"
            type="hidden"
            value={address.administrativeArea ?? ""}
          />
          <input
            name="postalCode"
            type="hidden"
            value={address.postalCode ?? ""}
          />
          <input
            name="countryCode"
            type="hidden"
            value={address.countryCode ?? "US"}
          />
          <input name="latitude" type="hidden" value={address.latitude ?? ""} />
          <input
            name="longitude"
            type="hidden"
            value={address.longitude ?? ""}
          />
        </>
      )}

      {view === "selected" ? (
        <article className="address-card">
          <a
            aria-label={`Open ${formatAddress(address)} in Google Maps`}
            className="address-card__map"
            href={googleMapsHref(address)}
            rel="noreferrer"
            target="_blank"
          >
            <img alt="" loading="lazy" src={addressMapImageSrc(address)} />
            <span>
              <MapPin aria-hidden size={15} /> Map
              <ExternalLink aria-hidden size={13} />
            </span>
          </a>
          <div className="address-card__details">
            <span className="address-card__status">
              <CheckCircle2 aria-hidden size={15} />
              {address.googlePlaceId
                ? "Confirmed with Google"
                : "Address ready"}
            </span>
            <strong>{address.addressLine1 ?? address.formattedAddress}</strong>
            {address.addressLine2 && <p>{address.addressLine2}</p>}
            {addressLocalityLine(address) && (
              <p>{addressLocalityLine(address)}</p>
            )}
            <p>{addressCountryName(address.countryCode)}</p>
          </div>
          <button
            className="address-card__edit"
            onClick={() => {
              setView("editing");
              setManual(false);
              setError("");
              setSearch(formatAddress(address));
            }}
            type="button"
          >
            <Pencil aria-hidden size={16} /> Edit
          </button>
        </article>
      ) : (
        <div className="address-entry__editor">
          <PlaceSearch
            helper={
              manual
                ? "Add the city, region, and postal code below."
                : "Choose a Google result for the fastest, most accurate setup."
            }
            label={manual ? "Street address" : label}
            onAddress={typeAddress}
            onPlace={selectPlace}
            onVenueName={onVenueName ?? (() => undefined)}
            required={required}
            suggestionsEnabled={!manual}
            validationMessage={
              required && !manual && !selectionComplete
                ? "Choose a complete Google address or enter it manually."
                : undefined
            }
            value={search}
          />

          {showAddressLine2 && (
            <Field
              className="address-entry__line-two"
              htmlFor={`${fieldId}-line-two`}
              label="Address line 2"
            >
              <Input
                id={`${fieldId}-line-two`}
                onChange={(event) =>
                  updateManual("addressLine2", event.target.value)
                }
                placeholder="Suite, unit, or building"
                value={address.addressLine2 ?? ""}
              />
            </Field>
          )}

          <div className="address-entry__manual-choice">
            <span>Can’t find the right result?</span>
            <button
              onClick={() => {
                if (manual) {
                  setManual(false);
                } else {
                  const street =
                    address.addressLine1?.split(",")[0]?.trim() ?? "";
                  const next = commit({
                    ...address,
                    addressLine1: street,
                    formattedAddress: undefined,
                    googleMapsUri: undefined,
                  });
                  setSearch(next.addressLine1 ?? "");
                  setManual(true);
                }
                setError("");
              }}
              type="button"
            >
              {manual ? "Hide manual fields" : "Enter address manually"}
            </button>
          </div>

          {!manual && selectionComplete && (
            <button
              className="address-entry__done"
              onClick={() => {
                setSearch(formatAddress(address));
                setView("selected");
                setError("");
              }}
              type="button"
            >
              <CheckCircle2 aria-hidden size={15} /> Use current address
            </button>
          )}

          {manual && (
            <div className="address-entry__manual">
              {structuredFields && (
                <div className="address-entry__manual-grid">
                  <Field htmlFor={`${fieldId}-locality`} label="City">
                    <Input
                      id={`${fieldId}-locality`}
                      onChange={(event) =>
                        updateManual("locality", event.target.value)
                      }
                      required={required}
                      value={address.locality ?? ""}
                    />
                  </Field>
                  <Field htmlFor={`${fieldId}-region`} label="State or region">
                    <Input
                      id={`${fieldId}-region`}
                      onChange={(event) =>
                        updateManual("administrativeArea", event.target.value)
                      }
                      required={required}
                      value={address.administrativeArea ?? ""}
                    />
                  </Field>
                  <Field htmlFor={`${fieldId}-postal-code`} label="Postal code">
                    <Input
                      id={`${fieldId}-postal-code`}
                      onChange={(event) =>
                        updateManual("postalCode", event.target.value)
                      }
                      required={required}
                      value={address.postalCode ?? ""}
                    />
                  </Field>
                  <Field
                    htmlFor={`${fieldId}-country-code`}
                    label="Country or territory code"
                  >
                    <Input
                      id={`${fieldId}-country-code`}
                      maxLength={2}
                      onChange={(event) =>
                        updateManual("countryCode", event.target.value)
                      }
                      placeholder="US"
                      required={required}
                      value={address.countryCode ?? "US"}
                    />
                  </Field>
                </div>
              )}
              <button
                className="hq-button hq-button--secondary address-entry__confirm"
                onClick={confirmManualAddress}
                type="button"
              >
                <CheckCircle2 aria-hidden size={16} /> Use this address
              </button>
            </div>
          )}

          {error && (
            <p className="address-entry__error" role="alert">
              <TriangleAlert aria-hidden size={16} /> {error}
            </p>
          )}
        </div>
      )}
      {exactPin &&
        address.latitude !== undefined &&
        address.longitude !== undefined && (
          <LocationPinPicker
            latitude={address.latitude}
            longitude={address.longitude}
            onChange={(coordinates) => {
              commit({ ...address, ...coordinates });
            }}
          />
        )}
    </div>
  );
}

export const PlaceAddressFields = AddressEntry;
