import { StyleSheet, Text, View } from "react-native";

export default function DriverStatus() {
  const driverStatus = "available"; // You can change this to "busy" or other status

  const statusColor = {
    available: "#29bf12",  // Green
    busy: "#ff9914",       // Orange
    offline: "#c4cad0",    // Gray
  };

  return (
    <View style={styles.statusRow}>
      <View
        style={[
          styles.statusCircle,
          { backgroundColor: statusColor[driverStatus] || "#c4cad0" },
        ]}
      />
      <Text style={styles.text}>
        {driverStatus.charAt(0).toUpperCase() + driverStatus.slice(1)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  text: {
    fontSize: 18,
    fontWeight: "bold",
    textTransform: "capitalize",
    color: "#313131",
  },
});
