// StreetEasy scraper for listing data
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL || '',
  token: process.env.KV_REST_API_TOKEN || '',
});

const CACHE_TTL = 60 * 60 * 24; // 24 hours

export interface PriceChange {
  date: string;
  price: number;
  change: number; // negative = price drop
}

export interface StreetEasyListing {
  address: string;
  askingPrice: number | null;
  daysOnMarket: number | null;
  originalPrice: number | null;
  priceHistory: PriceChange[];
  priceReductions: number;
  totalPriceReduction: number;
  listingStatus: 'active' | 'in_contract' | 'sold' | 'unknown';
  listingUrl: string | null;
  sqft: number | null;
  pricePerSqft: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: string | null;
  fetchedAt: string;
}

function getCacheKey(address: string): string {
  return `streeteasy:${address.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
}

export async function getStreetEasyListing(address: string): Promise<StreetEasyListing | null> {
  const cacheKey = getCacheKey(address);

  // Check cache first
  try {
    const cached = await redis.get<StreetEasyListing>(cacheKey);
    if (cached) {
      return cached;
    }
  } catch (e) {
    console.error('Cache read error:', e);
  }

  // Scrape StreetEasy
  const listing = await scrapeStreetEasy(address);

  // Cache result
  if (listing) {
    try {
      await redis.set(cacheKey, listing, { ex: CACHE_TTL });
    } catch (e) {
      console.error('Cache write error:', e);
    }
  }

  return listing;
}

async function scrapeStreetEasy(address: string): Promise<StreetEasyListing | null> {
  try {
    const encodedAddress = encodeURIComponent(address);
    const searchUrl = `https://streeteasy.com/search?q=${encodedAddress}`;

    // Fetch search results page
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      console.error(`StreetEasy search failed: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Parse the search results to find listing URL
    const listingUrl = extractFirstListingUrl(html);

    if (!listingUrl) {
      // No listing found, return empty result
      return {
        address,
        askingPrice: null,
        daysOnMarket: null,
        originalPrice: null,
        priceHistory: [],
        priceReductions: 0,
        totalPriceReduction: 0,
        listingStatus: 'unknown',
        listingUrl: null,
        sqft: null,
        pricePerSqft: null,
        bedrooms: null,
        bathrooms: null,
        propertyType: null,
        fetchedAt: new Date().toISOString(),
      };
    }

    // Fetch the listing detail page
    const listingResponse = await fetch(listingUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!listingResponse.ok) {
      console.error(`StreetEasy listing fetch failed: ${listingResponse.status}`);
      return null;
    }

    const listingHtml = await listingResponse.text();
    return parseListingPage(address, listingHtml, listingUrl);
  } catch (error) {
    console.error('StreetEasy scrape error:', error);
    return null;
  }
}

function extractFirstListingUrl(html: string): string | null {
  // Look for listing links in search results
  // Pattern: /building/... or /sale/... or /rental/...
  const patterns = [
    /href="(\/sale\/[^"]+)"/,
    /href="(\/building\/[^"]+)"/,
    /href="(https:\/\/streeteasy\.com\/sale\/[^"]+)"/,
    /href="(https:\/\/streeteasy\.com\/building\/[^"]+)"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const url = match[1];
      if (url.startsWith('/')) {
        return `https://streeteasy.com${url}`;
      }
      return url;
    }
  }

  return null;
}

