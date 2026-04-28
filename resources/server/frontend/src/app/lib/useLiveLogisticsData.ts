import { useState, useEffect } from 'react';
import { Driver, Delivery } from './mock-data';

export function useLiveLogisticsData() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        const [agentsRes, deliveriesRes] = await Promise.all([
          fetch('/api/agents'),
          fetch('/api/deliveries')
        ]);
        
        const agentsData = await agentsRes.json();
        const deliveriesData = await deliveriesRes.json();

        if (mounted) {
          // Map MongoDB Agents -> UI Drivers
          const mappedDrivers: Driver[] = (agentsData.agents || []).map((agent: any) => ({
            id: agent.agentId,
            name: agent.agentId, // Fallback since real names aren't in schema
            avatar: 'https://images.unsplash.com/photo-1531427186611-ecfd6d936c79?w=150&h=150&fit=crop', // Generic avatar
            status: (Array.isArray(agent.activeDeliveries) && agent.activeDeliveries.length > 0) ||
              (Array.isArray(agent.pendingPickupDeliveries) && agent.pendingPickupDeliveries.length > 0)
              ? 'unavailable'
              : 'available',
            location: 'Unknown Area',
            lat: agent.nextPickupLocation?.lat || 40.7128,
            lng: agent.nextPickupLocation?.lng || -74.0060,
            completedToday: 0,
            currentDelivery: agent.activeDeliveries && agent.activeDeliveries.length > 0 
              ? agent.activeDeliveries[0]?.toString?.() || agent.activeDeliveries[0]
              : undefined
          }));

          // Map MongoDB Deliveries -> UI Deliveries
          const mappedDeliveries: Delivery[] = (deliveriesData.deliveries || []).map((delivery: any) => ({
            id: delivery._id?.toString?.() || delivery._id,
            orderId: delivery.orderId,
            customerAddress: 'Unknown Destination',
            packageType: 'Standard Core',
            priority: 'medium',
            status: delivery.status || (delivery.agentId ? 'assigned' : 'pending'),
            assignedDriver: delivery.agentId,
            lat: delivery.destination?.lat || 40.7128,
            lng: delivery.destination?.lng || -74.0060,
            timeline: [] // Skip timelines for now since real system doesn't generate them yet
          }));

          setDrivers(mappedDrivers);
          setDeliveries(mappedDeliveries);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error fetching live data:", error);
        if (mounted) setIsLoading(false);
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
  }, []);

  return { drivers, deliveries, isLoading };
}
