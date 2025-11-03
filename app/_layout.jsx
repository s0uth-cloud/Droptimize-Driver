import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const router = useRouter();

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
    if (fontsLoaded || fontError) setAppReady(true);
  }, [fontsLoaded, fontError]);

  const onLayoutRootView = useCallback(async () => {
    if (appReady) {
      try {
        await SplashScreen.hideAsync();
      } catch {}
    }
  }, [appReady]);

  if (!appReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["left", "right", "bottom"]} onLayout={onLayoutRootView}>
      <Stack
        screenOptions={{
          headerShown: true,
          headerTitleAlign: "center",
          headerStyle: { elevation: 0, shadowOpacity: 0, backgroundColor: "#fff" },
          headerLeft: () => <BurgerButton />,
          headerTitle: () => <Image source={logo} style={{ width: 160, height: 35 }} resizeMode="contain" />,
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