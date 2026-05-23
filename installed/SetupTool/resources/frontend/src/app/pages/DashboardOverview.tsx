import { useState, useEffect } from 'react';
import { Package, Users, MapPin } from 'lucide-react';
import { KPICard } from '../components/KPICard';
import { MapWidget } from '../components/MapWidget';
import { DriverCard } from '../components/DriverCard';
import { DeliveryTimeline } from '../components/DeliveryTimeline';
import { useLiveLogisticsData } from '../lib/useLiveLogisticsData';

export function DashboardOverview() {
  const [branchCount, setBranchCount] = useState<number | undefined>(undefined);
  const [activeDeliveryCount, setActiveDeliveryCount] = useState<number | null>(null);
  const [waitingDeliveryCount, setWaitingDeliveryCount] = useState<number | null>(null);
  const [driverCount, setDriverCount] = useState<number | null>(null);
  
  // Real-time map data from new Hook
  const { drivers, deliveries } = useLiveLogisticsData();

  // Dashboard default is all drivers visible
  // The selectedAgentIds state is removed as all drivers from the hook are now displayed by default.


  useEffect(() => {
    // Fetch pickup branches
    fetch('/api/pickups')
      .then(res => res.json())
      .then(data => {
        if (data.success && typeof data.count === 'number') {
          setBranchCount(data.count);
        }
      })
      .catch(err => console.error('Failed to fetch pickups:', err));

    // Fetch available drivers (all agents) and calculate active/waiting deliveries
    fetch('/api/agents')
      .then(res => res.json())
      .then(data => {
        if (data.success && typeof data.count === 'number' && Array.isArray(data.agents)) {
          setDriverCount(data.count);
          
          let activeSum = 0;
          let waitingSum = 0;
          
          data.agents.forEach((agent: any) => {
            if (Array.isArray(agent.activeDeliveries)) {
              activeSum += agent.activeDeliveries.length;
            }
            if (Array.isArray(agent.pendingPickupDeliveries)) {
              waitingSum += agent.pendingPickupDeliveries.length;
            }
          });
          
          setActiveDeliveryCount(activeSum);
          setWaitingDeliveryCount(waitingSum);
        }
      })
      .catch(err => console.error('Failed to fetch agents:', err));
  }, []);
  
  const activeDrivers = drivers.filter(d => Boolean(d.currentDelivery));
  const activeDelivery = deliveries.find(d => d.status === 'in-progress' && d.timeline);

  // All drivers and deliveries from the hook are now displayed on the map
  const filteredMapDrivers = drivers;
  const filteredMapDeliveries = deliveries;

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
        <p className="text-gray-600 mt-1">Real-time logistics monitoring and management</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Active Deliveries"
          value={activeDeliveryCount}
          icon={Package}
          color="blue"
        />
        <KPICard
          title="Waiting Deliveries"
          value={waitingDeliveryCount}
          icon={Package}
          color="blue"
        />
        <KPICard
          title="Available Drivers"
          value={driverCount}
          icon={Users}
          color="green"
        />
        <KPICard
          title="Available Branches"
          value={branchCount}
          icon={MapPin}
          color="red"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map Section - Takes 2 columns */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Live Tracking Map</h2>
          <MapWidget 
            drivers={filteredMapDrivers} 
            deliveries={filteredMapDeliveries} 
            height="600px" 
            forceActiveDriverIcon={true} 
          />
        </div>

        {/* Driver Status Panel */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Active Drivers ({activeDrivers.length})
          </h2>
          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
            {activeDrivers.map(driver => (
              <DriverCard key={driver.id} driver={driver} />
            ))}
          </div>
        </div>
      </div>

      {/* Delivery Timeline */}
      {activeDelivery && activeDelivery.timeline && (
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Active Delivery Timeline - {activeDelivery.orderId}
          </h2>
          <DeliveryTimeline steps={activeDelivery.timeline} />
        </div>
      )}
    </div>
  );
}
