import type * as Location from "expo-location";

import { isRecord } from "./object";

export function formatGeocodedLocation(
  address: Location.LocationGeocodedAddress | null | undefined,
) {
  if (!address) return null;

  const formattedAddress =
    isRecord(address) && typeof address.formattedAddress === "string"
      ? address.formattedAddress.trim()
      : "";

  if (formattedAddress) return formattedAddress;

  const locationParts = uniqueNonEmptyStrings([
    address.name,
    address.street,
    address.district,
    address.city,
    address.subregion,
    address.region,
    address.country,
  ]);

  return locationParts.length > 0 ? locationParts.join(", ") : null;
}

function uniqueNonEmptyStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const uniqueValues: string[] = [];

  for (const value of values) {
    const trimmedValue = value?.trim();
    if (!trimmedValue || seen.has(trimmedValue)) continue;

    seen.add(trimmedValue);
    uniqueValues.push(trimmedValue);
  }

  return uniqueValues;
}
