import {
  readSales,
  readProperty,
  readHPDViolations,
  readDOBData,
  readNeighborhoodStats,
  readSyncMetadata,
  writeSales,
  writeHPDViolations,
  writeDOBData,
  type StoredSale,
  type StoredProperty,
  type StoredHPDViolation,
  type StoredDOBViolation,
  type StoredDOBPermit,
  type SyncMetadata,
  type NeighborhoodStats,
} from './kv-storage';
import {
  fetchACRISSales,
  fetchACRISParties,
  fetchHPDViolations as fetchHPDViolationsAPI,
  fetchDOBViolations as fetchDOBViolationsAPI,
  fetchDOBPermits as fetchDOBPermitsAPI,
  constructBBL,
} from './nyc-apis';
import { getNeighborhoodForCoords } from './neighborhoods';

export interface PropertyData {
  property: StoredProperty | null;
  sales: StoredSale[];
  hpdViolations: StoredHPDViolation[];
  dobViolations: StoredDOBViolation[];
  dobPermits: StoredDOBPermit[];
  syncStatus: SyncMetadata | null;
  fromCache: boolean;
}

// Fetch property data from Blob storage, with live API fallback
export async function getPropertyByBBL(bbl: string): Promise<PropertyData> {
  // Try to read from blob storage first
  const [property, sales, hpdViolations, dobData, syncStatus] = await Promise.all([
    readProperty(bbl),
    readSales(bbl),
    readHPDViolations(bbl),
    readDOBData(bbl),
    readSyncMetadata(),
  ]);

  const hasData = property || sales || hpdViolations || dobData;

  if (hasData) {
    return {
      property,
      sales: sales || [],
      hpdViolations: hpdViolations || [],
      dobViolations: dobData?.violations || [],
      dobPermits: dobData?.permits || [],
      syncStatus,
      fromCache: true,
    };
  }

  // Fallback: fetch live from APIs and cache
  return fetchAndCachePropertyData(bbl);
}

// Fetch live data from NYC APIs and cache to Blob
async function fetchAndCachePropertyData(bbl: string): Promise<PropertyData> {
  const borough = bbl[0];
  const block = bbl.slice(1, 6);
  const lot = bbl.slice(6);

  const [salesData, hpdData, dobViolationsData, dobPermitsData] = await Promise.allSettled([
    fetchLiveSales(bbl),
    fetchLiveHPDViolations(bbl),
    fetchLiveDOBViolations(borough, block, lot),
    fetchLiveDOBPermits(bbl),
  ]);

  const sales = salesData.status === 'fulfilled' ? salesData.value : [];
  const hpdViolations = hpdData.status === 'fulfilled' ? hpdData.value : [];
  const dobViolations = dobViolationsData.status === 'fulfilled' ? dobViolationsData.value : [];
  const dobPermits = dobPermitsData.status === 'fulfilled' ? dobPermitsData.value : [];

  // Cache results (fire and forget)
  if (sales.length > 0) {
    writeSales(bbl, sales).catch(console.error);
  }
  if (hpdViolations.length > 0) {
    writeHPDViolations(bbl, hpdViolations).catch(console.error);
  }
  if (dobViolations.length > 0 || dobPermits.length > 0) {
    writeDOBData(bbl, { violations: dobViolations, permits: dobPermits }).catch(console.error);
  }

  return {
    property: null, // Property info requires separate API call
    sales,
    hpdViolations,
    dobViolations,
    dobPermits,
    syncStatus: await readSyncMetadata(),
    fromCache: false,
  };
}

async function fetchLiveSales(bbl: string): Promise<StoredSale[]> {
  const sales = await fetchACRISSales({
    where: `bbl = '${bbl}'`,
    limit: 50,
    order: 'document_date DESC',
  });

  if (sales.length === 0) return [];

  // Fetch party info
  const documentIds = sales.map(s => s.document_id);
  const parties = await fetchACRISParties(documentIds);

  const partyMap = new Map<string, { buyer?: string; seller?: string }>();
  for (const party of parties) {
    if (!partyMap.has(party.document_id)) {
      partyMap.set(party.document_id, {});
    }
    const entry = partyMap.get(party.document_id)!;
    if (party.party_type === '1') {
      entry.seller = party.name;
    } else if (party.party_type === '2') {
      entry.buyer = party.name;
    }
  }

  return sales
    .filter(s => s.document_amt && parseFloat(s.document_amt) > 0)
    .map(s => {
      const partyInfo = partyMap.get(s.document_id) || {};
      return {
        sale_price: parseFloat(s.document_amt),
        sale_date: s.document_date.split('T')[0],
        buyer_name: partyInfo.buyer || null,
        seller_name: partyInfo.seller || null,
        document_id: s.document_id,
      };
    });
}

