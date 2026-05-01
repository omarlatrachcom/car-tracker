import type {
  AppData,
  Car,
  CarInsuranceRecord,
  CarWash,
  Entry,
  HighwayPass,
  HighwayPassRefill,
  HighwayPassTravelFee,
  LocationPlace,
  OtherExpense,
  SyncState,
  VehicleInspectionRecord,
} from "../types";
import { isRecord } from "../utils/object";

export function createEmptySyncState(): SyncState {
  return {
    lastDriveSyncAt: null,
    lastDriveFileId: null,
    lastSyncError: null,
    lastSyncSource: null,
    datasetResetAt: null,
    carDataResetAtByCarId: {},
    carDeletedAtByCarId: {},
  };
}

export function createEmptyAppData(): AppData {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    cars: [],
    entries: [],
    carWashes: [],
    carInsuranceRecords: [],
    vehicleInspectionRecords: [],
    otherExpenses: [],
    locations: [],
    highwayPasses: [],
    highwayPassRefills: [],
    highwayPassTravelFees: [],
    sync: createEmptySyncState(),
  };
}

export function normalizeAppData(data: Partial<AppData>): AppData {
  const sync: Partial<SyncState> = isRecord(data.sync)
    ? (data.sync as Partial<SyncState>)
    : {};
  const fallbackNow = new Date().toISOString();

  const cars: Car[] = Array.isArray(data.cars)
    ? (data.cars as Array<Partial<Car>>).map((car) => ({
          id: typeof car.id === "string" ? car.id : createId("car"),
          name: typeof car.name === "string" ? car.name : "",
          fuelType: typeof car.fuelType === "string" ? car.fuelType : "",
          distanceUnit: car.distanceUnit === "miles" ? "miles" : "km",
          currency: typeof car.currency === "string" ? car.currency : "",
          fuelVolumeUnit:
            car.fuelVolumeUnit === "us_gallons"
              ? "us_gallons"
              : car.fuelVolumeUnit === "imperial_gallons"
                ? "imperial_gallons"
                : "liters",
          tankCapacity:
            typeof car.tankCapacity === "number" ? car.tankCapacity : 0,
          fuelStateMode: car.fuelStateMode === "volume" ? "volume" : "percent",
          engineOilNextDueOdometer:
            typeof car.engineOilNextDueOdometer === "number" &&
            Number.isFinite(car.engineOilNextDueOdometer) &&
            car.engineOilNextDueOdometer >= 0
              ? car.engineOilNextDueOdometer
              : null,
          engineOilReminderUpdatedAt:
            typeof car.engineOilReminderUpdatedAt === "string"
              ? car.engineOilReminderUpdatedAt
              : null,
          createdAt:
            typeof car.createdAt === "string"
              ? car.createdAt
              : fallbackNow,
          updatedAt:
            typeof car.updatedAt === "string"
              ? car.updatedAt
              : fallbackNow,
        }))
    : [];

  const entries: Entry[] = Array.isArray(data.entries)
    ? (data.entries as Array<Partial<Entry>>).map((entry) => ({
          id: typeof entry.id === "string" ? entry.id : createId("entry"),
          carId: typeof entry.carId === "string" ? entry.carId : "",
          type: entry.type === "refuel" ? "refuel" : "reading",
          odometer: typeof entry.odometer === "number" ? entry.odometer : 0,
          distanceSinceLastEntry:
            typeof entry.distanceSinceLastEntry === "number"
              ? entry.distanceSinceLastEntry
              : null,
          tankState: typeof entry.tankState === "number" ? entry.tankState : 0,
          amountAdded:
            typeof entry.amountAdded === "number" ? entry.amountAdded : null,
          pricePerUnit:
            typeof entry.pricePerUnit === "number" ? entry.pricePerUnit : null,
          moneyPaid:
            typeof entry.moneyPaid === "number" ? entry.moneyPaid : null,
          location:
            typeof entry.location === "string" && entry.location.trim()
              ? entry.location.trim()
              : null,
          locationId:
            typeof entry.locationId === "string" && entry.locationId.trim()
              ? entry.locationId.trim()
              : null,
          createdAt:
            typeof entry.createdAt === "string"
              ? entry.createdAt
              : fallbackNow,
          updatedAt:
            typeof entry.updatedAt === "string"
              ? entry.updatedAt
              : fallbackNow,
        }))
    : [];

  const carWashes: CarWash[] = Array.isArray(data.carWashes)
    ? (data.carWashes as Array<Partial<CarWash>>).map((carWash) => ({
          id:
            typeof carWash.id === "string"
              ? carWash.id
              : createId("car_wash"),
          carId: typeof carWash.carId === "string" ? carWash.carId : "",
          price:
            typeof carWash.price === "number" &&
            Number.isFinite(carWash.price) &&
            carWash.price >= 0
              ? carWash.price
              : 0,
          location:
            typeof carWash.location === "string" && carWash.location.trim()
              ? carWash.location.trim()
              : null,
          locationId:
            typeof carWash.locationId === "string" &&
            carWash.locationId.trim()
              ? carWash.locationId.trim()
              : null,
          createdAt:
            typeof carWash.createdAt === "string"
              ? carWash.createdAt
              : fallbackNow,
          updatedAt:
            typeof carWash.updatedAt === "string"
              ? carWash.updatedAt
              : fallbackNow,
        }))
    : [];

  const carInsuranceRecords: CarInsuranceRecord[] = Array.isArray(
    data.carInsuranceRecords,
  )
    ? (data.carInsuranceRecords as Array<Partial<CarInsuranceRecord>>).map(
        (record) => ({
          id:
            typeof record.id === "string"
              ? record.id
              : createId("car_insurance"),
          carId: typeof record.carId === "string" ? record.carId : "",
          nextDueDate:
            typeof record.nextDueDate === "string"
              ? record.nextDueDate.trim()
              : "",
          price:
            typeof record.price === "number" &&
            Number.isFinite(record.price) &&
            record.price >= 0
              ? record.price
              : 0,
          createdAt:
            typeof record.createdAt === "string"
              ? record.createdAt
              : fallbackNow,
          updatedAt:
            typeof record.updatedAt === "string"
              ? record.updatedAt
              : fallbackNow,
        }),
      )
    : [];

  const vehicleInspectionRecords: VehicleInspectionRecord[] = Array.isArray(
    data.vehicleInspectionRecords,
  )
    ? (
        data.vehicleInspectionRecords as Array<
          Partial<VehicleInspectionRecord>
        >
      ).map((record) => ({
        id:
          typeof record.id === "string"
            ? record.id
            : createId("vehicle_inspection"),
        carId: typeof record.carId === "string" ? record.carId : "",
        nextDueDate:
          typeof record.nextDueDate === "string"
            ? record.nextDueDate.trim()
            : "",
        cost:
          typeof record.cost === "number" &&
          Number.isFinite(record.cost) &&
          record.cost >= 0
            ? record.cost
            : 0,
        createdAt:
          typeof record.createdAt === "string" ? record.createdAt : fallbackNow,
        updatedAt:
          typeof record.updatedAt === "string" ? record.updatedAt : fallbackNow,
      }))
    : [];

  const otherExpenses: OtherExpense[] = Array.isArray(data.otherExpenses)
    ? (data.otherExpenses as Array<Partial<OtherExpense>>).map((expense) => ({
        id:
          typeof expense.id === "string"
            ? expense.id
            : createId("other_expense"),
        carId: typeof expense.carId === "string" ? expense.carId : "",
        item: typeof expense.item === "string" ? expense.item.trim() : "",
        cost:
          typeof expense.cost === "number" &&
          Number.isFinite(expense.cost) &&
          expense.cost >= 0
            ? expense.cost
            : 0,
        createdAt:
          typeof expense.createdAt === "string"
            ? expense.createdAt
            : fallbackNow,
        updatedAt:
          typeof expense.updatedAt === "string"
            ? expense.updatedAt
            : fallbackNow,
      }))
    : [];

  const locations: LocationPlace[] = [];
  if (Array.isArray(data.locations)) {
    for (const location of data.locations as Array<Partial<LocationPlace>>) {
      const latitude =
        typeof location.latitude === "number" &&
        Number.isFinite(location.latitude) &&
        location.latitude >= -90 &&
        location.latitude <= 90
          ? location.latitude
          : null;
      const longitude =
        typeof location.longitude === "number" &&
        Number.isFinite(location.longitude) &&
        location.longitude >= -180 &&
        location.longitude <= 180
          ? location.longitude
          : null;

      if (latitude === null || longitude === null) continue;

      const inferredName =
        typeof location.inferredName === "string"
          ? location.inferredName.trim()
          : "";
      const name =
        typeof location.name === "string" && location.name.trim()
          ? location.name.trim()
          : inferredName || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

      locations.push({
        id:
          typeof location.id === "string" && location.id.trim()
            ? location.id.trim()
            : createId("location"),
        carId: typeof location.carId === "string" ? location.carId : "",
        name,
        inferredName,
        latitude,
        longitude,
        createdAt:
          typeof location.createdAt === "string"
            ? location.createdAt
            : fallbackNow,
        updatedAt:
          typeof location.updatedAt === "string"
            ? location.updatedAt
            : fallbackNow,
      });
    }
  }

  const highwayPasses: HighwayPass[] = Array.isArray(data.highwayPasses)
    ? (data.highwayPasses as Array<Partial<HighwayPass>>).map((pass) => ({
        id:
          typeof pass.id === "string" ? pass.id : createId("highway_pass"),
        carId: typeof pass.carId === "string" ? pass.carId : "",
        passNumber:
          typeof pass.passNumber === "string" ? pass.passNumber.trim() : "",
        createdAt:
          typeof pass.createdAt === "string" ? pass.createdAt : fallbackNow,
        updatedAt:
          typeof pass.updatedAt === "string" ? pass.updatedAt : fallbackNow,
      }))
    : [];

  const highwayPassIdByCarAndNumber = new Map<string, string>();
  for (const pass of highwayPasses) {
    if (!pass.passNumber) continue;
    const key = getHighwayPassKey(pass.carId, pass.passNumber);
    if (!highwayPassIdByCarAndNumber.has(key)) {
      highwayPassIdByCarAndNumber.set(key, pass.id);
    }
  }

  function ensureLegacyHighwayPass(
    carId: string,
    passNumber: unknown,
    createdAt: string,
    updatedAt: string,
  ) {
    if (typeof passNumber !== "string" || !passNumber.trim()) return "";

    const normalizedPassNumber = passNumber.trim();
    const key = getHighwayPassKey(carId, normalizedPassNumber);
    const existingId = highwayPassIdByCarAndNumber.get(key);
    if (existingId) return existingId;

    const pass: HighwayPass = {
      id: createLegacyHighwayPassId(carId, normalizedPassNumber),
      carId,
      passNumber: normalizedPassNumber,
      createdAt,
      updatedAt,
    };

    highwayPasses.push(pass);
    highwayPassIdByCarAndNumber.set(key, pass.id);
    return pass.id;
  }

  const highwayPassRefills: HighwayPassRefill[] = Array.isArray(
    data.highwayPassRefills,
  )
    ? (
        data.highwayPassRefills as Array<
          Partial<HighwayPassRefill> & { passNumber?: unknown }
        >
      ).map((refill) => {
        const carId = typeof refill.carId === "string" ? refill.carId : "";
        const createdAt =
          typeof refill.createdAt === "string" ? refill.createdAt : fallbackNow;
        const updatedAt =
          typeof refill.updatedAt === "string" ? refill.updatedAt : fallbackNow;
        const highwayPassId =
          typeof refill.highwayPassId === "string" && refill.highwayPassId
            ? refill.highwayPassId
            : ensureLegacyHighwayPass(
                carId,
                refill.passNumber,
                createdAt,
                updatedAt,
              );

        return {
          id:
            typeof refill.id === "string"
              ? refill.id
              : createId("highway_pass_refill"),
          carId,
          highwayPassId,
          amount:
            typeof refill.amount === "number" &&
            Number.isFinite(refill.amount) &&
            refill.amount >= 0
              ? refill.amount
              : 0,
          createdAt,
          updatedAt,
        };
      })
    : [];

  const highwayPassTravelFees: HighwayPassTravelFee[] = Array.isArray(
    data.highwayPassTravelFees,
  )
    ? (
        data.highwayPassTravelFees as Array<
          Partial<HighwayPassTravelFee> & { passNumber?: unknown }
        >
      ).map((fee) => {
        const carId = typeof fee.carId === "string" ? fee.carId : "";
        const createdAt =
          typeof fee.createdAt === "string" ? fee.createdAt : fallbackNow;
        const updatedAt =
          typeof fee.updatedAt === "string" ? fee.updatedAt : fallbackNow;
        const highwayPassId =
          typeof fee.highwayPassId === "string" && fee.highwayPassId
            ? fee.highwayPassId
            : ensureLegacyHighwayPass(
                carId,
                fee.passNumber,
                createdAt,
                updatedAt,
              );

        return {
          id:
            typeof fee.id === "string"
              ? fee.id
              : createId("highway_pass_travel_fee"),
          carId,
          highwayPassId,
          amount:
            typeof fee.amount === "number" &&
            Number.isFinite(fee.amount) &&
            fee.amount >= 0
              ? fee.amount
              : 0,
          location:
            typeof fee.location === "string" && fee.location.trim()
              ? fee.location.trim()
              : "",
          locationId:
            typeof fee.locationId === "string" && fee.locationId.trim()
              ? fee.locationId.trim()
              : null,
          createdAt,
          updatedAt,
        };
      })
    : [];

  return {
    version: 1,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : fallbackNow,
    cars,
    entries,
    carWashes,
    carInsuranceRecords,
    vehicleInspectionRecords,
    otherExpenses,
    locations,
    highwayPasses,
    highwayPassRefills,
    highwayPassTravelFees,
    sync: {
      lastDriveSyncAt:
        typeof sync.lastDriveSyncAt === "string" ? sync.lastDriveSyncAt : null,
      lastDriveFileId:
        typeof sync.lastDriveFileId === "string" ? sync.lastDriveFileId : null,
      lastSyncError:
        typeof sync.lastSyncError === "string" ? sync.lastSyncError : null,
      lastSyncSource:
        sync.lastSyncSource === "drive" || sync.lastSyncSource === "local"
          ? sync.lastSyncSource
          : null,
      datasetResetAt:
        typeof sync.datasetResetAt === "string" ? sync.datasetResetAt : null,
      carDataResetAtByCarId: normalizeIsoRecord(sync.carDataResetAtByCarId),
      carDeletedAtByCarId: normalizeIsoRecord(sync.carDeletedAtByCarId),
    },
  };
}

