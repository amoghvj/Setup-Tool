import { Bell, Package, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface Notification {
  id: string;
  type: 'success' | 'warning' | 'info' | 'error';
  title: string;
  message: string;
  time: string;
}

const mockNotifications: Notification[] = [
  {
    id: '1',
    type: 'success',
    title: 'Delivery Completed',
    message: 'Order #ORD-1230 was successfully delivered',
    time: '5 mins ago'
  },
  {
    id: '2',
    type: 'warning',
    title: 'Driver Offline',
    message: 'James Wilson went offline',
    time: '12 mins ago'
  },
  {
    id: '3',
    type: 'info',
    title: 'New Assignment',
    message: 'Driver Sarah Johnson assigned to Order #ORD-1234',
    time: '25 mins ago'
  },
  {
    id: '4',
    type: 'error',
    title: 'Delivery Delayed',
    message: 'Order #ORD-1228 is running 15 minutes late',
    time: '1 hour ago'
  }
];

const iconMap = {
  success: CheckCircle,
  warning: AlertCircle,
  info: Package,
  error: AlertCircle
};

const colorMap = {
  success: 'text-green-600 bg-green-100',
  warning: 'text-orange-600 bg-orange-100',
  info: 'text-blue-600 bg-blue-100',
  error: 'text-red-600 bg-red-100'
};

interface NotificationPanelProps {
  onClose: () => void;
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-16 right-6 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-gray-700" />
            <h3 className="font-semibold text-gray-900">Notifications</h3>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Mark all as read
          </button>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
          {mockNotifications.map((notification) => {
            const Icon = iconMap[notification.type];
            
            return (
              <div
                key={notification.id}
                className="p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex gap-3">
                  <div className={`p-2 rounded-lg ${colorMap[notification.type]} flex-shrink-0`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{notification.title}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{notification.message}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-500">{notification.time}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-200">
          <button className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium py-2">
            View all notifications
          </button>
        </div>
      </div>
    </>
  );
}