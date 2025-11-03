import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import haversine from "haversine-distance";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from "react-native-maps";
import MapViewDirections from "react-native-maps-directions";
import Svg, { Polygon } from "react-native-svg";
import { auth, db } from "../firebaseConfig";

const GOOGLE_MAPS_APIKEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

async function fetchOverpass(queryStr, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const body = `data=${encodeURIComponent(queryStr)}`;
  let lastErr;
  for (const base of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json",
        },
        body,
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${text?.slice(0, 200)}`);
      const parsed = JSON.parse(text);
      clearTimeout(timer);
      return parsed;
    } catch (e) {
      lastErr = e;
      try {
        const url = `${base}?data=${encodeURIComponent(queryStr)}`;
        const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} (GET): ${text?.slice(0, 200)}`);
        const parsed = JSON.parse(text);
        clearTimeout(timer);
        return parsed;
      } catch (e2) {
        lastErr = e2;
      }
    }
  }
  clearTimeout(timer);
  throw lastErr || new Error("Overpass fetch failed");
}

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

function metersBetween(a, b) {
  return haversine({ lat: a.latitude, lon: a.longitude }, { lat: b.latitude, lon: b.longitude });
}

function getEffectiveLimit(limit) {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  if (limit >= 10 && limit <= 20) return limit + 2;
  if (limit >= 21 && limit <= 30) return limit + 3;
  if (limit >= 31 && limit <= 40) return limit + 5;
  return limit;
}

