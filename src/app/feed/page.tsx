'use client';

import { useState, useEffect, useCallback } from 'react';
import { ListingCard } from '@/components/ListingCard';
import type { AnalyzedListing } from '@/lib/kv-storage';

interface ListingsResponse {
  listings: AnalyzedListing[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  lastScraped: string | null;
}

interface Filters {
  minPrice: string;
  maxPrice: string;
  beds: string[];
  propertyType: string[];
  signal: string[];
  maxViolations: string;
  sortBy: string;
}

const DEFAULT_FILTERS: Filters = {
  minPrice: '',
  maxPrice: '',
  beds: [],
  propertyType: [],
  signal: [],
  maxViolations: '',
  sortBy: 'signal',
};

function FilterPanel({
  filters,
  onFilterChange,
  isMobile,
  isOpen,
  onClose,
}: {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  isMobile: boolean;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [localFilters, setLocalFilters] = useState(filters);

  const handleChange = (key: keyof Filters, value: string | string[]) => {
    const updated = { ...localFilters, [key]: value };
    setLocalFilters(updated);
    onFilterChange(updated);
  };

  const toggleArrayFilter = (key: 'beds' | 'propertyType' | 'signal', value: string) => {
    const current = localFilters[key];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    handleChange(key, updated);
  };

  const clearFilters = () => {
    setLocalFilters(DEFAULT_FILTERS);
    onFilterChange(DEFAULT_FILTERS);
  };

  const content = (
    <div className="space-y-6">
      {/* Price Range */}
      <div>
        <label className="text-sm font-medium text-gray-700">Price Range</label>
        <div className="flex gap-2 mt-2">
          <input
            type="number"
            placeholder="Min"
            value={localFilters.minPrice}
            onChange={e => handleChange('minPrice', e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm"
          />
          <span className="text-gray-400 self-center">-</span>
          <input
            type="number"
            placeholder="Max"
            value={localFilters.maxPrice}
            onChange={e => handleChange('maxPrice', e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm"
          />
        </div>
      </div>

      {/* Beds */}
      <div>
        <label className="text-sm font-medium text-gray-700">Bedrooms</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {['0', '1', '2', '3', '4'].map(bed => (
            <button
              key={bed}
              onClick={() => toggleArrayFilter('beds', bed)}
              className={`px-3 py-1 rounded border text-sm ${
                localFilters.beds.includes(bed)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {bed === '0' ? 'Studio' : bed === '4' ? '4+' : bed}
            </button>
          ))}
        </div>
      </div>

      {/* Property Type */}
      <div>
        <label className="text-sm font-medium text-gray-700">Property Type</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {[
            { value: 'coop', label: 'Co-op' },
            { value: 'condo', label: 'Condo' },
            { value: 'townhouse', label: 'Townhouse' },
            { value: 'house', label: 'House' },
            { value: 'multi-family', label: 'Multi-Family' },
          ].map(type => (
            <button
              key={type.value}
              onClick={() => toggleArrayFilter('propertyType', type.value)}
              className={`px-3 py-1 rounded border text-sm ${
                localFilters.propertyType.includes(type.value)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Negotiation Signal */}
      <div>
        <label className="text-sm font-medium text-gray-700">Buyer Advantage</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {[
            { value: 'strong_buyer', label: 'Strong Buyer', color: 'green' },
            { value: 'slight_buyer', label: 'Buyer Edge', color: 'green' },
            { value: 'neutral', label: 'Balanced', color: 'gray' },
            { value: 'slight_seller', label: 'Seller Edge', color: 'orange' },
            { value: 'strong_seller', label: 'Hot', color: 'red' },
          ].map(signal => (
            <button
              key={signal.value}
              onClick={() => toggleArrayFilter('signal', signal.value)}
              className={`px-3 py-1 rounded border text-sm ${
                localFilters.signal.includes(signal.value)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {signal.label}
            </button>
          ))}
        </div>
      </div>

      {/* Max Violations */}
      <div>
        <label className="text-sm font-medium text-gray-700">Max Open Violations</label>
        <select
          value={localFilters.maxViolations}
          onChange={e => handleChange('maxViolations', e.target.value)}
          className="w-full mt-2 px-3 py-2 border rounded text-sm"
        >
          <option value="">Any</option>
          <option value="0">None</option>
          <option value="5">5 or less</option>
          <option value="10">10 or less</option>
          <option value="20">20 or less</option>
        </select>
      </div>

      {/* Sort */}
      <div>
        <label className="text-sm font-medium text-gray-700">Sort By</label>
        <select
          value={localFilters.sortBy}
          onChange={e => handleChange('sortBy', e.target.value)}
          className="w-full mt-2 px-3 py-2 border rounded text-sm"
        >
          <option value="signal">Best Buyer Advantage</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="dom_desc">Days on Market: Most</option>
          <option value="dom_asc">Days on Market: Least</option>
        </select>
      </div>

      {/* Clear */}
      <button
        onClick={clearFilters}
        className="w-full py-2 text-sm text-gray-600 hover:text-gray-800"
      >
        Clear All Filters
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {isOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={onClose}
          />
        )}

        {/* Bottom Sheet */}
        <div
          className={`fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl transform transition-transform duration-300 ${
            isOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
          style={{ maxHeight: '80vh' }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Header */}
          <div className="flex justify-between items-center px-4 pb-3 border-b">
            <h2 className="text-lg font-semibold">Filters</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <span className="text-xl">&times;</span>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 100px)' }}>
            {content}
          </div>

          {/* Apply Button */}
          <div className="p-4 border-t">
            <button
              onClick={onClose}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <aside className="w-64 flex-shrink-0 bg-white rounded-lg shadow-md p-4 h-fit sticky top-24">
      <h2 className="font-semibold mb-4">Filters</h2>
      {content}
    </aside>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-white rounded-lg shadow-md overflow-hidden animate-pulse">
          <div className="h-48 bg-gray-200" />
          <div className="p-4">
            <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
            <div className="h-3 bg-gray-200 rounded w-full mb-2" />
            <div className="h-8 bg-gray-200 rounded mt-4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FeedPage() {
  const [listings, setListings] = useState<AnalyzedListing[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [lastScraped, setLastScraped] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch listings
  const fetchListings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('pageSize', '20');

      if (filters.minPrice) params.set('minPrice', filters.minPrice);
      if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
      if (filters.beds.length > 0) params.set('beds', filters.beds.join(','));
      if (filters.propertyType.length > 0) params.set('propertyType', filters.propertyType.join(','));
      if (filters.signal.length > 0) params.set('signal', filters.signal.join(','));
      if (filters.maxViolations) params.set('maxViolations', filters.maxViolations);
      params.set('sortBy', filters.sortBy);

      const response = await fetch(`/api/listings?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch listings');
      }

      const data: ListingsResponse = await response.json();
      setListings(data.listings);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setLastScraped(data.lastScraped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  // Reset page when filters change
  const handleFilterChange = (newFilters: Filters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const formatLastScraped = (date: string | null) => {
    if (!date) return 'Never';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Bed-Stuy Listings</h1>
              <p className="text-sm text-gray-500">
                {total} listings • Last updated {formatLastScraped(lastScraped)}
              </p>
            </div>

            {/* Mobile filter button */}
            {isMobile && (
              <button
                onClick={() => setIsMobileFilterOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg"
              >
                <span>Filters</span>
                {(filters.beds.length > 0 || filters.propertyType.length > 0 || filters.signal.length > 0) && (
                  <span className="bg-white text-blue-600 text-xs px-1.5 py-0.5 rounded-full">
                    {filters.beds.length + filters.propertyType.length + filters.signal.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Desktop sidebar */}
          {!isMobile && (
            <FilterPanel
              filters={filters}
              onFilterChange={handleFilterChange}
              isMobile={false}
              isOpen={false}
              onClose={() => {}}
            />
          )}

          {/* Listings grid */}
          <div className="flex-1">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {isLoading ? (
              <LoadingSkeleton />
            ) : listings.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-4xl mb-4">🏠</div>
                <h2 className="text-xl font-semibold text-gray-700 mb-2">No listings found</h2>
                <p className="text-gray-500">
                  Try adjusting your filters or check back later.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {listings.map(listing => (
                    <ListingCard key={listing.listingId} listing={listing} />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-4 mt-8">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-4 py-2 rounded border bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-gray-600">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-4 py-2 rounded border bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile filter panel */}
      {isMobile && (
        <FilterPanel
          filters={filters}
          onFilterChange={handleFilterChange}
          isMobile={true}
          isOpen={isMobileFilterOpen}
          onClose={() => setIsMobileFilterOpen(false)}
        />
      )}
    </main>
  );
}
