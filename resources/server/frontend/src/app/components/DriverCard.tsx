import { Clock, MapPin, Package } from 'lucide-react';
import { Driver } from '../lib/mock-data';
import { StatusBadge } from './StatusBadge';

interface DriverCardProps {
  driver: Driver;
  compact?: boolean;
}

export function DriverCard({ driver, compact = false }: DriverCardProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
        <img
          src={driver.avatar}
          alt={driver.name}
          className="w-10 h-10 rounded-full object-cover"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium text-gray-900 truncate">{driver.name}</p>
            <span className="text-xs text-gray-500">({driver.id})</span>
          </div>
          <StatusBadge status={driver.status} />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3 mb-4">
        <img
          src={driver.avatar}
          alt={driver.name}
          className="w-12 h-12 rounded-full object-cover"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 truncate">{driver.name}</h3>
            <span className="text-sm text-gray-500">({driver.id})</span>
          </div>
          <StatusBadge status={driver.status} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPin className="w-4 h-4 text-gray-400" />
          <span>{driver.location}</span>
        </div>

        {driver.currentDelivery && (
          <>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Package className="w-4 h-4 text-gray-400" />
              <span>Order: {driver.currentDelivery}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="w-4 h-4 text-gray-400" />
              <span>ETA: {driver.eta}</span>
            </div>
          </>
        )}

        <div className="pt-2 mt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Completed today: <span className="font-semibold text-gray-900">{driver.completedToday}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