function parseListingPage(address: string, html: string, listingUrl: string): StreetEasyListing {
  const listing: StreetEasyListing = {
    address,
    askingPrice: null,
    daysOnMarket: null,
    originalPrice: null,
    priceHistory: [],
    priceReductions: 0,
    totalPriceReduction: 0,
    listingStatus: 'unknown',
    listingUrl,
    sqft: null,
    pricePerSqft: null,
    bedrooms: null,
    bathrooms: null,
    propertyType: null,
    fetchedAt: new Date().toISOString(),
  };

  // Extract asking price
  const priceMatch = html.match(/\$([0-9,]+)(?:<\/span>|\s*<)/);
  if (priceMatch) {
    listing.askingPrice = parseInt(priceMatch[1].replace(/,/g, ''), 10);
  }

  // Also try JSON-LD data
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (jsonLdMatch) {
    try {
      const jsonLd = JSON.parse(jsonLdMatch[1]);
      if (jsonLd.offers?.price) {
        listing.askingPrice = parseInt(jsonLd.offers.price, 10);
      }
      if (jsonLd.floorSize?.value) {
        listing.sqft = parseInt(jsonLd.floorSize.value, 10);
      }
    } catch (e) {
      // JSON parse failed, continue with regex parsing
    }
  }

  // Extract days on market
  const domMatch = html.match(/(\d+)\s*days?\s*(?:on\s*)?(?:market|listed)/i);
  if (domMatch) {
    listing.daysOnMarket = parseInt(domMatch[1], 10);
  }

  // Extract sqft
  const sqftMatch = html.match(/([0-9,]+)\s*(?:sq\.?\s*ft|sqft|SF)/i);
  if (sqftMatch && !listing.sqft) {
    listing.sqft = parseInt(sqftMatch[1].replace(/,/g, ''), 10);
  }

  // Calculate price per sqft
  if (listing.askingPrice && listing.sqft) {
    listing.pricePerSqft = Math.round(listing.askingPrice / listing.sqft);
  }

  // Extract bedrooms/bathrooms
  const bedMatch = html.match(/(\d+)\s*(?:bed(?:room)?s?|BR)/i);
  if (bedMatch) {
    listing.bedrooms = parseInt(bedMatch[1], 10);
  }
  const bathMatch = html.match(/(\d+(?:\.\d+)?)\s*(?:bath(?:room)?s?|BA)/i);
  if (bathMatch) {
    listing.bathrooms = parseFloat(bathMatch[1]);
  }

  // Extract listing status
  if (/in\s*contract/i.test(html)) {
    listing.listingStatus = 'in_contract';
  } else if (/sold|closed/i.test(html)) {
    listing.listingStatus = 'sold';
  } else if (/for\s*sale|active/i.test(html)) {
    listing.listingStatus = 'active';
  }

  // Extract property type
  if (/co-?op/i.test(html)) {
    listing.propertyType = 'coop';
  } else if (/condo(?:minium)?/i.test(html)) {
    listing.propertyType = 'condo';
  } else if (/townhouse/i.test(html)) {
    listing.propertyType = 'townhouse';
  } else if (/(?:single|1-4)\s*family/i.test(html)) {
    listing.propertyType = 'house';
  }

  // Extract price history from page
  const priceHistory = extractPriceHistory(html);
  if (priceHistory.length > 0) {
    listing.priceHistory = priceHistory;
    listing.originalPrice = priceHistory[0].price;

    // Calculate reductions
    let reductions = 0;
    let totalDrop = 0;
    for (const change of priceHistory) {
      if (change.change < 0) {
        reductions++;
        totalDrop += Math.abs(change.change);
      }
    }
    listing.priceReductions = reductions;
    listing.totalPriceReduction = totalDrop;
  }

  return listing;
}

function extractPriceHistory(html: string): PriceChange[] {
  const history: PriceChange[] = [];

  // Look for price history section
  // Common patterns: "Price History", "Price Changes", timeline with dates and prices
  const priceHistoryMatch = html.match(/price\s*history[\s\S]*?(<(?:ul|table|div)[^>]*>[\s\S]*?<\/(?:ul|table|div)>)/i);

  if (priceHistoryMatch) {
    const section = priceHistoryMatch[1];

    // Extract date + price pairs
    const entryPattern = /(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+\s+\d{1,2},?\s*\d{4})[^$]*\$([0-9,]+)/g;
    let match;
    let lastPrice = 0;

    while ((match = entryPattern.exec(section)) !== null) {
      const date = match[1];
      const price = parseInt(match[2].replace(/,/g, ''), 10);
      const change = lastPrice > 0 ? price - lastPrice : 0;

      history.push({ date, price, change });
      lastPrice = price;
    }
  }

  // Reverse so oldest is first
  return history.reverse();
}

// Format listing data for display
export function formatListingDisplay(listing: StreetEasyListing): {
  headline: string | null;
  priceDropSummary: string | null;
  statusLine: string | null;
} {
  if (!listing.askingPrice) {
    return { headline: null, priceDropSummary: null, statusLine: null };
  }

  const headline = listing.daysOnMarket
    ? `Listed at $${listing.askingPrice.toLocaleString()}, ${listing.daysOnMarket} days ago`
    : `Listed at $${listing.askingPrice.toLocaleString()}`;

  let priceDropSummary: string | null = null;
  if (listing.priceReductions > 0 && listing.originalPrice) {
    priceDropSummary = `Price reduced ${listing.priceReductions} time${listing.priceReductions > 1 ? 's' : ''} — original ask $${listing.originalPrice.toLocaleString()}, current ask $${listing.askingPrice.toLocaleString()}`;
  }

  let statusLine: string | null = null;
  if (listing.listingStatus === 'in_contract') {
    statusLine = 'Currently in contract';
  } else if (listing.listingStatus === 'sold') {
    statusLine = 'Recently sold';
  }

  return { headline, priceDropSummary, statusLine };
}
