import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEY } from "../constants";
import { createEmptyAppData, normalizeAppData } from "../data/appData";
import type { AppData } from "../types";

export async function loadLocalAppData() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return createEmptyAppData();
  }

  const parsed = JSON.parse(raw) as Partial<AppData>;
  return normalizeAppData(parsed);
}

export async function saveLocalAppData(nextData: AppData) {
  const normalized = normalizeAppData(nextData);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
