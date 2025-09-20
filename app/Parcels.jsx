import { useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ParcelDetailsModal from "../components/ParcelDetailsModal";

const initialParcels = [
  {
    ParcelID: "P001",
    Reference: "REF123",
    Recipient: "Juan Dela Cruz",
    FullAddress: "123 Sample St, Barangay 123, Manila",
    Barangay: "Barangay 123",
    City: "Manila",
    Province: "Metro Manila",
    PostalCode: "1000",
    Contact: "9876543219",
    CODAmount: 500,
    Weight: "2kg",
    Status: "To Deliver",
    DateAdded: "2025-09-10",
    Courier: "J&T",
    Notes: "Handle with care",
  },
  {
    ParcelID: "P002",
    Reference: "REF456",
    Recipient: "Maria Santos",
    FullAddress: "456 Example Rd, Barangay 456, Quezon City",
    Barangay: "Barangay 456",
    City: "Quezon City",
    Province: "Metro Manila",
    PostalCode: "1100",
    Contact: "9123456789",
    CODAmount: 1200,
    Weight: "3kg",
    Status: "Delivered",
    DateAdded: "2025-09-11",
    Courier: "LBC",
    Notes: "Leave at front desk",
  },
];

export default function Parcels() {
  const [selectedTab, setSelectedTab] = useState("toDeliver");
  const [parcels, setParcels] = useState(initialParcels);
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [historyFilter, setHistoryFilter] = useState("All");

  const statusColors = {
    "To Deliver": "#ff9914",
    Delivered: "#29bf12",
    Failed: "#f21b3f",
    Cancelled: "#f21b3f",
  };

  const handleUpdateStatus = (parcelId, newStatus) => {
    setParcels((prev) =>
      prev.map((p) =>
        p.ParcelID === parcelId ? { ...p, Status: newStatus } : p
      )
    );
  };

  // Filtering logic
  const filteredParcels = parcels.filter((p) => {
    if (selectedTab === "toDeliver") {
      return p.Status === "To Deliver";
    } else {
      if (historyFilter === "All") {
        return ["Delivered", "Cancelled", "Failed"].includes(p.Status);
      }
      return p.Status === historyFilter;
    }
  });

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
          {["All", "Delivered", "Failed", "Cancelled"].map((status) => {
            const colors = {
              All: "#00b2e1",
              Delivered: "#29bf12",
              Failed: "#f21b3f",
              Cancelled: "#ff9914",
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
      <FlatList
        data={filteredParcels}
        keyExtractor={(item) => item.ParcelID}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.parcelCard}
            onPress={() => setSelectedParcel(item)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.parcelName}>{item.Recipient}</Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusColors[item.Status] || "#ccc" },
                ]}
              >
                <Text style={styles.statusText}>{item.Status}</Text>
              </View>
            </View>
            <Text style={styles.parcelText}>{item.FullAddress}</Text>
            <Text style={styles.parcelText}>{item.Contact}</Text>
          </TouchableOpacity>
        )}
      />

      {/* Modal */}
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
  container: { 
    flex: 1, 
    backgroundColor: "#fff", 
    padding: 10 
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
    paddingVertical: 12 
  },
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
  parcelName: { 
    fontSize: 16, 
    fontWeight: "bold" 
  },
  parcelText: { 
    fontSize: 14, 
    marginTop: 2 
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: { 
    color: "#fff", 
    fontWeight: "bold", 
    fontSize: 12 
  },
});
