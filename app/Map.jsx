import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

export default function Map() {
  // Mock data
  const speedLimit = 60;
  const vehicleSpeed = 75;
  const nextParcel = "123 Sampaguita St, Quezon City";

  // Determine if overspeeding
  const isOverspeeding = vehicleSpeed > speedLimit;

  return (
    <View style={styles.container}>
      {/* Google Map */}
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: 14.5995,
          longitude: 120.9842,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        <Marker
          coordinate={{ latitude: 14.5995, longitude: 120.9842 }}
          title="Current Location"
        />
      </MapView>

      {/* Floating Info Panel */}
      <View style={styles.infoPanel}>
        {/* Speed Section */}
        <View style={styles.row}>
          <View style={styles.speedCard}>
            <Text style={styles.label}>Speed Limit</Text>
            <Text style={[styles.speedValue, { color: "#29bf12" }]}>
              {speedLimit}
            </Text>
            <Text style={styles.unit}>km/h</Text>
          </View>

          <View style={styles.speedCard}>
            <Text style={styles.label}>Vehicle Speed</Text>
            <Text
              style={[
                styles.speedValue,
                { color: isOverspeeding ? "#f21b3f" : "#29bf12" },
              ]}
            >
              {vehicleSpeed}
            </Text>
            <Text style={styles.unit}>km/h</Text>
          </View>
        </View>

        {/* Next Parcel Section */}
        <View style={styles.parcelCard}>
          <Ionicons name="location" size={18} color="#ff9914" />
          <Text numberOfLines={2} style={styles.parcelText}>
            {nextParcel}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  infoPanel: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 5,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  speedCard: {
    flex: 1,
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    color: "#777",
    marginBottom: 4,
  },
  speedValue: {
    fontSize: 32,
    fontWeight: "bold",
  },
  unit: {
    fontSize: 12,
    color: "#555",
  },
  parcelCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f9f9f9",
    padding: 12,
    borderRadius: 12,
  },
  parcelText: {
    flex: 1,
    fontSize: 14,
    color: "#333",
  },
});
