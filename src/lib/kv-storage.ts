import { Redis } from '@upstash/redis';

// Initialize Redis client
const redis = new Redis({
  url: process.env.KV_REST_API_URL || '',
  token: process.env.KV_REST_API_TOKEN || '',
});

// Key prefixes
const KEYS = {
  sales: (bbl: string) => `sales:${bbl}`,
  hpd: (bbl: string) => `hpd:${bbl}`,
  dob: (bbl: string) => `dob:${bbl}`,
  property: (bbl: string) => `property:${bbl}`,
  neighborhood: (slug: string) => `neighborhood:${slug}`,
  listing: (neighborhood: string, listingId: string) => `listings:${neighborhood}:${listingId}`,
  listingIndex: (neighborhood: string) => `listings:${neighborhood}:index`,
  listingScrapeLog: (neighborhood: string) => `listings:${neighborhood}:scrape_log`,
  meta: 'meta:last_synced',
};

// Types for stored data
export interface StoredSale {
  sale_price: number;
  sale_date: string;
  buyer_name: string | null;
  seller_name: string | null;
  document_id: string;
}

export interface StoredProperty {
  bbl: string;
  address: string;
  borough: string;
  block: string;
  lot: string;
  zip_code: string | null;
  tax_class: string | null;
  building_class: string | null;
  assessed_value: number | null;
  exempt_value: number | null;
  latitude: number | null;
  longitude: number | null;
  year_built: number | null;
  sqft: number | null;
}

export interface StoredHPDViolation {
  violation_id: string;
  class: string;
  description: string | null;
  status: string;
  open_date: string | null;
  close_date: string | null;
  apartment: string | null;
  story: string | null;
}

export interface StoredDOBViolation {
  violation_id: string;
  description: string | null;
  status: string;
  issue_date: string | null;
  disposition_date: string | null;
  violation_type: string | null;
}

export interface StoredDOBPermit {
  permit_number: string;
  permit_type: string | null;
  description: string | null;
  status: string;
  filing_date: string | null;
  expiration_date: string | null;
  job_type: string | null;
}

export interface StoredDOBData {
  violations: StoredDOBViolation[];
  permits: StoredDOBPermit[];
}

export interface NeighborhoodStats {
  slug: string;
  name: string;
  lastUpdated: string;
  sales: {
    days90: { count: number; medianPrice: number | null; avgPricePerSqft: number | null };
    days180: { count: number; medianPrice: number | null; avgPricePerSqft: number | null };
    days365: { count: number; medianPrice: number | null; avgPricePerSqft: number | null };
  };
  violations: {
    totalBuildings: number;
    buildingsWithViolations: number;
    violationRate: number;
    mostCommonTypes: { type: string; count: number }[];
  };
  negotiationSignal: 'HOT' | 'NORMAL' | 'SOFT';
  priceTrend: 'up' | 'down' | 'stable' | null;
}

export interface SyncMetadata {
  sales: string | null;
  hpd: string | null;
  dob: string | null;
  properties: string | null;
  neighborhoods: string | null;
}

// Analyzed listing with full buyer intelligence
export interface AnalyzedListing {
  // Core listing data
  listingId: string;
  address: string;
  neighborhood: string;
  subArea: string | null;
  bbl: string | null;

  // Pricing
  askingPrice: number;
  originalPrice: number | null;
  pricePerSqft: number | null;
  priceReductions: number;
  totalPriceReduction: number;
  priceHistory: Array<{ date: string; price: number; change: number }>;

  // Property details
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  propertyType: 'coop' | 'condo' | 'townhouse' | 'multi-family' | 'house' | 'unknown';
  yearBuilt: number | null;

  // Market status
  daysOnMarket: number | null;
  listingStatus: 'active' | 'in_contract' | 'unknown';
  openHouseDates: string[];

  // Buyer intelligence
  negotiationSignal: 'strong_buyer' | 'slight_buyer' | 'neutral' | 'slight_seller' | 'strong_seller';
  negotiationSummary: string;
  negotiationFactors: string[];
  suggestedOfferRange: { low: number; high: number } | null;

  // Comp analysis
  compDeltaPercent: number | null;
  isAboveMarket: boolean | null;
  compSummary: string | null;

  // Tax abatement
  hasTaxAbatement: boolean;
  taxAbatementType: string | null;
  taxAbatementExpiration: number | null;
  taxAbatementWarning: string | null;

  // Building health
  buildingHealthScore: number;
  buildingHealthGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  openViolations: number;

  // Sales history
  lastSalePrice: number | null;
  lastSaleDate: string | null;
  priceAppreciation: number | null;

  // URLs and images
  listingUrl: string;
  photoUrl: string | null;

  // Metadata
  scrapedAt: string;
  analyzedAt: string;
}

export interface ListingIndexEntry {
  listingId: string;
  askingPrice: number;
  beds: number | null;
  propertyType: string;
  negotiationSignal: string;
  daysOnMarket: number | null;
  hasTaxAbatement: boolean;
  openViolations: number;
  listingStatus: string;
  updatedAt: string;
}

export interface ListingScrapeLog {
  lastScrape: string;
  totalListings: number;
  newListings: number;
  updatedListings: number;
  removedListings: number;
  errors: string[];
}

// Read functions
export async function readSales(bbl: string): Promise<StoredSale[] | null> {
  try {
    return await redis.get<StoredSale[]>(KEYS.sales(bbl));
  } catch {
    return null;
  }
}

export async function readProperty(bbl: string): Promise<StoredProperty | null> {
  try {
    return await redis.get<StoredProperty>(KEYS.property(bbl));
  } catch {
    return null;
  }
}

