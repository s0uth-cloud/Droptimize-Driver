import { Alert, BackHandler, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { logoutUser } from "../firebaseConfig";

export default function Navigation({ onNavigate }) {
  const handleNavigate = (path) => {
    if (onNavigate) onNavigate(path); 
  };

  const handleSignOut = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: () => {
            logoutUser();
            if (onNavigate) onNavigate("/Login");
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleExit = () => {
    Alert.alert(
      "Exit App",
      "Are you sure you want to exit?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Exit",
          style: "destructive",
          onPress: () => {
            if (Platform.OS === "android") {
              BackHandler.exitApp();
            } else {
              console.log("Exit app (not supported on iOS)");
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <View style={styles.drawerContainer}>
      {/* Menu items */}
      <View style={styles.menuSection}>
        <Text style={styles.drawerTitle}>Menu</Text>

        <TouchableOpacity onPress={() => handleNavigate("/Home")}>
          <Text style={styles.menuItem}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => handleNavigate("/Profile")}>
          <Text style={styles.menuItem}>Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => handleNavigate("/Map")}>
          <Text style={styles.menuItem}>Map</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => handleNavigate("/Parcels")}>
          <Text style={styles.menuItem}>Parcels</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => handleNavigate("/DrivingStats")}>
          <Text style={styles.menuItem}>Driving Stats</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom buttons */}
      <View style={styles.bottomButtons}>
        <TouchableOpacity onPress={handleSignOut}>
          <Text style={[styles.menuItem, styles.signOut]}>Sign Out</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleExit}>
          <Text style={styles.menuItem}>Exit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  drawerContainer: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 20,
    justifyContent: "space-between",
    paddingVertical: 40,
  },
  menuSection: {
    gap: 15,
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#00b2e1",
  },
  menuItem: {
    fontSize: 16,
    paddingVertical: 8,
    color: "#333",
  },
  bottomButtons: {
    gap: 15,
  },
  signOut: {
    color: "#f21b3f",
  },
});
