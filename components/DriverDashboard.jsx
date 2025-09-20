import { useNavigation } from "@react-navigation/native";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function DriverDashboard() {
  const navigation = useNavigation();

  const totalParcels = 20;
  const deliveredParcels = 5;
  const progress = deliveredParcels / totalParcels;

  const nextDelivery = {
    recipient: "Juan Dela Cruz",
    address: "123 Ayala Ave, Makati City",
    status: "Pending",
    codAmount: "₱500",
    parcelId: "PCL-10234",
    contact: "09171234567",
  };

  const summary = {
    successRate: "85%",
    hoursLeft: "3h 15m",
    estimatedFinish: "4:30 PM",
  };

  return (
    <View style={styles.container}>
      {/* Progress Section (clickable → Parcels) */}
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
          <View style={[styles.progressBarFill, { flex: progress }]} />
          <View style={{ flex: 1 - progress }} />
        </View>
      </TouchableOpacity>

      {/* Next Delivery (clickable → Map) */}
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() =>
          navigation.navigate("Map", { delivery: nextDelivery })
        }
      >
        <Text style={styles.sectionTitle}>Next Delivery</Text>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Recipient:</Text>
          <Text style={styles.value}>{nextDelivery.recipient}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Address:</Text>
          <Text style={styles.value}>{nextDelivery.address}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Contact:</Text>
          <Text style={styles.value}>{nextDelivery.contact}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Parcel ID:</Text>
          <Text style={styles.value}>{nextDelivery.parcelId}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>COD:</Text>
          <Text style={styles.value}>{nextDelivery.codAmount}</Text>
        </View>
        <Text style={styles.cardStatus}>Status: {nextDelivery.status}</Text>
      </TouchableOpacity>

      {/* Quick Summary (static) */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Quick Summary</Text>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Success Rate:</Text>
          <Text style={styles.value}>{summary.successRate}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Hours Left:</Text>
          <Text style={styles.value}>{summary.hoursLeft}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.label}>Estimated Finish:</Text>
          <Text style={styles.value}>{summary.estimatedFinish}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  },
  cardStatus: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "600",
    color: "#f21b3f",
  },
});
