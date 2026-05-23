import { useState, useEffect } from 'react';
import { DeliveryTable } from '../components/DeliveryTable';
import { useLiveLogisticsData } from '../lib/useLiveLogisticsData';
import { toast } from 'sonner';
import { Toaster } from 'sonner';

export function DeliveryManagement() {
  const { drivers: liveDrivers, deliveries: liveDeliveries } = useLiveLogisticsData();
  const [deliveries, setDeliveries] = useState(liveDeliveries);
  const [filter, setFilter] = useState<'all' | 'pending' | 'assigned' | 'in-progress' | 'completed'>('all');

  // Sync state when live data arrives
  useEffect(() => {
    if (liveDeliveries && liveDeliveries.length > 0) {
      setDeliveries(liveDeliveries);
    }
  }, [liveDeliveries]);

  const handleAssignDriver = async (deliveryId: string, driverId: string) => {
    try {
      const response = await fetch('/api/deliveries/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ delivery_id: deliveryId, agent_id: driverId })
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to assign delivery.');
      }

      const driver = liveDrivers.find(d => d.id === driverId);
      const delivery = deliveries.find(d => d.id === deliveryId);

      setDeliveries((prev: any[]) =>
        prev.map((item: any) =>
          item.id === deliveryId
            ? { ...item, status: 'assigned' as const, assignedDriver: driverId }
            : item
        )
      );

      if (payload.delivery) {
        setDeliveries((prev: any[]) =>
          prev.map((item: any) =>
            item.id === deliveryId
              ? {
                  ...item,
                  id: payload.delivery._id?.toString?.() || payload.delivery._id || item.id,
                  status: payload.delivery.status || 'assigned',
                  assignedDriver: payload.delivery.agentId || driverId
                }
              : item
          )
        );
      }

      toast.success(`Driver ${driver?.name} assigned to order ${delivery?.orderId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to assign driver.';
      toast.error(message);
    }
  };

  const filteredDeliveries = filter === 'all'
    ? deliveries
    : deliveries.filter(d => d.status === filter);

  const statusCounts = {
    pending: deliveries.filter(d => d.status === 'pending').length,
    assigned: deliveries.filter(d => d.status === 'assigned').length,
    'in-progress': deliveries.filter(d => d.status === 'in-progress').length,
    completed: deliveries.filter(d => d.status === 'completed').length,
  };

  return (
    <>
      <Toaster position="top-right" richColors />
      <div className="p-6 space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Delivery Management</h1>
          <p className="text-gray-600 mt-1">Assign and manage delivery orders</p>
        </div>

        {/* Status Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <p className="text-sm text-yellow-700 font-medium">Pending</p>
            <p className="text-2xl font-bold text-yellow-900 mt-1">{statusCounts.pending}</p>
          </div>
          <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
            <p className="text-sm text-indigo-700 font-medium">Assigned</p>
            <p className="text-2xl font-bold text-indigo-900 mt-1">{statusCounts.assigned}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-blue-700 font-medium">In Progress</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{statusCounts['in-progress']}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-green-700 font-medium">Completed</p>
            <p className="text-2xl font-bold text-green-900 mt-1">{statusCounts.completed}</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 border-b border-gray-200">
          {(['all', 'pending', 'assigned', 'in-progress', 'completed'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                filter === status
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
            </button>
          ))}
        </div>

        {/* Deliveries Table */}
        <DeliveryTable
          deliveries={filteredDeliveries}
          showAssign={true}
          onAssignDriver={handleAssignDriver}
          drivers={liveDrivers}
        />
      </div>
    </>
  );
}
