import { Ionicons } from "@expo/vector-icons";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import haversine from "haversine-distance";
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
const DEFAULT_RADIUS = 15;
const CATEGORY_COLORS = {
  Crosswalk: "#2196F3",
  School: "#ff9914",
  Church: "#9c27b0",
  Slowdown: "#29bf12",
  Default: "#9e9e9e",
};

function bearingBetween(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const lon1 = toRad(a.longitude);
  const lon2 = toRad(b.longitude);
  const dLon = lon2 - lon1;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  let deg = toDeg(Math.atan2(y, x));
  if (deg < 0) deg += 360;
  return deg;
}

function smoothHeading(prevDeg, nextDeg) {
  if (!Number.isFinite(prevDeg)) return nextDeg;
  const diff = ((nextDeg - prevDeg + 540) % 360) - 180;
  return (prevDeg + diff * 0.25 + 360) % 360;
}

const metersBetween = (a, b) => {
  try {
    return haversine(
      { lat: a.latitude, lon: a.longitude },
      { lat: b.latitude, lon: b.longitude }
    );
  } catch (e) {
    console.error("[metersBetween] Error:", e);
    return 0;
  }
};

export default function Map({ user: passedUser }) {
  console.log("[Map] rendering (provider-integrated)");

  const {
    speed,
    location: provLocation,
    activeSlowdown,
    showSlowdownWarning,
    slowdowns: providerSlowdowns,
  } = useOverspeed();

  const [user, setUser] = useState(passedUser || null);
  const [userData, setUserData] = useState(null);
  const [parcels, setParcels] = useState([]);
  const [slowdowns, setSlowdowns] = useState([]);
  const [etaMinutes, setEtaMinutes] = useState(null);
  const [distanceKm, setDistanceKm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [followPuck, setFollowPuck] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [parcelsLoaded, setParcelsLoaded] = useState(false);
  const [slowdownsLoaded, setSlowdownsLoaded] = useState(false);
  const [routeReady, setRouteReady] = useState(true);
  const [headingDeg, setHeadingDeg] = useState(0);

  const mapRef = useRef(null);
  const prevCoordRef = useRef(null);
  const routeFitDoneRef = useRef(false);
  const zoomHazardsDoneRef = useRef(false);
  const gestureActiveRef = useRef(false);
  const gestureTimerRef = useRef(null);
  const userZoomRef = useRef(17);
  const userPitchRef = useRef(45);
  const PAUSE_AFTER_GESTURE_MS = 1200;
  
  const getETAColor = () => {
    if (etaMinutes == null) return "#0064b5";
    if (etaMinutes < 15) return "#29bf12";
    if (etaMinutes < 30) return "#ff9914";
    return "#f21b3f";
  };

  useEffect(() => {
    if (user) return;
    console.log("[Map] Setting up auth listener");
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      console.log("[Map] auth changed:", !!fbUser);
      setUser(fbUser || null);
    });
    return unsub;
  }, [user]);

  const loadAllParcels = async () => {
    console.log("[Map] Loading parcels...");
    if (!user) return [];
    try {
      const parcelsCol = collection(db, "parcels");
      const q = query(
        parcelsCol,
        where("driverUid", "==", user.uid),
        where("status", "==", "Out for Delivery")
      );
      const querySnap = await getDocs(q);
      if (querySnap.empty) {
        console.log("[Map] No parcels found");
        return [];
      }
      const filtered = querySnap.docs
        .map((d) => d.data())
        .filter(
          (p) =>
            p.destination &&
            typeof p.destination.latitude === "number" &&
            typeof p.destination.longitude === "number"
        );
      console.log("[Map] Loaded", filtered.length, "parcels");
      return filtered;
    } catch (error) {
      console.error("[Map] Failed to load parcels:", error);
      return [];
    }
  };

  const loadBranchSlowdowns = async (branchId) => {
    console.log("[Map] Loading branch slowdowns for:", branchId);
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
        radius: s.radius || DEFAULT_RADIUS,
        speedLimit: s.speedLimit || 0,
      }));
    } catch (error) {
      console.error("[Map] Failed to load branch slowdowns:", error);
      return [];
    }
  };

  const loadEverything = async () => {
    if (!user) return;
    console.log("[Map] Loading everything...");
    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        console.log("[Map] User not found");
        return;
      }
      const udata = userSnap.data();
      setUserData(udata);

      let allSlowdowns = [];
      if (udata.branchId) {
        const branch = await loadBranchSlowdowns(udata.branchId);
        allSlowdowns = allSlowdowns.concat(branch);
      }

      if (Array.isArray(providerSlowdowns) && providerSlowdowns.length > 0) {
        console.log("[Map] Using provider slowdowns:", providerSlowdowns.length);
        allSlowdowns = providerSlowdowns;
      }

      setSlowdowns(allSlowdowns);
      setSlowdownsLoaded(true);

      const parcelList = await loadAllParcels();
      setParcels(parcelList);
      setParcelsLoaded(true);
      setLoading(false);
    } catch (error) {
      console.error("[Map] loadEverything error:", error);
      setSlowdownsLoaded(true);
      setParcelsLoaded(true);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadEverything();
  }, [user, providerSlowdowns]);

  useEffect(() => {
    if (!provLocation) return;
    try {
      const prev = prevCoordRef.current;
      if (prev && prev.latitude && prev.longitude) {
        const moveM = metersBetween(prev, provLocation);
        if (moveM > 1.0) {
          const course = bearingBetween(prev, provLocation);
          setHeadingDeg((prevH) => smoothHeading(prevH, course));
        }
      }
      prevCoordRef.current = provLocation;
    } catch (e) {
      console.warn("[Map] Heading compute failed:", e);
    }
  }, [provLocation]);

  useEffect(() => {
    if (!provLocation || !mapRef.current || !followPuck || gestureActiveRef.current) return;

    const camera = {
      center: {
        latitude: provLocation.latitude,
        longitude: provLocation.longitude,
      },
      heading: Number.isFinite(headingDeg) ? headingDeg : 0,
      pitch: userPitchRef.current,
      zoom: userZoomRef.current,
    };

    try {
      mapRef.current.animateCamera(camera, { duration: 900 });
    } catch (e) {
      console.warn("[Map] animateCamera failed:", e);
    }
  }, [provLocation, followPuck, headingDeg]);

  const saveCameraState = async () => {
    try {
      const cam = await mapRef.current?.getCamera?.();
      if (cam?.zoom) userZoomRef.current = cam.zoom;
      if (cam?.pitch) userPitchRef.current = cam.pitch;
    } catch (e) {
      /* ignore */
    }
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

  const fitToHazardsOnce = async () => {
    if (!mapRef.current || zoomHazardsDoneRef.current) return;
    const pts = [];
    if (provLocation) pts.push(provLocation);
    slowdowns.forEach((s) => {
      if (s?.location?.lat && s?.location?.lng) {
        pts.push({ latitude: s.location.lat, longitude: s.location.lng });
      }
    });
    if (pts.length < 2) return;
    try {
      mapRef.current.fitToCoordinates(pts, {
        edgePadding: { top: 80, right: 50, bottom: 120, left: 50 },
        animated: true,
      });
      zoomHazardsDoneRef.current = true;
    } catch (e) {
      console.warn("[Map] fitToCoordinates failed:", e);
    }
  };

  useEffect(() => {
    if (provLocation && slowdowns.length > 0) fitToHazardsOnce();
  }, [slowdowns, provLocation]);

  const needsRoute =
    userData?.status === "Delivering" && parcels.length > 0 && !!GOOGLE_MAPS_APIKEY;

  useEffect(() => {
    if (mapReady && slowdownsLoaded && parcelsLoaded && (!needsRoute || routeReady)) {
      setTimeout(() => {}, 50);
    }
  }, [mapReady, slowdownsLoaded, parcelsLoaded, routeReady, needsRoute]);

  if (loading || !provLocation) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00b2e1" />
        <Text style={{ marginTop: 15 }}>
          {loading ? "Loading map data..." : "Waiting for location..."}
        </Text>
      </View>
    );
  }

  const destinations = parcels.map((p) => ({
    latitude: p.destination.latitude,
    longitude: p.destination.longitude,
  }));
  const waypoints = destinations.slice(0, -1);
  const finalDestination = destinations.length > 0 ? destinations[destinations.length - 1] : null;

  const effectiveLimit = activeSlowdown?.speedLimit || DEFAULT_SPEED_LIMIT;
  
  console.log("[Map] Effective speed limit:", effectiveLimit, "| Active zone:", activeSlowdown?.category || "None", "| Speed:", speed);

  return (
    <View style={styles.container}>
      {showSlowdownWarning && activeSlowdown && (
        <View style={styles.slowdownAlert}>
          <Ionicons name="warning" size={22} color="#ffcc00" />
          <Text style={styles.slowdownText}>
            Slow down! {activeSlowdown.category || "Hazard"} zone - {activeSlowdown.speedLimit || DEFAULT_SPEED_LIMIT} km/h
          </Text>
        </View>
      )}

      {etaMinutes != null && distanceKm != null && (
        <View style={[styles.etaPanel, { backgroundColor: getETAColor() }]}>
          <Text style={styles.etaText}>
            {etaMinutes} min • {distanceKm.toFixed(1)} km
          </Text>
          <Text style={styles.etaSubText}>Optimized Route</Text>
        </View>
      )}

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        showsTraffic
        rotateEnabled
        initialRegion={{
          latitude: provLocation.latitude,
          longitude: provLocation.longitude,
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
        <Marker
          coordinate={{
            latitude: provLocation.latitude,
            longitude: provLocation.longitude,
          }}
          anchor={{ x: 0.5, y: 0.5 }}
          flat
          zIndex={9999}
        >
          <View style={styles.puck}>
            <View
              style={{
                transform: [
                  { rotate: `${Number.isFinite(headingDeg) ? headingDeg : 0}deg` },
                ],
              }}
            >
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Polygon points="12,2 5,22 12,18 19,22" fill="#00b2e1" />
              </Svg>
            </View>
          </View>
        </Marker>

        {slowdowns.map((s, i) =>
          s.location?.lat && s.location?.lng ? (
            <Circle
              key={`slowdown-${i}`}
              center={{ latitude: s.location.lat, longitude: s.location.lng }}
              radius={s.radius || DEFAULT_RADIUS}
              strokeColor={CATEGORY_COLORS[s.category] || CATEGORY_COLORS.Default}
              fillColor={`${CATEGORY_COLORS[s.category] || CATEGORY_COLORS.Default}55`}
              strokeWidth={2}
            />
          ) : null
        )}

        {userData?.status === "Delivering" &&
          destinations.length > 0 &&
          !!GOOGLE_MAPS_APIKEY &&
          finalDestination ? (
          <>
            {destinations.map((d, i) => (
              <Marker
                key={`dest-${i}`}
                coordinate={d}
                title={`Stop ${i + 1}`}
                pinColor={i === destinations.length - 1 ? "orange" : "dodgerblue"}
              />
            ))}
            <MapViewDirections
              origin={{
                latitude: provLocation.latitude,
                longitude: provLocation.longitude,
              }}
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
                  if (result) {
                    setEtaMinutes(Math.round(result.duration || 0));
                    setDistanceKm(result.distance || 0);
                  }
                } catch (e) {
                  console.error("[Map] Route ready error:", e);
                }
                setRouteReady(true);
              }}
              onError={(error) => {
                console.error("[Map] Route error:", error);
                setRouteReady(true);
              }}
            />
          </>
        ) : null}
      </MapView>

      {!provLocation && (
        <View style={styles.preparingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#00b2e1" />
          <Text style={styles.preparingText}>Preparing map...</Text>
        </View>
      )}

      <View style={styles.followBtn}>
        <TouchableOpacity
          style={[
            styles.followInner,
            followPuck ? styles.followOn : styles.followOff,
          ]}
          onPress={async () => {
            const next = !followPuck;
            setFollowPuck(next);
            if (next) {
              try {
                await mapRef.current?.animateCamera?.(
                  {
                    center: {
                      latitude: provLocation.latitude,
                      longitude: provLocation.longitude,
                    },
                    heading: headingDeg,
                    pitch: userPitchRef.current,
                    zoom: userZoomRef.current,
                  },
                  { duration: 500 }
                );
              } catch {}
            }
          }}
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

        {effectiveLimit > 0 && speed > effectiveLimit && (
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
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  preparingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.7)",
    zIndex: 25,
  },
  preparingText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "600",
    color: "#2c3e50",
  },
  etaPanel: {
    position: "absolute",
    top: 30,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    zIndex: 10,
    elevation: 10,
    backgroundColor: "#0064b5",
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
  followBtn: {
    position: "absolute",
    bottom: 220,
    right: 12,
    zIndex: 20,
  },
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
  followOn: {
    backgroundColor: "#0064b5",
    borderColor: "#0064b5",
  },
  followOff: {
    backgroundColor: "#fff",
    borderColor: "#0064b5",
  },
  followText: {
    fontSize: 13,
    fontWeight: "600",
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
    marginBottom: 12,
  },
  infoCard: {
    alignItems: "center",
    flex: 1,
  },
  label: {
    fontSize: 14,
    color: "#777",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 24,
    fontWeight: "bold",
  },
  unit: {
    fontSize: 12,
    color: "#555",
  },
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
  slowdownAlert: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: "#fff3cd",
    borderLeftWidth: 6,
    borderLeftColor: "#ffcc00",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 15,
  },
  slowdownText: {
    flex: 1,
    marginLeft: 8,
    color: "#856404",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
});