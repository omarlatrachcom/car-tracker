import { useEffect, useMemo, useState } from "react";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { CollapsibleCard } from "./src/components/CollapsibleCard";
import { LocationInput, OptionButton } from "./src/components/FormControls";
import { SyncCard } from "./src/components/SyncCard";
import {
  DRIVE_SYNC_FILE_NAME,
  ENGINE_OIL_OVERDUE_MESSAGE,
  GOOGLE_WEB_CLIENT_ID,
} from "./src/constants";
import {
  createEmptyAppData,
  createId,
  mergeAppData,
  normalizeAppData,
} from "./src/data/appData";
import {
  configureGoogleSignIn,
  downloadDriveSyncFile,
  findDriveSyncFile,
  getDriveAccessToken,
  getPreviousGoogleDriveUser,
  signInToGoogleDrive,
  signOutFromGoogleDrive,
  statusCodes,
  uploadDriveSyncFile,
} from "./src/services/googleDrive";
import { styles } from "./src/styles";
import { loadLocalAppData, saveLocalAppData } from "./src/storage/appStorage";
import type {
  ActiveForm,
  AppData,
  Car,
  CarInsuranceRecord,
  CarWash,
  DistanceUnit,
  Entry,
  EntryType,
  FuelStateMode,
  FuelVolumeUnit,
  GoogleDriveUser,
  HighwayPass,
  HighwayPassRefill,
  HighwayPassTravelFee,
  LocationPlace,
  LocationLookupTarget,
  OtherExpense,
  RefuelIntervalMetric,
  RefuelResolution,
  VehicleInspectionRecord,
} from "./src/types";
import {
  calculateTankStateAfterRefuel,
  computeRefuelMetrics,
  getTankStatePlaceholder,
  getTankStateUnitLabel,
  getTankStateValidationError,
  resolveRefuelValues,
} from "./src/utils/fuel";
import {
  formatConsumptionValue,
  formatDateTime,
  formatDistanceUnitLabel,
  formatDistanceValue,
  formatEntryType,
  formatFuelStateModeLabel,
  formatFuelVolumeUnitFullLabel,
  formatFuelVolumeUnitShortLabel,
  formatNullableDateTime,
  formatNullableDistanceValue,
  formatTankState,
} from "./src/utils/formatters";
import { formatGeocodedLocation } from "./src/utils/location";
import {
  isNonNegativeNumber,
  isPositiveNumber,
  parseDecimal,
  roundTo2,
  roundTo4,
} from "./src/utils/numbers";
import { getErrorMessage, isRecord } from "./src/utils/object";

type HighwayPassForm = "none" | "add_pass" | "refill" | "travel_fee";
type ReportStep = "home" | "period" | "date" | "summary";
type ReportPeriod = "monthly" | "yearly";
type ExpenseSection =
  | "fuel"
  | "highway_pass"
  | "car_wash"
  | "car_insurance"
  | "vehicle_inspection"
  | "other";
type WarningSeverity = "caution" | "danger";
type DueDateStatus = "none" | "upcoming" | "due";
type LocationTarget = NonNullable<LocationLookupTarget>;

const ENGINE_OIL_UPCOMING_THRESHOLD_KM = 100;
const KM_TO_MILES = 0.621371;
const LOCATION_NAME_TOLERANCE_METERS = 250;

type GpsLocation = {
  latitude: number;
  longitude: number;
  inferredName: string;
};

type LocationDraft = GpsLocation & {
  locationId: string | null;
};

type LocationDrafts = Record<LocationTarget, LocationDraft | null>;

type ResolvedLocation = {
  name: string | null;
  locationId: string | null;
  locations: LocationPlace[];
};

const EMPTY_LOCATION_DRAFTS: LocationDrafts = {
  reading: null,
  refuel: null,
  car_wash: null,
  highway_pass_travel_fee: null,
};

type ExpenseEvent = {
  id: string;
  section: ExpenseSection;
  item: string | null;
  amount: number;
  createdAt: string;
  monthKey: string;
  yearKey: string;
  dayKey: string;
};

type DistanceEvent = {
  id: string;
  distance: number;
  createdAt: string;
  monthKey: string;
  yearKey: string;
  dayKey: string;
};

type FuelEvent = {
  id: string;
  volumeFilled: number;
  moneyPaid: number | null;
  createdAt: string;
  monthKey: string;
  yearKey: string;
  dayKey: string;
};

type ReportAmountRow = {
  key: string;
  label: string;
  amount: number;
};

type ReportDistanceRow = {
  key: string;
  label: string;
  distance: number;
};

const EXPENSE_SECTION_LABELS: Record<ExpenseSection, string> = {
  fuel: "Fuel",
  highway_pass: "Highway Pass",
  car_wash: "Car Wash",
  car_insurance: "Car Insurance",
  vehicle_inspection: "Vehicle Inspection",
  other: "Other Expenses",
};

