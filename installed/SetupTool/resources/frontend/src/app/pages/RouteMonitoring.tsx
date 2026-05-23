import { useState, useEffect } from 'react';
import { MapWidget } from '../components/MapWidget';
import { DeliveryTimeline } from '../components/DeliveryTimeline';
import { useLiveLogisticsData } from '../lib/useLiveLogisticsData';
import { StatusBadge } from '../components/StatusBadge';
import { Clock, MapPin, Package, User } from 'lucide-react';

export function RouteMonitoring() {
  const { drivers, deliveries } = useLiveLogisticsData();
  const [selectedDelivery, setSelectedDelivery] = useState<any>(undefined);

  // Initialize selected delivery once live tracking data is downloaded
  useEffect(() => {
    if (deliveries.length > 0 && !selectedDelivery) {
      setSelectedDelivery(deliveries.find(d => d.status === 'in-progress' && d.timeline));
    }
  }, [deliveries]);

  const activeDeliveries = deliveries.filter(d => d.status === 'in-progress' || d.status === 'assigned');
  const selectedDriver = selectedDelivery?.assignedDriver 
    ? drivers.find(d => d.id === selectedDelivery.assignedDriver)
    : null;

  // Derive selected agents based on selected delivery (or all if none selected)
  const selectedAgentIds = selectedDelivery?.assignedDriver 
    ? [selectedDelivery.assignedDriver] 
    : drivers.map(d => d.id);

  const filteredMapDrivers = drivers.filter(d => selectedAgentIds.includes(d.id));
  const filteredMapDeliveries = activeDeliveries.filter(d => 
    !d.assignedDriver || selectedAgentIds.includes(d.assignedDriver)
  );

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Route Monitoring</h1>
        <p className="text-gray-600 mt-1">Track active delivery routes and progress</p>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map */}
        <div className="lg:col-span-2">
          <MapWidget 
            drivers={filteredMapDrivers.filter(d => d.status === 'delivering')} 
            deliveries={filteredMapDeliveries} 
            height="700px" 
          />
        </div>

        {/* Active Routes List */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Active Routes ({activeDeliveries.length})
          </h2>
          <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2">
            {activeDeliveries.map(delivery => {
              const driver = delivery.assignedDriver 
                ? drivers.find(d => d.id === delivery.assignedDriver)
                : null;

              return (
                <button
                  key={delivery.id}
                  onClick={() => setSelectedDelivery(selectedDelivery?.id === delivery.id ? undefined : delivery)}
                  className={`w-full text-left bg-white rounded-lg border-2 p-4 transition-all hover:shadow-md ${
                    selectedDelivery?.id === delivery.id
                      ? 'border-blue-600 shadow-md'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-semibold text-gray-900">{delivery.orderId}</span>
                    <StatusBadge status={delivery.status} />
                  </div>

                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span className="truncate">{delivery.customerAddress}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-400" />
                      <span>{delivery.packageType}</span>
                    </div>

                    {driver && (
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span>{driver.name}</span>
                      </div>
                    )}

                    {driver?.eta && (
                      <div className="flex items-center gap-2 text-blue-600 font-medium">
                        <Clock className="w-4 h-4" />
                        <span>ETA: {driver.eta}</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Delivery Details */}
      {selectedDelivery && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Delivery Info Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Delivery Details</h3>
            
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Order ID</p>
                <p className="font-medium text-gray-900">{selectedDelivery.orderId}</p>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1">Customer Address</p>
                <p className="font-medium text-gray-900">{selectedDelivery.customerAddress}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Package Type</p>
                  <p className="font-medium text-gray-900">{selectedDelivery.packageType}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Priority</p>
                  <StatusBadge status={selectedDelivery.priority} />
                </div>
              </div>

              {selectedDriver && (
                <div className="pt-4 border-t border-gray-200">
                  <p className="text-xs text-gray-500 mb-3">Assigned Driver</p>
                  <div className="flex items-center gap-3">
                    <img
                      src={selectedDriver.avatar}
                      alt={selectedDriver.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div>
                      <p className="font-medium text-gray-900">{selectedDriver?.name}</p>
                      <p className="text-sm text-gray-600">{selectedDriver?.id}</p>
                      {selectedDriver?.eta && (
                        <p className="text-sm text-blue-600 font-medium">ETA: {selectedDriver.eta}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          {selectedDelivery.timeline && (
            <DeliveryTimeline steps={selectedDelivery.timeline} />
          )}
        </div>
      )}
    </div>
  );
}
