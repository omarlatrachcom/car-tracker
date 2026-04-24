import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type DistanceUnit = "km" | "miles";
type FuelVolumeUnit = "liters" | "us_gallons" | "imperial_gallons";
type FuelStateMode = "percent" | "volume";
type EntryType = "reading" | "refuel";
type ActiveForm = "none" | "reading" | "refuel";

type Car = {
  id: string;
  name: string;
  fuelType: string;
  distanceUnit: DistanceUnit;
  currency: string;
  fuelVolumeUnit: FuelVolumeUnit;
  tankCapacity: number;
  fuelStateMode: FuelStateMode;
  createdAt: string;
  updatedAt: string;
};

type Entry = {
  id: string;
  carId: string;
  type: EntryType;
  odometer: number;
  distanceSinceLastEntry: number | null;
  tankState: number;
  amountAdded: number | null;
  pricePerUnit: number | null;
  moneyPaid: number | null;
  createdAt: string;
  updatedAt: string;
};

type SyncState = {
  lastDriveSyncAt: string | null;
  lastDriveFileId: string | null;
  lastSyncError: string | null;
  lastSyncSource: "local" | "drive" | null;
  datasetResetAt: string | null;
};

type AppData = {
  version: 1;
  updatedAt: string;
  cars: Car[];
  entries: Entry[];
  sync: SyncState;
};

type RefuelResolution = {
  providedCount: number;
  amountAdded: number | null;
  pricePerUnit: number | null;
  moneyPaid: number | null;
};

type RefuelIntervalMetric = {
  entryId: string;
  distanceSincePreviousRefuel: number;
  fuelUsed: number;
  consumptionPer100Distance: number | null;
};

type GoogleDriveUser = {
  email: string;
  name: string | null;
};

type DriveFileRecord = {
  id: string;
  name: string;
  modifiedTime?: string;
};

const STORAGE_KEY = "car-tracker-local-data";
const DRIVE_SYNC_FILE_NAME = "car-tracker-sync.json";
const DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? "";
const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? "";

