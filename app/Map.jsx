import { Ionicons } from "@expo/vector-icons";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import Svg, { Polygon } from "react-native-svg";
import { auth, db } from "../firebaseConfig";
import { useOverspeed } from "../provider/OverspeedProvider";

const GOOGLE_MAPS_APIKEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const DEFAULT_SPEED_LIMIT = 60;
const CATEGORY_COLORS = {
  Crosswalk: "#00bfff",
  School: "#ff9800",
  Church: "#9c27b0",
  Curve: "#4caf50",
  Slippery: "#f44336",
  Default: "#9e9e9e",
};

export default function Map({ user: passedUser }) {
  const { speed, location } = useOverspeed();

  const [user, setUser] = useState(passedUser || null);
  const [userData, setUserData] = useState(null);
  const [parcels, setParcels] = useState([]);
  const [slowdowns, setSlowdowns] = useState([]);
  const [etaMinutes, setEtaMinutes] = useState(null);
  const [distanceKm, setDistanceKm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [followPuck, setFollowPuck] = useState(true);
  const [bootDone, setBootDone] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [parcelsLoaded, setParcelsLoaded] = useState(false);
  const [slowdownsLoaded, setSlowdownsLoaded] = useState(false);
  const [routeReady, setRouteReady] = useState(true);

  const mapRef = useRef(null);
  const routeFitDoneRef = useRef(false);
  const zoomHazardsDoneRef = useRef(false);
  const gestureActiveRef = useRef(false);
  const gestureTimerRef = useRef(null);
  const userZoomRef = useRef(17);
  const userPitchRef = useRef(45);
  const PAUSE_AFTER_GESTURE_MS = 1200;

  // Auth listener
  useEffect(() => {
    if (user) return;
    const unsub = onAuthStateChanged(auth, (fbUser) => setUser(fbUser || null));
    return unsub;
  }, [user]);

  // Load data
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
    } catch {
      return [];
    }
  };

  const loadBranchSlowdowns = async (branchId) => {
    try {
      const ref = doc(db, "branches", branchId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return [];
      const data = snap.data();
      if (!Array.isArray(data.slowdowns)) return [];
      return data.slowdowns.map((s, i) => ({
        id: `branch_${i}`,
        category: s.category || "Default",
        location: s.location,
        radius: s.radius || 15,
        speedLimit: s.speedLimit || 0,
      }));
    } catch {
      return [];
    }
  };

  const loadEverything = async () => {
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) return;
      const data = snap.data();
      setUserData(data);

      let allSlowdowns = [];
      if (data.branchId) {
        const branchZones = await loadBranchSlowdowns(data.branchId);
        allSlowdowns = allSlowdowns.concat(branchZones);
      }
      setSlowdowns(allSlowdowns);
      setSlowdownsLoaded(true);

      const parcelsList = await loadAllParcels();
      setParcels(parcelsList);
      setParcelsLoaded(true);
      setLoading(false);
    } catch {
      setSlowdownsLoaded(true);
      setParcelsLoaded(true);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadEverything();
  }, [user]);

  // Auto-follow + rotation
  useEffect(() => {
    if (!location || !mapRef.current || !followPuck || gestureActiveRef.current) return;

    const heading = typeof location.heading === "number" ? location.heading : 0;
    const camera = {
      center: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
      heading,
      pitch: userPitchRef.current,
      zoom: userZoomRef.current,
    };

    mapRef.current.animateCamera(camera, { duration: 900 });
  }, [location, followPuck]);

  // Gesture control
  const saveCameraState = async () => {
    try {
      const cam = await mapRef.current?.getCamera?.();
      if (cam?.zoom) userZoomRef.current = cam.zoom;
      if (cam?.pitch) userPitchRef.current = cam.pitch;
    } catch {}
  };
  const beginGesture = async () => {
    gestureActiveRef.current = true;
    if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
    await saveCameraState();
  };
  const endGestureSoon = async () => {
    if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
    await saveCameraState();
    gestureTimerRef.current = setTimeout(() => {
      gestureActiveRef.current = false;
    }, PAUSE_AFTER_GESTURE_MS);
  };

  // Fit to hazards once
  const fitToHazardsOnce = async () => {
    if (!mapRef.current || zoomHazardsDoneRef.current) return;
    const pts = [];
    if (location) pts.push(location);
    slowdowns.forEach((s) => {
      if (s?.location?.lat && s?.location?.lng)
        pts.push({ latitude: s.location.lat, longitude: s.location.lng });
    });
    if (pts.length < 2) return;
    try {
      mapRef.current.fitToCoordinates(pts, {
        edgePadding: { top: 80, right: 50, bottom: 120, left: 50 },
        animated: true,
      });
      zoomHazardsDoneRef.current = true;
    } catch {}
  };

  useEffect(() => {
    if (location && slowdowns.length > 0) fitToHazardsOnce();
  }, [slowdowns, location]);

  const needsRoute =
    userData?.status === "Delivering" && parcels.length > 0 && !!GOOGLE_MAPS_APIKEY;

  useEffect(() => {
    if (bootDone) return;
    const ready =
      mapReady && slowdownsLoaded && parcelsLoaded && (!needsRoute || routeReady);
    if (ready) setBootDone(true);
  }, [mapReady, slowdownsLoaded, parcelsLoaded, routeReady, needsRoute]);

  // Loading
  if (loading || !location) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00b2e1" />
        <Text style={{ marginTop: 15 }}>Loading map data...</Text>
      </View>
    );
  }

  const destinations = parcels.map((p) => ({
    latitude: p.destination.latitude,
    longitude: p.destination.longitude,
  }));
  const waypoints = destinations.slice(0, -1);
  const finalDestination =
    destinations.length > 0 ? destinations[destinations.length - 1] : null;

  const effectiveLimit = DEFAULT_SPEED_LIMIT;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        showsTraffic
        rotateEnabled
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
        onMapReady={() => setMapReady(true)}
        onTouchStart={beginGesture}
        onTouchEnd={endGestureSoon}
        onPanDrag={beginGesture}
        onRegionChangeComplete={(_, details) => {
          if (details?.isGesture) endGestureSoon();
        }}
      >
        <Marker coordinate={location} anchor={{ x: 0.5, y: 0.5 }} flat zIndex={9999}>
          <View style={styles.puck}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Polygon points="12,2 5,22 12,18 19,22" fill="#00b2e1" />
            </Svg>
          </View>
        </Marker>

        {slowdowns.map(
          (s, i) =>
            s.location?.lat &&
            s.location?.lng && (
              <Circle
                key={`slowdown-${i}`}
                center={{ latitude: s.location.lat, longitude: s.location.lng }}
                radius={s.radius || 15}
                strokeColor={CATEGORY_COLORS[s.category] || CATEGORY_COLORS.Default}
                fillColor={`${
                  CATEGORY_COLORS[s.category] || CATEGORY_COLORS.Default
                }55`}
                strokeWidth={2}
              />
            )
        )}

        {userData?.status === "Delivering" &&
          destinations.length > 0 &&
          !!GOOGLE_MAPS_APIKEY &&
          finalDestination && (
            <MapViewDirections
              origin={location}
              destination={finalDestination}
              waypoints={waypoints.length > 0 ? waypoints : undefined}
              apikey={GOOGLE_MAPS_APIKEY}
              strokeWidth={6}
              strokeColor="#4285F4"
              optimizeWaypoints={waypoints.length > 0}
              mode="DRIVING"
              onStart={() => setRouteReady(false)}
              onReady={(result) => {
                try {
                  if (
                    !routeFitDoneRef.current &&
                    mapRef.current &&
                    result?.coordinates?.length > 0
                  ) {
                    routeFitDoneRef.current = true;
                    mapRef.current.fitToCoordinates(result.coordinates, {
                      edgePadding: { top: 80, right: 50, bottom: 120, left: 50 },
                      animated: true,
                    });
                  }
                  setEtaMinutes(Math.round(result.duration || 0));
                  setDistanceKm(result.distance || 0);
                } catch {}
                setRouteReady(true);
              }}
              onError={() => setRouteReady(true)}
            />
          )}
      </MapView>

      <View style={styles.followBtn}>
        <TouchableOpacity
          style={[
            styles.followInner,
            followPuck ? styles.followOn : styles.followOff,
          ]}
          onPress={() => setFollowPuck((v) => !v)}
          activeOpacity={0.85}
        >
          <Ionicons
            name={followPuck ? "navigate" : "navigate-outline"}
            size={18}
            color={followPuck ? "#fff" : "#0064b5"}
            style={{ marginRight: 6 }}
          />
          <Text
            style={[
              styles.followText,
              followPuck ? { color: "#fff" } : { color: "#0064b5" },
            ]}
          >
            {followPuck ? "Follow: ON" : "Follow: OFF"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoPanel}>
        <View style={styles.row}>
          <View style={styles.infoCard}>
            <Text style={styles.label}>Speed Limit</Text>
            <Text style={[styles.infoValue, { color: "#f21b3f" }]}>
              {effectiveLimit}
            </Text>
            <Text style={styles.unit}>km/h</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.label}>Current Speed</Text>
            <Text
              style={[
                styles.infoValue,
                {
                  color:
                    effectiveLimit > 0 && speed > effectiveLimit
                      ? "#f21b3f"
                      : "#29bf12",
                },
              ]}
            >
              {Math.round(speed)}
            </Text>
            <Text style={styles.unit}>km/h</Text>
          </View>
        </View>
        {etaMinutes != null && (
          <View style={styles.row}>
            <View style={styles.infoCard}>
              <Text style={styles.label}>ETA</Text>
              <Text style={styles.infoValue}>{etaMinutes} min</Text>
              <Text style={styles.unit}>Estimated</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  puck: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3.5,
  },
  followBtn: { position: "absolute", bottom: 220, right: 12, zIndex: 20 },
  followInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dfe7ff",
  },
  followOn: { backgroundColor: "#0064b5", borderColor: "#0064b5" },
  followOff: { backgroundColor: "#fff", borderColor: "#0064b5" },
  followText: { fontSize: 13, fontWeight: "600" },
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
  row: { flexDirection: "row", justifyContent: "space-around", marginBottom: 12 },
  infoCard: { alignItems: "center", flex: 1 },
  label: { fontSize: 14, color: "#777", marginBottom: 4 },
  infoValue: { fontSize: 24, fontWeight: "bold" },
  unit: { fontSize: 12, color: "#555" },
});
