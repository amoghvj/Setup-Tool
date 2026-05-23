import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { analyticsData, kpiData } from '../lib/mock-data';
import { Package, Users, CheckCircle, AlertTriangle, TrendingUp, Clock } from 'lucide-react';
import { KPICard } from '../components/KPICard';

export function Analytics() {
  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
        <p className="text-gray-600 mt-1">Performance metrics and insights</p>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Active Deliveries"
          value={kpiData.activeDeliveries}
          icon={Package}
          trend={kpiData.activeDeliveriesTrend}
          color="blue"
        />
        <KPICard
          title="Available Drivers"
          value={kpiData.availableDrivers}
          icon={Users}
          trend={kpiData.availableDriversTrend}
          color="green"
        />
        <KPICard
          title="Completed Today"
          value={kpiData.completedToday}
          icon={CheckCircle}
          trend={kpiData.completedTodayTrend}
          color="green"
        />
        <KPICard
          title="Delayed Deliveries"
          value={kpiData.delayedDeliveries}
          icon={AlertTriangle}
          trend={kpiData.delayedDeliveriesTrend}
          color="red"
        />
      </div>

      {/* Weekly Deliveries Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Weekly Delivery Performance</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={analyticsData.weeklyDeliveries}>
            <CartesianGrid key="grid-weekly" strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis key="xaxis-weekly" dataKey="day" stroke="#6b7280" />
            <YAxis key="yaxis-weekly" stroke="#6b7280" />
            <Tooltip 
              key="tooltip-weekly"
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
              }}
            />
            <Legend key="legend-weekly" />
            <Line 
              key="line-deliveries"
              type="monotone" 
              dataKey="deliveries" 
              stroke="#3b82f6" 
              strokeWidth={2}
              name="Total Deliveries"
            />
            <Line 
              key="line-delayed"
              type="monotone" 
              dataKey="delayed" 
              stroke="#ef4444" 
              strokeWidth={2}
              name="Delayed"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Driver Performance */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Driver Performance (This Week)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analyticsData.driverPerformance} layout="horizontal">
              <CartesianGrid key="grid-driver" strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis key="xaxis-driver" type="number" stroke="#6b7280" />
              <YAxis key="yaxis-driver" dataKey="name" type="category" width={80} stroke="#6b7280" />
              <Tooltip 
                key="tooltip-driver"
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
              />
              <Bar key="bar-driver" dataKey="completed" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Completed Deliveries" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Delivery By Hour */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Delivery Volume by Time</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analyticsData.deliveryByHour}>
              <CartesianGrid key="grid-hour" strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis key="xaxis-hour" dataKey="hour" stroke="#6b7280" />
              <YAxis key="yaxis-hour" stroke="#6b7280" />
              <Tooltip 
                key="tooltip-hour"
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
              />
              <Bar key="bar-hour" dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} name="Deliveries" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Additional Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-sm p-6 text-white">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="w-8 h-8 opacity-80" />
            <span className="text-sm font-medium bg-white bg-opacity-20 px-3 py-1 rounded-full">
              +12.5%
            </span>
          </div>
          <p className="text-sm opacity-90 mb-1">Average Daily Deliveries</p>
          <p className="text-3xl font-bold">138</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-sm p-6 text-white">
          <div className="flex items-center justify-between mb-3">
            <CheckCircle className="w-8 h-8 opacity-80" />
            <span className="text-sm font-medium bg-white bg-opacity-20 px-3 py-1 rounded-full">
              98.2%
            </span>
          </div>
          <p className="text-sm opacity-90 mb-1">On-Time Delivery Rate</p>
          <p className="text-3xl font-bold">Excellent</p>
        </div>

        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-sm p-6 text-white">
          <div className="flex items-center justify-between mb-3">
            <Clock className="w-8 h-8 opacity-80" />
            <span className="text-sm font-medium bg-white bg-opacity-20 px-3 py-1 rounded-full">
              -3 min
            </span>
          </div>
          <p className="text-sm opacity-90 mb-1">Avg Delivery Time</p>
          <p className="text-3xl font-bold">24 min</p>
        </div>
      </div>
    </div>
  );
}