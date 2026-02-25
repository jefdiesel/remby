// StreetEasy listing scraper using Puppeteer
import puppeteer, { Browser, Page } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export interface ScrapedListing {
  listingId: string;
  address: string;
  neighborhood: string;
  subArea: string | null;
  askingPrice: number;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  pricePerSqft: number | null;
  daysOnMarket: number | null;
  priceHistory: Array<{ date: string; price: number; change: number }>;
  priceReductions: number;
  totalPriceReduction: number;
  originalPrice: number | null;
  listingUrl: string;
  propertyType: 'coop' | 'condo' | 'townhouse' | 'multi-family' | 'house' | 'unknown';
  photoUrl: string | null;
  openHouseDates: string[];
  listingStatus: 'active' | 'in_contract' | 'unknown';
  scrapedAt: string;
}

// Sub-areas within Bed-Stuy
const SUB_AREAS: Record<string, string[]> = {
  'Stuyvesant Heights': ['stuyvesant', 'halsey', 'macon', 'decatur'],
  'Ocean Hill': ['ocean hill', 'atlantic', 'liberty'],
  'Fulton Corridor': ['fulton', 'gates', 'greene'],
  'Crown Heights Border': ['crown', 'st marks', 'prospect'],
};

function detectSubArea(address: string): string | null {
  const lowerAddress = address.toLowerCase();
  for (const [area, keywords] of Object.entries(SUB_AREAS)) {
    if (keywords.some(kw => lowerAddress.includes(kw))) {
      return area;
    }
  }
  return null;
}

