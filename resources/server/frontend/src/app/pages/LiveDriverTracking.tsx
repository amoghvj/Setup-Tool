import { useState, useEffect } from 'react';
import { MapWidget } from '../components/MapWidget';
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
  }, [drivers, selectedAgentIds.length]);

  const toggleDriver = (id: string) => {
    setSelectedAgentIds(prev => 
      prev.includes(id) ? prev.filter(aid => aid !== id) : [...prev, id]
    );
  };

  const selectAllDrivers = () => setSelectedAgentIds(drivers.map(driver => driver.id));
  const clearAllDrivers = () => setSelectedAgentIds([]);

  const filteredDrivers = drivers.filter(d => selectedAgentIds.includes(d.id));
  const filteredDeliveries = deliveries.filter(d => 
    !d.assignedDriver || selectedAgentIds.includes(d.assignedDriver)
  );

  const selectedDriverCount = filteredDrivers.length;
  const visibleDeliveryCount = filteredDeliveries.length;
  const hiddenDriverCount = drivers.length - selectedDriverCount;
  const assignedDeliveryCount = filteredDeliveries.filter(delivery => Boolean(delivery.assignedDriver)).length;

  return (
    <div className="min-h-full bg-gradient-to-br from-slate-50 via-white to-blue-50/40 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Live telemetry
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Sync active
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Live Driver Tracking
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                Monitor the current fleet, isolate specific drivers, and keep the map focused on the routes that matter most.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[520px] lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Selected drivers</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{selectedDriverCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Visible deliveries</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{visibleDeliveryCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Assigned on map</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{assignedDeliveryCount}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)]">
              <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Fleet map</h2>
                  <p className="text-sm text-slate-500">
                    Showing {selectedDriverCount} of {drivers.length} drivers and {visibleDeliveryCount} visible deliveries.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={selectAllDrivers}
                    className="rounded-full border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={clearAllDrivers}
                    className="rounded-full border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Clear selection
                  </button>
                </div>
              </div>

              <MapWidget drivers={filteredDrivers} deliveries={filteredDeliveries} height="720px" />
            </div>
          </div>

          <div className="xl:sticky xl:top-6">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)]">
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Driver selection
                    </h2>
                    <p className="text-sm text-slate-500">
                      {selectedAgentIds.length}/{drivers.length} active on the map
                    </p>
                  </div>
                  <StatusBadge status={selectedAgentIds.length > 0 ? 'available' : 'offline'} />
                </div>
              </div>

              <div className="max-h-[820px] space-y-3 overflow-y-auto p-4 pr-3">
                {drivers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    No drivers are available right now.
                  </div>
                ) : (
                  drivers.map(driver => {
                    const isSelected = selectedAgentIds.includes(driver.id);

                    return (
                      <label 
                        key={driver.id} 
                        className={`group flex items-center gap-3 rounded-2xl border p-3 transition-all ${
                          isSelected
                            ? 'border-blue-200 bg-blue-50/80 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <input 
                          type="checkbox" 
                          className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={isSelected}
                          onChange={() => toggleDriver(driver.id)}
                        />
                        <img src={driver.avatar} alt={driver.name} className="h-12 w-12 rounded-2xl object-cover ring-1 ring-slate-200" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-semibold text-slate-900">{driver.name}</p>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                              {driver.id}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {driver.location}
                          </p>
                        </div>
                        <StatusBadge status={driver.status} />
                      </label>
                    );
                  })
                )}

                {hiddenDriverCount > 0 && drivers.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {hiddenDriverCount} driver{hiddenDriverCount === 1 ? '' : 's'} are currently hidden from the map.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
