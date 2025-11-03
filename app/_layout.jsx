import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import * as Location from "expo-location";
import { Stack, useRouter } from "expo-router";
import * as Speech from "expo-speech";
import * as SplashScreen from "expo-splash-screen";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Navigation from "../components/Navigation";
import { auth, db } from "../firebaseConfig";

SplashScreen.preventAutoHideAsync().catch(() => {});

const logo = require("../assets/images/logo.png");
const { width } = Dimensions.get("window");
const DRAWER_WIDTH = width * 0.75;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "LEMONMILK-Bold": require("../assets/fonts/LEMONMILK-Bold.otf"),
    "Lexend-Regular": require("../assets/fonts/Lexend-Regular.ttf"),
    "Lexend-Medium": require("../assets/fonts/Lexend-Medium.ttf"),
    "Lexend-Bold": require("../assets/fonts/Lexend-Bold.ttf"),
  });

  const [appReady, setAppReady] = useState(false);

  const [loading, setLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState("Login");
  const [userData, setUserData] = useState(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const router = useRouter();

  const navigatedRef = useRef(false);
  const go = (path) => {
    if (!navigatedRef.current) {
      navigatedRef.current = true;
      router.replace(path);
    }
  };

  const locationSubRef = useRef(null);
  const lastWriteTsRef = useRef(0);

  const ensuredViolationsRef = useRef(false);
  const isAlertingViolationRef = useRef(false);

  const openMenu = () => {
    setMenuOpen(true);
    Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
  };
  const closeMenu = () => {
    Animated.timing(slideAnim, { toValue: -DRAWER_WIDTH, duration: 250, useNativeDriver: true }).start(() =>
      setMenuOpen(false)
    );
  };
  const BurgerButton = () => (
    <TouchableOpacity onPress={openMenu} style={{ marginLeft: 10 }}>
      <Ionicons name="menu" size={28} color="#333" />
    </TouchableOpacity>
  );

  useEffect(() => {
    if (fontsLoaded || fontError) {
      setAppReady(true);
    }
  }, [fontsLoaded, fontError]);

  const onLayoutRootView = useCallback(async () => {
    if (appReady) {
      try {
        await SplashScreen.hideAsync();
      } catch {}
    }
  }, [appReady]);

  const stopLocationWatch = () => {
    if (locationSubRef.current) {
      locationSubRef.current.remove();
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
          heading: typeof initial.coords.heading === "number" ? initial.coords.heading : null,
          accuracy: typeof initial.coords.accuracy === "number" ? initial.coords.accuracy : null,
        },
        lastLocationAt: serverTimestamp(),
      });

      locationSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 25 },
        async (pos) => {
          const now = Date.now();
          if (now - lastWriteTsRef.current < 5000) return;
          lastWriteTsRef.current = now;

          let speedKmh = null;
          if (typeof pos.coords.speed === "number" && isFinite(pos.coords.speed)) {
            speedKmh = Math.max(0, pos.coords.speed * 3.6);
          }
          try {
            await updateDoc(doc(db, "users", uid), {
              location: {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                speedKmh,
                heading: typeof pos.coords.heading === "number" ? pos.coords.heading : null,
                accuracy: typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
              },
              lastLocationAt: serverTimestamp(),
            });
          } catch {}
        }
      );
    } catch {}
  };

  const speak = (msg) => {
    try {
      Speech.stop();
      Speech.speak(msg, { language: "en-US", rate: 1.0, pitch: 1.0, volume: 1.0 });
    } catch {}
  };

  const showViolationsSequentially = async (userRef, currentList) => {
    if (isAlertingViolationRef.current) return;
    const hasUnconfirmed = (Array.isArray(currentList) ? currentList : []).some((v) => !(v && v.confirmed === true));
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
        typeof lat === "number" && typeof lng === "number" ? `Location: ${lat.toFixed(6)}, ${lng.toFixed(6)}` : null,
        Number.isFinite(v?.avgSpeed) ? `Average speed: ${v.avgSpeed} kilometers per hour` : null,
        Number.isFinite(v?.topSpeed) ? `Top speed: ${v.topSpeed} kilometers per hour` : null,
        Number.isFinite(v?.speedAtIssue) ? `Speed at issue: ${v.speedAtIssue} kilometers per hour` : null,
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
                  const updated = arr.map((item, i) => (i === idxToMark ? { ...(item || {}), confirmed: true } : item));
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

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        stopLocationWatch();
        navigatedRef.current = false;

        if (!user) {
          setUserData(null);
          setInitialRoute("Login");
          go("Login");
          return;
        }

        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          await signOut(auth);
          setUserData(null);
          setInitialRoute("Login");
          go("Login");
          return;
        }

        userDocUnsub = onSnapshot(userRef, async (docSnap) => {
          if (!docSnap.exists()) return;
          const data = docSnap.data() || {};
          setUserData(data);

          if (typeof data.violations === "undefined" && !ensuredViolationsRef.current) {
            try {
              ensuredViolationsRef.current = true;
              await updateDoc(userRef, { violations: [] });
            } catch {}
          }

          if (Array.isArray(data.violations)) {
            const hasUnconfirmed = data.violations.some((v) => !(v && v.confirmed === true));
            if (hasUnconfirmed) {
              showViolationsSequentially(userRef, data.violations);
            }
          }

          const needsSetup = !data.accountSetupComplete || !data.vehicleSetupComplete;
          const dest = needsSetup ? "AccountSetup" : "Home";
          setInitialRoute(dest);
          go(dest);

          const status = (data.status || "").toString().toLowerCase();
          if (status === "delivering") startLocationWatch(user.uid);
          else stopLocationWatch();
        });
      } catch {
        await signOut(auth);
        setUserData(null);
        setInitialRoute("Login");
        go("Login");
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (userDocUnsub) userDocUnsub();
      stopLocationWatch();
      Speech.stop();
    };
  }, [router]);

  if (!appReady) return null;

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, paddingTop: 0 }} edges={["left", "right", "bottom"]} onLayout={onLayoutRootView}>
      <Stack
        initialRouteName={initialRoute}
        screenOptions={{
          headerShown: true,
          headerTitleAlign: "center",
          headerStyle: {
            elevation: 0,
            shadowOpacity: 0,
            backgroundColor: "#fff",
          },
          headerLeft: () => <BurgerButton />,
          headerTitle: () => (
            <Image source={logo} style={{ width: 160, height: 35 }} resizeMode="contain" />
          ),
        }}
      >

        <Stack.Screen name="Login" options={{ headerShown: false }} />
        <Stack.Screen name="SignUp" options={{ headerShown: false }} />
        <Stack.Screen name="AccountSetup" options={{ headerShown: false }} />
        <Stack.Screen name="PreferredRoutesSetup" options={{ headerShown: false }} />
        <Stack.Screen name="Home" options={{ title: "" }} />
        <Stack.Screen name="Profile" options={{ title: "Profile" }} />
        <Stack.Screen name="Parcels" options={{ title: "Parcels" }} />
        <Stack.Screen name="Map" options={{ title: "Map" }} />
        <Stack.Screen name="DrivingStats" options={{ title: "Driving Stats" }} />
        <Stack.Screen name="ScanQR" options={{ headerShown: false }} />
      </Stack>

      {menuOpen && (
        <>
          <TouchableWithoutFeedback onPress={closeMenu}>
            <View style={styles.overlay} />
          </TouchableWithoutFeedback>
          <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}>
            <Navigation
              userData={userData}
              onNavigate={(path) => {
                closeMenu();
                router.replace(path);
              }}
            />
          </Animated.View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
    zIndex: 1,
  },
  drawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: "#fff",
    zIndex: 2,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
});
