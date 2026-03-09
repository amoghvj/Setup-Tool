import { useState } from 'react';
import { X } from 'lucide-react';
import { Delivery } from '../lib/mock-data';
import { DriverCard } from './DriverCard';

interface AssignmentModalProps {
  delivery: Delivery;
  onClose: () => void;
  onAssign: (driverId: string) => void;
  drivers: any[];
}

export function AssignmentModal({ delivery, onClose, onAssign, drivers }: AssignmentModalProps) {
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const availableDrivers = drivers.filter(d => d.status === 'available');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Assign Driver to Delivery</h2>
            <p className="text-sm text-gray-600 mt-1">Order {delivery.orderId}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Delivery Details */}
        <div className="p-6 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Customer Address</p>
              <p className="text-sm font-medium text-gray-900">{delivery.customerAddress}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Package Type</p>
              <p className="text-sm font-medium text-gray-900">{delivery.packageType}</p>
            </div>
          </div>
        </div>

        {/* Available Drivers */}
        <div className="p-6 overflow-y-auto max-h-96">
          <h3 className="font-semibold text-gray-900 mb-4">
            Select Available Driver ({availableDrivers.length} available)
          </h3>
          
          {availableDrivers.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No drivers currently available</p>
          ) : (
            <div className="space-y-3">
              {availableDrivers.map((driver) => (
                <label
                  key={driver.id}
                  className={`block cursor-pointer rounded-lg border-2 transition-all ${
                    selectedDriver === driver.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="driver"
                    value={driver.id}
                    checked={selectedDriver === driver.id}
                    onChange={(e) => setSelectedDriver(e.target.value)}
                    className="sr-only"
                  />
                  <div className="p-3">
                    <DriverCard driver={driver} compact />
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => selectedDriver && onAssign(selectedDriver)}
            disabled={!selectedDriver}
            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Confirm Assignment
          </button>
        </div>
      </div>
    </div>
  );
}
