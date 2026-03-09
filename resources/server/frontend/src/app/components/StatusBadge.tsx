interface StatusBadgeProps {
  status: 'available' | 'delivering' | 'offline' | 'pending' | 'assigned' | 'in-progress' | 'completed' | 'delayed' | 'low' | 'medium' | 'high';
}

const statusConfig = {
  // Driver statuses
  available: { label: 'Available', className: 'bg-green-100 text-green-700 border-green-200' },
  delivering: { label: 'Delivering', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  offline: { label: 'Offline', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  
  // Delivery statuses
  pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  assigned: { label: 'Assigned', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  'in-progress': { label: 'In Progress', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-700 border-green-200' },
  delayed: { label: 'Delayed', className: 'bg-red-100 text-red-700 border-red-200' },
  
  // Priority levels
  low: { label: 'Low', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  medium: { label: 'Medium', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  high: { label: 'High', className: 'bg-red-100 text-red-700 border-red-200' },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      {config.label}
    </span>
  );
}
