import { NextRequest, NextResponse } from 'next/server';
import {
  getPropertyByBBL,
  getNeighborhoodComps,
  calculateBuildingHealth,
} from '@/lib/property-service';
import { readNeighborhoodStats } from '@/lib/kv-storage';
import { getNeighborhoodForCoords } from '@/lib/neighborhoods';
import { getStreetEasyListing, formatListingDisplay } from '@/lib/streeteasy';
import {
  analyzeTaxAbatement,
  analyzeComps,
  detectPropertyType,
  generateNegotiationInsight,
} from '@/lib/buyer-intelligence';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bbl: string }> }
) {
  const { bbl } = await params;
  const address = request.nextUrl.searchParams.get('address');

  if (!bbl || bbl.length !== 10) {
    return NextResponse.json(
      { error: 'Invalid BBL format. Must be 10 digits.' },
      { status: 400 }
    );
  }

  try {
    // Fetch base property data
    const propertyData = await getPropertyByBBL(bbl);

    // Fetch buyer intelligence in parallel
    const [taxAbatement, streetEasyListing, neighborhoodStats] = await Promise.all([
      analyzeTaxAbatement(bbl),
      address ? getStreetEasyListing(address) : Promise.resolve(null),
      // Get neighborhood stats based on BBL borough
      getNeighborhoodStatsForBBL(bbl),
    ]);

    // Calculate building health
    const buildingHealth = calculateBuildingHealth(
      propertyData.hpdViolations,
      propertyData.dobViolations
    );

    // Detect property type
    const deedTypes = propertyData.sales.map(s => 'DEED'); // Would need actual deed type from ACRIS
    const propertyType = detectPropertyType(
      propertyData.property?.building_class || null,
      deedTypes,
      streetEasyListing?.propertyType || null
    );

    // Comp analysis (asking vs sold prices)
    const compAnalysis = analyzeComps(streetEasyListing, neighborhoodStats);

    // Enhanced negotiation insight
    const negotiationInsight = generateNegotiationInsight(
      streetEasyListing,
      neighborhoodStats,
      propertyData.sales
    );

    // Format StreetEasy display
    const listingDisplay = streetEasyListing
      ? formatListingDisplay(streetEasyListing)
      : null;

    // Legacy comps for chart compatibility
    let comps90 = null;
    let comps180 = null;
    let comps365 = null;

    if (propertyData.property?.latitude && propertyData.property?.longitude) {
      const lat = propertyData.property.latitude;
      const lng = propertyData.property.longitude;

      [comps90, comps180, comps365] = await Promise.all([
        getNeighborhoodComps(lat, lng, 90),
        getNeighborhoodComps(lat, lng, 180),
        getNeighborhoodComps(lat, lng, 365),
      ]);
    }

    // Days since last sale
    const lastSale = propertyData.sales[0];
    const daysSinceLastSale = lastSale
      ? Math.floor((Date.now() - new Date(lastSale.sale_date).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return NextResponse.json({
      // Base property data
      ...propertyData,

      // Building health
      buildingHealth,

      // Legacy negotiation (for backwards compat)
      negotiationSignal: {
        signal: negotiationInsight.signal === 'strong_seller' ? 'HOT' :
                negotiationInsight.signal === 'strong_buyer' ? 'SOFT' : 'NORMAL',
        reasons: negotiationInsight.factors,
        confidence: negotiationInsight.confidence,
      },

      // NEW: Enhanced buyer intelligence
      buyerIntelligence: {
        // StreetEasy listing data
        listing: streetEasyListing ? {
          ...listingDisplay,
          askingPrice: streetEasyListing.askingPrice,
          daysOnMarket: streetEasyListing.daysOnMarket,
          priceReductions: streetEasyListing.priceReductions,
          totalPriceReduction: streetEasyListing.totalPriceReduction,
          originalPrice: streetEasyListing.originalPrice,
          priceHistory: streetEasyListing.priceHistory,
          listingStatus: streetEasyListing.listingStatus,
          listingUrl: streetEasyListing.listingUrl,
          sqft: streetEasyListing.sqft,
          pricePerSqft: streetEasyListing.pricePerSqft,
          bedrooms: streetEasyListing.bedrooms,
          bathrooms: streetEasyListing.bathrooms,
        } : null,

        // Tax abatement
        taxAbatement: taxAbatement.hasAbatement ? {
          type: taxAbatement.abatementType,
          expirationYear: taxAbatement.expirationYear,
          yearsRemaining: taxAbatement.yearsRemaining,
          currentTaxBenefit: taxAbatement.currentTaxBenefit,
          estimatedPostExpirationTax: taxAbatement.estimatedPostExpirationTax,
          warning: taxAbatement.warningMessage,
        } : null,

        // Comp analysis
        compAnalysis: compAnalysis.summary ? {
          askingPricePerSqft: compAnalysis.askingPricePerSqft,
          medianCompPricePerSqft: compAnalysis.medianCompPricePerSqft,
          deltaPercent: compAnalysis.deltaPercent,
          isAboveMarket: compAnalysis.isAboveMarket,
          summary: compAnalysis.summary,
        } : null,

        // Enhanced negotiation insight
        negotiation: {
          signal: negotiationInsight.signal,
          confidence: negotiationInsight.confidence,
          summary: negotiationInsight.summary,
          factors: negotiationInsight.factors,
          suggestedOfferRange: negotiationInsight.suggestedOfferRange,
        },

        // Property type with warnings
        propertyType: {
          type: propertyType.type,
          warning: propertyType.warning,
        },
      },

      // Legacy comps
      comps: {
        days90: comps90,
        days180: comps180,
        days365: comps365,
      },

      daysSinceLastSale,
    });
  } catch (error) {
    console.error('Property lookup error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch property data' },
      { status: 500 }
    );
  }
}

async function getNeighborhoodStatsForBBL(bbl: string) {
  // BBL first digit is borough, use default neighborhood for now
  const borough = bbl[0];
  if (borough === '3') {
    // Brooklyn - try bedstuy
    return readNeighborhoodStats('bedstuy');
  }
  return null;
}
