import { useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function DrivingStats() {
  const [selectedTab, setSelectedTab] = useState("all");
  const [expandedDate, setExpandedDate] = useState(null);

  const allHistory = [
    {
      date: "2025-09-15",
      stats: {
        distance: "120 km",
        avgSpeed: "45 km/h",
        topSpeed: "95 km/h",
        time: "6h 32m",
      },
      overspeeding: [
        { location: "Main St., City Center", speed: "95 km/h" },
        { location: "Highway 101", speed: "100 km/h" },
      ],
    },
    {
      date: "2025-09-14",
      stats: {
        distance: "80 km",
        avgSpeed: "40 km/h",
        topSpeed: "70 km/h",
        time: "4h 10m",
      },
      overspeeding: [],
    },
  ];

  const overspeedingHistory = allHistory.filter(
    (h) => h.overspeeding.length > 0
  );

  const dataToShow = selectedTab === "all" ? allHistory : overspeedingHistory;

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tab,
            {
              backgroundColor: selectedTab === "all" ? "#00b2e1" : "#e0e0e0",
            },
          ]}
          onPress={() => {
            setSelectedTab("all");
            setExpandedDate(null);
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
            setExpandedDate(null);
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

      {/* Driving History List */}
      <FlatList
        data={dataToShow}
        keyExtractor={(item, index) => `${item.date}-${index}`}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.historyCard}
            onPress={() =>
              setExpandedDate(expandedDate === item.date ? null : item.date)
            }
          >
            {/* Header Row */}
            <View style={styles.cardHeader}>
              <Text style={styles.dateText}>{item.date}</Text>
              {item.overspeeding.length > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {item.overspeeding.length}x Overspeeding
                  </Text>
                </View>
              )}
            </View>

            {/* Summary Stats when collapsed */}
            {expandedDate !== item.date && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryText}>
                  Distance: {item.stats.distance}
                </Text>
                <Text style={styles.summaryText}>
                  Top: {item.stats.topSpeed}
                </Text>
              </View>
            )}

            {/* Expanded Details */}
            {expandedDate === item.date && (
              <View style={styles.details}>
                <Text style={styles.sectionTitle}>Stats</Text>
                <Text>Distance: {item.stats.distance}</Text>
                <Text>Avg Speed: {item.stats.avgSpeed}</Text>
                <Text>Top Speed: {item.stats.topSpeed}</Text>
                <Text>Time: {item.stats.time}</Text>

                {item.overspeeding.length > 0 && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.sectionTitle}>
                      Overspeeding Instances
                    </Text>
                    {item.overspeeding.map((o, i) => (
                      <Text key={`${item.date}-os-${i}`}>
                        • {o.location} — {o.speed}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        )}
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
    // keep shadow simple for cross-platform
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
  dateText: { fontSize: 16, fontWeight: "bold" },
  badge: {
    backgroundColor: "#f21b3f",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
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
  details: { marginTop: 10 },
  sectionTitle: {
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 4,
    color: "#29bf12",
  },
});
