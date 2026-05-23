export function MapLegend() {
  return (
    <div className="absolute bottom-6 left-6 bg-white rounded-lg shadow-lg border border-gray-200 p-4 z-[1000]">
      <h4 className="text-sm font-semibold text-gray-900 mb-3">Map Legend</h4>
      
      <div className="space-y-2">
        {/* Driver Markers */}
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-green-500 rounded-full border-2 border-white shadow-md flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
            </svg>
          </div>
          <span className="text-sm text-gray-700">Available Driver</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-blue-500 rounded-full border-2 border-white shadow-md flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
            </svg>
          </div>
          <span className="text-sm text-gray-700">Delivering</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-gray-500 rounded-full border-2 border-white shadow-md flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
            </svg>
          </div>
          <span className="text-sm text-gray-700">Offline</span>
        </div>

        {/* Delivery Markers */}
        <div className="h-px bg-gray-200 my-2"></div>

        <div className="flex items-center gap-3">
          <div className="w-5 h-5 bg-red-500 rounded border-2 border-white shadow-md flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
          </div>
          <span className="text-sm text-gray-700">High Priority</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-5 h-5 bg-orange-500 rounded border-2 border-white shadow-md flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
          </div>
          <span className="text-sm text-gray-700">Medium Priority</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-5 h-5 bg-gray-600 rounded border-2 border-white shadow-md flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
          </div>
          <span className="text-sm text-gray-700">Low Priority</span>
        </div>

        <div className="h-px bg-gray-200 my-2"></div>

        <div className="flex items-center gap-3">
          <div className="flex items-center">
            <div className="w-8 h-0.5 bg-blue-500 opacity-70" style={{ borderTop: '2px dashed' }}></div>
          </div>
          <span className="text-sm text-gray-700">Active Route</span>
        </div>
      </div>
    </div>
  );
}
