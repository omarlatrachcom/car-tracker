import type {
  Car,
  DistanceUnit,
  EntryType,
  FuelStateMode,
  FuelVolumeUnit,
} from "../types";

export function formatDistanceUnitLabel(unit: DistanceUnit) {
  if (unit === "km") return "km";
  return "miles";
}

export function formatFuelVolumeUnitShortLabel(unit: FuelVolumeUnit) {
  if (unit === "liters") return "L";
  if (unit === "us_gallons") return "US gal";
  return "Imp gal";
}

export function formatFuelVolumeUnitFullLabel(unit: FuelVolumeUnit) {
  if (unit === "liters") return "Liters";
  if (unit === "us_gallons") return "US gallons";
  return "Imperial gallons";
}

export function formatFuelStateModeLabel(mode: FuelStateMode) {
  if (mode === "percent") return "Percent";
  return "Volume";
}

export function formatEntryType(type: EntryType) {
  if (type === "reading") return "Reading";
  return "Refuel";
}

export function formatTankState(value: number, car: Car) {
  if (car.fuelStateMode === "percent") {
    return `${value}%`;
  }

  return `${value} ${formatFuelVolumeUnitShortLabel(car.fuelVolumeUnit)}`;
}

export function formatDistanceValue(
  value: number | null,
  distanceUnit: DistanceUnit,
) {
  if (value === null) return "First entry";
  return `${value} ${formatDistanceUnitLabel(distanceUnit)}`;
}

export function formatNullableDistanceValue(
  value: number | null,
  distanceUnit: DistanceUnit,
  fallback: string,
) {
  if (value === null) return fallback;
  return `${value} ${formatDistanceUnitLabel(distanceUnit)}`;
}

export function formatConsumptionValue(value: number | null, car: Car) {
  if (value === null) return "Not available";

  return `${value} ${formatFuelVolumeUnitShortLabel(
    car.fuelVolumeUnit,
  )}/100 ${formatDistanceUnitLabel(car.distanceUnit)}`;
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

export function formatNullableDateTime(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}
