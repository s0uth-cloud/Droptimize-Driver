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
import { createContext, useContext, useEffect, useRef } from "react";
import { Alert } from "react-native";
import { auth, db } from "../firebaseConfig";

const OverspeedContext = createContext();

export function useOverspeed() {
  return useContext(OverspeedContext);
}

const DEFAULT_SPEED_LIMIT = 80;
const DEFAULT_ZONE_RADIUS = 15;
const VIOLATION_COOLDOWN_MS = 60000;

export function OverspeedProvider({ children }) {
  const pathname = usePathname();

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

  const onLogin = pathname === "/Login";
  const onMap = pathname === "/Map";

  useEffect(() => {
    alertsEnabledRef.current = !onLogin;
    trackingAllowedRef.current = !(onLogin || onMap);
    if (!trackingAllowedRef.current) stopLocationWatch();
  }, [onLogin, onMap]);

  const stopLocationWatch = () => {
    if (locationSubRef.current) {
      try {
        locationSubRef.current.remove();
      } catch {}
      locationSubRef.current = null;
    }
  };

  const metersBetween = (a, b) =>
    haversine(
      { lat: a.latitude, lon: a.longitude },
      { lat: b.latitude, lon: b.longitude }
    );

  const calcSpeedKmh = (pos) => {
    const gps = Number.isFinite(pos?.coords?.speed)
      ? pos.coords.speed * 3.6
      : NaN;
    let derived = NaN;
    if (prevFixRef.current.coord && prevFixRef.current.ts) {
      const d = metersBetween(prevFixRef.current.coord, pos.coords);
      const dt = Math.max(
        0.5,
        ((pos.timestamp || Date.now()) - prevFixRef.current.ts) / 1000
      );
      derived = (d / dt) * 3.6;
    }
    prevFixRef.current = { coord: pos.coords, ts: pos.timestamp || Date.now() };
    const kmh = Number.isFinite(gps)
      ? gps
      : Number.isFinite(derived)
      ? derived
      : 0;
    return kmh < 2 ? 0 : kmh;
  };

  const activeZoneFor = (coord) => {
    for (const z of slowdownsRef.current || []) {
      const lat = z?.location?.lat;
      const lng = z?.location?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      const d = metersBetween(coord, { latitude: lat, longitude: lng });
      const r =
        Number(z?.radius) > 0 ? Number(z.radius) : DEFAULT_ZONE_RADIUS;
      if (d <= r) return z;
    }
    return null;
  };

  const checkAndLogOverspeed = async (uid, coord, speedKmh) => {
    const zone = activeZoneFor(coord);
    const limit =
      zone?.speedLimit > 0 ? Number(zone.speedLimit) : DEFAULT_SPEED_LIMIT;
    if (!(speedKmh > limit)) return;

    const now = Date.now();
    const zoneKey = zone?.id ?? "default";
    const sameZone = zoneKey === (lastZoneViolationIdRef.current ?? "default");
    if (now - lastViolationTsRef.current < VIOLATION_COOLDOWN_MS && sameZone)
      return;

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
    } catch {}

    if (alertsEnabledRef.current) {
      try {
        Speech.stop();
        Speech.speak("Speeding violation", { language: "en-US", rate: 1.0 });
      } catch {}
    }
  };

  const loadBranchSlowdowns = async (branchId) => {
    try {
      const ref = doc(db, "branches", branchId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return [];
      const data = snap.data() || {};
      if (!Array.isArray(data.slowdowns)) return [];
      return data.slowdowns.map((s, i) => ({
        id: s?.id ?? i,
        category: s?.category ?? "Default",
        location: s?.location,
        radius: s?.radius ?? DEFAULT_ZONE_RADIUS,
        speedLimit: s?.speedLimit ?? 0,
      }));
    } catch {
      return [];
    }
  };

  const startLocationWatch = async (uid) => {
    try {
      if (!trackingAllowedRef.current) return;
      if (locationSubRef.current) return;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      prevFixRef.current = {
        coord: initial.coords,
        ts: initial.timestamp || Date.now(),
      };
      const kmh0 = calcSpeedKmh(initial);

      await updateDoc(doc(db, "users", uid), {
        location: {
          latitude: initial.coords.latitude,
          longitude: initial.coords.longitude,
          speedKmh: kmh0,
        },
        lastLocationAt: serverTimestamp(),
      }).catch(() => {});

      await checkAndLogOverspeed(uid, initial.coords, kmh0);

      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        async (pos) => {
          if (!trackingAllowedRef.current) {
            stopLocationWatch();
            return;
          }

          const now = Date.now();
          if (now - lastWriteTsRef.current < 2000) return;
          lastWriteTsRef.current = now;

          const kmh = calcSpeedKmh(pos);

          await updateDoc(doc(db, "users", uid), {
            location: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              speedKmh: kmh,
            },
            lastLocationAt: serverTimestamp(),
          }).catch(() => {});

          await checkAndLogOverspeed(uid, pos.coords, kmh);
        }
      );
    } catch {}
  };

  useEffect(() => {
    authUnsubRef.current = onAuthStateChanged(auth, async (user) => {
      stopLocationWatch();
      if (userDocUnsubRef.current) {
        userDocUnsubRef.current();
        userDocUnsubRef.current = null;
      }
      if (!user) return;

      const userRef = doc(db, "users", user.uid);
      userDocUnsubRef.current = onSnapshot(userRef, async (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() || {};

        if (
          typeof data.violations === "undefined" &&
          !ensuredViolationsRef.current
        ) {
          ensuredViolationsRef.current = true;
          await updateDoc(userRef, { violations: [] }).catch(() => {});
          prevViolationsCountRef.current = 0;
        }

        const violationsArr = Array.isArray(data.violations)
          ? data.violations
          : [];

        if (prevViolationsCountRef.current === 0 && violationsArr.length >= 0) {
          prevViolationsCountRef.current = violationsArr.length;
        }

        if (alertsEnabledRef.current && !isAlertingViolationRef.current) {
          const newCount = violationsArr.length;
          if (newCount > prevViolationsCountRef.current) {
            const last = violationsArr[newCount - 1];
            if (last && last.message === "Shift completed") {
              isAlertingViolationRef.current = true;
              try {
                if (last.message === "Speeding violation") {
                  // Violation alert
                  Speech.stop();
                  Speech.speak("You have a violation", {
                    language: "en-US",
                    rate: 1.0,
                  });
                  Alert.alert(
                    "Notice of Violation",
                    "Open your Driving Stats to review your violation.",
                    [{ text: "OK" }],
                    { cancelable: false }
                  );
                } else if (last.message === "Shift completed") {
                  Alert.alert(
                    "Shift Ended",
                    "Your shift has ended. Check your driving history on Driving Stats.",
                    [{ text: "OK" }],
                    { cancelable: false }
                  );
                }
              } finally {
                isAlertingViolationRef.current = false;
              }
            }
          }
          prevViolationsCountRef.current = newCount;
        } else {
          prevViolationsCountRef.current = violationsArr.length;
        }

        if (data?.branchId)
          slowdownsRef.current = await loadBranchSlowdowns(data.branchId);
        else slowdownsRef.current = [];

        const status = String(data.status || "").toLowerCase();
        if (status === "delivering" && trackingAllowedRef.current)
          startLocationWatch(user.uid);
        else stopLocationWatch();
      });
    });

    return () => {
      if (authUnsubRef.current) authUnsubRef.current();
      if (userDocUnsubRef.current) userDocUnsubRef.current();
      stopLocationWatch();
      try {
        Speech.stop();
      } catch {}
    };
  }, []);

  return (
    <OverspeedContext.Provider
      value={{
        startLocationWatch,
        stopLocationWatch,
      }}
    >
      {children}
    </OverspeedContext.Provider>
  );
}
