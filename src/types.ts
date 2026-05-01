export type DistanceUnit = "km" | "miles";
export type FuelVolumeUnit = "liters" | "us_gallons" | "imperial_gallons";
export type FuelStateMode = "percent" | "volume";
export type EntryType = "reading" | "refuel";
export type ActiveForm = "none" | "reading" | "refuel";
export type LocationLookupTarget =
  | EntryType
  | "car_wash"
  | "highway_pass_travel_fee"
  | null;

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
  locationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CarWash = {
  id: string;
  carId: string;
  price: number;
  location: string | null;
  locationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CarInsuranceRecord = {
  id: string;
  carId: string;
  nextDueDate: string;
  price: number;
  createdAt: string;
  updatedAt: string;
};

export type VehicleInspectionRecord = {
  id: string;
  carId: string;
  nextDueDate: string;
  cost: number;
  createdAt: string;
  updatedAt: string;
};

export type OtherExpense = {
  id: string;
  carId: string;
  item: string;
  cost: number;
  createdAt: string;
  updatedAt: string;
};

export type LocationPlace = {
  id: string;
  carId: string;
  name: string;
  inferredName: string;
  latitude: number;
  longitude: number;
  createdAt: string;
  updatedAt: string;
};

export type HighwayPass = {
  id: string;
  carId: string;
  passNumber: string;
  createdAt: string;
  updatedAt: string;
};

export type HighwayPassRefill = {
  id: string;
  carId: string;
  highwayPassId: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
};

export type HighwayPassTravelFee = {
  id: string;
  carId: string;
  highwayPassId: string;
  amount: number;
  location: string;
  locationId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SyncState = {
  lastDriveSyncAt: string | null;
  lastDriveFileId: string | null;
  lastSyncError: string | null;
  lastSyncSource: "local" | "drive" | null;
  datasetResetAt: string | null;
  carDataResetAtByCarId: Record<string, string>;
  carDeletedAtByCarId: Record<string, string>;
};

export type AppData = {
  version: 1;
  updatedAt: string;
  cars: Car[];
  entries: Entry[];
  carWashes: CarWash[];
  carInsuranceRecords: CarInsuranceRecord[];
  vehicleInspectionRecords: VehicleInspectionRecord[];
  otherExpenses: OtherExpense[];
  locations: LocationPlace[];
  highwayPasses: HighwayPass[];
  highwayPassRefills: HighwayPassRefill[];
  highwayPassTravelFees: HighwayPassTravelFee[];
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
