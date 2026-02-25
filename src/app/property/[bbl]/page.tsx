'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { PropertyCard } from '@/components/PropertyCard';
import { SalesHistory } from '@/components/SalesHistory';
import { ViolationsPanel } from '@/components/ViolationsPanel';
import { NeighborhoodComps } from '@/components/NeighborhoodComps';
import { NegotiationSignal } from '@/components/NegotiationSignal';
import { PriceHistoryChart } from '@/components/PriceHistoryChart';
import { BuyerIntelligence } from '@/components/BuyerIntelligence';

interface PropertyPageProps {
  params: Promise<{ bbl: string }>;
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

export default function PropertyPage({ params }: PropertyPageProps) {
  const { bbl } = use(params);
  const [propertyData, setPropertyData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProperty() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/property/${bbl}`);

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch property data');
        }

        const data = await response.json();
        setPropertyData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    }

    if (bbl) {
      fetchProperty();
    }
  }, [bbl]);

  const getLastSyncDate = (source: 'sales' | 'hpd' | 'dob' | 'properties'): string | null => {
    if (!propertyData?.syncStatus) return null;
    const sync = propertyData.syncStatus;
    return sync[source as keyof typeof sync] || null;
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/feed"
              className="text-gray-500 hover:text-gray-700"
            >
              <span className="text-xl">&larr;</span>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Property Analysis</h1>
              <p className="text-sm text-gray-500">BBL: {bbl}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-red-500">!</span>
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && <LoadingSkeleton />}

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

            {/* Buyer Intelligence Section */}
            {propertyData.buyerIntelligence && (
              <BuyerIntelligence
                listing={propertyData.buyerIntelligence.listing}
                taxAbatement={propertyData.buyerIntelligence.taxAbatement}
                compAnalysis={propertyData.buyerIntelligence.compAnalysis}
                negotiation={propertyData.buyerIntelligence.negotiation}
                propertyType={propertyData.buyerIntelligence.propertyType}
              />
            )}

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

            {/* Back to feed */}
            <div className="pt-4">
              <Link
                href="/feed"
                className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800"
              >
                <span>&larr;</span>
                Back to listings
              </Link>
            </div>
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
      </footer>
    </main>
  );
}
