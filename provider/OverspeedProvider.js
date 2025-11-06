import * as Location from "expo-location";
import { usePathname } from "expo-router";
import * as Speech from "expo-speech";
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
import { Alert } from "react-native";
import { auth, db } from "../firebaseConfig";

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
const correctionFactor = 1.12;

export function OverspeedProvider({ children }) {
  console.log("[OverspeedProvider] Initializing");
  const pathname = usePathname();

  // State for speed and location
  const [speed, setSpeed] = useState(0);
  const [location, setLocation] = useState(null);

  // Exposed slowdown UI state
  const [activeSlowdown, setActiveSlowdown] = useState(null);
  const [showSlowdownWarning, setShowSlowdownWarning] = useState(false);

  // ✅ Use state instead of refs for metrics that need to trigger re-renders
  const [topSpeed, setTopSpeed] = useState(0);
  const [totalDistance, setTotalDistance] = useState(0);

  const locationSubRef = useRef(null);
  const ensuredViolationsRef = useRef(false);
  const isAlertingViolationRef = useRef(false);
  const lastWriteTsRef = useRef(0);

  const slowdownsRef = useRef([]);
  const lastViolationTsRef = useRef(0);
  const lastZoneViolationIdRef = useRef(null);
  const prevFixRef = useRef({ coord: null, ts: 0 });

  const userDocUnsubRef = useRef(null);
  const authUnsubRef = useRef(null);

  const alertsEnabledRef = useRef(true);
  const trackingAllowedRef = useRef(true);

  const prevViolationsCountRef = useRef(0);
  const shiftAlertShownRef = useRef(false);

  // Driving metrics tracking
  const shiftStartTimeRef = useRef(null);
  const lastLocationRef = useRef(null);
  const speedReadingsRef = useRef([]);

  // Slowdown TTS control
  const currentSlowdownRef = useRef(null);
  const isAlertingSlowdownRef = useRef(false);

  // ✅ Store current user status
  const userStatusRef = useRef("Offline");
  const currentUserIdRef = useRef(null);

  const onLogin = pathname === "/Login";

  // Initialize and prewarm TTS
  useEffect(() => {
    console.log("[TTS] Initializing speech engine...");
    Speech.stop();
    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        console.log("[TTS] Voices loaded:", voices.length);
      })
      .catch((err) => console.warn("[TTS] Voice load error:", err));
  }, []);

  // Safe TTS function
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

  // ✅ Handle pathname changes
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
    
    // If tracking is not allowed and we have location watch, stop it
    if (!trackingAllowedRef.current && locationSubRef.current) {
      console.log("[OverspeedProvider] Stopping location watch due to pathname");
      stopLocationWatch();
    }
    
    // If tracking is allowed and we have a user, start tracking
    if (trackingAllowedRef.current && currentUserIdRef.current && !locationSubRef.current) {
      console.log("[OverspeedProvider] Restarting location watch after pathname change");
      startLocationWatch(currentUserIdRef.current);
    }
  }, [onLogin, pathname]);

  const stopLocationWatch = () => {
    if (locationSubRef.current) {
      try {
        console.log("[OverspeedProvider] Stopping location watch");
        locationSubRef.current.remove();
      } catch (error) {
        console.error("[OverspeedProvider] Error stopping location watch:", error);
      }
      locationSubRef.current = null;
    }
  };

  const metersBetween = (a, b) =>
    haversine(
      { lat: a.latitude, lon: a.longitude },
      { lat: b.latitude, lon: b.longitude }
    );

  const calcSpeedKmh = (pos) => {
    // Try to get GPS speed first
    const gps = Number.isFinite(pos?.coords?.speed) && pos.coords.speed > 0
      ? pos.coords.speed * 3.6
      : NaN;

    console.log("[Speed] GPS speed:", gps?.toFixed(2) || "N/A", "from raw:", pos?.coords?.speed);

    let derived = NaN;
    const prev = prevFixRef.current;
    
    // Calculate derived speed from position change
    if (prev.coord && prev.ts && pos?.coords) {
      try {
        const currentCoord = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        };
        
        const d = metersBetween(prev.coord, currentCoord);
        const dt = Math.max(1, ((pos.timestamp || Date.now()) - prev.ts) / 1000);
        
        if (d > 0 && dt > 0) {
          derived = (d / dt) * 3.6;
          console.log("[Speed] Derived speed:", derived.toFixed(2), "km/h from", d.toFixed(2), "m in", dt.toFixed(2), "s");
        }
      } catch (e) {
        console.error("[Speed] Derived calculation error:", e);
      }
    }

    // Update previous fix with properly structured coordinate
    prevFixRef.current = {
      coord: {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude
      },
      ts: pos.timestamp || Date.now()
    };

    // Prefer GPS speed if available and reasonable, otherwise use derived
    let kmh = 0;
    if (Number.isFinite(gps) && gps < 200) {
      kmh = Math.round(gps * correctionFactor);
    } else if (Number.isFinite(derived) && derived < 200) {
      kmh = Math.round(derived);
    }

    // Filter out very low speeds (noise)
    const finalSpeed = kmh < 2 ? 0 : kmh;
    console.log("[Speed] Final speed:", finalSpeed, "km/h");
    
    return finalSpeed;
  };

  const activeZoneFor = (coord) => {
    for (const z of slowdownsRef.current || []) {
      const lat = z?.location?.lat;
      const lng = z?.location?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      const d = metersBetween(coord, { latitude: lat, longitude: lng });
      const r = Number(z?.radius) > 0 ? Number(z.radius) : DEFAULT_ZONE_RADIUS;
      if (d <= r) return z;
    }
    return null;
  };

  const checkAndLogOverspeed = async (uid, coord, speedKmh) => {
    try {
      // ✅ Only log violations when delivering
      if (userStatusRef.current !== "Delivering") return;
      
      const zone = activeZoneFor(coord);
      const limit =
        zone?.speedLimit > 0 ? Number(zone.speedLimit) : DEFAULT_SPEED_LIMIT;
      if (!(speedKmh > limit)) return;

      const now = Date.now();
      const zoneKey = zone?.id ?? "default";
      const sameZone = zoneKey === (lastZoneViolationIdRef.current ?? "default");
      if (now - lastViolationTsRef.current < VIOLATION_COOLDOWN_MS && sameZone) {
        return;
      }

      console.warn(
        "[OverspeedProvider] VIOLATION - Speed:",
        speedKmh,
        "Limit:",
        limit,
        "Zone:",
        zone?.category
      );
      lastViolationTsRef.current = now;
      lastZoneViolationIdRef.current = zoneKey;

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
        zoneLimit: zone?.speedLimit ?? null,
        defaultLimit: DEFAULT_SPEED_LIMIT,
      };
      try {
        await updateDoc(userRef, { violations: arrayUnion(payload) });
        console.log("[OverspeedProvider] Violation logged to Firestore");
      } catch (error) {
        console.error("[OverspeedProvider] Failed to log violation:", error);
      }

      if (alertsEnabledRef.current) {
        await safeSpeak("Speeding violation");
      }
    } catch (error) {
      console.error("[OverspeedProvider] checkAndLogOverspeed error:", error);
    }
  };

  const handleSlowdownTransition = async (coord) => {
    try {
      // ✅ Only handle slowdown transitions when delivering
      if (userStatusRef.current !== "Delivering") {
        return;
      }
      
      if (!alertsEnabledRef.current) {
        const zone = activeZoneFor(coord);
        currentSlowdownRef.current = zone?.id ?? null;
        setActiveSlowdown(zone ?? null);
        setShowSlowdownWarning(Boolean(zone));
        return;
      }

      const zone = activeZoneFor(coord);
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
          const message = `Slow down ahead. You are entering a ${cat} zone.`;
          console.log("[Slowdown] Entering zone:", zone?.category, newZoneId);
          await safeSpeak(message);
          setTimeout(() => {
            isAlertingSlowdownRef.current = false;
          }, 3500);
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
          console.log("[Slowdown] Exiting zone:", prevZone?.category, prevZoneId);
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
      console.log("[OverspeedProvider] Loaded", data.slowdowns.length, "slowdowns");
      return data.slowdowns.map((s, i) => ({
        id: s?.id ?? i,
        category: s?.category ?? "Default",
        location: s?.location,
        radius: s?.radius ?? DEFAULT_ZONE_RADIUS,
        speedLimit: s?.speedLimit ?? 0,
      }));
    } catch (error) {
      console.error("[OverspeedProvider] Failed to load branch slowdowns:", error);
      return [];
    }
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
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

  const resetDrivingMetrics = () => {
    console.log("[OverspeedProvider] Resetting driving metrics");
    shiftStartTimeRef.current = null;
    lastLocationRef.current = null;
    setTotalDistance(0);
    setTopSpeed(0);
    speedReadingsRef.current = [];
  };

  const calculateAverageSpeed = () => {
    if (speedReadingsRef.current.length === 0) return 0;
    const sum = speedReadingsRef.current.reduce((acc, speed) => acc + speed, 0);
    return Math.round(sum / speedReadingsRef.current.length);
  };

  const initializeShiftMetrics = (currentLocation) => {
    console.log("[OverspeedProvider] Initializing shift metrics with location:", currentLocation);
    shiftStartTimeRef.current = Date.now();
    lastLocationRef.current = currentLocation;
    setTotalDistance(0);
    setTopSpeed(0);
    speedReadingsRef.current = [];
  };

  const getShiftMetrics = () => {
    const shiftEndTime = Date.now();
    const shiftStartTime = shiftStartTimeRef.current || shiftEndTime;
    const durationMinutes = Math.round((shiftEndTime - shiftStartTime) / 60000);
    const avgSpeed = calculateAverageSpeed();
    const distance = parseFloat(totalDistance.toFixed(2));

    console.log(
      "[OverspeedProvider] Shift metrics - Duration:",
      durationMinutes,
      "min, Avg speed:",
      avgSpeed,
      "km/h, Distance:",
      distance,
      "km, Top speed:",
      topSpeed,
      "km/h"
    );

    return {
      durationMinutes: durationMinutes || 0,
      avgSpeed: avgSpeed || 0,
      topSpeed: topSpeed || 0,
      distance: distance || 0,
    };
  };

  // ✅ UPDATED: Start location tracking immediately when allowed
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
      console.log("[OverspeedProvider] Requesting location permissions...");
      
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
      
      const kmh0 = calcSpeedKmh(initial);
      setSpeed(kmh0);
      setLocation({
        latitude: initial.coords.latitude,
        longitude: initial.coords.longitude,
      });

      console.log("[OverspeedProvider] Initial speed set to:", kmh0, "km/h");

      // Update Firestore with initial location
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

      // Start watching position
      console.log("[OverspeedProvider] Starting position watch...");
      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 3000, // Update every 3 seconds
          distanceInterval: 5, // Or every 5 meters
        },
        async (pos) => {
          try {
            if (!pos?.coords) {
              console.warn("[OverspeedProvider] Position update with no coords");
              return;
            }

            const now = Date.now();
            
            // Throttle Firestore writes but not UI updates
            const shouldWriteToFirestore = (now - lastWriteTsRef.current) >= 2000;

            const kmh = calcSpeedKmh(pos);
            const newLocation = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };

            console.log("[OverspeedProvider] Location update:", newLocation.latitude, newLocation.longitude, "Speed:", kmh, "km/h");

            // ✅ Always update UI state
            setSpeed(kmh);
            setLocation(newLocation);

            // Track metrics ONLY if shift has started
            if (shiftStartTimeRef.current) {
              if (kmh > topSpeed) {
                setTopSpeed(kmh);
                console.log("[Metrics] New top speed:", kmh, "km/h");
              }

              if (kmh > 0) {
                speedReadingsRef.current.push(kmh);
              }

              if (lastLocationRef.current) {
                const distanceKm = calculateDistance(
                  lastLocationRef.current.latitude,
                  lastLocationRef.current.longitude,
                  newLocation.latitude,
                  newLocation.longitude
                );
                
                if (distanceKm > 0.005 && distanceKm < 1) {
                  setTotalDistance(prev => {
                    const newTotal = prev + distanceKm;
                    console.log("[Metrics] Distance added:", distanceKm.toFixed(3), "km, Total:", newTotal.toFixed(2), "km");
                    return newTotal;
                  });
                }
              }

              lastLocationRef.current = newLocation;
            }

            // Write to Firestore (throttled)
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

            // Handle slowdown transitions (only when delivering)
            try {
              handleSlowdownTransition(pos.coords).catch((e) =>
                console.error("[OverspeedProvider] Slowdown handler error:", e)
              );
            } catch (e) {
              console.error("[OverspeedProvider] Slowdown handler sync error:", e);
            }

            // Check for overspeeding (only when delivering)
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
          return;
        }

        console.log("[OverspeedProvider] User logged in:", user.uid);
        currentUserIdRef.current = user.uid;
        shiftAlertShownRef.current = false;

        const userRef = doc(db, "users", user.uid);
        userDocUnsubRef.current = onSnapshot(
          userRef,
          async (snap) => {
            try {
              if (!snap.exists()) return;
              const data = snap.data() || {};

              // ✅ Store current status
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

              if (
                alertsEnabledRef.current &&
                !isAlertingViolationRef.current
              ) {
                const newCount = violationsArr.length;
                if (newCount > prevViolationsCountRef.current) {
                  const last = violationsArr[newCount - 1];
                  if (last) {
                    isAlertingViolationRef.current = true;
                    if (last.message === "Speeding violation") {
                      await safeSpeak("You have a violation");
                      Alert.alert(
                        "Notice of Violation",
                        "Open your Driving Stats to review your violation.",
                        [{ text: "OK" }],
                        { cancelable: false }
                      );
                    } else if (last.message === "Shift completed") {
                      if (!shiftAlertShownRef.current) {
                        shiftAlertShownRef.current = true;
                        Alert.alert(
                          "Shift Ended",
                          "Your shift has ended. Check your driving history on Driving Stats.",
                          [{ text: "OK" }],
                          { cancelable: false }
                        );
                      } else {
                        console.log("[OverspeedProvider] Shift End alert already shown – skipping");
                      }
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

              // ✅ Start tracking for any logged-in user (not just when Delivering)
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
        activeSlowdown,
        showSlowdownWarning,
        slowdowns: slowdownsRef.current,
      }}
    >
      {children}
    </OverspeedContext.Provider>
  );
}