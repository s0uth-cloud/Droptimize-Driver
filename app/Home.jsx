import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Dimensions, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Dashboard from "../components/DriverDashboard";
import { auth, db } from "../firebaseConfig";

export default function Home() {
  const [shiftStarted, setShiftStarted] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [speedLimit, setSpeedLimit] = useState(60);
  const { width: screenWidth } = Dimensions.get("window");

  const user = auth.currentUser;
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const fetchUserData = async () => {
      if (user) {
        const userRef = await getDoc(doc(db, "users", user.uid));
        setUserData(userRef.data());
      }
    };
    fetchUserData();
  }, [user]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Greeting OR Speedometer */}
        <View style={[styles.topSection, { minHeight: screenWidth * 0.6 }]}>
          {!shiftStarted ? (
            <>
              <Text style={styles.greeting}>
                Welcome Back, {userData?.firstName || "Driver"} 👋
              </Text>
              <Text style={styles.subheading}>
                Ready to start your shift today?
              </Text>
              <TouchableOpacity
                style={[styles.startShiftButton, { width: screenWidth * 0.45 }]}
                onPress={() => setShiftStarted(true)}
              >
                <Text style={styles.startShiftText}>Start Shift</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.speedometerCard}>
              <View
                style={[
                  styles.speedCircle,
                  {
                    width: screenWidth * 0.3,
                    height: screenWidth * 0.3,
                    borderRadius: screenWidth * 0.15,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.speedValue,
                    speed > speedLimit && { color: "#f21b3f" },
                  ]}
                >
                  {speed}
                </Text>
                <Text style={styles.speedUnit}>km/h</Text>
              </View>
              <Text style={styles.speedLimit}>Limit: {speedLimit} km/h</Text>

              <TouchableOpacity
                style={[styles.endShiftButton, { width: screenWidth * 0.4 }]}
                onPress={() => setShiftStarted(false)}
              >
                <Text style={styles.endShiftText}>End Shift</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Dashboard */}
        <Dashboard shiftStarted={shiftStarted} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { 
    flex: 1, 
    backgroundColor: "#fff" 
  },
  scrollContent: { 
    paddingBottom: 20 
  },
  topSection: {
    backgroundColor: "#00b2e1",
    padding: 20,
    justifyContent: "center",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  greeting: { 
    fontSize: 24, 
    fontWeight: "700", 
    color: "#fff" 
  },
  subheading: { 
    fontSize: 16, 
    marginTop: 6, 
    color: "#f0f0f0" 
  },
  startShiftButton: {
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#29bf12",
    borderRadius: 10,
    marginTop: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  startShiftText: { 
    fontSize: 16, 
    fontWeight: "600", 
    color: "#fff" 
  },
  speedometerCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
    marginTop: 10,
  },
  speedCircle: {
    borderWidth: 6,
    borderColor: "#29bf12",
    justifyContent: "center",
    alignItems: "center",
  },
  speedValue: { 
    fontSize: 36, 
    fontWeight: "bold", 
    color: "#29bf12" 
  },
  speedUnit: { 
    fontSize: 14, 
    color: "#555" 
  },
  speedLimit: { 
    fontSize: 16, 
    marginTop: 10, 
    color: "#777" 
  },
  endShiftButton: {
    marginTop: 16,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f21b3f",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  endShiftText: { 
    fontSize: 16, 
    fontWeight: "600",
    color: "#fff" 
  },
});
