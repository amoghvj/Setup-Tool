import { Check, Circle } from 'lucide-react';
import { TimelineStep } from '../lib/mock-data';

interface DeliveryTimelineProps {
  steps: TimelineStep[];
}

export function DeliveryTimeline({ steps }: DeliveryTimelineProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Delivery Progress</h3>
      
      <div className="relative">
        {/* Progress Line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
        <div 
          className="absolute left-4 top-0 w-0.5 bg-blue-600 transition-all duration-500"
          style={{ 
            height: `${(steps.filter(s => s.completed).length / steps.length) * 100}%` 
          }}
        ></div>

        {/* Timeline Steps */}
        <div className="space-y-6">
          {steps.map((step, index) => (
            <div key={index} className="relative flex items-start gap-4">
              {/* Step Icon */}
              <div className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                step.completed
                  ? 'bg-blue-600 border-blue-600'
                  : index === steps.findIndex(s => !s.completed)
                  ? 'bg-white border-blue-600'
                  : 'bg-white border-gray-300'
              }`}>
                {step.completed ? (
                  <Check className="w-4 h-4 text-white" />
                ) : (
                  <Circle className={`w-3 h-3 ${
                    index === steps.findIndex(s => !s.completed)
                      ? 'text-blue-600 fill-blue-600'
                      : 'text-gray-300'
                  }`} />
                )}
              </div>

              {/* Step Content */}
              <div className="flex-1 min-w-0 pt-0.5">
                <p className={`text-sm font-medium ${
                  step.completed ? 'text-gray-900' : 'text-gray-500'
                }`}>
                  {step.status}
                </p>
                {step.timestamp && (
                  <p className="text-xs text-gray-500 mt-0.5">{step.timestamp}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
