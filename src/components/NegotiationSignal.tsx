'use client';

import type { NegotiationAnalysis } from '@/lib/property-service';

interface NegotiationSignalProps {
  analysis: NegotiationAnalysis | null;
}

export function NegotiationSignal({ analysis }: NegotiationSignalProps) {
  if (!analysis) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Negotiation Signal</h3>
        <p className="text-gray-500">Unable to calculate. Insufficient market data.</p>
      </div>
    );
  }

  const signalConfig = {
    HOT: {
      bg: 'bg-red-50 border-red-200',
      badge: 'bg-red-500 text-white',
      icon: '🔥',
      title: 'HOT MARKET',
      description: 'Properties selling at or above ask, fast. Limited room to negotiate.',
    },
    NORMAL: {
      bg: 'bg-blue-50 border-blue-200',
      badge: 'bg-blue-500 text-white',
      icon: '⚖️',
      title: 'NORMAL MARKET',
      description: 'Properties selling near asking price. Standard negotiation expected.',
    },
    SOFT: {
      bg: 'bg-green-50 border-green-200',
      badge: 'bg-green-500 text-white',
      icon: '💰',
      title: 'SOFT MARKET',
      description: 'Properties sitting longer. Price cuts likely. Good time to negotiate.',
    },
  };

  const config = signalConfig[analysis.signal];

  return (
    <div className={`rounded-lg border-2 p-6 ${config.bg}`}>
      <div className="flex items-center gap-4 mb-4">
        <span className="text-4xl">{config.icon}</span>
        <div>
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold ${config.badge}`}>
            {config.title}
          </span>
          <span className="ml-2 text-sm text-gray-500">
            Confidence: {analysis.confidence}
          </span>
        </div>
      </div>

      <p className="text-gray-700 mb-4">{config.description}</p>

      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Analysis Factors:</h4>
        <ul className="space-y-1">
          {analysis.reasons.map((reason, idx) => (
            <li key={idx} className="text-sm text-gray-600 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
              {reason}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
