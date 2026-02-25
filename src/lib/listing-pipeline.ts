// Listing analysis pipeline: scrape -> geocode -> analyze -> store

import { type ScrapedListing } from './listing-scraper';
import { type AnalyzedListing, type NeighborhoodStats, readNeighborhoodStats } from './kv-storage';
import { geocodeAddress, fetchHPDViolations, fetchDOBViolations, fetchTaxAbatementByBBL, fetchPropertyAssessment, constructBBL, getBoroughCode } from './nyc-apis';
import { getPropertyByBBL, calculateBuildingHealth } from './property-service';
import { analyzeTaxAbatement, analyzeComps, detectPropertyType, generateNegotiationInsight, type TaxAbatementAnalysis, type NegotiationInsight } from './buyer-intelligence';
import { type StreetEasyListing } from './streeteasy';

// Convert scraped listing to StreetEasyListing format for compatibility with existing functions
function toStreetEasyListing(scraped: ScrapedListing): StreetEasyListing {
  return {
    address: scraped.address,
    askingPrice: scraped.askingPrice,
    daysOnMarket: scraped.daysOnMarket,
    priceReductions: scraped.priceReductions,
    totalPriceReduction: scraped.totalPriceReduction,
    originalPrice: scraped.originalPrice,
    priceHistory: scraped.priceHistory,
    listingStatus: scraped.listingStatus,
    listingUrl: scraped.listingUrl,
    sqft: scraped.sqft,
    pricePerSqft: scraped.pricePerSqft,
    bedrooms: scraped.beds,
    bathrooms: scraped.baths,
    propertyType: scraped.propertyType,
    fetchedAt: scraped.scrapedAt,
  };
}

// Geocode address to get BBL
async function geocodeForBBL(address: string): Promise<{ bbl: string | null; lat: number | null; lng: number | null }> {
  try {
    const result = await geocodeAddress(address);

    if (result.features.length === 0) {
      return { bbl: null, lat: null, lng: null };
    }

    const feature = result.features[0];
    const bbl = feature.properties.addendum?.pad?.bbl || null;
    const [lng, lat] = feature.geometry.coordinates;

    return { bbl, lat, lng };
  } catch (error) {
    console.error(`Geocode failed for ${address}:`, error);
    return { bbl: null, lat: null, lng: null };
  }
}

// Analyze a single scraped listing
export async function analyzeListing(scraped: ScrapedListing): Promise<AnalyzedListing> {
  const now = new Date().toISOString();

  // Start with geocoding to get BBL
  const { bbl, lat, lng } = await geocodeForBBL(scraped.address);

  // Fetch property data and neighborhood stats in parallel
  const [propertyData, neighborhoodStats, taxAbatement] = await Promise.all([
    bbl ? getPropertyByBBL(bbl) : Promise.resolve(null),
    readNeighborhoodStats('bedstuy'),
    bbl ? analyzeTaxAbatement(bbl) : Promise.resolve({ hasAbatement: false } as TaxAbatementAnalysis),
  ]);

  // Convert scraped listing to StreetEasyListing for buyer intelligence functions
  const streetEasyListing = toStreetEasyListing(scraped);

  // Calculate building health
  const buildingHealth = propertyData
    ? calculateBuildingHealth(propertyData.hpdViolations, propertyData.dobViolations)
    : { score: 100, grade: 'A' as const, openViolations: 0, factors: [] };

  // Generate negotiation insight
  const negotiationInsight = generateNegotiationInsight(
    streetEasyListing,
    neighborhoodStats,
    propertyData?.sales || []
  );

  // Comp analysis
  const compAnalysis = analyzeComps(streetEasyListing, neighborhoodStats);

  // Property type detection
  const propertyTypeInfo = detectPropertyType(
    propertyData?.property?.building_class || null,
    [],
    scraped.propertyType
  );

  // Last sale info
  const lastSale = propertyData?.sales?.[0];
  let priceAppreciation: number | null = null;
  if (lastSale && scraped.askingPrice && lastSale.sale_price > 0) {
    priceAppreciation = ((scraped.askingPrice - lastSale.sale_price) / lastSale.sale_price) * 100;
  }

  // Count open violations
  const openViolations = (propertyData?.hpdViolations || []).filter(
    v => v.status?.toLowerCase() !== 'closed' && v.status?.toLowerCase() !== 'certified'
  ).length + (propertyData?.dobViolations || []).filter(
    v => v.status?.toLowerCase() !== 'closed' && v.status?.toLowerCase() !== 'resolved'
  ).length;

  return {
    // Core listing data
    listingId: scraped.listingId,
    address: scraped.address,
    neighborhood: scraped.neighborhood,
    subArea: scraped.subArea,
    bbl,

    // Pricing
    askingPrice: scraped.askingPrice,
    originalPrice: scraped.originalPrice,
    pricePerSqft: scraped.pricePerSqft,
    priceReductions: scraped.priceReductions,
    totalPriceReduction: scraped.totalPriceReduction,
    priceHistory: scraped.priceHistory,

    // Property details
    beds: scraped.beds,
    baths: scraped.baths,
    sqft: scraped.sqft,
    propertyType: propertyTypeInfo.type === 'house' ? scraped.propertyType : propertyTypeInfo.type as AnalyzedListing['propertyType'],
    yearBuilt: propertyData?.property?.year_built || null,

    // Market status
    daysOnMarket: scraped.daysOnMarket,
    listingStatus: scraped.listingStatus,
    openHouseDates: scraped.openHouseDates,

    // Buyer intelligence - negotiation
    negotiationSignal: negotiationInsight.signal,
    negotiationSummary: negotiationInsight.summary,
    negotiationFactors: negotiationInsight.factors,
    suggestedOfferRange: negotiationInsight.suggestedOfferRange,

    // Comp analysis
    compDeltaPercent: compAnalysis.deltaPercent,
    isAboveMarket: compAnalysis.isAboveMarket,
    compSummary: compAnalysis.summary,

    // Tax abatement
    hasTaxAbatement: taxAbatement.hasAbatement,
    taxAbatementType: taxAbatement.abatementType,
    taxAbatementExpiration: taxAbatement.expirationYear,
    taxAbatementWarning: taxAbatement.warningMessage,

    // Building health
    buildingHealthScore: buildingHealth.score,
    buildingHealthGrade: buildingHealth.grade,
    openViolations,

    // Sales history
    lastSalePrice: lastSale?.sale_price || null,
    lastSaleDate: lastSale?.sale_date || null,
    priceAppreciation,

    // URLs and images
    listingUrl: scraped.listingUrl,
    photoUrl: scraped.photoUrl,

    // Metadata
    scrapedAt: scraped.scrapedAt,
    analyzedAt: now,
  };
}

// Analyze multiple listings with rate limiting
export async function analyzeListings(
  scrapedListings: ScrapedListing[],
  concurrency = 3,
  onProgress?: (completed: number, total: number) => void
): Promise<AnalyzedListing[]> {
  const results: AnalyzedListing[] = [];
  const errors: Array<{ listing: ScrapedListing; error: Error }> = [];

  // Process in batches for rate limiting
  for (let i = 0; i < scrapedListings.length; i += concurrency) {
    const batch = scrapedListings.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map(listing => analyzeListing(listing))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        errors.push({ listing: batch[j], error: result.reason });
        console.error(`Failed to analyze listing ${batch[j].address}:`, result.reason);
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + concurrency, scrapedListings.length), scrapedListings.length);
    }

    // Rate limit between batches
    if (i + concurrency < scrapedListings.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  if (errors.length > 0) {
    console.warn(`${errors.length} listings failed analysis`);
  }

  return results;
}
