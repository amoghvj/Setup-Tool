import polyline from "@mapbox/polyline";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, {
  Marker,
  Polyline,
  PROVIDER_GOOGLE,
} from "react-native-maps";

/* ---------- Types ---------- */
type Delivery = {
  orderId: string | null;
  destination: { lat: number; lng: number };
};

type PickupLocation = {
  lat: number;
  lng: number;
} | null;

type LatLng = {
  latitude: number;
  longitude: number;
};

/* ---------- Environment ---------- */
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const AGENT_ID = process.env.EXPO_PUBLIC_AGENT_ID;

export default function HomeScreen() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [nextPickupLocation, setNextPickupLocation] =
    useState<PickupLocation>(null);
  const [liveUserLocation, setLiveUserLocation] =
    useState<LatLng | null>(null);
  const [routeOriginLocation, setRouteOriginLocation] =
    useState<LatLng | null>(null);
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([]);
  const [registered, setRegistered] = useState(false);

  // Route fingerprint: only recalculate the polyline when destinations change
  const lastRouteFingerprintRef = useRef<string>("");
  const mapRef = useRef<MapView>(null);

  /* ----------------------------
     Step 2 — Agent Registration
  ---------------------------- */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/agents/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_id: AGENT_ID }),
        });

        if (res.ok || res.status === 409) {
          // 409 = already registered, proceed normally
          setRegistered(true);
        } else {
          const err = await res.json();
          Alert.alert("Registration failed", err.error || "Unknown error");
        }
      } catch (err) {
        Alert.alert("Connection error", "Could not reach the server.");
        console.error("Registration error:", err);
      }
    })();
  }, []);

  /* ----------------------------
     Live location updates +
     Location reporting (Step 4)
  ---------------------------- */
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      const { status } =
        await Location.requestForegroundPermissionsAsync();

      if (status !== "granted") {
        Alert.alert("Permission denied", "Location permission required");
        return;
      }

      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const initialCoords = {
        latitude: initialLocation.coords.latitude,
        longitude: initialLocation.coords.longitude,
      };

      setLiveUserLocation(initialCoords);
      setRouteOriginLocation(initialCoords);

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (location) => {
          const coords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          setLiveUserLocation(coords);

          // Report location to backend
          fetch(`${BACKEND_URL}/api/agents/location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agent_id: AGENT_ID,
              coords: { lat: coords.latitude, lng: coords.longitude },
            }),
          }).catch(console.error);
        }
      );
    })();

    return () => subscription?.remove();
  }, []);

  /* ----------------------------
     Step 3 — Fetch route after
     registration + GPS ready.
     Polls every 5 seconds.
  ---------------------------- */
  useEffect(() => {
    if (!registered || !routeOriginLocation) return;

    // Fetch immediately on first load
    fetchRoute();

    // Then poll every 5 seconds for updates
    const interval = setInterval(fetchRoute, 5000);
    return () => clearInterval(interval);
  }, [registered, routeOriginLocation]);

  const fetchRoute = async () => {
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/agents/route?agent_id=${AGENT_ID}`
      );
      const data = await res.json();

      if (!data.success) {
        console.error("Route fetch failed:", data.error);
        return;
      }

      const newDeliveries: Delivery[] = data.activeDeliveries || [];
      const newPickup: PickupLocation = data.nextPickupLocation || null;

      setDeliveries(newDeliveries);
      setNextPickupLocation(newPickup);

      // Build a fingerprint from the ordered list of orderIds + pickup coords
      const fingerprint = JSON.stringify({
        orders: newDeliveries.map((d) => d.orderId),
        pickup: newPickup,
      });

      // Only call Google Directions API if the destinations changed
      if (fingerprint !== lastRouteFingerprintRef.current) {
        lastRouteFingerprintRef.current = fingerprint;

        if (liveUserLocation && newDeliveries.length > 0) {
          // temp_start = driver's current GPS at recalculation time
          const tempStart = { ...liveUserLocation };
          const polylineCoords = await buildRoutePolyline(
            tempStart,
            newDeliveries,
            newPickup
          );
          setRouteCoords(polylineCoords);
        } else if (liveUserLocation && newPickup) {
          // No active deliveries but there is a pickup location — draw line to pickup
          const tempStart = { ...liveUserLocation };
          const polylineCoords = await buildRoutePolyline(
            tempStart,
            [],
            newPickup
          );
          setRouteCoords(polylineCoords);
        } else {
          setRouteCoords([]);
        }
      }
    } catch (err) {
      console.error("Route fetch error:", err);
    }
  };

  /* ----------------------------
     Build polyline via Google
     Directions API
  ---------------------------- */
  const buildRoutePolyline = async (
    origin: LatLng,
    activeDeliveries: Delivery[],
    pickupLocation: PickupLocation
  ): Promise<LatLng[]> => {
    const originStr = `${origin.latitude},${origin.longitude}`;

    // All delivery destinations as waypoints
    const waypoints = activeDeliveries
      .map((d) => `via:${d.destination.lat},${d.destination.lng}`)
      .join("|");

    // Final destination: nextPickupLocation if available, otherwise last delivery
    let destinationStr: string;
    if (pickupLocation && pickupLocation.lat && pickupLocation.lng) {
      // If no deliveries, route goes directly to pickup
      if (activeDeliveries.length === 0) {
        destinationStr = `${pickupLocation.lat},${pickupLocation.lng}`;
      } else {
        destinationStr = `${pickupLocation.lat},${pickupLocation.lng}`;
      }
    } else if (activeDeliveries.length > 0) {
      const last = activeDeliveries[activeDeliveries.length - 1];
      destinationStr = `${last.destination.lat},${last.destination.lng}`;
    } else {
      // Nothing to route to
      return [];
    }

    const url =
      `https://maps.googleapis.com/maps/api/directions/json?` +
      `origin=${originStr}` +
      `&destination=${destinationStr}` +
      `&waypoints=${waypoints}` +
      `&mode=driving` +
      `&key=${GOOGLE_MAPS_API_KEY}`;

    const res = await fetch(url);
    const json = await res.json();

    if (!json.routes?.length) return [];

    const decoded = polyline.decode(
      json.routes[0].overview_polyline.points
    );

    return decoded.map(([latitude, longitude]: number[]) => ({
      latitude,
      longitude,
    }));
  };

  /* ----------------------------
     Step 5 — Delivery Lifecycle
  ---------------------------- */
  const handleCompleteDelivery = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/deliveries/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: AGENT_ID }),
      });
      const data = await res.json();
      if (data.success) {
        lastRouteFingerprintRef.current = "";
        await fetchRoute();
      } else {
        Alert.alert("Error", data.error || "Could not complete delivery");
      }
    } catch (err) {
      console.error("Complete delivery error:", err);
    }
  };

  const handlePickup = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/deliveries/pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: AGENT_ID }),
      });
      const data = await res.json();
      if (data.success) {
        lastRouteFingerprintRef.current = "";
        await fetchRoute();
      } else {
        Alert.alert("Error", data.error || "Could not process pickup");
      }
    } catch (err) {
      console.error("Pickup error:", err);
    }
  };

  /* ----------------------------
     Render
  ---------------------------- */
  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFillObject}
        showsUserLocation
        showsMyLocationButton
        initialRegion={{
          latitude: routeOriginLocation?.latitude ?? 13.0418,
          longitude: routeOriginLocation?.longitude ?? 80.2341,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {/* Route polyline */}
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeWidth={5}
            strokeColor="#1E90FF"
          />
        )}

        {/* Delivery markers */}
        {deliveries.map((d, index) => (
          <Marker
            key={d.orderId || `delivery-${index}`}
            coordinate={{
              latitude: d.destination.lat,
              longitude: d.destination.lng,
            }}
            title={`Stop ${index + 1}`}
            description={d.orderId ? `Order: ${d.orderId}` : undefined}
            pinColor="red"
          />
        ))}

        {/* Next pickup location — distinct marker */}
        {nextPickupLocation &&
          nextPickupLocation.lat &&
          nextPickupLocation.lng && (
            <Marker
              coordinate={{
                latitude: nextPickupLocation.lat,
                longitude: nextPickupLocation.lng,
              }}
              title="Next Pickup"
              description="Collect next batch here"
              pinColor="green"
            />
          )}
      </MapView>

      {/* Empty state */}
      {deliveries.length === 0 && registered && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No deliveries assigned</Text>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.buttonContainer}>
        {deliveries.length > 0 && (
          <Pressable
            style={[styles.actionButton, styles.deliverButton]}
            onPress={handleCompleteDelivery}
          >
            <Text style={styles.buttonText}>Mark Delivered</Text>
          </Pressable>
        )}

        {deliveries.length === 0 && (
          <Pressable
            style={[styles.actionButton, styles.pickupButton]}
            onPress={handlePickup}
          >
            <Text style={styles.buttonText}>Picked Up</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyContainer: {
    position: "absolute",
    top: 80,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  emptyText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonContainer: {
    position: "absolute",
    bottom: 30,
    right: 20,
    gap: 10,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 22,
    elevation: 4,
  },
  deliverButton: {
    backgroundColor: "#1E90FF",
  },
  pickupButton: {
    backgroundColor: "#2ECC71",
  },
  buttonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 15,
  },
});
