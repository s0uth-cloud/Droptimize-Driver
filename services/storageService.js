import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  SHIFT_METRICS: '@droptimize:shift_metrics',
  SHIFT_STATE: '@droptimize:shift_state',
  LAST_LOCATION: '@droptimize:last_location',
};

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

export const clearShiftMetrics = async () => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.SHIFT_METRICS);
    console.log('[Storage] Cleared shift metrics');
  } catch (error) {
    console.error('[Storage] Failed to clear shift metrics:', error);
  }
};

export const saveShiftState = async (isActive, uid) => {
  try {
    const data = { isActive, uid, timestamp: Date.now() };
    await AsyncStorage.setItem(STORAGE_KEYS.SHIFT_STATE, JSON.stringify(data));
    console.log('[Storage] Saved shift state:', data);
  } catch (error) {
    console.error('[Storage] Failed to save shift state:', error);
  }
};

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

export const clearShiftState = async () => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.SHIFT_STATE);
    console.log('[Storage] Cleared shift state');
  } catch (error) {
    console.error('[Storage] Failed to clear shift state:', error);
  }
};

export const saveLastLocation = async (location) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_LOCATION, JSON.stringify(location));
  } catch (error) {
    console.error('[Storage] Failed to save last location:', error);
  }
};

export const loadLastLocation = async () => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEYS.LAST_LOCATION);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('[Storage] Failed to load last location:', error);
    return null;
  }
};
