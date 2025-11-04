import * as Location from "expo-location";
import { router } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [buttonLoading, setButtonLoading] = useState(false);
  const [userData, setUserData] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [nextDelivery, setNextDelivery] = useState(null);

  // Live driving telemetry (no speed limit)
  const [speed, setSpeed] = useState(0);
  const [location, setLocation] = useState(null);
  const { width: screenWidth } = Dimensions.get("window");
  const user = auth.currentUser;

  // Initial load (user + parcels)
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

  // Subscribe to live user doc for speed (and status)
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        setUserData(d);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    let locationSub;
    const startTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      locationSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, distanceInterval: 1 },
        (pos) => {
          const kmh = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0;
          setSpeed(kmh);
          setLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          if (user) {
            updateDoc(doc(db, "users", user.uid), {
              location: {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                speedKmh: kmh,
              },
            });
          }
        }
      );
    };
    if (userData?.status === "Delivering") startTracking();
    return () => {
      if (locationSub) locationSub.remove();
    };
  }, [userData?.status]);

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
    await updateStatus("Available");
    await fetchParcels({ ...userData, status: "Available" });
  };

  const handleStartDelivering = async () => {
    await updateStatus("Delivering");
  };

  const handleEndShift = async () => {
    await updateStatus("Offline");
    setDeliveries([]);
    setNextDelivery(null);
  };

  // Cancel in Available state
  const handleCancelShift = async () => {
    await handleEndShift();
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
                  <Text style={styles.cancelText}>Cancel</Text>
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
                <Text style={styles.speedValue}>{speed}</Text>
                <Text style={styles.speedUnit}>km/h</Text>
              </View>

              {/* Go to Map button when Delivering */}
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
    paddingVertical: 0
  },
  scrollContent: { 
    paddingBottom: 20 
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
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
    color: "#333"
  },
  waitText: {
    color: "#666",
    fontStyle: "italic",
    marginTop: 4
  },
  speedCircle: {
    borderWidth: 6,
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
    color: "#fff"
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
    color: "#fff"
  },
});
