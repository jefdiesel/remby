'use client';

import type { Property } from '@/types/database';

interface PropertyCardProps {
  property: Property | null;
  daysSinceLastSale: number | null;
  lastUpdated: string | null;
  fromCache?: boolean;
}

export function PropertyCard({ property, daysSinceLastSale, lastUpdated, fromCache }: PropertyCardProps) {
  if (!property) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800">
          Property details not available. Data fetched live from NYC Open Data.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{property.address}</h2>
          <p className="text-gray-600">
            {property.borough} &bull; BBL: {property.bbl}
          </p>
        </div>
        {daysSinceLastSale !== null && (
          <div className="text-right">
            <div className="text-sm text-gray-500">Days since last sale</div>
            <div className="text-2xl font-bold text-blue-600">{daysSinceLastSale.toLocaleString()}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {property.year_built && (
          <div>
            <div className="text-sm text-gray-500">Year Built</div>
            <div className="font-semibold">{property.year_built}</div>
          </div>
        )}
        {property.sqft && (
          <div>
            <div className="text-sm text-gray-500">Size</div>
            <div className="font-semibold">{property.sqft.toLocaleString()} sqft</div>
          </div>
        )}
        {property.building_class && (
          <div>
            <div className="text-sm text-gray-500">Building Class</div>
            <div className="font-semibold">{property.building_class}</div>
          </div>
        )}
        {property.tax_class && (
          <div>
            <div className="text-sm text-gray-500">Tax Class</div>
            <div className="font-semibold">{property.tax_class}</div>
          </div>
        )}
        {property.assessed_value && (
          <div>
            <div className="text-sm text-gray-500">Assessed Value</div>
            <div className="font-semibold">${property.assessed_value.toLocaleString()}</div>
          </div>
        )}
        {property.exempt_value && property.exempt_value > 0 && (
          <div>
            <div className="text-sm text-gray-500">Tax Exemption</div>
            <div className="font-semibold text-green-600">${property.exempt_value.toLocaleString()}</div>
          </div>
        )}
        {property.zip_code && (
          <div>
            <div className="text-sm text-gray-500">ZIP Code</div>
            <div className="font-semibold">{property.zip_code}</div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
        {lastUpdated && (
          <span>Data as of {new Date(lastUpdated).toLocaleDateString()}</span>
        )}
        {fromCache !== undefined && (
          <span className={fromCache ? 'text-green-500' : 'text-blue-500'}>
            {fromCache ? 'From cache' : 'Live data'}
          </span>
        )}
      </div>
    </div>
  );
}
