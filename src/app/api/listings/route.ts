import { NextRequest, NextResponse } from 'next/server';
import {
  readListingIndex,
  readListing,
  readListingScrapeLog,
  type AnalyzedListing,
  type ListingIndexEntry,
} from '@/lib/kv-storage';

export interface ListingsResponse {
  listings: AnalyzedListing[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  lastScraped: string | null;
  filters: {
    minPrice: number | null;
    maxPrice: number | null;
    beds: number[] | null;
    propertyType: string[] | null;
    negotiationSignal: string[] | null;
    maxViolations: number | null;
    hasTaxAbatement: boolean | null;
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const neighborhood = 'bedstuy';

  // Pagination
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20', 10), 50);

  // Filters
  const minPrice = searchParams.get('minPrice') ? parseInt(searchParams.get('minPrice')!, 10) : null;
  const maxPrice = searchParams.get('maxPrice') ? parseInt(searchParams.get('maxPrice')!, 10) : null;
  const beds = searchParams.get('beds') ? searchParams.get('beds')!.split(',').map(Number) : null;
  const propertyType = searchParams.get('propertyType') ? searchParams.get('propertyType')!.split(',') : null;
  const negotiationSignal = searchParams.get('signal') ? searchParams.get('signal')!.split(',') : null;
  const maxViolations = searchParams.get('maxViolations') ? parseInt(searchParams.get('maxViolations')!, 10) : null;
  const hasTaxAbatement = searchParams.get('taxAbatement') === 'true' ? true :
                          searchParams.get('taxAbatement') === 'false' ? false : null;

  // Sort
  const sortBy = searchParams.get('sortBy') || 'price_asc';

  try {
    // Get listing index
    const index = await readListingIndex(neighborhood);
    const scrapeLog = await readListingScrapeLog(neighborhood);

    if (!index || index.length === 0) {
      return NextResponse.json({
        listings: [],
        total: 0,
        page: 1,
        pageSize,
        totalPages: 0,
        lastScraped: scrapeLog?.lastScrape || null,
        filters: { minPrice, maxPrice, beds, propertyType, negotiationSignal, maxViolations, hasTaxAbatement },
      });
    }

    // Apply filters to index
    let filteredIndex = index.filter(entry => {
      // Price filter
      if (minPrice !== null && entry.askingPrice < minPrice) return false;
      if (maxPrice !== null && entry.askingPrice > maxPrice) return false;

      // Beds filter
      if (beds !== null && beds.length > 0) {
        if (entry.beds === null) return false;
        if (!beds.includes(entry.beds)) return false;
      }

      // Property type filter
      if (propertyType !== null && propertyType.length > 0) {
        if (!propertyType.includes(entry.propertyType)) return false;
      }

      // Negotiation signal filter
      if (negotiationSignal !== null && negotiationSignal.length > 0) {
        if (!negotiationSignal.includes(entry.negotiationSignal)) return false;
      }

      // Violations filter
      if (maxViolations !== null && entry.openViolations > maxViolations) return false;

      // Tax abatement filter
      if (hasTaxAbatement !== null && entry.hasTaxAbatement !== hasTaxAbatement) return false;

      // Status filter - only active by default
      if (entry.listingStatus !== 'active') return false;

      return true;
    });

    // Sort
    filteredIndex.sort((a, b) => {
      switch (sortBy) {
        case 'price_asc':
          return a.askingPrice - b.askingPrice;
        case 'price_desc':
          return b.askingPrice - a.askingPrice;
        case 'dom_asc':
          return (a.daysOnMarket || 0) - (b.daysOnMarket || 0);
        case 'dom_desc':
          return (b.daysOnMarket || 0) - (a.daysOnMarket || 0);
        case 'signal':
          const signalOrder = ['strong_buyer', 'slight_buyer', 'neutral', 'slight_seller', 'strong_seller'];
          return signalOrder.indexOf(a.negotiationSignal) - signalOrder.indexOf(b.negotiationSignal);
        default:
          return a.askingPrice - b.askingPrice;
      }
    });

    // Paginate
    const total = filteredIndex.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const paginatedIndex = filteredIndex.slice(startIndex, startIndex + pageSize);

    // Fetch full listing data
    const listings = await Promise.all(
      paginatedIndex.map(entry => readListing(neighborhood, entry.listingId))
    );

    // Filter out nulls
    const validListings = listings.filter((l): l is AnalyzedListing => l !== null);

    return NextResponse.json({
      listings: validListings,
      total,
      page,
      pageSize,
      totalPages,
      lastScraped: scrapeLog?.lastScrape || null,
      filters: { minPrice, maxPrice, beds, propertyType, negotiationSignal, maxViolations, hasTaxAbatement },
    });
  } catch (error) {
    console.error('Failed to fetch listings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listings' },
      { status: 500 }
    );
  }
}
