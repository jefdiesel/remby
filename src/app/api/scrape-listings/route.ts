import { NextRequest, NextResponse } from 'next/server';
import { scrapeAllBedStuyListings, scrapeListingDetails } from '@/lib/listing-scraper';
import { analyzeListing, analyzeListings } from '@/lib/listing-pipeline';
import {
  batchWriteListings,
  writeListingIndex,
  writeListingScrapeLog,
  readListingIndex,
  batchDeleteListings,
  type AnalyzedListing,
  type ListingIndexEntry,
  type ListingScrapeLog,
} from '@/lib/kv-storage';

// Vercel cron job - runs nightly at 3am EST
export const maxDuration = 300; // 5 minutes max
export const dynamic = 'force-dynamic';

// Authorization check for cron job
function isAuthorized(request: NextRequest): boolean {
  // Vercel cron sends authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }

  // Also allow manual trigger with API key
  const apiKey = request.nextUrl.searchParams.get('key');
  if (apiKey === process.env.ADMIN_API_KEY) {
    return true;
  }

  // Allow in development
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const errors: string[] = [];
  const neighborhood = 'bedstuy';

  console.log('Starting listing scrape for Bed-Stuy...');

  try {
    // Step 1: Scrape all listings from StreetEasy
    console.log('Step 1: Scraping StreetEasy listings...');
    const scrapedListings = await scrapeAllBedStuyListings();
    console.log(`Scraped ${scrapedListings.length} listings`);

    if (scrapedListings.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No listings scraped - StreetEasy may have blocked the request',
      });
    }

    // Step 2: Scrape details for listings that need it (first 20 for rate limiting)
    console.log('Step 2: Scraping listing details...');
    const listingsToDetail = scrapedListings.slice(0, 20);
    const detailedListings = await Promise.allSettled(
      listingsToDetail.map(async (listing, i) => {
        // Rate limit
        await new Promise(r => setTimeout(r, i * 500));
        return scrapeListingDetails(listing);
      })
    );

    // Merge detailed info back
    for (let i = 0; i < detailedListings.length; i++) {
      const result = detailedListings[i];
      if (result.status === 'fulfilled') {
        scrapedListings[i] = result.value;
      }
    }

    // Step 3: Analyze all listings
    console.log('Step 3: Analyzing listings...');
    const analyzedListings = await analyzeListings(scrapedListings, 3, (completed, total) => {
      console.log(`Analyzed ${completed}/${total} listings`);
    });
    console.log(`Analyzed ${analyzedListings.length} listings`);

    // Step 4: Compare with existing index to find new/removed
    const existingIndex = await readListingIndex(neighborhood);
    const existingIds = new Set(existingIndex?.map(e => e.listingId) || []);
    const newIds = new Set(analyzedListings.map(l => l.listingId));

    const newListings = analyzedListings.filter(l => !existingIds.has(l.listingId));
    const removedIds = [...existingIds].filter(id => !newIds.has(id));
    const updatedListings = analyzedListings.filter(l => existingIds.has(l.listingId));

    console.log(`New: ${newListings.length}, Updated: ${updatedListings.length}, Removed: ${removedIds.length}`);

    // Step 5: Store analyzed listings
    console.log('Step 5: Storing listings...');
    await batchWriteListings(neighborhood, analyzedListings);

    // Step 6: Update index
    const indexEntries: ListingIndexEntry[] = analyzedListings.map(l => ({
      listingId: l.listingId,
      askingPrice: l.askingPrice,
      beds: l.beds,
      propertyType: l.propertyType,
      negotiationSignal: l.negotiationSignal,
      daysOnMarket: l.daysOnMarket,
      hasTaxAbatement: l.hasTaxAbatement,
      openViolations: l.openViolations,
      listingStatus: l.listingStatus,
      updatedAt: l.analyzedAt,
    }));

    await writeListingIndex(neighborhood, indexEntries);

    // Step 7: Clean up removed listings
    if (removedIds.length > 0) {
      await batchDeleteListings(neighborhood, removedIds);
    }

    // Step 8: Log scrape results
    const scrapeLog: ListingScrapeLog = {
      lastScrape: new Date().toISOString(),
      totalListings: analyzedListings.length,
      newListings: newListings.length,
      updatedListings: updatedListings.length,
      removedListings: removedIds.length,
      errors,
    };
    await writeListingScrapeLog(neighborhood, scrapeLog);

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`Scrape completed in ${duration}s`);

    return NextResponse.json({
      success: true,
      duration: `${duration}s`,
      totalListings: analyzedListings.length,
      newListings: newListings.length,
      updatedListings: updatedListings.length,
      removedListings: removedIds.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Scrape failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log failed scrape
    const scrapeLog: ListingScrapeLog = {
      lastScrape: new Date().toISOString(),
      totalListings: 0,
      newListings: 0,
      updatedListings: 0,
      removedListings: 0,
      errors: [errorMessage],
    };
    await writeListingScrapeLog(neighborhood, scrapeLog);

    return NextResponse.json({
      success: false,
      error: errorMessage,
      duration: `${Math.round((Date.now() - startTime) / 1000)}s`,
    }, { status: 500 });
  }
}
