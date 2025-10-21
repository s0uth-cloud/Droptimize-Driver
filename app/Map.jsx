import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import haversine from "haversine-distance";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import { auth, db } from "../firebaseConfig";

const GOOGLE_MAPS_APIKEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function Map({ user: passedUser }) {
  const [user, setUser] = useState(passedUser || null);
  const [userData, setUserData] = useState(null);
  const [parcels, setParcels] = useState([]);
  const [location, setLocation] = useState(null);
  const [heading, setHeading] = useState(0);
  const [loading, setLoading] = useState(true);
  const [slowdowns, setSlowdowns] = useState([]);
  const [speedLimit, setSpeedLimit] = useState(0);
  const [vehicleSpeed, setVehicleSpeed] = useState(0);
  const [etaMinutes, setEtaMinutes] = useState(null);
  const [distanceKm, setDistanceKm] = useState(null);
  const [drivingMode, setDrivingMode] = useState(false);
  const [activeSlowdown, setActiveSlowdown] = useState(null);
  const [showSlowdownWarning, setShowSlowdownWarning] = useState(false);

  const locationSubscription = useRef(null);
  const mapRef = useRef(null);

  const DEFAULT_RADIUS = 15;
  const OVERPASS_RADIUS = 1000;

  const CATEGORY_COLORS = {
    Crosswalk: "#00bfff",
    School: "#ff9800",
    Church: "#9c27b0",
    Curve: "#4caf50",
    Slippery: "#f44336",
    Default: "#9e9e9e",
  };


  useEffect(() => {
    if (!user) {
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) setUser(firebaseUser);
      });
      return unsubscribe;
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLoading(false);
        console.warn("Location permission not granted");
        return;
      }

      const initial = await Location.getCurrentPositionAsync({});
      await loadEverything(initial.coords);

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (position) => {
          const coords = position.coords;
          setLocation(coords);
          setHeading(coords.heading || 0);
          setLoading(false);

          const speedKmh = coords.speed ? coords.speed * 3.6 : 0;
          setVehicleSpeed(Math.round(speedKmh));

          let nearestLimit = 0;
          let nearbyZone = null;

          slowdowns.forEach((s) => {
            if (!s.location?.lat || !s.location?.lng) return;
            const dist = haversine(coords, s.location);
            const zoneRadius = s.radius || DEFAULT_RADIUS;

            if (dist < zoneRadius) {
              nearestLimit = s.speedLimit || nearestLimit;
              nearbyZone = s;
            }
          });

          setSpeedLimit(nearestLimit);

          if (nearbyZone && (!activeSlowdown || activeSlowdown.id !== nearbyZone.id)) {
            setActiveSlowdown(nearbyZone);
            setShowSlowdownWarning(true);
            setTimeout(() => {
              setShowSlowdownWarning(false);
              setActiveSlowdown(null);
            }, 7000);
          }

          if (mapRef.current && drivingMode) {
            const offsetDistance = 0.001; 
            const rad = (coords.heading * Math.PI) / 180;
            const offsetLat = coords.latitude + offsetDistance * Math.cos(rad);
            const offsetLng = coords.longitude + offsetDistance * Math.sin(rad);

            mapRef.current.animateCamera({
              center: { latitude: offsetLat, longitude: offsetLng },
              heading: coords.heading,
              pitch: 50,
              zoom: 17,
            });
          }
        }
      );
    })();

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
      }
    };
  }, [user, slowdowns, drivingMode]);

  // Load Firestore + Overpass
  const loadBranchSlowdowns = async (branchId) => {
    try {
      const branchRef = doc(db, "branches", branchId);
      const branchSnap = await getDoc(branchRef);
      if (!branchSnap.exists()) return [];
      const branchData = branchSnap.data();
      if (!Array.isArray(branchData.slowdowns)) return [];
      return branchData.slowdowns.map((s, i) => ({
        id: i,
        category: s.category || "Default",
        location: s.location,
        radius: s.radius || DEFAULT_RADIUS,
        speedLimit: s.speedLimit || 0,
      }));
    } catch (error) {
      console.warn("Error in loadBranchSlowdowns:", error);
      return [];
    }
  };

  const loadOverpassCrosswalks = async (lat, lon) => {
    try {
      const queryStr = `
        [out:json][timeout:25];
        (node["highway"="crossing"](around:${OVERPASS_RADIUS},${lat},${lon}););
        out body;
      `;
      const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(queryStr)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.elements) return [];

      return data.elements.map((el, i) => ({
        id: `cross_${i}`,
        category: "Crosswalk",
        location: { lat: el.lat, lng: el.lon },
        radius: DEFAULT_RADIUS,
        speedLimit: 20,
      }));
    } catch (error) {
      console.warn("Error in loadOverpassCrosswalks:", error);
      return [];
    }
  };

  const loadAllParcels = async () => {
    if (!user) return [];
    try {
      const parcelsCol = collection(db, "parcels");
      const q = query(
        parcelsCol,
        where("driverUid", "==", user.uid),
        where("status", "==", "Out for Delivery")
      );
      const querySnap = await getDocs(q);
      if (querySnap.empty) return [];

      return querySnap.docs
        .map((d) => d.data())
        .filter(
          (p) =>
            p.destination &&
            typeof p.destination.latitude === "number" &&
            typeof p.destination.longitude === "number"
        );
    } catch (error) {
      console.warn("Error loading parcels:", error);
      return [];
    }
  };

  const loadEverything = async (coords) => {
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return;
      const udata = userSnap.data();
      setUserData(udata);
      setDrivingMode(udata.status === "Delivering");

      let allSlowdowns = [];
      if (udata.branchId) {
        const branch = await loadBranchSlowdowns(udata.branchId);
        allSlowdowns = allSlowdowns.concat(branch);
      }
      if (coords) {
        const crosses = await loadOverpassCrosswalks(coords.latitude, coords.longitude);
        allSlowdowns = allSlowdowns.concat(crosses);
      }
      setSlowdowns(allSlowdowns);

      const parcelList = await loadAllParcels();
      setParcels(parcelList);
    } catch (error) {
      console.warn("Error in loadEverything:", error);
    }
  };

  const isOverspeeding = speedLimit > 0 && vehicleSpeed > speedLimit;
  const isDelivering = userData?.status === "Delivering";

  const getETAColor = () => {
    if (etaMinutes == null) return "#1E88E5";
    if (etaMinutes < 15) return "#2ecc71";
    if (etaMinutes < 30) return "#f1c40f";
    return "#e74c3c";
  };

  if (loading)
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00b2e1" />
        <Text style={{ marginTop: 10 }}>Getting current location...</Text>
      </View>
    );

  if (!location)
    return (
      <View style={styles.loadingContainer}>
        <Text>Location unavailable. Please enable GPS.</Text>
      </View>
    );

  const destinations = parcels.map((p) => ({
    latitude: p.destination.latitude,
    longitude: p.destination.longitude,
  }));
  const waypoints = destinations.slice(0, -1);
  const finalDestination = destinations[destinations.length - 1];

  return (
    <View style={styles.container}>
      {etaMinutes != null && distanceKm != null && (
        <View style={[styles.etaPanel, { backgroundColor: getETAColor() }]}>
          <Text style={styles.etaText}>
            {etaMinutes} min • {distanceKm.toFixed(1)} km
          </Text>
          <Text style={styles.etaSubText}>
            {drivingMode ? "Driving Mode Active" : "Optimized Route"}
          </Text>
        </View>
      )}

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        showsTraffic
        region={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: drivingMode ? 0.005 : 0.01,
          longitudeDelta: drivingMode ? 0.005 : 0.01,
        }}
      >
        <Marker
          coordinate={{
            latitude: location.latitude,
            longitude: location.longitude,
          }}
          anchor={{ x: 0.5, y: 0.5 }}
          flat
          rotation={heading}
        >
          <Ionicons name="navigate" size={40} color="#ff0000ff" />
        </Marker>

        {slowdowns.map((s, i) =>
          s.location?.lat && s.location?.lng ? (
            <Circle
              key={i}
              center={{
                latitude: s.location.lat,
                longitude: s.location.lng,
              }}
              radius={s.radius || DEFAULT_RADIUS}
              strokeColor={CATEGORY_COLORS[s.category] || CATEGORY_COLORS.Default}
              fillColor={`${CATEGORY_COLORS[s.category] || CATEGORY_COLORS.Default}55`}
              strokeWidth={2}
            />
          ) : null
        )}

        {isDelivering && destinations.length > 0 && (
          <>
            {destinations.map((d, i) => (
              <Marker
                key={i}
                coordinate={d}
                title={`Stop ${i + 1}`}
                pinColor={i === destinations.length - 1 ? "orange" : "dodgerblue"}
              />
            ))}
            <MapViewDirections
              origin={{
                latitude: location.latitude,
                longitude: location.longitude,
              }}
              destination={finalDestination}
              waypoints={waypoints}
              apikey={GOOGLE_MAPS_APIKEY}
              strokeWidth={6}
              strokeColor="#4285F4"
              optimizeWaypoints
              mode="DRIVING"
              onReady={(result) => {
                if (mapRef.current) {
                  mapRef.current.fitToCoordinates(result.coordinates, {
                    edgePadding: { top: 80, right: 50, bottom: 120, left: 50 },
                    animated: true,
                  });
                }
                setEtaMinutes(Math.round(result.duration));
                setDistanceKm(result.distance);
              }}
            />
          </>
        )}
      </MapView>

      {showSlowdownWarning && activeSlowdown && (
        <View style={styles.slowdownAlert}>
          <Ionicons name="warning" size={22} color="#ffcc00" />
          <Text style={styles.slowdownText}>
            Slow down! Approaching {activeSlowdown.category?.toLowerCase() || "hazard"} zone.
          </Text>
        </View>
      )}

      <View style={styles.infoPanel}>
        <View style={styles.row}>
          <View style={styles.speedCard}>
            <Text style={styles.label}>Speed Limit</Text>
            <Text style={[styles.speedValue, { color: "#29bf12" }]}>
              {speedLimit > 0 ? speedLimit : "No limit"}
            </Text>
            {speedLimit > 0 && <Text style={styles.unit}>km/h</Text>}
          </View>

          <View style={styles.speedCard}>
            <Text style={styles.label}>Current Speed</Text>
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

          {etaMinutes != null && (
            <View style={styles.speedCard}>
              <Text style={styles.label}>ETA</Text>
              <Text style={styles.speedValue}>{etaMinutes} min</Text>
              <Text style={styles.unit}>Estimated</Text>
            </View>
          )}
        </View>

        {isOverspeeding && (
          <View style={styles.warningBox}>
            <Ionicons name="alert-circle" size={20} color="#f21b3f" />
            <Text style={styles.warningText}>You are overspeeding!</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  etaPanel: {
    position: "absolute",
    top: 40,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    zIndex: 10,
    elevation: 10,
  },
  etaText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
  },
  etaSubText: {
    color: "#e3f2fd",
    fontSize: 14,
    textAlign: "center",
  },
  slowdownAlert: {
    position: "absolute",
    bottom: 170,
    left: 20,
    right: 20,
    backgroundColor: "#fff3cd",
    borderLeftWidth: 6,
    borderLeftColor: "#ffcc00",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  slowdownText: {
    flex: 1,
    marginLeft: 8,
    color: "#856404",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
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
    justifyContent: "space-around",
    marginBottom: 16,
  },
  speedCard: {
    alignItems: "center",
    flex: 1,
  },
  label: { fontSize: 14, color: "#777", marginBottom: 4 },
  speedValue: { fontSize: 32, fontWeight: "bold" },
  unit: { fontSize: 12, color: "#555" },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffe6e6",
    paddingVertical: 8,
    borderRadius: 12,
  },
  warningText: {
    color: "#f21b3f",
    fontWeight: "600",
    fontSize: 14,
    marginLeft: 8,
  },
});
