import { doc, onSnapshot } from "firebase/firestore";
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
import { auth, db } from "../firebaseConfig";

export default function DrivingStats() {
  const [selectedTab, setSelectedTab] = useState("all");
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [drivingData, setDrivingData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Not Logged In", "Please log in to see your driving stats.");
      setLoading(false);
      return;
    }

    const userRef = doc(db, "users", user.uid);

    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        const data = snapshot.data();
        if (data?.violations && Array.isArray(data.violations)) {
          const sortedData = [...data.violations].sort((a, b) => {
            const aTime = a?.issuedAt?.seconds || 0;
            const bTime = b?.issuedAt?.seconds || 0;
            return bTime - aTime;
          });
          setDrivingData(sortedData);
        } else {
          setDrivingData([]);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching user violations:", error);
        Alert.alert("Error", "Failed to load driving stats.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const overspeedingHistory = drivingData.filter((v) =>
    String(v.message ?? "").toLowerCase().includes("speed")
  );

  const dataToShow = selectedTab === "all" ? drivingData : overspeedingHistory;

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#00b2e1" />
        <Text style={{ marginTop: 10 }}>Loading driving stats...</Text>
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
            { backgroundColor: selectedTab === "all" ? "#00b2e1" : "#e0e0e0" },
          ]}
          onPress={() => {
            setSelectedTab("all");
            setExpandedIndex(null);
          }}
        >
          <Text
            style={{
              color: selectedTab === "all" ? "#fff" : "#0064b5",
              fontWeight: "bold",
            }}
          >
            All
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            {
              backgroundColor:
                selectedTab === "overspeeding" ? "#00b2e1" : "#e0e0e0",
            },
          ]}
          onPress={() => {
            setSelectedTab("overspeeding");
            setExpandedIndex(null);
          }}
        >
          <Text
            style={{
              color: selectedTab === "overspeeding" ? "#fff" : "#0064b5",
              fontWeight: "bold",
            }}
          >
            Overspeeding
          </Text>
        </TouchableOpacity>
      </View>

      {/* Driving Violations */}
      {dataToShow.length === 0 ? (
        <Text style={{ textAlign: "center", marginTop: 20, color: "#777" }}>
          No driving records found.
        </Text>
      ) : (
        <FlatList
          data={dataToShow}
          keyExtractor={(_, index) => index.toString()}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={styles.historyCard}
              onPress={() =>
                setExpandedIndex(expandedIndex === index ? null : index)
              }
            >
              {/* Header */}
              <View style={styles.cardHeader}>
                <Text style={styles.dateText}>
                  {item.issuedAt?.seconds
                    ? new Date(item.issuedAt.seconds * 1000).toLocaleString()
                    : "No timestamp"}
                </Text>
                {String(item.message ?? "").toLowerCase().includes("speed") && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>Overspeeding</Text>
                  </View>
                )}
              </View>

              {/* Summary */}
              {expandedIndex !== index && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryText}>
                    Avg: {item.avgSpeed ?? "—"} km/h
                  </Text>
                  <Text style={styles.summaryText}>
                    Top: {item.topSpeed ?? "—"} km/h
                  </Text>
                </View>
              )}

              {/* Expanded Details */}
              {expandedIndex === index && (
                <View style={styles.details}>
                  <Text style={styles.sectionTitle}>Details</Text>
                  <Text>Message: {item.message ?? "—"}</Text>
                  <Text>Average Speed: {item.avgSpeed ?? "—"} km/h</Text>
                  <Text>Top Speed: {item.topSpeed ?? "—"} km/h</Text>
                  <Text>Distance: {item.distance ?? "—"} km</Text>
                  <Text>Time: {item.time ?? "—"} mins</Text>
                  {item.driverLocation && (
                    <Text>
                      Location: {item.driverLocation.latitude},{" "}
                      {item.driverLocation.longitude}
                    </Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 10,
  },
  tabContainer: {
    flexDirection: "row",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
  },
  historyCard: {
    padding: 15,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: "#f9f9f9",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  badge: {
    backgroundColor: "#f21b3f",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#555",
  },
  details: {
    marginTop: 10,
  },
  sectionTitle: {
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 4,
    color: "#00b2e1",
  },
});
