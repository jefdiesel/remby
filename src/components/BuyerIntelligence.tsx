'use client';

interface ListingData {
  headline: string | null;
  priceDropSummary: string | null;
  statusLine: string | null;
  askingPrice: number | null;
  daysOnMarket: number | null;
  priceReductions: number;
  totalPriceReduction: number;
  originalPrice: number | null;
  priceHistory: Array<{ date: string; price: number; change: number }>;
  listingStatus: string;
  listingUrl: string | null;
  sqft: number | null;
  pricePerSqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
}

interface TaxAbatementData {
  type: string;
  expirationYear: number | null;
  yearsRemaining: number | null;
  currentTaxBenefit: number | null;
  estimatedPostExpirationTax: number | null;
  warning: string | null;
}

interface CompAnalysisData {
  askingPricePerSqft: number | null;
  medianCompPricePerSqft: number | null;
  deltaPercent: number | null;
  isAboveMarket: boolean;
  summary: string;
}

interface NegotiationData {
  signal: 'strong_buyer' | 'slight_buyer' | 'neutral' | 'slight_seller' | 'strong_seller';
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  factors: string[];
  suggestedOfferRange: { low: number; high: number } | null;
}

interface PropertyTypeData {
  type: 'coop' | 'condo' | 'house' | 'multi-family' | 'unknown';
  warning: string | null;
}

interface BuyerIntelligenceProps {
  listing: ListingData | null;
  taxAbatement: TaxAbatementData | null;
  compAnalysis: CompAnalysisData | null;
  negotiation: NegotiationData;
  propertyType: PropertyTypeData;
}

function SignalBadge({ signal }: { signal: NegotiationData['signal'] }) {
  const config = {
    strong_buyer: { label: 'Strong Buyer Market', color: 'bg-green-600' },
    slight_buyer: { label: 'Buyer Advantage', color: 'bg-green-500' },
    neutral: { label: 'Balanced Market', color: 'bg-gray-500' },
    slight_seller: { label: 'Seller Advantage', color: 'bg-orange-500' },
    strong_seller: { label: 'Hot Market', color: 'bg-red-600' },
  };

  const { label, color } = config[signal];

  return (
    <span className={`px-3 py-1 rounded-full text-white text-sm font-medium ${color}`}>
      {label}
    </span>
  );
}

function WarningBox({ children, type = 'warning' }: { children: React.ReactNode; type?: 'warning' | 'danger' | 'info' }) {
  const colors = {
    warning: 'bg-yellow-50 border-yellow-400 text-yellow-800',
    danger: 'bg-red-50 border-red-400 text-red-800',
    info: 'bg-blue-50 border-blue-400 text-blue-800',
  };

  return (
    <div className={`p-4 border-l-4 rounded-r ${colors[type]}`}>
      {children}
    </div>
  );
}

export function BuyerIntelligence({
  listing,
  taxAbatement,
  compAnalysis,
  negotiation,
  propertyType,
}: BuyerIntelligenceProps) {
  return (
    <div className="space-y-6">
      {/* Property Type Warning */}
      {propertyType.warning && (
        <WarningBox type="info">
          <p className="text-sm">{propertyType.warning}</p>
        </WarningBox>
      )}

      {/* Tax Abatement Warning */}
      {taxAbatement?.warning && (
        <WarningBox type="danger">
          <p className="font-semibold">Tax Abatement Alert</p>
          <p className="text-sm mt-1">{taxAbatement.warning}</p>
        </WarningBox>
      )}

      {/* Listing Status */}
      {listing && listing.askingPrice && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-4">Current Listing</h3>

          <div className="space-y-3">
            {listing.headline && (
              <p className="text-xl font-medium">{listing.headline}</p>
            )}

            {listing.statusLine && (
              <p className="text-orange-600 font-medium">{listing.statusLine}</p>
            )}

            {listing.priceDropSummary && (
              <p className="text-red-600">{listing.priceDropSummary}</p>
            )}

            {/* Listing details */}
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 mt-4">
              {listing.bedrooms !== null && (
                <span>{listing.bedrooms} bed</span>
              )}
              {listing.bathrooms !== null && (
                <span>{listing.bathrooms} bath</span>
              )}
              {listing.sqft && (
                <span>{listing.sqft.toLocaleString()} sqft</span>
              )}
              {listing.pricePerSqft && (
                <span>${listing.pricePerSqft}/sqft</span>
              )}
            </div>

            {/* Price history */}
            {listing.priceHistory.length > 1 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm font-medium text-gray-700 mb-2">Price History</p>
                <div className="space-y-1">
                  {listing.priceHistory.map((entry, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-gray-500">{entry.date}</span>
                      <span className={entry.change < 0 ? 'text-red-600' : entry.change > 0 ? 'text-green-600' : ''}>
                        ${entry.price.toLocaleString()}
                        {entry.change !== 0 && (
                          <span className="ml-2">
                            ({entry.change > 0 ? '+' : ''}{entry.change.toLocaleString()})
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {listing.listingUrl && (
              <a
                href={listing.listingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 text-blue-600 hover:underline text-sm"
              >
                View on StreetEasy
              </a>
            )}
          </div>
        </div>
      )}

      {/* Comp Analysis */}
      {compAnalysis && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-3">Price vs Market</h3>
          <p className={`text-lg ${compAnalysis.isAboveMarket ? 'text-orange-600' : 'text-green-600'}`}>
            {compAnalysis.summary}
          </p>
        </div>
      )}

      {/* Negotiation Insight */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Negotiation Analysis</h3>
          <SignalBadge signal={negotiation.signal} />
        </div>

        <p className="text-gray-700 leading-relaxed">{negotiation.summary}</p>

        {negotiation.suggestedOfferRange && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-600">Suggested Opening Offer Range</p>
            <p className="text-xl font-semibold text-gray-900">
              ${negotiation.suggestedOfferRange.low.toLocaleString()} – ${negotiation.suggestedOfferRange.high.toLocaleString()}
            </p>
          </div>
        )}

        {negotiation.factors.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm font-medium text-gray-600 mb-2">Key Factors</p>
            <ul className="space-y-1">
              {negotiation.factors.map((factor, idx) => (
                <li key={idx} className="text-sm text-gray-600 flex items-start">
                  <span className="mr-2">•</span>
                  <span>{factor}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 text-xs text-gray-400">
          Confidence: {negotiation.confidence}
        </p>
      </div>

      {/* Tax Details */}
      {taxAbatement && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold mb-3">Tax Abatement Details</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Type</span>
              <p className="font-medium">{taxAbatement.type}</p>
            </div>
            {taxAbatement.expirationYear && (
              <div>
                <span className="text-gray-500">Expires</span>
                <p className="font-medium">{taxAbatement.expirationYear}</p>
              </div>
            )}
            {taxAbatement.yearsRemaining !== null && (
              <div>
                <span className="text-gray-500">Years Remaining</span>
                <p className="font-medium">{taxAbatement.yearsRemaining}</p>
              </div>
            )}
            {taxAbatement.estimatedPostExpirationTax && (
              <div>
                <span className="text-gray-500">Est. Post-Expiration Tax</span>
                <p className="font-medium text-red-600">
                  ${taxAbatement.estimatedPostExpirationTax.toLocaleString()}/yr
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
