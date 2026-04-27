import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";

import {
  DRIVE_APPDATA_SCOPE,
  DRIVE_SYNC_FILE_NAME,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from "../constants";
import { normalizeAppData } from "../data/appData";
import type { AppData, DriveFileRecord, GoogleDriveUser } from "../types";
import { isRecord } from "../utils/object";

export { statusCodes };

export function configureGoogleSignIn() {
  GoogleSignin.configure({
    scopes: ["email", "profile", DRIVE_APPDATA_SCOPE],
    offlineAccess: false,
    ...(GOOGLE_WEB_CLIENT_ID ? { webClientId: GOOGLE_WEB_CLIENT_ID } : {}),
    ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : {}),
  });
}

export async function getPreviousGoogleDriveUser() {
  if (!GoogleSignin.hasPreviousSignIn()) return null;

  const silentResult = await GoogleSignin.signInSilently();
  return extractGoogleUser(silentResult);
}

export async function signInToGoogleDrive() {
  await GoogleSignin.hasPlayServices({
    showPlayServicesUpdateDialog: true,
  });

  const signInResult = await GoogleSignin.signIn();
  return extractGoogleUser(signInResult);
}

export async function signOutFromGoogleDrive() {
  await GoogleSignin.signOut();
}

export async function getDriveAccessToken() {
  await GoogleSignin.addScopes({ scopes: [DRIVE_APPDATA_SCOPE] });
  const tokens = await GoogleSignin.getTokens();

  if (!tokens?.accessToken) {
    throw new Error("Google Drive access token is missing.");
  }

  return tokens.accessToken;
}

export async function findDriveSyncFile(accessToken: string) {
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

export async function downloadDriveSyncFile(
  accessToken: string,
  fileId: string,
) {
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

export async function uploadDriveSyncFile(
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

  return (await response.json()) as {
    id: string;
    modifiedTime?: string;
  };
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
