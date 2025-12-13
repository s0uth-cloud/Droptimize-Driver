// External dependencies
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

// Internal dependencies
import ParcelDetailsModal from "../components/ParcelDetailsModal";
import { auth, db } from "../firebaseConfig";

/**
 * Displays driver's assigned parcels with filtering by delivery status and history.
 * Shows tabs for "To Deliver" (active) and "History" (completed/failed) parcels.
 * Implements real-time updates using Firestore onSnapshot, status-based filtering, and parcel detail modal for status updates.
 * Color-codes parcels by status and provides status update functionality through ParcelDetailsModal.
 */
export default function Parcels() {
  const [selectedTab, setSelectedTab] = useState("toDeliver");
  const [parcels, setParcels] = useState([]);
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [historyFilter, setHistoryFilter] = useState("All");
  const [loading, setLoading] = useState(true);

  const statusColors = {
    "To Deliver": "#ff9914",
    "Out for Delivery": "#ff9914",
    Delivered: "#29bf12",
    Failed: "#f21b3f",
  };

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const parcelsRef = collection(db, "parcels");
    const q = query(parcelsRef, where("driverUid", "==", user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((doc) => ({
          parcelId: doc.id,
          ...doc.data(),
        }));
        setParcels(fetched);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching parcels:", error);
        Alert.alert("Error", "Unable to load parcels. Please try again.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  /**
   * Updates parcel status in Firestore with appropriate timestamps (DeliveredAt or FailedAt).
   * Adds timestamp based on new status and shows alert on success or error.
   */
  const handleUpdateStatus = async (parcelId, newStatus) => {
    try {
      const parcelRef = doc(db, "parcels", parcelId);
      const updateData = {
        status: newStatus,
        updatedAt: new Date(),
      };
      if (newStatus === "Delivered") {
        updateData.DeliveredAt = new Date();
      } else if (newStatus === "Failed") {
        updateData.FailedAt = new Date();
      }
      await updateDoc(parcelRef, updateData);
      setParcels((prev) =>
        prev.map((p) =>
          p.parcelId === parcelId ? { ...p, status: newStatus } : p
        )
      );
      Alert.alert("Success", `Parcel marked as ${newStatus}.`);
    } catch (error) {
      console.error("Error updating status:", error);
      Alert.alert("Error", "Failed to update parcel status. Please try again.");
    }
  };

  const filteredParcels = parcels.filter((p) => {
    if (selectedTab === "toDeliver") {
      return p.status === "To Deliver" || p.status === "Out for Delivery";
    } else {
      if (historyFilter === "All") {
        return ["Delivered", "Failed"].includes(p.status);
      }
      return p.status === historyFilter;
    }
  });

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#00b2e1" />
        <Text style={{ marginTop: 10 }}>Loading parcels...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            { backgroundColor: selectedTab === "toDeliver" ? "#00b2e1" : "#e0e0e0" },
          ]}
          onPress={() => setSelectedTab("toDeliver")}
        >
          <Text
            style={{
              color: selectedTab === "toDeliver" ? "#fff" : "#0064b5",
              fontWeight: "bold",
            }}
          >
            To Deliver
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            { backgroundColor: selectedTab === "history" ? "#00b2e1" : "#e0e0e0" },
          ]}
          onPress={() => setSelectedTab("history")}
        >
          <Text
            style={{
              color: selectedTab === "history" ? "#fff" : "#0064b5",
              fontWeight: "bold",
            }}
          >
            History
          </Text>
        </TouchableOpacity>
      </View>

      {/* History Filter */}
      {selectedTab === "history" && (
        <View style={styles.filterContainer}>
          {["All", "Delivered", "Failed"].map((status) => {
            const colors = {
              All: "#00b2e1",
              Delivered: "#29bf12",
              Failed: "#f21b3f",
            };

            return (
              <TouchableOpacity
                key={status}
                style={[
                  styles.filterButton,
                  {
                    backgroundColor:
                      historyFilter === status ? colors[status] : "#f0f0f0",
                  },
                ]}
                onPress={() => setHistoryFilter(status)}
              >
                <Text
                  style={{
                    color: historyFilter === status ? "#fff" : "#0064b5",
                    fontWeight: "bold",
                  }}
                >
                  {status}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Parcel List */}
      {filteredParcels.length === 0 ? (
        <Text style={{ textAlign: "center", marginTop: 20, color: "#777" }}>
          No parcels found.
        </Text>
      ) : (
        <FlatList
          data={filteredParcels}
          keyExtractor={(item) => item.parcelId}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.parcelCard}
              onPress={() => setSelectedParcel(item)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.parcelName}>{item.recipient}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: statusColors[item.status] || "#ccc" },
                  ]}
                >
                  <Text style={styles.statusText}>{item.status}</Text>
                </View>
              </View>
              <Text style={styles.parcelText}>
                {item.street ? item.street + ", ": ""  } {item.barangay}, {item.municipality}, {item.province}
              </Text>
              <Text style={styles.parcelText}>{item.contact}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <ParcelDetailsModal
        visible={!!selectedParcel}
        parcel={selectedParcel}
        onClose={() => setSelectedParcel(null)}
        onUpdateStatus={handleUpdateStatus}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 10 },
  tabContainer: {
    flexDirection: "row",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 10,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 12 },
  filterContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 12,
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  parcelCard: {
    padding: 15,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: "#f9f9f9",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  parcelName: { fontSize: 16, fontWeight: "bold" },
  parcelText: { fontSize: 14, marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
});
