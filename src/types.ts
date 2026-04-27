export type DistanceUnit = "km" | "miles";
export type FuelVolumeUnit = "liters" | "us_gallons" | "imperial_gallons";
export type FuelStateMode = "percent" | "volume";
export type EntryType = "reading" | "refuel";
export type ActiveForm = "none" | "reading" | "refuel";
export type LocationLookupTarget = EntryType | null;

export type Car = {
  id: string;
  name: string;
  fuelType: string;
  distanceUnit: DistanceUnit;
  currency: string;
  fuelVolumeUnit: FuelVolumeUnit;
  tankCapacity: number;
  fuelStateMode: FuelStateMode;
  engineOilNextDueOdometer: number | null;
  engineOilReminderUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Entry = {
  id: string;
  carId: string;
  type: EntryType;
  odometer: number;
  distanceSinceLastEntry: number | null;
  tankState: number;
  amountAdded: number | null;
  pricePerUnit: number | null;
  moneyPaid: number | null;
  location: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SyncState = {
  lastDriveSyncAt: string | null;
  lastDriveFileId: string | null;
  lastSyncError: string | null;
  lastSyncSource: "local" | "drive" | null;
  datasetResetAt: string | null;
};

export type AppData = {
  version: 1;
  updatedAt: string;
  cars: Car[];
  entries: Entry[];
  sync: SyncState;
};

export type RefuelResolution = {
  providedCount: number;
  amountAdded: number | null;
  pricePerUnit: number | null;
  moneyPaid: number | null;
};

export type RefuelIntervalMetric = {
  entryId: string;
  distanceSincePreviousRefuel: number;
  fuelUsed: number;
  consumptionPer100Distance: number | null;
};

export type GoogleDriveUser = {
  email: string;
  name: string | null;
};

export type DriveFileRecord = {
  id: string;
  name: string;
  modifiedTime?: string;
};
