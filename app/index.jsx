import * as Location from "expo-location";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, StyleSheet, View } from "react-native";
import { auth, db } from "../firebaseConfig";

const SPLASH_DURATION = 2000;

export default function Index() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [splashReady, setSplashReady] = useState(false);

  const locationSubRef = useRef(null);
  const ensuredViolationsRef = useRef(false);
  const isAlertingViolationRef = useRef(false);
  const lastWriteTsRef = useRef(0);
  const hasNavigatedRef = useRef(false);

  // Splash timer
  useEffect(() => {
    const timer = setTimeout(() => setSplashReady(true), SPLASH_DURATION);
    return () => clearTimeout(timer);
  }, []);

  const stopLocationWatch = () => {
    if (locationSubRef.current) {
      try {
        locationSubRef.current.remove();
      } catch {}
      locationSubRef.current = null;
    }
  };

  const startLocationWatch = async (uid) => {
    try {
      if (locationSubRef.current) return;
      
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location Permission",
          "Location permission is required to update delivery location."
        );
        return;
      }

      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const initialSpeedKmh =
        typeof initial.coords.speed === "number" && isFinite(initial.coords.speed)
          ? Math.max(0, initial.coords.speed * 3.6)
          : null;

      await updateDoc(doc(db, "users", uid), {
        location: {
          latitude: initial.coords.latitude,
          longitude: initial.coords.longitude,
          speedKmh: initialSpeedKmh,
          heading: typeof initial.coords.heading === "number" ? initial.coords.heading : null,
          accuracy: typeof initial.coords.accuracy === "number" ? initial.coords.accuracy : null,
        },
        lastLocationAt: serverTimestamp(),
      });

      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 10000,
          distanceInterval: 25,
        },
        async (pos) => {
          const now = Date.now();
          if (now - lastWriteTsRef.current < 5000) return;
          lastWriteTsRef.current = now;

          const speedKmh =
            typeof pos.coords.speed === "number" && isFinite(pos.coords.speed)
              ? Math.max(0, pos.coords.speed * 3.6)
              : null;

          await updateDoc(doc(db, "users", uid), {
            location: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              speedKmh,
              heading: typeof pos.coords.heading === "number" ? pos.coords.heading : null,
              accuracy: typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
            },
            lastLocationAt: serverTimestamp(),
          }).catch(() => {});
        }
      );
    } catch {}
  };

  const speak = (msg) => {
    try {
      Speech.stop();
      Speech.speak(msg, {
        language: "en-US",
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
      });
    } catch {}
  };

  const showViolationsSequentially = async (userRef, currentList) => {
    if (isAlertingViolationRef.current) return;

    const hasUnconfirmed = (Array.isArray(currentList) ? currentList : []).some(
      (v) => !(v && v.confirmed === true)
    );
    if (!hasUnconfirmed) return;

    isAlertingViolationRef.current = true;

    const showNext = async () => {
      const freshSnap = await getDoc(userRef);
      const violations = freshSnap.exists() ? freshSnap.data()?.violations || [] : [];
      const nextIdx = violations.findIndex((v) => !(v && v.confirmed === true));

      if (nextIdx === -1) {
        isAlertingViolationRef.current = false;
        return;
      }

      const v = violations[nextIdx] || {};
      const lat = v?.driverLocation?.latitude ?? v?.driverLocation?.lat;
      const lng = v?.driverLocation?.longitude ?? v?.driverLocation?.lng;
      const when = v?.issuedAt?.toDate?.() ? v.issuedAt.toDate().toLocaleString() : "";

      const lines = [
        v?.message || v?.title || v?.code || "Violation",
        when ? `When: ${when}` : null,
        typeof lat === "number" && typeof lng === "number"
          ? `Location: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
          : null,
        Number.isFinite(v?.avgSpeed) ? `Average speed: ${v.avgSpeed} kilometers per hour` : null,
        Number.isFinite(v?.topSpeed) ? `Top speed: ${v.topSpeed} kilometers per hour` : null,
        Number.isFinite(v?.speedAtIssue)
          ? `Speed at issue: ${v.speedAtIssue} kilometers per hour`
          : null,
      ].filter(Boolean);

      const spoken = lines.join(". ");
      speak(spoken);

      Alert.alert(
        "Notice of Violation",
        lines.join("\n"),
        [
          {
            text: "OK",
            onPress: async () => {
              try {
                Speech.stop();
                const refSnap = await getDoc(userRef);
                const arr = refSnap.exists() ? refSnap.data()?.violations || [] : [];
                const idxToMark = arr.findIndex((x) => !(x && x.confirmed === true));

                if (idxToMark >= 0) {
                  const updated = arr.map((item, i) =>
                    i === idxToMark ? { ...(item || {}), confirmed: true } : item
                  );
                  await updateDoc(userRef, { violations: updated });
                }
                showNext();
              } catch {
                isAlertingViolationRef.current = false;
              }
            },
          },
        ],
        { cancelable: false }
      );
    };

    showNext();
  };

  useEffect(() => {
    let userDocUnsub = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      stopLocationWatch();
      hasNavigatedRef.current = false;

      if (!user) {
        setLoading(false);
        if (splashReady && !hasNavigatedRef.current) {
          hasNavigatedRef.current = true;
          router.replace("/Login");
        }
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        await signOut(auth);
        setLoading(false);
        if (splashReady && !hasNavigatedRef.current) {
          hasNavigatedRef.current = true;
          router.replace("/Login");
        }
        return;
      }

      userDocUnsub = onSnapshot(userRef, async (docSnap) => {
        if (!docSnap.exists()) return;

        const data = docSnap.data() || {};

        // Ensure violations array exists
        if (typeof data.violations === "undefined" && !ensuredViolationsRef.current) {
          ensuredViolationsRef.current = true;
          await updateDoc(userRef, { violations: [] }).catch(() => {});
        }

        // Show violations
        if (Array.isArray(data.violations)) {
          const hasUnconfirmed = data.violations.some((v) => !(v && v.confirmed === true));
          if (hasUnconfirmed) {
            showViolationsSequentially(userRef, data.violations);
          }
        }

        // Navigate once after splash
        setLoading(false);
        if (splashReady && !hasNavigatedRef.current) {
          hasNavigatedRef.current = true;
          const needsSetup = !data.accountSetupComplete || !data.vehicleSetupComplete;
          router.replace(needsSetup ? "/AccountSetup" : "/Home");
        }

        // Manage location tracking
        const status = (data.status || "").toString().toLowerCase();
        if (status === "delivering") {
          startLocationWatch(user.uid);
        } else {
          stopLocationWatch();
        }
      });
    });

    return () => {
      unsubscribeAuth();
      if (userDocUnsub) userDocUnsub();
      stopLocationWatch();
      Speech.stop();
    };
  }, [splashReady, router]);

  if (loading || !splashReady) {
    return (
      <View style={styles.container}>
        <Image source={require("../assets/images/logo.png")} style={styles.logo} />
        <ActivityIndicator size="large" color="#00b2e1" />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  logo: {
    width: "80%",
    height: 200,
    resizeMode: "contain",
  },
});