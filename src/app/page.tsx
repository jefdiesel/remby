'use client';

import { useState } from 'react';
import { AddressSearch } from '@/components/AddressSearch';
import { PropertyCard } from '@/components/PropertyCard';
import { SalesHistory } from '@/components/SalesHistory';
import { ViolationsPanel } from '@/components/ViolationsPanel';
import { NeighborhoodComps } from '@/components/NeighborhoodComps';
import { NegotiationSignal } from '@/components/NegotiationSignal';
import { PriceHistoryChart } from '@/components/PriceHistoryChart';
import type { GeoSearchFeature } from '@/lib/nyc-apis';
import type { Property, Sale, HPDViolation, DOBViolation, DOBPermit, SyncLog } from '@/types/database';
import type { NeighborhoodComps as CompsData, NegotiationAnalysis, BuildingHealthScore } from '@/lib/property-service';

interface PropertyResponse {
  property: Property | null;
  sales: Sale[];
  hpdViolations: HPDViolation[];
  dobViolations: DOBViolation[];
  dobPermits: DOBPermit[];
  syncStatus: SyncLog | null;
  fromCache: boolean;
  comps: {
    days90: CompsData | null;
    days180: CompsData | null;
    days365: CompsData | null;
  };
  negotiationSignal: NegotiationAnalysis | null;
  buildingHealth: BuildingHealthScore;
  daysSinceLastSale: number | null;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="h-8 bg-gray-200 rounded w-3/4 mb-4" />
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [propertyData, setPropertyData] = useState<PropertyResponse | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

  async function handleAddressSelect(feature: GeoSearchFeature) {
    const bbl = feature.properties.addendum?.pad?.bbl;

    if (!bbl) {
      setError('Unable to find BBL for this address. Please try a different address.');
      return;
    }

    setSelectedAddress(feature.properties.label);
    setIsLoading(true);
    setError(null);
    setPropertyData(null);

    try {
      const response = await fetch(`/api/property/${bbl}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch property data');
      }

      const data: PropertyResponse = await response.json();
      setPropertyData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  // Get the latest sync date from syncStatus
  const getLastSyncDate = (source: 'sales' | 'hpd' | 'dob' | 'properties'): string | null => {
    if (!propertyData?.syncStatus) return null;
    const sync = propertyData.syncStatus;
    return sync[source as keyof typeof sync] || null;
  };

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-shrink-0">
              <h1 className="text-2xl font-bold text-gray-900">NYC Property Intel</h1>
              <p className="text-sm text-gray-500">Free NYC real estate intelligence</p>
            </div>
            <div className="flex-1">
              <AddressSearch onSelect={handleAddressSelect} isLoading={isLoading} />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Initial State */}
        {!isLoading && !propertyData && !error && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🏠</div>
            <h2 className="text-2xl font-semibold text-gray-700 mb-2">
              Search any NYC property
            </h2>
            <p className="text-gray-500 max-w-md mx-auto">
              Enter an address above to see sales history, violations, permits,
              neighborhood comps, and market signals.
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Currently focused on Bedford-Stuyvesant. Expanding soon.
            </p>
            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto text-sm">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-2xl mb-2">📊</div>
                <div className="font-medium">Sales History</div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-2xl mb-2">⚠️</div>
                <div className="font-medium">Violations</div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-2xl mb-2">📍</div>
                <div className="font-medium">Neighborhood Comps</div>
              </div>
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-2xl mb-2">💰</div>
                <div className="font-medium">Market Signal</div>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-red-500">⚠️</span>
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div>
            {selectedAddress && (
              <div className="mb-6 text-gray-600">
                Loading data for <span className="font-medium">{selectedAddress}</span>...
              </div>
            )}
            <LoadingSkeleton />
          </div>
        )}

        {/* Results */}
        {propertyData && !isLoading && (
          <div className="space-y-6">
            {/* Top Row: Property Info + Negotiation Signal */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PropertyCard
                property={propertyData.property}
                daysSinceLastSale={propertyData.daysSinceLastSale}
                lastUpdated={getLastSyncDate('properties')}
                fromCache={propertyData.fromCache}
              />
              <NegotiationSignal analysis={propertyData.negotiationSignal} />
            </div>

            {/* Neighborhood Comps */}
            <NeighborhoodComps
              comps90={propertyData.comps.days90}
              comps180={propertyData.comps.days180}
              comps365={propertyData.comps.days365}
            />

            {/* Sales Row: History + Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SalesHistory
                sales={propertyData.sales}
                lastUpdated={getLastSyncDate('sales')}
              />
              <PriceHistoryChart sales={propertyData.sales} />
            </div>

            {/* Violations */}
            <ViolationsPanel
              hpdViolations={propertyData.hpdViolations}
              dobViolations={propertyData.dobViolations}
              dobPermits={propertyData.dobPermits}
              buildingHealth={propertyData.buildingHealth}
              lastUpdated={{
                hpd: getLastSyncDate('hpd'),
                dob: getLastSyncDate('dob'),
                permits: getLastSyncDate('dob'),
              }}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t mt-16 py-8 text-center text-sm text-gray-500">
        <p>
          Data sourced from NYC Open Data &bull;{' '}
          <a
            href="https://data.cityofnewyork.us"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            View Data Sources
          </a>
        </p>
        <p className="mt-2">
          ACRIS &bull; HPD &bull; DOB &bull; NYC Finance
        </p>
      </footer>
    </main>
  );
}
