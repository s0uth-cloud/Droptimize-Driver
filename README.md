# Droptimize Mobile App

Droptimize is a courier management system designed to make it easier for courier company admins, like J&T Express, to track and manage their employees.

This repository is dedicated to the development of the **Droptimize mobile application for drivers**. The mobile application helps drivers find the most efficient route to deliver parcels.

## Prerequisites

- [Node.js](https://nodejs.org/en/download/current) (LTS version recommended)
- For Android Emulator: [Android Studio](https://developer.android.com/studio) with Android SDK
- For Physical Device: [Expo Go](https://expo.dev/go) app (supports Expo SDK 54)

## Setup Instructions

### Step 1: Install Dependencies

Open Terminal in the root directory (`Droptimize/`) and run:

```bash
npm install
```

### Step 2: Start the Development Server

```bash
npx expo start
```

### Step 3: Run the Application

Choose one of the following options:

#### Option A: Using Expo Go (Physical Device)

1. Install [Expo Go](https://expo.dev/go) on your Android device
2. Scan the QR code displayed in the terminal with the Expo Go app
3. The app will load on your device

**Note:** If you encounter issues, ensure you're using Expo Go version compatible with Expo SDK 54.

#### Option B: Using Android Emulator

1. Ensure Android Studio is installed with an Android Virtual Device (AVD) configured
2. Start your Android emulator
3. Press `a` in the terminal or run:
   ```bash
   npm run android
   ```
