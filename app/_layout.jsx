import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import Navigation from "../components/Navigation";

const logo = require("../assets/images/logo.png");
const { width } = Dimensions.get("window");
const DRAWER_WIDTH = width * 0.75;

export default function RootLayout() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  // ✅ Load both LEMONMILK and Lexend fonts globally
  const [fontsLoaded, fontError] = useFonts({
    "LEMONMILK-Bold": require("../assets/fonts/LEMONMILK-Bold.otf"),
    "Lexend-Regular": require("../assets/fonts/Lexend-Regular.ttf"),
    "Lexend-Medium": require("../assets/fonts/Lexend-Medium.ttf"),
    "Lexend-Bold": require("../assets/fonts/Lexend-Bold.ttf"),
  });

  if (!fontsLoaded && !fontError) {
    // Simple loading fallback while fonts load
    return (
      <View style={styles.loaderContainer}>
        <Image source={logo} style={{ width: 180, height: 40, resizeMode: "contain" }} />
        <ActivityIndicator size="large" color="#00b2e1" />
      </View>
    );
  }

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

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: true,
          headerTitleAlign: "center",
          headerStyle: { backgroundColor: "#fff", elevation: 0, shadowOpacity: 0 },
          headerLeft: () => <BurgerButton />,
          headerTitle: () => (
            <Image source={logo} style={{ width: 160, height: 35 }} resizeMode="contain" />
          ),
        }}
      >
        {/* Hide headers for auth/setup routes */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="Login" options={{ headerShown: false }} />
        <Stack.Screen name="SignUp" options={{ headerShown: false }} />
        <Stack.Screen name="AccountSetup" options={{ headerShown: false }} />
        <Stack.Screen name="PreferredRoutesSetup" options={{ headerShown: false }} />

        {/* Regular app pages (show header + burger) */}
        <Stack.Screen name="Home" options={{ title: "" }} />
        <Stack.Screen name="Profile" options={{ title: "Profile" }} />
        <Stack.Screen name="Parcels" options={{ title: "Parcels" }} />
        <Stack.Screen name="Map" options={{ title: "Map" }} />
        <Stack.Screen name="DrivingStats" options={{ title: "Driving Stats" }} />
      </Stack>

      {menuOpen && (
        <>
          <TouchableWithoutFeedback onPress={closeMenu}>
            <View style={styles.overlay} />
          </TouchableWithoutFeedback>
          <Animated.View style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}>
            {/* ✅ Pass router.replace directly for navigation */}
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
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
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
