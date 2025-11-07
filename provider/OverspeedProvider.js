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
const MIN_SPEED_FOR_VIOLATION = 5; // Don't record violations below 5 km/h
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

  // ✅ Use state for all metrics
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
  const prevFixRef = useRef({ coord: null, ts: 0 });

  const userDocUnsubRef = useRef(null);
  const authUnsubRef = useRef(null);

  const alertsEnabledRef = useRef(true);
  const trackingAllowedRef = useRef(true);

  const prevViolationsCountRef = useRef(0);
  const alertedViolationTimestampsRef = useRef(new Set()); // ✅ Track which violations we've alerted

  // ✅ Track metrics with refs for accurate calculations
  const shiftStartTimeRef = useRef(null);
  const lastLocationRef = useRef(null);
  const speedReadingsRef = useRef([]);
  const isTrackingMetricsRef = useRef(false);

  // Slowdown TTS control
  const currentSlowdownRef = useRef(null);
  const isAlertingSlowdownRef = useRef(false);

  const userStatusRef = useRef("Offline");
  const currentUserIdRef = useRef(null);

  // Overspeed session tracking
  const overspeedSessionRef = useRef(null);
  const overspeedStartTimeRef = useRef(null);
  const overspeedSpeedReadingsRef = useRef([]);
  const overspeedLastLocationRef = useRef(null);
  const overspeedDistanceRef = useRef(0);
  const overspeedCheckTimerRef = useRef(null);

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
        
        const d = metersBetween(prev.coord, currentCoord);
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
      kmh = Math.round(gps * correctionFactor);
    } else if (Number.isFinite(derived) && derived < 200) {
      kmh = Math.round(derived);
    }

    const finalSpeed = kmh < 2 ? 0 : kmh;
    
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

  // End overspeed session and log violation if confirmed
  const endOverspeedSession = async (uid) => {
    if (!overspeedSessionRef.current) return;
    
    // ✅ Prevent multiple saves of the same session
    const session = overspeedSessionRef.current;
    if (session.saved) {
      console.log("[Overspeed] Session already saved, skipping");
      overspeedSessionRef.current = null;
      return;
    }
    
    try {
      const endTime = Date.now();
      const durationSeconds = (endTime - overspeedStartTimeRef.current) / 1000;
      const durationMinutes = Math.round(durationSeconds / 60);
      
      // Clear the confirmation timer
      if (overspeedCheckTimerRef.current) {
        clearTimeout(overspeedCheckTimerRef.current);
        overspeedCheckTimerRef.current = null;
      }
      
      // Only save if violation was confirmed (lasted more than 10 seconds)
      if (session.confirmed) {
        // ✅ Mark as saving to prevent race conditions
        session.saved = true;
        
        // Calculate metrics
        const topSpeed = Math.max(...overspeedSpeedReadingsRef.current, 0);
        const avgSpeed = overspeedSpeedReadingsRef.current.length > 0
          ? Math.round(
              overspeedSpeedReadingsRef.current.reduce((a, b) => a + b, 0) /
              overspeedSpeedReadingsRef.current.length
            )
          : 0;
        
        const payload = {
          message: "Speeding violation",
          confirmed: true,
          issuedAt: Timestamp.now(),
          driverLocation: overspeedLastLocationRef.current
            ? {
                latitude: overspeedLastLocationRef.current.latitude,
                longitude: overspeedLastLocationRef.current.longitude,
              }
            : null,
          topSpeed: Math.round(topSpeed),
          avgSpeed: Math.round(avgSpeed),
          distance: parseFloat(overspeedDistanceRef.current.toFixed(2)),
          time: durationMinutes,
          zoneId: session.zone?.id ?? null,
          zoneLimit: session.zone?.speedLimit ?? null,
          defaultLimit: DEFAULT_SPEED_LIMIT,
          speedLimit: session.limit,
        };
        
        console.log("[Overspeed] Saving violation session:", payload);
        
        const userRef = doc(db, "users", uid);
        await updateDoc(userRef, { violations: arrayUnion(payload) });
        
        console.log("[Overspeed] Violation session saved successfully");
        
        // ✅ Don't speak here - let snapshot listener handle it
        
      } else {
        console.log("[Overspeed] Session ended before 10 seconds - no violation recorded");
      }
      
    } catch (error) {
      console.error("[OverspeedProvider] Failed to save overspeeding session:", error);
    } finally {
      // Reset session tracking
      overspeedSessionRef.current = null;
      overspeedStartTimeRef.current = null;
      overspeedSpeedReadingsRef.current = [];
      overspeedLastLocationRef.current = null;
      overspeedDistanceRef.current = 0;
      if (overspeedCheckTimerRef.current) {
        clearTimeout(overspeedCheckTimerRef.current);
        overspeedCheckTimerRef.current = null;
      }
    }
  };

  // Check speed against active zone and log overspeeding
  const checkAndLogOverspeed = async (uid, coord, speedKmh) => {
    try {
      // Only log when delivering AND speed is meaningful
      if (userStatusRef.current !== "Delivering") {
        // If there was an active session, end it
        if (overspeedSessionRef.current) {
          await endOverspeedSession(uid);
        }
        return;
      }
      
      if (speedKmh < MIN_SPEED_FOR_VIOLATION) {
        // If there was an active session, end it
        if (overspeedSessionRef.current) {
          await endOverspeedSession(uid);
        }
        return;
      }
      
      const zone = activeZoneFor(coord);
      const limit = zone?.speedLimit > 0 ? Number(zone.speedLimit) : DEFAULT_SPEED_LIMIT;
      
      const isOverspeeding = speedKmh > limit;
      
      // Case 1: Currently overspeeding
      if (isOverspeeding) {
        if (!overspeedSessionRef.current) {
          // Start tracking potential violation
          console.log("[Overspeed] Started tracking overspeeding at", speedKmh, "km/h (limit:", limit, ")");
          overspeedSessionRef.current = {
            startTime: Date.now(),
            zone: zone,
            limit: limit,
            confirmed: false // Not yet a violation
          };
          overspeedStartTimeRef.current = Date.now();
          overspeedSpeedReadingsRef.current = [speedKmh];
          overspeedLastLocationRef.current = coord;
          overspeedDistanceRef.current = 0;
          
          // Set timer to confirm violation after 10 seconds
          overspeedCheckTimerRef.current = setTimeout(() => {
            if (overspeedSessionRef.current && !overspeedSessionRef.current.confirmed) {
              overspeedSessionRef.current.confirmed = true;
              console.log("[Overspeed] Violation CONFIRMED after 10 seconds");
            }
          }, 10000); // 10 seconds
          
        } else {
          // Continue tracking existing session
          overspeedSpeedReadingsRef.current.push(speedKmh);
          
          // Calculate distance traveled while overspeeding
          if (overspeedLastLocationRef.current) {
            const distanceKm = calculateDistance(
              overspeedLastLocationRef.current.latitude,
              overspeedLastLocationRef.current.longitude,
              coord.latitude,
              coord.longitude
            );
            
            // Only add reasonable distances
            if (distanceKm > 0.001 && distanceKm < 0.5) {
              overspeedDistanceRef.current += distanceKm;
            }
          }
          
          overspeedLastLocationRef.current = coord;
        }
      } 
      // Case 2: No longer overspeeding but have active session
      else if (overspeedSessionRef.current) {
        await endOverspeedSession(uid);
      }
      
    } catch (error) {
      console.error("[OverspeedProvider] checkAndLogOverspeed error:", error);
    }
  };

  const handleSlowdownTransition = async (coord) => {
    try {
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

  // ✅ Calculate average speed from all readings
  const calculateAverageSpeed = () => {
    if (speedReadingsRef.current.length === 0) return 0;
    const sum = speedReadingsRef.current.reduce((acc, speed) => acc + speed, 0);
    const avg = Math.round(sum / speedReadingsRef.current.length);
    return avg;
  };

  // ✅ Reset all metrics
  const resetDrivingMetrics = () => {
    console.log("[OverspeedProvider] Resetting driving metrics");
    shiftStartTimeRef.current = null;
    lastLocationRef.current = null;
    speedReadingsRef.current = [];
    isTrackingMetricsRef.current = false;
    setTotalDistance(0);
    setTopSpeed(0);
    setAvgSpeed(0);
  };

  // ✅ Initialize shift metrics when starting to deliver
  const initializeShiftMetrics = (currentLocation) => {
    console.log("[OverspeedProvider] Initializing shift metrics with location:", currentLocation);
    shiftStartTimeRef.current = Date.now();
    lastLocationRef.current = currentLocation;
    speedReadingsRef.current = [];
    isTrackingMetricsRef.current = true;
    setTotalDistance(0);
    setTopSpeed(0);
    setAvgSpeed(0);
  };

  // ✅ Get final metrics with latest calculations
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

            const kmh = calcSpeedKmh(pos);
            const newLocation = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };

            // Always update UI state
            setSpeed(kmh);
            setLocation(newLocation);

            // ✅ Track metrics ONLY when actively delivering
            if (isTrackingMetricsRef.current && shiftStartTimeRef.current) {
              // Update top speed - only if current speed is higher than previous top
              setTopSpeed(prevTop => {
                if (kmh > prevTop) {
                  console.log("[Metrics] New top speed:", kmh, "km/h (previous:", prevTop, "km/h)");
                  return kmh;
                }
                return prevTop;
              });

              // Record speed reading (only if moving)
              if (kmh > 0) {
                speedReadingsRef.current.push(kmh);
                // Update average speed state for real-time display
                const newAvg = calculateAverageSpeed();
                setAvgSpeed(newAvg);
              }

              // Calculate distance
              if (lastLocationRef.current) {
                const distanceKm = calculateDistance(
                  lastLocationRef.current.latitude,
                  lastLocationRef.current.longitude,
                  newLocation.latitude,
                  newLocation.longitude
                );
                
                // Only add reasonable distances (between 5m and 1km per update)
                if (distanceKm > 0.005 && distanceKm < 1) {
                  setTotalDistance(prev => {
                    const newTotal = prev + distanceKm;
                    return newTotal;
                  });
                } else if (distanceKm >= 1) {
                  console.warn("[Metrics] Suspicious large distance:", distanceKm.toFixed(2), "km - skipping");
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

            // Handle slowdown transitions
            try {
              handleSlowdownTransition(pos.coords).catch((e) =>
                console.error("[OverspeedProvider] Slowdown handler error:", e)
              );
            } catch (e) {
              console.error("[OverspeedProvider] Slowdown handler sync error:", e);
            }

            // Check for overspeeding
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
          alertedViolationTimestampsRef.current.clear(); // Clear on logout
          return;
        }

        console.log("[OverspeedProvider] User logged in:", user.uid);
        currentUserIdRef.current = user.uid;

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

              // ✅ Only show alerts for NEW violations that haven't been alerted yet
              if (alertsEnabledRef.current && !isAlertingViolationRef.current) {
                const newCount = violationsArr.length;
                
                if (newCount > prevViolationsCountRef.current) {
                  // Check only the new violations
                  for (let i = prevViolationsCountRef.current; i < newCount; i++) {
                    const violation = violationsArr[i];
                    if (!violation) continue;

                    // ✅ Create UNIQUE key using multiple fields to prevent duplicates
                    const violationKey = `${violation.message}_${violation.issuedAt?.seconds}_${violation.topSpeed}_${violation.avgSpeed}_${i}`;
                    
                    // Skip if we've already alerted this violation
                    if (alertedViolationTimestampsRef.current.has(violationKey)) {
                      console.log("[OverspeedProvider] Skipping duplicate violation:", violationKey);
                      continue;
                    }

                    // Mark as alerted BEFORE showing alert
                    alertedViolationTimestampsRef.current.add(violationKey);
                    isAlertingViolationRef.current = true;

                    // Only show UI alerts for speeding violations (not shift completed)
                    if (violation.message === "Speeding violation") {
                      console.log("[OverspeedProvider] Showing NEW violation alert:", violationKey);
                      
                      // Use async IIFE to handle promises properly
                      (async () => {
                        try {
                          await safeSpeak("You have a violation");
                          Alert.alert(
                            "Notice of Violation",
                            "Open your Driving Stats to review your violation.",
                            [{ text: "OK" }],
                            { cancelable: false }
                          );
                        } catch (err) {
                          console.error("[OverspeedProvider] Alert error:", err);
                        } finally {
                          setTimeout(() => {
                            isAlertingViolationRef.current = false;
                          }, 3000);
                        }
                      })();
                      
                      // Exit loop after first alert to avoid overwhelming user
                      break;
                    }
                  }
                }
                prevViolationsCountRef.current = newCount;
              } else {
                // Just update count if alerts disabled
                prevViolationsCountRef.current = violationsArr.length;
              }

              slowdownsRef.current = data?.branchId
                ? await loadBranchSlowdowns(data.branchId)
                : [];

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

        // Clear any active overspeed check timer
        if (overspeedCheckTimerRef.current) {
          clearTimeout(overspeedCheckTimerRef.current);
        }
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