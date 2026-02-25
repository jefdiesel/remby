import { NextRequest, NextResponse } from 'next/server';
import {
  batchWriteSales,
  batchWriteHPD,
  batchWriteDOB,
  writeNeighborhoodStats,
  writeSyncMetadata,
  readSyncMetadata,
  type StoredSale,
  type StoredHPDViolation,
  type StoredDOBViolation,
  type StoredDOBPermit,
  type NeighborhoodStats,
} from '@/lib/kv-storage';
import {
  fetchACRISSales,
  fetchACRISParties,
  fetchHPDViolations,
  fetchDOBViolations,
  fetchDOBPermits,
  constructBBL,
} from '@/lib/nyc-apis';
import { NEIGHBORHOODS, buildBoroughBlockFilter, buildHPDFilter, buildDOBViolationsFilter, buildDOBPermitsFilter } from '@/lib/neighborhoods';

const CRON_SECRET = process.env.CRON_SECRET;

interface SyncResult {
  source: string;
  success: boolean;
  recordsSynced: number;
  error?: string;
}

async function syncSalesForNeighborhood(
  bounds: { slug: string; name: string; north: number; south: number; east: number; west: number }
): Promise<{ result: SyncResult; salesByBBL: Map<string, StoredSale[]> }> {
  const salesByBBL = new Map<string, StoredSale[]>();

  try {
    // Fetch all deeds in Brooklyn from last year, then filter by block
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const dateStr = oneYearAgo.toISOString().split('T')[0];

    // Query ACRIS Master for Brooklyn deeds
    const sales = await fetchACRISSales({
      where: `doc_type = 'DEED' AND document_date >= '${dateStr}' AND recorded_borough = '3'`,
      limit: 2000,
      order: 'document_date DESC',
    });

    if (sales.length === 0) {
      return {
        result: { source: 'sales', success: true, recordsSynced: 0 },
        salesByBBL,
      };
    }

    // Fetch party info
    const documentIds = [...new Set(sales.map(s => s.document_id))];
    const parties = await fetchACRISParties(documentIds);

    const partyMap = new Map<string, { buyer?: string; seller?: string }>();
    for (const party of parties) {
      if (!partyMap.has(party.document_id)) {
        partyMap.set(party.document_id, {});
      }
      const entry = partyMap.get(party.document_id)!;
      if (party.party_type === '1') entry.seller = party.name;
      else if (party.party_type === '2') entry.buyer = party.name;
    }

    // Filter by block range and group by BBL
    const blockRange = buildBoroughBlockFilter(bounds).blockRange;
    for (const sale of sales) {
      if (!sale.block || !sale.lot || !sale.document_amt) continue;

      // Filter by block range if specified
      if (blockRange) {
        const blockNum = parseInt(sale.block, 10);
        if (blockNum < blockRange[0] || blockNum > blockRange[1]) continue;
      }

      const price = parseFloat(sale.document_amt);
      if (price <= 0) continue;

      const bbl = constructBBL(sale.borough || sale.recorded_borough, sale.block, sale.lot);
      const partyInfo = partyMap.get(sale.document_id) || {};

      const storedSale: StoredSale = {
        sale_price: price,
        sale_date: sale.document_date.split('T')[0],
        buyer_name: partyInfo.buyer || null,
        seller_name: partyInfo.seller || null,
        document_id: sale.document_id,
      };

      if (!salesByBBL.has(bbl)) {
        salesByBBL.set(bbl, []);
      }
      salesByBBL.get(bbl)!.push(storedSale);
    }

    // Batch write to KV storage
    const synced = await batchWriteSales(salesByBBL);

    return {
      result: { source: 'sales', success: true, recordsSynced: synced },
      salesByBBL,
    };
  } catch (error) {
    return {
      result: {
        source: 'sales',
        success: false,
        recordsSynced: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      salesByBBL,
    };
  }
}

async function syncHPDForNeighborhood(
  bounds: { slug: string; name: string; north: number; south: number; east: number; west: number }
): Promise<{ result: SyncResult; violationsByBBL: Map<string, StoredHPDViolation[]> }> {
  const violationsByBBL = new Map<string, StoredHPDViolation[]>();

  try {
    const whereClause = `violationstatus = 'Open' AND ${buildHPDFilter(bounds)}`;

    const violations = await fetchHPDViolations({
      where: whereClause,
      limit: 10000,
      order: 'inspectiondate DESC',
    });

    // Group by BBL
    for (const v of violations) {
      if (!v.bbl) continue;

      const stored: StoredHPDViolation = {
        violation_id: v.violationid,
        class: v.class || 'Unknown',
        description: v.novdescription,
        status: v.violationstatus || 'Open',
        open_date: v.inspectiondate?.split('T')[0] || null,
        close_date: v.certifieddate?.split('T')[0] || null,
        apartment: v.apartment,
        story: v.story,
      };

      if (!violationsByBBL.has(v.bbl)) {
        violationsByBBL.set(v.bbl, []);
      }
      violationsByBBL.get(v.bbl)!.push(stored);
    }

    // Batch write to KV storage
    const synced = await batchWriteHPD(violationsByBBL);

    return {
      result: { source: 'hpd', success: true, recordsSynced: synced },
      violationsByBBL,
    };
  } catch (error) {
    return {
      result: {
        source: 'hpd',
        success: false,
        recordsSynced: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      violationsByBBL,
    };
  }
}

async function syncDOBForNeighborhood(
  bounds: { slug: string; name: string; north: number; south: number; east: number; west: number }
): Promise<SyncResult> {
  try {
    // Fetch violations
    const violationsWhere = `disposition_date IS NULL AND ${buildDOBViolationsFilter(bounds)}`;
    const violations = await fetchDOBViolations({
      where: violationsWhere,
      limit: 5000,
      order: 'issue_date DESC',
    });

    // Fetch permits
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90);
    const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

    const permitsWhere = `filing_date >= '${dateStr}' AND ${buildDOBPermitsFilter(bounds)}`;
    const permits = await fetchDOBPermits({
      where: permitsWhere,
      limit: 5000,
      order: 'filing_date DESC',
    });

    // Group by BBL
    const dataByBBL = new Map<string, { violations: StoredDOBViolation[]; permits: StoredDOBPermit[] }>();

    for (const v of violations) {
      if (!v.boro || !v.block || !v.lot) continue;
      const bbl = constructBBL(v.boro, v.block, v.lot);

      if (!dataByBBL.has(bbl)) {
        dataByBBL.set(bbl, { violations: [], permits: [] });
      }

      dataByBBL.get(bbl)!.violations.push({
        violation_id: v.isn_dob_bis_viol || v.ecb_number || `${bbl}-${v.issue_date}`,
        description: v.description,
        status: v.disposition_date ? 'Closed' : 'Open',
        issue_date: v.issue_date?.split('T')[0] || null,
        disposition_date: v.disposition_date?.split('T')[0] || null,
        violation_type: v.violation_type,
      });
    }

    for (const p of permits) {
      if (!p.bbl) continue;

      if (!dataByBBL.has(p.bbl)) {
        dataByBBL.set(p.bbl, { violations: [], permits: [] });
      }

      dataByBBL.get(p.bbl)!.permits.push({
        permit_number: `${p.job__}-${p.doc__}`,
        permit_type: p.permit_type,
        description: p.work_type,
        status: p.permit_status || p.job_status || 'Unknown',
        filing_date: p.filing_date?.split('T')[0] || null,
        expiration_date: p.expiration_date?.split('T')[0] || null,
        job_type: p.job_type,
      });
    }

    // Batch write to KV storage
    const synced = await batchWriteDOB(dataByBBL);

    return { source: 'dob', success: true, recordsSynced: synced };
  } catch (error) {
    return {
      source: 'dob',
      success: false,
      recordsSynced: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function syncPropertiesForNeighborhood(
  _bounds: { slug: string; name: string; north: number; south: number; east: number; west: number }
): Promise<SyncResult> {
  // Property data comes from ACRIS Legals and other sources during sales sync
  // Skipping dedicated property sync until we find the right endpoint
  return { source: 'properties', success: true, recordsSynced: 0 };
}

function calculateNeighborhoodStats(
  slug: string,
  name: string,
  salesByBBL: Map<string, StoredSale[]>,
  violationsByBBL: Map<string, StoredHPDViolation[]>
): NeighborhoodStats {
  const now = new Date();
  const cutoff90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const cutoff180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const cutoff365 = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  // Flatten all sales
  const allSales: StoredSale[] = [];
  for (const sales of salesByBBL.values()) {
    allSales.push(...sales);
  }

  // Filter by period
  const sales90 = allSales.filter(s => new Date(s.sale_date) >= cutoff90);
  const sales180 = allSales.filter(s => new Date(s.sale_date) >= cutoff180);
  const sales365 = allSales.filter(s => new Date(s.sale_date) >= cutoff365);

  const calcStats = (sales: StoredSale[]) => {
    if (sales.length === 0) {
      return { count: 0, medianPrice: null, avgPricePerSqft: null };
    }
    const prices = sales.map(s => s.sale_price).sort((a, b) => a - b);
    const medianPrice = prices[Math.floor(prices.length / 2)];
    return { count: sales.length, medianPrice, avgPricePerSqft: null };
  };

  // Violation stats
  const totalBuildings = violationsByBBL.size;
  const buildingsWithViolations = Array.from(violationsByBBL.values()).filter(v => v.length > 0).length;

  // Price trend: compare first half vs second half of 180-day sales
  let priceTrend: 'up' | 'down' | 'stable' | null = null;
  if (sales180.length >= 6) {
    const midpoint = new Date(cutoff180.getTime() + (now.getTime() - cutoff180.getTime()) / 2);
    const recent = sales180.filter(s => new Date(s.sale_date) >= midpoint);
    const older = sales180.filter(s => new Date(s.sale_date) < midpoint);

    if (recent.length >= 2 && older.length >= 2) {
      const recentAvg = recent.reduce((a, b) => a + b.sale_price, 0) / recent.length;
      const olderAvg = older.reduce((a, b) => a + b.sale_price, 0) / older.length;
      const change = (recentAvg - olderAvg) / olderAvg;
      if (change > 0.05) priceTrend = 'up';
      else if (change < -0.05) priceTrend = 'down';
      else priceTrend = 'stable';
    }
  }

  // Negotiation signal
  let signal: 'HOT' | 'NORMAL' | 'SOFT' = 'NORMAL';
  const stats180 = calcStats(sales180);
  if (stats180.count >= 20 && priceTrend === 'up') signal = 'HOT';
  else if (stats180.count < 5 || priceTrend === 'down') signal = 'SOFT';

  return {
    slug,
    name,
    lastUpdated: new Date().toISOString(),
    sales: {
      days90: calcStats(sales90),
      days180: calcStats(sales180),
      days365: calcStats(sales365),
    },
    violations: {
      totalBuildings,
      buildingsWithViolations,
      violationRate: totalBuildings > 0 ? buildingsWithViolations / totalBuildings : 0,
      mostCommonTypes: [], // Could add if needed
    },
    negotiationSignal: signal,
    priceTrend,
  };
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: SyncResult[] = [];
  const timestamp = new Date().toISOString();

  // Sync each neighborhood
  for (const neighborhood of NEIGHBORHOODS) {
    console.log(`Syncing ${neighborhood.name}...`);

    // Run syncs in parallel
    const [salesResult, hpdResult, dobResult, propertiesResult] = await Promise.all([
      syncSalesForNeighborhood(neighborhood),
      syncHPDForNeighborhood(neighborhood),
      syncDOBForNeighborhood(neighborhood),
      syncPropertiesForNeighborhood(neighborhood),
    ]);

    results.push(salesResult.result);
    results.push(hpdResult.result);
    results.push(dobResult);
    results.push(propertiesResult);

    // Calculate and store neighborhood stats
    try {
      const stats = calculateNeighborhoodStats(
        neighborhood.slug,
        neighborhood.name,
        salesResult.salesByBBL,
        hpdResult.violationsByBBL
      );
      await writeNeighborhoodStats(neighborhood.slug, stats);
      results.push({ source: `neighborhood:${neighborhood.slug}`, success: true, recordsSynced: 1 });
    } catch (error) {
      results.push({
        source: `neighborhood:${neighborhood.slug}`,
        success: false,
        recordsSynced: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Update sync metadata
  const existingMeta = await readSyncMetadata();
  await writeSyncMetadata({
    sales: timestamp,
    hpd: timestamp,
    dob: timestamp,
    properties: timestamp,
    neighborhoods: timestamp,
  });

  return NextResponse.json({
    timestamp,
    previousSync: existingMeta,
    results,
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