async function fetchLiveHPDViolations(bbl: string): Promise<StoredHPDViolation[]> {
  const violations = await fetchHPDViolationsAPI({
    where: `bbl = '${bbl}'`,
    limit: 100,
    order: 'inspectiondate DESC',
  });

  return violations.map(v => ({
    violation_id: v.violationid,
    class: v.class || 'Unknown',
    description: v.novdescription,
    status: v.violationstatus || 'Open',
    open_date: v.inspectiondate?.split('T')[0] || null,
    close_date: v.certifieddate?.split('T')[0] || null,
    apartment: v.apartment,
    story: v.story,
  }));
}

async function fetchLiveDOBViolations(
  borough: string,
  block: string,
  lot: string
): Promise<StoredDOBViolation[]> {
  const violations = await fetchDOBViolationsAPI({
    where: `boro = '${borough}' AND block = '${block}' AND lot = '${lot}'`,
    limit: 100,
    order: 'issue_date DESC',
  });

  return violations.map(v => ({
    violation_id: v.isn_dob_bis_viol || v.ecb_number || `${borough}${block}${lot}-${v.issue_date}`,
    description: v.description,
    status: v.disposition_date ? 'Closed' : 'Open',
    issue_date: v.issue_date?.split('T')[0] || null,
    disposition_date: v.disposition_date?.split('T')[0] || null,
    violation_type: v.violation_type,
  }));
}

async function fetchLiveDOBPermits(bbl: string): Promise<StoredDOBPermit[]> {
  const permits = await fetchDOBPermitsAPI({
    where: `bbl = '${bbl}'`,
    limit: 50,
    order: 'filing_date DESC',
  });

  return permits.map(p => ({
    permit_number: `${p.job__}-${p.doc__}`,
    permit_type: p.permit_type,
    description: p.work_type,
    status: p.permit_status || p.job_status || 'Unknown',
    filing_date: p.filing_date?.split('T')[0] || null,
    expiration_date: p.expiration_date?.split('T')[0] || null,
    job_type: p.job_type,
  }));
}

// Neighborhood comps
export interface NeighborhoodComps {
  sales: Array<StoredSale & { address?: string; distance_miles?: number }>;
  medianPrice: number | null;
  avgPricePerSqft: number | null;
  salesCount: number;
  priceChangeTrend: 'up' | 'down' | 'stable' | null;
  avgDaysOnMarket: number | null;
}

export async function getNeighborhoodComps(
  latitude: number,
  longitude: number,
  daysBack: number = 365
): Promise<NeighborhoodComps> {
  const neighborhood = getNeighborhoodForCoords(latitude, longitude);

  if (!neighborhood) {
    return {
      sales: [],
      medianPrice: null,
      avgPricePerSqft: null,
      salesCount: 0,
      priceChangeTrend: null,
      avgDaysOnMarket: null,
    };
  }

  const stats = await readNeighborhoodStats(neighborhood.slug);

  if (!stats) {
    return {
      sales: [],
      medianPrice: null,
      avgPricePerSqft: null,
      salesCount: 0,
      priceChangeTrend: null,
      avgDaysOnMarket: null,
    };
  }

  const periodKey = daysBack <= 90 ? 'days90' : daysBack <= 180 ? 'days180' : 'days365';
  const periodStats = stats.sales[periodKey];

  return {
    sales: [], // Individual sales not stored in neighborhood aggregate
    medianPrice: periodStats.medianPrice,
    avgPricePerSqft: periodStats.avgPricePerSqft,
    salesCount: periodStats.count,
    priceChangeTrend: stats.priceTrend,
    avgDaysOnMarket: null,
  };
}

// Negotiation analysis
export type NegotiationSignal = 'HOT' | 'NORMAL' | 'SOFT';

export interface NegotiationAnalysis {
  signal: NegotiationSignal;
  reasons: string[];
  confidence: 'high' | 'medium' | 'low';
}

