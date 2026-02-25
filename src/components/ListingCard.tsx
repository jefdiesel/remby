'use client';

import Link from 'next/link';
import type { AnalyzedListing } from '@/lib/kv-storage';

interface ListingCardProps {
  listing: AnalyzedListing;
}

function SignalBadge({ signal }: { signal: AnalyzedListing['negotiationSignal'] }) {
  const config = {
    strong_buyer: { label: 'Strong Buyer', bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
    slight_buyer: { label: 'Buyer Edge', bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
    neutral: { label: 'Balanced', bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
    slight_seller: { label: 'Seller Edge', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    strong_seller: { label: 'Hot', bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  };

  const { label, bg, text, border } = config[signal];

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${bg} ${text} border ${border}`}>
      {label}
    </span>
  );
}

function GradeBadge({ grade }: { grade: AnalyzedListing['buildingHealthGrade'] }) {
  const colors = {
    A: 'bg-green-100 text-green-800',
    B: 'bg-blue-100 text-blue-800',
    C: 'bg-yellow-100 text-yellow-800',
    D: 'bg-orange-100 text-orange-800',
    F: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${colors[grade]}`}>
      {grade}
    </span>
  );
}

export function ListingCard({ listing }: ListingCardProps) {
  const formatPrice = (price: number) => {
    if (price >= 1_000_000) {
      return `$${(price / 1_000_000).toFixed(2)}M`;
    }
    return `$${(price / 1_000).toFixed(0)}K`;
  };

  const formatPricePerSqft = (price: number | null) => {
    if (!price) return null;
    return `$${price}/sqft`;
  };

  const propertyTypeLabel = {
    coop: 'Co-op',
    condo: 'Condo',
    townhouse: 'Townhouse',
    'multi-family': 'Multi-Family',
    house: 'House',
    unknown: '',
  };

  const href = listing.bbl ? `/property/${listing.bbl}` : listing.listingUrl;
  const isExternal = !listing.bbl;

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
      {/* Image */}
      <div className="relative h-48 bg-gray-200">
        {listing.photoUrl ? (
          <img
            src={listing.photoUrl}
            alt={listing.address}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <span className="text-4xl">🏠</span>
          </div>
        )}

        {/* Price badge */}
        <div className="absolute top-3 left-3 bg-white px-2 py-1 rounded shadow">
          <span className="font-bold text-lg">{formatPrice(listing.askingPrice)}</span>
        </div>

        {/* Signal badge */}
        <div className="absolute top-3 right-3">
          <SignalBadge signal={listing.negotiationSignal} />
        </div>

        {/* Price reduction indicator */}
        {listing.priceReductions > 0 && (
          <div className="absolute bottom-3 left-3 bg-red-500 text-white px-2 py-1 rounded text-xs font-medium">
            -{listing.priceReductions}x reduced
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Address */}
        <h3 className="font-semibold text-gray-900 truncate">{listing.address}</h3>

        {/* Details row */}
        <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
          {listing.beds !== null && <span>{listing.beds} bed</span>}
          {listing.baths !== null && (
            <>
              <span className="text-gray-300">|</span>
              <span>{listing.baths} bath</span>
            </>
          )}
          {listing.sqft && (
            <>
              <span className="text-gray-300">|</span>
              <span>{listing.sqft.toLocaleString()} sqft</span>
            </>
          )}
          {listing.propertyType !== 'unknown' && (
            <>
              <span className="text-gray-300">|</span>
              <span>{propertyTypeLabel[listing.propertyType]}</span>
            </>
          )}
        </div>

        {/* Price per sqft */}
        {listing.pricePerSqft && (
          <div className="text-sm text-gray-500 mt-1">
            {formatPricePerSqft(listing.pricePerSqft)}
          </div>
        )}

        {/* Market info row */}
        <div className="flex items-center gap-3 mt-3 text-xs">
          {listing.daysOnMarket !== null && (
            <span className={`${listing.daysOnMarket > 45 ? 'text-orange-600' : 'text-gray-500'}`}>
              {listing.daysOnMarket} days
            </span>
          )}
          <GradeBadge grade={listing.buildingHealthGrade} />
          {listing.openViolations > 0 && (
            <span className="text-red-600">{listing.openViolations} violations</span>
          )}
          {listing.hasTaxAbatement && (
            <span className="text-purple-600">Tax abatement</span>
          )}
        </div>

        {/* Comp analysis summary */}
        {listing.compSummary && (
          <div className={`mt-3 text-xs ${listing.isAboveMarket ? 'text-orange-600' : 'text-green-600'}`}>
            {listing.compDeltaPercent !== null && (
              <span>
                {listing.isAboveMarket ? '+' : ''}{listing.compDeltaPercent}% vs comps
              </span>
            )}
          </div>
        )}

        {/* Offer range */}
        {listing.suggestedOfferRange && (
          <div className="mt-3 pt-3 border-t">
            <div className="text-xs text-gray-500">Suggested offer</div>
            <div className="text-sm font-medium">
              {formatPrice(listing.suggestedOfferRange.low)} – {formatPrice(listing.suggestedOfferRange.high)}
            </div>
          </div>
        )}

        {/* Link */}
        <div className="mt-4">
          {isExternal ? (
            <a
              href={href || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors text-sm"
            >
              View Details
            </a>
          ) : (
            <Link
              href={href || '#'}
              className="block w-full text-center py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors text-sm"
            >
              View Analysis
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
