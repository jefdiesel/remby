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
