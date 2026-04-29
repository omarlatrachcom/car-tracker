import type {
  AppData,
  Car,
  CarWash,
  Entry,
  HighwayPass,
  HighwayPassRefill,
  HighwayPassTravelFee,
  SyncState,
} from "../types";
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
    carWashes: [],
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
  const filteredLocalCarWashes = filterRecordsByReset(
    localData.carWashes,
    latestReset,
  );
  const filteredRemoteCarWashes = filterRecordsByReset(
    remoteData.carWashes,
    latestReset,
  );
  const filteredLocalHighwayPasses = filterRecordsByReset(
    localData.highwayPasses,
    latestReset,
  );
  const filteredRemoteHighwayPasses = filterRecordsByReset(
    remoteData.highwayPasses,
    latestReset,
  );
  const filteredLocalHighwayPassRefills = filterRecordsByReset(
    localData.highwayPassRefills,
    latestReset,
  );
  const filteredRemoteHighwayPassRefills = filterRecordsByReset(
    remoteData.highwayPassRefills,
    latestReset,
  );
  const filteredLocalHighwayPassTravelFees = filterRecordsByReset(
    localData.highwayPassTravelFees,
    latestReset,
  );
  const filteredRemoteHighwayPassTravelFees = filterRecordsByReset(
    remoteData.highwayPassTravelFees,
    latestReset,
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
