import { useState, useEffect } from 'react';
import { MapWidget } from '../components/MapWidget';
import { DriverCard } from '../components/DriverCard';
import { StatusBadge } from '../components/StatusBadge';
import { useLiveLogisticsData } from '../lib/useLiveLogisticsData';

export function LiveDriverTracking() {
  const { drivers, deliveries } = useLiveLogisticsData();
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  
  // Initialize selection once drivers load
  useEffect(() => {
    if (drivers.length > 0 && selectedAgentIds.length === 0) {
      setSelectedAgentIds(drivers.map(d => d.id));
    }
  }, [drivers]);

  const toggleDriver = (id: string) => {
    setSelectedAgentIds(prev => 
      prev.includes(id) ? prev.filter(aid => aid !== id) : [...prev, id]
    );
  };

  const filteredDrivers = drivers.filter(d => selectedAgentIds.includes(d.id));
  const filteredDeliveries = deliveries.filter(d => 
    !d.assignedDriver || selectedAgentIds.includes(d.assignedDriver)
  );

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Live Driver Tracking</h1>
        <p className="text-gray-600 mt-1">Monitor all drivers in real-time</p>
      </div>

      {/* Header Info */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-700">Select drivers from the sidebar to isolate them on the map.</span>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map */}
        <div className="lg:col-span-2">
          <MapWidget drivers={filteredDrivers} deliveries={filteredDeliveries} height="700px" />
        </div>

        {/* Driver Selection UI */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Driver Selection ({selectedAgentIds.length}/{drivers.length})
          </h2>
          <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2">
            {drivers.map(driver => (
              <label 
                key={driver.id} 
                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedAgentIds.includes(driver.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <input 
                  type="checkbox" 
                  className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  checked={selectedAgentIds.includes(driver.id)}
                  onChange={() => toggleDriver(driver.id)}
                />
                <img src={driver.avatar} alt={driver.name} className="w-10 h-10 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{driver.name}</p>
                  <p className="text-xs text-gray-500">{driver.id}</p>
                </div>
                <StatusBadge status={driver.status} />
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
