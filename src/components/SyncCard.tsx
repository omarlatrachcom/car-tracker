import { Pressable, Text, View } from "react-native";

import { DRIVE_SYNC_FILE_NAME } from "../constants";
import { styles } from "../styles";
import type { GoogleDriveUser, SyncState } from "../types";
import { formatNullableDateTime } from "../utils/formatters";

type SyncCardProps = {
  driveUser: GoogleDriveUser | null;
  sync: SyncState;
  statusLabel: string;
  showLastSource?: boolean;
  isSaving: boolean;
  isDriveSyncing: boolean;
  onConnect: () => void;
  onSyncNow: () => void;
  onDisconnect: () => void;
};

export function SyncCard({
  driveUser,
  sync,
  statusLabel,
  showLastSource = false,
  isSaving,
  isDriveSyncing,
  onConnect,
  onSyncNow,
  onDisconnect,
}: SyncCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Google Drive Sync</Text>
      <Text style={styles.cardLine}>Status: {statusLabel}</Text>
      {driveUser && (
        <Text style={styles.cardLine}>Account: {driveUser.email}</Text>
      )}
      <Text style={styles.cardLine}>File: {DRIVE_SYNC_FILE_NAME}</Text>
      <Text style={styles.cardLine}>
        Last sync: {formatNullableDateTime(sync.lastDriveSyncAt)}
      </Text>
      {showLastSource ? (
        <Text style={styles.cardLine}>
          Last source: {sync.lastSyncSource ?? "None"}
        </Text>
      ) : null}
      {sync.lastSyncError ? (
        <Text style={styles.errorText}>
          Last sync error: {sync.lastSyncError}
        </Text>
      ) : null}

      <View style={styles.actionRow}>
        {!driveUser ? (
          <Pressable
            style={[styles.primaryButton, styles.flexButton]}
            onPress={onConnect}
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
              onPress={onSyncNow}
              disabled={isSaving || isDriveSyncing}
            >
              <Text style={styles.primaryButtonText}>
                {isDriveSyncing ? "Syncing..." : "Sync Now"}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.secondaryButton, styles.flexButton]}
              onPress={onDisconnect}
              disabled={isSaving || isDriveSyncing}
            >
              <Text style={styles.secondaryButtonText}>Disconnect</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
