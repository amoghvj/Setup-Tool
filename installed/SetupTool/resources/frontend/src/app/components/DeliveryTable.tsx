import { useState } from 'react';
import { Delivery } from '../lib/mock-data';
import { StatusBadge } from './StatusBadge';
import { AssignmentModal } from './AssignmentModal';

interface DeliveryTableProps {
  deliveries: Delivery[];
  showAssign?: boolean;
  onAssignDriver?: (deliveryId: string, driverId: string) => void;
  drivers?: any[];
}

export function DeliveryTable({ deliveries, showAssign = false, onAssignDriver, drivers = [] }: DeliveryTableProps) {
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer Address
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Package Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                {showAssign && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {deliveries.map((delivery) => (
                <tr key={delivery.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900">{delivery.orderId}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">{delivery.customerAddress}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-600">{delivery.packageType}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={delivery.priority} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={delivery.status} />
                  </td>
                  {showAssign && delivery.status === 'pending' && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => setSelectedDelivery(delivery)}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Assign Driver
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedDelivery && onAssignDriver && (
        <AssignmentModal
          delivery={selectedDelivery}
          drivers={drivers}
          onClose={() => setSelectedDelivery(null)}
          onAssign={(driverId) => {
            onAssignDriver(selectedDelivery.id, driverId);
            setSelectedDelivery(null);
          }}
        />
      )}
    </>
  );
}