async function getBrowser(): Promise<Browser> {
  const isVercel = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_VERSION;

  if (isVercel) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chr = chromium as any;
    return puppeteer.launch({
      args: chr.args,
      defaultViewport: chr.defaultViewport,
      executablePath: await chr.executablePath(),
      headless: chr.headless,
    });
  }

  // Local development - use system Chrome
  return puppeteer.launch({
    headless: true,
    executablePath: process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

export async function scrapeListingPage(url: string): Promise<ScrapedListing[]> {
  const browser = await getBrowser();
  const listings: ScrapedListing[] = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to page
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for listings to load
    await page.waitForSelector('[data-testid="listing-card"], .listingCard, .searchCardInfo', { timeout: 10000 }).catch(() => null);

    // Extract listings from current page
    const pageListings = await page.evaluate(() => {
      const results: Array<{
        listingId: string;
        address: string;
        price: string;
        beds: string;
        baths: string;
        sqft: string;
        dom: string;
        url: string;
        propertyType: string;
        photoUrl: string;
        status: string;
      }> = [];

      // Try multiple selector patterns
      const cards = document.querySelectorAll('[data-testid="listing-card"], .listingCard, .listing-card, [class*="SearchCard"]');

      cards.forEach((card) => {
        try {
          // Get listing URL and ID
          const linkEl = card.querySelector('a[href*="/sale/"], a[href*="/building/"]') as HTMLAnchorElement;
          const url = linkEl?.href || '';
          const listingId = url.match(/\/(\d+-\w+)(?:\?|$)/)?.[1] || url.split('/').pop() || '';

          // Get address
          const addressEl = card.querySelector('[class*="address"], .listingAddress, h3, [data-testid="address"]');
          const address = addressEl?.textContent?.trim() || '';

          // Get price
          const priceEl = card.querySelector('[class*="price"], .price, [data-testid="price"]');
          const price = priceEl?.textContent?.trim() || '';

          // Get beds/baths/sqft
          const detailsEl = card.querySelector('[class*="details"], .details, [data-testid="property-details"]');
          const detailsText = detailsEl?.textContent || '';
          const bedsMatch = detailsText.match(/(\d+)\s*(?:bed|br)/i);
          const bathsMatch = detailsText.match(/(\d+(?:\.\d+)?)\s*(?:bath|ba)/i);
          const sqftMatch = detailsText.match(/([0-9,]+)\s*(?:sq\.?\s*ft|sqft|sf)/i);

          // Get days on market
          const domEl = card.querySelector('[class*="days"], [class*="time"], [data-testid="days-on-market"]');
          const domText = domEl?.textContent || detailsText;
          const domMatch = domText.match(/(\d+)\s*days?/i);

          // Get property type
          const typeEl = card.querySelector('[class*="type"], .propertyType');
          const typeText = (typeEl?.textContent || detailsText).toLowerCase();
          let propertyType = 'unknown';
          if (typeText.includes('coop') || typeText.includes('co-op')) propertyType = 'coop';
          else if (typeText.includes('condo')) propertyType = 'condo';
          else if (typeText.includes('townhouse')) propertyType = 'townhouse';
          else if (typeText.includes('multi')) propertyType = 'multi-family';
          else if (typeText.includes('house') || typeText.includes('family')) propertyType = 'house';

          // Get photo
          const imgEl = card.querySelector('img[src*="cdn"], img[src*="photo"], picture img') as HTMLImageElement;
          const photoUrl = imgEl?.src || '';

          // Get status
          const statusEl = card.querySelector('[class*="status"], .badge');
          const statusText = (statusEl?.textContent || '').toLowerCase();
          let status = 'active';
          if (statusText.includes('contract')) status = 'in_contract';

          if (address && price) {
            results.push({
              listingId,
              address,
              price,
              beds: bedsMatch?.[1] || '',
              baths: bathsMatch?.[1] || '',
              sqft: sqftMatch?.[1]?.replace(/,/g, '') || '',
              dom: domMatch?.[1] || '',
              url,
              propertyType,
              photoUrl,
              status,
            });
          }
        } catch (e) {
          // Skip problematic cards
        }
      });

      return results;
    });

    // Convert to ScrapedListing format
    for (const raw of pageListings) {
      const askingPrice = parseInt(raw.price.replace(/[^0-9]/g, ''), 10) || 0;
      const sqft = raw.sqft ? parseInt(raw.sqft, 10) : null;

      listings.push({
        listingId: raw.listingId,
        address: raw.address,
        neighborhood: 'Bedford-Stuyvesant',
        subArea: detectSubArea(raw.address),
        askingPrice,
        beds: raw.beds ? parseInt(raw.beds, 10) : null,
        baths: raw.baths ? parseFloat(raw.baths) : null,
        sqft,
        pricePerSqft: sqft && askingPrice ? Math.round(askingPrice / sqft) : null,
        daysOnMarket: raw.dom ? parseInt(raw.dom, 10) : null,
        priceHistory: [],
        priceReductions: 0,
        totalPriceReduction: 0,
        originalPrice: null,
        listingUrl: raw.url,
        propertyType: raw.propertyType as ScrapedListing['propertyType'],
        photoUrl: raw.photoUrl || null,
        openHouseDates: [],
        listingStatus: raw.status as ScrapedListing['listingStatus'],
        scrapedAt: new Date().toISOString(),
      });
    }

    await page.close();
  } finally {
    await browser.close();
  }

  return listings;
}

export async function scrapeListingDetails(listing: ScrapedListing): Promise<ScrapedListing> {
  if (!listing.listingUrl) return listing;

  const browser = await getBrowser();

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto(listing.listingUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Extract detailed info
    const details = await page.evaluate(() => {
      const result: {
        priceHistory: Array<{ date: string; price: string }>;
        openHouseDates: string[];
        dom: string;
      } = {
        priceHistory: [],
        openHouseDates: [],
        dom: '',
      };

      // Price history section
      const priceHistorySection = document.querySelector('[class*="priceHistory"], [class*="PriceHistory"], #price-history');
      if (priceHistorySection) {
        const entries = priceHistorySection.querySelectorAll('li, tr, [class*="row"]');
        entries.forEach(entry => {
          const text = entry.textContent || '';
          const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+\s+\d{1,2},?\s*\d{4})/);
          const priceMatch = text.match(/\$([0-9,]+)/);
          if (dateMatch && priceMatch) {
            result.priceHistory.push({
              date: dateMatch[1],
              price: priceMatch[1],
            });
          }
        });
      }

      // Open house dates
      const openHouseSection = document.querySelector('[class*="openHouse"], [class*="OpenHouse"], #open-houses');
      if (openHouseSection) {
        const dates = openHouseSection.querySelectorAll('[class*="date"], time');
        dates.forEach(d => {
          const text = d.textContent?.trim();
          if (text) result.openHouseDates.push(text);
        });
      }

      // Days on market
      const domEl = document.querySelector('[class*="daysOnMarket"], [class*="listed"], [data-testid="days-on-market"]');
      const domText = domEl?.textContent || document.body.textContent || '';
      const domMatch = domText.match(/(\d+)\s*days?\s*(?:on\s*)?(?:market|listed)/i);
      result.dom = domMatch?.[1] || '';

      return result;
    });

    // Update listing with details
    if (details.dom) {
      listing.daysOnMarket = parseInt(details.dom, 10);
    }

    if (details.priceHistory.length > 0) {
      let lastPrice = 0;
      listing.priceHistory = details.priceHistory.map(ph => {
        const price = parseInt(ph.price.replace(/,/g, ''), 10);
        const change = lastPrice > 0 ? price - lastPrice : 0;
        lastPrice = price;
        return { date: ph.date, price, change };
      }).reverse();

      // Calculate reductions
      listing.priceReductions = listing.priceHistory.filter(p => p.change < 0).length;
      listing.totalPriceReduction = listing.priceHistory
        .filter(p => p.change < 0)
        .reduce((sum, p) => sum + Math.abs(p.change), 0);
      listing.originalPrice = listing.priceHistory[0]?.price || null;
    }

    listing.openHouseDates = details.openHouseDates;

    await page.close();
  } catch (e) {
    console.error(`Failed to scrape details for ${listing.address}:`, e);
  } finally {
    await browser.close();
  }

  return listing;
}

export async function scrapeAllBedStuyListings(): Promise<ScrapedListing[]> {
  const allListings: ScrapedListing[] = [];
  const baseUrl = 'https://streeteasy.com/for-sale/bedford-stuyvesant';
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 20) { // Max 20 pages safety limit
    const url = page === 1 ? baseUrl : `${baseUrl}?page=${page}`;
    console.log(`Scraping page ${page}: ${url}`);

    try {
      const listings = await scrapeListingPage(url);

      if (listings.length === 0) {
        hasMore = false;
      } else {
        allListings.push(...listings);
        page++;

        // Rate limit - wait between pages
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (e) {
      console.error(`Failed to scrape page ${page}:`, e);
      hasMore = false;
    }
  }

  console.log(`Scraped ${allListings.length} total listings`);
  return allListings;
}