export function analyzeNegotiationSignal(
  comps: NeighborhoodComps,
  property: StoredProperty | null,
  lastSale: StoredSale | null
): NegotiationAnalysis {
  const reasons: string[] = [];
  let score = 0;

  // Sales velocity
  if (comps.salesCount >= 20) {
    score += 2;
    reasons.push(`High transaction volume (${comps.salesCount} sales in area)`);
  } else if (comps.salesCount >= 10) {
    score += 1;
    reasons.push(`Moderate transaction volume (${comps.salesCount} sales in area)`);
  } else if (comps.salesCount < 5) {
    score -= 2;
    reasons.push(`Low transaction volume (${comps.salesCount} sales in area)`);
  }

  // Price trend
  if (comps.priceChangeTrend === 'up') {
    score += 2;
    reasons.push('Prices trending upward');
  } else if (comps.priceChangeTrend === 'down') {
    score -= 2;
    reasons.push('Prices trending downward');
  } else if (comps.priceChangeTrend === 'stable') {
    reasons.push('Prices stable');
  }

  // Days since last sale
  if (lastSale) {
    const daysSinceLastSale = Math.floor(
      (Date.now() - new Date(lastSale.sale_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceLastSale < 365) {
      score += 1;
      reasons.push(`Recently sold ${daysSinceLastSale} days ago`);
    } else if (daysSinceLastSale > 365 * 5) {
      reasons.push(`Last sold ${Math.floor(daysSinceLastSale / 365)} years ago`);
    }
  }

  let signal: NegotiationSignal;
  if (score >= 3) signal = 'HOT';
  else if (score <= -2) signal = 'SOFT';
  else signal = 'NORMAL';

  let confidence: 'high' | 'medium' | 'low';
  if (comps.salesCount >= 15 && comps.priceChangeTrend !== null) {
    confidence = 'high';
  } else if (comps.salesCount >= 8) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { signal, reasons, confidence };
}

// Building health score
export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface BuildingHealthScore {
  grade: HealthGrade;
  score: number;
  explanation: string;
  breakdown: {
    hpdClassA: number;
    hpdClassB: number;
    hpdClassC: number;
    dobOpen: number;
    totalViolations: number;
  };
}

export function calculateBuildingHealth(
  hpdViolations: StoredHPDViolation[],
  dobViolations: StoredDOBViolation[]
): BuildingHealthScore {
  const openHPD = hpdViolations.filter(
    v => v.status.toLowerCase().includes('open') || !v.close_date
  );
  const openDOB = dobViolations.filter(
    v => v.status.toLowerCase().includes('open') || !v.disposition_date
  );

  const hpdClassA = openHPD.filter(v => v.class === 'A').length;
  const hpdClassB = openHPD.filter(v => v.class === 'B').length;
  const hpdClassC = openHPD.filter(v => v.class === 'C').length;
  const dobOpen = openDOB.length;

  let score = 100;
  score -= hpdClassC * 15;
  score -= hpdClassB * 8;
  score -= hpdClassA * 3;
  score -= dobOpen * 5;
  score = Math.max(0, score);

  let grade: HealthGrade;
  if (score >= 90) grade = 'A';
  else if (score >= 75) grade = 'B';
  else if (score >= 60) grade = 'C';
  else if (score >= 40) grade = 'D';
  else grade = 'F';

  const parts: string[] = [];
  const totalViolations = hpdClassA + hpdClassB + hpdClassC + dobOpen;

  if (totalViolations === 0) {
    parts.push('No open violations');
  } else {
    if (hpdClassC > 0) parts.push(`${hpdClassC} immediately hazardous (Class C) HPD violation${hpdClassC > 1 ? 's' : ''}`);
    if (hpdClassB > 0) parts.push(`${hpdClassB} hazardous (Class B) HPD violation${hpdClassB > 1 ? 's' : ''}`);
    if (hpdClassA > 0) parts.push(`${hpdClassA} non-hazardous (Class A) HPD violation${hpdClassA > 1 ? 's' : ''}`);
    if (dobOpen > 0) parts.push(`${dobOpen} open DOB violation${dobOpen > 1 ? 's' : ''}`);
  }

  return {
    grade,
    score,
    explanation: parts.join('. ') + '.',
    breakdown: { hpdClassA, hpdClassB, hpdClassC, dobOpen, totalViolations },
  };
}
