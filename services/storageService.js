// External dependencies
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys for AsyncStorage persistence
const STORAGE_KEYS = {
  SHIFT_METRICS: '@droptimize:shift_metrics',
  SHIFT_STATE: '@droptimize:shift_state',
  LAST_LOCATION: '@droptimize:last_location',
};

/**
 * Persists shift metrics to AsyncStorage including top speed, total distance, average speed, shift start time, speed readings array, and last location coordinates.
 * Adds a timestamp to track when metrics were saved, and logs the saved data for debugging purposes.
 * Used to preserve shift data across app restarts and crashes during active shifts.
 */
export const saveShiftMetrics = async (metrics) => {
  try {
    const data = {
      topSpeed: metrics.topSpeed || 0,
      totalDistance: metrics.totalDistance || 0,
      avgSpeed: metrics.avgSpeed || 0,
      shiftStartTime: metrics.shiftStartTime || null,
      speedReadings: metrics.speedReadings || [],
      lastLocationCoords: metrics.lastLocationCoords || null,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(STORAGE_KEYS.SHIFT_METRICS, JSON.stringify(data));
    console.log('[Storage] Saved shift metrics:', data);
  } catch (error) {
    console.error('[Storage] Failed to save shift metrics:', error);
  }
};

/**
 * Retrieves previously saved shift metrics from AsyncStorage to restore shift state after app restart.
 * Parses the stored JSON data and returns the metrics object with topSpeed, totalDistance, avgSpeed, shiftStartTime, speedReadings, and lastLocationCoords, or null if no data exists.
 * Handles errors gracefully by logging and returning null to allow shift initialization from scratch.
 */
export const loadShiftMetrics = async () => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SHIFT_METRICS);
    if (data) {
      const parsed = JSON.parse(data);
      console.log('[Storage] Loaded shift metrics:', parsed);
      return parsed;
    }
    return null;
  } catch (error) {
    console.error('[Storage] Failed to load shift metrics:', error);
    return null;
  }
};

/**
 * Removes shift metrics data from AsyncStorage, typically called when a shift is ended or cancelled.
 * Ensures old shift data doesn't persist into new shifts and logs the operation for debugging.
 */
export const clearShiftMetrics = async () => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.SHIFT_METRICS);
    console.log('[Storage] Cleared shift metrics');
  } catch (error) {
    console.error('[Storage] Failed to clear shift metrics:', error);
  }
};

/**
 * Saves the current shift state (active/inactive) and associated user ID to AsyncStorage with a timestamp.
 * Used to track whether a driver has an active shift across app sessions, enabling shift recovery after app crashes or restarts.
 */
export const saveShiftState = async (isActive, uid) => {
  try {
    const data = { isActive, uid, timestamp: Date.now() };
    await AsyncStorage.setItem(STORAGE_KEYS.SHIFT_STATE, JSON.stringify(data));
    console.log('[Storage] Saved shift state:', data);
  } catch (error) {
    console.error('[Storage] Failed to save shift state:', error);
  }
};

/**
 * Retrieves the saved shift state from AsyncStorage, returning an object with isActive flag, uid, and timestamp.
 * Returns null if no shift state exists, allowing the app to initialize with a clean state.
 */
export const loadShiftState = async () => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.SHIFT_STATE);
    if (data) {
      const parsed = JSON.parse(data);
      console.log('[Storage] Loaded shift state:', parsed);
      return parsed;
    }
    return null;
  } catch (error) {
    console.error('[Storage] Failed to load shift state:', error);
    return null;
  }
};

/**
 * Removes shift state data from AsyncStorage when a shift is completed or cancelled.
 * Ensures the app starts fresh without active shift indicators on the next launch.
 */
export const clearShiftState = async () => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.SHIFT_STATE);
    console.log('[Storage] Cleared shift state');
  } catch (error) {
    console.error('[Storage] Failed to clear shift state:', error);
  }
};

/**
 * Stores the driver's last known GPS location to AsyncStorage for quick access on app restart.
 * Used to initialize maps and location services without waiting for fresh GPS data.
 */
export const saveLastLocation = async (location) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_LOCATION, JSON.stringify(location));
  } catch (error) {
    console.error('[Storage] Failed to save last location:', error);
  }
};

/**
 * Retrieves the last saved GPS location from AsyncStorage, returning the location object or null if not found.
 * Provides cached location data for faster initial map rendering before fresh GPS coordinates are available.
 */
export const loadLastLocation = async () => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LAST_LOCATION);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('[Storage] Failed to load last location:', error);
    return null;
  }
};
