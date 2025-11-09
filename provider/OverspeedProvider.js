import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { usePathname } from "expo-router";
import * as Speech from "expo-speech";
import * as TaskManager from "expo-task-manager";
import { onAuthStateChanged } from "firebase/auth";
import {
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import haversine from "haversine-distance";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Alert, AppState } from "react-native";
import { auth, db } from "../firebaseConfig";
import {
  clearShiftMetrics,
  clearShiftState,
  loadShiftMetrics,
  loadShiftState,
  saveLastLocation,
  saveShiftMetrics,
  saveShiftState,
} from "../services/storageService";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const OverspeedContext = createContext();

export function useOverspeed() {
  const context = useContext(OverspeedContext);
  if (!context) {
    throw new Error("useOverspeed must be used within OverspeedProvider");
  }
  return context;
}

const DEFAULT_SPEED_LIMIT = 60;
const DEFAULT_ZONE_RADIUS = 15;
const VIOLATION_COOLDOWN_MS = 60000;
const MIN_SPEED_FOR_VIOLATION = 5;
const OVERSPEED_GRACE_PERIOD_MS = 10000;
const SPEED_CORRECTION_FACTOR = 1.12;

const ZONE_DEFAULT_SPEEDS = {
  Crosswalk: 15,
  School: 20,
  Schools: 20,
  Church: 30,
  Curve: 40,
  Slippery: 40,
  Slowdown: 40,
  Default: DEFAULT_SPEED_LIMIT,
};

const BACKGROUND_LOCATION_TASK = "background-location-task";

let lastBackgroundViolationTime = 0;
let lastBackgroundZoneId = null;

const calculateDistanceInKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const checkActiveZone = (coord, slowdowns) => {
  if (!coord || !slowdowns || slowdowns.length === 0) return null;
  
  for (const zone of slowdowns) {
    const lat = zone?.location?.lat;
    const lng = zone?.location?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    
    const distanceKm = calculateDistanceInKm(coord.latitude, coord.longitude, lat, lng);
    const distanceMeters = distanceKm * 1000;
    const radius = Number(zone?.radius) > 0 ? Number(zone.radius) : DEFAULT_ZONE_RADIUS;
    
    if (distanceMeters <= radius) {
      return {
        id: zone.id,
        category: zone.category || "Default",
        speedLimit: zone.speedLimit || ZONE_DEFAULT_SPEEDS[zone.category] || DEFAULT_SPEED_LIMIT,
        radius: radius,
      };
    }
  }
  return null;
};

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error("[Background] Location task error:", error);
    return;
  }
  
  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      const location = locations[0];
      const coords = location.coords;
      
      console.log("[Background] Location update:", coords.latitude, coords.longitude, "Speed:", coords.speed);
      
      try {
        let speedKmh = 0;
        if (coords.speed && coords.speed > 0) {
          speedKmh = Math.round(coords.speed * 3.6 * SPEED_CORRECTION_FACTOR);
        }
        
        const savedMetrics = await loadShiftMetrics();
        const savedState = await loadShiftState();
        
        if (!savedState?.isActive) {
          console.log("[Background] Shift not active, skipping tracking");
          return;
        }
        
        const user = auth.currentUser;
        if (!user) {
          console.log("[Background] No authenticated user");
          return;
        }
        
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          console.log("[Background] User document not found");
          return;
        }
        
        const userData = userSnap.data();
        if (userData.status !== "Delivering") {
          console.log("[Background] User not in Delivering status");
          return;
        }
        
        let slowdowns = [];
        if (userData.branchId) {
          const branchRef = doc(db, "branches", userData.branchId);
          const branchSnap = await getDoc(branchRef);
          if (branchSnap.exists()) {
            slowdowns = branchSnap.data()?.slowdowns || [];
          }
        }
        
        const zone = checkActiveZone({ latitude: coords.latitude, longitude: coords.longitude }, slowdowns);
        const speedLimit = zone?.speedLimit || DEFAULT_SPEED_LIMIT;
        
        const now = Date.now();
        const zoneKey = zone?.id ?? "default";
        const sameZone = zoneKey === lastBackgroundZoneId;
        
        if (speedKmh > speedLimit + 3 && speedKmh > MIN_SPEED_FOR_VIOLATION) {
          if (sameZone && now - lastBackgroundViolationTime < VIOLATION_COOLDOWN_MS) {
            console.log("[Background] Still in cooldown period, skipping notification");
          } else {
            console.warn("[Background] ⚠️ OVERSPEED DETECTED - Speed:", speedKmh, "Limit:", speedLimit);
            
            lastBackgroundViolationTime = now;
            lastBackgroundZoneId = zoneKey;
            
            await Notifications.scheduleNotificationAsync({
              content: {
                title: "⚠️ Speeding Violation",
                body: `You're going ${speedKmh} km/h in a ${speedLimit} km/h zone!`,
                sound: true,
                priority: Notifications.AndroidNotificationPriority.HIGH,
                vibrate: [0, 250, 250, 250],
              },
              trigger: null,
            });
            
            const violationPayload = {
              message: "Speeding violation (Background)",
              confirmed: false,
              issuedAt: Timestamp.now(),
              driverLocation: {
                latitude: coords.latitude,
                longitude: coords.longitude,
              },
              topSpeed: speedKmh,
              avgSpeed: speedKmh,
              distance: 0,
              time: 0,
              zoneId: zone?.id ?? null,
              zoneCategory: zone?.category ?? "Default",
              zoneLimit: zone?.speedLimit ?? null,
              defaultLimit: DEFAULT_SPEED_LIMIT,
            };
            
            await updateDoc(userRef, { 
              violations: arrayUnion(violationPayload),
              location: {
                latitude: coords.latitude,
                longitude: coords.longitude,
                speedKmh: speedKmh,
              },
              lastLocationAt: serverTimestamp(),
            });
            
            console.log("[Background] Violation logged and notification sent");
          }
        } else {
          if (!sameZone) {
            lastBackgroundZoneId = zoneKey;
          }
        }
        
        if (savedMetrics) {
          let newTopSpeed = savedMetrics.topSpeed || 0;
          let newTotalDistance = savedMetrics.totalDistance || 0;
          const speedReadings = savedMetrics.speedReadings || [];
          
          if (speedKmh > newTopSpeed) {
            newTopSpeed = speedKmh;
            console.log("[Background] New top speed:", newTopSpeed);
          }
          
          if (speedKmh > 0) {
            speedReadings.push(speedKmh);
          }
          
          if (savedMetrics.lastLocationCoords) {
            const distanceKm = calculateDistanceInKm(
              savedMetrics.lastLocationCoords.latitude,
              savedMetrics.lastLocationCoords.longitude,
              coords.latitude,
              coords.longitude
            );
            
            if (distanceKm > 0.001 && distanceKm < 0.5) {
              newTotalDistance += distanceKm;
              console.log("[Background] Distance updated:", newTotalDistance.toFixed(3), "km");
            }
          }
          
          const avgSpeed = speedReadings.length > 0
            ? Math.round(speedReadings.reduce((a, b) => a + b, 0) / speedReadings.length)
            : 0;
          
          await saveShiftMetrics({
            topSpeed: newTopSpeed,
            totalDistance: newTotalDistance,
            avgSpeed: avgSpeed,
            shiftStartTime: savedMetrics.shiftStartTime,
            speedReadings: speedReadings,
            lastLocationCoords: {
              latitude: coords.latitude,
              longitude: coords.longitude,
            },
          });
          
          console.log("[Background] Metrics updated - Distance:", newTotalDistance.toFixed(2), "km, Top:", newTopSpeed, "km/h, Avg:", avgSpeed, "km/h");
        }
        
        await updateDoc(userRef, {
          location: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            speedKmh: speedKmh,
          },
          lastLocationAt: serverTimestamp(),
        });
        
        await saveLastLocation({
          latitude: coords.latitude,
          longitude: coords.longitude,
          timestamp: location.timestamp,
        });
        
      } catch (error) {
        console.error("[Background] Task processing error:", error);
      }
    }
  }
});