export async function readHPDViolations(bbl: string): Promise<StoredHPDViolation[] | null> {
  try {
    return await redis.get<StoredHPDViolation[]>(KEYS.hpd(bbl));
  } catch {
    return null;
  }
}

export async function readDOBData(bbl: string): Promise<StoredDOBData | null> {
  try {
    return await redis.get<StoredDOBData>(KEYS.dob(bbl));
  } catch {
    return null;
  }
}

export async function readNeighborhoodStats(slug: string): Promise<NeighborhoodStats | null> {
  try {
    return await redis.get<NeighborhoodStats>(KEYS.neighborhood(slug));
  } catch {
    return null;
  }
}

export async function readSyncMetadata(): Promise<SyncMetadata | null> {
  try {
    return await redis.get<SyncMetadata>(KEYS.meta);
  } catch {
    return null;
  }
}

// Write functions
export async function writeSales(bbl: string, sales: StoredSale[]): Promise<void> {
  await redis.set(KEYS.sales(bbl), sales);
}

export async function writeProperty(bbl: string, property: StoredProperty): Promise<void> {
  await redis.set(KEYS.property(bbl), property);
}

export async function writeHPDViolations(bbl: string, violations: StoredHPDViolation[]): Promise<void> {
  await redis.set(KEYS.hpd(bbl), violations);
}

export async function writeDOBData(bbl: string, data: StoredDOBData): Promise<void> {
  await redis.set(KEYS.dob(bbl), data);
}

export async function writeNeighborhoodStats(slug: string, stats: NeighborhoodStats): Promise<void> {
  await redis.set(KEYS.neighborhood(slug), stats);
}

export async function writeSyncMetadata(metadata: SyncMetadata): Promise<void> {
  await redis.set(KEYS.meta, metadata);
}

// Batch write using pipeline for efficiency
export async function batchWriteSales(salesByBBL: Map<string, StoredSale[]>): Promise<number> {
  const pipeline = redis.pipeline();
  let count = 0;

  for (const [bbl, sales] of salesByBBL) {
    pipeline.set(KEYS.sales(bbl), sales);
    count++;
  }

  await pipeline.exec();
  return count;
}

export async function batchWriteHPD(violationsByBBL: Map<string, StoredHPDViolation[]>): Promise<number> {
  const pipeline = redis.pipeline();
  let count = 0;

  for (const [bbl, violations] of violationsByBBL) {
    pipeline.set(KEYS.hpd(bbl), violations);
    count++;
  }

  await pipeline.exec();
  return count;
}

export async function batchWriteDOB(dataByBBL: Map<string, StoredDOBData>): Promise<number> {
  const pipeline = redis.pipeline();
  let count = 0;

  for (const [bbl, data] of dataByBBL) {
    pipeline.set(KEYS.dob(bbl), data);
    count++;
  }

  await pipeline.exec();
  return count;
}

export async function batchWriteProperties(propertiesByBBL: Map<string, StoredProperty>): Promise<number> {
  const pipeline = redis.pipeline();
  let count = 0;

  for (const [bbl, property] of propertiesByBBL) {
    pipeline.set(KEYS.property(bbl), property);
    count++;
  }

  await pipeline.exec();
  return count;
}

// Listing functions
export async function writeListing(neighborhood: string, listing: AnalyzedListing): Promise<void> {
  await redis.set(KEYS.listing(neighborhood, listing.listingId), listing);
}

export async function readListing(neighborhood: string, listingId: string): Promise<AnalyzedListing | null> {
  try {
    return await redis.get<AnalyzedListing>(KEYS.listing(neighborhood, listingId));
  } catch {
    return null;
  }
}

export async function batchWriteListings(neighborhood: string, listings: AnalyzedListing[]): Promise<number> {
  if (listings.length === 0) return 0;

  const pipeline = redis.pipeline();

  for (const listing of listings) {
    pipeline.set(KEYS.listing(neighborhood, listing.listingId), listing);
  }

  await pipeline.exec();
  return listings.length;
}

export async function writeListingIndex(neighborhood: string, entries: ListingIndexEntry[]): Promise<void> {
  await redis.set(KEYS.listingIndex(neighborhood), entries);
}

export async function readListingIndex(neighborhood: string): Promise<ListingIndexEntry[] | null> {
  try {
    return await redis.get<ListingIndexEntry[]>(KEYS.listingIndex(neighborhood));
  } catch {
    return null;
  }
}

export async function writeListingScrapeLog(neighborhood: string, log: ListingScrapeLog): Promise<void> {
  await redis.set(KEYS.listingScrapeLog(neighborhood), log);
}

export async function readListingScrapeLog(neighborhood: string): Promise<ListingScrapeLog | null> {
  try {
    return await redis.get<ListingScrapeLog>(KEYS.listingScrapeLog(neighborhood));
  } catch {
    return null;
  }
}

// Get all listing IDs for a neighborhood from index
export async function getListingIds(neighborhood: string): Promise<string[]> {
  const index = await readListingIndex(neighborhood);
  if (!index) return [];
  return index.map(e => e.listingId);
}

// Delete a listing
export async function deleteListing(neighborhood: string, listingId: string): Promise<void> {
  await redis.del(KEYS.listing(neighborhood, listingId));
}

// Batch delete listings
export async function batchDeleteListings(neighborhood: string, listingIds: string[]): Promise<number> {
  if (listingIds.length === 0) return 0;

  const pipeline = redis.pipeline();
  for (const id of listingIds) {
    pipeline.del(KEYS.listing(neighborhood, id));
  }

  await pipeline.exec();
  return listingIds.length;
}
