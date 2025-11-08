import { router } from "expo-router";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Dashboard from "../components/DriverDashboard";
import { auth, db } from "../firebaseConfig";
import { useOverspeed } from "../provider/OverspeedProvider";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [buttonLoading, setButtonLoading] = useState(false);
  const [userData, setUserData] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [nextDelivery, setNextDelivery] = useState(null);

  const { width: screenWidth } = Dimensions.get("window");
  const user = auth.currentUser;

  const {
    speed,
    location,
    resetDrivingMetrics,
    initializeShiftMetrics,
    getShiftMetrics,
    topSpeed,
    totalDistance,
    avgSpeed,
  } = useOverspeed();

  useEffect(() => {
    const init = async () => {
      if (!user) return;
      try {
        setLoading(true);
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const data = userSnap.data();
        setUserData(data);

        if (!data?.preferredRoutes || data.preferredRoutes.length === 0) {
          router.replace("/PreferredRoutesSetup");
          return;
        }

        await fetchParcels(data);
      } catch (err) {
        console.error("Error initializing:", err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      setUserData(d);
    });
    return () => unsub();
  }, [user]);

  const fetchParcels = async (data) => {
    if (!user) return;
    const q = query(
      collection(db, "parcels"),
      where("driverUid", "==", user.uid),
      where("status", "==", "Out for Delivery")
    );
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setDeliveries(list);

    if (data?.preferredRoutes && list.length > 0) {
      const ordered = list.sort((a, b) => {
        const aIndex = data.preferredRoutes.indexOf(a.municipality);
        const bIndex = data.preferredRoutes.indexOf(b.municipality);
        return aIndex - bIndex;
      });
      setNextDelivery(ordered[0]);
    } else {
      setNextDelivery(null);
    }
  };

  const refetchUser = async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, "users", user.uid));
    setUserData(snap.data());
  };

  const updateStatus = async (newStatus) => {
    if (!user) return;
    try {
      setButtonLoading(true);
      await updateDoc(doc(db, "users", user.uid), { status: newStatus });
      await refetchUser();
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setButtonLoading(false);
    }
  };

  const handleStartShift = async () => {
    console.log("[Home] Starting shift - resetting metrics");
    await resetDrivingMetrics();
    await updateStatus("Available");
    await fetchParcels({ ...userData, status: "Available" });
  };

  const handleStartDelivering = async () => {
    if (!location) {
      Alert.alert(
        "Location Required",
        "Waiting for GPS location. Please try again in a moment.",
        [{ text: "OK" }]
      );
      return;
    }
    
    console.log("[Home] Starting delivery - initializing metrics with location:", location);
    await initializeShiftMetrics(location);
    
    await updateStatus("Delivering");
  };

  const handleEndShift = async () => {
    if (!user) return;

    try {
      setButtonLoading(true);

      // ✅ Get final metrics from provider
      const metrics = getShiftMetrics();
      const { durationMinutes, avgSpeed: finalAvgSpeed, topSpeed: finalTopSpeed, distance } = metrics;

      console.log("[Home] Ending shift - Final metrics:", metrics);

      // ✅ FIXED: Prevent saving if ALL values are 0 or meaningless
      // Check if we have any meaningful data
      const hasValidData = durationMinutes > 0 || distance > 0.01 || finalTopSpeed > 0;

      if (!hasValidData) {
        Alert.alert(
          "No Data Recorded",
          "No driving data was recorded during this shift. The shift will be cancelled without saving history.",
          [
            { 
              text: "OK", 
              onPress: async () => {
                // Just change status to offline without saving history
                await updateDoc(doc(db, "users", user.uid), {
                  status: "Offline",
                });
                await resetDrivingMetrics();
                setDeliveries([]);
                setNextDelivery(null);
                setButtonLoading(false);
              }
            }
          ]
        );
        return;
      }

      // ✅ Create driving history entry with validated data
      const drivingHistory = {
        message: "Shift completed",
        issuedAt: Timestamp.now(),
        avgSpeed: Math.round(finalAvgSpeed) || 0,
        topSpeed: Math.round(finalTopSpeed) || 0,
        distance: parseFloat(distance.toFixed(2)) || 0,
        time: durationMinutes || 0,
        driverLocation: location
          ? {
              latitude: location.latitude,
              longitude: location.longitude,
            }
          : null,
      };

      console.log("[Home] Saving driving history:", drivingHistory);

      // Save to Firestore
      await updateDoc(doc(db, "users", user.uid), {
        status: "Offline",
        violations: arrayUnion(drivingHistory),
      });

      // Reset local metrics after successful save
      await resetDrivingMetrics();
      setDeliveries([]);
      setNextDelivery(null);

      Alert.alert(
        "Shift Ended",
        `Shift completed successfully!\n\nDuration: ${durationMinutes} min\nDistance: ${distance.toFixed(1)} km\nTop Speed: ${finalTopSpeed} km/h\nAvg Speed: ${Math.round(finalAvgSpeed)} km/h`,
        [{ text: "OK" }]
      );

    } catch (err) {
      console.error("Failed to end shift:", err);
      Alert.alert(
        "Error",
        "Failed to save shift data. Please try again.",
        [{ text: "OK" }]
      );
    } finally {
      setButtonLoading(false);
    }
  };

  const handleCancelShift = async () => {
    if (!user) return;
    
    Alert.alert(
      "Cancel Shift",
      "Are you sure you want to cancel your shift? All tracking data will be lost.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              setButtonLoading(true);
              await updateDoc(doc(db, "users", user.uid), {
                status: "Offline",
              });
              setDeliveries([]);
              setNextDelivery(null);
              await resetDrivingMetrics();
              console.log("[Home] Shift cancelled");
            } catch (err) {
              console.error("Failed to cancel shift:", err);
            } finally {
              setButtonLoading(false);
            }
          }
        }
      ]
    );
  };

  if (loading)
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#00b2e1" />
        <Text style={{ marginTop: 10 }}>Loading your data...</Text>
      </View>
    );

  const status = userData?.status || "Offline";
  const hasParcels = deliveries.length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.topSection, { minHeight: screenWidth * 0.6 }]}>
          {status === "Offline" && (
            <>
              <Text style={styles.greeting}>
                Welcome Back, {userData?.firstName || "Driver"} 👋
              </Text>
              <Text style={styles.subheading}>Ready to start your shift?</Text>
              <TouchableOpacity
                style={[styles.startShiftButton, { width: screenWidth * 0.45 }]}
                onPress={handleStartShift}
                disabled={buttonLoading}
              >
                {buttonLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.startShiftText}>Start Shift</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {status === "Available" && (
            <View style={styles.statusBox}>
              <Text style={styles.statusLabel}>
                Status:{" "}
                <Text style={{ color: "#29bf12", fontWeight: "bold" }}>
                  Available
                </Text>
              </Text>

              {!hasParcels ? (
                <Text style={styles.waitText}>
                  Waiting for parcels to be assigned...
                </Text>
              ) : (
                <>
                  <Text style={styles.waitText}>
                    You have {deliveries.length} parcel
                    {deliveries.length > 1 ? "s" : ""} to deliver.
                  </Text>
                  <TouchableOpacity
                    style={[styles.startShiftButton, { width: screenWidth * 0.5 }]}
                    onPress={handleStartDelivering}
                    disabled={buttonLoading}
                  >
                    {buttonLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.startShiftText}>Start Delivering</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={[styles.cancelButton, { width: screenWidth * 0.4 }]}
                onPress={handleCancelShift}
                disabled={buttonLoading}
              >
                {buttonLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.cancelText}>Cancel Shift</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {status === "Delivering" && (
            <View style={styles.shiftCard}>
              <Text style={styles.statusLabel}>
                Status:{" "}
                <Text style={{ color: "#ff9914", fontWeight: "bold" }}>
                  Delivering
                </Text>
              </Text>

              <View
                style={[
                  styles.speedCircle,
                  {
                    width: screenWidth * 0.3,
                    height: screenWidth * 0.3,
                    borderRadius: screenWidth * 0.15,
                    borderColor: "#29bf12",
                  },
                ]}
              >
                <Text style={styles.speedValue}>{Math.round(speed)}</Text>
                <Text style={styles.speedUnit}>km/h</Text>
              </View>

              {/* ✅ Real-time metrics display */}
              <View style={styles.metricsContainer}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Distance</Text>
                  <Text style={styles.metricValue}>
                    {totalDistance.toFixed(2)} km
                  </Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Top Speed</Text>
                  <Text style={styles.metricValue}>{topSpeed} km/h</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Avg Speed</Text>
                  <Text style={styles.metricValue}>
                    {avgSpeed} km/h
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.mapButton, { width: screenWidth * 0.5 }]}
                onPress={() => router.push("/Map")}
              >
                <Text style={styles.mapButtonText}>Go to Map</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.endShiftButton, { width: screenWidth * 0.4 }]}
                onPress={handleEndShift}
                disabled={buttonLoading}
              >
                {buttonLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.endShiftText}>End Shift</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Dashboard
          shiftStarted={status === "Delivering"}
          deliveries={deliveries}
          nextDelivery={nextDelivery}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#fff",
    paddingVertical: 0,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
    color: "#fff",
  },
  subheading: {
    fontSize: 16,
    marginTop: 6,
    color: "#f0f0f0",
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
    color: "#fff",
  },
  shiftCard: {
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
  statusBox: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 10,
  },
  statusLabel: {
    fontSize: 16,
    marginBottom: 6,
    color: "#333",
  },
  waitText: {
    color: "#666",
    fontStyle: "italic",
    marginTop: 4,
    marginBottom: 12,
    textAlign: "center",
  },
  speedCircle: {
    borderWidth: 6,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 10,
  },
  speedValue: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#29bf12",
  },
  speedUnit: {
    fontSize: 14,
    color: "#555",
  },
  metricsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  metricItem: {
    alignItems: "center",
    flex: 1,
  },
  metricLabel: {
    fontSize: 12,
    color: "#777",
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
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
    color: "#fff",
  },
  cancelButton: {
    marginTop: 10,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f21b3f",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  mapButton: {
    marginTop: 14,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0064b5",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  mapButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});