const EXPENSE_SECTION_ORDER: ExpenseSection[] = [
  "fuel",
  "highway_pass",
  "car_wash",
  "car_insurance",
  "vehicle_inspection",
  "other",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SHORT_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function App() {
  const [appData, setAppData] = useState<AppData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [locationLookupTarget, setLocationLookupTarget] =
    useState<LocationLookupTarget>(null);
  const [locationDrafts, setLocationDrafts] = useState<LocationDrafts>(
    EMPTY_LOCATION_DRAFTS,
  );
  const [driveUser, setDriveUser] = useState<GoogleDriveUser | null>(null);
  const [globalWarningMessage, setGlobalWarningMessage] = useState<
    string | null
  >(null);
  const [globalWarningSeverity, setGlobalWarningSeverity] =
    useState<WarningSeverity | null>(null);
  const [reportStep, setReportStep] = useState<ReportStep>("home");
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod | null>(null);
  const [selectedReportPeriodKey, setSelectedReportPeriodKey] = useState<
    string | null
  >(null);
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const [isCreatingCar, setIsCreatingCar] = useState(false);

  const [name, setName] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>("km");
  const [currency, setCurrency] = useState("");
  const [fuelVolumeUnit, setFuelVolumeUnit] =
    useState<FuelVolumeUnit>("liters");
  const [tankCapacity, setTankCapacity] = useState("");
  const [fuelStateMode, setFuelStateMode] = useState<FuelStateMode>("percent");

  const [activeForm, setActiveForm] = useState<ActiveForm>("none");

  const [readingOdometer, setReadingOdometer] = useState("");
  const [readingTankState, setReadingTankState] = useState("");
  const [readingLocation, setReadingLocation] = useState("");

  const [refuelOdometer, setRefuelOdometer] = useState("");
  const [refuelAmountAdded, setRefuelAmountAdded] = useState("");
  const [refuelPricePerUnit, setRefuelPricePerUnit] = useState("");
  const [refuelMoneyPaid, setRefuelMoneyPaid] = useState("");
  const [refuelLocation, setRefuelLocation] = useState("");
  const [newHighwayPassNumber, setNewHighwayPassNumber] = useState("");
  const [selectedHighwayPassId, setSelectedHighwayPassId] = useState<
    string | null
  >(null);
  const [activeHighwayPassForm, setActiveHighwayPassForm] =
    useState<HighwayPassForm>("none");
  const [highwayPassRefillAmount, setHighwayPassRefillAmount] = useState("");
  const [highwayPassTravelFeeAmount, setHighwayPassTravelFeeAmount] =
    useState("");
  const [highwayPassTravelFeeLocation, setHighwayPassTravelFeeLocation] =
    useState("");
  const [carWashPrice, setCarWashPrice] = useState("");
  const [carWashLocation, setCarWashLocation] = useState("");
  const [carInsuranceDueDate, setCarInsuranceDueDate] = useState("");
  const [carInsurancePrice, setCarInsurancePrice] = useState("");
  const [vehicleInspectionDueDate, setVehicleInspectionDueDate] = useState("");
  const [vehicleInspectionCost, setVehicleInspectionCost] = useState("");
  const [otherExpenseItem, setOtherExpenseItem] = useState("");
  const [isOtherExpenseItemFocused, setIsOtherExpenseItemFocused] =
    useState(false);
  const [otherExpenseCost, setOtherExpenseCost] = useState("");
  const [engineOilNextDueOdometerInput, setEngineOilNextDueOdometerInput] =
    useState("");

  useEffect(() => {
    configureGoogleSignIn();
    void bootstrapApp();
  }, []);

  async function bootstrapApp() {
    await loadAppData();
    await restoreGoogleSessionIfPossible();
  }

  async function loadAppData() {
    try {
      setIsLoading(true);

      setAppData(await loadLocalAppData());
    } catch (error) {
      console.error("Failed to load app data:", error);
      Alert.alert(
        "Load error",
        "Could not read saved app data. Starting with empty local data.",
      );
      setAppData(createEmptyAppData());
    } finally {
      setIsLoading(false);
    }
  }

  async function persistLocalOnly(nextData: AppData) {
    const normalized = await saveLocalAppData(nextData);
    setAppData(normalized);
    return normalized;
  }

  async function saveAppData(
    nextData: AppData,
    options?: { syncToDriveIfConnected?: boolean },
  ) {
    try {
      setIsSaving(true);

      const normalized = normalizeAppData(nextData);
      const locallySaved = await persistLocalOnly({
        ...normalized,
        sync: {
          ...normalized.sync,
          lastSyncSource: "local",
        },
      });

      if (options?.syncToDriveIfConnected === false || !driveUser) {
        return locallySaved;
      }

      return await syncToDrive(locallySaved);
    } catch (error) {
      console.error("Failed to save app data:", error);
      Alert.alert("Save error", "Could not save your data locally.");
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function restoreGoogleSessionIfPossible() {
    try {
      const extractedUser = await getPreviousGoogleDriveUser();
      if (extractedUser) {
        setDriveUser(extractedUser);
      }
    } catch (error) {
      console.log("No previous Google session restored.", error);
    }
  }

  async function handleConnectGoogleDrive() {
    try {
      if (!GOOGLE_WEB_CLIENT_ID) {
        Alert.alert(
          "Google setup missing",
          "Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env.local, restart Expo, then try again.",
        );
        return;
      }

      const extractedUser = await signInToGoogleDrive();

      if (!extractedUser) {
        Alert.alert(
          "Google sign-in error",
          "Could not read Google account info.",
        );
        return;
      }

      setDriveUser(extractedUser);

      if (appData) {
        await downloadMergeAndResync(appData, true);
      }
    } catch (error: unknown) {
      console.error("Google Drive connect failed:", error);

      const errorCode =
        isRecord(error) && typeof error.code === "string" ? error.code : null;
      const errorMessage =
        isRecord(error) && typeof error.message === "string"
          ? error.message
          : "";

      if (errorCode === statusCodes.IN_PROGRESS) {
        Alert.alert(
          "Google sign-in",
          "A Google sign-in flow is already running.",
        );
        return;
      }

      if (errorCode === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert(
          "Google Play Services",
          "Google Play Services is not available or needs an update on this device.",
        );
        return;
      }

      if (
        errorCode === "SIGN_IN_CANCELLED" ||
        errorCode === "12501" ||
        errorMessage.toLowerCase().includes("cancel")
      ) {
        return;
      }

      Alert.alert("Google Drive error", getErrorMessage(error));
    }
  }

  async function handleDisconnectGoogleDrive() {
    try {
      await signOutFromGoogleDrive();
      setDriveUser(null);
    } catch (error) {
      console.error("Google sign-out failed:", error);
      Alert.alert(
        "Google Drive error",
        "Could not sign out from Google Drive.",
      );
    }
  }

  async function syncToDrive(baseData: AppData) {
    try {
      setIsDriveSyncing(true);

      const accessToken = await getDriveAccessToken();
      const existingFile =
        (baseData.sync.lastDriveFileId
          ? { id: baseData.sync.lastDriveFileId, name: DRIVE_SYNC_FILE_NAME }
          : await findDriveSyncFile(accessToken)) ?? null;

      const uploadResult = await uploadDriveSyncFile(
        accessToken,
        baseData,
        existingFile?.id ?? null,
      );

      const syncedAt = new Date().toISOString();

      const syncedData = normalizeAppData({
        ...baseData,
        sync: {
          ...baseData.sync,
          lastDriveSyncAt: syncedAt,
          lastDriveFileId: uploadResult.id,
          lastSyncError: null,
          lastSyncSource: "drive",
        },
      });

      await persistLocalOnly(syncedData);
      return syncedData;
    } catch (error) {
      console.error("Drive sync failed:", error);

      const failedData = normalizeAppData({
        ...baseData,
        sync: {
          ...baseData.sync,
          lastSyncError: getErrorMessage(error),
          lastSyncSource: "local",
        },
      });

      await persistLocalOnly(failedData);
      Alert.alert(
        "Google Drive sync error",
        "Local save worked, but Google Drive sync failed.",
      );
      return failedData;
    } finally {
      setIsDriveSyncing(false);
    }
  }

  async function downloadMergeAndResync(
    localData: AppData,
    createRemoteIfMissing: boolean,
  ) {
    try {
      setIsDriveSyncing(true);

      const accessToken = await getDriveAccessToken();
      const driveFile = await findDriveSyncFile(accessToken);

      if (!driveFile) {
        if (!createRemoteIfMissing) {
          return localData;
        }

        const uploadResult = await uploadDriveSyncFile(
          accessToken,
          localData,
          null,
        );

        const createdRemoteData = normalizeAppData({
          ...localData,
          sync: {
            ...localData.sync,
            lastDriveFileId: uploadResult.id,
            lastDriveSyncAt: new Date().toISOString(),
            lastSyncError: null,
            lastSyncSource: "drive",
          },
        });

        await persistLocalOnly(createdRemoteData);
        return createdRemoteData;
      }

      const remoteData = await downloadDriveSyncFile(accessToken, driveFile.id);
      const mergedData = mergeAppData(localData, remoteData);

      const uploaded = await uploadDriveSyncFile(
        accessToken,
        mergedData,
        driveFile.id,
      );

      const finalData = normalizeAppData({
        ...mergedData,
        sync: {
          ...mergedData.sync,
          lastDriveFileId: uploaded.id,
          lastDriveSyncAt: new Date().toISOString(),
          lastSyncError: null,
          lastSyncSource: "drive",
        },
      });

      await persistLocalOnly(finalData);
      return finalData;
    } catch (error) {
      console.error("Drive download/merge failed:", error);

      const failedData = normalizeAppData({
        ...localData,
        sync: {
          ...localData.sync,
          lastSyncError: getErrorMessage(error),
          lastSyncSource: "local",
        },
      });

      await persistLocalOnly(failedData);

      Alert.alert(
        "Google Drive sync error",
        "Could not download and merge Google Drive data.",
      );

      return failedData;
    } finally {
      setIsDriveSyncing(false);
    }
  }

  async function handleSyncNow() {
    if (!appData) return;

    if (!driveUser) {
      Alert.alert("Google Drive not connected", "Connect Google Drive first.");
      return;
    }

    await downloadMergeAndResync(appData, true);
  }

  const availableCars = useMemo(() => {
    if (!appData) return [] as Car[];
    return [...appData.cars].sort((a, b) => a.name.localeCompare(b.name));
  }, [appData]);

  const existingCar = useMemo(() => {
    if (!appData || !selectedCarId) return null;
    return appData.cars.find((car) => car.id === selectedCarId) ?? null;
  }, [appData, selectedCarId]);

  useEffect(() => {
    if (
      selectedCarId &&
      appData &&
      !appData.cars.some((car) => car.id === selectedCarId)
    ) {
      setSelectedCarId(null);
      setIsCreatingCar(false);
    }
  }, [appData, selectedCarId]);

  const carLocationPlaces = useMemo(() => {
    if (!appData || !existingCar) return [] as LocationPlace[];
    return appData.locations.filter(
      (location) => location.carId === existingCar.id,
    );
  }, [appData, existingCar]);

  const locationNameById = useMemo(() => {
    const locationNames = new Map<string, string>();

    for (const location of carLocationPlaces) {
      locationNames.set(location.id, location.name);
    }

    return locationNames;
  }, [carLocationPlaces]);

  function getSavedLocationName(
    locationId: string | null | undefined,
    fallback: string | null,
  ) {
    if (!locationId) return fallback;
    return locationNameById.get(locationId) ?? fallback;
  }

  const carEntries = useMemo(() => {
    if (!appData || !existingCar) return [];
    return appData.entries
      .filter((entry) => entry.carId === existingCar.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [appData, existingCar]);

  const latestEntry = carEntries[0] ?? null;
  const currentOdometer = latestEntry?.odometer ?? null;

  const carWashes = useMemo(() => {
    if (!appData || !existingCar) return [] as CarWash[];
    return appData.carWashes
      .filter((carWash) => carWash.carId === existingCar.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [appData, existingCar]);

  const latestCarWash = carWashes[0] ?? null;
  const totalCarWashSpend = useMemo(
    () => roundTo2(carWashes.reduce((sum, carWash) => sum + carWash.price, 0)),
    [carWashes],
  );

  const carInsuranceRecords = useMemo(() => {
    if (!appData || !existingCar) return [] as CarInsuranceRecord[];
    return appData.carInsuranceRecords
      .filter((record) => record.carId === existingCar.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [appData, existingCar]);

  const latestCarInsurance = carInsuranceRecords[0] ?? null;
  const totalCarInsuranceSpend = useMemo(
    () =>
      roundTo2(
        carInsuranceRecords.reduce((sum, record) => sum + record.price, 0),
      ),
    [carInsuranceRecords],
  );

  const vehicleInspectionRecords = useMemo(() => {
    if (!appData || !existingCar) return [] as VehicleInspectionRecord[];
    return appData.vehicleInspectionRecords
      .filter((record) => record.carId === existingCar.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [appData, existingCar]);

  const latestVehicleInspection = vehicleInspectionRecords[0] ?? null;
  const totalVehicleInspectionSpend = useMemo(
    () =>
      roundTo2(
        vehicleInspectionRecords.reduce(
          (sum, record) => sum + record.cost,
          0,
        ),
      ),
    [vehicleInspectionRecords],
  );

  const otherExpenses = useMemo(() => {
    if (!appData || !existingCar) return [] as OtherExpense[];
    return appData.otherExpenses
      .filter((expense) => expense.carId === existingCar.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [appData, existingCar]);

  const latestOtherExpense = otherExpenses[0] ?? null;
  const totalOtherExpenseSpend = useMemo(
    () =>
      roundTo2(otherExpenses.reduce((sum, expense) => sum + expense.cost, 0)),
    [otherExpenses],
  );
  const otherExpenseItemOptions = useMemo(
    () => buildOtherExpenseItemOptions(otherExpenses),
    [otherExpenses],
  );
  const filteredOtherExpenseItemOptions = useMemo(
    () =>
      filterOtherExpenseItemOptions(
        otherExpenseItemOptions,
        otherExpenseItem,
      ),
    [otherExpenseItem, otherExpenseItemOptions],
  );

  const highwayPasses = useMemo(() => {
    if (!appData || !existingCar) return [] as HighwayPass[];
    return appData.highwayPasses
      .filter((pass) => pass.carId === existingCar.id)
      .sort((a, b) => a.passNumber.localeCompare(b.passNumber));
  }, [appData, existingCar]);

  const selectedHighwayPass = useMemo(() => {
    if (highwayPasses.length === 0) return null;
    return (
      highwayPasses.find((pass) => pass.id === selectedHighwayPassId) ??
      highwayPasses[0]
    );
  }, [highwayPasses, selectedHighwayPassId]);

  useEffect(() => {
    if (highwayPasses.length === 0) {
      setSelectedHighwayPassId(null);
      return;
    }

    if (highwayPasses.some((pass) => pass.id === selectedHighwayPassId)) {
      return;
    }

    setSelectedHighwayPassId(highwayPasses[0].id);
  }, [highwayPasses, selectedHighwayPassId]);

  const highwayPassRefills = useMemo(() => {
    if (!appData || !existingCar) return [] as HighwayPassRefill[];
    return appData.highwayPassRefills
      .filter((refill) => refill.carId === existingCar.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [appData, existingCar]);

  const highwayPassTravelFees = useMemo(() => {
    if (!appData || !existingCar) return [] as HighwayPassTravelFee[];
    return appData.highwayPassTravelFees
      .filter((fee) => fee.carId === existingCar.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [appData, existingCar]);

  function getHighwayPassBalance(passId: string) {
    const totalRefilled = highwayPassRefills
      .filter((refill) => refill.highwayPassId === passId)
      .reduce((sum, refill) => sum + refill.amount, 0);
    const totalDeducted = highwayPassTravelFees
      .filter((fee) => fee.highwayPassId === passId)
      .reduce((sum, fee) => sum + fee.amount, 0);

    return roundTo2(totalRefilled - totalDeducted);
  }

  const selectedHighwayPassRefills = useMemo(() => {
    if (!selectedHighwayPass) return [] as HighwayPassRefill[];
    return highwayPassRefills.filter(
      (refill) => refill.highwayPassId === selectedHighwayPass.id,
    );
  }, [highwayPassRefills, selectedHighwayPass]);

  const latestHighwayPassRefill = selectedHighwayPassRefills[0] ?? null;
  const totalHighwayPassRefillSpend = useMemo(
    () =>
      roundTo2(
        selectedHighwayPassRefills.reduce(
          (sum, refill) => sum + refill.amount,
          0,
        ),
      ),
    [selectedHighwayPassRefills],
  );

  const selectedHighwayPassTravelFees = useMemo(() => {
    if (!selectedHighwayPass) return [] as HighwayPassTravelFee[];
    return highwayPassTravelFees.filter(
      (fee) => fee.highwayPassId === selectedHighwayPass.id,
    );
  }, [highwayPassTravelFees, selectedHighwayPass]);

  const latestHighwayPassTravelFee = selectedHighwayPassTravelFees[0] ?? null;
  const totalHighwayPassTravelFeeSpend = useMemo(
    () =>
      roundTo2(
        selectedHighwayPassTravelFees.reduce((sum, fee) => sum + fee.amount, 0),
      ),
    [selectedHighwayPassTravelFees],
  );

  const highwayPassBalance = useMemo(
    () =>
      roundTo2(totalHighwayPassRefillSpend - totalHighwayPassTravelFeeSpend),
    [totalHighwayPassRefillSpend, totalHighwayPassTravelFeeSpend],
  );

  const selectedHighwayPassHistory = useMemo(() => {
    const refillHistory = selectedHighwayPassRefills.map((refill) => ({
      id: refill.id,
      type: "refill" as const,
      amount: refill.amount,
      createdAt: refill.createdAt,
    }));
    const travelFeeHistory = selectedHighwayPassTravelFees.map((fee) => ({
      id: fee.id,
      type: "travel_fee" as const,
      amount: fee.amount,
      location: getSavedLocationName(fee.locationId, fee.location),
      createdAt: fee.createdAt,
    }));

    return [...refillHistory, ...travelFeeHistory].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }, [
    locationNameById,
    selectedHighwayPassRefills,
    selectedHighwayPassTravelFees,
  ]);

  const reportExpenseEvents = useMemo(
    () =>
      buildExpenseEvents({
        entries: carEntries,
        carWashes,
        carInsuranceRecords,
        vehicleInspectionRecords,
        highwayPassRefills,
        otherExpenses,
      }),
    [
      carEntries,
      carWashes,
      carInsuranceRecords,
      vehicleInspectionRecords,
      highwayPassRefills,
      otherExpenses,
    ],
  );

  const reportDistanceEvents = useMemo(
    () => buildDistanceEvents(carEntries),
    [carEntries],
  );

  const reportFuelEvents = useMemo(
    () => buildFuelEvents(carEntries),
    [carEntries],
  );

  const reportDateOptions = useMemo(() => {
    if (!reportPeriod) return [] as ReportAmountRow[];
    return getReportDateOptions(
      reportExpenseEvents,
      reportDistanceEvents,
      reportFuelEvents,
      reportPeriod,
    );
  }, [
    reportExpenseEvents,
    reportDistanceEvents,
    reportFuelEvents,
    reportPeriod,
  ]);

  const reportSummary = useMemo(() => {
    if (!reportPeriod || !selectedReportPeriodKey) return null;
    return buildReportSummary(
      reportExpenseEvents,
      reportDistanceEvents,
      reportFuelEvents,
      reportPeriod,
      selectedReportPeriodKey,
    );
  }, [
    reportExpenseEvents,
    reportDistanceEvents,
    reportFuelEvents,
    reportPeriod,
    selectedReportPeriodKey,
  ]);

  const isEngineOilChangeOverdue = useMemo(() => {
    if (
      !existingCar ||
      currentOdometer === null ||
      existingCar.engineOilNextDueOdometer === null
    ) {
      return false;
    }

    return currentOdometer >= existingCar.engineOilNextDueOdometer;
  }, [currentOdometer, existingCar?.engineOilNextDueOdometer]);

  const engineOilUpcomingThreshold = useMemo(() => {
    if (!existingCar) return ENGINE_OIL_UPCOMING_THRESHOLD_KM;
    return getEngineOilUpcomingThreshold(existingCar.distanceUnit);
  }, [existingCar?.distanceUnit]);

  const isEngineOilChangeDueSoon = useMemo(() => {
    if (
      !existingCar ||
      currentOdometer === null ||
      existingCar.engineOilNextDueOdometer === null ||
      isEngineOilChangeOverdue
    ) {
      return false;
    }

    const distanceUntilDue =
      existingCar.engineOilNextDueOdometer - currentOdometer;

    return distanceUntilDue <= engineOilUpcomingThreshold;
  }, [
    currentOdometer,
    engineOilUpcomingThreshold,
    existingCar?.engineOilNextDueOdometer,
    isEngineOilChangeOverdue,
  ]);

  const carInsuranceDueStatus = useMemo(
    () => getDueDateStatus(latestCarInsurance?.nextDueDate ?? null),
    [latestCarInsurance?.nextDueDate],
  );

  const vehicleInspectionDueStatus = useMemo(
    () => getDueDateStatus(latestVehicleInspection?.nextDueDate ?? null),
    [latestVehicleInspection?.nextDueDate],
  );

  useEffect(() => {
    const messages: string[] = [];
    let severity: WarningSeverity | null = null;

    if (isEngineOilChangeOverdue) {
      messages.push(ENGINE_OIL_OVERDUE_MESSAGE);
      severity = "danger";
    } else if (isEngineOilChangeDueSoon && existingCar) {
      messages.push(getEngineOilDueSoonMessage(existingCar.distanceUnit));
      severity = "caution";
    }

    const insuranceWarning = getDueDateWarningMessage(
      "Car insurance",
      latestCarInsurance?.nextDueDate ?? null,
      carInsuranceDueStatus,
    );
    if (insuranceWarning) {
      messages.push(insuranceWarning);
      severity =
        carInsuranceDueStatus === "due" || severity === "danger"
          ? "danger"
          : "caution";
    }

    const inspectionWarning = getDueDateWarningMessage(
      "Vehicle inspection",
      latestVehicleInspection?.nextDueDate ?? null,
      vehicleInspectionDueStatus,
    );
    if (inspectionWarning) {
      messages.push(inspectionWarning);
      severity =
        vehicleInspectionDueStatus === "due" || severity === "danger"
          ? "danger"
          : "caution";
    }

    setGlobalWarningMessage(messages.length > 0 ? messages.join("\n") : null);
    setGlobalWarningSeverity(severity);
  }, [
    carInsuranceDueStatus,
    existingCar?.distanceUnit,
    isEngineOilChangeOverdue,
    isEngineOilChangeDueSoon,
    latestCarInsurance?.nextDueDate,
    latestVehicleInspection?.nextDueDate,
    vehicleInspectionDueStatus,
  ]);

  useEffect(() => {
    if (!existingCar || existingCar.engineOilNextDueOdometer === null) {
      setEngineOilNextDueOdometerInput("");
      return;
    }

    setEngineOilNextDueOdometerInput(
      String(existingCar.engineOilNextDueOdometer),
    );
  }, [existingCar?.id, existingCar?.engineOilNextDueOdometer]);

  useEffect(() => {
    if (!existingCar || !latestCarInsurance) {
      setCarInsuranceDueDate("");
      setCarInsurancePrice("");
      return;
    }

    setCarInsuranceDueDate(latestCarInsurance.nextDueDate);
    setCarInsurancePrice(String(latestCarInsurance.price));
  }, [existingCar?.id, latestCarInsurance?.id]);

  useEffect(() => {
    if (!existingCar || !latestVehicleInspection) {
      setVehicleInspectionDueDate("");
      setVehicleInspectionCost("");
      return;
    }

    setVehicleInspectionDueDate(latestVehicleInspection.nextDueDate);
    setVehicleInspectionCost(String(latestVehicleInspection.cost));
  }, [existingCar?.id, latestVehicleInspection?.id]);

  const readingDistancePreview = useMemo(() => {
    const odometer = parseDecimal(readingOdometer);
    if (!latestEntry || !isNonNegativeNumber(odometer)) return null;
    if (odometer < latestEntry.odometer) return null;
    return roundTo2(odometer - latestEntry.odometer);
  }, [readingOdometer, latestEntry]);

  const refuelResolution = useMemo<RefuelResolution>(() => {
    return resolveRefuelValues(
      parseDecimal(refuelAmountAdded),
      parseDecimal(refuelPricePerUnit),
      parseDecimal(refuelMoneyPaid),
    );
  }, [refuelAmountAdded, refuelPricePerUnit, refuelMoneyPaid]);

  const refuelDistancePreview = useMemo(() => {
    const odometer = parseDecimal(refuelOdometer);
    if (!latestEntry || !isNonNegativeNumber(odometer)) return null;
    if (odometer < latestEntry.odometer) return null;
    return roundTo2(odometer - latestEntry.odometer);
  }, [refuelOdometer, latestEntry]);

  const calculatedRefuelTankState = useMemo(() => {
    if (!existingCar || !latestEntry) return null;
    const amount = refuelResolution.amountAdded;
    if (amount === null || !isPositiveNumber(amount)) return null;

    return calculateTankStateAfterRefuel(
      latestEntry.tankState,
      amount,
      existingCar,
    );
  }, [existingCar, latestEntry, refuelResolution]);

  const refuelMetricsByEntryId = useMemo(() => {
    if (!existingCar) return {} as Record<string, RefuelIntervalMetric>;
    return computeRefuelMetrics(carEntries, existingCar);
  }, [carEntries, existingCar]);

  const latestCompletedRefuelMetric = useMemo(() => {
    for (const entry of carEntries) {
      if (entry.type !== "refuel") continue;
      const metric = refuelMetricsByEntryId[entry.id];
      if (metric) return metric;
    }
    return null;
  }, [carEntries, refuelMetricsByEntryId]);

  const averageConsumptionMetric = useMemo(() => {
    const metrics = Object.values(refuelMetricsByEntryId);
    if (metrics.length === 0) return null;

    const totalDistance = roundTo2(
      metrics.reduce(
        (sum, metric) => sum + metric.distanceSincePreviousRefuel,
        0,
      ),
    );
    const totalFuelUsed = roundTo2(
      metrics.reduce((sum, metric) => sum + metric.fuelUsed, 0),
    );

    if (totalDistance <= 0) {
      return {
        totalDistance,
        totalFuelUsed,
        consumptionPer100Distance: null,
      };
    }

    return {
      totalDistance,
      totalFuelUsed,
      consumptionPer100Distance: roundTo2(
        (totalFuelUsed / totalDistance) * 100,
      ),
    };
  }, [refuelMetricsByEntryId]);

  async function handleCreateCar() {
    if (!appData) return;

    const trimmedName = name.trim();
    const trimmedFuelType = fuelType.trim();
    const trimmedCurrency = currency.trim();
    const parsedTankCapacity = parseDecimal(tankCapacity);

    if (!trimmedName) {
      Alert.alert("Validation error", "Please enter a car name.");
      return;
    }

    if (!trimmedFuelType) {
      Alert.alert("Validation error", "Please enter the fuel type.");
      return;
    }

    if (!trimmedCurrency) {
      Alert.alert("Validation error", "Please enter a currency.");
      return;
    }

    if (!isPositiveNumber(parsedTankCapacity)) {
      Alert.alert("Validation error", "Please enter a valid tank capacity.");
      return;
    }

    const now = new Date().toISOString();

    const newCar: Car = {
      id: createId("car"),
      name: trimmedName,
      fuelType: trimmedFuelType,
      distanceUnit,
      currency: trimmedCurrency,
      fuelVolumeUnit,
      tankCapacity: parsedTankCapacity,
      fuelStateMode,
      engineOilNextDueOdometer: null,
      engineOilReminderUpdatedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const nextData = normalizeAppData({
      ...appData,
      updatedAt: now,
      cars: [newCar, ...appData.cars],
    });

    await saveAppData(nextData);

    setSelectedCarId(newCar.id);
    setIsCreatingCar(false);
    setName("");
    setFuelType("");
    setDistanceUnit("km");
    setCurrency("");
    setFuelVolumeUnit("liters");
    setTankCapacity("");
    setFuelStateMode("percent");
    setNewHighwayPassNumber("");
    setSelectedHighwayPassId(null);
    setActiveHighwayPassForm("none");
    setHighwayPassRefillAmount("");
    setHighwayPassTravelFeeAmount("");
    setHighwayPassTravelFeeLocation("");
    setCarWashPrice("");
    setCarWashLocation("");
    setCarInsuranceDueDate("");
    setCarInsurancePrice("");
    setVehicleInspectionDueDate("");
    setVehicleInspectionCost("");
    setOtherExpenseItem("");
    setIsOtherExpenseItemFocused(false);
    setOtherExpenseCost("");
    setEngineOilNextDueOdometerInput("");
  }

  function openReadingForm() {
    setActiveForm("reading");
    setReadingOdometer(latestEntry ? String(latestEntry.odometer) : "");
    setReadingTankState(latestEntry ? String(latestEntry.tankState) : "");
    setReadingLocation("");
    clearLocationDraft("reading");
  }

  function openRefuelForm() {
    if (!latestEntry || !existingCar) {
      Alert.alert(
        "Refuel unavailable",
        "Add a first reading before saving a refuel, so the app knows the current tank state.",
      );
      return;
    }

    setActiveForm("refuel");
    setRefuelOdometer(String(latestEntry.odometer));
    setRefuelAmountAdded("");
    setRefuelPricePerUnit("");
    setRefuelMoneyPaid("");
    setRefuelLocation("");
    setHighwayPassTravelFeeLocation("");
    clearLocationDraft("refuel");
  }

  function closeForms() {
    setActiveForm("none");
    setReadingOdometer("");
    setReadingTankState("");
    setReadingLocation("");
    setRefuelOdometer("");
    setRefuelAmountAdded("");
    setRefuelPricePerUnit("");
    setRefuelMoneyPaid("");
    setRefuelLocation("");
    setLocationDrafts(EMPTY_LOCATION_DRAFTS);
  }

  function openHighwayPassForm(form: Exclude<HighwayPassForm, "none">) {
    if (form === "add_pass") {
      setNewHighwayPassNumber("");
    } else if (form === "refill") {
      setHighwayPassRefillAmount("");
    } else {
      setHighwayPassTravelFeeAmount("");
      setHighwayPassTravelFeeLocation("");
      clearLocationDraft("highway_pass_travel_fee");
    }

    setActiveHighwayPassForm(form);
  }

  function closeHighwayPassForm() {
    setActiveHighwayPassForm("none");
    setNewHighwayPassNumber("");
    setHighwayPassRefillAmount("");
    setHighwayPassTravelFeeAmount("");
    setHighwayPassTravelFeeLocation("");
    clearLocationDraft("highway_pass_travel_fee");
  }

  function openCreateCarForm() {
    setName("");
    setFuelType("");
    setDistanceUnit("km");
    setCurrency("");
    setFuelVolumeUnit("liters");
    setTankCapacity("");
    setFuelStateMode("percent");
    setIsCreatingCar(true);
    setSelectedCarId(null);
    closeForms();
    closeHighwayPassForm();
  }

  function handleSelectCar(carId: string) {
    setSelectedCarId(carId);
    setIsCreatingCar(false);
    setReportStep("home");
    setReportPeriod(null);
    setSelectedReportPeriodKey(null);
    closeForms();
    closeHighwayPassForm();
  }

  function openCarPicker() {
    setSelectedCarId(null);
    setIsCreatingCar(false);
    setReportStep("home");
    setReportPeriod(null);
    setSelectedReportPeriodKey(null);
    closeForms();
    closeHighwayPassForm();
  }

  function openReportFlow() {
    setReportStep("period");
    setReportPeriod(null);
    setSelectedReportPeriodKey(null);
  }

  function handleReportBack() {
    if (reportStep === "summary") {
      setReportStep("date");
      return;
    }

    if (reportStep === "date") {
      setSelectedReportPeriodKey(null);
      setReportStep("period");
      return;
    }

    setReportStep("home");
    setReportPeriod(null);
    setSelectedReportPeriodKey(null);
  }

  function handleReportPeriodSelect(period: ReportPeriod) {
    setReportPeriod(period);
    setSelectedReportPeriodKey(null);
    setReportStep("date");
  }

  function handleReportDateSelect(periodKey: string) {
    setSelectedReportPeriodKey(periodKey);
    setReportStep("summary");
  }

  function setLocationDraftForTarget(
    target: LocationTarget,
    draft: LocationDraft | null,
  ) {
    setLocationDrafts((currentDrafts) => ({
      ...currentDrafts,
      [target]: draft,
    }));
  }

  function clearLocationDraft(target: LocationTarget) {
    setLocationDraftForTarget(target, null);
  }

  async function handleUseCurrentLocation(target: LocationTarget) {
    setLocationLookupTarget(target);

    try {
      const gpsLocation = await getCurrentLocation({ showAlerts: true });

      if (!gpsLocation) return;

      const matchingLocation = findMatchingLocation(
        gpsLocation,
        carLocationPlaces,
      );
      const locationText = matchingLocation?.name ?? gpsLocation.inferredName;
      setLocationDraftForTarget(target, {
        ...gpsLocation,
        locationId: matchingLocation?.id ?? null,
      });

      if (target === "reading") {
        setReadingLocation(locationText);
      } else if (target === "refuel") {
        setRefuelLocation(locationText);
      } else if (target === "highway_pass_travel_fee") {
        setHighwayPassTravelFeeLocation(locationText);
      } else {
        setCarWashLocation(locationText);
      }
    } finally {
      setLocationLookupTarget(null);
    }
  }

  async function resolveLocationForSave(
    target: LocationTarget,
    value: string,
  ): Promise<ResolvedLocation> {
    const trimmedLocation = value.trim();
    const existingLocations = appData?.locations ?? [];
    const draft = locationDrafts[target];

    if (draft && existingCar) {
      return resolveGpsLocationForSave(
        draft,
        trimmedLocation,
        existingLocations,
        existingCar.id,
      );
    }

    if (trimmedLocation) {
      return {
        name: trimmedLocation,
        locationId: null,
        locations: existingLocations,
      };
    }

    setLocationLookupTarget(target);

    try {
      const gpsLocation = await getCurrentLocation({ showAlerts: false });

      if (!gpsLocation || !existingCar) {
        return {
          name: null,
          locationId: null,
          locations: existingLocations,
        };
      }

      const matchingLocation = findMatchingLocation(
        gpsLocation,
        carLocationPlaces,
      );
      const gpsDraft: LocationDraft = {
        ...gpsLocation,
        locationId: matchingLocation?.id ?? null,
      };

      setLocationDraftForTarget(target, gpsDraft);

      return resolveGpsLocationForSave(
        gpsDraft,
        "",
        existingLocations,
        existingCar.id,
      );
    } finally {
      setLocationLookupTarget(null);
    }
  }

  async function getCurrentLocation(
    options: { showAlerts: boolean },
  ): Promise<GpsLocation | null> {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (!permission.granted) {
        if (options.showAlerts) {
          Alert.alert(
            "Location permission",
            "Allow location access to fill the place from this phone.",
          );
        }
        return null;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        if (options.showAlerts) {
          Alert.alert(
            "Location unavailable",
            "Turn on device location services and try again.",
          );
        }
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      let address: Location.LocationGeocodedAddress | null = null;

      try {
        [address] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch (error) {
        console.warn("Reverse geocoding failed:", error);
      }

      const inferredName =
        formatGeocodedLocation(address) ??
        `${roundTo4(position.coords.latitude)}, ${roundTo4(
          position.coords.longitude,
        )}`;

      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        inferredName,
      };
    } catch (error) {
      console.error("Location lookup failed:", error);

      if (options.showAlerts) {
        Alert.alert("Location error", getErrorMessage(error));
      }

      return null;
    }
  }

  async function handleSaveReading() {
    if (!appData || !existingCar) return;

    const odometer = parseDecimal(readingOdometer);
    const tankState = parseDecimal(readingTankState);

    if (!isNonNegativeNumber(odometer)) {
      Alert.alert("Validation error", "Please enter a valid odometer value.");
      return;
    }

    if (latestEntry && odometer < latestEntry.odometer) {
      Alert.alert(
        "Validation error",
        "Odometer cannot be lower than the current saved odometer.",
      );
      return;
    }

    const tankError = getTankStateValidationError(tankState, existingCar);
    if (tankError) {
      Alert.alert("Validation error", tankError);
      return;
    }

    const distanceSinceLastEntry = latestEntry
      ? roundTo2(odometer - latestEntry.odometer)
      : null;
    const resolvedLocation = await resolveLocationForSave(
      "reading",
      readingLocation,
    );

    const now = new Date().toISOString();

    const newEntry: Entry = {
      id: createId("entry"),
      carId: existingCar.id,
      type: "reading",
      odometer,
      distanceSinceLastEntry,
      tankState,
      amountAdded: null,
      pricePerUnit: null,
      moneyPaid: null,
      location: resolvedLocation.name,
      locationId: resolvedLocation.locationId,
      createdAt: now,
      updatedAt: now,
    };

    const nextData = normalizeAppData({
      ...appData,
      updatedAt: now,
      cars: appData.cars.map((car) =>
        car.id === existingCar.id ? { ...car, updatedAt: now } : car,
      ),
      locations: resolvedLocation.locations,
      entries: [newEntry, ...appData.entries],
    });

    await saveAppData(nextData);
    clearLocationDraft("reading");
    closeForms();
  }

  async function handleSaveRefuel() {
    if (!appData || !existingCar || !latestEntry) return;

    const odometer = parseDecimal(refuelOdometer);

    if (!isNonNegativeNumber(odometer)) {
      Alert.alert("Validation error", "Please enter a valid odometer value.");
      return;
    }

    if (odometer < latestEntry.odometer) {
      Alert.alert(
        "Validation error",
        "Odometer cannot be lower than the current saved odometer.",
      );
      return;
    }

    if (refuelResolution.providedCount < 2) {
      Alert.alert(
        "Validation error",
        "Enter any 2 of these 3 values: amount added, price per unit, money paid.",
      );
      return;
    }

    if (!isPositiveNumber(refuelResolution.amountAdded ?? NaN)) {
      Alert.alert(
        "Validation error",
        `Could not determine a valid added amount in ${formatFuelVolumeUnitShortLabel(
          existingCar.fuelVolumeUnit,
        )}.`,
      );
      return;
    }

    if (!isNonNegativeNumber(refuelResolution.moneyPaid ?? NaN)) {
      Alert.alert(
        "Validation error",
        `Could not determine a valid amount paid in ${existingCar.currency}.`,
      );
      return;
    }

    const amount = refuelResolution.amountAdded!;
    const nextTankState = calculateTankStateAfterRefuel(
      latestEntry.tankState,
      amount,
      existingCar,
    );

    const distanceSinceLastEntry = roundTo2(odometer - latestEntry.odometer);
    const resolvedLocation = await resolveLocationForSave(
      "refuel",
      refuelLocation,
    );

    const now = new Date().toISOString();

    const newEntry: Entry = {
      id: createId("entry"),
      carId: existingCar.id,
      type: "refuel",
      odometer,
      distanceSinceLastEntry,
      tankState: nextTankState,
      amountAdded: amount,
      pricePerUnit: refuelResolution.pricePerUnit,
      moneyPaid: refuelResolution.moneyPaid,
      location: resolvedLocation.name,
      locationId: resolvedLocation.locationId,
      createdAt: now,
      updatedAt: now,
    };

    const nextData = normalizeAppData({
      ...appData,
      updatedAt: now,
      cars: appData.cars.map((car) =>
        car.id === existingCar.id ? { ...car, updatedAt: now } : car,
      ),
      locations: resolvedLocation.locations,
      entries: [newEntry, ...appData.entries],
    });

    await saveAppData(nextData);
    clearLocationDraft("refuel");
    closeForms();
  }

  async function handleSaveEngineOilReminder() {
    if (!appData || !existingCar) return;

    const nextDueOdometer = parseDecimal(engineOilNextDueOdometerInput);

    if (!isNonNegativeNumber(nextDueOdometer)) {
      Alert.alert(
        "Validation error",
        "Please enter a valid next due odometer value.",
      );
      return;
    }

    const now = new Date().toISOString();

    const nextData = normalizeAppData({
      ...appData,
      updatedAt: now,
      cars: appData.cars.map((car) =>
        car.id === existingCar.id
          ? {
              ...car,
              engineOilNextDueOdometer: nextDueOdometer,
              engineOilReminderUpdatedAt: now,
              updatedAt: now,
            }
          : car,
      ),
    });

    await saveAppData(nextData);
  }

  async function handleSaveCarInsurance() {
    if (!appData || !existingCar) return;

    const nextDueDate = normalizeDateInput(carInsuranceDueDate);
    const price = parseDecimal(carInsurancePrice);

    if (!nextDueDate) {
      Alert.alert(
        "Validation error",
        "Please enter a valid car insurance due date as YYYY-MM-DD.",
      );
      return;
    }

    if (!isNonNegativeNumber(price)) {
      Alert.alert(
        "Validation error",
        "Please enter a valid car insurance price.",
      );
      return;
    }

    const now = new Date().toISOString();
    const newRecord: CarInsuranceRecord = {
      id: createId("car_insurance"),
      carId: existingCar.id,
      nextDueDate,
      price,
      createdAt: now,
      updatedAt: now,
    };

    const nextData = normalizeAppData({
      ...appData,
      updatedAt: now,
      cars: appData.cars.map((car) =>
        car.id === existingCar.id ? { ...car, updatedAt: now } : car,
      ),
      carInsuranceRecords: [newRecord, ...appData.carInsuranceRecords],
    });

    await saveAppData(nextData);
    setCarInsuranceDueDate(nextDueDate);
    setCarInsurancePrice(String(price));
  }

  async function handleSaveVehicleInspection() {
    if (!appData || !existingCar) return;

    const nextDueDate = normalizeDateInput(vehicleInspectionDueDate);
    const cost = parseDecimal(vehicleInspectionCost);

    if (!nextDueDate) {
      Alert.alert(
        "Validation error",
        "Please enter a valid vehicle inspection due date as YYYY-MM-DD.",
      );
      return;
    }

    if (!isNonNegativeNumber(cost)) {
      Alert.alert(
        "Validation error",
        "Please enter a valid vehicle inspection cost.",
      );
      return;
    }

    const now = new Date().toISOString();
    const newRecord: VehicleInspectionRecord = {
      id: createId("vehicle_inspection"),
      carId: existingCar.id,
      nextDueDate,
      cost,
      createdAt: now,
      updatedAt: now,
    };

    const nextData = normalizeAppData({
      ...appData,
      updatedAt: now,
      cars: appData.cars.map((car) =>
        car.id === existingCar.id ? { ...car, updatedAt: now } : car,
      ),
      vehicleInspectionRecords: [
        newRecord,
        ...appData.vehicleInspectionRecords,
      ],
    });

    await saveAppData(nextData);
    setVehicleInspectionDueDate(nextDueDate);
    setVehicleInspectionCost(String(cost));
  }

  async function handleSaveCarWash() {
    if (!appData || !existingCar) return;

    const price = parseDecimal(carWashPrice);

    if (!isNonNegativeNumber(price)) {
      Alert.alert("Validation error", "Please enter a valid car wash price.");
      return;
    }

    const resolvedLocation = await resolveLocationForSave(
      "car_wash",
      carWashLocation,
    );
    const now = new Date().toISOString();

    const newCarWash: CarWash = {
      id: createId("car_wash"),
      carId: existingCar.id,
      price,
      location: resolvedLocation.name,
      locationId: resolvedLocation.locationId,
      createdAt: now,
      updatedAt: now,
    };

    const nextData = normalizeAppData({
      ...appData,
      updatedAt: now,
      cars: appData.cars.map((car) =>
        car.id === existingCar.id ? { ...car, updatedAt: now } : car,
      ),
      locations: resolvedLocation.locations,
      carWashes: [newCarWash, ...appData.carWashes],
    });

    await saveAppData(nextData);
    setCarWashPrice("");
    setCarWashLocation("");
    clearLocationDraft("car_wash");
  }

  async function handleSaveOtherExpense() {
    if (!appData || !existingCar) return;

    const item = otherExpenseItem.trim();
    const cost = parseDecimal(otherExpenseCost);

    if (!item) {
      Alert.alert("Validation error", "Please enter the expense item.");
      return;
    }

    if (!isNonNegativeNumber(cost)) {
      Alert.alert("Validation error", "Please enter a valid expense cost.");
      return;
    }

    const now = new Date().toISOString();

    const newExpense: OtherExpense = {
      id: createId("other_expense"),
      carId: existingCar.id,
      item,
      cost,
      createdAt: now,
      updatedAt: now,
    };

    const nextData = normalizeAppData({
      ...appData,
      updatedAt: now,
      cars: appData.cars.map((car) =>
        car.id === existingCar.id ? { ...car, updatedAt: now } : car,
      ),
      otherExpenses: [newExpense, ...appData.otherExpenses],
    });

    await saveAppData(nextData);
    setOtherExpenseItem("");
    setIsOtherExpenseItemFocused(false);
    setOtherExpenseCost("");
  }

  async function handleAddHighwayPass() {
    if (!appData || !existingCar) return;

    const passNumber = newHighwayPassNumber.trim();

    if (!passNumber) {
      Alert.alert("Validation error", "Please enter the pass number.");
      return;
    }

    const existingPass = highwayPasses.find(
      (pass) => pass.passNumber.toLowerCase() === passNumber.toLowerCase(),
    );

    if (existingPass) {
      setSelectedHighwayPassId(existingPass.id);
      setNewHighwayPassNumber("");
      setActiveHighwayPassForm("none");
      return;
    }

    const now = new Date().toISOString();

    const newPass: HighwayPass = {
      id: createId("highway_pass"),
      carId: existingCar.id,
      passNumber,
      createdAt: now,
      updatedAt: now,
    };

    const nextData = normalizeAppData({
      ...appData,
      updatedAt: now,
      cars: appData.cars.map((car) =>
        car.id === existingCar.id ? { ...car, updatedAt: now } : car,
      ),
      highwayPasses: [newPass, ...appData.highwayPasses],
    });

    await saveAppData(nextData);
    setSelectedHighwayPassId(newPass.id);
    setNewHighwayPassNumber("");
    setActiveHighwayPassForm("none");
  }

  async function handleSaveHighwayPassRefill() {
    if (!appData || !existingCar) return;

    if (!selectedHighwayPass) {
      Alert.alert(
        "Validation error",
        "Add or select a highway pass before saving a refill.",
      );
      return;
    }

    const amount = parseDecimal(highwayPassRefillAmount);

    if (!isPositiveNumber(amount)) {
      Alert.alert(
        "Validation error",
        "Please enter a valid highway pass refill amount.",
      );
      return;
    }

    const now = new Date().toISOString();

    const newRefill: HighwayPassRefill = {
      id: createId("highway_pass_refill"),
      carId: existingCar.id,
      highwayPassId: selectedHighwayPass.id,
      amount,
      createdAt: now,
      updatedAt: now,
    };

    const nextData = normalizeAppData({
      ...appData,
      updatedAt: now,
      cars: appData.cars.map((car) =>
        car.id === existingCar.id ? { ...car, updatedAt: now } : car,
      ),
      highwayPassRefills: [newRefill, ...appData.highwayPassRefills],
    });

    await saveAppData(nextData);
    setHighwayPassRefillAmount("");
    setActiveHighwayPassForm("none");
  }

  async function handleSaveHighwayPassTravelFee() {
    if (!appData || !existingCar) return;

    if (!selectedHighwayPass) {
      Alert.alert(
        "Validation error",
        "Add or select a highway pass before saving a travel fee.",
      );
      return;
    }

    const amount = parseDecimal(highwayPassTravelFeeAmount);

    if (!isPositiveNumber(amount)) {
      Alert.alert(
        "Validation error",
        "Please enter a valid highway pass travel fee.",
      );
      return;
    }

    if (amount > highwayPassBalance) {
      Alert.alert(
        "Validation error",
        "Travel fee cannot be greater than the selected pass balance.",
      );
      return;
    }

    const resolvedLocation = await resolveLocationForSave(
      "highway_pass_travel_fee",
      highwayPassTravelFeeLocation,
    );

    if (!resolvedLocation.name) {
      Alert.alert(
        "Validation error",
        "Please enter a travel fee location or use GPS.",
      );
      return;
    }

    const now = new Date().toISOString();

    const newTravelFee: HighwayPassTravelFee = {
      id: createId("highway_pass_travel_fee"),
      carId: existingCar.id,
      highwayPassId: selectedHighwayPass.id,
      amount,
      location: resolvedLocation.name,
      locationId: resolvedLocation.locationId,
      createdAt: now,
      updatedAt: now,
    };

    const nextData = normalizeAppData({
      ...appData,
      updatedAt: now,
      cars: appData.cars.map((car) =>
        car.id === existingCar.id ? { ...car, updatedAt: now } : car,
      ),
      locations: resolvedLocation.locations,
      highwayPassTravelFees: [
        newTravelFee,
        ...appData.highwayPassTravelFees,
      ],
    });

    await saveAppData(nextData);
    setHighwayPassTravelFeeAmount("");
    setHighwayPassTravelFeeLocation("");
    clearLocationDraft("highway_pass_travel_fee");
    setActiveHighwayPassForm("none");
  }

  async function handleDeleteAllLocalData() {
    if (!appData) return;

    Alert.alert(
      "Reset all data",
      "This will erase every car and all saved history. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: confirmDeleteAllLocalData,
        },
      ],
    );
  }

  function confirmDeleteAllLocalData() {
    Alert.alert(
      "Final confirmation",
      "This cannot be undone. Reset all car-tracker data now?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset Everything",
          style: "destructive",
          onPress: resetAllLocalData,
        },
      ],
    );
  }

  async function resetAllLocalData() {
    if (!appData) return;

    const now = new Date().toISOString();

    const emptiedData = normalizeAppData({
      ...createEmptyAppData(),
      updatedAt: now,
      sync: {
        ...appData.sync,
        datasetResetAt: now,
        lastSyncError: null,
        lastSyncSource: "local",
      },
    });

    await saveAppData(emptiedData);
    setSelectedCarId(null);
    setIsCreatingCar(false);
    closeForms();
    setNewHighwayPassNumber("");
    setSelectedHighwayPassId(null);
    setActiveHighwayPassForm("none");
    setHighwayPassRefillAmount("");
    setHighwayPassTravelFeeAmount("");
    setHighwayPassTravelFeeLocation("");
    setCarInsuranceDueDate("");
    setCarInsurancePrice("");
    setVehicleInspectionDueDate("");
    setVehicleInspectionCost("");
    setOtherExpenseItem("");
    setIsOtherExpenseItemFocused(false);
    setOtherExpenseCost("");
  }

  function handleResetSelectedCarData() {
    if (!existingCar) return;

    Alert.alert(
      "Reset car data",
      `This will erase saved history and expenses for ${existingCar.name}, but keep the car profile. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: confirmResetSelectedCarData,
        },
      ],
    );
  }

  function confirmResetSelectedCarData() {
    if (!existingCar) return;

    Alert.alert(
      "Final confirmation",
      `This cannot be undone. Reset data for ${existingCar.name} now?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset Car Data",
          style: "destructive",
          onPress: resetSelectedCarData,
        },
      ],
    );
  }

  async function resetSelectedCarData() {
    if (!appData || !existingCar) return;

    const now = new Date().toISOString();
    const carId = existingCar.id;

    const nextData = normalizeAppData({
      ...appData,
      updatedAt: now,
      cars: appData.cars.map((car) =>
        car.id === carId
          ? {
              ...car,
              engineOilNextDueOdometer: null,
              engineOilReminderUpdatedAt: null,
              updatedAt: now,
            }
          : car,
      ),
      entries: appData.entries.filter((entry) => entry.carId !== carId),
      carWashes: appData.carWashes.filter(
        (carWash) => carWash.carId !== carId,
      ),
      carInsuranceRecords: appData.carInsuranceRecords.filter(
        (record) => record.carId !== carId,
      ),
      vehicleInspectionRecords: appData.vehicleInspectionRecords.filter(
        (record) => record.carId !== carId,
      ),
      otherExpenses: appData.otherExpenses.filter(
        (expense) => expense.carId !== carId,
      ),
      locations: appData.locations.filter(
        (location) => location.carId !== carId,
      ),
      highwayPasses: appData.highwayPasses.filter(
        (pass) => pass.carId !== carId,
      ),
      highwayPassRefills: appData.highwayPassRefills.filter(
        (refill) => refill.carId !== carId,
      ),
      highwayPassTravelFees: appData.highwayPassTravelFees.filter(
        (fee) => fee.carId !== carId,
      ),
      sync: {
        ...appData.sync,
        carDataResetAtByCarId: {
          ...appData.sync.carDataResetAtByCarId,
          [carId]: now,
        },
      },
    });

    await saveAppData(nextData);
    closeForms();
    closeHighwayPassForm();
    setSelectedHighwayPassId(null);
    setCarWashPrice("");
    setCarWashLocation("");
    setCarInsuranceDueDate("");
    setCarInsurancePrice("");
    setVehicleInspectionDueDate("");
    setVehicleInspectionCost("");
    setOtherExpenseItem("");
    setIsOtherExpenseItemFocused(false);
    setOtherExpenseCost("");
    setEngineOilNextDueOdometerInput("");
  }

  function handleDeleteSelectedCar() {
    if (!existingCar) return;

    Alert.alert(
      "Erase car",
      `This will erase ${existingCar.name} and all of its saved data. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: confirmDeleteSelectedCar,
        },
      ],
    );
  }

  function confirmDeleteSelectedCar() {
    if (!existingCar) return;

    Alert.alert(
      "Final confirmation",
      `This cannot be undone. Erase ${existingCar.name} from the app now?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Erase Car",
          style: "destructive",
          onPress: deleteSelectedCar,
        },
      ],
    );
  }

  async function deleteSelectedCar() {
    if (!appData || !existingCar) return;

    const now = new Date().toISOString();
    const carId = existingCar.id;

    const nextData = normalizeAppData({
      ...appData,
      updatedAt: now,
      cars: appData.cars.filter((car) => car.id !== carId),
      entries: appData.entries.filter((entry) => entry.carId !== carId),
      carWashes: appData.carWashes.filter(
        (carWash) => carWash.carId !== carId,
      ),
      carInsuranceRecords: appData.carInsuranceRecords.filter(
        (record) => record.carId !== carId,
      ),
      vehicleInspectionRecords: appData.vehicleInspectionRecords.filter(
        (record) => record.carId !== carId,
      ),
      otherExpenses: appData.otherExpenses.filter(
        (expense) => expense.carId !== carId,
      ),
      locations: appData.locations.filter(
        (location) => location.carId !== carId,
      ),
      highwayPasses: appData.highwayPasses.filter(
        (pass) => pass.carId !== carId,
      ),
      highwayPassRefills: appData.highwayPassRefills.filter(
        (refill) => refill.carId !== carId,
      ),
      highwayPassTravelFees: appData.highwayPassTravelFees.filter(
        (fee) => fee.carId !== carId,
      ),
      sync: {
        ...appData.sync,
        carDeletedAtByCarId: {
          ...appData.sync.carDeletedAtByCarId,
          [carId]: now,
        },
      },
    });

    await saveAppData(nextData);
    setSelectedCarId(null);
    setIsCreatingCar(false);
    closeForms();
    closeHighwayPassForm();
    setSelectedHighwayPassId(null);
    setCarWashPrice("");
    setCarWashLocation("");
    setCarInsuranceDueDate("");
    setCarInsurancePrice("");
    setVehicleInspectionDueDate("");
    setVehicleInspectionCost("");
    setOtherExpenseItem("");
    setIsOtherExpenseItemFocused(false);
    setOtherExpenseCost("");
    setEngineOilNextDueOdometerInput("");
  }

  if (isLoading || !appData) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Loading local data...</Text>
          <StatusBar style="auto" />
        </View>
      </SafeAreaView>
    );
  }

  if (!existingCar && !isCreatingCar) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Cars</Text>
          <Text style={styles.subtitle}>
            Choose a car to manage, or add another car to track separately.
          </Text>

          <SyncCard
            driveUser={driveUser}
            sync={appData.sync}
            statusLabel={driveUser ? "Connected" : "Not connected"}
            initiallyCollapsed
            isSaving={isSaving}
            isDriveSyncing={isDriveSyncing}
            onConnect={handleConnectGoogleDrive}
            onSyncNow={handleSyncNow}
            onDisconnect={handleDisconnectGoogleDrive}
          />

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Available Cars</Text>
            {availableCars.length === 0 ? (
              <Text style={styles.cardLine}>No cars added yet.</Text>
            ) : (
              <View style={styles.stackedOptions}>
                {availableCars.map((car) => (
                  <Pressable
                    key={car.id}
                    style={styles.reportListButton}
                    onPress={() => handleSelectCar(car.id)}
                  >
                    <Text style={styles.reportListButtonText}>{car.name}</Text>
                    <Text style={styles.reportListButtonValue}>
                      {formatDistanceUnitLabel(car.distanceUnit)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <Pressable
            style={[
              styles.primaryButton,
              (isSaving || isDriveSyncing) && styles.buttonDisabled,
            ]}
            onPress={openCreateCarForm}
            disabled={isSaving || isDriveSyncing}
          >
            <Text style={styles.primaryButtonText}>Add New Car</Text>
          </Pressable>

          <Pressable
            style={[
              styles.dangerButton,
              styles.bottomDangerButton,
              (isSaving || isDriveSyncing) && styles.buttonDisabled,
            ]}
            onPress={handleDeleteAllLocalData}
            disabled={isSaving || isDriveSyncing}
          >
            <Text style={styles.dangerButtonText}>
              {isSaving || isDriveSyncing ? "Working..." : "Reset All Data"}
            </Text>
          </Pressable>

          <StatusBar style="auto" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!existingCar) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable style={styles.backButton} onPress={openCarPicker}>
            <Text style={styles.backButtonText}>Back to Cars</Text>
          </Pressable>

          <Text style={styles.title}>
            {availableCars.length > 0 ? "Add New Car" : "Create Your First Car"}
          </Text>
          <Text style={styles.subtitle}>
            Local save works first. When Google Drive is connected, every save
            syncs to car-tracker-sync.json automatically.
          </Text>

          <SyncCard
            driveUser={driveUser}
            sync={appData.sync}
            statusLabel={driveUser ? "Connected" : "Not connected"}
            initiallyCollapsed
            isSaving={isSaving}
            isDriveSyncing={isDriveSyncing}
            onConnect={handleConnectGoogleDrive}
            onSyncNow={handleSyncNow}
            onDisconnect={handleDisconnectGoogleDrive}
          />

          <View style={styles.formGroup}>
            <Text style={styles.label}>Car name</Text>
            <TextInput
              style={styles.input}
              placeholder="Example: My Honda Civic"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Fuel type</Text>
            <TextInput
              style={styles.input}
              placeholder="Example: Petrol, Diesel, Hybrid"
              value={fuelType}
              onChangeText={setFuelType}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Distance unit</Text>
            <View style={styles.row}>
              <OptionButton
                label="Kilometers"
                selected={distanceUnit === "km"}
                onPress={() => setDistanceUnit("km")}
              />
              <OptionButton
                label="Miles"
                selected={distanceUnit === "miles"}
                onPress={() => setDistanceUnit("miles")}
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Currency</Text>
            <TextInput
              style={styles.input}
              placeholder="Example: $, €, MAD"
              value={currency}
              onChangeText={setCurrency}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Fuel volume unit</Text>
            <View style={styles.stackedOptions}>
              <OptionButton
                label="Liters"
                selected={fuelVolumeUnit === "liters"}
                onPress={() => setFuelVolumeUnit("liters")}
              />
              <OptionButton
                label="US gallons"
                selected={fuelVolumeUnit === "us_gallons"}
                onPress={() => setFuelVolumeUnit("us_gallons")}
              />
              <OptionButton
                label="Imperial gallons"
                selected={fuelVolumeUnit === "imperial_gallons"}
                onPress={() => setFuelVolumeUnit("imperial_gallons")}
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>
              Tank capacity ({formatFuelVolumeUnitShortLabel(fuelVolumeUnit)})
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Example: 50"
              keyboardType="decimal-pad"
              value={tankCapacity}
              onChangeText={setTankCapacity}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Fuel tracking mode</Text>
            <View style={styles.row}>
              <OptionButton
                label="Percent"
                selected={fuelStateMode === "percent"}
                onPress={() => setFuelStateMode("percent")}
              />
              <OptionButton
                label="Volume"
                selected={fuelStateMode === "volume"}
                onPress={() => setFuelStateMode("volume")}
              />
            </View>
          </View>

          <Pressable
            style={[
              styles.primaryButton,
              (isSaving || isDriveSyncing) && styles.buttonDisabled,
            ]}
            onPress={handleCreateCar}
            disabled={isSaving || isDriveSyncing}
          >
            <Text style={styles.primaryButtonText}>
              {isSaving || isDriveSyncing ? "Saving..." : "Create Car"}
            </Text>
          </Pressable>

          <StatusBar style="auto" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const hasDangerWarning = globalWarningSeverity === "danger";
  const hasCautionWarning = globalWarningSeverity === "caution";

  if (reportStep !== "home") {
    return (
      <SafeAreaView
        style={[
          styles.safeArea,
          hasDangerWarning && styles.safeAreaWarning,
          hasCautionWarning && styles.safeAreaCaution,
        ]}
      >
        <ScrollView
          style={
            hasDangerWarning
              ? styles.warningBackground
              : hasCautionWarning
                ? styles.cautionBackground
                : undefined
          }
          contentContainerStyle={[
            styles.container,
            hasDangerWarning && styles.containerWarning,
            hasCautionWarning && styles.containerCaution,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable style={styles.backButton} onPress={handleReportBack}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <Text
            style={[
              styles.title,
              hasDangerWarning && styles.titleOnWarning,
              hasCautionWarning && styles.titleOnCaution,
            ]}
          >
            Reports
          </Text>
          <Text
            style={[
              styles.subtitle,
              hasDangerWarning && styles.subtitleOnWarning,
              hasCautionWarning && styles.subtitleOnCaution,
            ]}
          >
            Review expense totals, distance covered, and fuel fill details.
          </Text>

          {globalWarningMessage ? (
            <View
              style={[
                styles.globalWarningBanner,
                hasCautionWarning && styles.globalCautionBanner,
              ]}
            >
              <Text
                style={[
                  styles.globalWarningText,
                  hasCautionWarning && styles.globalCautionText,
                ]}
              >
                {globalWarningMessage}
              </Text>
            </View>
          ) : null}

          {reportStep === "period" ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Select Report Type</Text>
              <View style={styles.stackedOptions}>
                <OptionButton
                  label="Monthly"
                  selected={false}
                  onPress={() => handleReportPeriodSelect("monthly")}
                />
                <OptionButton
                  label="Yearly"
                  selected={false}
                  onPress={() => handleReportPeriodSelect("yearly")}
                />
              </View>
            </View>
          ) : null}

          {reportStep === "date" && reportPeriod ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>
                {reportPeriod === "monthly" ? "Select Month" : "Select Year"}
              </Text>

              <View style={styles.stackedOptions}>
                {reportDateOptions.map((option) => (
                  <Pressable
                    key={option.key}
                    style={styles.reportListButton}
                    onPress={() => handleReportDateSelect(option.key)}
                  >
                    <Text style={styles.reportListButtonText}>
                      {option.label}
                    </Text>
                    <Text style={styles.reportListButtonValue}>
                      {formatMoney(option.amount, existingCar.currency)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {reportStep === "summary" && reportPeriod && reportSummary ? (
            <>
              <View style={styles.reportTotalCard}>
                <Text style={styles.reportTotalLabel}>
                  {formatReportPeriodTitle(
                    reportPeriod,
                    selectedReportPeriodKey,
                  )}
                </Text>
                <Text style={styles.reportTotalValue}>
                  {formatMoney(reportSummary.total, existingCar.currency)}
                </Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Section Totals</Text>
                {reportSummary.sectionRows.map((row) => (
                  <View key={row.key} style={styles.reportSummaryRow}>
                    <Text style={styles.reportSummaryLabel}>{row.label}</Text>
                    <Text style={styles.reportSummaryValue}>
                      {formatMoney(row.amount, existingCar.currency)}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Other Expenses By Item</Text>
                <ReportBarChart
                  rows={reportSummary.otherExpenseRows}
                  currency={existingCar.currency}
                  emptyLabel="No other expenses in this period."
                />
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Distance and Fuel Cost</Text>
                <View style={styles.reportSummaryRow}>
                  <Text style={styles.reportSummaryLabel}>
                    Distance covered
                  </Text>
                  <Text style={styles.reportSummaryValue}>
                    {formatDistanceValue(
                      reportSummary.totalDistance,
                      existingCar.distanceUnit,
                    )}
                  </Text>
                </View>
                <View style={styles.reportSummaryRow}>
                  <Text style={styles.reportSummaryLabel}>Fuel cost</Text>
                  <Text style={styles.reportSummaryValue}>
                    {formatMoney(reportSummary.fuelTotal, existingCar.currency)}
                  </Text>
                </View>
                <View style={styles.reportSummaryRow}>
                  <Text style={styles.reportSummaryLabel}>Volume filled</Text>
                  <Text style={styles.reportSummaryValue}>
                    {formatFuelVolumeValue(
                      reportSummary.fuelVolumeFilled,
                      existingCar.fuelVolumeUnit,
                    )}
                  </Text>
                </View>
                <View style={styles.reportSummaryRow}>
                  <Text style={styles.reportSummaryLabel}>
                    Cost per{" "}
                    {formatFuelVolumeUnitShortLabel(existingCar.fuelVolumeUnit)}
                  </Text>
                  <Text style={styles.reportSummaryValue}>
                    {formatMoneyPerFuelUnit(
                      reportSummary.fuelCostPerUnit,
                      existingCar.currency,
                      existingCar.fuelVolumeUnit,
                    )}
                  </Text>
                </View>
                <View style={styles.reportSummaryRow}>
                  <Text style={styles.reportSummaryLabel}>
                    Cost per {formatDistanceUnitLabel(existingCar.distanceUnit)}
                  </Text>
                  <Text style={styles.reportSummaryValue}>
                    {formatMoneyPerDistance(
                      reportSummary.fuelCostPerDistance,
                      existingCar.currency,
                      existingCar.distanceUnit,
                    )}
                  </Text>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Expenses By Section</Text>
                <ReportBarChart
                  rows={reportSummary.sectionRows}
                  currency={existingCar.currency}
                  emptyLabel="No expenses in this period."
                />
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Expenses By Date</Text>
                <ReportBarChart
                  rows={reportSummary.dateRows}
                  currency={existingCar.currency}
                  emptyLabel="No dated expenses in this period."
                />
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>
                  Distance By {reportPeriod === "yearly" ? "Month" : "Date"}
                </Text>
                <ReportDistanceBarChart
                  rows={reportSummary.distanceRows}
                  distanceUnit={existingCar.distanceUnit}
                  emptyLabel="No distance recorded in this period."
                />
              </View>
            </>
          ) : null}

          <Pressable
            style={[styles.backButton, styles.bottomBackButton]}
            onPress={handleReportBack}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>

          <StatusBar style="auto" />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        hasDangerWarning && styles.safeAreaWarning,
        hasCautionWarning && styles.safeAreaCaution,
      ]}
    >
      <ScrollView
        style={
          hasDangerWarning
            ? styles.warningBackground
            : hasCautionWarning
              ? styles.cautionBackground
              : undefined
        }
        contentContainerStyle={[
          styles.container,
          hasDangerWarning && styles.containerWarning,
          hasCautionWarning && styles.containerCaution,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.backButton} onPress={openCarPicker}>
          <Text style={styles.backButtonText}>Cars</Text>
        </Pressable>

        <Text
          style={[
            styles.title,
            hasDangerWarning && styles.titleOnWarning,
            hasCautionWarning && styles.titleOnCaution,
          ]}
        >
          {existingCar.name}
        </Text>
        <Text
          style={[
            styles.subtitle,
            hasDangerWarning && styles.subtitleOnWarning,
            hasCautionWarning && styles.subtitleOnCaution,
          ]}
        >
          Every local save syncs to Google Drive automatically when connected.
        </Text>

        {globalWarningMessage ? (
          <View
            style={[
              styles.globalWarningBanner,
              hasCautionWarning && styles.globalCautionBanner,
            ]}
          >
            <Text
              style={[
                styles.globalWarningText,
                hasCautionWarning && styles.globalCautionText,
              ]}
            >
              {globalWarningMessage}
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Reporting</Text>
          <Pressable style={styles.primaryButton} onPress={openReportFlow}>
            <Text style={styles.primaryButtonText}>Open Report</Text>
          </Pressable>
        </View>

        <SyncCard
          driveUser={driveUser}
          sync={appData.sync}
          statusLabel={driveUser ? "Connected" : "Local only"}
          showLastSource
          initiallyCollapsed
          isSaving={isSaving}
          isDriveSyncing={isDriveSyncing}
          onConnect={handleConnectGoogleDrive}
          onSyncNow={handleSyncNow}
          onDisconnect={handleDisconnectGoogleDrive}
        />

        <CollapsibleCard title="Car Setup" initiallyCollapsed>
          <Text style={styles.cardLine}>Fuel type: {existingCar.fuelType}</Text>
          <Text style={styles.cardLine}>
            Distance unit: {formatDistanceUnitLabel(existingCar.distanceUnit)}
          </Text>
          <Text style={styles.cardLine}>Currency: {existingCar.currency}</Text>
          <Text style={styles.cardLine}>
            Fuel volume unit:{" "}
            {formatFuelVolumeUnitFullLabel(existingCar.fuelVolumeUnit)}
          </Text>
          <Text style={styles.cardLine}>
            Tank capacity: {existingCar.tankCapacity}{" "}
            {formatFuelVolumeUnitShortLabel(existingCar.fuelVolumeUnit)}
          </Text>
          <Text style={styles.cardLine}>
            Fuel mode: {formatFuelStateModeLabel(existingCar.fuelStateMode)}
          </Text>
        </CollapsibleCard>

        <CollapsibleCard title="Car Insurance" initiallyCollapsed>
          {latestCarInsurance ? (
            <>
              <Text style={styles.cardLine}>
                Next due: {formatDateForDisplay(latestCarInsurance.nextDueDate)}
              </Text>
              <Text style={styles.cardLine}>
                Price: {latestCarInsurance.price} {existingCar.currency}
              </Text>
              <Text style={styles.cardLine}>
                Last update: {formatDateTime(latestCarInsurance.createdAt)}
              </Text>
              <Text
                style={[
                  styles.cardLine,
                  carInsuranceDueStatus === "due"
                    ? styles.overdueStatusText
                    : carInsuranceDueStatus === "upcoming"
                      ? styles.upcomingStatusText
                      : styles.okStatusText,
                ]}
              >
                Status: {formatDueDateStatus(carInsuranceDueStatus)}
              </Text>
              <Text style={styles.cardLine}>
                Total insurance spent: {totalCarInsuranceSpend}{" "}
                {existingCar.currency}
              </Text>
            </>
          ) : (
            <Text style={styles.cardLine}>
              No car insurance reminder set yet.
            </Text>
          )}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Next due date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              placeholder="Example: 2026-05-30"
              value={carInsuranceDueDate}
              onChangeText={setCarInsuranceDueDate}
              editable={!isSaving && !isDriveSyncing}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Price ({existingCar.currency})</Text>
            <TextInput
              style={styles.input}
              placeholder="Example: 1200"
              keyboardType="decimal-pad"
              value={carInsurancePrice}
              onChangeText={setCarInsurancePrice}
              editable={!isSaving && !isDriveSyncing}
            />
          </View>

          <Pressable
            style={[
              styles.primaryButton,
              (isSaving || isDriveSyncing) && styles.buttonDisabled,
            ]}
            onPress={handleSaveCarInsurance}
            disabled={isSaving || isDriveSyncing}
          >
            <Text style={styles.primaryButtonText}>
              {isSaving || isDriveSyncing ? "Saving..." : "Save Insurance"}
            </Text>
          </Pressable>
        </CollapsibleCard>

        <CollapsibleCard title="Vehicle Inspection" initiallyCollapsed>
          {latestVehicleInspection ? (
            <>
              <Text style={styles.cardLine}>
                Next due:{" "}
                {formatDateForDisplay(latestVehicleInspection.nextDueDate)}
              </Text>
              <Text style={styles.cardLine}>
                Cost: {latestVehicleInspection.cost} {existingCar.currency}
              </Text>
              <Text style={styles.cardLine}>
                Last update: {formatDateTime(latestVehicleInspection.createdAt)}
              </Text>
              <Text
                style={[
                  styles.cardLine,
                  vehicleInspectionDueStatus === "due"
                    ? styles.overdueStatusText
                    : vehicleInspectionDueStatus === "upcoming"
                      ? styles.upcomingStatusText
                      : styles.okStatusText,
                ]}
              >
                Status: {formatDueDateStatus(vehicleInspectionDueStatus)}
              </Text>
              <Text style={styles.cardLine}>
                Total inspection spent: {totalVehicleInspectionSpend}{" "}
                {existingCar.currency}
              </Text>
            </>
          ) : (
            <Text style={styles.cardLine}>
              No vehicle inspection reminder set yet.
            </Text>
          )}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Next due date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              placeholder="Example: 2026-05-30"
              value={vehicleInspectionDueDate}
              onChangeText={setVehicleInspectionDueDate}
              editable={!isSaving && !isDriveSyncing}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Cost ({existingCar.currency})</Text>
            <TextInput
              style={styles.input}
              placeholder="Example: 300"
              keyboardType="decimal-pad"
              value={vehicleInspectionCost}
              onChangeText={setVehicleInspectionCost}
              editable={!isSaving && !isDriveSyncing}
            />
          </View>

          <Pressable
            style={[
              styles.primaryButton,
              (isSaving || isDriveSyncing) && styles.buttonDisabled,
            ]}
            onPress={handleSaveVehicleInspection}
            disabled={isSaving || isDriveSyncing}
          >
            <Text style={styles.primaryButtonText}>
              {isSaving || isDriveSyncing ? "Saving..." : "Save Inspection"}
            </Text>
          </Pressable>
        </CollapsibleCard>

        <CollapsibleCard title="Engine Oil Change Reminder" initiallyCollapsed>
          <Text style={styles.cardLine}>
            Current odometer:{" "}
            {formatNullableDistanceValue(
              currentOdometer,
              existingCar.distanceUnit,
              "No reading yet",
            )}
          </Text>
          <Text style={styles.cardLine}>
            Next due:{" "}
            {formatNullableDistanceValue(
              existingCar.engineOilNextDueOdometer,
              existingCar.distanceUnit,
              "Not set",
            )}
          </Text>
          <Text style={styles.cardLine}>
            Last reminder update:{" "}
            {formatNullableDateTime(existingCar.engineOilReminderUpdatedAt)}
          </Text>
          <Text
            style={[
              styles.cardLine,
              isEngineOilChangeOverdue
                ? styles.overdueStatusText
                : isEngineOilChangeDueSoon
                  ? styles.upcomingStatusText
                : styles.okStatusText,
            ]}
          >
            Status:{" "}
            {existingCar.engineOilNextDueOdometer === null
              ? "No reminder set"
              : isEngineOilChangeOverdue
                ? "Overdue"
                : isEngineOilChangeDueSoon
                  ? `Due within ${formatEngineOilThreshold(
                      existingCar.distanceUnit,
                    )}`
                  : "Not due soon"}
          </Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>
              Next due odometer (
              {formatDistanceUnitLabel(existingCar.distanceUnit)})
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Example: 130000"
              keyboardType="decimal-pad"
              value={engineOilNextDueOdometerInput}
              onChangeText={setEngineOilNextDueOdometerInput}
            />
          </View>

          <Pressable
            style={[
              styles.primaryButton,
              (isSaving || isDriveSyncing) && styles.buttonDisabled,
            ]}
            onPress={handleSaveEngineOilReminder}
            disabled={isSaving || isDriveSyncing}
          >
            <Text style={styles.primaryButtonText}>
              {isSaving || isDriveSyncing
                ? "Saving..."
                : existingCar.engineOilNextDueOdometer === null
                  ? "Create Reminder"
                  : "Update Reminder"}
            </Text>
          </Pressable>
        </CollapsibleCard>

        <CollapsibleCard title="Highway Pass" initiallyCollapsed>
          <View style={styles.formGroup}>
            <View style={styles.selectorHeader}>
              <Text style={[styles.label, styles.selectorLabel]}>
                Select pass
              </Text>
              <Pressable
                accessibilityLabel="Add highway pass"
                accessibilityRole="button"
                style={[
                  styles.smallIconButton,
                  (isSaving || isDriveSyncing) && styles.buttonDisabled,
                ]}
                onPress={() => openHighwayPassForm("add_pass")}
                disabled={isSaving || isDriveSyncing}
              >
                <Text style={styles.smallIconButtonText}>+</Text>
              </Pressable>
            </View>

            {highwayPasses.length === 0 ? (
              <Text style={styles.cardLine}>
                No highway passes added yet.
              </Text>
            ) : (
              <View style={styles.stackedOptions}>
                {highwayPasses.map((pass) => (
                  <OptionButton
                    key={pass.id}
                    label={`${pass.passNumber} (${getHighwayPassBalance(
                      pass.id,
                    )} ${existingCar.currency})`}
                    selected={selectedHighwayPass?.id === pass.id}
                    onPress={() => {
                      setSelectedHighwayPassId(pass.id);
                      closeHighwayPassForm();
                    }}
                  />
                ))}
              </View>
            )}
          </View>

          {activeHighwayPassForm === "add_pass" ? (
            <>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Add pass number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Example: 1234567890"
                  value={newHighwayPassNumber}
                  onChangeText={setNewHighwayPassNumber}
                  autoCapitalize="none"
                  returnKeyType="done"
                />
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  style={[
                    styles.primaryButton,
                    styles.flexButton,
                    (isSaving || isDriveSyncing) && styles.buttonDisabled,
                  ]}
                  onPress={handleAddHighwayPass}
                  disabled={isSaving || isDriveSyncing}
                >
                  <Text style={styles.primaryButtonText}>
                    {isSaving || isDriveSyncing ? "Saving..." : "Add Pass"}
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.secondaryButton, styles.flexButton]}
                  onPress={closeHighwayPassForm}
                  disabled={isSaving || isDriveSyncing}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </>
          ) : null}

          {selectedHighwayPass ? (
            <>
              <Text style={styles.cardLine}>
                Selected pass: {selectedHighwayPass.passNumber}
              </Text>
              <Text style={styles.cardLine}>
                Balance: {highwayPassBalance} {existingCar.currency}
              </Text>
              {latestHighwayPassRefill ? (
                <>
                  <Text style={styles.cardLine}>
                    Last refill:{" "}
                    {formatDateTime(latestHighwayPassRefill.createdAt)}
                  </Text>
                  <Text style={styles.cardLine}>
                    Last refill amount: {latestHighwayPassRefill.amount}{" "}
                    {existingCar.currency}
                  </Text>
                </>
              ) : null}
              {latestHighwayPassTravelFee ? (
                <>
                  <Text style={styles.cardLine}>
                    Last travel fee:{" "}
                    {formatDateTime(latestHighwayPassTravelFee.createdAt)}
                  </Text>
                  <Text style={styles.cardLine}>
                    Last fee amount: {latestHighwayPassTravelFee.amount}{" "}
                    {existingCar.currency}
                  </Text>
                  <Text style={styles.cardLine}>
                    Last fee location:{" "}
                    {getSavedLocationName(
                      latestHighwayPassTravelFee.locationId,
                      latestHighwayPassTravelFee.location,
                    )}
                  </Text>
                </>
              ) : null}
              <Text style={styles.cardLine}>
                Total refills: {selectedHighwayPassRefills.length}
              </Text>
              <Text style={styles.cardLine}>
                Total travel fees: {selectedHighwayPassTravelFees.length}
              </Text>
              <Text style={styles.cardLine}>
                Total refilled: {totalHighwayPassRefillSpend}{" "}
                {existingCar.currency}
              </Text>
              <Text style={styles.cardLine}>
                Total deducted: {totalHighwayPassTravelFeeSpend}{" "}
                {existingCar.currency}
              </Text>

              <View style={styles.actionRow}>
                <Pressable
                  style={[
                    styles.primaryButton,
                    styles.flexButton,
                    (isSaving || isDriveSyncing || !!locationLookupTarget) &&
                      styles.buttonDisabled,
                  ]}
                  onPress={() => openHighwayPassForm("refill")}
                  disabled={
                    isSaving || isDriveSyncing || !!locationLookupTarget
                  }
                >
                  <Text style={styles.primaryButtonText}>Refill</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.primaryButton,
                    styles.flexButton,
                    (isSaving || isDriveSyncing || !!locationLookupTarget) &&
                      styles.buttonDisabled,
                  ]}
                  onPress={() => openHighwayPassForm("travel_fee")}
                  disabled={
                    isSaving || isDriveSyncing || !!locationLookupTarget
                  }
                >
                  <Text style={styles.primaryButtonText}>Travel Fee</Text>
                </Pressable>
              </View>

              {activeHighwayPassForm === "refill" ? (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>
                      Refill amount ({existingCar.currency})
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Example: 100"
                      keyboardType="decimal-pad"
                      value={highwayPassRefillAmount}
                      onChangeText={setHighwayPassRefillAmount}
                    />
                  </View>

                  <View style={styles.actionRow}>
                    <Pressable
                      style={[
                        styles.primaryButton,
                        styles.flexButton,
                        (isSaving ||
                          isDriveSyncing ||
                          !!locationLookupTarget) &&
                          styles.buttonDisabled,
                      ]}
                      onPress={handleSaveHighwayPassRefill}
                      disabled={
                        isSaving || isDriveSyncing || !!locationLookupTarget
                      }
                    >
                      <Text style={styles.primaryButtonText}>
                        {isSaving || isDriveSyncing
                          ? "Saving..."
                          : "Save Refill"}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[styles.secondaryButton, styles.flexButton]}
                      onPress={closeHighwayPassForm}
                      disabled={
                        isSaving || isDriveSyncing || !!locationLookupTarget
                      }
                    >
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}

              {activeHighwayPassForm === "travel_fee" ? (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>
                      Travel fee ({existingCar.currency})
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Example: 23"
                      keyboardType="decimal-pad"
                      value={highwayPassTravelFeeAmount}
                      onChangeText={setHighwayPassTravelFeeAmount}
                    />
                  </View>

                  <LocationInput
                    value={highwayPassTravelFeeLocation}
                    onChangeText={setHighwayPassTravelFeeLocation}
                    onUseCurrentLocation={() =>
                      handleUseCurrentLocation("highway_pass_travel_fee")
                    }
                    isResolving={
                      locationLookupTarget === "highway_pass_travel_fee"
                    }
                    disabled={
                      isSaving || isDriveSyncing || !!locationLookupTarget
                    }
                  />

                  <View style={styles.actionRow}>
                    <Pressable
                      style={[
                        styles.primaryButton,
                        styles.flexButton,
                        (isSaving ||
                          isDriveSyncing ||
                          !!locationLookupTarget) &&
                          styles.buttonDisabled,
                      ]}
                      onPress={handleSaveHighwayPassTravelFee}
                      disabled={
                        isSaving || isDriveSyncing || !!locationLookupTarget
                      }
                    >
                      <Text style={styles.primaryButtonText}>
                        {locationLookupTarget === "highway_pass_travel_fee"
                          ? "Locating..."
                          : isSaving || isDriveSyncing
                            ? "Saving..."
                            : "Save Travel Fee"}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[styles.secondaryButton, styles.flexButton]}
                      onPress={closeHighwayPassForm}
                      disabled={
                        isSaving || isDriveSyncing || !!locationLookupTarget
                      }
                    >
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}

              <View style={styles.historySection}>
                <Text style={styles.sectionTitle}>Pass History</Text>

                {selectedHighwayPassHistory.length === 0 ? (
                  <Text style={styles.cardLine}>No pass activity yet.</Text>
                ) : (
                  selectedHighwayPassHistory.map((item) => (
                    <View
                      key={`${item.type}_${item.id}`}
                      style={styles.historyItem}
                    >
                      <Text style={styles.historyTitle}>
                        {item.type === "refill" ? "Refill" : "Travel fee"} -{" "}
                        {formatDateTime(item.createdAt)}
                      </Text>
                      <Text style={styles.historyLine}>
                        {item.type === "refill" ? "Refilled" : "Deducted"}:{" "}
                        {item.amount} {existingCar.currency}
                      </Text>
                      {item.type === "travel_fee" && item.location ? (
                        <Text style={styles.historyLine}>
                          Location: {item.location}
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            </>
          ) : null}
        </CollapsibleCard>

        <CollapsibleCard title="Car Wash" initiallyCollapsed>
          {latestCarWash ? (
            <>
              <Text style={styles.cardLine}>
                Last wash: {formatDateTime(latestCarWash.createdAt)}
              </Text>
              <Text style={styles.cardLine}>
                Last price: {latestCarWash.price} {existingCar.currency}
              </Text>
              {getSavedLocationName(
                latestCarWash.locationId,
                latestCarWash.location,
              ) ? (
                <Text style={styles.cardLine}>
                  Location:{" "}
                  {getSavedLocationName(
                    latestCarWash.locationId,
                    latestCarWash.location,
                  )}
                </Text>
              ) : null}
              <Text style={styles.cardLine}>
                Total washes: {carWashes.length}
              </Text>
              <Text style={styles.cardLine}>
                Total spent: {totalCarWashSpend} {existingCar.currency}
              </Text>
            </>
          ) : (
            <Text style={styles.cardLine}>No car washes recorded yet.</Text>
          )}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Price ({existingCar.currency})</Text>
            <TextInput
              style={styles.input}
              placeholder="Example: 40"
              keyboardType="decimal-pad"
              value={carWashPrice}
              onChangeText={setCarWashPrice}
            />
          </View>

          <LocationInput
            value={carWashLocation}
            onChangeText={setCarWashLocation}
            onUseCurrentLocation={() => handleUseCurrentLocation("car_wash")}
            isResolving={locationLookupTarget === "car_wash"}
            disabled={isSaving || isDriveSyncing || !!locationLookupTarget}
          />

          <Pressable
            style={[
              styles.primaryButton,
              (isSaving || isDriveSyncing || !!locationLookupTarget) &&
                styles.buttonDisabled,
            ]}
            onPress={handleSaveCarWash}
            disabled={isSaving || isDriveSyncing || !!locationLookupTarget}
          >
            <Text style={styles.primaryButtonText}>
              {locationLookupTarget === "car_wash"
                ? "Locating..."
                : isSaving || isDriveSyncing
                  ? "Saving..."
                  : "Save Car Wash"}
            </Text>
          </Pressable>
        </CollapsibleCard>

        <CollapsibleCard title="Other Expenses" initiallyCollapsed>
          {latestOtherExpense ? (
            <>
              <Text style={styles.cardLine}>
                Last expense: {latestOtherExpense.item}
              </Text>
              <Text style={styles.cardLine}>
                Last cost: {latestOtherExpense.cost} {existingCar.currency}
              </Text>
              <Text style={styles.cardLine}>
                Last saved: {formatDateTime(latestOtherExpense.createdAt)}
              </Text>
              <Text style={styles.cardLine}>
                Total expenses: {otherExpenses.length}
              </Text>
              <Text style={styles.cardLine}>
                Total spent: {totalOtherExpenseSpend} {existingCar.currency}
              </Text>
            </>
          ) : (
            <Text style={styles.cardLine}>No other expenses recorded yet.</Text>
          )}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Item</Text>
            <TextInput
              style={styles.input}
              placeholder="Example: Parking"
              value={otherExpenseItem}
              onChangeText={(value) => {
                setOtherExpenseItem(value);
                setIsOtherExpenseItemFocused(true);
              }}
              onFocus={() => setIsOtherExpenseItemFocused(true)}
              onBlur={() => setIsOtherExpenseItemFocused(false)}
              editable={!isSaving && !isDriveSyncing}
              autoCapitalize="words"
              returnKeyType="done"
            />
            {isOtherExpenseItemFocused &&
            filteredOtherExpenseItemOptions.length > 0 ? (
              <ScrollView
                style={styles.itemSuggestionList}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {filteredOtherExpenseItemOptions.map((item) => (
                  <Pressable
                    key={item}
                    style={styles.itemSuggestionButton}
                    onPressIn={() => {
                      setOtherExpenseItem(item);
                      setIsOtherExpenseItemFocused(false);
                    }}
                  >
                    <Text style={styles.itemSuggestionText}>{item}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Cost ({existingCar.currency})</Text>
            <TextInput
              style={styles.input}
              placeholder="Example: 20"
              keyboardType="decimal-pad"
              value={otherExpenseCost}
              onChangeText={setOtherExpenseCost}
              editable={!isSaving && !isDriveSyncing}
            />
          </View>

          <Pressable
            style={[
              styles.primaryButton,
              (isSaving || isDriveSyncing) && styles.buttonDisabled,
            ]}
            onPress={handleSaveOtherExpense}
            disabled={isSaving || isDriveSyncing}
          >
            <Text style={styles.primaryButtonText}>
              {isSaving || isDriveSyncing ? "Saving..." : "Save Expense"}
            </Text>
          </Pressable>

          {otherExpenses.length > 0 ? (
            <View style={styles.historySection}>
              <Text style={styles.sectionTitle}>Expense History</Text>

              {otherExpenses.map((expense) => (
                <View key={expense.id} style={styles.historyItem}>
                  <Text style={styles.historyTitle}>
                    {expense.item} - {formatDateTime(expense.createdAt)}
                  </Text>
                  <Text style={styles.historyLine}>
                    Cost: {expense.cost} {existingCar.currency}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </CollapsibleCard>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Fuel Consumption</Text>

          {latestCompletedRefuelMetric ? (
            <>
              <Text style={styles.cardLine}>
                Last completed interval distance:{" "}
                {latestCompletedRefuelMetric.distanceSincePreviousRefuel}{" "}
                {formatDistanceUnitLabel(existingCar.distanceUnit)}
              </Text>
              <Text style={styles.cardLine}>
                Fuel used: {latestCompletedRefuelMetric.fuelUsed}{" "}
                {formatFuelVolumeUnitShortLabel(existingCar.fuelVolumeUnit)}
              </Text>
              <Text style={styles.cardLine}>
                Consumption:{" "}
                {formatConsumptionValue(
                  latestCompletedRefuelMetric.consumptionPer100Distance,
                  existingCar,
                )}
              </Text>

              {averageConsumptionMetric && (
                <>
                  <Text style={styles.cardLine}>
                    Average distance: {averageConsumptionMetric.totalDistance}{" "}
                    {formatDistanceUnitLabel(existingCar.distanceUnit)}
                  </Text>
                  <Text style={styles.cardLine}>
                    Average fuel used: {averageConsumptionMetric.totalFuelUsed}{" "}
                    {formatFuelVolumeUnitShortLabel(existingCar.fuelVolumeUnit)}
                  </Text>
                  <Text style={styles.cardLine}>
                    Average consumption:{" "}
                    {formatConsumptionValue(
                      averageConsumptionMetric.consumptionPer100Distance,
                      existingCar,
                    )}
                  </Text>
                </>
              )}
            </>
          ) : (
            <Text style={styles.cardLine}>
              Not enough refuels yet. You need at least 2 refuel entries to
              calculate interval consumption.
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Current State</Text>

          {latestEntry ? (
            <>
              <Text style={styles.cardLine}>
                Odometer: {latestEntry.odometer}{" "}
                {formatDistanceUnitLabel(existingCar.distanceUnit)}
              </Text>
              <Text style={styles.cardLine}>
                Tank state:{" "}
                {formatTankState(latestEntry.tankState, existingCar)}
              </Text>
              <Text style={styles.cardLine}>
                Distance since previous entry:{" "}
                {formatDistanceValue(
                  latestEntry.distanceSinceLastEntry,
                  existingCar.distanceUnit,
                )}
              </Text>
              <Text style={styles.cardLine}>
                Last update: {formatDateTime(latestEntry.createdAt)}
              </Text>
              <Text style={styles.cardLine}>
                Last entry type: {formatEntryType(latestEntry.type)}
              </Text>
              {getSavedLocationName(
                latestEntry.locationId,
                latestEntry.location,
              ) ? (
                <Text style={styles.cardLine}>
                  Location:{" "}
                  {getSavedLocationName(
                    latestEntry.locationId,
                    latestEntry.location,
                  )}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.cardLine}>
              No readings yet. Add the first reading before the first refuel.
            </Text>
          )}
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.primaryButton, styles.flexButton]}
            onPress={openReadingForm}
            disabled={isSaving || isDriveSyncing}
          >
            <Text style={styles.primaryButtonText}>Update Reading</Text>
          </Pressable>

          <Pressable
            style={[styles.primaryButton, styles.flexButton]}
            onPress={openRefuelForm}
            disabled={isSaving || isDriveSyncing}
          >
            <Text style={styles.primaryButtonText}>Refuel</Text>
          </Pressable>
        </View>

        {activeForm === "reading" && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Save Reading</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Odometer ({formatDistanceUnitLabel(existingCar.distanceUnit)})
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Example: 125000"
                keyboardType="decimal-pad"
                value={readingOdometer}
                onChangeText={setReadingOdometer}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Tank state ({getTankStateUnitLabel(existingCar)})
              </Text>
              <TextInput
                style={styles.input}
                placeholder={getTankStatePlaceholder(existingCar)}
                keyboardType="decimal-pad"
                value={readingTankState}
                onChangeText={setReadingTankState}
              />
            </View>

            <LocationInput
              value={readingLocation}
              onChangeText={setReadingLocation}
              onUseCurrentLocation={() => handleUseCurrentLocation("reading")}
              isResolving={locationLookupTarget === "reading"}
              disabled={isSaving || isDriveSyncing || !!locationLookupTarget}
            />

            <View style={styles.calculationBox}>
              <Text style={styles.calculationTitle}>Distance crossed</Text>
              <Text style={styles.calculationValue}>
                {formatDistanceValue(
                  readingDistancePreview,
                  existingCar.distanceUnit,
                )}
              </Text>
            </View>

            <View style={styles.actionRow}>
              <Pressable
                style={[
                  styles.primaryButton,
                  styles.flexButton,
                  (isSaving || isDriveSyncing || !!locationLookupTarget) &&
                    styles.buttonDisabled,
                ]}
                onPress={handleSaveReading}
                disabled={isSaving || isDriveSyncing || !!locationLookupTarget}
              >
                <Text style={styles.primaryButtonText}>
                  {locationLookupTarget === "reading"
                    ? "Locating..."
                    : isSaving || isDriveSyncing
                      ? "Saving..."
                      : "Save Reading"}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.secondaryButton, styles.flexButton]}
                onPress={closeForms}
                disabled={isSaving || isDriveSyncing || !!locationLookupTarget}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}

        {activeForm === "refuel" && latestEntry && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Save Refuel</Text>
            <Text style={styles.smallHint}>
              Enter any 2 of these 3 values: amount added, price per unit, money
              paid.
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Odometer ({formatDistanceUnitLabel(existingCar.distanceUnit)})
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Example: 125500"
                keyboardType="decimal-pad"
                value={refuelOdometer}
                onChangeText={setRefuelOdometer}
              />
            </View>

            <LocationInput
              value={refuelLocation}
              onChangeText={setRefuelLocation}
              onUseCurrentLocation={() => handleUseCurrentLocation("refuel")}
              isResolving={locationLookupTarget === "refuel"}
              disabled={isSaving || isDriveSyncing || !!locationLookupTarget}
            />

            <View style={styles.formGroup}>
              <Text style={styles.label}>Current tank state</Text>
              <View style={styles.readonlyBox}>
                <Text style={styles.readonlyValue}>
                  {formatTankState(latestEntry.tankState, existingCar)}
                </Text>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Amount added (
                {formatFuelVolumeUnitShortLabel(existingCar.fuelVolumeUnit)})
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Example: 20"
                keyboardType="decimal-pad"
                value={refuelAmountAdded}
                onChangeText={setRefuelAmountAdded}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Price per{" "}
                {formatFuelVolumeUnitShortLabel(existingCar.fuelVolumeUnit)} (
                {existingCar.currency})
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Example: 1.5"
                keyboardType="decimal-pad"
                value={refuelPricePerUnit}
                onChangeText={setRefuelPricePerUnit}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Money paid ({existingCar.currency})
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Example: 30"
                keyboardType="decimal-pad"
                value={refuelMoneyPaid}
                onChangeText={setRefuelMoneyPaid}
              />
            </View>

            <View style={styles.calculationBox}>
              <Text style={styles.calculationTitle}>Distance crossed</Text>
              <Text style={styles.calculationValue}>
                {formatDistanceValue(
                  refuelDistancePreview,
                  existingCar.distanceUnit,
                )}
              </Text>
            </View>

            <View style={styles.calculationBox}>
              <Text style={styles.calculationTitle}>Resolved added volume</Text>
              <Text style={styles.calculationValue}>
                {refuelResolution.amountAdded !== null
                  ? `${refuelResolution.amountAdded} ${formatFuelVolumeUnitShortLabel(
                      existingCar.fuelVolumeUnit,
                    )}`
                  : "Waiting for enough data"}
              </Text>
            </View>

            <View style={styles.calculationBox}>
              <Text style={styles.calculationTitle}>
                Resolved price per unit
              </Text>
              <Text style={styles.calculationValue}>
                {refuelResolution.pricePerUnit !== null
                  ? `${refuelResolution.pricePerUnit} ${existingCar.currency}`
                  : "Waiting for enough data"}
              </Text>
            </View>

            <View style={styles.calculationBox}>
              <Text style={styles.calculationTitle}>Resolved money paid</Text>
              <Text style={styles.calculationValue}>
                {refuelResolution.moneyPaid !== null
                  ? `${refuelResolution.moneyPaid} ${existingCar.currency}`
                  : "Waiting for enough data"}
              </Text>
            </View>

            <View style={styles.calculationBox}>
              <Text style={styles.calculationTitle}>
                Calculated tank state after refuel
              </Text>
              <Text style={styles.calculationValue}>
                {calculatedRefuelTankState !== null
                  ? formatTankState(calculatedRefuelTankState, existingCar)
                  : "Waiting for enough data"}
              </Text>
            </View>

            <View style={styles.actionRow}>
              <Pressable
                style={[
                  styles.primaryButton,
                  styles.flexButton,
                  (isSaving || isDriveSyncing || !!locationLookupTarget) &&
                    styles.buttonDisabled,
                ]}
                onPress={handleSaveRefuel}
                disabled={isSaving || isDriveSyncing || !!locationLookupTarget}
              >
                <Text style={styles.primaryButtonText}>
                  {locationLookupTarget === "refuel"
                    ? "Locating..."
                    : isSaving || isDriveSyncing
                      ? "Saving..."
                      : "Save Refuel"}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.secondaryButton, styles.flexButton]}
                onPress={closeForms}
                disabled={isSaving || isDriveSyncing || !!locationLookupTarget}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>History</Text>

          {carEntries.length === 0 ? (
            <Text style={styles.cardLine}>No history yet.</Text>
          ) : (
            carEntries.map((entry) => {
              const refuelMetric =
                entry.type === "refuel"
                  ? refuelMetricsByEntryId[entry.id]
                  : null;

              return (
                <View key={entry.id} style={styles.historyItem}>
                  <Text style={styles.historyTitle}>
                    {formatEntryType(entry.type)} —{" "}
                    {formatDateTime(entry.createdAt)}
                  </Text>
                  <Text style={styles.historyLine}>
                    Odometer: {entry.odometer}{" "}
                    {formatDistanceUnitLabel(existingCar.distanceUnit)}
                  </Text>
                  <Text style={styles.historyLine}>
                    Distance crossed:{" "}
                    {formatDistanceValue(
                      entry.distanceSinceLastEntry,
                      existingCar.distanceUnit,
                    )}
                  </Text>
                  <Text style={styles.historyLine}>
                    Tank state: {formatTankState(entry.tankState, existingCar)}
                  </Text>
                  {getSavedLocationName(entry.locationId, entry.location) ? (
                    <Text style={styles.historyLine}>
                      Location:{" "}
                      {getSavedLocationName(entry.locationId, entry.location)}
                    </Text>
                  ) : null}

                  {entry.type === "refuel" && entry.amountAdded !== null && (
                    <Text style={styles.historyLine}>
                      Added: {entry.amountAdded}{" "}
                      {formatFuelVolumeUnitShortLabel(
                        existingCar.fuelVolumeUnit,
                      )}
                    </Text>
                  )}

                  {entry.type === "refuel" && entry.pricePerUnit !== null && (
                    <Text style={styles.historyLine}>
                      Price per unit: {entry.pricePerUnit}{" "}
                      {existingCar.currency}
                    </Text>
                  )}

                  {entry.type === "refuel" && entry.moneyPaid !== null && (
                    <Text style={styles.historyLine}>
                      Paid: {entry.moneyPaid} {existingCar.currency}
                    </Text>
                  )}

                  {refuelMetric && (
                    <>
                      <Text style={styles.historyLine}>
                        Distance since previous refuel:{" "}
                        {refuelMetric.distanceSincePreviousRefuel}{" "}
                        {formatDistanceUnitLabel(existingCar.distanceUnit)}
                      </Text>
                      <Text style={styles.historyLine}>
                        Fuel used over interval: {refuelMetric.fuelUsed}{" "}
                        {formatFuelVolumeUnitShortLabel(
                          existingCar.fuelVolumeUnit,
                        )}
                      </Text>
                      <Text style={styles.historyLine}>
                        Consumption:{" "}
                        {formatConsumptionValue(
                          refuelMetric.consumptionPer100Distance,
                          existingCar,
                        )}
                      </Text>
                    </>
                  )}
                </View>
              );
            })
          )}
        </View>

        <View style={styles.carDangerActions}>
          <Pressable
            style={[
              styles.dangerButton,
              styles.carDangerButton,
              styles.flexButton,
              (isSaving || isDriveSyncing) && styles.buttonDisabled,
            ]}
            onPress={handleResetSelectedCarData}
            disabled={isSaving || isDriveSyncing}
          >
            <Text style={styles.dangerButtonText}>
              {isSaving || isDriveSyncing ? "Working..." : "Reset Car Data"}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.dangerButton,
              styles.carDangerButton,
              styles.flexButton,
              (isSaving || isDriveSyncing) && styles.buttonDisabled,
            ]}
            onPress={handleDeleteSelectedCar}
            disabled={isSaving || isDriveSyncing}
          >
            <Text style={styles.dangerButtonText}>
              {isSaving || isDriveSyncing ? "Working..." : "Erase Car"}
            </Text>
          </Pressable>
        </View>

        <StatusBar style={hasDangerWarning ? "light" : "auto"} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ReportBarChart({
  rows,
  currency,
  emptyLabel,
}: {
  rows: ReportAmountRow[];
  currency: string;
  emptyLabel: string;
}) {
  const maxAmount = Math.max(...rows.map((row) => row.amount), 0);
  const totalAmount = sumReportRows(rows);

  if (rows.length === 0 || maxAmount <= 0) {
    return <Text style={styles.cardLine}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.reportChart}>
      {rows.map((row) => {
        const width =
          row.amount > 0
            ? (`${Math.max((row.amount / maxAmount) * 100, 4)}%` as const)
            : "0%";

        return (
          <View key={row.key} style={styles.reportChartRow}>
            <View style={styles.reportChartHeader}>
              <Text style={styles.reportChartLabel}>{row.label}</Text>
              <Text style={styles.reportChartValue}>
                {formatMoneyWithPercent(row.amount, currency, totalAmount)}
              </Text>
            </View>
            <View style={styles.reportBarTrack}>
              <View style={[styles.reportBarFill, { width }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ReportDistanceBarChart({
  rows,
  distanceUnit,
  emptyLabel,
}: {
  rows: ReportDistanceRow[];
  distanceUnit: DistanceUnit;
  emptyLabel: string;
}) {
  const maxDistance = Math.max(...rows.map((row) => row.distance), 0);
  const totalDistance = sumReportDistanceRows(rows);

  if (rows.length === 0 || maxDistance <= 0) {
    return <Text style={styles.cardLine}>{emptyLabel}</Text>;
  }

  return (
    <View style={styles.reportChart}>
      {rows.map((row) => {
        const width =
          row.distance > 0
            ? (`${Math.max((row.distance / maxDistance) * 100, 4)}%` as const)
            : "0%";

        return (
          <View key={row.key} style={styles.reportChartRow}>
            <View style={styles.reportChartHeader}>
              <Text style={styles.reportChartLabel}>{row.label}</Text>
              <Text style={styles.reportChartValue}>
                {formatDistanceWithPercent(
                  row.distance,
                  distanceUnit,
                  totalDistance,
                )}
              </Text>
            </View>
            <View style={styles.reportBarTrack}>
              <View style={[styles.reportBarFill, { width }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function buildOtherExpenseItemOptions(otherExpenses: OtherExpense[]) {
  const itemByKey = new Map<string, string>();

  for (const expense of otherExpenses) {
    const label = normalizeOtherExpenseItemLabel(expense.item);
    if (label === "Uncategorized") continue;

    const key = label.toLocaleLowerCase();
    if (!itemByKey.has(key)) {
      itemByKey.set(key, label);
    }
  }

  return Array.from(itemByKey.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

function filterOtherExpenseItemOptions(options: string[], value: string) {
  const searchText = value.trim().toLocaleLowerCase();
  if (!searchText) return options;

  return options.filter((option) =>
    option.toLocaleLowerCase().includes(searchText),
  );
}

function resolveGpsLocationForSave(
  gpsLocation: LocationDraft,
  typedName: string,
  locations: LocationPlace[],
  carId: string,
): ResolvedLocation {
  const carLocations = locations.filter((location) => location.carId === carId);
  const matchingLocation =
    (gpsLocation.locationId
      ? carLocations.find((location) => location.id === gpsLocation.locationId)
      : null) ?? findMatchingLocation(gpsLocation, carLocations);
  const locationName =
    typedName || matchingLocation?.name || gpsLocation.inferredName;
  const now = new Date().toISOString();

  if (matchingLocation) {
    const nextInferredName =
      matchingLocation.inferredName || gpsLocation.inferredName;
    const shouldUpdate =
      matchingLocation.name !== locationName ||
      matchingLocation.inferredName !== nextInferredName;

    return {
      name: locationName,
      locationId: matchingLocation.id,
      locations: shouldUpdate
        ? locations.map((location) =>
            location.id === matchingLocation.id
              ? {
                  ...location,
                  name: locationName,
                  inferredName: nextInferredName,
                  updatedAt: now,
                }
              : location,
          )
        : locations,
    };
  }

  const newLocation: LocationPlace = {
    id: createId("location"),
    carId,
    name: locationName,
    inferredName: gpsLocation.inferredName,
    latitude: gpsLocation.latitude,
    longitude: gpsLocation.longitude,
    createdAt: now,
    updatedAt: now,
  };

  return {
    name: locationName,
    locationId: newLocation.id,
    locations: [newLocation, ...locations],
  };
}

function findMatchingLocation(
  gpsLocation: GpsLocation,
  locations: LocationPlace[],
) {
  let closestLocation: LocationPlace | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const location of locations) {
    const distance = getDistanceMeters(
      gpsLocation.latitude,
      gpsLocation.longitude,
      location.latitude,
      location.longitude,
    );

    if (
      distance <= LOCATION_NAME_TOLERANCE_METERS &&
      distance < closestDistance
    ) {
      closestLocation = location;
      closestDistance = distance;
    }
  }

  return closestLocation;
}

function getDistanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const earthRadiusMeters = 6371000;
  const deltaLatitude = degreesToRadians(latitudeB - latitudeA);
  const deltaLongitude = degreesToRadians(longitudeB - longitudeA);
  const haversine =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
    Math.cos(degreesToRadians(latitudeA)) *
      Math.cos(degreesToRadians(latitudeB)) *
      Math.sin(deltaLongitude / 2) *
      Math.sin(deltaLongitude / 2);

  return (
    earthRadiusMeters *
    2 *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function buildExpenseEvents({
  entries,
  carWashes,
  carInsuranceRecords,
  vehicleInspectionRecords,
  highwayPassRefills,
  otherExpenses,
}: {
  entries: Entry[];
  carWashes: CarWash[];
  carInsuranceRecords: CarInsuranceRecord[];
  vehicleInspectionRecords: VehicleInspectionRecord[];
  highwayPassRefills: HighwayPassRefill[];
  otherExpenses: OtherExpense[];
}) {
  const events: ExpenseEvent[] = [];

  for (const entry of entries) {
    if (entry.type !== "refuel" || entry.moneyPaid === null) continue;

    pushExpenseEvent(events, {
      id: `fuel_${entry.id}`,
      section: "fuel",
      amount: entry.moneyPaid,
      createdAt: entry.createdAt,
    });
  }

  for (const refill of highwayPassRefills) {
    pushExpenseEvent(events, {
      id: `highway_pass_${refill.id}`,
      section: "highway_pass",
      amount: refill.amount,
      createdAt: refill.createdAt,
    });
  }

  for (const carWash of carWashes) {
    pushExpenseEvent(events, {
      id: `car_wash_${carWash.id}`,
      section: "car_wash",
      amount: carWash.price,
      createdAt: carWash.createdAt,
    });
  }

  for (const record of carInsuranceRecords) {
    pushExpenseEvent(events, {
      id: `car_insurance_${record.id}`,
      section: "car_insurance",
      amount: record.price,
      createdAt: record.updatedAt,
    });
  }

  for (const record of vehicleInspectionRecords) {
    pushExpenseEvent(events, {
      id: `vehicle_inspection_${record.id}`,
      section: "vehicle_inspection",
      amount: record.cost,
      createdAt: record.updatedAt,
    });
  }

  for (const expense of otherExpenses) {
    pushExpenseEvent(events, {
      id: `other_${expense.id}`,
      section: "other",
      item: expense.item,
      amount: expense.cost,
      createdAt: expense.createdAt,
    });
  }

  return events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function buildDistanceEvents(entries: Entry[]) {
  const events: DistanceEvent[] = [];

  for (const entry of entries) {
    pushDistanceEvent(events, {
      id: `distance_${entry.id}`,
      distance: entry.distanceSinceLastEntry,
      createdAt: entry.createdAt,
    });
  }

  return events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function buildFuelEvents(entries: Entry[]) {
  const events: FuelEvent[] = [];

  for (const entry of entries) {
    if (entry.type !== "refuel") continue;

    pushFuelEvent(events, {
      id: `fuel_volume_${entry.id}`,
      volumeFilled: entry.amountAdded,
      moneyPaid: entry.moneyPaid,
      createdAt: entry.createdAt,
    });
  }

  return events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function pushExpenseEvent(
  events: ExpenseEvent[],
  event: {
    id: string;
    section: ExpenseSection;
    item?: string | null;
    amount: number;
    createdAt: string;
  },
) {
  if (!Number.isFinite(event.amount) || event.amount <= 0) return;

  const date = new Date(event.createdAt);
  if (Number.isNaN(date.getTime())) return;

  events.push({
    id: event.id,
    section: event.section,
    item: event.item ?? null,
    amount: roundTo2(event.amount),
    createdAt: event.createdAt,
    monthKey: getMonthKey(date),
    yearKey: getYearKey(date),
    dayKey: getDayKey(date),
  });
}

function pushFuelEvent(
  events: FuelEvent[],
  event: {
    id: string;
    volumeFilled: number | null;
    moneyPaid: number | null;
    createdAt: string;
  },
) {
  const hasVolume =
    event.volumeFilled !== null &&
    Number.isFinite(event.volumeFilled) &&
    event.volumeFilled > 0;
  const hasMoney =
    event.moneyPaid !== null &&
    Number.isFinite(event.moneyPaid) &&
    event.moneyPaid >= 0;

  if (!hasVolume && !hasMoney) return;

  const date = new Date(event.createdAt);
  if (Number.isNaN(date.getTime())) return;

  events.push({
    id: event.id,
    volumeFilled: hasVolume ? roundTo2(event.volumeFilled ?? 0) : 0,
    moneyPaid: hasMoney ? roundTo2(event.moneyPaid ?? 0) : null,
    createdAt: event.createdAt,
    monthKey: getMonthKey(date),
    yearKey: getYearKey(date),
    dayKey: getDayKey(date),
  });
}

function pushDistanceEvent(
  events: DistanceEvent[],
  event: {
    id: string;
    distance: number | null;
    createdAt: string;
  },
) {
  if (
    event.distance === null ||
    !Number.isFinite(event.distance) ||
    event.distance <= 0
  ) {
    return;
  }

  const date = new Date(event.createdAt);
  if (Number.isNaN(date.getTime())) return;

  events.push({
    id: event.id,
    distance: roundTo2(event.distance),
    createdAt: event.createdAt,
    monthKey: getMonthKey(date),
    yearKey: getYearKey(date),
    dayKey: getDayKey(date),
  });
}

function getReportDateOptions(
  expenseEvents: ExpenseEvent[],
  distanceEvents: DistanceEvent[],
  fuelEvents: FuelEvent[],
  period: ReportPeriod,
) {
  const keys = new Set<string>();
  const now = new Date();
  keys.add(period === "monthly" ? getMonthKey(now) : getYearKey(now));

  for (const event of expenseEvents) {
    keys.add(period === "monthly" ? event.monthKey : event.yearKey);
  }

  for (const event of distanceEvents) {
    keys.add(period === "monthly" ? event.monthKey : event.yearKey);
  }

  for (const event of fuelEvents) {
    keys.add(period === "monthly" ? event.monthKey : event.yearKey);
  }

  return Array.from(keys)
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({
      key,
      label: formatReportPeriodTitle(period, key),
      amount: sumExpenses(
        expenseEvents.filter((event) =>
          isEventInReportPeriod(event, period, key),
        ),
      ),
    }));
}

function buildReportSummary(
  expenseEvents: ExpenseEvent[],
  distanceEvents: DistanceEvent[],
  fuelEvents: FuelEvent[],
  period: ReportPeriod,
  periodKey: string,
) {
  const periodExpenseEvents = expenseEvents.filter((event) =>
    isEventInReportPeriod(event, period, periodKey),
  );
  const periodDistanceEvents = distanceEvents.filter((event) =>
    isEventInReportPeriod(event, period, periodKey),
  );
  const periodFuelEvents = fuelEvents.filter((event) =>
    isEventInReportPeriod(event, period, periodKey),
  );
  const sectionRows = EXPENSE_SECTION_ORDER.map((section) => ({
    key: section,
    label: EXPENSE_SECTION_LABELS[section],
    amount: sumExpenses(
      periodExpenseEvents.filter((event) => event.section === section),
    ),
  }));
  const fuelTotal = sumExpenses(
    periodExpenseEvents.filter((event) => event.section === "fuel"),
  );
  const totalDistance = sumDistance(periodDistanceEvents);
  const fuelVolumeFilled = sumFuelVolume(periodFuelEvents);
  const pricedFuelVolume = sumPricedFuelVolume(periodFuelEvents);
  const pricedFuelTotal = sumPricedFuelCost(periodFuelEvents);

  return {
    total: sumExpenses(periodExpenseEvents),
    sectionRows,
    otherExpenseRows: buildOtherExpenseRows(periodExpenseEvents),
    dateRows: buildReportDateRows(periodExpenseEvents, period, periodKey),
    totalDistance,
    fuelTotal,
    fuelVolumeFilled,
    fuelCostPerUnit:
      pricedFuelVolume > 0 ? roundTo4(pricedFuelTotal / pricedFuelVolume) : null,
    fuelCostPerDistance:
      totalDistance > 0 ? roundTo4(fuelTotal / totalDistance) : null,
    distanceRows: buildReportDistanceRows(
      periodDistanceEvents,
      period,
      periodKey,
    ),
  };
}

function buildOtherExpenseRows(events: ExpenseEvent[]) {
  const rowsByItem = new Map<
    string,
    {
      label: string;
      amount: number;
    }
  >();

  for (const event of events) {
    if (event.section !== "other") continue;

    const label = normalizeOtherExpenseItemLabel(event.item);
    const key = label.toLocaleLowerCase();
    const currentRow = rowsByItem.get(key);

    rowsByItem.set(key, {
      label: currentRow?.label ?? label,
      amount: roundTo2((currentRow?.amount ?? 0) + event.amount),
    });
  }

  return Array.from(rowsByItem.entries())
    .map(([key, row]) => ({
      key,
      label: row.label,
      amount: row.amount,
    }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

function buildReportDateRows(
  events: ExpenseEvent[],
  period: ReportPeriod,
  periodKey: string,
) {
  if (period === "yearly") {
    return SHORT_MONTH_NAMES.map((label, index) => {
      const monthKey = `${periodKey}-${String(index + 1).padStart(2, "0")}`;

      return {
        key: monthKey,
        label,
        amount: sumExpenses(
          events.filter((event) => event.monthKey === monthKey),
        ),
      };
    });
  }

  const dayKeys = Array.from(new Set(events.map((event) => event.dayKey))).sort(
    (a, b) => a.localeCompare(b),
  );

  return dayKeys.map((dayKey) => ({
    key: dayKey,
    label: formatDayKey(dayKey),
    amount: sumExpenses(events.filter((event) => event.dayKey === dayKey)),
  }));
}

function buildReportDistanceRows(
  events: DistanceEvent[],
  period: ReportPeriod,
  periodKey: string,
) {
  if (period === "yearly") {
    return SHORT_MONTH_NAMES.map((label, index) => {
      const monthKey = `${periodKey}-${String(index + 1).padStart(2, "0")}`;

      return {
        key: monthKey,
        label,
        distance: sumDistance(
          events.filter((event) => event.monthKey === monthKey),
        ),
      };
    });
  }

  const dayKeys = Array.from(new Set(events.map((event) => event.dayKey))).sort(
    (a, b) => a.localeCompare(b),
  );

  return dayKeys.map((dayKey) => ({
    key: dayKey,
    label: formatDayKey(dayKey),
    distance: sumDistance(events.filter((event) => event.dayKey === dayKey)),
  }));
}

function isEventInReportPeriod(
  event: ExpenseEvent | DistanceEvent | FuelEvent,
  period: ReportPeriod,
  periodKey: string,
) {
  return period === "monthly"
    ? event.monthKey === periodKey
    : event.yearKey === periodKey;
}

function sumExpenses(events: ExpenseEvent[]) {
  return roundTo2(events.reduce((sum, event) => sum + event.amount, 0));
}

function sumDistance(events: DistanceEvent[]) {
  return roundTo2(events.reduce((sum, event) => sum + event.distance, 0));
}

function sumFuelVolume(events: FuelEvent[]) {
  return roundTo2(events.reduce((sum, event) => sum + event.volumeFilled, 0));
}

function sumPricedFuelVolume(events: FuelEvent[]) {
  return roundTo2(
    events.reduce((sum, event) => {
      if (event.moneyPaid === null || event.volumeFilled <= 0) return sum;
      return sum + event.volumeFilled;
    }, 0),
  );
}

function sumPricedFuelCost(events: FuelEvent[]) {
  return roundTo2(
    events.reduce((sum, event) => {
      if (event.moneyPaid === null || event.volumeFilled <= 0) return sum;
      return sum + event.moneyPaid;
    }, 0),
  );
}

function sumReportRows(rows: ReportAmountRow[]) {
  return roundTo2(rows.reduce((sum, row) => sum + row.amount, 0));
}

function sumReportDistanceRows(rows: ReportDistanceRow[]) {
  return roundTo2(rows.reduce((sum, row) => sum + row.distance, 0));
}

function formatMoney(amount: number, currency: string) {
  return `${roundTo2(amount)} ${currency}`.trim();
}

function formatMoneyPerDistance(
  amount: number | null,
  currency: string,
  distanceUnit: DistanceUnit,
) {
  if (amount === null) return "Not available";
  return `${`${roundTo4(amount)} ${currency}`.trim()}/${formatDistanceUnitLabel(
    distanceUnit,
  )}`;
}

function formatMoneyPerFuelUnit(
  amount: number | null,
  currency: string,
  fuelVolumeUnit: FuelVolumeUnit,
) {
  if (amount === null) return "Not available";
  return `${`${roundTo4(amount)} ${currency}`.trim()}/${formatFuelVolumeUnitShortLabel(
    fuelVolumeUnit,
  )}`;
}

function formatFuelVolumeValue(
  amount: number,
  fuelVolumeUnit: FuelVolumeUnit,
) {
  return `${roundTo2(amount)} ${formatFuelVolumeUnitShortLabel(
    fuelVolumeUnit,
  )}`;
}

function normalizeOtherExpenseItemLabel(item: string | null) {
  const label = item?.trim().replace(/\s+/g, " ");
  return label || "Uncategorized";
}

function formatMoneyWithPercent(amount: number, currency: string, total: number) {
  return `${formatMoney(amount, currency)} (${formatPercentOfTotal(
    amount,
    total,
  )})`;
}

function formatDistanceWithPercent(
  distance: number,
  distanceUnit: DistanceUnit,
  total: number,
) {
  return `${formatDistanceValue(distance, distanceUnit)} (${formatPercentOfTotal(
    distance,
    total,
  )})`;
}

function formatPercentOfTotal(amount: number, total: number) {
  if (total <= 0) return "0%";
  return `${roundTo2((amount / total) * 100)}%`;
}

function formatReportPeriodTitle(period: ReportPeriod, key: string | null) {
  if (!key) return "Selected period";

  if (period === "yearly") {
    return key;
  }

  const [year, month] = key.split("-");
  const monthIndex = Number(month) - 1;
  const monthLabel = MONTH_NAMES[monthIndex] ?? month;
  return `${monthLabel} ${year}`;
}

function formatDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split("-");
  const yearNumber = Number(year);
  const monthIndex = Number(month) - 1;
  const dayNumber = Number(day);
  const monthLabel = SHORT_MONTH_NAMES[monthIndex] ?? month;
  const date = new Date(yearNumber, monthIndex, dayNumber);
  const weekdayLabel =
    date.getFullYear() === yearNumber &&
    date.getMonth() === monthIndex &&
    date.getDate() === dayNumber
      ? WEEKDAY_NAMES[date.getDay()]
      : null;

  return weekdayLabel
    ? `${monthLabel} ${dayNumber}, ${weekdayLabel}`
    : `${monthLabel} ${dayNumber}`;
}

function normalizeDateInput(value: string) {
  const date = parseDateInput(value);
  if (!date) return null;
  return formatDateInput(date);
}

function parseDateInput(value: string | null) {
  if (!value) return null;

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateForDisplay(value: string) {
  const date = parseDateInput(value);
  if (!date) return "Not set";
  return date.toLocaleDateString();
}

function getDueDateStatus(value: string | null): DueDateStatus {
  const dueDate = parseDateInput(value);
  if (!dueDate) return "none";

  const today = startOfLocalDay(new Date());
  const due = startOfLocalDay(dueDate);
  const daysUntilDue = Math.floor(
    (due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (daysUntilDue <= 0) return "due";
  if (daysUntilDue <= 7) return "upcoming";
  return "none";
}

function getDueDateWarningMessage(
  label: string,
  value: string | null,
  status: DueDateStatus,
) {
  if (status === "none") return null;

  const dueDate = value ? formatDateForDisplay(value) : "the saved due date";

  if (status === "due") {
    return `${label} is due or overdue as of ${dueDate}. Update its next due date to clear this warning.`;
  }

  return `${label} is due within one week on ${dueDate}.`;
}

function formatDueDateStatus(status: DueDateStatus) {
  if (status === "due") return "Due now";
  if (status === "upcoming") return "Due within 7 days";
  return "Not due soon";
}

function getEngineOilUpcomingThreshold(distanceUnit: DistanceUnit) {
  if (distanceUnit === "miles") {
    return roundTo2(ENGINE_OIL_UPCOMING_THRESHOLD_KM * KM_TO_MILES);
  }

  return ENGINE_OIL_UPCOMING_THRESHOLD_KM;
}

function formatEngineOilThreshold(distanceUnit: DistanceUnit) {
  const threshold = getEngineOilUpcomingThreshold(distanceUnit);
  return `${threshold} ${formatDistanceUnitLabel(distanceUnit)}`;
}

function getEngineOilDueSoonMessage(distanceUnit: DistanceUnit) {
  return `Engine oil change is due within ${formatEngineOilThreshold(
    distanceUnit,
  )}.`;
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getYearKey(date: Date) {
  return String(date.getFullYear());
}

function getMonthKey(date: Date) {
  return `${getYearKey(date)}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getDayKey(date: Date) {
  return `${getMonthKey(date)}-${String(date.getDate()).padStart(2, "0")}`;
}
