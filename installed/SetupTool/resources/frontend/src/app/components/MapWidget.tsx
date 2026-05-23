import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Driver, Delivery } from '../lib/mock-data';
import { MapLegend } from './MapLegend';

// Fix for default marker icons in Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapWidgetProps {
  drivers: Driver[];
  deliveries: Delivery[];
  height?: string;
  forceActiveDriverIcon?: boolean;
}

// Custom marker icons
const createDriverIcon = (status: string, forceActive?: boolean) => {
  const color = forceActive ? '#3b82f6' : status === 'available' ? '#10b981' : status === 'delivering' ? '#3b82f6' : '#6b7280';
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
          <circle cx="7" cy="17" r="2"/>
          <circle cx="17" cy="17" r="2"/>
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const createDeliveryIcon = (status: string) => {
  const color = (status === 'in-progress' || status === 'delivering') ? '#3b82f6' : '#6b7280'; // Blue for active, Gray for pending
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 4px; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

export function MapWidget({ drivers, deliveries, height = '600px', forceActiveDriverIcon = false }: MapWidgetProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<{ drivers: L.Marker[]; deliveries: L.Marker[]; routes: L.Polyline[] }>({
    drivers: [],
    deliveries: [],
    routes: [],
  });

  const center: [number, number] = [40.7489, -73.9680]; // New York City

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current).setView(center, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update markers when data changes
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;

    // Clear existing markers
    markersRef.current.drivers.forEach(marker => marker.remove());
    markersRef.current.deliveries.forEach(marker => marker.remove());
    markersRef.current.routes.forEach(route => route.remove());
    markersRef.current = { drivers: [], deliveries: [], routes: [] };

    // Add delivery markers
    deliveries.forEach(delivery => {
      const marker = L.marker([delivery.lat, delivery.lng], {
        icon: createDeliveryIcon(delivery.status), // Now using status
      }).addTo(map);

      marker.bindPopup(`
        <div class="p-2">
          <p class="font-semibold text-gray-900">${delivery.orderId}</p>
          <p class="text-xs text-gray-600 mt-1">${delivery.customerAddress}</p>
          <p class="text-xs text-gray-600">Status: ${delivery.status}</p>
        </div>
      `);

      markersRef.current.deliveries.push(marker);
    });

    // Add driver markers
    drivers.forEach(driver => {
      const marker = L.marker([driver.lat, driver.lng], {
        icon: createDriverIcon(driver.status, forceActiveDriverIcon),
      }).addTo(map);

      marker.bindPopup(`
        <div class="p-2">
          <p class="font-semibold text-gray-900">${driver.name}</p>
          <p class="text-xs text-gray-600">ID: ${driver.id}</p>
          <p class="text-xs text-gray-600 mt-1">Status: ${driver.status}</p>
          ${driver.currentDelivery ? `<p class="text-xs text-gray-600">Order: ${driver.currentDelivery}</p>` : ''}
        </div>
      `);

      markersRef.current.drivers.push(marker);
    });

    // Add route paths for active deliveries
    drivers
      .filter(d => d.currentDelivery)
      .forEach(driver => {
        const delivery = deliveries.find(del => del.id === driver.currentDelivery);
        if (!delivery) return;

        const route = L.polyline(
          [
            [driver.lat, driver.lng],
            [delivery.lat, delivery.lng],
          ],
          {
            color: '#3b82f6',
            weight: 3,
            opacity: 0.7,
            dashArray: '10, 10',
          }
        ).addTo(map);

        markersRef.current.routes.push(route);
      });
  }, [drivers, deliveries]);

  // Simulate driver movement animation
  useEffect(() => {
    if (!mapRef.current) return;

    const interval = setInterval(() => {
      markersRef.current.drivers.forEach((marker, index) => {
        const driver = drivers[index];
        if (driver && driver.status === 'delivering') {
          const currentLatLng = marker.getLatLng();
          const newLatLng = L.latLng(
            currentLatLng.lat + (Math.random() - 0.5) * 0.001,
            currentLatLng.lng + (Math.random() - 0.5) * 0.001
          );
          marker.setLatLng(newLatLng);

          // Update route if exists
          const routeIndex = drivers
              .slice(0, index)
              .filter(d => d.currentDelivery).length;
          if (markersRef.current.routes[routeIndex]) {
              const delivery = deliveries.find(del => del.id === driver.currentDelivery);
            if (delivery) {
              markersRef.current.routes[routeIndex].setLatLngs([
                newLatLng,
                [delivery.lat, delivery.lng],
              ]);
            }
          }
        }
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [drivers, deliveries]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden" style={{ height }}>
      <div ref={mapContainerRef} style={{ height: '100%', width: '100%' }} />
      <MapLegend />
    </div>
  );
}