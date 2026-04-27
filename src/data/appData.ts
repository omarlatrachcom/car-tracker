import type { AppData, Car, Entry, SyncState } from "../types";
import { isRecord } from "../utils/object";

export function createEmptySyncState(): SyncState {
  return {
    lastDriveSyncAt: null,
    lastDriveFileId: null,
    lastSyncError: null,
    lastSyncSource: null,
    datasetResetAt: null,
  };
}

export function createEmptyAppData(): AppData {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    cars: [],
    entries: [],
    sync: createEmptySyncState(),
  };
}

export function normalizeAppData(data: Partial<AppData>): AppData {
  const sync: Partial<SyncState> = isRecord(data.sync)
    ? (data.sync as Partial<SyncState>)
    : {};

  return {
    version: 1,
    updatedAt:
      typeof data.updatedAt === "string"
        ? data.updatedAt
        : new Date().toISOString(),
    cars: Array.isArray(data.cars)
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
              : new Date().toISOString(),
          updatedAt:
            typeof car.updatedAt === "string"
              ? car.updatedAt
              : new Date().toISOString(),
        }))
      : [],
    entries: Array.isArray(data.entries)
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
          createdAt:
            typeof entry.createdAt === "string"
              ? entry.createdAt
              : new Date().toISOString(),
          updatedAt:
            typeof entry.updatedAt === "string"
              ? entry.updatedAt
              : new Date().toISOString(),
        }))
      : [],
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
    },
  };
}

export function mergeAppData(localData: AppData, remoteData: AppData) {
  const latestReset = getLatestIso(
    localData.sync.datasetResetAt,
    remoteData.sync.datasetResetAt,
  );

  const filteredLocalCars = filterRecordsByReset(localData.cars, latestReset);
  const filteredRemoteCars = filterRecordsByReset(remoteData.cars, latestReset);
  const filteredLocalEntries = filterRecordsByReset(
    localData.entries,
    latestReset,
  );
  const filteredRemoteEntries = filterRecordsByReset(
    remoteData.entries,
    latestReset,
  );

  return normalizeAppData({
    version: 1,
    updatedAt:
      getLatestIso(localData.updatedAt, remoteData.updatedAt) ??
      new Date().toISOString(),
    cars: mergeEntityArrays(filteredLocalCars, filteredRemoteCars),
    entries: mergeEntityArrays(filteredLocalEntries, filteredRemoteEntries),
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
    },
  });
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function filterRecordsByReset<T extends { updatedAt: string }>(
  items: T[],
  resetAt: string | null,
) {
  if (!resetAt) return items;
  return items.filter((item) => item.updatedAt.localeCompare(resetAt) >= 0);
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

function getLatestIso(a: string | null, b: string | null) {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return a.localeCompare(b) >= 0 ? a : b;
}