export function mergeAppData(localData: AppData, remoteData: AppData) {
  const latestReset = getLatestIso(
    localData.sync.datasetResetAt,
    remoteData.sync.datasetResetAt,
  );
  const carDataResetAtByCarId = mergeIsoRecords(
    localData.sync.carDataResetAtByCarId,
    remoteData.sync.carDataResetAtByCarId,
  );
  const carDeletedAtByCarId = mergeIsoRecords(
    localData.sync.carDeletedAtByCarId,
    remoteData.sync.carDeletedAtByCarId,
  );

  const filteredLocalCars = filterCarsByDelete(
    filterRecordsByReset(localData.cars, latestReset),
    carDeletedAtByCarId,
  );
  const filteredRemoteCars = filterCarsByDelete(
    filterRecordsByReset(remoteData.cars, latestReset),
    carDeletedAtByCarId,
  );
  const filteredLocalEntries = filterCarRecordsByDeleteAndReset(
    filterRecordsByReset(localData.entries, latestReset),
    carDeletedAtByCarId,
    carDataResetAtByCarId,
  );
  const filteredRemoteEntries = filterCarRecordsByDeleteAndReset(
    filterRecordsByReset(remoteData.entries, latestReset),
    carDeletedAtByCarId,
    carDataResetAtByCarId,
  );
  const filteredLocalCarWashes = filterCarRecordsByDeleteAndReset(
    filterRecordsByReset(localData.carWashes, latestReset),
    carDeletedAtByCarId,
    carDataResetAtByCarId,
  );
  const filteredRemoteCarWashes = filterCarRecordsByDeleteAndReset(
    filterRecordsByReset(remoteData.carWashes, latestReset),
    carDeletedAtByCarId,
    carDataResetAtByCarId,
  );
  const filteredLocalCarInsuranceRecords = filterCarRecordsByDeleteAndReset(
    filterRecordsByReset(localData.carInsuranceRecords, latestReset),
    carDeletedAtByCarId,
    carDataResetAtByCarId,
  );
  const filteredRemoteCarInsuranceRecords = filterCarRecordsByDeleteAndReset(
    filterRecordsByReset(remoteData.carInsuranceRecords, latestReset),
    carDeletedAtByCarId,
    carDataResetAtByCarId,
  );
  const filteredLocalVehicleInspectionRecords =
    filterCarRecordsByDeleteAndReset(
      filterRecordsByReset(localData.vehicleInspectionRecords, latestReset),
      carDeletedAtByCarId,
      carDataResetAtByCarId,
    );
  const filteredRemoteVehicleInspectionRecords =
    filterCarRecordsByDeleteAndReset(
      filterRecordsByReset(remoteData.vehicleInspectionRecords, latestReset),
      carDeletedAtByCarId,
      carDataResetAtByCarId,
    );
  const filteredLocalOtherExpenses = filterCarRecordsByDeleteAndReset(
    filterRecordsByReset(localData.otherExpenses, latestReset),
    carDeletedAtByCarId,
    carDataResetAtByCarId,
  );
  const filteredRemoteOtherExpenses = filterCarRecordsByDeleteAndReset(
    filterRecordsByReset(remoteData.otherExpenses, latestReset),
    carDeletedAtByCarId,
    carDataResetAtByCarId,
  );
  const filteredLocalLocations = filterCarRecordsByDeleteAndReset(
    filterRecordsByReset(localData.locations, latestReset),
    carDeletedAtByCarId,
    carDataResetAtByCarId,
  );
  const filteredRemoteLocations = filterCarRecordsByDeleteAndReset(
    filterRecordsByReset(remoteData.locations, latestReset),
    carDeletedAtByCarId,
    carDataResetAtByCarId,
  );
  const filteredLocalHighwayPasses = filterCarRecordsByDeleteAndReset(
    filterRecordsByReset(localData.highwayPasses, latestReset),
    carDeletedAtByCarId,
    carDataResetAtByCarId,
  );
  const filteredRemoteHighwayPasses = filterCarRecordsByDeleteAndReset(
    filterRecordsByReset(remoteData.highwayPasses, latestReset),
    carDeletedAtByCarId,
    carDataResetAtByCarId,
  );
  const filteredLocalHighwayPassRefills = filterCarRecordsByDeleteAndReset(
    filterRecordsByReset(localData.highwayPassRefills, latestReset),
    carDeletedAtByCarId,
    carDataResetAtByCarId,
  );
  const filteredRemoteHighwayPassRefills = filterCarRecordsByDeleteAndReset(
    filterRecordsByReset(remoteData.highwayPassRefills, latestReset),
    carDeletedAtByCarId,
    carDataResetAtByCarId,
  );
  const filteredLocalHighwayPassTravelFees = filterCarRecordsByDeleteAndReset(
    filterRecordsByReset(localData.highwayPassTravelFees, latestReset),
    carDeletedAtByCarId,
    carDataResetAtByCarId,
  );
  const filteredRemoteHighwayPassTravelFees = filterCarRecordsByDeleteAndReset(
    filterRecordsByReset(remoteData.highwayPassTravelFees, latestReset),
    carDeletedAtByCarId,
    carDataResetAtByCarId,
  );

  return normalizeAppData({
    version: 1,
    updatedAt:
      getLatestIso(localData.updatedAt, remoteData.updatedAt) ??
      new Date().toISOString(),
    cars: mergeEntityArrays(filteredLocalCars, filteredRemoteCars),
    entries: mergeEntityArrays(filteredLocalEntries, filteredRemoteEntries),
    carWashes: mergeEntityArrays(
      filteredLocalCarWashes,
      filteredRemoteCarWashes,
    ),
    carInsuranceRecords: mergeEntityArrays(
      filteredLocalCarInsuranceRecords,
      filteredRemoteCarInsuranceRecords,
    ),
    vehicleInspectionRecords: mergeEntityArrays(
      filteredLocalVehicleInspectionRecords,
      filteredRemoteVehicleInspectionRecords,
    ),
    otherExpenses: mergeEntityArrays(
      filteredLocalOtherExpenses,
      filteredRemoteOtherExpenses,
    ),
    locations: mergeEntityArrays(
      filteredLocalLocations,
      filteredRemoteLocations,
    ),
    highwayPasses: mergeEntityArrays(
      filteredLocalHighwayPasses,
      filteredRemoteHighwayPasses,
    ),
    highwayPassRefills: mergeEntityArrays(
      filteredLocalHighwayPassRefills,
      filteredRemoteHighwayPassRefills,
    ),
    highwayPassTravelFees: mergeEntityArrays(
      filteredLocalHighwayPassTravelFees,
      filteredRemoteHighwayPassTravelFees,
    ),
    sync: {
      lastDriveSyncAt: getLatestIso(
        localData.sync.lastDriveSyncAt,
        remoteData.sync.lastDriveSyncAt,
      ),
      lastDriveFileId:
        remoteData.sync.lastDriveFileId ??
        localData.sync.lastDriveFileId ??
        null,
      lastSyncError: null,
      lastSyncSource: "drive",
      datasetResetAt: latestReset,
      carDataResetAtByCarId,
      carDeletedAtByCarId,
    },
  });
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getHighwayPassKey(carId: string, passNumber: string) {
  return `${carId}:${passNumber.trim().toLowerCase()}`;
}

function createLegacyHighwayPassId(carId: string, passNumber: string) {
  return `highway_pass_legacy_${hashString(getHighwayPassKey(carId, passNumber))}`;
}

function hashString(value: string) {
  let hash = 0;

  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }

  return Math.abs(hash).toString(36);
}

