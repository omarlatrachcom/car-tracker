export const STORAGE_KEY = "car-tracker-local-data";
export const DRIVE_SYNC_FILE_NAME = "car-tracker-sync.json";
export const DRIVE_APPDATA_SCOPE =
  "https://www.googleapis.com/auth/drive.appdata";
export const ENGINE_OIL_OVERDUE_MESSAGE = "Engine oil change overdue.";

export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ?? "";
export const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? "";
