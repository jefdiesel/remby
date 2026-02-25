import { NextRequest, NextResponse } from 'next/server';
import {
  getPropertyByBBL,
  getNeighborhoodComps,
  analyzeNegotiationSignal,
  calculateBuildingHealth,
} from '@/lib/property-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bbl: string }> }
) {
  const { bbl } = await params;

  if (!bbl || bbl.length !== 10) {
    return NextResponse.json(
      { error: 'Invalid BBL format. Must be 10 digits.' },
      { status: 400 }
    );
  }

  try {
    const propertyData = await getPropertyByBBL(bbl);

    // Get neighborhood comps if we have coordinates
    let comps90 = null;
    let comps180 = null;
    let comps365 = null;
    let negotiationSignal = null;

    if (propertyData.property?.latitude && propertyData.property?.longitude) {
      const lat = propertyData.property.latitude;
      const lng = propertyData.property.longitude;

      [comps90, comps180, comps365] = await Promise.all([
        getNeighborhoodComps(lat, lng, 90),
        getNeighborhoodComps(lat, lng, 180),
        getNeighborhoodComps(lat, lng, 365),
      ]);

      negotiationSignal = analyzeNegotiationSignal(
        comps180,
        propertyData.property,
        propertyData.sales[0] || null
      );
    } else if (propertyData.sales.length > 0) {
      // No coords but have sales - calculate signal from what we have
      const emptyComps: Parameters<typeof analyzeNegotiationSignal>[0] = {
        sales: [],
        medianPrice: null,
        avgPricePerSqft: null,
        salesCount: 0,
        priceChangeTrend: null,
        avgDaysOnMarket: null,
      };
      negotiationSignal = analyzeNegotiationSignal(
        emptyComps,
        propertyData.property,
        propertyData.sales[0]
      );
    }

    // Calculate building health
    const buildingHealth = calculateBuildingHealth(
      propertyData.hpdViolations,
      propertyData.dobViolations
    );

    // Days since last sale
    const lastSale = propertyData.sales[0];
    const daysSinceLastSale = lastSale
      ? Math.floor((Date.now() - new Date(lastSale.sale_date).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return NextResponse.json({
      ...propertyData,
      comps: {
        days90: comps90,
        days180: comps180,
        days365: comps365,
      },
      negotiationSignal,
      buildingHealth,
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