function normalizeIsoRecord(value: unknown) {
  const normalized: Record<string, string> = {};
  if (!isRecord(value)) return normalized;

  for (const [key, recordValue] of Object.entries(value)) {
    if (!key || typeof recordValue !== "string") continue;
    normalized[key] = recordValue;
  }

  return normalized;
}

function filterRecordsByReset<T extends { updatedAt: string }>(
  items: T[],
  resetAt: string | null,
) {
  if (!resetAt) return items;
  return items.filter((item) => item.updatedAt.localeCompare(resetAt) >= 0);
}

function filterCarsByDelete<T extends { id: string }>(
  cars: T[],
  carDeletedAtByCarId: Record<string, string>,
) {
  return cars.filter((car) => !(car.id in carDeletedAtByCarId));
}

function filterCarRecordsByDeleteAndReset<
  T extends { carId: string; updatedAt: string },
>(
  records: T[],
  carDeletedAtByCarId: Record<string, string>,
  carDataResetAtByCarId: Record<string, string>,
) {
  return records.filter((record) => {
    if (record.carId in carDeletedAtByCarId) return false;

    const resetAt = carDataResetAtByCarId[record.carId];
    if (!resetAt) return true;

    return record.updatedAt.localeCompare(resetAt) >= 0;
  });
}

function mergeEntityArrays<T extends { id: string; updatedAt: string }>(
  localItems: T[],
  remoteItems: T[],
) {
  const byId = new Map<string, T>();

  for (const item of [...localItems, ...remoteItems]) {
    const current = byId.get(item.id);

    if (!current || item.updatedAt.localeCompare(current.updatedAt) > 0) {
      byId.set(item.id, item);
    }
  }

  return Array.from(byId.values());
}

function mergeIsoRecords(
  localRecord: Record<string, string>,
  remoteRecord: Record<string, string>,
) {
  const merged: Record<string, string> = {};
  const keys = new Set([
    ...Object.keys(localRecord),
    ...Object.keys(remoteRecord),
  ]);

  for (const key of keys) {
    const latest = getLatestIso(
      localRecord[key] ?? null,
      remoteRecord[key] ?? null,
    );
    if (latest) {
      merged[key] = latest;
    }
  }

  return merged;
}

function getLatestIso(a: string | null, b: string | null) {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return a.localeCompare(b) >= 0 ? a : b;
}
