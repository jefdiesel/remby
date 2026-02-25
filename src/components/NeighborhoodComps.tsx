'use client';

import { useState } from 'react';
import type { NeighborhoodComps as CompsData } from '@/lib/property-service';

interface NeighborhoodCompsProps {
  comps90: CompsData | null;
  comps180: CompsData | null;
  comps365: CompsData | null;
}

type TimeRange = '90' | '180' | '365';

export function NeighborhoodComps({ comps90, comps180, comps365 }: NeighborhoodCompsProps) {
  const [selectedRange, setSelectedRange] = useState<TimeRange>('180');

  const compsMap: Record<TimeRange, CompsData | null> = {
    '90': comps90,
    '180': comps180,
    '365': comps365,
  };

  const comps = compsMap[selectedRange];

  if (!comps90 && !comps180 && !comps365) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Neighborhood Comps</h3>
        <p className="text-gray-500">
          Unable to calculate neighborhood comparables. Property may be outside synced areas.
        </p>
        <p className="text-xs text-gray-400 mt-2">
          Currently syncing Bedford-Stuyvesant. More neighborhoods coming soon.
        </p>
      </div>
    );
  }

  const trendIcon = comps?.priceChangeTrend === 'up' ? '↑' :
    comps?.priceChangeTrend === 'down' ? '↓' : '→';

  const trendColor = comps?.priceChangeTrend === 'up' ? 'text-green-600' :
    comps?.priceChangeTrend === 'down' ? 'text-red-600' : 'text-gray-600';

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-4">
        <h3 className="text-lg font-semibold">Neighborhood Stats</h3>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['90', '180', '365'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setSelectedRange(range)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                selectedRange === range
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {range}d
            </button>
          ))}
        </div>
      </div>

      {!comps || comps.salesCount === 0 ? (
        <p className="text-gray-500">No sales data found in this time range.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-gray-500">Total Sales</div>
            <div className="text-2xl font-bold">{comps.salesCount}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Median Price</div>
            <div className="text-2xl font-bold">
              {comps.medianPrice
                ? `$${(comps.medianPrice / 1000000).toFixed(2)}M`
                : '-'}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Avg $/sqft</div>
            <div className="text-2xl font-bold">
              {comps.avgPricePerSqft
                ? `$${Math.round(comps.avgPricePerSqft).toLocaleString()}`
                : '-'}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Price Trend</div>
            <div className={`text-2xl font-bold ${trendColor}`}>
              {trendIcon} {comps.priceChangeTrend?.toUpperCase() || 'N/A'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
