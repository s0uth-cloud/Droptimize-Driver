# Droptimize - Complete Installation Guide 🚀

**Welcome!** This guide covers everything you need to know to get Droptimize installed and running, whether you're a developer setting up the project or a regular user just wanting to use the app.

---

## Table of Contents

1. [For Everyone: Prerequisites](#for-everyone-prerequisites)
2. [For Developers: Development Setup](#for-developers-development-setup)
3. [For Regular Users: Quick Start](#for-regular-users-quick-start)
4. [Running the Web Dashboard](#running-the-web-dashboard)
5. [Installing the Mobile App](#installing-the-mobile-app)
6. [Troubleshooting](#troubleshooting)

---

## For Everyone: Prerequisites

Before starting, make sure you have these basic requirements:

### System Requirements

- **Windows 10/11** or **Mac/Linux** with admin access
- At least **2 GB free disk space**
- A **working internet connection**

### What You'll Need

| For                         | Required                           | Download                              |
| --------------------------- | ---------------------------------- | ------------------------------------- |
| **Everyone**                | Web Browser (Chrome, Edge, Safari) | Already have it                       |
| **Developers & Web Users**  | Node.js 18 or newer                | https://nodejs.org/ (get LTS version) |
| **Mobile Users on Android** | Google account & Android phone     | N/A                                   |

---

## For Developers: Development Setup

If you're a developer who wants to run and modify the Droptimize code:

### Step 1: Install Node.js

1. Go to https://nodejs.org/
2. Download the **LTS (Long Term Support)** version
3. Run the installer and follow the prompts
4. Verify installation by opening Terminal/PowerShell and typing:
   ```bash
   node --version
   npm --version
   ```
   You should see version numbers printed.

### Step 2: Clone or Download the Project

**Option A: Using Git (Recommended for Developers)**

```bash
git clone <repository-url>
cd Droptimize
```

**Option B: Download as ZIP**

1. Click the green "Code" button on GitHub
2. Select "Download ZIP"
3. Extract the ZIP file
4. Open Terminal in the `Droptimize` folder

### Step 3: Install Dependencies

In the Terminal (in the `Droptimize` folder), type:

```bash
npm install
```

This will download all the required libraries. **Be patient—this might take 2-5 minutes.**

### Step 4: Configure Environment (API Keys)

You need to set up some secret keys for the app to work:

1. Open the file: `Droptimize/.env` (you might need to show hidden files)
2. You should see something like:
   ```
   EXPO_PUBLIC_FIREBASE_API_KEY=...
   EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=...
   ```
3. If these keys are missing, contact the project lead who will provide them

### Step 5: Start the Development Server

```bash
npm start
```

You should see something like:

````
expo start
...
Press 'a' to open Android Emulator


If you just want to use the Droptimize app (not develop it):

### Option 1: Use the Web Dashboard (Easiest)

1. **Open your browser** (Chrome, Safari, Edge, etc.)
2. **Go to:** https://droptimize-4b6fc.web.app/
3. **Log in** with your credentials
4. Done! You can now manage deliveries from your browser

**No installation needed!** The web app runs directly in your browser.

### Option 2: Install the Mobile App on Android Phone

1. **Open the web app** in your phone's browser: https://droptimize-4b6fc.web.app/
2. **Look for the APK download button** (usually on the home page)
3. **Tap the download button** to get the APK file
4. **On your Android phone**, go to Settings and enable:
   - Settings → Security → "Unknown sources" or "Install from unknown sources"
   - (Steps vary by phone model)
5. **Find the downloaded APK file** in your Downloads folder
6. **Tap the APK file** to install it
7. **Tap "Install"** and wait for installation to complete
8. **Open the app** from your home screen - you're ready!

---

## Running the Web Dashboard

The web dashboard is the administrative interface for managing drivers and deliveries.

### For Developers (Run Locally)

1. Open Terminal in the `Droptimize-Web` folder
2. Install dependencies:
   ```bash
   npm install
````

3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open your browser and go to: `http://localhost:5173`

### For Everyone Else (Use Production)

Simply visit: **https://droptimize-4b6fc.web.app/**

---

## Installing the Mobile App

### Development Installation (For Developers)

#### Via Android Emulator

1. **Install Android Studio** from https://developer.android.com/studio
2. **Open Android Studio** and create a virtual device (AVD)
3. **In your Terminal** (in the `Droptimize` folder), navigate to the Android directory:
   ```bash
   cd Droptimize/android
   ```
4. **Build the APK**:
   ```bash
   ./gradlew assembleDebug
   ```
5. **Use Android Studio** to install and run on the emulator, or:
   ```bash
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```

#### On a Physical Android Device

1. **Enable Developer Mode on your phone**:
   - Go to Settings → About Phone
   - Tap "Build Number" 7 times until you see "Developer Mode enabled"
2. **Enable USB Debugging**:
   - Go to Settings → Developer Options → USB Debugging (turn ON)
3. **Connect your phone** to your computer via USB
4. **In Terminal** (in the `Droptimize/android` folder):
   ```bash
   ./gradlew installDebug
   ```
5. The app will install on your device
6. **Alternative:** Use ADB directly:
   ```bash
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```

### Production Installation (For End Users)

See the **"For Regular Users"** section above.

---

## Troubleshooting

### General Errors

**Error: "npm: command not found"**

- You haven't installed Node.js yet
- Download and install from https://nodejs.org/

**Error: "Cannot find module..."**

- Run `npm install` again in the project folder
- Delete `node_modules` folder and run `npm install` fresh

**Error: "Port already in use"**

- Another app is using that port
- Try closing other development servers

### Mobile App Issues

**"App won't build"**

- Run: `npm install` again
- For Android specifically:
  - Delete `android/.gradle` folder
  - Run: `npm run android` again

**"App crashes on startup"**

- Check that all API keys are set in `.env` file
- Verify your Firebase project is configured correctly

**"Map doesn't load"**

- Verify Google Maps API is enabled in your Firebase project
- Check that the API key in `.env` matches Google Cloud Console

### Web Dashboard Issues

**"Page won't load"**

- Check your internet connection
- Try opening in a different browser
- Clear browser cache (Ctrl+Shift+Delete or Cmd+Shift+Delete)

**"Can't log in"**

- Verify you have the correct email and password
- Check that your Firebase project is active

### Getting Help

If you're stuck:

1. **Check the FAQ** in the project README
2. **Email your admin** with the error message shown
3. **For developers** - check the logs in Terminal for detailed error messages

---

## What to Do Next

### For End Users

✅ **You're ready!** Log in and start using Droptimize

### For Developers

1. ✅ Set up your development environment
2. 📖 Read the project README for architecture details
3. 🔧 Check out the components in `app/` and `src/components/` for the codebase structure
4. 📚 See Firebase docs: https://firebase.google.com/docs
5. 🚀 Start making changes!

---

## Quick Command Reference

```bash
# Development
npm start                  # Start dev server
npm run android          # Build for Android
npm run web              # Run web version
npm run lint             # Check code quality

# Building for Production
npm run build            # Build web dashboard
./gradlew assembleRelease # Build Android APK
```

---

**Happy coding! 🎉**

For questions or issues, contact your project administrator.
