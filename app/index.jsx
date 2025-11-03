import * as Location from "expo-location";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, StyleSheet, View } from "react-native";
import { auth, db } from "../firebaseConfig";

export default function Index() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);

  const locationSubRef = useRef(null);
  const ensuredViolationsRef = useRef(false);
  const isAlertingViolationRef = useRef(false);
  const lastWriteTsRef = useRef(0);

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
        Alert.alert("Location Permission", "Location permission is required to update delivery location.");
        return;
      }

      const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const initialSpeedKmh =
        typeof initial.coords.speed === "number" && isFinite(initial.coords.speed)
          ? Math.max(0, initial.coords.speed * 3.6)
          : null;

      await updateDoc(doc(db, "users", uid), {
        location: {
          latitude: initial.coords.latitude,
          longitude: initial.coords.longitude,
          speedKmh: initialSpeedKmh,
        },
        lastLocationAt: serverTimestamp(),
      });

      locationSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 25 },
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
      Speech.speak(msg, { language: "en-US", rate: 1.0 });
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
      const lines = [v?.message || v?.title || "Violation"].filter(Boolean);
      speak(lines.join(". "));

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

      if (!user) {
        setUserData(null);
        setLoading(false);
        router.replace("/Login");
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await signOut(auth);
        setUserData(null);
        setLoading(false);
        router.replace("/Login");
        return;
      }

      userDocUnsub = onSnapshot(userRef, async (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data() || {};
        setUserData(data);

        if (typeof data.violations === "undefined" && !ensuredViolationsRef.current) {
          ensuredViolationsRef.current = true;
          await updateDoc(userRef, { violations: [] });
        }

        if (Array.isArray(data.violations)) {
          const hasUnconfirmed = data.violations.some((v) => !(v && v.confirmed === true));
          if (hasUnconfirmed) showViolationsSequentially(userRef, data.violations);
        }

        const needsSetup = !data.accountSetupComplete || !data.vehicleSetupComplete;
        setLoading(false);
        router.replace(needsSetup ? "/AccountSetup" : "/Home");

        const status = (data.status || "").toString().toLowerCase();
        if (status === "delivering") startLocationWatch(user.uid);
        else stopLocationWatch();
      });
    });

    return () => {
      unsubscribeAuth();
      if (userDocUnsub) userDocUnsub();
      stopLocationWatch();
      Speech.stop();
    };
  }, []);

  if (loading) {
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