export default function App() {
  const [appData, setAppData] = useState<AppData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDriveSyncing, setIsDriveSyncing] = useState(false);
  const [driveUser, setDriveUser] = useState<GoogleDriveUser | null>(null);

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

  const [refuelOdometer, setRefuelOdometer] = useState("");
  const [refuelAmountAdded, setRefuelAmountAdded] = useState("");
  const [refuelPricePerUnit, setRefuelPricePerUnit] = useState("");
  const [refuelMoneyPaid, setRefuelMoneyPaid] = useState("");

  useEffect(() => {
    GoogleSignin.configure({
      scopes: ["email", "profile", DRIVE_APPDATA_SCOPE],
      offlineAccess: false,
      ...(GOOGLE_WEB_CLIENT_ID ? { webClientId: GOOGLE_WEB_CLIENT_ID } : {}),
      ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : {}),
    });

    void bootstrapApp();
  }, []);

  async function bootstrapApp() {
    await loadAppData();
    await restoreGoogleSessionIfPossible();
  }

  async function loadAppData() {
    try {
      setIsLoading(true);

      const raw = await AsyncStorage.getItem(STORAGE_KEY);

      if (!raw) {
        setAppData(createEmptyAppData());
        return;
      }

      const parsed = JSON.parse(raw) as Partial<AppData>;
      setAppData(normalizeAppData(parsed));
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
    const normalized = normalizeAppData(nextData);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
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
      if (!GoogleSignin.hasPreviousSignIn()) return;
      const silentResult = await GoogleSignin.signInSilently();
      const extractedUser = extractGoogleUser(silentResult);
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

      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });

      const signInResult = await GoogleSignin.signIn();
      const extractedUser = extractGoogleUser(signInResult);

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
      await GoogleSignin.signOut();
      setDriveUser(null);
    } catch (error) {
      console.error("Google sign-out failed:", error);
      Alert.alert(
        "Google Drive error",
        "Could not sign out from Google Drive.",
      );
    }
  }

  async function getDriveAccessToken() {
    await GoogleSignin.addScopes({ scopes: [DRIVE_APPDATA_SCOPE] });
    const tokens = await GoogleSignin.getTokens();

    if (!tokens?.accessToken) {
      throw new Error("Google Drive access token is missing.");
    }

    return tokens.accessToken;
  }

  async function findDriveSyncFile(accessToken: string) {
    const q = encodeURIComponent(`name='${DRIVE_SYNC_FILE_NAME}'`);
    const url =
      `https://www.googleapis.com/drive/v3/files` +
      `?spaces=appDataFolder&pageSize=1&q=${q}` +
      `&fields=files(id,name,modifiedTime)`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Drive file search failed (${response.status}).`);
    }

    const json = (await response.json()) as { files?: DriveFileRecord[] };
    return json.files?.[0] ?? null;
  }

  async function downloadDriveSyncFile(accessToken: string, fileId: string) {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Drive download failed (${response.status}).`);
    }

    const json = (await response.json()) as Partial<AppData>;
    return normalizeAppData(json);
  }

  async function uploadDriveSyncFile(
    accessToken: string,
    payload: AppData,
    fileId: string | null,
  ) {
    const boundary = `cartracker_${Date.now()}`;
    const metadata = fileId
      ? {
          name: DRIVE_SYNC_FILE_NAME,
          mimeType: "application/json",
        }
      : {
          name: DRIVE_SYNC_FILE_NAME,
          parents: ["appDataFolder"],
          mimeType: "application/json",
        };

    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(payload)}\r\n` +
      `--${boundary}--`;

    const method = fileId ? "PATCH" : "POST";
    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,modifiedTime`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Drive upload failed (${response.status}): ${errorText || "unknown error"}`,
      );
    }

    const json = (await response.json()) as {
      id: string;
      modifiedTime?: string;
    };

    return json;
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
  }

  function closeForms() {
    setActiveForm("none");
    setReadingOdometer("");
    setReadingTankState("");
    setRefuelOdometer("");
    setRefuelAmountAdded("");
    setRefuelPricePerUnit("");
    setRefuelMoneyPaid("");
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

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Google Drive Sync</Text>
            <Text style={styles.cardLine}>
              Status: {driveUser ? "Connected" : "Not connected"}
            </Text>
            {driveUser && (
              <Text style={styles.cardLine}>Account: {driveUser.email}</Text>
            )}
            <Text style={styles.cardLine}>File: {DRIVE_SYNC_FILE_NAME}</Text>
            <Text style={styles.cardLine}>
              Last sync: {formatNullableDateTime(appData.sync.lastDriveSyncAt)}
            </Text>
            {appData.sync.lastSyncError ? (
              <Text style={styles.errorText}>
                Last sync error: {appData.sync.lastSyncError}
              </Text>
            ) : null}

            <View style={styles.actionRow}>
              {!driveUser ? (
                <Pressable
                  style={[styles.primaryButton, styles.flexButton]}
                  onPress={handleConnectGoogleDrive}
                  disabled={isDriveSyncing || isSaving}
                >
                  <Text style={styles.primaryButtonText}>
                    {isDriveSyncing ? "Connecting..." : "Connect Google Drive"}
                  </Text>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    style={[styles.primaryButton, styles.flexButton]}
                    onPress={handleSyncNow}
                    disabled={isDriveSyncing || isSaving}
                  >
                    <Text style={styles.primaryButtonText}>
                      {isDriveSyncing ? "Syncing..." : "Sync Now"}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[styles.secondaryButton, styles.flexButton]}
                    onPress={handleDisconnectGoogleDrive}
                    disabled={isDriveSyncing || isSaving}
                  >
                    <Text style={styles.secondaryButtonText}>Disconnect</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{existingCar.name}</Text>
        <Text style={styles.subtitle}>
          Every local save syncs to Google Drive automatically when connected.
        </Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Google Drive Sync</Text>
          <Text style={styles.cardLine}>
            Status: {driveUser ? "Connected" : "Local only"}
          </Text>
          {driveUser && (
            <Text style={styles.cardLine}>Account: {driveUser.email}</Text>
          )}
          <Text style={styles.cardLine}>File: {DRIVE_SYNC_FILE_NAME}</Text>
          <Text style={styles.cardLine}>
            Last sync: {formatNullableDateTime(appData.sync.lastDriveSyncAt)}
          </Text>
          <Text style={styles.cardLine}>
            Last source: {appData.sync.lastSyncSource ?? "None"}
          </Text>
          {appData.sync.lastSyncError ? (
            <Text style={styles.errorText}>
              Last sync error: {appData.sync.lastSyncError}
            </Text>
          ) : null}

          <View style={styles.actionRow}>
            {!driveUser ? (
              <Pressable
                style={[styles.primaryButton, styles.flexButton]}
                onPress={handleConnectGoogleDrive}
                disabled={isSaving || isDriveSyncing}
              >
                <Text style={styles.primaryButtonText}>
                  {isDriveSyncing ? "Connecting..." : "Connect Google Drive"}
                </Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  style={[styles.primaryButton, styles.flexButton]}
                  onPress={handleSyncNow}
                  disabled={isSaving || isDriveSyncing}
                >
                  <Text style={styles.primaryButtonText}>
                    {isDriveSyncing ? "Syncing..." : "Sync Now"}
                  </Text>
                </Pressable>

                <Pressable
                  style={[styles.secondaryButton, styles.flexButton]}
                  onPress={handleDisconnectGoogleDrive}
                  disabled={isSaving || isDriveSyncing}
                >
                  <Text style={styles.secondaryButtonText}>Disconnect</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

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
            </>
          ) : (
            <Text style={styles.cardLine}>
              No readings yet. Add the first reading before the first refuel.
            </Text>
          )}
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
                  (isSaving || isDriveSyncing) && styles.buttonDisabled,
                ]}
                onPress={handleSaveReading}
                disabled={isSaving || isDriveSyncing}
              >
                <Text style={styles.primaryButtonText}>
                  {isSaving || isDriveSyncing ? "Saving..." : "Save Reading"}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.secondaryButton, styles.flexButton]}
                onPress={closeForms}
                disabled={isSaving || isDriveSyncing}
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
                  (isSaving || isDriveSyncing) && styles.buttonDisabled,
                ]}
                onPress={handleSaveRefuel}
                disabled={isSaving || isDriveSyncing}
              >
                <Text style={styles.primaryButtonText}>
                  {isSaving || isDriveSyncing ? "Saving..." : "Save Refuel"}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.secondaryButton, styles.flexButton]}
                onPress={closeForms}
                disabled={isSaving || isDriveSyncing}
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

        <StatusBar style="auto" />
      </ScrollView>
    </SafeAreaView>
  );
}

type OptionButtonProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

function OptionButton({ label, selected, onPress }: OptionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.optionButton, selected && styles.optionButtonSelected]}
    >
      <Text
        style={[
          styles.optionButtonText,
          selected && styles.optionButtonTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function extractGoogleUser(response: unknown): GoogleDriveUser | null {
  if (!isRecord(response)) return null;

  const data = isRecord(response.data) ? response.data : null;
  const rootUser = isRecord(response.user) ? response.user : null;
  const dataUser = data && isRecord(data.user) ? data.user : null;
  const rawUser = dataUser ?? rootUser;

  if (!rawUser) return null;

  const email = typeof rawUser.email === "string" ? rawUser.email : null;
  const name = typeof rawUser.name === "string" ? rawUser.name : null;

  if (!email) return null;

  return { email, name };
}

function createEmptySyncState(): SyncState {
  return {
    lastDriveSyncAt: null,
    lastDriveFileId: null,
    lastSyncError: null,
    lastSyncSource: null,
    datasetResetAt: null,
  };
}

function createEmptyAppData(): AppData {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    cars: [],
    entries: [],
    sync: createEmptySyncState(),
  };
}

function normalizeAppData(data: Partial<AppData>): AppData {
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

function mergeAppData(localData: AppData, remoteData: AppData) {
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

  const merged = normalizeAppData({
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

  return merged;
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

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseDecimal(value: string) {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return NaN;
  return Number(trimmed);
}

function roundTo2(value: number) {
  return Math.round(value * 100) / 100;
}

function roundTo4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function isPositiveNumber(value: number) {
  return Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function resolveRefuelValues(
  amountInput: number,
  priceInput: number,
  moneyInput: number,
): RefuelResolution {
  const hasAmount = isPositiveNumber(amountInput);
  const hasPrice = isPositiveNumber(priceInput);
  const hasMoney = isNonNegativeNumber(moneyInput);

  let resolvedAmount: number | null = null;
  let resolvedPrice: number | null = null;
  let resolvedMoney: number | null = null;

  if (hasAmount) {
    resolvedAmount = roundTo2(amountInput);
  } else if (hasPrice && hasMoney && moneyInput > 0) {
    resolvedAmount = roundTo2(moneyInput / priceInput);
  }

  if (hasPrice) {
    resolvedPrice = roundTo4(priceInput);
  } else if (hasAmount && hasMoney && amountInput > 0) {
    resolvedPrice = roundTo4(moneyInput / amountInput);
  }

  if (hasMoney) {
    resolvedMoney = roundTo2(moneyInput);
  } else if (hasAmount && hasPrice) {
    resolvedMoney = roundTo2(amountInput * priceInput);
  }

  return {
    providedCount: [hasAmount, hasPrice, hasMoney].filter(Boolean).length,
    amountAdded: resolvedAmount,
    pricePerUnit: resolvedPrice,
    moneyPaid: resolvedMoney,
  };
}

function calculateTankStateAfterRefuel(
  currentTankState: number,
  amountAdded: number,
  car: Car,
) {
  if (car.fuelStateMode === "volume") {
    return roundTo2(Math.min(currentTankState + amountAdded, car.tankCapacity));
  }

  const addedPercent = (amountAdded / car.tankCapacity) * 100;
  return roundTo2(Math.min(currentTankState + addedPercent, 100));
}

function tankStateToVolume(tankState: number, car: Car) {
  if (car.fuelStateMode === "volume") {
    return tankState;
  }

  return (tankState / 100) * car.tankCapacity;
}

function computeRefuelMetrics(entriesDesc: Entry[], car: Car) {
  const entriesAsc = [...entriesDesc].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  const metrics: Record<string, RefuelIntervalMetric> = {};
  let previousRefuelIndex = -1;

  for (let i = 0; i < entriesAsc.length; i++) {
    const entry = entriesAsc[i];

    if (entry.type !== "refuel") continue;

    if (previousRefuelIndex === -1) {
      previousRefuelIndex = i;
      continue;
    }

    const previousRefuel = entriesAsc[previousRefuelIndex];

    let distance = 0;
    for (let j = previousRefuelIndex + 1; j <= i; j++) {
      distance += entriesAsc[j].distanceSinceLastEntry ?? 0;
    }

    const startFuelVolume = tankStateToVolume(previousRefuel.tankState, car);
    const addedVolume = entry.amountAdded ?? 0;
    const endFuelVolume = tankStateToVolume(entry.tankState, car);

    const fuelUsed = roundTo2(
      Math.max(startFuelVolume + addedVolume - endFuelVolume, 0),
    );

    const distanceRounded = roundTo2(distance);
    const consumption =
      distanceRounded > 0 ? roundTo2((fuelUsed / distanceRounded) * 100) : null;

    metrics[entry.id] = {
      entryId: entry.id,
      distanceSincePreviousRefuel: distanceRounded,
      fuelUsed,
      consumptionPer100Distance: consumption,
    };

    previousRefuelIndex = i;
  }

  return metrics;
}

function getTankStateValidationError(value: number, car: Car) {
  if (!Number.isFinite(value)) {
    return "Please enter a valid tank state.";
  }

  if (car.fuelStateMode === "percent") {
    if (value < 0 || value > 100) {
      return "Tank state in percent must be between 0 and 100.";
    }
    return null;
  }

  if (value < 0 || value > car.tankCapacity) {
    return `Tank state in ${formatFuelVolumeUnitShortLabel(
      car.fuelVolumeUnit,
    )} must be between 0 and ${car.tankCapacity}.`;
  }

  return null;
}

function getTankStateUnitLabel(car: Car) {
  if (car.fuelStateMode === "percent") return "%";
  return formatFuelVolumeUnitShortLabel(car.fuelVolumeUnit);
}

function getTankStatePlaceholder(car: Car) {
  if (car.fuelStateMode === "percent") return "Example: 60";
  return `Example: ${car.tankCapacity}`;
}

function formatDistanceUnitLabel(unit: DistanceUnit) {
  if (unit === "km") return "km";
  return "miles";
}

function formatFuelVolumeUnitShortLabel(unit: FuelVolumeUnit) {
  if (unit === "liters") return "L";
  if (unit === "us_gallons") return "US gal";
  return "Imp gal";
}

function formatFuelVolumeUnitFullLabel(unit: FuelVolumeUnit) {
  if (unit === "liters") return "Liters";
  if (unit === "us_gallons") return "US gallons";
  return "Imperial gallons";
}

function formatFuelStateModeLabel(mode: FuelStateMode) {
  if (mode === "percent") return "Percent";
  return "Volume";
}

function formatEntryType(type: EntryType) {
  if (type === "reading") return "Reading";
  return "Refuel";
}

function formatTankState(value: number, car: Car) {
  if (car.fuelStateMode === "percent") {
    return `${value}%`;
  }

  return `${value} ${formatFuelVolumeUnitShortLabel(car.fuelVolumeUnit)}`;
}

function formatDistanceValue(value: number | null, distanceUnit: DistanceUnit) {
  if (value === null) return "First entry";
  return `${value} ${formatDistanceUnitLabel(distanceUnit)}`;
}

function formatConsumptionValue(value: number | null, car: Car) {
  if (value === null) return "Not available";

  return `${value} ${formatFuelVolumeUnitShortLabel(
    car.fuelVolumeUnit,
  )}/100 ${formatDistanceUnitLabel(car.distanceUnit)}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatNullableDateTime(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f7f7",
  },
  centeredContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#555",
  },
  container: {
    flexGrow: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#555",
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  smallHint: {
    fontSize: 14,
    color: "#555",
    marginBottom: 14,
  },
  formGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  readonlyBox: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  readonlyValue: {
    fontSize: 16,
    color: "#111",
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  stackedOptions: {
    gap: 10,
  },
  optionButton: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d0d0d0",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  optionButtonSelected: {
    backgroundColor: "#1f6feb",
    borderColor: "#1f6feb",
  },
  optionButtonText: {
    color: "#222",
    fontWeight: "600",
  },
  optionButtonTextSelected: {
    color: "#fff",
  },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e4e4e4",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardLine: {
    fontSize: 16,
    marginBottom: 10,
    color: "#222",
  },
  errorText: {
    fontSize: 14,
    color: "#b42318",
    marginBottom: 10,
  },
  calculationBox: {
    backgroundColor: "#f3f6fb",
    borderWidth: 1,
    borderColor: "#d7e3f4",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  calculationTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
    color: "#1a1a1a",
  },
  calculationValue: {
    fontSize: 15,
    color: "#333",
  },
  historyItem: {
    borderTopWidth: 1,
    borderTopColor: "#ececec",
    paddingTop: 12,
    marginTop: 12,
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  historyLine: {
    fontSize: 15,
    color: "#333",
    marginBottom: 6,
  },
  primaryButton: {
    backgroundColor: "#111",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  flexButton: {
    flex: 1,
    marginTop: 0,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#e5e5e5",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#111",
    fontSize: 16,
    fontWeight: "700",
  },
  dangerButton: {
    backgroundColor: "#b42318",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  dangerButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
