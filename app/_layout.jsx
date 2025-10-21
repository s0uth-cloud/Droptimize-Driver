import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Dimensions, Image, SafeAreaView, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";

import Navigation from "../components/Navigation";
import { auth, db } from "../firebaseConfig";

SplashScreen.preventAutoHideAsync();

const logo = require("../assets/images/logo.png");
const { width } = Dimensions.get("window");
const DRAWER_WIDTH = width * 0.75;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "LEMONMILK-Bold": require("../assets/fonts/LEMONMILK-Bold.otf"),
  });
  
  const [loading, setLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState("Login");
  const [userData, setUserData] = useState(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const router = useRouter();

  const openMenu = () => {
    setMenuOpen(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const closeMenu = () => {
    Animated.timing(slideAnim, {
      toValue: -DRAWER_WIDTH,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setMenuOpen(false));
  };

  const BurgerButton = () => (
    <TouchableOpacity onPress={openMenu} style={{ marginLeft: 10 }}>
      <Ionicons name="menu" size={28} color="#333" />
    </TouchableOpacity>
  );

  useEffect(() => {
    const hideSplash = async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {}
    };

    if (fontsLoaded || fontError) {
      hideSplash();
    }

    const timer = setTimeout(() => hideSplash(), 3000);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontError]);

  // Auth + initial route setup
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (!user) {
          setInitialRoute("Login");
        } else {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (!snap.exists()) {
            await signOut(auth);
            setInitialRoute("Login");
            return;
          }

          const data = snap.data();
          setUserData(data);

          const needsSetup =
            !data.accountSetupComplete || !data.vehicleSetupComplete;
          setInitialRoute(needsSetup ? "AccountSetup" : "Home");
        }
      } catch (err) {
        console.error(err);
        await signOut(auth);
        setInitialRoute("Login");
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
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
            <Image
              source={logo}
              style={{ width: 160, height: 35 }}
              resizeMode="contain"
            />
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
        <Stack.Screen name="Settings" options={{ title: "Settings" }} />
      </Stack>

      {menuOpen && (
        <>
          <TouchableWithoutFeedback onPress={closeMenu}>
            <View style={styles.overlay} />
          </TouchableWithoutFeedback>
          <Animated.View
            style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}
          >
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
  },
});
