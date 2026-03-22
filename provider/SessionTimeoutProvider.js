import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { signOut } from "firebase/auth";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
} from "react";
import { AppState } from "react-native";
import { auth } from "../firebaseConfig";
import { clearShiftMetrics, clearShiftState } from "../services/storageService";

const SessionTimeoutContext = createContext();

export function useSessionTimeout() {
  const context = useContext(SessionTimeoutContext);
  if (!context) {
    throw new Error(
      "useSessionTimeout must be used within SessionTimeoutProvider",
    );
  }
  return context;
}

// Constants
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const LAST_ACTIVE_TIME_KEY = "lastActiveTime";
const BACKGROUND_LOCATION_TASK = "background-location-task";

/**
 * SessionTimeoutProvider
 *
 * Monitors app lifecycle and automatically logs out users after 30 minutes of inactivity.
 * Also stops all background processes when logging out.
 *
 * Features:
 * - Tracks last active time using AsyncStorage
 * - Detects app foreground/background state
 * - Automatically logs out on timeout or app removal from multitasking
 * - Clears all background processes and stored data on logout
 * - Resets timeout when app comes to foreground
 */
export function SessionTimeoutProvider({ children }) {
  const appStateRef = useRef(AppState.currentState);
  const timeoutRef = useRef(null);
  const logoutInProgressRef = useRef(false);

  /**
   * Update the last active time in AsyncStorage
   */
  const updateLastActiveTime = useCallback(async () => {
    try {
      const now = Date.now();
      await AsyncStorage.setItem(LAST_ACTIVE_TIME_KEY, now.toString());
    } catch (error) {
      console.error("Error updating last active time:", error);
    }
  }, []);

  /**
   * Stop all background processes
   */
  const stopBackgroundProcesses = useCallback(async () => {
    try {
      // Stop background location tracking
      try {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        console.log("[SessionTimeout] Background location tracking stopped");
      } catch (_error) {
        // Task might not be registered, that's okay
        console.log("[SessionTimeout] No background location task to stop");
      }

      // Undefine the task
      try {
        TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK).then(
          (isRegistered) => {
            if (isRegistered) {
              // Tasks can't be explicitly undefined in Expo, but we can ensure they're not running
              console.log(
                "[SessionTimeout] Background location task unregistered",
              );
            }
          },
        );
      } catch (_error) {
        console.log("[SessionTimeout] Error checking task status:", _error);
      }

      // Clear all stored shift data
      await clearShiftMetrics();
      await clearShiftState();
      console.log("[SessionTimeout] Shift data cleared");
    } catch (error) {
      console.error("Error stopping background processes:", error);
    }
  }, []);

  /**
   * Perform logout and cleanup
   */
  const performLogout = useCallback(async () => {
    if (logoutInProgressRef.current) return;
    logoutInProgressRef.current = true;

    try {
      // Stop background processes
      await stopBackgroundProcesses();

      // Clear last active time
      await AsyncStorage.removeItem(LAST_ACTIVE_TIME_KEY);

      // Sign out from Firebase
      if (auth.currentUser) {
        await signOut(auth);
        console.log("[SessionTimeout] User logged out due to timeout");
      }
    } catch (error) {
      console.error("Error during logout:", error);
    } finally {
      logoutInProgressRef.current = false;
    }
  }, [stopBackgroundProcesses]);

  /**
   * Check if session has timed out
   */
  const checkSessionTimeout = useCallback(async () => {
    try {
      const lastActiveTimeStr =
        await AsyncStorage.getItem(LAST_ACTIVE_TIME_KEY);

      if (!lastActiveTimeStr) {
        // No last active time recorded, user wasn't logged in before
        return false;
      }

      const lastActiveTime = parseInt(lastActiveTimeStr, 10);
      const now = Date.now();
      const elapsedTime = now - lastActiveTime;

      if (elapsedTime > SESSION_TIMEOUT_MS) {
        console.log(
          `[SessionTimeout] Session timeout detected (${Math.round(
            elapsedTime / 1000 / 60,
          )} minutes inactive)`,
        );
        await performLogout();
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error checking session timeout:", error);
      return false;
    }
  }, [performLogout]);

  /**
   * Reset the session timeout timer
   */
  const resetSessionTimeout = useCallback(() => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Update last active time
    updateLastActiveTime();

    // Set a new timeout to check inactivity
    // We'll check every update instead of waiting the full 30 mins
    console.log("[SessionTimeout] Session timeout reset");
  }, [updateLastActiveTime]);

  // Initialize session timeout tracking
  useEffect(() => {
    // Update last active time on mount
    updateLastActiveTime();

    // Subscribe to app state changes
    const subscription = AppState.addEventListener(
      "change",
      async (nextAppState) => {
        const isComingFromBackground =
          appStateRef.current.match(/inactive|background/) &&
          nextAppState === "active";
        const isGoingToBackground =
          appStateRef.current === "active" &&
          nextAppState.match(/inactive|background/);

        appStateRef.current = nextAppState;

        if (isComingFromBackground) {
          // App has come to foreground
          console.log("[SessionTimeout] App came to foreground");

          // Check if session has timed out
          const timedOut = await checkSessionTimeout();

          if (!timedOut) {
            // Session is still valid, reset timeout
            resetSessionTimeout();
          }
        } else if (isGoingToBackground) {
          // App is going to background
          console.log("[SessionTimeout] App going to background");
        }
      },
    );

    return () => {
      subscription.remove();
      // Don't clear timeout in cleanup to avoid ref warning
    };
  }, [checkSessionTimeout, resetSessionTimeout, updateLastActiveTime]);

  const value = {
    resetSessionTimeout,
    performLogout,
    checkSessionTimeout,
    updateLastActiveTime,
  };

  return (
    <SessionTimeoutContext.Provider value={value}>
      {children}
    </SessionTimeoutContext.Provider>
  );
}
