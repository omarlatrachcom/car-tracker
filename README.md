# Car Tracker

A React Native portfolio app for tracking a car's fuel usage, odometer history, refuels, and consumption trends. The app stores data locally first and can sync the same dataset to the user's private Google Drive app data folder.

## Features

- Create a single car profile with fuel type, currency, distance unit, fuel volume unit, tank capacity, and tank state mode.
- Save odometer readings with the current tank state.
- Save refuels by entering any two of amount added, price per unit, and money paid.
- Automatically calculate missing refuel values and tank state after refuel.
- Review history for readings, refuels, distance crossed, fuel used, and consumption.
- View latest and average fuel consumption metrics.
- Persist data locally with AsyncStorage.
- Connect Google Drive for private app-data sync.

## Tech Stack

- Expo SDK 54
- React Native 0.81
- React 19
- TypeScript
- AsyncStorage
- React Native Google Sign-In
- EAS Build configuration

## Prerequisites

- Node.js LTS
- pnpm 10+
- Expo CLI through `pnpm exec expo`
- Android Studio for Android builds, or Xcode for iOS builds
- A Google OAuth client configured for Google Sign-In

This app uses native modules through `expo-dev-client`, so Google Sign-In requires a development build or a production build. Expo Go is not enough for the full Google Drive sign-in flow.

## Installation

Clone the repository and install dependencies:

```sh
git clone git@github.com:omarlatrachcom/car-tracker.git
cd car-tracker
pnpm install
```

Create a local environment file:

```sh
cp .env.example .env.local
```

Fill in your Google client IDs in `.env.local`:

```sh
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-ios-client-id.apps.googleusercontent.com
```

The `.env.local` file is intentionally ignored by Git. Values prefixed with `EXPO_PUBLIC_` are bundled into the app, so they are useful for keeping config out of the repository but should not be treated as private secrets.

## Running Locally

Start the Expo development server:

```sh
pnpm start
```

Run on Android:

```sh
pnpm run android
```

Run on iOS:

```sh
pnpm run ios
```

Run on web:

```sh
pnpm run web
```

If you change `.env.local`, restart the Expo server so the updated values are loaded.

## Building With EAS

Create a development build:

```sh
pnpm run eas:development:android
```

Create a preview Android APK:

```sh
pnpm run eas:preview:android
```

Create a production build:

```sh
pnpm run eas:production
```

## How To Use

1. Open the app and create your first car profile.
2. Choose distance and fuel units, then enter the tank capacity.
3. Add the first odometer reading and current tank state.
4. Use `Update Reading` to record later odometer and tank readings.
5. Use `Refuel` to record fuel purchases. Enter any two refuel values and the app calculates the third.
6. Review the history and fuel consumption cards to track usage over time.
7. Connect Google Drive to sync the local dataset to the app data folder.
8. Use `Sync Now` to manually merge local and Drive data.

## Google Drive Sync

The app requests the Google Drive `appdata` scope and stores a file named `car-tracker-sync.json` in the user's private app data folder. This keeps the sync file hidden from normal Drive browsing and scoped to this app.

Local saves always happen first. When Google Drive is connected, saves are synced after the local write. If Drive sync fails, the local data remains available and the app displays the last sync error.

## Project Structure

```text
App.tsx          Main app UI, local storage, calculations, and Drive sync
app.json         Expo app configuration
eas.json         EAS build profiles
index.ts         Expo root registration
.env.example     Safe environment variable template
.gitignore       Local, native, and secret file exclusions
```

## Validation

Run the TypeScript check:

```sh
pnpm run typecheck
```

## Notes

- Native folders, local environment files, build output, keystores, and dependency folders are ignored by Git.
- Google Sign-In config changes usually require rebuilding the native app.
- Keep release keystores and real environment files out of the repository.