export function OverspeedProvider({ children }) {
  console.log("[OverspeedProvider] Initializing");
  const pathname = usePathname();

  const [speed, setSpeed] = useState(0);
  const [location, setLocation] = useState(null);
  const [activeSlowdown, setActiveSlowdown] = useState(null);
  const [showSlowdownWarning, setShowSlowdownWarning] = useState(false);
  const [topSpeed, setTopSpeed] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);
  const [avgSpeed, setAvgSpeed] = useState(0);

  const locationSubRef = useRef(null);
  const ensuredViolationsRef = useRef(false);
  const isAlertingViolationRef = useRef(false);
  const lastWriteTsRef = useRef(0);
  const slowdownsRef = useRef([]);
  const lastViolationTsRef = useRef(0);
  const lastZoneViolationIdRef = useRef(null);
  const overspeedStartTimeRef = useRef(null);
  const prevFixRef = useRef({ coord: null, ts: 0 });
  const userDocUnsubRef = useRef(null);
  const authUnsubRef = useRef(null);
  const alertsEnabledRef = useRef(true);
  const trackingAllowedRef = useRef(true);
  const prevViolationsCountRef = useRef(0);
  const alertedViolationTimestampsRef = useRef(new Set());
  const shiftStartTimeRef = useRef(null);
  const lastLocationRef = useRef(null);
  const speedReadingsRef = useRef([]);
  const isTrackingMetricsRef = useRef(false);
  const currentSlowdownRef = useRef(null);
  const isAlertingSlowdownRef = useRef(false);
  const userStatusRef = useRef("Offline");
  const currentUserIdRef = useRef(null);

  const onLogin = pathname === "/Login";

  useEffect(() => {
    console.log("[TTS] Initializing speech engine...");
    Speech.stop();
    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        console.log("[TTS] Voices loaded:", voices.length);
      })
      .catch((err) => console.warn("[TTS] Voice load error:", err));
    
    // Request notification permissions
    Notifications.requestPermissionsAsync()
      .then(({ status }) => {
        if (status === 'granted') {
          console.log("[Notifications] Permission granted");
        } else {
          console.warn("[Notifications] Permission denied");
        }
      })
      .catch((err) => console.warn("[Notifications] Permission request error:", err));
  }, []);

  async function safeSpeak(message, options = {}) {
    try {
      await Speech.stop();
      await new Promise((res) => setTimeout(res, 250));
      const voices = await Speech.getAvailableVoicesAsync().catch(() => []);
      if (!voices.length) {
        console.warn("[TTS] No voices available – skipping speak");
        return;
      }
      Speech.speak(message, {
        language: "en-US",
        rate: 1.0,
        pitch: 1.0,
        ...options,
        onDone: () => console.log("[TTS] Speech done:", message),
        onError: (err) => console.error("[TTS] Speech error:", err),
      });
    } catch (err) {
      console.error("[TTS] Safe speak failed:", err);
    }
  }

  useEffect(() => {
    console.log("[OverspeedProvider] Pathname changed:", pathname);
    alertsEnabledRef.current = !onLogin;
    trackingAllowedRef.current = !onLogin;
    console.log(
      "[OverspeedProvider] Alerts enabled:",
      alertsEnabledRef.current,
      "Tracking allowed:",
      trackingAllowedRef.current
    );
    
    if (!trackingAllowedRef.current && locationSubRef.current) {
      console.log("[OverspeedProvider] Stopping location watch due to pathname");
      stopLocationWatch();
    }
    
    if (trackingAllowedRef.current && currentUserIdRef.current && !locationSubRef.current) {
      console.log("[OverspeedProvider] Restarting location watch after pathname change");
      startLocationWatch(currentUserIdRef.current);
    }
  }, [onLogin, pathname]);

  const stopLocationWatch = async () => {
    if (locationSubRef.current) {
      try {
        console.log("[OverspeedProvider] Stopping location watch");
        locationSubRef.current.remove();
      } catch (error) {
        console.error("[OverspeedProvider] Error stopping location watch:", error);
      }
      locationSubRef.current = null;
    }
    
    try {
      const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
      if (isTaskRegistered) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        console.log("[OverspeedProvider] Background location updates stopped");
      }
    } catch (error) {
      console.error("[OverspeedProvider] Error stopping background location:", error);
    }
  };

  const calculateDistanceMeters = (coordA, coordB) => {
    try {
      return haversine(
        { lat: coordA.latitude, lon: coordA.longitude },
        { lat: coordB.latitude, lon: coordB.longitude }
      );
    } catch (e) {
      console.error("[calculateDistanceMeters] Error:", e);
      return 0;
    }
  };

  const calculateSpeedKmh = (pos) => {
    const gps = Number.isFinite(pos?.coords?.speed) && pos.coords.speed > 0
      ? pos.coords.speed * 3.6
      : NaN;

    let derived = NaN;
    const prev = prevFixRef.current;
    
    if (prev.coord && prev.ts && pos?.coords) {
      try {
        const currentCoord = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        };
        
        const d = calculateDistanceMeters(prev.coord, currentCoord);
        const dt = Math.max(1, ((pos.timestamp || Date.now()) - prev.ts) / 1000);
        
        if (d > 0 && dt > 0) {
          derived = (d / dt) * 3.6;
        }
      } catch (e) {
        console.error("[Speed] Derived calculation error:", e);
      }
    }

    prevFixRef.current = {
      coord: {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude
      },
      ts: pos.timestamp || Date.now()
    };

    let kmh = 0;
    if (Number.isFinite(gps) && gps < 200) {
      kmh = Math.round(gps * SPEED_CORRECTION_FACTOR);
    } else if (Number.isFinite(derived) && derived < 200) {
      kmh = Math.round(derived);
    }

    const finalSpeed = kmh < 2 ? 0 : kmh;
    
    return finalSpeed;
  };

  const checkActiveZoneWithDetails = (coord) => {
    if (!coord || typeof coord.latitude !== 'number' || typeof coord.longitude !== 'number') {
      return null;
    }

    for (const z of slowdownsRef.current || []) {
      const lat = z?.location?.lat;
      const lng = z?.location?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      
      try {
        const d = haversine(
          { lat: coord.latitude, lon: coord.longitude },
          { lat: lat, lon: lng }
        );
        
        const r = Number(z?.radius) > 0 ? Number(z.radius) : DEFAULT_ZONE_RADIUS;
        if (d <= r) {
          let effectiveSpeedLimit;
          const category = z.category || "Default";
          
          if (z.speedLimit !== undefined && z.speedLimit !== null) {
            const adminLimit = Number(z.speedLimit);
            if (adminLimit > 0) {
              effectiveSpeedLimit = adminLimit;
              console.log("[Zone] Using ADMIN-SET speed limit:", effectiveSpeedLimit, "km/h for", category);
            } else {
              effectiveSpeedLimit = ZONE_DEFAULT_SPEEDS[category] || DEFAULT_SPEED_LIMIT;
              console.log("[Zone] Admin set invalid limit, using CATEGORY default:", effectiveSpeedLimit, "km/h for", category);
            }
          } else {
            effectiveSpeedLimit = ZONE_DEFAULT_SPEEDS[category] || DEFAULT_SPEED_LIMIT;
            console.log("[Zone] No admin limit, using CATEGORY default:", effectiveSpeedLimit, "km/h for", category);
          }
          
          console.log("[Zone] ✅ Entered zone:", category, "| Distance:", d.toFixed(2), "m | Speed Limit:", effectiveSpeedLimit, "km/h | Raw speedLimit value:", z.speedLimit);
          
          return {
            ...z,
            speedLimit: effectiveSpeedLimit
          };
        }
      } catch (e) {
        console.error("[Zone] Distance calculation error:", e);
      }
    }
    return null;
  };

  const checkAndLogOverspeed = async (uid, coord, speedKmh) => {
    try {
      if (userStatusRef.current !== "Delivering") {
        if (overspeedStartTimeRef.current) {
          overspeedStartTimeRef.current = null;
        }
        return;
      }
      if (speedKmh < MIN_SPEED_FOR_VIOLATION) {
        if (overspeedStartTimeRef.current) {
          overspeedStartTimeRef.current = null;
        }
        return;
      }

      const zone = checkActiveZoneWithDetails(coord);
      const limit = zone?.speedLimit || DEFAULT_SPEED_LIMIT;
      
      if (speedKmh <= limit) {
        if (overspeedStartTimeRef.current) {
          console.log("[OverspeedProvider] Speed back under limit, resetting grace period");
          overspeedStartTimeRef.current = null;
        }
        return;
      }

      const now = Date.now();
      
      if (!overspeedStartTimeRef.current) {
        overspeedStartTimeRef.current = now;
        console.log("[OverspeedProvider] Started overspeeding - Speed:", speedKmh, "Limit:", limit, "Zone:", zone?.category || "Default", "- Starting 10s grace period");
        return;
      }
      
      const overspeedDuration = now - overspeedStartTimeRef.current;
      if (overspeedDuration >= OVERSPEED_GRACE_PERIOD_MS) {
        const zoneKey = zone?.id ?? "default";
        const sameZone = zoneKey === (lastZoneViolationIdRef.current ?? "default");
        if (now - lastViolationTsRef.current < VIOLATION_COOLDOWN_MS && sameZone) {
          return;
        }

        console.warn(
          "[OverspeedProvider] ⚠️ VIOLATION - Speed:",
          speedKmh,
          "Limit:",
          limit,
          "Zone:",
          zone?.category || "Default",
          "- Grace period passed"
        );

        lastViolationTsRef.current = now;
        lastZoneViolationIdRef.current = zoneKey;
        overspeedStartTimeRef.current = null;

        if (!isAlertingViolationRef.current) {
          isAlertingViolationRef.current = true;
          const zoneName = zone?.category ?? "default";
          safeSpeak(`Warning! You are overspeeding. Limit is ${limit} kilometers per hour in ${zoneName} zone.`)
            .finally(() => {
              setTimeout(() => {
                isAlertingViolationRef.current = false;
              }, 3000);
            });
        }

        const userRef = doc(db, "users", uid);
        const payload = {
          message: "Speeding violation",
          confirmed: false,
          issuedAt: Timestamp.now(),
          driverLocation: {
            latitude: coord.latitude,
            longitude: coord.longitude,
          },
          topSpeed: Math.round(speedKmh),
          avgSpeed: Math.round(speedKmh),
          distance: 0,
          time: 0,
          zoneId: zone?.id ?? null,
          zoneCategory: zone?.category ?? "Default",
          zoneLimit: zone?.speedLimit ?? null,
          defaultLimit: DEFAULT_SPEED_LIMIT,
        };

        try {
          await updateDoc(userRef, { violations: arrayUnion(payload) });
          console.log("[OverspeedProvider] Violation logged to Firestore");
        } catch (error) {
          console.error("[OverspeedProvider] Failed to log violation:", error);
        }
      }
    } catch (error) {
      console.error("[OverspeedProvider] checkAndLogOverspeed error:", error);
    }
  };

  const handleSlowdownTransition = async (coord) => {
    try {
      if (!coord || typeof coord.latitude !== 'number' || typeof coord.longitude !== 'number') {
        return;
      }

      if (userStatusRef.current !== "Delivering") {
        return;
      }
      
      if (!alertsEnabledRef.current) {
        const zone = checkActiveZoneWithDetails(coord);
        currentSlowdownRef.current = zone?.id ?? null;
        setActiveSlowdown(zone ?? null);
        setShowSlowdownWarning(Boolean(zone));
        return;
      }

      const zone = checkActiveZoneWithDetails(coord);
      const newZoneId = zone?.id ?? null;
      const prevZoneId = currentSlowdownRef.current;

      if (newZoneId && newZoneId !== prevZoneId) {
        currentSlowdownRef.current = newZoneId;
        setActiveSlowdown(zone ?? null);
        setShowSlowdownWarning(true);

        if (isAlertingSlowdownRef.current) {
          console.log("[Slowdown] Entered zone but TTS busy, skipping speak:", zone?.category);
        } else {
          isAlertingSlowdownRef.current = true;
          const cat = zone?.category ?? "hazard";
          const limit = zone?.speedLimit || DEFAULT_SPEED_LIMIT;
          const message = `Slow down ahead. You are entering a ${cat} zone. Speed limit is ${limit} kilometers per hour.`;
          console.log("[Slowdown] 🔊 Entering zone:", zone?.category, newZoneId, "Speed limit:", limit, "km/h");
          await safeSpeak(message);
          setTimeout(() => {
            isAlertingSlowdownRef.current = false;
          }, 4000);
        }
        return;
      }

      if (!newZoneId && prevZoneId) {
        const prevZone = (slowdownsRef.current || []).find((z) => z.id === prevZoneId);
        currentSlowdownRef.current = null;
        setActiveSlowdown(null);
        setShowSlowdownWarning(false);

        if (isAlertingSlowdownRef.current) {
          console.log("[Slowdown] Left zone but TTS busy, skipping exit TTS:", prevZone?.category);
        } else {
          isAlertingSlowdownRef.current = true;
          const cat = prevZone?.category ?? "hazard";
          const message = `You have left the ${cat} zone.`;
          console.log("[Slowdown] 👋 Exiting zone:", prevZone?.category, prevZoneId);
          await safeSpeak(message);
          setTimeout(() => {
            isAlertingSlowdownRef.current = false;
          }, 2500);
        }
      }
    } catch (err) {
      console.error("[Slowdown] handle error:", err);
      isAlertingSlowdownRef.current = false;
      setShowSlowdownWarning(false);
      setActiveSlowdown(null);
    }
  };

  const loadBranchSlowdowns = async (branchId) => {
    console.log("[OverspeedProvider] Loading branch slowdowns for:", branchId);
    try {
      const ref = doc(db, "branches", branchId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        console.log("[OverspeedProvider] Branch not found");
        return [];
      }
      const data = snap.data() || {};
      if (!Array.isArray(data.slowdowns)) {
        console.log("[OverspeedProvider] No slowdowns in branch");
        return [];
      }
      console.log("[OverspeedProvider] Found", data.slowdowns.length, "slowdowns in branch");
      
      const processedSlowdowns = data.slowdowns.map((s, i) => {
        const category = s?.category ?? "Default";
        const adminSpeedLimit = s?.speedLimit;
        
        let finalSpeedLimit;
        if (adminSpeedLimit !== undefined && adminSpeedLimit !== null && adminSpeedLimit !== "") {
          const numericLimit = Number(adminSpeedLimit);
          if (!isNaN(numericLimit) && numericLimit > 0) {
            finalSpeedLimit = numericLimit;
            console.log("[OverspeedProvider] Zone", i, "-", category, "| ADMIN LIMIT:", finalSpeedLimit, "km/h | Raw value:", adminSpeedLimit, "| Type:", typeof adminSpeedLimit);
          } else {
            finalSpeedLimit = ZONE_DEFAULT_SPEEDS[category] || DEFAULT_SPEED_LIMIT;
            console.log("[OverspeedProvider] Zone", i, "-", category, "| Invalid admin limit, using DEFAULT:", finalSpeedLimit, "km/h");
          }
        } else {
          finalSpeedLimit = ZONE_DEFAULT_SPEEDS[category] || DEFAULT_SPEED_LIMIT;
          console.log("[OverspeedProvider] Zone", i, "-", category, "| NO ADMIN LIMIT, using DEFAULT:", finalSpeedLimit, "km/h");
        }
        
        return {
          id: s?.id ?? `slowdown_${i}`,
          category: category,
          location: s?.location,
          radius: s?.radius ?? DEFAULT_ZONE_RADIUS,
          speedLimit: finalSpeedLimit,
        };
      });
      
      console.log("[OverspeedProvider] ✅ Processed slowdowns:", JSON.stringify(processedSlowdowns, null, 2));
      return processedSlowdowns;
    } catch (error) {
      console.error("[OverspeedProvider] Failed to load branch slowdowns:", error);
      return [];
    }
  };

  const calculateAverageSpeed = () => {
    if (speedReadingsRef.current.length === 0) return 0;
    const sum = speedReadingsRef.current.reduce((acc, speed) => acc + speed, 0);
    const avg = Math.round(sum / speedReadingsRef.current.length);
    return avg;
  };

  const resetDrivingMetrics = async () => {
    console.log("[OverspeedProvider] Resetting driving metrics");
    shiftStartTimeRef.current = null;
    lastLocationRef.current = null;
    speedReadingsRef.current = [];
    isTrackingMetricsRef.current = false;
    overspeedStartTimeRef.current = null;
    setTotalDistance(0);
    setTopSpeed(0);
    setAvgSpeed(0);
    
    await clearShiftMetrics();
    await clearShiftState();
  };

  const initializeShiftMetrics = async (currentLocation) => {
    if (!currentLocation || typeof currentLocation.latitude !== 'number' || typeof currentLocation.longitude !== 'number') {
      console.error("[OverspeedProvider] Cannot initialize metrics - invalid location:", currentLocation);
      return;
    }
    
    console.log("[OverspeedProvider] Initializing shift metrics with location:", currentLocation);
    shiftStartTimeRef.current = Date.now();
    lastLocationRef.current = currentLocation;
    speedReadingsRef.current = [];
    isTrackingMetricsRef.current = true;
    overspeedStartTimeRef.current = null;
    setTotalDistance(0);
    setTopSpeed(0);
    setAvgSpeed(0);
    
    await saveShiftMetrics({
      topSpeed: 0,
      totalDistance: 0,
      avgSpeed: 0,
      shiftStartTime: shiftStartTimeRef.current,
      speedReadings: [],
      lastLocationCoords: currentLocation,
    });
    
    if (currentUserIdRef.current) {
      await saveShiftState(true, currentUserIdRef.current);
    }
  };

  const getShiftMetrics = () => {
    const shiftEndTime = Date.now();
    const shiftStartTime = shiftStartTimeRef.current || shiftEndTime;
    const durationMinutes = Math.round((shiftEndTime - shiftStartTime) / 60000);
    const avgSpeed = calculateAverageSpeed();
    const distance = parseFloat(totalDistance.toFixed(2));
    const top = topSpeed;

    console.log(
      "[OverspeedProvider] Final shift metrics:",
      "\n- Duration:", durationMinutes, "min",
      "\n- Distance:", distance, "km",
      "\n- Top speed:", top, "km/h",
      "\n- Avg speed:", avgSpeed, "km/h",
      "\n- Speed readings count:", speedReadingsRef.current.length
    );

    return {
      durationMinutes: durationMinutes || 0,
      avgSpeed: avgSpeed || 0,
      topSpeed: top || 0,
      distance: distance || 0,
    };
  };

  const startLocationWatch = async (uid) => {
    try {
      if (!trackingAllowedRef.current) {
        console.log("[OverspeedProvider] Tracking not allowed, skipping");
        return;
      }
      if (locationSubRef.current) {
        console.log("[OverspeedProvider] Location watch already active");
        return;
      }

      console.log("[OverspeedProvider] Starting location watch for user:", uid);
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.warn("[OverspeedProvider] Location permission denied");
        Alert.alert(
          "Location Permission Required",
          "Please enable location permissions to use this app.",
          [{ text: "OK" }]
        );
        return;
      }

      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== "granted") {
        console.warn("[OverspeedProvider] Background location permission denied - app will only track in foreground");
      } else {
        console.log("[OverspeedProvider] Background location permission granted");
        
        try {
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 5000,
            distanceInterval: 10,
            foregroundService: {
              notificationTitle: "Droptimize Active",
              notificationBody: "Tracking your delivery route",
              notificationColor: "#00b2e1",
            },
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
          });
          console.log("[OverspeedProvider] Background location updates started");
        } catch (bgError) {
          console.error("[OverspeedProvider] Failed to start background location:", bgError);
        }
      }

      console.log("[OverspeedProvider] Getting initial position...");
      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      }).catch((error) => {
        console.error("[OverspeedProvider] Failed to get initial position:", error);
        return null;
      });

      if (!initial?.coords) {
        console.warn("[OverspeedProvider] No initial coordinates received");
        return;
      }

      console.log("[OverspeedProvider] Initial position:", initial.coords.latitude, initial.coords.longitude);

      prevFixRef.current = {
        coord: {
          latitude: initial.coords.latitude,
          longitude: initial.coords.longitude
        },
        ts: initial.timestamp || Date.now(),
      };
      
      const kmh0 = calculateSpeedKmh(initial);
      setSpeed(kmh0);
      setLocation({
        latitude: initial.coords.latitude,
        longitude: initial.coords.longitude,
      });

      try {
        await updateDoc(doc(db, "users", uid), {
          location: {
            latitude: initial.coords.latitude,
            longitude: initial.coords.longitude,
            speedKmh: kmh0,
          },
          lastLocationAt: serverTimestamp(),
        });
        console.log("[OverspeedProvider] Initial location written to Firestore");
      } catch (e) {
        console.error("[OverspeedProvider] Failed to write initial location:", e);
      }

      console.log("[OverspeedProvider] Starting position watch...");
      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        async (pos) => {
          try {
            if (!pos?.coords) {
              console.warn("[OverspeedProvider] Position update with no coords");
              return;
            }

            const now = Date.now();
            const shouldWriteToFirestore = (now - lastWriteTsRef.current) >= 2000;

            const kmh = calculateSpeedKmh(pos);
            const newLocation = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };

            setSpeed(kmh);
            setLocation(newLocation);

            if (isTrackingMetricsRef.current && shiftStartTimeRef.current) {
              if (kmh > topSpeed) {
                console.log("[Metrics] New top speed:", kmh, "km/h (previous:", topSpeed, "km/h)");
                setTopSpeed(kmh);
              }

              if (kmh > 0) {
                speedReadingsRef.current.push(kmh);
                const newAvg = calculateAverageSpeed();
                setAvgSpeed(newAvg);
              }

              if (lastLocationRef.current) {
                const distanceKm = calculateDistanceInKm(
                  lastLocationRef.current.latitude,
                  lastLocationRef.current.longitude,
                  newLocation.latitude,
                  newLocation.longitude
                );
                
                if (distanceKm > 0.001 && distanceKm < 0.5) {
                  setTotalDistance(prev => {
                    const newTotal = prev + distanceKm;
                    
                    // Save metrics to persistent storage periodically
                    saveShiftMetrics({
                      topSpeed: Math.max(kmh, topSpeed),
                      totalDistance: newTotal,
                      avgSpeed: calculateAverageSpeed(),
                      shiftStartTime: shiftStartTimeRef.current,
                      speedReadings: speedReadingsRef.current,
                      lastLocationCoords: newLocation,
                    }).catch(err => console.error("[Metrics] Save failed:", err));
                    
                    return newTotal;
                  });
                } else if (distanceKm >= 0.5) {
                  console.warn("[Metrics] Suspicious large distance:", distanceKm.toFixed(3), "km - possible GPS jump, skipping");
                }
              }

              lastLocationRef.current = newLocation;
            }

            if (shouldWriteToFirestore) {
              lastWriteTsRef.current = now;
              try {
                await updateDoc(doc(db, "users", uid), {
                  location: {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    speedKmh: kmh,
                  },
                  lastLocationAt: serverTimestamp(),
                });
              } catch (e) {
                console.error("[OverspeedProvider] Failed to update location in Firestore:", e);
              }
            }

            try {
              handleSlowdownTransition(pos.coords).catch((e) =>
                console.error("[OverspeedProvider] Slowdown handler error:", e)
              );
            } catch (e) {
              console.error("[OverspeedProvider] Slowdown handler sync error:", e);
            }

            await checkAndLogOverspeed(uid, pos.coords, kmh);
          } catch (error) {
            console.error("[OverspeedProvider] Position watch callback error:", error);
          }
        }
      );
      
      console.log("[OverspeedProvider] Location watch started successfully");
    } catch (error) {
      console.error("[OverspeedProvider] Failed to start location watch:", error);
      Alert.alert("Location Error", "Failed to start location tracking. Please try again.");
    }
  };

  useEffect(() => {
    console.log("[OverspeedProvider] Setting up auth listener");
    authUnsubRef.current = onAuthStateChanged(auth, async (user) => {
      try {
        stopLocationWatch();
        if (userDocUnsubRef.current) userDocUnsubRef.current();
        
        if (!user) {
          console.log("[OverspeedProvider] No user, stopping tracking");
          currentUserIdRef.current = null;
          alertedViolationTimestampsRef.current.clear();
          overspeedStartTimeRef.current = null;
          return;
        }

        console.log("[OverspeedProvider] User logged in:", user.uid);
        currentUserIdRef.current = user.uid;

        try {
          const savedMetrics = await loadShiftMetrics();
          const savedState = await loadShiftState();
          
          if (savedMetrics && savedState?.isActive && savedState?.uid === user.uid) {
            console.log("[OverspeedProvider] Restoring shift metrics from storage:", savedMetrics);
            
            shiftStartTimeRef.current = savedMetrics.shiftStartTime;
            lastLocationRef.current = savedMetrics.lastLocationCoords;
            speedReadingsRef.current = savedMetrics.speedReadings || [];
            isTrackingMetricsRef.current = true;
            
            setTopSpeed(savedMetrics.topSpeed || 0);
            setTotalDistance(savedMetrics.totalDistance || 0);
            setAvgSpeed(savedMetrics.avgSpeed || 0);
            
            console.log("[OverspeedProvider] ✅ Shift metrics restored - continuing from where left off");
          } else {
            console.log("[OverspeedProvider] No active shift found in storage");
          }
        } catch (error) {
          console.error("[OverspeedProvider] Failed to restore metrics:", error);
        }

        const userRef = doc(db, "users", user.uid);
        userDocUnsubRef.current = onSnapshot(
          userRef,
          async (snap) => {
            try {
              if (!snap.exists()) return;
              const data = snap.data() || {};

              userStatusRef.current = data.status || "Offline";
              console.log("[OverspeedProvider] User status:", userStatusRef.current);

              if (
                typeof data.violations === "undefined" &&
                !ensuredViolationsRef.current
              ) {
                ensuredViolationsRef.current = true;
                await updateDoc(userRef, { violations: [] });
                prevViolationsCountRef.current = 0;
              }

              const violationsArr = Array.isArray(data.violations)
                ? data.violations
                : [];

              if (alertsEnabledRef.current && !isAlertingViolationRef.current) {
                const newCount = violationsArr.length;
                // Only alert for NEW violations, not existing ones on app open
                const isFirstLoad = prevViolationsCountRef.current === 0 && newCount > 0;
                if (newCount > prevViolationsCountRef.current && !isFirstLoad) {
                  for (let i = prevViolationsCountRef.current; i < newCount; i++) {
                    const violation = violationsArr[i];
                    if (!violation) continue;

                    const violationKey = `${violation.message}_${violation.issuedAt?.seconds || Date.now()}`;
                    
                    if (alertedViolationTimestampsRef.current.has(violationKey)) {
                      console.log("[OverspeedProvider] Skipping already-alerted violation:", violationKey);
                      continue;
                    }

                    alertedViolationTimestampsRef.current.add(violationKey);
                    isAlertingViolationRef.current = true;

                    if (violation.message === "Speeding violation") {
                      await safeSpeak("You have a violation");
                      Alert.alert(
                        "Notice of Violation",
                        "Open your Driving Stats to review your violation.",
                        [{ text: "OK" }],
                        { cancelable: false }
                      );
                    }

                    setTimeout(() => {
                      isAlertingViolationRef.current = false;
                    }, 3000);
                  }
                }
                prevViolationsCountRef.current = newCount;
              } else {
                prevViolationsCountRef.current = violationsArr.length;
              }

              slowdownsRef.current = data?.branchId
                ? await loadBranchSlowdowns(data.branchId)
                : [];
              
              console.log("[OverspeedProvider] ✅ Slowdowns loaded into ref:", slowdownsRef.current.length);

              if (trackingAllowedRef.current && !locationSubRef.current) {
                console.log("[OverspeedProvider] Starting location tracking...");
                startLocationWatch(user.uid);
              }
            } catch (error) {
              console.error("[OverspeedProvider] Snapshot handler error:", error);
            }
          },
          (error) => console.error("[OverspeedProvider] Snapshot error:", error)
        );
      } catch (error) {
        console.error("[OverspeedProvider] Auth state change error:", error);
      }
    });

    return () => {
      try {
        if (authUnsubRef.current) authUnsubRef.current();
        if (userDocUnsubRef.current) userDocUnsubRef.current();
        stopLocationWatch();
        Speech.stop();
      } catch (e) {
        console.error("[OverspeedProvider] Cleanup error:", e);
      }
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      if (nextAppState === "background" && isTrackingMetricsRef.current) {
        console.log("[OverspeedProvider] App going to background - saving metrics");
        await saveShiftMetrics({
          topSpeed: topSpeed,
          totalDistance: totalDistance,
          avgSpeed: avgSpeed,
          shiftStartTime: shiftStartTimeRef.current,
          speedReadings: speedReadingsRef.current,
          lastLocationCoords: lastLocationRef.current,
        });
      } else if (nextAppState === "active") {
        console.log("[OverspeedProvider] App returning to foreground");
      }
    });

    return () => {
      subscription?.remove();
    };
  }, [topSpeed, totalDistance, avgSpeed]);

  return (
    <OverspeedContext.Provider
      value={{
        speed,
        location,
        startLocationWatch,
        stopLocationWatch,
        resetDrivingMetrics,
        initializeShiftMetrics,
        getShiftMetrics,
        calculateAverageSpeed,
        topSpeed,
        totalDistance,
        avgSpeed,
        activeSlowdown,
        showSlowdownWarning,
        slowdowns: slowdownsRef.current,
      }}
    >
      {children}
    </OverspeedContext.Provider>
  );
}