export default function Map({ user: passedUser }) {
  const [user, setUser] = useState(passedUser || null);
  const [userData, setUserData] = useState(null);
  const [parcels, setParcels] = useState([]);
  const [location, setLocation] = useState(null);
  const [headingDeg, setHeadingDeg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [slowdowns, setSlowdowns] = useState([]);
  const [speedLimit, setSpeedLimit] = useState(0);
  const [vehicleSpeed, setVehicleSpeed] = useState(0);
  const [etaMinutes, setEtaMinutes] = useState(null);
  const [distanceKm, setDistanceKm] = useState(null);
  const [followPuck, setFollowPuck] = useState(true);
  const [activeSlowdown, setActiveSlowdown] = useState(null);
  const [showSlowdownWarning, setShowSlowdownWarning] = useState(false);

  // NEW: prep/overlay states
  const [mapReady, setMapReady] = useState(false);
  const [parcelsLoaded, setParcelsLoaded] = useState(false);
  const [slowdownsLoaded, setSlowdownsLoaded] = useState(false);
  const [routeReady, setRouteReady] = useState(true);
  const firstFreshFixRef = useRef(false);

  const mapRef = useRef(null);
  const locationSubscription = useRef(null);
  const headingSubscription = useRef(null);
  const prevCoordRef = useRef(null);
  const prevTimeRef = useRef(null);
  const lastCourseRef = useRef(null);
  const cameraZoomRef = useRef(10);
  const lastCamUpdateRef = useRef(0);
  const routeFitDoneRef = useRef(false);
  const zoomHazardsDoneRef = useRef(false);

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
  async function getInitialPosition() {
    try {
      await Location.hasServicesEnabledAsync();
      const last = await Location.getLastKnownPositionAsync();
      const now = Date.now();
      const lastIsFresh = last?.timestamp && now - last.timestamp < 20000; 
      if (last?.coords && lastIsFresh) return last;
      const fresh = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, maximumAge: 0 }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("loc-timeout")), 10000)),
      ]);
      return fresh || last || null;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (user) return;
    const unsub = onAuthStateChanged(auth, (fbUser) => setUser(fbUser || null));
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLoading(false);
        return;
      }
      const initial = await getInitialPosition();
      if (initial?.coords) {
        setLocation(initial.coords);
        prevCoordRef.current = initial.coords;
        prevTimeRef.current = initial.timestamp || Date.now();
        await loadEverything(initial.coords);
        setLoading(false);
      } else {
        setLoading(false);
        return;
      }

      if (!headingSubscription.current) {
        headingSubscription.current = await Location.watchHeadingAsync((h) => {
          const hdg = Platform.OS === "ios" ? h.trueHeading ?? h.magHeading ?? 0 : h.magHeading ?? h.trueHeading ?? 0;
          if (Number.isFinite(hdg)) setHeadingDeg((prev) => smoothHeading(prev, hdg));
        });
      }

      locationSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 800, distanceInterval: 1 },
        async (position) => {
          const coords = position.coords;
          setLocation(coords);

          if (!firstFreshFixRef.current) firstFreshFixRef.current = true;

          const gpsKmh = Number.isFinite(coords.speed) ? coords.speed * 3.6 : NaN;
          let derivedKmh = NaN;
          if (prevCoordRef.current && prevTimeRef.current) {
            const distM = metersBetween(
              { latitude: prevCoordRef.current.latitude, longitude: prevCoordRef.current.longitude },
              { latitude: coords.latitude, longitude: coords.longitude }
            );
            const dt = Math.max(0.5, (position.timestamp - prevTimeRef.current) / 1000);
            derivedKmh = (distM / dt) * 3.6;
          }
          let kmh = Number.isFinite(gpsKmh) ? gpsKmh : Number.isFinite(derivedKmh) ? derivedKmh : 0;

          const dests = parcels.map((p) => ({ latitude: p.destination.latitude, longitude: p.destination.longitude }));
          let atStop = false;
          if (dests.length > 0) {
            const dists = dests.map((d) => metersBetween({ latitude: coords.latitude, longitude: coords.longitude }, d));
            const minD = Math.min(...dists);
            if (minD <= 20) atStop = true;
          }
          if (kmh < 2 || atStop) kmh = 0;
          setVehicleSpeed(Math.round(kmh));

          if (prevCoordRef.current) {
            const moveM = metersBetween(
              { latitude: prevCoordRef.current.latitude, longitude: prevCoordRef.current.longitude },
              { latitude: coords.latitude, longitude: coords.longitude }
            );
            if (moveM > 1.5) {
              const course = bearingBetween(prevCoordRef.current, coords);
              lastCourseRef.current = course;
              const useCourse = kmh > 3 || !Number.isFinite(headingDeg);
              if (useCourse) setHeadingDeg((prev) => smoothHeading(prev, course));
            }
          }
          prevCoordRef.current = coords;
          prevTimeRef.current = position.timestamp || Date.now();

          let nearestLimit = 0;
          let nearbyZone = null;
          slowdowns.forEach((s) => {
            if (!s.location?.lat || !s.location?.lng) return;
            const dist = metersBetween(coords, { latitude: s.location.lat, longitude: s.location.lng });
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

          if (mapRef.current && followPuck) {
            const now = Date.now();
            if (now - lastCamUpdateRef.current > 500) {
              lastCamUpdateRef.current = now;
              if (cameraZoomRef.current == null) {
                try {
                  const cam = await mapRef.current.getCamera();
                  cameraZoomRef.current = cam?.zoom ?? 10;
                } catch {
                  cameraZoomRef.current = 10;
                }
              }
              const az = (lastCourseRef.current ?? headingDeg ?? 0) * (Math.PI / 180);
              const offsetDistance = 0.0005;
              const offsetLat = coords.latitude + offsetDistance * Math.cos(az);
              const offsetLng = coords.longitude + offsetDistance * Math.sin(az);
              mapRef.current.animateCamera(
                {
                  center: { latitude: offsetLat, longitude: offsetLng },
                  heading: lastCourseRef.current ?? headingDeg ?? 0,
                  pitch: 50,
                  zoom: Math.max(10, cameraZoomRef.current ?? 10),
                },
                { duration: 500 }
              );
            }
          }
        }
      );
    })();
    return () => {
      locationSubscription.current?.remove?.();
      locationSubscription.current = null;
      headingSubscription.current?.remove?.();
      headingSubscription.current = null;
    };
  }, [user, slowdowns, followPuck, parcels, headingDeg]);

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
    } catch {
      return [];
    }
  };

  const loadOverpassCrosswalks = async (lat, lon) => {
    try {
      const queryStr = `[out:json][timeout:25];(node["highway"="crossing"](around:${OVERPASS_RADIUS},${lat},${lon}););out body;`;
      const data = await fetchOverpass(queryStr);
      if (!data || !Array.isArray(data.elements)) return [];
      return data.elements
        .filter((el) => typeof el.lat === "number" && typeof el.lon === "number")
        .map((el, i) => ({
          id: `cross_${el.id || i}`,
          category: "Crosswalk",
          location: { lat: el.lat, lng: el.lon },
          radius: DEFAULT_RADIUS,
          speedLimit: 20,
        }));
    } catch {
      return [];
    }
  };

  const loadAllParcels = async () => {
    if (!user) return [];
    try {
      const parcelsCol = collection(db, "parcels");
      const q = query(parcelsCol, where("driverUid", "==", user.uid), where("status", "==", "Out for Delivery"));
      const querySnap = await getDocs(q);
      if (querySnap.empty) return [];
      return querySnap.docs
        .map((d) => d.data())
        .filter((p) => p.destination && typeof p.destination.latitude === "number" && typeof p.destination.longitude === "number");
    } catch {
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
      setSlowdownsLoaded(true);

      const parcelList = await loadAllParcels();
      setParcels(parcelList);
      setParcelsLoaded(true);
    } catch {
      setSlowdownsLoaded(true);
      setParcelsLoaded(true);
    }
  };

  const getETAColor = () => {
    if (etaMinutes == null) return "#0064b5";
    if (etaMinutes < 15) return "#29bf12";
    if (etaMinutes < 30) return "#ff9914";
    return "#f21b3f";
  };

  const quickCenterOnUser = async () => {
    if (!mapRef.current || !location) return;
    try {
      const cam = await mapRef.current.getCamera();
      mapRef.current.animateCamera(
        {
          ...cam,
          center: { latitude: location.latitude, longitude: location.longitude },
          heading: lastCourseRef.current ?? headingDeg ?? 0,
          pitch: 50,
          zoom: Math.max(16, cam?.zoom ?? 10),
        },
        { duration: 500 }
      );
    } catch {}
  };

  const fitToHazardsOnce = async () => {
    if (!mapRef.current || zoomHazardsDoneRef.current) return;
    if (userData?.status === "Delivering" && parcels.length > 0) return;
    const pts = [];
    if (location) pts.push({ latitude: location.latitude, longitude: location.longitude });
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
      setTimeout(async () => {
        try {
          const cam = await mapRef.current.getCamera?.();
          const targetZoom = 16;
          if ((cam?.zoom ?? 0) < targetZoom) {
            mapRef.current.animateCamera({ ...cam, zoom: targetZoom }, { duration: 400 });
          }
        } catch {}
      }, 600);
      zoomHazardsDoneRef.current = true;
    } catch {}
  };

  useEffect(() => {
    if (!location) return;
    if (slowdowns.length === 0) return;
    fitToHazardsOnce();
  }, [slowdowns, location]);

  if (loading)
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00b2e1" />
        <Text style={{ marginTop: 15 }}>Getting current location...</Text>
      </View>
    );

  if (!location)
    return (
      <View style={styles.loadingContainer}>
        <Text>Location unavailable. Please enable GPS / Location Services.</Text>
      </View>
    );

  const destinations = parcels.map((p) => ({
    latitude: p.destination.latitude,
    longitude: p.destination.longitude,
  }));
  const waypoints = destinations.slice(0, -1);
  const finalDestination = destinations[destinations.length - 1];
  const effectiveLimit = getEffectiveLimit(speedLimit);

  const needsRoute = userData?.status === "Delivering" && destinations.length > 0 && !!GOOGLE_MAPS_APIKEY;
  const preparing =
    !mapReady ||
    !firstFreshFixRef.current ||
    !slowdownsLoaded ||
    !parcelsLoaded ||
    (needsRoute && !routeReady);

  return (
    <View style={styles.container}>
      {etaMinutes != null && distanceKm != null && (
        <View style={[styles.etaPanel, { backgroundColor: getETAColor() }]}>
          <Text style={styles.etaText}>{etaMinutes} min • {distanceKm.toFixed(1)} km</Text>
          <Text style={styles.etaSubText}>Optimized Route</Text>
        </View>
      )}

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        showsTraffic
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
        onMapReady={async () => {
          try {
            const cam = await mapRef.current?.getCamera?.();
            if (!cam || (cam.zoom ?? 0) < 10) {
              mapRef.current?.animateCamera({ zoom: 10 }, { duration: 400 });
            }
            cameraZoomRef.current = Math.max(12, cam?.zoom ?? 10);
          } catch {}
          setMapReady(true);
        }}
      >
        <Marker
          coordinate={{ latitude: location.latitude, longitude: location.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          flat
          zIndex={9999}
        >
          <View style={styles.puck}>
            <View style={{ transform: [{ rotate: `${Number.isFinite(headingDeg) ? headingDeg : 0}deg` }] }}>
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Polygon points="12,2 5,22 12,18 19,22" fill="#00b2e1" />
              </Svg>
            </View>
          </View>
        </Marker>

        {slowdowns.map((s, i) =>
          s.location?.lat && s.location?.lng ? (
            <Circle
              key={i}
              center={{ latitude: s.location.lat, longitude: s.location.lng }}
              radius={s.radius || DEFAULT_RADIUS}
              strokeColor={CATEGORY_COLORS[s.category] || CATEGORY_COLORS.Default}
              fillColor={`${CATEGORY_COLORS[s.category] || CATEGORY_COLORS.Default}55`}
              strokeWidth={2}
            />
          ) : null
        )}

        {needsRoute ? (
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
              origin={{ latitude: location.latitude, longitude: location.longitude }}
              destination={finalDestination}
              waypoints={waypoints}
              apikey={GOOGLE_MAPS_APIKEY}
              strokeWidth={6}
              strokeColor="#4285F4"
              optimizeWaypoints
              mode="DRIVING"
              onStart={() => setRouteReady(false)}
              onReady={async (result) => {
                if (!routeFitDoneRef.current && mapRef.current) {
                  routeFitDoneRef.current = true;
                  mapRef.current.fitToCoordinates(result.coordinates, {
                    edgePadding: { top: 80, right: 50, bottom: 120, left: 50 },
                    animated: true,
                  });
                  setTimeout(async () => {
                    try {
                      const cam = await mapRef.current?.getCamera?.();
                      if (cam?.zoom != null) cameraZoomRef.current = Math.max(12, cam.zoom);
                    } catch {}
                  }, 600);
                }
                setEtaMinutes(Math.round(result.duration));
                setDistanceKm(result.distance);
                setRouteReady(true);
              }}
              onError={() => {
                setRouteReady(true);
              }}
            />
          </>
        ) : null}
      </MapView>

      {preparing && (
        <View style={styles.preparingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#00b2e1" />
          <Text style={styles.preparingText}>
            {!mapReady
              ? "Preparing map..."
              : !firstFreshFixRef.current
              ? "Waiting for GPS fix..."
              : needsRoute && !routeReady
              ? "Building route..."
              : "Loading..."}
          </Text>
        </View>
      )}

      <View style={styles.followBtn}>
        <TouchableOpacity
          style={[styles.followInner, followPuck ? styles.followOn : styles.followOff]}
          onPress={async () => {
            const next = !followPuck;
            setFollowPuck(next);
            if (next) await quickCenterOnUser();
          }}
          activeOpacity={0.85}
        >
          <Ionicons
            name={followPuck ? "navigate" : "navigate-outline"}
            size={18}
            color={followPuck ? "#fff" : "#0064b5"}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.followText, followPuck ? { color: "#fff" } : { color: "#0064b5" }]}>
            {followPuck ? "Follow: ON" : "Follow: OFF"}
          </Text>
        </TouchableOpacity>
      </View>

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
          <View style={styles.infoCard}>
            <Text style={styles.label}>Speed Limit</Text>
            <Text style={[styles.infoValue, { color: "#29bf12" }]}>{effectiveLimit > 0 ? effectiveLimit : "N/A"}</Text>
            {effectiveLimit > 0 && <Text style={styles.unit}>km/h</Text>}
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.label}>Current Speed</Text>
            <Text
              style={[
                styles.infoValue,
                { color: effectiveLimit > 0 && vehicleSpeed > effectiveLimit ? "#f21b3f" : "#29bf12" },
              ]}
            >
              {vehicleSpeed}
            </Text>
            <Text style={styles.unit}>km/h</Text>
          </View>
        </View>
        <View style={styles.row}>
          {etaMinutes != null && (
            <View style={styles.infoCard}>
              <Text style={styles.label}>ETA</Text>
              <Text style={styles.infoValue}>{etaMinutes} min</Text>
              <Text style={styles.unit}>Estimated</Text>
            </View>
          )}
        </View>
        {effectiveLimit > 0 && vehicleSpeed > effectiveLimit && (
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
    flex: 1
  },
  map: {
    flex: 1
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
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
    backgroundColor: "#0064b5",
  },
  etaText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center"
  },
  etaSubText: {
    color: "#e3f2fd",
    fontSize: 14,
    textAlign: "center"
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
  centerBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: "#eef4ff",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
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
  slowdownAlert: {
    position: "absolute",
    top: 20,
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
    zIndex: 15,
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
    marginBottom: 12
  },
  infoCard: {
    alignItems: "center",
    flex: 1
  },
  label: {
    fontSize: 14,
    color: "#777",
    marginBottom: 4
  },
  infoValue: {
    fontSize: 24,
    fontWeight: "bold"
  },
  unit: {
    fontSize: 12,
    color: "#555"
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
    marginLeft: 8
  },
  preparingOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
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
});
