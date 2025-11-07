import { useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapViewDirections from "react-native-maps-directions";
import { auth, db } from "../firebaseConfig";

const GOOGLE_MAPS_APIKEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function DriverDashboard() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [buttonLoading, setButtonLoading] = useState(false);
  const [parcels, setParcels] = useState([]);
  const [nextDelivery, setNextDelivery] = useState(null);
  const [etaMinutes, setEtaMinutes] = useState(null);
  const [distanceKm, setDistanceKm] = useState(null);
  const [location, setLocation] = useState(null);
  const [userData, setUserData] = useState(null);
  const user = auth.currentUser;

  useEffect(() => {
    const fetchParcelsAndUser = async () => {
      if (!user) return;
      try {
        setLoading(true);
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists()) setUserData(userSnap.data());
        const q = query(collection(db, "parcels"), where("driverUid", "==", user.uid));
        const snapshot = await getDocs(q);
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setParcels(list);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({});
          setLocation(loc.coords);
          const nearest = findNearestParcel(list, loc.coords);
          setNextDelivery(nearest);
        }
      } catch (error) {
        console.error("Error loading dashboard:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchParcelsAndUser();
  }, [user]);

  const findNearestParcel = (parcelList, coords) => {
    const outForDelivery = parcelList.filter(
      (p) => p.status === "Out for Delivery" && p.destination
    );
    if (outForDelivery.length === 0) return null;
    let nearest = outForDelivery[0];
    let minDistance = Infinity;
    outForDelivery.forEach((p) => {
      const d = Math.sqrt(
        Math.pow(p.destination.latitude - coords.latitude, 2) +
          Math.pow(p.destination.longitude - coords.longitude, 2)
      );
      if (d < minDistance) {
        minDistance = d;
        nearest = p;
      }
    });
    return nearest;
  };

  const updateDeliveryStatus = async (parcelId, status) => {
    try {
      setButtonLoading(true);
      await updateDoc(doc(db, "parcels", parcelId), { status });
      Alert.alert("Success", `Parcel marked as ${status}.`);
      const updatedParcels = parcels.map((p) =>
        p.id === parcelId ? { ...p, status } : p
      );
      setParcels(updatedParcels);
      if (location) {
        const nextNearest = findNearestParcel(updatedParcels, location);
        setNextDelivery(nextNearest);
      }
    } catch (err) {
      console.error("Failed to update status:", err);
      Alert.alert("Error", "Failed to update parcel status.");
    } finally {
      setButtonLoading(false);
    }
  };

  const totalParcels = parcels.length;
  const deliveredParcels = parcels.filter((p) => p.status === "Delivered").length;
  const successRate =
    totalParcels > 0 ? `${Math.round((deliveredParcels / totalParcels) * 100)}%` : "0%";

  const next = nextDelivery || {
    recipient: "No delivery assigned",
    address: "-",
    recipientContact: "-",
    parcelId: "-",
  };

  const destinations = parcels
    .filter((p) => p.destination)
    .map((p) => ({
      latitude: p.destination.latitude,
      longitude: p.destination.longitude,
    }));

  const finalDestination = destinations[destinations.length - 1];
  const waypoints = destinations.slice(0, -1);

  const handleRouteReady = (result) => {
    setEtaMinutes(Math.round(result.duration));
    setDistanceKm(result.distance);
  };

  if (loading)
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#00b2e1" />
        <Text>Loading your deliveries...</Text>
      </View>
    );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate("Parcels")}
      >
        <Text style={styles.sectionTitle}>Today&apos;s Deliveries</Text>
        <Text style={styles.stats}>
          {deliveredParcels}/{totalParcels} completed
        </Text>
        <View style={styles.progressBarBackground}>
          <View
            style={[
              styles.progressBarFill,
              { flex: totalParcels > 0 ? deliveredParcels / totalParcels : 0 },
            ]}
          />
          <View
            style={{
              flex: 1 - (totalParcels > 0 ? deliveredParcels / totalParcels : 0),
            }}
          />
        </View>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Next Delivery</Text>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Recipient:</Text>
          <Text style={styles.value}>{next.recipient}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Address:</Text>
          <Text style={styles.value}>
            {next.street
              ? `${next.street}, ${next.barangay}, ${next.municipality}`
              : next.address}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Contact:</Text>
          <Text style={styles.value}>{next.recipientContact}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Parcel ID:</Text>
          <Text style={styles.value}>{next.packageId || next.parcelId}</Text>
        </View>

        {nextDelivery ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: "#29bf12" }]}
              onPress={() => updateDeliveryStatus(next.id, "Delivered")}
              disabled={buttonLoading}
            >
              {buttonLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionText}>Delivered</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: "#f21b3f" }]}
              onPress={() => updateDeliveryStatus(next.id, "Cancelled")}
              disabled={buttonLoading}
            >
              {buttonLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionText}>Cancelled</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.noDelivery}>No active deliveries</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Quick Summary</Text>
        <View style={styles.detailRow}>
          <Text style={styles.label}>ETA:</Text>
          <Text style={styles.value}>
            {etaMinutes ? `${etaMinutes} min` : "Calculating..."}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Total Distance:</Text>
          <Text style={styles.value}>
            {distanceKm ? `${distanceKm.toFixed(1)} km` : "—"}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Success Rate:</Text>
          <Text style={styles.value}>{successRate}</Text>
        </View>
      </View>

      {location && finalDestination && (
        <MapViewDirections
          origin={{
            latitude: location.latitude,
            longitude: location.longitude,
          }}
          destination={finalDestination}
          waypoints={waypoints}
          apikey={GOOGLE_MAPS_APIKEY}
          strokeWidth={0}
          strokeColor="transparent"
          optimizeWaypoints
          mode="DRIVING"
          onReady={handleRouteReady}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  card: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
  },
  stats: {
    fontSize: 16,
    marginBottom: 6,
  },
  progressBarBackground: {
    flexDirection: "row",
    height: 10,
    backgroundColor: "#e0e0e0",
    borderRadius: 5,
    overflow: "hidden",
  },
  progressBarFill: {
    backgroundColor: "#29bf12",
    borderRadius: 5,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  label: {
    fontSize: 15,
    fontWeight: "500",
    color: "#333",
  },
  value: {
    fontSize: 15,
    color: "#555",
    flexShrink: 1,
    textAlign: "right",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  actionButton: {
    flex: 0.48,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  noDelivery: {
    textAlign: "center",
    color: "#777",
    marginTop: 10,
    fontStyle: "italic",
  },
});
