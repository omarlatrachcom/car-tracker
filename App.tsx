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
  DistanceUnit,
  Entry,
  EntryType,
  FuelStateMode,
  FuelVolumeUnit,
  GoogleDriveUser,
  LocationLookupTarget,
  RefuelIntervalMetric,
  RefuelResolution,
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

export default function App() {
  const [appData, setAppData] = useState<AppData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [locationLookupTarget, setLocationLookupTarget] =
    useState<LocationLookupTarget>(null);
  const [driveUser, setDriveUser] = useState<GoogleDriveUser | null>(null);
  const [globalWarningMessage, setGlobalWarningMessage] = useState<
    string | null
  >(null);

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

  const existingCar = appData?.cars[0] ?? null;

  const carEntries = useMemo(() => {
    if (!appData || !existingCar) return [];
    return appData.entries
      .filter((entry) => entry.carId === existingCar.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [appData, existingCar]);

  const latestEntry = carEntries[0] ?? null;
  const currentOdometer = latestEntry?.odometer ?? null;

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

  useEffect(() => {
    setGlobalWarningMessage(
      isEngineOilChangeOverdue ? ENGINE_OIL_OVERDUE_MESSAGE : null,
    );
  }, [isEngineOilChangeOverdue]);

  useEffect(() => {
    if (!existingCar || existingCar.engineOilNextDueOdometer === null) {
      setEngineOilNextDueOdometerInput("");
      return;
    }

    setEngineOilNextDueOdometerInput(
      String(existingCar.engineOilNextDueOdometer),
    );
  }, [existingCar?.id, existingCar?.engineOilNextDueOdometer]);

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
      cars: [newCar],
      entries: [],
    });

    await saveAppData(nextData);

    setName("");
    setFuelType("");
    setDistanceUnit("km");
    setCurrency("");
    setFuelVolumeUnit("liters");
    setTankCapacity("");
    setFuelStateMode("percent");
  }

  function openReadingForm() {
    setActiveForm("reading");
    setReadingOdometer(latestEntry ? String(latestEntry.odometer) : "");
    setReadingTankState(latestEntry ? String(latestEntry.tankState) : "");
    setReadingLocation("");
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
  }

  async function handleUseCurrentLocation(target: EntryType) {
    setLocationLookupTarget(target);

    try {
      const locationText = await getCurrentLocationText({ showAlerts: true });

      if (!locationText) return;

      if (target === "reading") {
        setReadingLocation(locationText);
      } else {
        setRefuelLocation(locationText);
      }
    } finally {
      setLocationLookupTarget(null);
    }
  }

  async function resolveLocationForSave(target: EntryType, value: string) {
    const trimmedLocation = value.trim();
    if (trimmedLocation) return trimmedLocation;

    setLocationLookupTarget(target);

    try {
      return await getCurrentLocationText({ showAlerts: false });
    } finally {
      setLocationLookupTarget(null);
    }
  }

  async function getCurrentLocationText(options: { showAlerts: boolean }) {
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

      return (
        formatGeocodedLocation(address) ??
        `${roundTo4(position.coords.latitude)}, ${roundTo4(
          position.coords.longitude,
        )}`
      );
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
    const location = await resolveLocationForSave("reading", readingLocation);

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
      location,
      createdAt: now,
      updatedAt: now,
    };

    const nextData = normalizeAppData({
      ...appData,
      updatedAt: now,
      cars: appData.cars.map((car) =>
        car.id === existingCar.id ? { ...car, updatedAt: now } : car,
      ),
      entries: [newEntry, ...appData.entries],
    });

    await saveAppData(nextData);
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
    const location = await resolveLocationForSave("refuel", refuelLocation);

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
      location,
      createdAt: now,
      updatedAt: now,
    };

    const nextData = normalizeAppData({
      ...appData,
      updatedAt: now,
      cars: appData.cars.map((car) =>
        car.id === existingCar.id ? { ...car, updatedAt: now } : car,
      ),
      entries: [newEntry, ...appData.entries],
    });

    await saveAppData(nextData);
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

  async function handleDeleteAllLocalData() {
    if (!appData) return;

    Alert.alert(
      "Delete local data",
      "This will clear the car and all history. If Google Drive is connected, the empty dataset will be synced too. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
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
            closeForms();
          },
        },
      ],
    );
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

  if (!existingCar) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Create Your First Car</Text>
          <Text style={styles.subtitle}>
            Local save works first. When Google Drive is connected, every save
            syncs to car-tracker-sync.json automatically.
          </Text>

          <SyncCard
            driveUser={driveUser}
            sync={appData.sync}
            statusLabel={driveUser ? "Connected" : "Not connected"}
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

  const hasGlobalWarning = globalWarningMessage !== null;

  return (
    <SafeAreaView
      style={[styles.safeArea, hasGlobalWarning && styles.safeAreaWarning]}
    >
      <ScrollView
        style={hasGlobalWarning ? styles.warningBackground : undefined}
        contentContainerStyle={[
          styles.container,
          hasGlobalWarning && styles.containerWarning,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, hasGlobalWarning && styles.titleOnWarning]}>
          {existingCar.name}
        </Text>
        <Text
          style={[styles.subtitle, hasGlobalWarning && styles.subtitleOnWarning]}
        >
          Every local save syncs to Google Drive automatically when connected.
        </Text>

        {globalWarningMessage ? (
          <View style={styles.globalWarningBanner}>
            <Text style={styles.globalWarningText}>
              {globalWarningMessage}
            </Text>
          </View>
        ) : null}

        <SyncCard
          driveUser={driveUser}
          sync={appData.sync}
          statusLabel={driveUser ? "Connected" : "Local only"}
          showLastSource
          isSaving={isSaving}
          isDriveSyncing={isDriveSyncing}
          onConnect={handleConnectGoogleDrive}
          onSyncNow={handleSyncNow}
          onDisconnect={handleDisconnectGoogleDrive}
        />

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Car Setup</Text>
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
              {latestEntry.location ? (
                <Text style={styles.cardLine}>
                  Location: {latestEntry.location}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.cardLine}>
              No readings yet. Add the first reading before the first refuel.
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Engine Oil Change Reminder</Text>
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
                : styles.okStatusText,
            ]}
          >
            Status:{" "}
            {existingCar.engineOilNextDueOdometer === null
              ? "No reminder set"
              : isEngineOilChangeOverdue
                ? "Overdue"
                : "Not overdue"}
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
        </View>

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
                  {entry.location ? (
                    <Text style={styles.historyLine}>
                      Location: {entry.location}
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

        <Pressable
          style={[
            styles.dangerButton,
            (isSaving || isDriveSyncing) && styles.buttonDisabled,
          ]}
          onPress={handleDeleteAllLocalData}
          disabled={isSaving || isDriveSyncing}
        >
          <Text style={styles.dangerButtonText}>
            {isSaving || isDriveSyncing ? "Working..." : "Delete Local Data"}
          </Text>
        </Pressable>

        <StatusBar style={hasGlobalWarning ? "light" : "auto"} />
      </ScrollView>
    </SafeAreaView>
  );
}
